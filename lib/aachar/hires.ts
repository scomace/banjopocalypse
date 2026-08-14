// AA character pipeline — hi-res ("as-is") parts.
//
// Phase 8. A part imported from the prop/sprite/modern libraries keeps its
// ORIGINAL pixels: the atlas image is stored at native resolution and carries
// `pixelDensity` (source px per logical px), which the renderer folds into the
// slice scale. Two consequences that shape everything here:
//
//   - Resizing is LOSSLESS. Changing the display size only changes the
//     density number — no resampling ever touches the pixels, so a part can
//     be resized forever without degrading.
//   - `smooth` is separate from resolution. A 512px painterly icon wants
//     smooth scaling (`image-rendering: auto`); a 48px pixel-art item wants
//     crisp nearest-neighbour. Both store native pixels; the flag only picks
//     the sampling.
//
// A hi-res part is a SINGLE region covering its whole image — no gutter
// needed, because there is no neighbouring region to bleed into. Position is
// encoded in the region PIVOT (the point the renderer pins to the bone), the
// same trick headroom uses: `dx`/`dy` here are the offset of the ART'S CENTRE
// from the slot anchor, in logical px, +y down, and `buildHiResAtlas` turns
// them into a pivot. That means a hi-res part needs NO renderer support
// beyond the two atlas fields.
//
// Detection: `pixelDensity`/`smooth` PRESENT on the atlas marks a part as
// hi-res, even when density is exactly 1 — the editor must route these to the
// transform panel, never to the pixel canvas (hydrating a native-res sheet
// into the pixel editor would be nonsense at density 4 and merely confusing
// at density 1).

import type { SpriteAtlas } from "@/lib/spum/types";

import { SINGLE_REGION_NAME } from "./slots";
import type { AaGeometry, AaPart, AaSlot } from "./types";

// Slots that can hold a hi-res part. `body` is the model's own canonical art
// and `eye` is a two-band layer with blink structure — both stay pixel-only.
export const HI_RES_SLOTS: readonly AaSlot[] = [
  "cloth",
  "hair",
  "faceHair",
  "helmet",
  "weapon",
  "weapon2",
];

// The save endpoint caps atlas dimensions at 512 — plenty for any pack art,
// and the import path downscales anything larger before it gets here.
export const MAX_HIRES_DIM = 512;

export const MIN_LOGICAL_HEIGHT = 4;
export const MAX_LOGICAL_HEIGHT = 96;

/**
 * The one region a hi-res part declares. Single slots use their routed region
 * name; cloth uses its torso region ("Body") — a hi-res cloth is a torso
 * overlay, and the sleeve regions are simply absent (the renderer skips
 * regions an atlas doesn't declare).
 */
export function hiResRegionName(slot: AaSlot): string {
  const single = SINGLE_REGION_NAME[slot];
  if (single) return single;
  if (slot === "cloth") return "Body";
  throw new Error(`slot "${slot}" cannot hold a hi-res part`);
}

/** How the art sits on the rig — everything except the pixels themselves. */
export type HiResPlacement = {
  /** Display height in logical (sprite) px. Width follows the aspect ratio. */
  logicalHeight: number;
  /** Art centre offset from the slot anchor, logical px, +x right. */
  dx: number;
  /** +y down (screen convention, same as the canvas editors). */
  dy: number;
  /** Smooth scaling (`image-rendering: auto`) vs crisp nearest-neighbour. */
  smooth: boolean;
};

export function clampLogicalHeight(h: number): number {
  return Math.max(MIN_LOGICAL_HEIGHT, Math.min(MAX_LOGICAL_HEIGHT, Math.round(h)));
}

/**
 * Native px per logical px. Fractional is fine (48px art shown at 20px is
 * density 2.4) — nothing on the render path needs it to be an integer.
 */
export function hiResDensity(nativeHeight: number, logicalHeight: number): number {
  if (nativeHeight <= 0 || logicalHeight <= 0) {
    throw new Error("hiResDensity needs positive sizes");
  }
  return nativeHeight / logicalHeight;
}

/**
 * The atlas a hi-res part stores and renders through. Region rect covers the
 * whole native image; the placement is encoded as density + pivot.
 *
 * Pivot math (pivot.y is measured from the region's BOTTOM, Unity's
 * convention): the anchor sits at the art's centre minus the (dx, dy) offset,
 * so an art centre `dy` px BELOW the anchor puts the anchor `dy·density`
 * native px ABOVE the image centre.
 */
export function buildHiResAtlas(
  slot: AaSlot,
  image: string,
  nativeWidth: number,
  nativeHeight: number,
  placement: HiResPlacement,
): SpriteAtlas {
  const density = hiResDensity(nativeHeight, placement.logicalHeight);
  // Anchor within the image, native px from the top-left.
  const ax = nativeWidth / 2 - placement.dx * density;
  const ay = nativeHeight / 2 - placement.dy * density;
  return {
    image,
    width: nativeWidth,
    height: nativeHeight,
    pixelDensity: density,
    smooth: placement.smooth,
    regions: {
      [hiResRegionName(slot)]: {
        x: 0,
        y: 0,
        width: nativeWidth,
        height: nativeHeight,
        pivot: { x: ax / nativeWidth, y: 1 - ay / nativeHeight },
      },
    },
  };
}

/** A part whose atlas declares hi-res fields — routed to the transform panel,
 *  never the pixel canvas. Presence of the fields is the marker, so a part at
 *  density exactly 1 still counts. */
export function isHiResPart(part: Pick<AaPart, "atlas">): boolean {
  return part.atlas.pixelDensity !== undefined || part.atlas.smooth !== undefined;
}

export type HiResReading = HiResPlacement & {
  nativeWidth: number;
  nativeHeight: number;
  logicalWidth: number;
};

/**
 * Read a saved hi-res atlas back into its placement — the inverse of
 * `buildHiResAtlas`, so reopening a part shows the numbers it was saved with.
 * Returns null when the atlas doesn't carry the expected single region.
 */
export function readHiResAtlas(atlas: SpriteAtlas, slot: AaSlot): HiResReading | null {
  const region = atlas.regions[hiResRegionName(slot)];
  if (!region) return null;
  const density = atlas.pixelDensity ?? 1;
  if (!(density > 0)) return null;
  const ax = region.pivot.x * region.width;
  const ay = (1 - region.pivot.y) * region.height;
  return {
    nativeWidth: region.width,
    nativeHeight: region.height,
    logicalWidth: region.width / density,
    logicalHeight: region.height / density,
    dx: (region.width / 2 - ax) / density,
    dy: (region.height / 2 - ay) / density,
    smooth: atlas.smooth === true,
  };
}

/**
 * A sensible starting display height per slot, derived from the model's own
 * geometry so it tracks the character rather than assuming stock proportions.
 */
export function defaultLogicalHeight(slot: AaSlot, geometry: AaGeometry): number {
  switch (slot) {
    case "helmet":
      return clampLogicalHeight(geometry.head.height + 6);
    case "hair":
      return clampLogicalHeight(geometry.head.height + 8);
    case "faceHair":
      return clampLogicalHeight(Math.max(MIN_LOGICAL_HEIGHT, Math.round(geometry.head.height / 3)));
    case "cloth":
      return clampLogicalHeight(geometry.body.height + 2);
    default:
      return clampLogicalHeight(14);
  }
}
