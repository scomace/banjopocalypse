// AA character pipeline — baking a character's auto-shading into a worn
// atlas (Phase 13).
//
// Same shape as recolorAtlas.ts / hatHairAtlas.ts: an adjusted atlas is just
// an atlas whose `image` is a rewritten data URL, so the renderer and all the
// geometry machinery stay ignorant of the feature. Runs on whatever atlas the
// override chain hands it — usually a recoloured/hat-haired data URL, which
// is the point: shading has to see the FINAL pixel colours.
//
// Browser-only (canvas decode). The maths lives in `shade.ts`, pure and
// tested.

import type { SpriteAtlas } from "@/lib/spum/types";

import { bufferToDataUrl, imageToBuffer, loadImage } from "./imageIo";
import { applyShading } from "./shade";
import type { AaLightDirection, AaProtect, AaShadeStyle } from "./types";

// Decoded pixels by image URL — a light-direction flip re-bakes every slot,
// and without this each flip would re-decode the same PNGs.
const decoded = new Map<string, Promise<Uint8ClampedArray>>();

// Finished atlases, keyed by everything the output depends on. Direction is
// in the key on purpose: it is the whole cost of the scene-light feature — at
// most four bakes per part variant instead of one.
const cache = new Map<string, Promise<SpriteAtlas>>();

// A part re-saved under the same name keeps its canonical URL, so its new
// pixels would hit stale entries. The editor calls this after a save, next to
// `clearRecolorCache` and `clearHatHairCache`.
export function clearShadeCache(): void {
  cache.clear();
  decoded.clear();
}

export function shadeCacheKey(
  atlas: SpriteAtlas,
  style: AaShadeStyle,
  direction: AaLightDirection,
  ramps: readonly (readonly string[])[],
  protect: AaProtect | undefined,
): string {
  return [
    atlas.image,
    style,
    direction,
    atlas.pixelDensity ?? 1,
    JSON.stringify(ramps),
    JSON.stringify(protect ?? {}),
  ].join("|");
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

/**
 * The atlas with the character's shading style applied. Returns the ORIGINAL
 * atlas object when there is nothing to do (style "none", or a pass that
 * changed no pixel) — identity is the "no adjustment" signal, same contract
 * as `recoloredAtlas` and `hatHairedAtlas`.
 */
export async function shadedAtlas(
  atlas: SpriteAtlas,
  style: AaShadeStyle,
  direction: AaLightDirection,
  ramps: readonly (readonly string[])[],
  protect: AaProtect | undefined,
): Promise<SpriteAtlas> {
  if (style === "none") return atlas;

  const key = shadeCacheKey(atlas, style, direction, ramps, protect);
  const hit = cache.get(key);
  if (hit) return hit;

  const job = (async () => {
    // The decode cache hands the same buffer to every job for this URL — copy
    // before mutating or the "original" pixels quietly stop being original.
    const pixels = new Uint8ClampedArray(await decodeAtlas(atlas));
    const changed = applyShading(pixels, atlas.width, atlas.height, {
      style,
      direction,
      density: atlas.pixelDensity ?? 1,
      ramps,
      protect,
    });
    if (!changed) return atlas;
    return { ...atlas, image: bufferToDataUrl(pixels, atlas.width, atlas.height) };
  })();
  cache.set(key, job);
  // Don't remember a failure — a PNG that wasn't served yet should retry.
  job.catch(() => cache.delete(key));
  return job;
}
