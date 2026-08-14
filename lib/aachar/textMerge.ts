// AA character pipeline — stamping hi-res art ONTO an existing part.
//
// A hi-res draft (text, a library icon) normally becomes its OWN part,
// replacing whatever the slot wore. This module is the other option: bake the
// draft into the part that's already there — the shirt stays, the words go
// over it. Works on both kinds of part:
//
//   - a HI-RES part composites at (or near) its own native resolution;
//   - a PIXEL part is first upscaled by an integer factor U (nearest-
//     neighbour, so the art is visually unchanged — every source pixel
//     becomes a U×U block) high enough to carry the draft's resolution, and
//     becomes a hi-res part at density U. Crucially the WHOLE sheet upscales
//     and every region survives ×U with its pivot untouched — a cloth keeps
//     its sleeves, which is what rules out routing this through the
//     single-region `buildHiResAtlas`.
//
// The draft's placement is the transform panel's (dx/dy from the slot
// anchor, display height in logical px) and the slot anchor lives at the
// ROUTED region's pivot, so the composite lands exactly where the alignment
// canvas showed it. The draft is clipped to that region — same rule as the
// pixel stamp, so text can't smear across a neighbouring sleeve.
//
// ⚠️ A merged pixel part is multi-region AND hi-res, a combination the
// transform panel cannot re-save (it rebuilds single-region atlases) — the
// editor detects it via `hiResExtraRegionNames` and locks Save there.

import type { SpriteAtlas } from "@/lib/spum/types";

import { hiResRegionName, MAX_HIRES_DIM, type HiResPlacement } from "./hires";
import type { HiResArt } from "./hiresImport";
import { loadImage } from "./imageIo";
import type { AaPart, AaSlot } from "./types";

/** Region names on `atlas` beyond the slot's routed one. Non-empty marks a
 *  part the single-region transform panel must not re-save (it would drop
 *  them — a cloth's sleeves). */
export function hiResExtraRegionNames(atlas: SpriteAtlas, slot: AaSlot): string[] {
  return Object.keys(atlas.regions).filter((n) => n !== hiResRegionName(slot));
}

/**
 * Integer upscale for the target part so it can carry the draft's
 * resolution: at least ceil(draftDensity / partDensity), clamped to 1 and to
 * the save endpoint's dimension cap. Pure, tested.
 */
export function mergeUpscale(
  partWidth: number,
  partHeight: number,
  partDensity: number,
  draftDensity: number,
): number {
  const want = Math.ceil(draftDensity / partDensity);
  const cap = Math.floor(MAX_HIRES_DIM / Math.max(partWidth, partHeight));
  return Math.max(1, Math.min(want, Math.max(1, cap)));
}

/**
 * The target part's atlas scaled ×U: every region rect scales, every pivot
 * (a fraction) is untouched, density multiplies. `image` is filled in by the
 * caller once the composited PNG exists. Pure, tested.
 */
export function mergedAtlas(atlas: SpriteAtlas, upscale: number): SpriteAtlas {
  return {
    ...atlas,
    image: "",
    width: atlas.width * upscale,
    height: atlas.height * upscale,
    pixelDensity: (atlas.pixelDensity ?? 1) * upscale,
    // An absent smooth stays absent-equivalent (false): pixel parts keep
    // crisp sampling, which is also right for the baked draft — it was
    // rendered at roughly this density, so display is ~1:1.
    smooth: atlas.smooth === true,
    regions: Object.fromEntries(
      Object.entries(atlas.regions).map(([name, r]) => [
        name,
        {
          ...r,
          x: r.x * upscale,
          y: r.y * upscale,
          width: r.width * upscale,
          height: r.height * upscale,
        },
      ]),
    ),
  };
}

export type MergedPart = {
  dataUrl: string;
  width: number;
  height: number;
  atlas: SpriteAtlas;
};

/**
 * Composite `art` (at `placement`, relative to the slot anchor) over `part`'s
 * own image, returning the merged image + atlas ready to save under the
 * part's name. Browser glue (canvas) — verified in the browser, not unit
 * tests, same standing as `hiresImport`.
 */
export async function stampArtOntoPart(
  part: AaPart,
  slot: AaSlot,
  art: HiResArt,
  placement: HiResPlacement,
): Promise<MergedPart> {
  const routed = hiResRegionName(slot);
  const region = part.atlas.regions[routed];
  if (!region) throw new Error(`"${part.name}" has no ${routed} region to stamp onto`);

  const partDensity = part.atlas.pixelDensity ?? 1;
  const draftDensity = art.height / placement.logicalHeight;
  const U = mergeUpscale(part.atlas.width, part.atlas.height, partDensity, draftDensity);
  const outDensity = partDensity * U;

  const [partImg, artImg] = await Promise.all([
    loadImage(part.atlas.image),
    loadImage(art.dataUrl),
  ]);

  const c = document.createElement("canvas");
  c.width = part.atlas.width * U;
  c.height = part.atlas.height * U;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("2D canvas unavailable");

  // The part, upscaled. Nearest-neighbour for crisp parts (a pixel sheet is
  // visually unchanged), smooth interpolation for parts that already scale
  // smoothly.
  ctx.imageSmoothingEnabled = part.atlas.smooth === true;
  if (part.atlas.smooth === true) ctx.imageSmoothingQuality = "high";
  ctx.drawImage(partImg, 0, 0, c.width, c.height);

  // The draft, clipped to the routed region. Anchor = the region's pivot, in
  // merged-image px; the draft's centre sits at anchor + (dx, dy)·density.
  const rx = region.x * U;
  const ry = region.y * U;
  const rw = region.width * U;
  const rh = region.height * U;
  const anchorX = rx + region.pivot.x * rw;
  const anchorY = ry + (1 - region.pivot.y) * rh;
  const drawW = (art.width / draftDensity) * outDensity;
  const drawH = placement.logicalHeight * outDensity;
  ctx.save();
  ctx.beginPath();
  ctx.rect(rx, ry, rw, rh);
  ctx.clip();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(
    artImg,
    anchorX + placement.dx * outDensity - drawW / 2,
    anchorY + placement.dy * outDensity - drawH / 2,
    drawW,
    drawH,
  );
  ctx.restore();

  const dataUrl = c.toDataURL("image/png");
  return {
    dataUrl,
    width: c.width,
    height: c.height,
    atlas: { ...mergedAtlas(part.atlas, U), image: dataUrl },
  };
}
