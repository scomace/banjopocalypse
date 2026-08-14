// AA character pipeline — the clip format and its compiler (Phase 6).
//
// SPUM's clips are the last fully SPUM-derived thing about an AA character, so
// this module defines an ORIGINAL representation for the same class of motion
// and compiles it down to the `Clip` the renderer already consumes. Nothing
// here reads SPUM's animation data; the only shared thing is the bone paths,
// which are plumbing (docs/aachar-plan.md D2).
//
// WHY A NEW FORMAT RATHER THAN EDITING JSON — measured across all 38 clips in
// `public/spum/anims/`:
//
//   * They are POSE SHEETS, not curves: 3–11 whole-body poses at shared
//     timestamps, ~90% of channels keyed at every one.
//   * Interpolation is linear — `lib/spum/curve.ts` discards the stored
//     tangents outright. Timing feel is ONLY beat-length ratios.
//   * Every duration is a round frame count at 60fps.
//
// So the honest representation of one of these clips is a short list of
// timestamped whole-body poses, and that is exactly what `AaClip` is. Curves,
// easing and per-channel key times would all be fictions the engine cannot
// express.
//
// THREE LAYERS, each a meaningful authoring knob:
//
//   stance   the neutral standing pose. Model-level, so changing it restyles
//            every clip at once. Defaults to the RIG'S OWN neutral
//            (`NEUTRAL_STANCE`) — see the long note there for why an invented
//            one silently moves a character that was already tuned.
//   rest     what this clip's base posture is — `run` leans forward 9.5° for
//            its whole length, and that belongs here, not repeated in every
//            beat.
//   beat     the motion — a DELTA from stance+rest.
//
// Deltas rather than absolutes is the load-bearing choice: it makes amplitude
// scaling, posture bias and L/R asymmetry arithmetic (see clipVariants.ts),
// and it makes a clip readable as "what MOVES", not "where everything is".

import type { Clip, PosKeyframe, RotKeyframe, Track } from "@/lib/spum/types";

import { PROPORTION_BONES, PX_PER_UNIT, pxToUnits } from "./skeleton";
import {
  AA_EYE_STATES,
  AA_GAZE_DIRECTIONS,
  type AaEyeState,
  type AaGazeDirection,
} from "./types";

export const AA_FPS = 60;

// The channels an AA clip can animate. These are exactly the bones the
// amplitude budget was measured on, and each one maps to a body part an AA
// character actually has (root / torso / head / two arms / two feet).
//
// Deliberately NOT channels:
//   P_Back     — AA drops the `back` slot (D4), so nothing renders there.
//   HeadSet    — a PROPORTION bone. 18 SPUM clips rotate it and none position
//                it; animating it here would fight the head-attach control.
//   Shadow     — plumbing. Its tracks are all-zero in every clip that has one,
//                which is identical to leaving it at its skeleton default.
//   P_*Close / P_*Eye — the blink layer. Every SPUM clip carries a static
//                visibility track for these, and the skeleton already defaults
//                `P_LClose`/`P_RClose` to inactive and the open eyes to
//                active, so emitting them would encode nothing.
export const AA_CHANNELS = [
  "root",
  "body",
  "head",
  "larm",
  "rarm",
  "lfoot",
  "rfoot",
] as const;

export type AaChannel = (typeof AA_CHANNELS)[number];

export const CHANNEL_BONES: Record<AaChannel, string> = {
  root: "Root",
  body: "Root/BodySet/P_Body",
  head: "Root/BodySet/P_Body/HeadSet/P_Head",
  larm: "Root/BodySet/P_Body/ArmSet/ArmL/P_LArm",
  rarm: "Root/BodySet/P_Body/ArmSet/ArmR/P_RArm",
  lfoot: "Root/P_LFoot",
  rfoot: "Root/P_RFoot",
};

export const CHANNEL_LABELS: Record<AaChannel, string> = {
  root: "Root",
  body: "Torso",
  head: "Head",
  larm: "Arm L",
  rarm: "Arm R",
  lfoot: "Foot L",
  rfoot: "Foot R",
};

// Mirror pairs, used by the asymmetry variant and by `mirrorPose`.
export const CHANNEL_MIRROR: Partial<Record<AaChannel, AaChannel>> = {
  larm: "rarm",
  rarm: "larm",
  lfoot: "rfoot",
  rfoot: "lfoot",
};

// A beat's job in the phrase. Purely descriptive — the compiler ignores roles —
// but they are what the variant grammar retimes against, and what makes a beat
// sheet readable at a glance.
export const AA_BEAT_ROLES = [
  "rest", // neutral; the pose the clip departs from and returns to
  "anticipate", // wind-up AGAINST the coming action
  "strike", // the action itself; typically the shortest beat
  "contact", // a foot plants, or a prop changes hands — do not retime freely
  "overshoot", // past the resting pose, on the far side
  "settle", // easing back in
  "extreme", // the far end of a swing (waves, cheers)
  "pass", // mid-swing, limbs crossing (locomotion)
  "hold", // deliberately static
] as const;

export type AaBeatRole = (typeof AA_BEAT_ROLES)[number];

/** Rotation in DEGREES, translation in SOURCE PIXELS. Both are the units the
 *  editor shows; the compiler converts px → Unity units on the way out. */
export type AaChannelPose = { rot?: number; x?: number; y?: number };

export type AaPose = Partial<Record<AaChannel, AaChannelPose>>;

export type AaBeat = {
  /** Integer frame at 60fps. */
  frame: number;
  role: AaBeatRole;
  /** DELTA from stance + rest. An omitted channel sits at stance+rest for this
   *  beat — beats are whole-body poses, which is what the engine's shared-time
   *  pose sheets already are. */
  pose: AaPose;
  note?: string;
};

export type AaClip = {
  /** Matches a `SpumAnimation` name when this clip replaces one, so scene
   *  content keeps working unchanged. */
  name: string;
  /** Integer frame count at 60fps. LOCKED to the SPUM clip of the same name —
   *  scene timings are authored against these durations. */
  frames: number;
  loop: boolean;
  /** Clip-wide posture delta over the model stance. */
  rest?: AaPose;
  beats: AaBeat[];
  note?: string;
  /** Static eye state for the clip's whole duration (Phase 11), applied by
   *  the preview as a render-time band swap — never a track. Absent means
   *  "leave the character's own resting state alone". Covers everything
   *  SPUM's originals did with their eye visibility flips (`damaged` and
   *  `concentrate` play eyes-closed) without any keyframe machinery. */
  eyeState?: AaEyeState;
  /** Static gaze for the clip's whole duration (Phase 12) — where the pupils
   *  point, resolved per eye to the furthest offset the whites allow
   *  (`lib/aachar/gaze.ts`). Same contract as `eyeState`: whole-clip, never
   *  a track, needs the eye part to carry `eyes` marks, and only shows while
   *  the OPEN band renders. */
  gaze?: AaGazeDirection;
};

/** The neutral standing pose. Absolute (over the skeleton's own defaults),
 *  model-level, shared by every clip. */
export type AaStance = AaPose;

// ---------------------------------------------------------------------------
// Stance
// ---------------------------------------------------------------------------

export type AaStanceGeometry = {
  body: { width: number; height: number };
  foot: { width: number; height: number };
};

// THE RIG'S NEUTRAL POSE, in source px — each channel bone's own `defaultPos`
// from `public/spum/skeleton.json`, pinned by a test.
//
// This is SKELETON data, not clip data. D2 already commits this pipeline to
// SPUM's bone paths as plumbing, and the proportion system is built directly on
// these same defaults (`stockProportions` reads them off the same file).
// Crucially, `defaultPos` is what a bone falls back to when no clip positions
// it — so every proportion control in the editor was dialled in against exactly
// these numbers, and any other rest pose silently moves an existing character.
//
// WHY THIS IS NOT "just SPUM's idle pose". An earlier version invented a stance
// from geometry instead — arms and head at (0, 0) — on the theory that the
// ±1.5px offsets were art nudges the proportion bones should own. That was
// wrong in a way only a real character showed: this model's `HeadSet` had been
// lowered to 3.5px specifically to close the head/body seam AGAINST these
// defaults, so zeroing them raised the head 0.5px (a visible gap at the neck)
// and pushed it 1.5px right of the torso. Phase 6 replaces MOTION; where the
// parts sit at rest is the skeleton's business.
//
// Rotation is 0 rather than each bone's `defaultRot`: `P_Body` carries a 3.056°
// default that every clip in the engine's set overrides to 0, so the rig's
// visual rest is upright.
export const NEUTRAL_STANCE: AaStance = {
  root: { rot: 0, x: 0, y: 0 },
  body: { rot: 0, x: -0.416, y: 0.992 },
  head: { rot: 0, x: -1.5, y: -0.5 },
  larm: { rot: 0, x: -1.5, y: 0 },
  rarm: { rot: 0, x: 1.5, y: 0 },
  lfoot: { rot: 0, x: 4, y: 6 },
  rfoot: { rot: 0, x: -4, y: 6 },
};

// An OPT-IN stance derived from the model's own measurements: a wider torso
// stands with its feet further apart, and a taller foot sprite plants higher.
//
// A button in the editor rather than the default, because applying it MOVES an
// existing character. Worth reaching for on a new model whose proportions have
// departed far enough from the rig's that the neutral stance reads wrong;
// pointless on one already tuned by hand.
//
// Both rules reproduce the rig's own numbers at stock geometry (body 12 wide →
// ±4, foot 7 tall → 6), which is the check that they describe the same thing
// the skeleton does rather than inventing a second convention.
export function fittedStance(geometry: AaStanceGeometry): AaStance {
  const half = Math.max(2, Math.round(geometry.body.width / 3));
  const plant = Math.max(1, geometry.foot.height - 1);
  return {
    ...NEUTRAL_STANCE,
    lfoot: { rot: 0, x: half, y: plant },
    rfoot: { rot: 0, x: -half, y: plant },
  };
}

// ---------------------------------------------------------------------------
// Pose arithmetic
// ---------------------------------------------------------------------------

const ZERO: Required<AaChannelPose> = { rot: 0, x: 0, y: 0 };

export function channelAt(pose: AaPose | undefined, ch: AaChannel): Required<AaChannelPose> {
  const p = pose?.[ch];
  if (!p) return ZERO;
  return { rot: p.rot ?? 0, x: p.x ?? 0, y: p.y ?? 0 };
}

/** Component-wise sum. Later arguments add to earlier ones. */
export function addPoses(...poses: (AaPose | undefined)[]): AaPose {
  const out: AaPose = {};
  for (const ch of AA_CHANNELS) {
    let touched = false;
    const acc = { rot: 0, x: 0, y: 0 };
    for (const p of poses) {
      if (!p?.[ch]) continue;
      touched = true;
      const v = channelAt(p, ch);
      acc.rot += v.rot;
      acc.x += v.x;
      acc.y += v.y;
    }
    if (touched) out[ch] = acc;
  }
  return out;
}

export function scalePose(pose: AaPose, k: number): AaPose {
  const out: AaPose = {};
  for (const [ch, v] of Object.entries(pose) as [AaChannel, AaChannelPose][]) {
    out[ch] = { rot: (v.rot ?? 0) * k, x: (v.x ?? 0) * k, y: (v.y ?? 0) * k };
  }
  return out;
}

/** Swap left and right channels and negate the horizontal components. Used by
 *  the asymmetry variant to build a "too symmetric" reference to deviate from,
 *  never to generate final art — real gaits are NOT mirrored (measured). */
export function mirrorPose(pose: AaPose): AaPose {
  const out: AaPose = {};
  for (const [ch, v] of Object.entries(pose) as [AaChannel, AaChannelPose][]) {
    const target = CHANNEL_MIRROR[ch] ?? ch;
    out[target] = { rot: -(v.rot ?? 0), x: -(v.x ?? 0), y: v.y ?? 0 };
  }
  return out;
}

export function posesEqual(a: AaPose | undefined, b: AaPose | undefined, eps = 1e-6): boolean {
  for (const ch of AA_CHANNELS) {
    const va = channelAt(a, ch);
    const vb = channelAt(b, ch);
    if (
      Math.abs(va.rot - vb.rot) > eps ||
      Math.abs(va.x - vb.x) > eps ||
      Math.abs(va.y - vb.y) > eps
    ) {
      return false;
    }
  }
  return true;
}

/** Channels this clip touches anywhere — in its rest posture or any beat. */
export function activeChannels(clip: AaClip, stance?: AaStance): AaChannel[] {
  const seen = new Set<AaChannel>();
  const scan = (p: AaPose | undefined) => {
    if (!p) return;
    for (const ch of Object.keys(p) as AaChannel[]) seen.add(ch);
  };
  scan(stance);
  scan(clip.rest);
  for (const b of clip.beats) scan(b.pose);
  return AA_CHANNELS.filter((c) => seen.has(c));
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export type AaClipProblem = {
  level: "error" | "warn";
  message: string;
  /** Index into `clip.beats`, when the problem is beat-local. */
  beat?: number;
};

// Rejects everything the ENGINE cannot express or the CONTENT depends on.
// Constraints, in the order they bite (docs/aachar-plan.md § Phase 6):
//   * integer frames — there is no sub-frame authoring, and every off-grid
//     keyframe in SPUM's set is in a hand-edited clip;
//   * a beat at 0 and at `frames` — a pose sheet with no endpoints has an
//     undefined start or end, since sampling clamps rather than wraps;
//   * loopables must CLOSE — a loop whose last pose differs from its first
//     visibly snaps every cycle.
export function checkClip(clip: AaClip): AaClipProblem[] {
  const out: AaClipProblem[] = [];
  const err = (message: string, beat?: number) =>
    out.push({ level: "error", message, beat });
  const warn = (message: string, beat?: number) =>
    out.push({ level: "warn", message, beat });

  if (!Number.isInteger(clip.frames) || clip.frames < 1) {
    err(`frames must be a positive integer, got ${clip.frames}`);
  }
  if (
    clip.eyeState !== undefined &&
    !AA_EYE_STATES.includes(clip.eyeState)
  ) {
    err(`eyeState must be one of ${AA_EYE_STATES.join("/")}, got ${JSON.stringify(clip.eyeState)}`);
  }
  if (clip.gaze !== undefined && !AA_GAZE_DIRECTIONS.includes(clip.gaze)) {
    err(`gaze must be one of ${AA_GAZE_DIRECTIONS.join("/")}, got ${JSON.stringify(clip.gaze)}`);
  }
  if (clip.beats.length === 0) {
    err("a clip needs at least one beat");
    return out;
  }

  let prev = -1;
  clip.beats.forEach((b, i) => {
    if (!Number.isInteger(b.frame)) {
      err(`beat ${i} is off the 60fps integer grid (frame ${b.frame})`, i);
    }
    if (b.frame <= prev) err(`beat ${i} is out of order or duplicated`, i);
    prev = b.frame;
    if (b.frame < 0 || b.frame > clip.frames) {
      err(`beat ${i} at frame ${b.frame} is outside 0..${clip.frames}`, i);
    }
    for (const [ch, v] of Object.entries(b.pose) as [AaChannel, AaChannelPose][]) {
      if (!AA_CHANNELS.includes(ch)) {
        err(`beat ${i} names unknown channel "${ch}"`, i);
        continue;
      }
      for (const [k, lim] of [
        ["rot", 360],
        ["x", 64],
        ["y", 64],
      ] as const) {
        const n = v[k];
        if (n === undefined) continue;
        if (!Number.isFinite(n)) err(`beat ${i} ${ch}.${k} is not finite`, i);
        else if (Math.abs(n) > lim) {
          warn(`beat ${i} ${ch}.${k} = ${n} exceeds the ±${lim} budget`, i);
        }
      }
    }
  });

  const first = clip.beats[0];
  const last = clip.beats[clip.beats.length - 1];
  if (first.frame !== 0) err("the first beat must be at frame 0");
  if (last.frame !== clip.frames) {
    err(`the last beat must be at frame ${clip.frames}, got ${last.frame}`);
  }
  if (clip.loop && !posesEqual(first.pose, last.pose)) {
    err("a looping clip must end on the pose it starts from, or it snaps");
  }

  return out;
}

// ---------------------------------------------------------------------------
// Compiler
// ---------------------------------------------------------------------------

// Bones whose `defaultPos` is a live proportion control. Emitting a `pos` track
// for any of these would silently kill the corresponding slider (§3, I1) — the
// channel table is chosen to avoid them, and this is the assertion that keeps
// it that way if a channel is ever added.
const PROPORTION_PATHS: ReadonlySet<string> = new Set(PROPORTION_BONES.map((b) => b.path));

for (const [ch, path] of Object.entries(CHANNEL_BONES) as [AaChannel, string][]) {
  if (PROPORTION_PATHS.has(path)) {
    throw new Error(
      `AA clip channel "${ch}" targets ${path}, which is a proportion bone — ` +
        `a pos track on it would make its defaultPos control a silent no-op`,
    );
  }
}

const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;

/**
 * Beat sheet → the `Clip` the renderer consumes.
 *
 * Every active channel is keyed at EVERY beat frame, because that is what the
 * source format already is: whole-body poses at shared timestamps. A channel
 * omitted from a beat therefore returns to stance+rest at that beat rather than
 * coasting through — predictable, and equivalent to SPUM's sparse authoring
 * whenever the neighbouring keys are at rest, which is the case it uses.
 *
 * A track is emitted ONLY if it carries a non-zero value somewhere. A clip that
 * says nothing about a bone's position leaves its `defaultPos` live, which is
 * how the proportion controls stay meaningful.
 */
export function compileClip(clip: AaClip, stance: AaStance = {}): Clip {
  const channels = activeChannels(clip, stance);
  const tracks: Record<string, Track> = {};

  for (const ch of channels) {
    const base = channelAt(addPoses(stance, clip.rest), ch);
    const rot: RotKeyframe[] = [];
    const pos: PosKeyframe[] = [];
    let anyRot = false;
    let anyPos = false;

    for (const beat of clip.beats) {
      const d = channelAt(beat.pose, ch);
      const t = beat.frame / AA_FPS;
      const z = base.rot + d.rot;
      const x = base.x + d.x;
      const y = base.y + d.y;
      if (!near(z, 0)) anyRot = true;
      if (!near(x, 0) || !near(y, 0)) anyPos = true;
      rot.push({ t, rot: { x: 0, y: 0, z } });
      pos.push({ t, pos: { x: pxToUnits(x), y: pxToUnits(y) } });
    }

    if (!anyRot && !anyPos) continue;
    const track: Track = {};
    if (anyRot) track.rot = rot;
    if (anyPos) track.pos = pos;
    tracks[CHANNEL_BONES[ch]] = track;
  }

  return {
    name: clip.name,
    duration: clip.frames / AA_FPS,
    fps: AA_FPS,
    tracks,
  };
}

/** The absolute pose a beat resolves to, in authoring units. What the editor
 *  shows in its beat table, and what a variant is applied on top of. */
export function resolveBeat(clip: AaClip, stance: AaStance, index: number): AaPose {
  return addPoses(stance, clip.rest, clip.beats[index]?.pose);
}

/** Peak-to-peak swing per channel over the whole clip, in authoring units.
 *  Compared against the measured amplitude budget in the editor so a clip that
 *  has drifted out of the engine's expressive range is visible. */
export function clipAmplitude(clip: AaClip): Record<string, { rot: number; x: number; y: number }> {
  const out: Record<string, { rot: number; x: number; y: number }> = {};
  for (const ch of activeChannels(clip)) {
    const vals = clip.beats.map((b) => channelAt(b.pose, ch));
    const span = (k: "rot" | "x" | "y") => {
      const ns = vals.map((v) => v[k]);
      return Math.max(...ns) - Math.min(...ns);
    };
    out[ch] = { rot: span("rot"), x: span("x"), y: span("y") };
  }
  return out;
}

export { PX_PER_UNIT };
