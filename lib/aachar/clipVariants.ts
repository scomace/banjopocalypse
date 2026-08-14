// AA character pipeline — the variant grammar (Phase 6A).
//
// Re-authoring 38 clips by typing numbers and squinting is slow, and the thing
// that actually decides whether a clip reads is a handful of relationships, not
// the individual values. So the workflow is: author ONE beat sheet, then
// generate a grid of variations that all stay inside the grammar, and pick by
// eye.
//
// The four knobs are the four things measurement showed the engine's clips
// actually vary (see docs/aachar-plan.md § Phase 6):
//
//   amplitude   how far it swings. `idle` lives under 6°, `move` ≈ 50°,
//               `run` ≈ 130°, attacks 190–305°. Scaling deltas moves a clip
//               along that axis without changing its shape.
//   posture     the clip-wide lean. `run` differs from `move` mainly by a
//               constant body lean with a head counter-rotation.
//   beats       WHERE the poses fall. Interpolation is linear and tangents are
//               discarded, so beat-length ratios are the ONLY source of timing
//               feel this engine has. `attack_melee` is 10:5:10 — the strike
//               beat is twice as fast as its neighbours, and that is the whole
//               effect.
//   asymmetry   left and right are deliberately NOT mirrored in the source
//               clips. A perfectly symmetric gait reads as a machine.
//
// Everything a variant does preserves the hard constraints: integer frames,
// unchanged duration, unchanged endpoints, and loop closure.

import {
  AA_CHANNELS,
  type AaBeat,
  type AaChannel,
  type AaClip,
  type AaPose,
  CHANNEL_MIRROR,
  addPoses,
  channelAt,
  mirrorPose,
  scalePose,
} from "./clip";

export type AaVariantSpec = {
  /** Multiplies every beat DELTA. 1 = as authored. Leaves the rest posture
   *  alone, so scaling a lean-forward run to 0 gives a static lean, not a
   *  standing pose. */
  amplitude?: number;
  /** Added to the clip's rest posture — the clip-wide lean/bias. */
  posture?: AaPose;
  /** Scales each L/R pair's deviation from perfect symmetry. 1 = as authored,
   *  0 = mirror-symmetric, >1 = exaggerated. Only the paired limb channels are
   *  touched; a torso lean is not an asymmetry. */
  asymmetry?: number;
  /** −1…+1. Front-loads (<0) or back-loads (>0) the interior beats, holding
   *  the endpoints. Positive means the early beats last longer and the finish
   *  is snappier. */
  beatBias?: number;
};

const clonePose = (p: AaPose | undefined): AaPose =>
  p ? (JSON.parse(JSON.stringify(p)) as AaPose) : {};

// Only channels that pair with a DIFFERENT channel take part.
const PAIRED = (Object.entries(CHANNEL_MIRROR) as [AaChannel, AaChannel][]).filter(
  ([a, b]) => a !== b,
);

function applyAsymmetry(pose: AaPose, k: number): AaPose {
  if (k === 1) return clonePose(pose);
  const out = clonePose(pose);
  const m = mirrorPose(pose);
  for (const [ch] of PAIRED) {
    if (!pose[ch] && !m[ch]) continue;
    const v = channelAt(pose, ch);
    const mv = channelAt(m, ch);
    out[ch] = {
      rot: (v.rot + mv.rot) / 2 + k * ((v.rot - mv.rot) / 2),
      x: (v.x + mv.x) / 2 + k * ((v.x - mv.x) / 2),
      y: (v.y + mv.y) / 2 + k * ((v.y - mv.y) / 2),
    };
  }
  return out;
}

/**
 * Re-time the interior beats along a power curve, then repair the result back
 * onto the integer grid.
 *
 * CONTACT beats are anchors and never move — they are the frames scene
 * timing depends on (prop hand-offs, `throw`'s release). Retiming happens
 * piecewise WITHIN each anchor-to-anchor segment, so a beat-bias variant of
 * `throw` reshapes the wind-up and the follow-through but releases at exactly
 * the same frame. (The first version moved contacts freely, which is why
 * every timing variant of a hand-off clip was broken by construction.)
 *
 * The repair matters more than the curve: rounding can collide two beats onto
 * one frame, which would delete a pose. Colliding beats are pushed apart, and
 * if there is genuinely no room the original timing is kept — a variant that
 * silently drops a pose is worse than one that declines to retime.
 */
export function retimeBeats(beats: AaBeat[], frames: number, bias: number): AaBeat[] {
  const clone = () => beats.map((b) => ({ ...b, pose: clonePose(b.pose) }));
  if (bias === 0 || beats.length < 3) return clone();
  const gamma = Math.pow(2, -Math.max(-1, Math.min(1, bias)));

  const out = clone();
  const anchors: number[] = [];
  beats.forEach((b, i) => {
    if (i === 0 || i === beats.length - 1 || b.role === "contact") anchors.push(i);
  });

  for (let s = 0; s < anchors.length - 1; s++) {
    const i0 = anchors[s];
    const i1 = anchors[s + 1];
    const f0 = beats[i0].frame;
    const span = beats[i1].frame - f0;
    if (span <= 0) continue;
    for (let i = i0 + 1; i < i1; i++) {
      const u = (beats[i].frame - f0) / span;
      out[i].frame = f0 + Math.round(Math.pow(u, gamma) * span);
    }
    // Collision repair inside the segment; anchors stay put.
    for (let i = i0 + 1; i < i1; i++) {
      if (out[i].frame <= out[i - 1].frame) out[i].frame = out[i - 1].frame + 1;
    }
    for (let i = i1 - 1; i > i0; i--) {
      if (out[i].frame >= out[i + 1].frame) out[i].frame = out[i + 1].frame - 1;
    }
  }

  // Not enough frames to hold every pose — decline rather than lose one.
  for (let i = 1; i < out.length; i++) {
    if (out[i].frame <= out[i - 1].frame) return clone();
  }
  return out;
}

/** Apply a variant. Duration, beat count, roles and loop flag all survive. */
export function applyVariant(clip: AaClip, spec: AaVariantSpec, name?: string): AaClip {
  const amp = spec.amplitude ?? 1;
  const asym = spec.asymmetry ?? 1;
  const beats = retimeBeats(clip.beats, clip.frames, spec.beatBias ?? 0).map((b) => ({
    ...b,
    pose: applyAsymmetry(amp === 1 ? b.pose : scalePose(b.pose, amp), asym),
  }));
  return {
    name: name ?? clip.name,
    frames: clip.frames,
    loop: clip.loop,
    rest: addPoses(clip.rest, spec.posture),
    beats,
    ...(clip.note ? { note: clip.note } : {}),
  };
}

/** Human-readable summary of a spec — the caption under a variant tile. */
export function describeVariant(spec: AaVariantSpec): string {
  const bits: string[] = [];
  if (spec.amplitude !== undefined && spec.amplitude !== 1) {
    bits.push(`${spec.amplitude.toFixed(2)}× swing`);
  }
  if (spec.asymmetry !== undefined && spec.asymmetry !== 1) {
    bits.push(spec.asymmetry === 0 ? "mirrored" : `${spec.asymmetry.toFixed(2)}× L/R`);
  }
  if (spec.beatBias) {
    bits.push(spec.beatBias > 0 ? `back-loaded ${spec.beatBias.toFixed(2)}` : `front-loaded ${(-spec.beatBias).toFixed(2)}`);
  }
  if (spec.posture && Object.keys(spec.posture).length > 0) {
    bits.push(
      Object.entries(spec.posture)
        .map(([ch, v]) => `${ch} ${v.rot ? `${v.rot > 0 ? "+" : ""}${v.rot}°` : ""}${v.y ? ` ${v.y > 0 ? "+" : ""}${v.y}px` : ""}`.trim())
        .join(" "),
    );
  }
  return bits.length ? bits.join(", ") : "as authored";
}

export type AaVariant = { spec: AaVariantSpec; label: string; clip: AaClip };

// The review grid. One axis at a time plus the authored original, because a
// grid that varies two knobs at once tells you a tile is wrong without telling
// you which knob did it.
//
// The lean bias is applied to the TORSO with a counter-rotation on the head —
// that pairing is what keeps a leaning character looking like it is looking
// where it is going rather than at the floor.
export const DEFAULT_VARIANT_GRID: { label: string; spec: AaVariantSpec }[] = [
  { label: "authored", spec: {} },
  { label: "smaller", spec: { amplitude: 0.7 } },
  { label: "bigger", spec: { amplitude: 1.35 } },
  { label: "front-loaded", spec: { beatBias: -0.5 } },
  { label: "back-loaded", spec: { beatBias: 0.5 } },
  { label: "symmetric", spec: { asymmetry: 0 } },
  { label: "lopsided", spec: { asymmetry: 1.6 } },
  { label: "lean forward", spec: { posture: { body: { rot: 8 }, head: { rot: -9 } } } },
  { label: "lean back", spec: { posture: { body: { rot: -6 }, head: { rot: 7 } } } },
  { label: "heavy", spec: { amplitude: 0.85, beatBias: 0.4, posture: { body: { y: -1 } } } },
  { label: "springy", spec: { amplitude: 1.2, beatBias: -0.4, posture: { body: { y: 1 } } } },
];

export function variantGrid(
  clip: AaClip,
  grid = DEFAULT_VARIANT_GRID,
): AaVariant[] {
  return grid.map(({ label, spec }) => ({
    spec,
    label,
    clip: applyVariant(clip, spec, clip.name),
  }));
}

/** Channels every AA clip may touch — re-exported so the editor's per-channel
 *  UI and the variant code cannot drift apart. */
export { AA_CHANNELS };
