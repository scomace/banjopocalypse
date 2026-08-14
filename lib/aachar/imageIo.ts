// AA character pipeline — canvas <-> pixel buffer conversion.
//
// Browser-only. Split out from `pixels.ts` (which stays pure and testable) and
// from `onion.ts` (which is about compositing, not I/O).

import type { PackedSheet } from "./geometry";
import type { SpriteAtlas } from "@/lib/spum/types";
import { createBuffer } from "./pixels";

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load image: ${src}`));
    img.src = src;
  });
}

export function bufferToCanvas(
  buf: Uint8ClampedArray,
  width: number,
  height: number,
): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  const ctx = c.getContext("2d");
  // TS 5.7 DOM libs type ImageData's source as Uint8ClampedArray<ArrayBuffer>;
  // the buffers here are always plain ArrayBuffer-backed, so the cast is safe.
  if (ctx)
    ctx.putImageData(
      new ImageData(buf as Uint8ClampedArray<ArrayBuffer>, width, height),
      0,
      0,
    );
  return c;
}

export function bufferToDataUrl(
  buf: Uint8ClampedArray,
  width: number,
  height: number,
): string {
  return bufferToCanvas(buf, width, height).toDataURL("image/png");
}

// Decode an image into a flat RGBA buffer at its native size.
export function imageToBuffer(
  img: HTMLImageElement,
  width: number,
  height: number,
): Uint8ClampedArray {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  const ctx = c.getContext("2d");
  if (!ctx) return createBuffer(width, height);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0);
  return ctx.getImageData(0, 0, width, height).data;
}

// A saved part's atlas, viewed as the sheet layout its pixels were packed
// into — the shape `migratePixels` needs to move that art onto a sheet packed
// from different geometry.
export function atlasToSheet(atlas: SpriteAtlas): PackedSheet {
  return {
    width: atlas.width,
    height: atlas.height,
    regions: Object.fromEntries(
      Object.entries(atlas.regions).map(([name, r]) => [
        name,
        { x: r.x, y: r.y, width: r.width, height: r.height },
      ]),
    ),
  };
}

// A region's bottom profile (rows from the region's top to one past each
// column's lowest opaque pixel; 0 = empty column), measured from the atlas
// PNG. The authoritative copy is `AaPart.contentBottomProfile`, written on
// save; this is the fallback for a part saved before that existed, so an old
// helmet still cuts hair instead of silently doing nothing (lib/aachar/hatHair.ts).
export async function measureBottomProfile(
  atlas: SpriteAtlas,
  regionName: string,
): Promise<number[]> {
  const r = atlas.regions[regionName];
  if (!r) return [];
  const img = await loadImage(atlas.image);
  const c = document.createElement("canvas");
  c.width = r.width;
  c.height = r.height;
  const ctx = c.getContext("2d");
  if (!ctx) return [];
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, r.x, r.y, r.width, r.height, 0, 0, r.width, r.height);
  const { data } = ctx.getImageData(0, 0, r.width, r.height);
  const profile: number[] = [];
  for (let x = 0; x < r.width; x++) {
    let bottom = 0;
    for (let y = r.height - 1; y >= 0; y--) {
      if (data[(y * r.width + x) * 4 + 3] !== 0) {
        bottom = y + 1;
        break;
      }
    }
    profile.push(bottom);
  }
  return profile;
}

export function atlasPivots(atlas: SpriteAtlas): Record<string, { x: number; y: number }> {
  return Object.fromEntries(
    Object.entries(atlas.regions).map(([name, r]) => [name, { ...r.pivot }]),
  );
}
