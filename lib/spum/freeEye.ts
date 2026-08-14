// The free eye layer — the escape hatch from SPUM's eye rig.
//
// A stock SPUM eye atlas is 1×3 pixels (`Back` = sclera, `Front` = iris) which
// the rig STAMPS TWICE, on P_LEye and P_REye, at bone positions the prefab
// hardcodes 5 source px apart. You draw a 1px sliver and the rig decides where
// both eyes go — no control over spacing, height, size, or asymmetry.
//
// An eye atlas carrying a `Free` region opts out: that region renders ONCE, as
// a single sprite, and the two-bone stamping is suppressed. The author draws
// both eyes where they want them and places the pair by hand.
//
// This module is the shared contract between the two ends of that deal — the
// Part Studio (which authors the sheet) and SpumCharacter (which detects the
// region and renders it) — so the magic strings can't drift apart.

export const FREE_EYE_REGION = "Free";
// Optional author-drawn blink art. Absent → the rig falls back to the stock
// Eye_Close eyelash, single-stamped to match.
export const FREE_EYE_CLOSE_REGION = "FreeClose";

export type FreeEyeRegion = {
  x: number;
  y: number;
  width: number;
  height: number;
  pivot: { x: number; y: number };
};

export type FreeEyeSheet = {
  width: number;
  height: number;
  regions: Record<string, FreeEyeRegion>;
};

// Well under the save endpoint's 512 cap; past this you're not drawing pixel
// art any more.
export const FREE_EYE_MAX_DIM = 160;

// Canvas presets. Eyes do NOT have to respect the skull: nothing in the
// renderer clips a slice to the head or the body (slices are absolutely-
// positioned siblings of the bone tree), so a band wider and taller than the
// character simply draws past it — only the scene viewport crops. Bulging
// Don Hertzfeldt eyes are a supported case, not a hack.
export const FREE_EYE_PRESETS = [
  // The head is 17×15, so this is roughly face-sized — brow to cheek.
  { key: "head", label: "Head", width: 18, band: 10 },
  { key: "big", label: "Big", width: 32, band: 22 },
  { key: "huge", label: "Huge", width: 48, band: 36 },
  { key: "saucer", label: "Saucer", width: 72, band: 56 },
] as const;

export function clampFreeEyeDim(v: number): number {
  if (!Number.isFinite(v)) return 1;
  return Math.max(1, Math.min(FREE_EYE_MAX_DIM, Math.round(v)));
}

// Two stacked bands of equal size: open eyes on top, blink below.
export function makeFreeEyeSheet(width: number, band: number): FreeEyeSheet {
  const w = clampFreeEyeDim(width);
  const b = clampFreeEyeDim(band);
  return {
    width: w,
    height: b * 2,
    regions: {
      [FREE_EYE_REGION]: { x: 0, y: 0, width: w, height: b, pivot: { x: 0.5, y: 0.5 } },
      [FREE_EYE_CLOSE_REGION]: { x: 0, y: b, width: w, height: b, pivot: { x: 0.5, y: 0.5 } },
    },
  };
}

export function isFreeEyeSheet(s: FreeEyeSheet | null | undefined): boolean {
  return !!s && FREE_EYE_REGION in s.regions;
}

// A region's anchor point in sheet coords — the spot the rig hangs the sprite
// from. `pivot.y` is measured from the region's BOTTOM (Unity convention),
// hence the inversion.
function anchorOf(r: FreeEyeRegion): { x: number; y: number } {
  return {
    x: r.x + r.pivot.x * r.width,
    y: r.y + (1 - r.pivot.y) * r.height,
  };
}

// Carry a free eye canvas's art onto a differently-sized one, aligning each
// band by its ANCHOR rather than its corner — so growing the canvas to make
// room for bigger eyes leaves the drawing exactly where it sat on the
// character. Art that falls outside a shrunken band is clipped, never wrapped
// into the neighbouring band. Transparent source pixels are skipped so bands
// can't erase each other.
export function remapFreeEyeArt(
  prev: FreeEyeSheet,
  prevPixels: Uint8ClampedArray,
  next: FreeEyeSheet,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(next.width * next.height * 4);
  for (const name of [FREE_EYE_REGION, FREE_EYE_CLOSE_REGION]) {
    const ro = prev.regions[name];
    const rn = next.regions[name];
    if (!ro || !rn) continue;
    const ao = anchorOf(ro);
    const an = anchorOf(rn);
    const dx = Math.round(an.x - ao.x);
    const dy = Math.round(an.y - ao.y);
    for (let y = ro.y; y < ro.y + ro.height; y++) {
      for (let x = ro.x; x < ro.x + ro.width; x++) {
        const si = (y * prev.width + x) * 4;
        if (prevPixels[si + 3] === 0) continue;
        const tx = x + dx;
        const ty = y + dy;
        if (tx < rn.x || ty < rn.y || tx >= rn.x + rn.width || ty >= rn.y + rn.height) {
          continue;
        }
        const di = (ty * next.width + tx) * 4;
        out[di] = prevPixels[si];
        out[di + 1] = prevPixels[si + 1];
        out[di + 2] = prevPixels[si + 2];
        out[di + 3] = prevPixels[si + 3];
      }
    }
  }
  return out;
}
