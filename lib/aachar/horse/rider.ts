// AA horse pipeline — the rider: an AA character on the AA horse.
//
// The design question was "how does a character keep its whole animation
// set while sitting on a horse?" — and the pipeline already answered it for
// carrying: `holdChannels` (lib/aachar/clipOps) locks named channels to a
// fixed pose while every other channel plays the clip normally. That is
// exactly riding: the LEGS are held to a straddle (they're in the
// stirrups), and idle/greeting/attack/throw all play on top unchanged. So
// a rider needs no second clip library — one tweakable riding pose covers
// the lot, and `move_carry_loop` was the proof the mechanism ships.
//
// The pose is MODEL-level (`model.horse.rider`): every character shares one
// geometry, so one straddle fits the cast; per-character deviation wasn't
// worth a schema until someone needs it.
//
// Positioning is the mount composite's job (the Ride view / a future scene
// mount): the rider glues to the horse's saddle bone via `boneTransformRef`
// each frame, plus the author-tunable `offset` here. Depth comes from the
// two-copy trick (see the Ride view): right-side slices render BEHIND the
// horse, the rest in front, so the character straddles rather than stands
// on the saddle.

import type { Clip } from "@/lib/spum/types";

import {
  AA_CHANNELS,
  type AaChannel,
  type AaClip,
  type AaPose,
  compileClip,
} from "../clip";
import { holdChannels } from "../clipOps";
import { modelStance, resolveAaClip } from "../clipLibrary";
import type { AaModel } from "../types";

export type AaHorseRider = {
  /** The riding pose — deltas over stance for the HELD channels. Absent
   *  channels of `hold` freeze at plain stance. */
  pose?: AaPose;
  /** Which channels are frozen to the pose while mounted. Absent = the two
   *  legs (the default); an explicit empty list = hold nothing, the clip
   *  plays completely unmodified. */
  hold?: AaChannel[];
  /** Rider offset from the saddle bone, css px at size 1 (negative y = up). */
  offset?: { x: number; y: number };
  /** Depth toggle: right arm + right-hand weapon behind the horse (true,
   *  the classic side-view straddle) or in front (shields, banners). The
   *  right LEG is always behind — that's what makes it read as riding. */
  rightArmBehind?: boolean;
};

export const DEFAULT_RIDER_HOLD: AaChannel[] = ["lfoot", "rfoot"];

// The straddle. Derived from the same reasoning as SIT_POSE (floor.ts) but
// steeper: on the floor the legs rest ALONG the ground (−72/−63); over a
// horse's side they drape forward-DOWN, knees over the barrel. The near
// (left) leg reads in front, the far (right) leg tucks slightly back — the
// depth stagger the two-copy composite completes.
export const DEFAULT_RIDER_POSE: AaPose = {
  lfoot: { rot: -52, x: -2.5, y: 1.5 },
  rfoot: { rot: -44, x: -1.5, y: 1.8 },
};

// Matches the SPUM harness's tuned default: the character's Root lands
// exactly on the saddle bone, which puts the seat a touch low — a small
// lift sits the rider ON the saddle instead of in it.
export const DEFAULT_RIDER_OFFSET = { x: 0, y: -8 };

export function riderHold(rider: AaHorseRider | undefined): AaChannel[] {
  return rider?.hold ?? DEFAULT_RIDER_HOLD;
}

export function riderPose(rider: AaHorseRider | undefined): AaPose {
  return rider?.pose ?? DEFAULT_RIDER_POSE;
}

export function riderOffset(rider: AaHorseRider | undefined): { x: number; y: number } {
  return rider?.offset ?? DEFAULT_RIDER_OFFSET;
}

/** Any AA clip, mounted: the held channels frozen to the riding pose, the
 *  rest playing as authored. Null when the name resolves to nothing. */
export function riddenAaClip(
  model: AaModel,
  name: string,
  rider: AaHorseRider | undefined,
): AaClip | null {
  const clip = resolveAaClip(model, name);
  if (!clip) return null;
  return holdChannels(clip, riderHold(rider), riderPose(rider), clip.name);
}

/** The `Clip` for the rider's `clipOverride` while mounted. */
export function compiledRiderClip(
  model: AaModel,
  name: string,
  rider: AaHorseRider | undefined,
): Clip | null {
  const ridden = riddenAaClip(model, name, rider);
  return ridden ? compileClip(ridden, modelStance(model)) : null;
}

// ---------------------------------------------------------------------------
// Validation (called from horseModelError)
// ---------------------------------------------------------------------------

const isFiniteNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export function riderError(value: unknown): string | null {
  if (typeof value !== "object" || value === null) return "model.horse.rider is not an object";
  const r = value as Record<string, unknown>;
  if (r.pose !== undefined) {
    if (typeof r.pose !== "object" || r.pose === null) return "rider pose is not an object";
    for (const [ch, raw] of Object.entries(r.pose as Record<string, unknown>)) {
      if (!(AA_CHANNELS as readonly string[]).includes(ch)) {
        return `rider pose names unknown channel "${ch}"`;
      }
      const p = raw as Record<string, unknown> | null;
      if (typeof p !== "object" || p === null) return `rider pose channel "${ch}" is invalid`;
      for (const k of ["rot", "x", "y"]) {
        const v = p[k];
        if (v !== undefined && !isFiniteNumber(v)) return `rider pose ${ch}.${k} is not finite`;
      }
    }
  }
  if (r.hold !== undefined) {
    if (
      !Array.isArray(r.hold) ||
      r.hold.some((c) => !(AA_CHANNELS as readonly string[]).includes(c as string))
    ) {
      return "rider hold must be a list of character channels";
    }
  }
  if (r.offset !== undefined) {
    const o = r.offset as Record<string, unknown> | null;
    if (typeof o !== "object" || o === null || !isFiniteNumber(o.x) || !isFiniteNumber(o.y)) {
      return "rider offset must be finite {x, y}";
    }
  }
  if (r.rightArmBehind !== undefined && typeof r.rightArmBehind !== "boolean") {
    return "rider rightArmBehind must be a boolean";
  }
  return null;
}
