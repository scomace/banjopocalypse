// AA character pipeline — baking a character's hat-hair mode into its hair
// atlas.
//
// The renderer takes a slice's PNG from `atlas.image`, and the AA path already
// hands it atlases in memory — so hat-hair, like a recolour, is just an atlas
// whose `image` is a rewritten data URL. No renderer prop, no clip-path: the
// spill modes ADD pixels, which a clip could never do, and the SPUM renderer
// stays ignorant of the whole feature.
//
// Runs AFTER the recolour pass on purpose — the spill puff samples "the colour
// of the chosen hair", which after a recolour is the character's picked
// colour, not the authored one. The helmet, by contrast, only contributes
// ALPHA (its bottom profile), which no recolour touches, so the RAW helmet
// atlas is the right geometry source and a colour drag never re-plans.
//
// Browser-only (canvas decode). The maths and pixel passes live in
// `hatHair.ts`, pure and tested.

import type { Skeleton, SpriteAtlas } from "@/lib/spum/types";

import {
  HAIR_BONE,
  HAIR_REGION,
  HELMET_BONE,
  applyHatHair,
  hatHairPlan,
  type HatHairPlacement,
} from "./hatHair";
import { bufferToDataUrl, imageToBuffer, loadImage } from "./imageIo";
import type { AaHatHairMode } from "./types";

// Decoded pixels by image URL — a hair recolour drag re-bakes on every tick,
// and without this each tick would re-decode the same PNG. Shared entries are
// COPIED before mutation; see below.
const decoded = new Map<string, Promise<Uint8ClampedArray>>();

// Finished atlases, keyed by everything the output depends on.
const cache = new Map<string, Promise<SpriteAtlas>>();

// A part re-saved under the same name keeps its canonical URL, so its new
// pixels would hit stale entries. The editor calls this after a save, next to
// `clearRecolorCache`.
export function clearHatHairCache(): void {
  cache.clear();
  decoded.clear();
}

export function hatHairCacheKey(
  mode: AaHatHairMode,
  hairAtlas: SpriteAtlas,
  helmetAtlas: SpriteAtlas,
  bottomProfile: number[],
  skeleton: Skeleton | null,
  placement?: HatHairPlacement,
): string {
  const bone = (path: string) => {
    const p = skeleton?.bones.find((b) => b.path === path)?.defaultPos;
    return p ? `${p.x},${p.y}` : "-";
  };
  const place = (p?: { dx?: number; dy?: number }) =>
    p ? `${p.dx ?? 0},${p.dy ?? 0}` : "-";
  return [
    mode,
    hairAtlas.image,
    helmetAtlas.image,
    bottomProfile.join(","),
    bone(HAIR_BONE),
    bone(HELMET_BONE),
    place(placement?.hair),
    place(placement?.helmet),
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
 * The hair atlas with the character's hat-hair mode applied. Returns the
 * ORIGINAL atlas object when there is nothing to do (mode "none", no plan, or
 * a plan that touches no pixel) — identity is the "no adjustment" signal,
 * same contract as `recoloredAtlas`.
 */
export async function hatHairedAtlas(
  mode: AaHatHairMode,
  hairAtlas: SpriteAtlas,
  helmetAtlas: SpriteAtlas,
  bottomProfile: number[],
  skeleton: Skeleton | null,
  placement?: HatHairPlacement,
): Promise<SpriteAtlas> {
  if (mode === "none") return hairAtlas;
  const plan = hatHairPlan(mode, hairAtlas, helmetAtlas, bottomProfile, skeleton, placement);
  if (!plan) return hairAtlas;

  const key = hatHairCacheKey(mode, hairAtlas, helmetAtlas, bottomProfile, skeleton, placement);
  const hit = cache.get(key);
  if (hit) return hit;

  const job = (async () => {
    const region = hairAtlas.regions[HAIR_REGION];
    if (!region) return hairAtlas;
    // The decode cache hands the same buffer to every job for this URL — copy
    // before mutating or the "original" pixels quietly stop being original.
    const pixels = new Uint8ClampedArray(await decodeAtlas(hairAtlas));
    const changed = applyHatHair(
      pixels,
      hairAtlas.width,
      region,
      plan,
      mode,
      hairAtlas.pixelDensity ?? 1,
    );
    if (!changed) return hairAtlas;
    return {
      ...hairAtlas,
      image: bufferToDataUrl(pixels, hairAtlas.width, hairAtlas.height),
    };
  })();
  cache.set(key, job);
  // Don't remember a failure — a PNG that wasn't served yet should retry.
  job.catch(() => cache.delete(key));
  return job;
}
