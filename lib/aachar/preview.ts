// AA character pipeline — sizing a rig preview.
//
// `size` on `SpumCharacter` is an apparent-size MULTIPLIER over a base scale of
// `BASE_UNIT_PX / 32` = 6.875 CSS pixels per source pixel. A 32px-tall
// character at `size = 6` is therefore about 1300 CSS pixels tall, which is
// four times the preview box it was being rendered into: the editor showed a
// hugely magnified fragment of a torso and nothing else.
//
// That was survivable while the job was drawing pixels — the canvas is the real
// workspace there and the rig is a sanity check. It is NOT survivable for
// animation, where the whole point is judging motion by eye, so the size is now
// FITTED to the container from the model's own geometry and the slider became a
// zoom around that fit.

import { BASE_SPRITE_SCALE } from "@/lib/spum/SpumCharacter";

import type { AaGeometry } from "./types";

/** Rough bounding box of an assembled character, in SOURCE pixels.
 *
 *  Deliberately approximate. The exact extent depends on the skeleton's
 *  proportion overrides and on whatever pose the clip happens to be in — a
 *  `run` at full stride is wider than a stand. Fitting the resting stack and
 *  leaving headroom is both simpler and more stable than a per-frame measure,
 *  which would make the preview breathe as the clip played. */
export function characterExtentPx(geometry: AaGeometry): { width: number; height: number } {
  return {
    width: Math.max(geometry.head.width, geometry.body.width + 2 * geometry.arm.width),
    height: geometry.foot.height + geometry.body.height + geometry.head.height,
  };
}

/**
 * The `size` multiplier that fits a character of this geometry into a
 * `containerW × containerH` box, at `fill` of the smaller dimension.
 *
 * Clamped to a positive minimum so a degenerate geometry can never produce a
 * zero-scale (invisible) rig — an empty preview reads as broken plumbing, which
 * is the failure this whole editor is built to avoid.
 */
export function fitSize(
  geometry: AaGeometry,
  containerW: number,
  containerH: number,
  fill = 0.78,
): number {
  const extent = characterExtentPx(geometry);
  const byHeight = (containerH * fill) / (extent.height * BASE_SPRITE_SCALE);
  const byWidth = (containerW * fill) / (extent.width * BASE_SPRITE_SCALE);
  return Math.max(0.05, Math.min(byHeight, byWidth));
}
