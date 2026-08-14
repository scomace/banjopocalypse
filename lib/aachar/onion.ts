// AA character pipeline — onion-skin compositing.
//
// The reference art (a SPUM body) and the canvas being drawn on have DIFFERENT
// region sizes and a different sheet layout — that's the entire point of this
// pipeline. So a sheet-sized 1:1 draw, which is what Part Studio does, would
// put SPUM's torso somewhere over our arm.
//
// Instead each region is composited **pivot-to-pivot** (docs/aachar-plan.md
// D7): the source region is drawn so its pivot lands on the target region's
// pivot, clipped to the target rect. The pivot is the point the renderer
// anchors to a bone, so aligning on it is what makes the reference sit where
// the finished art will actually sit. `buildHeadOnion` in Part Studio already
// proved the technique on one region; this generalises it.
//
// Browser-only (uses canvas + fetch).

import type { SpriteAtlas } from "@/lib/spum/types";

import type { PackedSheet } from "./geometry";
import { loadImage } from "./imageIo";
import { pivotAnchor, type PivotMap } from "./pixels";

const CENTRE = { x: 0.5, y: 0.5 };

export type OnionSource = {
  atlas: SpriteAtlas;
  image: HTMLImageElement;
};

export async function loadOnionSource(atlasUrl: string): Promise<OnionSource> {
  const atlas = (await fetch(atlasUrl).then((r) => r.json())) as SpriteAtlas;
  const image = await loadImage(atlas.image);
  return { atlas, image };
}

// Onion from an atlas we already hold in memory — an AA part from the model
// library, where only the image still needs fetching.
export async function makeOnionSource(atlas: SpriteAtlas): Promise<OnionSource> {
  return { atlas, image: await loadImage(atlas.image) };
}

// Which source region backs each target region, and how far to shift it after
// the pivots are aligned.
//
// Needed because region names only coincide by luck: cloth's `Body/Left/Right`
// draw against the body's `Body/Arm_L/Arm_R`, and an eye or hair sheet has no
// name in common with `Head` at all. The offset covers bones that sit between
// the two sprites on the rig — the free-eye anchor, for instance, is a couple
// of pixels below the head sprite's centre.
export type OnionMapping = Record<string, { from: string; dx?: number; dy?: number }>;

// Composite `source` behind a sheet of shape `target`. Regions present in the
// target but not the source are skipped (e.g. drawing cloth against a body:
// only the regions they share line up).
//
// Returns a canvas sized to the target sheet, drawn at 1 device pixel per
// sheet pixel — the caller scales it for display.
export function compositeOnion(
  target: PackedSheet,
  source: OnionSource,
  targetPivots: PivotMap = {},
  mapping?: OnionMapping,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = target.width;
  canvas.height = target.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas unavailable");
  ctx.imageSmoothingEnabled = false;

  for (const [name, dst] of Object.entries(target.regions)) {
    // With no mapping, regions pair by name — the body-against-a-SPUM-body
    // case, where they genuinely do line up.
    const rule = mapping ? mapping[name] : { from: name };
    if (!rule) continue;
    const src = source.atlas.regions[rule.from];
    if (!src) continue;

    const srcPivot = src.pivot ?? CENTRE;
    const dstPivot = targetPivots[name] ?? CENTRE;
    const sa = pivotAnchor(
      { x: src.x, y: src.y, width: src.width, height: src.height },
      srcPivot,
    );
    const da = pivotAnchor(dst, dstPivot);

    // Where the source region's top-left lands once its pivot sits on the
    // target's pivot. Rounded so the reference stays on the pixel grid.
    const dx = Math.round(dst.x + (src.x - sa.x) + (da.x - dst.x) + (rule.dx ?? 0));
    const dy = Math.round(dst.y + (src.y - sa.y) + (da.y - dst.y) + (rule.dy ?? 0));

    ctx.save();
    // Clip to the target rect: reference art larger than the region we're
    // drawing must not bleed over a neighbour (the packer leaves no gutter).
    ctx.beginPath();
    ctx.rect(dst.x, dst.y, dst.width, dst.height);
    ctx.clip();
    ctx.drawImage(
      source.image,
      src.x,
      src.y,
      src.width,
      src.height,
      dx,
      dy,
      src.width,
      src.height,
    );
    ctx.restore();
  }
  return canvas;
}
