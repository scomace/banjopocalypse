// AA character pipeline — clip analysis (Phase 6B).
//
// Reads a compiled `Clip` — SPUM's or AA's, the format is the same — and
// reports its STRUCTURE rather than its frames. This is the reference view's
// data source, and it is also how the invariants get tested: the same function
// that draws "idle is 20 frames but only 3 authored poses" in the editor is the
// one a test runs over the authored library.
//
// The distinction it exists to make: a 20-frame clip with 3 poses carries three
// authored decisions, not twenty. Everything between them is linear
// interpolation and holds no information — `lib/spum/curve.ts` discards the
// stored tangents, so there is nothing else in there. Showing such a clip as a
// frame strip implies seventeen choices that were never made.

import type { Clip, Track } from "@/lib/spum/types";

import { AA_FPS, PX_PER_UNIT } from "./clip";

export type ChannelKind = "rot" | "pos" | "vis";

export type ChannelStat = {
  path: string;
  kind: ChannelKind;
  keys: number;
  /** Peak-to-peak over the clip. Degrees for `rot`, source px for `pos`. */
  rangeRot: number;
  rangeX: number;
  rangeY: number;
  /** True when the last keyframe's value equals the first's. */
  closes: boolean;
};

export type ClipAnalysis = {
  name: string;
  frames: number;
  /** Every distinct keyframe time in the clip, as frames at 60fps. */
  poseKeys: number[];
  /** Keys not on the integer frame grid — hand-editing artefacts. */
  offGrid: number[];
  channels: ChannelStat[];
  /** Averaged over pose keys: the fraction of ANIMATED BONES keyed at that
   *  time. 1 means every pose is a literal whole-body pose.
   *
   *  Counted per BONE (rot, pos and vis times unioned) and only over bones with
   *  at least two distinct key times, because a bone with a single key is a
   *  constant — asking whether a constant "shares" a pose time is meaningless,
   *  and including the four static eye-visibility tracks every clip carries
   *  drags the figure down without saying anything about the motion.
   *
   *  Measured across all 38 engine clips this way: mean 0.75, median 0.74. An
   *  earlier pass recorded ~0.90, but that counted only the channels present at
   *  every pose time, which selects for the answer. The conclusion is unchanged
   *  either way — three quarters of animated bones key at any given pose time,
   *  so these are pose sheets, not independent per-bone curves. */
  sharedness: number;
  /** Every track returns to its t=0 value at t=duration, so it can loop
   *  without a visible snap. */
  closes: boolean;
};

const EPS = 1e-4;

function frameOf(t: number): number {
  const f = t * AA_FPS;
  // Unity stores times as float32, so a clean 1/60th arrives as 0.016666668.
  return Math.abs(f - Math.round(f)) < 0.01 ? Math.round(f) : Number(f.toFixed(2));
}

function statFor(path: string, track: Track): ChannelStat[] {
  const out: ChannelStat[] = [];
  if (track.rot?.length) {
    const zs = track.rot.map((k) => k.rot.z);
    out.push({
      path,
      kind: "rot",
      keys: zs.length,
      rangeRot: Math.max(...zs) - Math.min(...zs),
      rangeX: 0,
      rangeY: 0,
      closes: Math.abs(zs[0] - zs[zs.length - 1]) < EPS,
    });
  }
  if (track.pos?.length) {
    const xs = track.pos.map((k) => k.pos.x * PX_PER_UNIT);
    const ys = track.pos.map((k) => k.pos.y * PX_PER_UNIT);
    out.push({
      path,
      kind: "pos",
      keys: xs.length,
      rangeRot: 0,
      rangeX: Math.max(...xs) - Math.min(...xs),
      rangeY: Math.max(...ys) - Math.min(...ys),
      closes:
        Math.abs(xs[0] - xs[xs.length - 1]) < EPS &&
        Math.abs(ys[0] - ys[ys.length - 1]) < EPS,
    });
  }
  if (track.vis?.length) {
    out.push({
      path,
      kind: "vis",
      keys: track.vis.length,
      rangeRot: 0,
      rangeX: 0,
      rangeY: 0,
      closes: track.vis[0].active === track.vis[track.vis.length - 1].active,
    });
  }
  return out;
}

export function analyzeClip(clip: Clip): ClipAnalysis {
  const times = new Set<number>();
  const channels: ChannelStat[] = [];
  // Key times per BONE, so `sharedness` can ask how many bones key at each
  // pose time. See the field's docs for why the unit is the bone.
  const boneTimes: Set<number>[] = [];

  for (const [path, track] of Object.entries(clip.tracks)) {
    const own = new Set<number>();
    for (const kind of ["rot", "pos", "vis"] as const) {
      for (const k of track[kind] ?? []) {
        const f = frameOf(k.t);
        times.add(f);
        own.add(f);
      }
    }
    if (own.size >= 2) boneTimes.push(own);
    channels.push(...statFor(path, track));
  }

  const poseKeys = Array.from(times).sort((a, b) => a - b);
  const offGrid = poseKeys.filter((f) => !Number.isInteger(f));

  const sharedness =
    poseKeys.length === 0 || boneTimes.length === 0
      ? 1
      : poseKeys.reduce(
          (acc, f) => acc + boneTimes.filter((s) => s.has(f)).length / boneTimes.length,
          0,
        ) / poseKeys.length;

  return {
    name: clip.name,
    frames: frameOf(clip.duration),
    poseKeys,
    offGrid,
    channels,
    sharedness,
    // Visibility tracks are stepwise and often carry a single key, which by
    // definition "closes"; they are included so a clip that flips something on
    // and never back is still caught.
    closes: channels.every((c) => c.closes),
  };
}

/** A one-line summary — what the reference view prints under each clip. */
export function describeAnalysis(a: ClipAnalysis): string {
  const rot = a.channels.filter((c) => c.kind === "rot");
  const peak = rot.length ? Math.max(...rot.map((c) => c.rangeRot)) : 0;
  return (
    `${a.frames}f · ${a.poseKeys.length} poses · ${a.channels.length} channels · ` +
    `peak ${peak.toFixed(0)}° · ${(a.sharedness * 100).toFixed(0)}% shared` +
    (a.closes ? " · closes" : " · open") +
    (a.offGrid.length ? ` · ${a.offGrid.length} off-grid` : "")
  );
}
