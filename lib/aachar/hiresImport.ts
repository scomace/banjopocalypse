// AA character pipeline — decoding library art for a hi-res part.
//
// Browser-only glue (canvas + Image), kept apart from `hires.ts` so the
// placement/atlas math stays pure and testable. The job here is small on
// purpose: decode, trim the transparent border, cap at the save endpoint's
// 512px limit, and hand back a PNG data URL plus its dimensions. NO
// resampling to sprite size happens — that is the whole point of a hi-res
// part; display size is a number on the atlas, not a property of the pixels.
//
// Unlike `importArt.ts` there is no matte removal, palette cap or sampling
// mode: the sources this feeds from (prop catalog, sprite sheets, modern
// packs) are transparent PNGs already. Art that needs that treatment should
// go through the Pixelate path instead.

import { contentBounds } from "@/lib/spum/imageOps";

import { MAX_HIRES_DIM } from "./hires";
import { loadImage } from "./imageIo";

export type HiResArt = {
  dataUrl: string;
  width: number;
  height: number;
};

function draw(
  img: CanvasImageSource,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  dw: number,
  dh: number,
  smoothing: boolean,
): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = Math.max(1, dw);
  c.height = Math.max(1, dh);
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("2D canvas unavailable");
  ctx.imageSmoothingEnabled = smoothing;
  if (smoothing) ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, dw, dh);
  return c;
}

/**
 * Decode `src` (an image URL or a Blob), trim its transparent border, and cap
 * the result at `MAX_HIRES_DIM`. Oversized art is downscaled ONCE here, from
 * the original decode — every later resize is just the density number.
 *
 * For a sprite-sheet frame, pass the frame rect so only that frame is read.
 */
export async function prepareHiResArt(
  src: string | Blob,
  frame?: { x: number; y: number; width: number; height: number },
): Promise<HiResArt> {
  const url = typeof src === "string" ? src : URL.createObjectURL(src);
  let img: HTMLImageElement;
  try {
    img = await loadImage(url);
  } finally {
    if (typeof src !== "string") URL.revokeObjectURL(url);
  }

  const box = frame ?? { x: 0, y: 0, width: img.naturalWidth, height: img.naturalHeight };
  if (box.width < 1 || box.height < 1) throw new Error("Empty image");

  // Read the (framed) pixels once to find the content bounds.
  const probe = draw(img, box.x, box.y, box.width, box.height, box.width, box.height, false);
  const ctx = probe.getContext("2d");
  if (!ctx) throw new Error("2D canvas unavailable");
  const id = ctx.getImageData(0, 0, probe.width, probe.height);
  const bounds = contentBounds({
    width: probe.width,
    height: probe.height,
    data: new Uint8Array(id.data),
  });
  if (!bounds) throw new Error("The image is fully transparent");

  const k = Math.min(1, MAX_HIRES_DIM / Math.max(bounds.width, bounds.height));
  const dw = Math.max(1, Math.round(bounds.width * k));
  const dh = Math.max(1, Math.round(bounds.height * k));
  // Crop (and downscale, only if over the cap) straight from the decoded
  // original — smoothing on for a real downscale, off for the 1:1 crop so
  // pixel-art sources come through untouched.
  const out = draw(
    img,
    box.x + bounds.x,
    box.y + bounds.y,
    bounds.width,
    bounds.height,
    dw,
    dh,
    k < 1,
  );
  return { dataUrl: out.toDataURL("image/png"), width: dw, height: dh };
}
