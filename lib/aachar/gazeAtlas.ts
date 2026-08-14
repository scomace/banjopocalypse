// AA character pipeline — the browser half of per-eye nudge + gaze
// (Phase 12). Same trick as recolorAtlas.ts: decode the eye atlas once, run
// the pure pixel pass (lib/aachar/gaze.ts), hand back an atlas whose `image`
// is a rewritten data URL. Region rects are untouched — this runs BEFORE the
// eye-state band swap, which only repoints rects.
//
// Unlike recolour, the INPUT here is often already a data URL (the recoloured
// eye, or the editor's live canvas), so the caches are size-capped rather
// than relying on stable canonical URLs: a live canvas mints a fresh data URL
// every stroke, and an unbounded map would keep every one of them alive.

import { FREE_EYE_CLOSE_REGION, FREE_EYE_REGION } from "@/lib/spum/freeEye";
import type { SpriteAtlas } from "@/lib/spum/types";

import { applyEyeAdjust, isIdentityEyeNudge, isIdentityGaze } from "./gaze";
import type { PackedRegion } from "./geometry";
import { bufferToDataUrl, imageToBuffer, loadImage } from "./imageIo";
import { FREE_EYE_HALF_REGION } from "./slots";
import type { AaCharacter, AaGaze, AaPartEyes } from "./types";

const MAX_ENTRIES = 64;

const decoded = new Map<string, Promise<Uint8ClampedArray>>();
const cache = new Map<string, Promise<SpriteAtlas>>();

function capped<K, V>(map: Map<K, V>): void {
  if (map.size > MAX_ENTRIES) map.clear();
}

/** Editor calls this on part save — an overwrite keeps the same canonical
 *  URL, so cached entries would be of the OLD pixels. */
export function clearGazeCache(): void {
  decoded.clear();
  cache.clear();
}

function decodeAtlas(atlas: SpriteAtlas): Promise<Uint8ClampedArray> {
  const hit = decoded.get(atlas.image);
  if (hit) return hit;
  const job = loadImage(atlas.image).then((img) =>
    imageToBuffer(img, atlas.width, atlas.height),
  );
  capped(decoded);
  decoded.set(atlas.image, job);
  job.catch(() => decoded.delete(atlas.image));
  return job;
}

function rectOf(atlas: SpriteAtlas, name: string): PackedRegion | null {
  const r = atlas.regions[name];
  return r ? { x: r.x, y: r.y, width: r.width, height: r.height } : null;
}

/**
 * The eye atlas with the character's per-eye nudge and the requested gaze
 * baked into its pixels. Returns the ORIGINAL atlas object when there is
 * nothing to do (no marks, identity nudge, no gaze) — callers use identity
 * to tell "unadjusted" apart without a flag.
 */
export async function eyeAdjustedAtlas(
  atlas: SpriteAtlas,
  eyes: AaPartEyes | undefined,
  nudge: AaCharacter["eyeNudge"],
  gaze: AaGaze | undefined,
): Promise<SpriteAtlas> {
  if (!eyes) return atlas;
  if (isIdentityEyeNudge(nudge) && isIdentityGaze(gaze)) return atlas;
  const open = rectOf(atlas, FREE_EYE_REGION);
  if (!open) return atlas;

  const key = [
    atlas.image,
    JSON.stringify(eyes),
    JSON.stringify(nudge ?? {}),
    JSON.stringify(gaze ?? "-"),
  ].join("|");
  const hit = cache.get(key);
  if (hit) return hit;

  const job = (async () => {
    const others = [
      rectOf(atlas, FREE_EYE_HALF_REGION),
      rectOf(atlas, FREE_EYE_CLOSE_REGION),
    ].filter((r): r is PackedRegion => r !== null);
    const pixels = applyEyeAdjust(
      await decodeAtlas(atlas),
      atlas.width,
      open,
      others,
      eyes,
      nudge,
      gaze,
    );
    return { ...atlas, image: bufferToDataUrl(pixels, atlas.width, atlas.height) };
  })();
  capped(cache);
  cache.set(key, job);
  job.catch(() => cache.delete(key));
  return job;
}
