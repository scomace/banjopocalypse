// AA character pipeline — turning a character's colour + appearance
// adjustments into something the renderer eats.
//
// The renderer takes a slice's PNG from `atlas.image` (SpumCharacter pushes
// slices with the atlas's own image URL), and the AA path already hands it
// atlases in memory through `atlasOverrides`. So an adjusted character is just
// an atlas whose `image` is a rewritten data URL — no renderer change, no new
// prop, and none of the geometry machinery (pivots, the gutter, the hair mask)
// notices, because only pixel VALUES change.
//
// WHY NOT A CSS FILTER for the hue/saturation/brightness/contrast half, which
// is how `lib/spum` does it (`appearancePerSlot` → a `filter` chain)? Because a
// filter applies to the whole slice and cannot spare the outline — and sparing
// the outline is the requirement. A per-pixel pass can.
//
// Browser-only: it decodes a PNG through a canvas. The maths is in
// `recolor.ts`, which stays pure and tested.

import type { SpriteAtlas } from "@/lib/spum/types";

import { bufferToDataUrl, imageToBuffer, loadImage } from "./imageIo";
import { applyPartTransform, isIdentityTransform, type ColorPicks } from "./recolor";
import type { AaAppearance, AaPart } from "./types";

// Decoded pixels, keyed by image URL. A slider drag re-runs the transform on
// every tick; without this each tick would re-decode the same PNG through an
// <img> element, which is the expensive half by an order of magnitude.
const decoded = new Map<string, Promise<Uint8ClampedArray>>();

// Finished atlases, keyed by everything the OUTPUT depends on except the pixels
// themselves — see `clearRecolorCache`.
const cache = new Map<string, Promise<SpriteAtlas>>();

export function recolorCacheKey(
  part: AaPart,
  picks: ColorPicks,
  appearance: AaAppearance | undefined,
): string {
  const chosen = Object.keys(picks)
    .sort()
    .map((id) => `${id}=${picks[id]}`)
    .join(",");
  const look = appearance
    ? `${appearance.hue ?? 0}/${appearance.saturation ?? 1}/${appearance.brightness ?? 1}/${appearance.contrast ?? 1}`
    : "-";
  return [
    part.atlas.image,
    JSON.stringify(part.colorChannels ?? []),
    JSON.stringify(part.protect ?? {}),
    chosen,
    look,
  ].join("|");
}

// A part re-saved under the same name keeps the same canonical URL, so its new
// pixels would hit stale entries in BOTH maps. The editor calls this after a
// save; nothing else needs to, because every other way an image changes also
// changes its URL (a live editor preview is a fresh data URL each stroke).
export function clearRecolorCache(): void {
  cache.clear();
  decoded.clear();
}

function decodeAtlas(atlas: SpriteAtlas): Promise<Uint8ClampedArray> {
  const hit = decoded.get(atlas.image);
  if (hit) return hit;
  const job = loadImage(atlas.image).then((img) =>
    imageToBuffer(img, atlas.width, atlas.height),
  );
  decoded.set(atlas.image, job);
  job.catch(() => decoded.delete(atlas.image));
  return job;
}

// The part's atlas with its tagged colours remapped and its appearance applied,
// both skipping the part's protected colours. Returns the ORIGINAL atlas object
// when there's nothing to do — identity matters, because callers use it to tell
// "no adjustment" from "adjustment pending" without a second flag.
export async function recoloredAtlas(
  part: AaPart,
  picks: ColorPicks,
  appearance?: AaAppearance,
): Promise<SpriteAtlas> {
  const transform = {
    channels: part.colorChannels,
    picks,
    appearance,
    protect: part.protect,
  };
  if (isIdentityTransform(transform)) return part.atlas;

  const key = recolorCacheKey(part, picks, appearance);
  const hit = cache.get(key);
  if (hit) return hit;

  const job = (async () => {
    const { width, height } = part.atlas;
    const pixels = applyPartTransform(await decodeAtlas(part.atlas), transform);
    return { ...part.atlas, image: bufferToDataUrl(pixels, width, height) };
  })();
  cache.set(key, job);
  // Don't remember a failure forever — a PNG that wasn't served yet should be
  // retried on the next render rather than leaving the slot permanently blank.
  job.catch(() => cache.delete(key));
  return job;
}
