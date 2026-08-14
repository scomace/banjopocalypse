// AA horse pipeline — the horse clip format and its compiler.
//
// Parallel to `../clip.ts` (the character format), NOT a parameterisation of
// it: the character module is load-bearing for a fully working editor, and a
// second rig's needs (different channel count, different bone namespace, no
// proportion-bone assertion) would have turned its types generic for no gain.
// The SHAPES are kept identical on purpose — beats, roles, deltas over
// stance+rest, integer frames at 60fps — so everything learned authoring
// character clips transfers.
//
// The horse skeleton (`public/spum/horse-skeleton.json`, 31 bones, root
// `Pivot_Main`) stays SPUM's — bone paths are plumbing, same bargain as
// docs/aachar-plan.md D2. All 12 of SPUM's horse clips animate the same 14
// tracks: `Pivot_Main` (held ~static — excluded here), `Pivot_Root`,
// `Pivot_Body`, `Pivot_Neck`, `Pivot_Head`, `Pivot_Tail`, and the 8 leg
// pivots. That's the channel set below.
//
// SCREEN SEMANTICS (horse faces LEFT, same renderer math as the character):
//   * authoring +y = up, −x = forward (toward the nose)
//   * NEGATIVE rot lifts the nose / swings a hanging leg forward;
//     positive rot drops the nose / swings a leg back
//   * rotation is degrees, translation is source pixels (32 px per Unity
//     unit; the compiler converts on the way out)

import type { Clip, PosKeyframe, RotKeyframe, Track } from "@/lib/spum/types";

import { AA_BEAT_ROLES, AA_FPS, type AaBeatRole } from "../clip";
import { PX_PER_UNIT, pxToUnits } from "../skeleton";

// Leg semantics, MEASURED off the skeleton's world positions (the GameObject
// names mislead): `Pivot_FootFrontSet` sits under the CHEST — it is the
// front PAIR of legs (and rides `Pivot_Body`, so it bobs with the torso);
// `Pivot_FootBackSet` sits under the RUMP — the hind pair (under
// `Pivot_Root`). Within each pair, `Pivot_FrontFoot` is the NEAR-side leg
// (z −5/−6, drawn in front) and `Pivot_BackFoot` the FAR-side leg (z −10,
// behind the body, offset slightly forward — the classic depth stagger).
// Channel names say what you see: front/hind × near/far, with `…Low` for
// the lower-leg pivot (`PivotBottom` — the fetlock).
export const HORSE_CHANNELS = [
  "root",
  "body",
  "neck",
  "head",
  "tail",
  "frontNear",
  "frontNearLow",
  "frontFar",
  "frontFarLow",
  "hindNear",
  "hindNearLow",
  "hindFar",
  "hindFarLow",
] as const;

export type AaHorseChannel = (typeof HORSE_CHANNELS)[number];

const R = "Pivot_Main/Pivot_Root";
const FRONT_PAIR = `${R}/Pivot_Body/Pivot_FootFrontSet`;
const HIND_PAIR = `${R}/Pivot_FootBackSet`;

export const HORSE_CHANNEL_BONES: Record<AaHorseChannel, string> = {
  root: R,
  body: `${R}/Pivot_Body`,
  neck: `${R}/Pivot_Body/Pivot_Neck`,
  head: `${R}/Pivot_Body/Pivot_Neck/Pivot_Head`,
  tail: `${R}/Pivot_Tail`,
  frontNear: `${FRONT_PAIR}/Pivot_FrontFoot`,
  frontNearLow: `${FRONT_PAIR}/Pivot_FrontFoot/PivotBottom`,
  frontFar: `${FRONT_PAIR}/Pivot_BackFoot`,
  frontFarLow: `${FRONT_PAIR}/Pivot_BackFoot/PivotBottom`,
  hindNear: `${HIND_PAIR}/Pivot_FrontFoot`,
  hindNearLow: `${HIND_PAIR}/Pivot_FrontFoot/PivotBottom`,
  hindFar: `${HIND_PAIR}/Pivot_BackFoot`,
  hindFarLow: `${HIND_PAIR}/Pivot_BackFoot/PivotBottom`,
};

export const HORSE_CHANNEL_LABELS: Record<AaHorseChannel, string> = {
  root: "Root",
  body: "Body",
  neck: "Neck",
  head: "Head",
  tail: "Tail",
  frontNear: "Front leg (near)",
  frontNearLow: "Front fetlock (near)",
  frontFar: "Front leg (far)",
  frontFarLow: "Front fetlock (far)",
  hindNear: "Hind leg (near)",
  hindNearLow: "Hind fetlock (near)",
  hindFar: "Hind leg (far)",
  hindFarLow: "Hind fetlock (far)",
};

export { AA_BEAT_ROLES, AA_FPS };
export type { AaBeatRole };

/** Rotation in DEGREES, translation in SOURCE PIXELS — editor units; the
 *  compiler converts px → Unity units on the way out. */
export type AaHorseChannelPose = { rot?: number; x?: number; y?: number };

export type AaHorsePose = Partial<Record<AaHorseChannel, AaHorseChannelPose>>;

export type AaHorseBeat = {
  /** Integer frame at 60fps. */
  frame: number;
  role: AaBeatRole;
  /** DELTA from stance + rest — an omitted channel sits at stance+rest. */
  pose: AaHorsePose;
  note?: string;
};

export type AaHorseClip = {
  /** Matches a `HorseAnimation` name — scene/mount content keeps working. */
  name: string;
  /** Integer frame count at 60fps, LOCKED to the SPUM clip of the same name. */
  frames: number;
  loop: boolean;
  /** Clip-wide posture delta over the stance. */
  rest?: AaHorsePose;
  beats: AaHorseBeat[];
  note?: string;
};

export type AaHorseStance = AaHorsePose;

// THE RIG'S NEUTRAL POSE, in source px — each channel bone's own `defaultPos`
// from `public/spum/horse-skeleton.json`, pinned by a test. Same rule as the
// character's NEUTRAL_STANCE: a compiled `pos` track overrides `defaultPos`
// ABSOLUTELY, so the stance must carry the skeleton's own numbers or every
// animated bone teleports. Rotation is 0 everywhere (so is the skeleton's).
export const HORSE_NEUTRAL_STANCE: AaHorseStance = {
  root: { rot: 0, x: 5.5, y: 10 },
  body: { rot: 0, x: -5, y: 2 },
  neck: { rot: 0, x: -9.5, y: 1 },
  head: { rot: 0, x: -2, y: 6.5 },
  tail: { rot: 0, x: 3, y: 4.5 },
  frontNear: { rot: 0, x: 3.5, y: 2 },
  frontNearLow: { rot: 0, x: 0.5, y: -4 },
  frontFar: { rot: 0, x: 1, y: 2 },
  frontFarLow: { rot: 0, x: 0.096, y: -3.008 },
  hindNear: { rot: 0, x: 4.064, y: 1.728 },
  hindNearLow: { rot: 0, x: 0.896, y: -3.84 },
  hindFar: { rot: 0, x: 0.128, y: 0.032 },
  hindFarLow: { rot: 0, x: 0.448, y: -2.144 },
};

// ---------------------------------------------------------------------------
// Pose arithmetic (same contracts as ../clip.ts, over the horse channel set)
// ---------------------------------------------------------------------------

const ZERO: Required<AaHorseChannelPose> = { rot: 0, x: 0, y: 0 };

export function horseChannelAt(
  pose: AaHorsePose | undefined,
  ch: AaHorseChannel,
): Required<AaHorseChannelPose> {
  const p = pose?.[ch];
  if (!p) return ZERO;
  return { rot: p.rot ?? 0, x: p.x ?? 0, y: p.y ?? 0 };
}

export function addHorsePoses(...poses: (AaHorsePose | undefined)[]): AaHorsePose {
  const out: AaHorsePose = {};
  for (const ch of HORSE_CHANNELS) {
    let touched = false;
    const acc = { rot: 0, x: 0, y: 0 };
    for (const p of poses) {
      if (!p?.[ch]) continue;
      touched = true;
      const v = horseChannelAt(p, ch);
      acc.rot += v.rot;
      acc.x += v.x;
      acc.y += v.y;
    }
    if (touched) out[ch] = acc;
  }
  return out;
}

export function horsePosesEqual(
  a: AaHorsePose | undefined,
  b: AaHorsePose | undefined,
  eps = 1e-6,
): boolean {
  for (const ch of HORSE_CHANNELS) {
    const va = horseChannelAt(a, ch);
    const vb = horseChannelAt(b, ch);
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

/** Channels this clip touches anywhere — in stance, rest or any beat. */
export function activeHorseChannels(
  clip: AaHorseClip,
  stance?: AaHorseStance,
): AaHorseChannel[] {
  const seen = new Set<AaHorseChannel>();
  const scan = (p: AaHorsePose | undefined) => {
    if (!p) return;
    for (const ch of Object.keys(p) as AaHorseChannel[]) seen.add(ch);
  };
  scan(stance);
  scan(clip.rest);
  for (const b of clip.beats) scan(b.pose);
  return HORSE_CHANNELS.filter((c) => seen.has(c));
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export type AaHorseClipProblem = {
  level: "error" | "warn";
  message: string;
  beat?: number;
};

// Same rules as the character `checkClip`: integer frames, endpoint beats at
// 0 and `frames`, loops must close, budget warnings at ±360° / ±64px.
export function checkHorseClip(clip: AaHorseClip): AaHorseClipProblem[] {
  const out: AaHorseClipProblem[] = [];
  const err = (message: string, beat?: number) => out.push({ level: "error", message, beat });
  const warn = (message: string, beat?: number) => out.push({ level: "warn", message, beat });

  if (!Number.isInteger(clip.frames) || clip.frames < 1) {
    err(`frames must be a positive integer, got ${clip.frames}`);
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
    for (const [ch, v] of Object.entries(b.pose) as [AaHorseChannel, AaHorseChannelPose][]) {
      if (!HORSE_CHANNELS.includes(ch)) {
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
  if (clip.loop && !horsePosesEqual(first.pose, last.pose)) {
    err("a looping clip must end on the pose it starts from, or it snaps");
  }

  return out;
}

// ---------------------------------------------------------------------------
// Compiler
// ---------------------------------------------------------------------------

const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;

/**
 * Beat sheet → the `Clip` `SpumHorse.clipOverride` consumes. Same contract as
 * the character compiler: every active channel keys at every beat frame, and
 * a track is emitted only when it carries a non-zero value somewhere (a clip
 * that says nothing about a bone leaves its `defaultPos` live).
 */
export function compileHorseClip(
  clip: AaHorseClip,
  stance: AaHorseStance = HORSE_NEUTRAL_STANCE,
): Clip {
  const channels = activeHorseChannels(clip, stance);
  const tracks: Record<string, Track> = {};

  for (const ch of channels) {
    const base = horseChannelAt(addHorsePoses(stance, clip.rest), ch);
    const rot: RotKeyframe[] = [];
    const pos: PosKeyframe[] = [];
    let anyRot = false;
    let anyPos = false;

    for (const beat of clip.beats) {
      const d = horseChannelAt(beat.pose, ch);
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
    tracks[HORSE_CHANNEL_BONES[ch]] = track;
  }

  return {
    name: clip.name,
    duration: clip.frames / AA_FPS,
    fps: AA_FPS,
    tracks,
  };
}

/** Peak-to-peak swing per channel over the clip's beats, in authoring units. */
export function horseClipAmplitude(
  clip: AaHorseClip,
): Partial<Record<AaHorseChannel, { rot: number; x: number; y: number }>> {
  const out: Partial<Record<AaHorseChannel, { rot: number; x: number; y: number }>> = {};
  for (const ch of activeHorseChannels(clip)) {
    const vals = clip.beats.map((b) => horseChannelAt(b.pose, ch));
    const span = (k: "rot" | "x" | "y") => {
      const ns = vals.map((v) => v[k]);
      return Math.max(...ns) - Math.min(...ns);
    };
    out[ch] = { rot: span("rot"), x: span("x"), y: span("y") };
  }
  return out;
}

/** A beat sheet as a pasteable TS literal — the promotion path into
 *  `lib/aachar/horse/clips.ts`, mirroring `clipToSource`. */
export function horseClipToSource(clip: AaHorseClip): string {
  const num = (n: number) =>
    Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  const pose = (p: AaHorsePose) => {
    const entries = Object.entries(p).map(([ch, v]) => {
      const parts: string[] = [];
      if (v.rot) parts.push(`rot: ${num(v.rot)}`);
      if (v.x) parts.push(`x: ${num(v.x)}`);
      if (v.y) parts.push(`y: ${num(v.y)}`);
      return `        ${ch}: { ${parts.join(", ")} },`;
    });
    return entries.length ? `{\n${entries.join("\n")}\n      }` : "{}";
  };
  const beats = clip.beats
    .map(
      (b) =>
        `    {\n      frame: ${b.frame},\n      role: "${b.role}",\n      pose: ${pose(b.pose)},` +
        (b.note ? `\n      note: ${JSON.stringify(b.note)},` : "") +
        `\n    },`,
    )
    .join("\n");
  return (
    `export const ${clip.name.replace(/[^A-Za-z0-9_]/g, "_")}: AaHorseClip = {\n` +
    `  name: ${JSON.stringify(clip.name)},\n` +
    `  frames: ${clip.frames},\n` +
    `  loop: ${clip.loop},\n` +
    (clip.rest && Object.keys(clip.rest).length ? `  rest: ${pose(clip.rest)},\n` : "") +
    (clip.note ? `  note: ${JSON.stringify(clip.note)},\n` : "") +
    `  beats: [\n${beats}\n  ],\n};\n`
  );
}

export { PX_PER_UNIT };
