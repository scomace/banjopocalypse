// AA character pipeline — hat-hair: what a character's hair does under a hat.
//
// HISTORY. This replaces the always-on hair mask (the old `mask.ts`), which
// clipped hair to the helmet's bottom edge with a renderer `clip-path` and was
// never quite right on real characters. Two things changed:
//
//   1. The behaviour is now a PER-CHARACTER CHOICE (`AaCharacter.hatHair`,
//      picked in the Characters tab) rather than a global rule. "The hat is
//      attached to the hair as drawn" is a legitimate look, and so are several
//      different cuts — see `AA_HAT_HAIR_MODES` in types.ts.
//   2. It is applied by REWRITING THE HAIR ATLAS'S PIXELS (hatHairAtlas.ts),
//      not by clipping the slice. A clip can only remove; the spill modes ADD
//      pixels (a hair-coloured puff hugging the hat, its outline, a brim
//      shadow), so the clip-path seam died with the old strategy. The SPUM
//      renderer is back to knowing nothing about any of this.
//
// THE GEOMETRY is inherited from the old mask and is still per-column, in
// SOURCE PIXELS with up positive:
//
//   hair top     = (hairAnchor − helmetAnchor) + (1 − pivotY_hair)×height_hair
//   hem[j]       = (1 − pivotY_helmet)×height_helmet − bottom_helmet[j]
//   hem row[i]   = hair top − hem[j]     (row of the hair sprite the hat's
//                                         underside falls on in column i)
//
// where `bottom_helmet[j]` counts rows from the region's top to one past the
// column's lowest opaque pixel (0 = nothing drawn in that column). The cut is
// at the helmet's BOTTOM edge because the helmet sorts over hair (z 11/12 vs
// 6): everything above a column's hem is either behind opaque hat pixels or in
// a transparent notch (a jester prong's underside) that reads as outside the
// hat; everything below — brim, ears, neck — still shows.
//
// The hem row is kept UNCLAMPED (negative = the hem is above the hair's
// canvas) and FLOORED, not rounded: hair meets the hem from below, so the
// half-pixel error a fractional placement introduces must land on the OVERLAP
// side — hidden behind the hat — never as a visible strip of air.
//
// `pivot.y` is measured from the region's BOTTOM (Unity's convention), so the
// anchor sits `(1 − pivot.y) × height` below the region's top edge. Getting
// that backwards reads a canvas with 8px of headroom as having 8px below it.
//
// Columns are matched on x by pinning both sprites at their own pivot; a hair
// column straddles two helmet columns whenever the widths differ by an odd
// number, so each hair column takes the DEEPEST hem among the helmet columns
// it overlaps. Hi-res parts store regions and profiles in NATIVE px at
// `pixelDensity` per logical px; the math runs in logical px and converts the
// hem row back to hair-native px at the end.
//
// The character's per-slot placement dx/dy on hair and hat shift where the two
// sprites sit, so they fold into the anchor delta. Rotation and flip are NOT
// modelled — a tilted hat masks as if straight (the old mask ignored placement
// entirely; this is strictly closer).

import type { Skeleton, SpriteAtlas } from "@/lib/spum/types";

import { getPixel, setPixel, type Rgba } from "./pixels";
import { PX_PER_UNIT } from "./skeleton";
import type { AaHatHairMode, AaPlacement } from "./types";

export const HAIR_BONE = "Root/BodySet/P_Body/HeadSet/P_Head/P_Hair";
export const HELMET_BONE = "Root/BodySet/P_Body/HeadSet/P_Head/P_Helmet";

export const HAIR_REGION = "Hair";
export const HELMET_REGION = "Helmet";

// What the Characters tab calls each mode.
export const HAT_HAIR_MODE_LABEL: Record<AaHatHairMode, string> = {
  none: "attached — hair as drawn",
  tuckHat: "tucked (under hat only)",
  tuckHem: "tucked (hem, cut extends sideways)",
  tuckLine: "tucked (straight line)",
  spill: "spill around the hat",
  spillShadow: "spill + brim shadow",
  spillTall: "spill tall (2px) + shadow",
  spillWild: "spill wild (1–3px) + shadow",
  spillSlope: "spill sloped (hugs the hat) + shadow",
  squash: "squashed under the hat",
};

// The spill family, parameterised: puff height in LOGICAL px per column
// (`dist` = column distance to the nearest under-hat column, ≥ 1 beside the
// hat), and whether the brim shadow applies. `wild`'s hash is deterministic —
// same hair, same tuft — and steps in 2px-wide groups so it reads as chunks
// rather than per-column noise.
const SPILL: Partial<
  Record<AaHatHairMode, { height: (i: number, dist: number) => number; shadow: boolean }>
> = {
  spill: { height: () => 1, shadow: false },
  spillShadow: { height: () => 1, shadow: true },
  spillTall: { height: () => 2, shadow: true },
  spillWild: {
    height: (i) => 1 + ((((i >> 1) + 1) * 2654435761) >>> 16) % 3,
    shadow: true,
  },
  spillSlope: {
    height: (i, dist) => Math.max(1, Math.min(3, 4 - dist)),
    shadow: true,
  },
};

export type HatHairPlacement = {
  hair?: AaPlacement;
  helmet?: AaPlacement;
};

// The per-column decisions every mode's pixel pass works from. `hem[i]` is the
// hair-sprite row (NATIVE px, unclamped — negative means above the canvas) the
// hat's underside falls on in column i, or `null` where no hem applies (a
// `tuckHat` column the hat doesn't cover). `underHat[i]` is whether the column
// sits under any opaque helmet column — hair GROWS to the hem only there, the
// spill puff goes only where it's false, and the brim shadow only where it's
// true.
export type HatHairPlan = {
  hem: (number | null)[];
  underHat: boolean[];
};

function bonePos(skeleton: Skeleton | null, path: string): { x: number; y: number } {
  return skeleton?.bones.find((b) => b.path === path)?.defaultPos ?? { x: 0, y: 0 };
}

/**
 * Per-column plan for a mode, or `null` when there is nothing to do (mode
 * "none", a missing sprite, or an empty helmet). Takes the ATLASES BEING
 * RENDERED rather than part names so an in-progress editor canvas is treated
 * as drawn, and `bottomProfile` from whatever helmet art is on screen
 * (`AaPart.contentBottomProfile`, or measured off the PNG for parts saved
 * before profiles existed).
 */
export function hatHairPlan(
  mode: AaHatHairMode,
  hairAtlas: SpriteAtlas | undefined,
  helmetAtlas: SpriteAtlas | undefined,
  bottomProfile: number[] | undefined,
  skeleton: Skeleton | null,
  placement?: HatHairPlacement,
): HatHairPlan | null {
  if (mode === "none") return null;
  if (!hairAtlas || !helmetAtlas || !bottomProfile || bottomProfile.length === 0) return null;

  const hairRegion = hairAtlas.regions[HAIR_REGION];
  const helmetRegion = helmetAtlas.regions[HELMET_REGION];
  if (!hairRegion || !helmetRegion) return null;
  if (!bottomProfile.some((v) => v > 0)) return null;

  const hairBone = bonePos(skeleton, HAIR_BONE);
  const helmetBone = bonePos(skeleton, HELMET_BONE);
  // Placement dx/dy are already in logical source px (+dx right, +dy up), the
  // same space the bone offsets convert into.
  const dy =
    (hairBone.y - helmetBone.y) * PX_PER_UNIT +
    (placement?.hair?.dy ?? 0) -
    (placement?.helmet?.dy ?? 0);
  const dx =
    (hairBone.x - helmetBone.x) * PX_PER_UNIT +
    (placement?.hair?.dx ?? 0) -
    (placement?.helmet?.dx ?? 0);

  const hairDen = hairAtlas.pixelDensity ?? 1;
  const helmDen = helmetAtlas.pixelDensity ?? 1;

  const hairTop = dy + ((1 - hairRegion.pivot.y) * hairRegion.height) / hairDen;
  const helmetRegionTop = ((1 - helmetRegion.pivot.y) * helmetRegion.height) / helmDen;

  // The hem each helmet column presents, by mode:
  //   tuckHat   the raw profile — an uncovered column has no hem at all
  //   tuckLine  every column (and everything past the hat's sides, via the
  //             clamp below) uses the hat's single lowest opaque pixel
  //   others    the raw profile with empty columns filled from the nearest
  //             opaque one (ties keep the deeper hem), so the hem continues
  //             sideways past the hat's edges at the edge's own height
  const strict = mode === "tuckHat";
  let effective = bottomProfile;
  if (mode === "tuckLine") {
    effective = new Array<number>(bottomProfile.length).fill(Math.max(...bottomProfile));
  } else if (!strict) {
    effective = bottomProfile.map((v, j) => {
      if (v > 0) return v;
      for (let d = 1; d < bottomProfile.length; d++) {
        const left = bottomProfile[j - d] ?? 0;
        const right = bottomProfile[j + d] ?? 0;
        if (left > 0 || right > 0) return Math.max(left, right);
      }
      return 0;
    });
  }

  // Hair source column i → its logical x from the hair anchor → the helmet
  // source column under that logical x, spanning `helmDen/hairDen` columns.
  const helmetColAt = (i: number) =>
    ((i - hairRegion.pivot.x * hairRegion.width) / hairDen + dx) * helmDen +
    helmetRegion.pivot.x * helmetRegion.width;
  const span = helmDen / hairDen;

  let any = false;
  const hem = new Array<number | null>(hairRegion.width).fill(null);
  const underHat = new Array<boolean>(hairRegion.width).fill(false);
  for (let i = 0; i < hairRegion.width; i++) {
    const start = helmetColAt(i);
    const lo = Math.floor(start);
    const hi = Math.ceil(start + span) - 1;
    for (let j = lo; j <= hi; j++) {
      // Under-hat is judged against the RAW profile at the real column — the
      // fills and clamps above are about where the HEM falls, not about what
      // the hat covers.
      if (j >= 0 && j < bottomProfile.length && bottomProfile[j] > 0) underHat[i] = true;
      // Strict mode leaves anything the hat doesn't cover alone; the extended
      // modes clamp to the nearest real column so the hem carries on sideways.
      const k = strict ? j : Math.max(0, Math.min(effective.length - 1, j));
      if (k < 0 || k >= effective.length) continue;
      if (effective[k] <= 0) continue;
      const hemY = helmetRegionTop - effective[k] / helmDen;
      const row = Math.floor((hairTop - hemY) * hairDen);
      hem[i] = hem[i] === null ? row : Math.max(hem[i] as number, row);
    }
    if (hem[i] !== null) any = true;
  }
  return any ? { hem, underHat } : null;
}

/** The deepest cut in the plan — what the editor reports as "cuts Npx". */
export function planDepth(plan: HatHairPlan | null): number {
  return plan ? plan.hem.reduce<number>((a, b) => Math.max(a, b ?? 0), 0) : 0;
}

// --- pixel application --------------------------------------------------

type Region = { x: number; y: number; width: number; height: number };

const CLEAR: Rgba = [0, 0, 0, 0];

function alphaAt(
  buf: Uint8ClampedArray,
  width: number,
  region: Region,
  x: number,
  y: number,
): number {
  return buf[((region.y + y) * width + region.x + x) * 4 + 3];
}

function read(
  buf: Uint8ClampedArray,
  width: number,
  region: Region,
  x: number,
  y: number,
): Rgba {
  return getPixel(buf, width, region.x + x, region.y + y);
}

function write(
  buf: Uint8ClampedArray,
  width: number,
  region: Region,
  x: number,
  y: number,
  px: Rgba,
): void {
  setPixel(buf, width, region.x + x, region.y + y, px);
}

// The hair's own line colour — its darkest opaque pixel — so the spill outline
// matches whatever the art (or a recolour, which spares outlines) actually
// uses instead of assuming pure black.
function darkestColor(buf: Uint8ClampedArray, width: number, region: Region): Rgba {
  let best: Rgba = [0, 0, 0, 255];
  let bestLum = Infinity;
  for (let y = 0; y < region.height; y++) {
    for (let x = 0; x < region.width; x++) {
      const [r, g, b, a] = read(buf, width, region, x, y);
      if (a === 0) continue;
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      if (lum < bestLum) {
        bestLum = lum;
        best = [r, g, b, 255];
      }
    }
  }
  return best;
}

/**
 * Apply a plan to the hair region's pixels IN PLACE. Pure — buffers in,
 * buffers out — so every mode is unit-testable without a canvas. Returns
 * whether anything changed, which the baker uses to hand back the original
 * atlas untouched (identity matters to callers, same contract as
 * `recoloredAtlas`).
 *
 * `pixelDensity` scales the 1px spill/outline/shadow features so hi-res hair
 * gets a visually 1-LOGICAL-px treatment rather than a sub-pixel one.
 */
export function applyHatHair(
  buf: Uint8ClampedArray,
  atlasWidth: number,
  region: Region,
  plan: HatHairPlan,
  mode: AaHatHairMode,
  pixelDensity = 1,
): boolean {
  if (mode === "none") return false;
  const { hem, underHat } = plan;
  const w = region.width;
  const h = region.height;
  const d = Math.max(1, Math.round(pixelDensity));
  let changed = false;

  // A column's drawn extent: first opaque row (−1 = empty) and one past the
  // last.
  const extent = (i: number): { origTop: number; bottom: number } => {
    let origTop = -1;
    let bottom = 0;
    for (let y = 0; y < h; y++) {
      if (alphaAt(buf, atlasWidth, region, i, y) > 0) {
        if (origTop < 0) origTop = y;
        bottom = y + 1;
      }
    }
    return { origTop, bottom };
  };

  // Nearest-neighbour resample of a column's art from [origTop, bottom) onto
  // [newTop, bottom) — squash when newTop > origTop, stretch when newTop <
  // origTop. Via a copy: the two ranges overlap, so sampling in place would
  // read rows already overwritten.
  const resample = (i: number, newTop: number, origTop: number, bottom: number) => {
    const column: Rgba[] = [];
    for (let y = 0; y < h; y++) column.push(read(buf, atlasWidth, region, i, y));
    for (let y = Math.min(newTop, origTop); y < bottom; y++) {
      write(buf, atlasWidth, region, i, y, CLEAR);
    }
    for (let y = newTop; y < bottom; y++) {
      const src =
        origTop + Math.floor(((y - newTop) * (bottom - origTop)) / (bottom - newTop));
      write(buf, atlasWidth, region, i, y, column[Math.min(src, bottom - 1)]);
    }
  };

  // GROW, every mode: hair under the hat that stops short of the hem is
  // stretched up to meet it, so a hat nudged upward never opens a strip of
  // air. Only under the hat — growing the extended hem's side columns would
  // raise towers of hair BESIDE a lifted hat. A hem above the canvas grows to
  // row 0, the most the sprite can offer.
  for (let i = 0; i < w; i++) {
    const hm = hem[i];
    if (hm === null || !underHat[i]) continue;
    const newTop = Math.max(0, hm);
    const { origTop, bottom } = extent(i);
    if (origTop < 0 || newTop >= origTop) continue;
    resample(i, newTop, origTop, bottom);
    changed = true;
  }

  if (mode === "squash") {
    // Compress each cut column into the band below its hem instead of erasing.
    for (let i = 0; i < w; i++) {
      const hm = hem[i];
      if (hm === null) continue;
      const cut = Math.min(h, Math.max(0, hm));
      if (cut <= 0) continue;
      const { origTop, bottom } = extent(i);
      if (origTop < 0 || origTop >= cut) continue;
      resample(i, Math.min(cut, bottom), origTop, bottom);
      changed = true;
    }
    return changed;
  }

  // Every other mode cuts. `cutSomething[i]` records whether the column
  // actually LOST opaque pixels — the spill puff marks where hair met the
  // hem, not where empty canvas did.
  const cutSomething = new Array<boolean>(w).fill(false);
  for (let i = 0; i < w; i++) {
    const hm = hem[i];
    if (hm === null) continue;
    const cut = Math.min(h, Math.max(0, hm));
    for (let y = 0; y < cut; y++) {
      if (alphaAt(buf, atlasWidth, region, i, y) > 0) {
        write(buf, atlasWidth, region, i, y, CLEAR);
        cutSomething[i] = true;
        changed = true;
      }
    }
  }
  const spill = SPILL[mode];
  if (!spill) return changed; // the tuck modes end here

  // Column distance to the nearest under-hat column (∞ when the hat covers no
  // hair column at all) — what `spillSlope` tapers by.
  const dist = new Array<number>(w).fill(Infinity);
  for (let i = 0; i < w; i++) if (underHat[i]) dist[i] = 0;
  for (let i = 1; i < w; i++) dist[i] = Math.min(dist[i], dist[i - 1] + 1);
  for (let i = w - 2; i >= 0; i--) dist[i] = Math.min(dist[i], dist[i + 1] + 1);

  // Spill: where cut hair pokes past the hat's sides, raise the cut edge back
  // up in the hair's own colour — hair squeezed out around the brim.
  const outline = darkestColor(buf, atlasWidth, region);
  const isOutlineColor = (px: Rgba) =>
    px[0] === outline[0] && px[1] === outline[1] && px[2] === outline[2];
  const puff: { x: number; y: number }[] = [];
  const painted = new Set<number>();
  const keyOf = (x: number, y: number) => y * w + x;
  for (let i = 0; i < w; i++) {
    if (underHat[i] || !cutSomething[i]) continue;
    const hm = hem[i];
    if (hm === null) continue;
    const cut = Math.min(h, Math.max(0, hm));
    if (cut >= h || alphaAt(buf, atlasWidth, region, i, cut) === 0) continue;
    // The puff paints in the hair's FILL colour: first surviving pixel below
    // the hem that isn't the line colour, so it reads as hair rather than as
    // more outline. Falls back to the edge pixel when the column is all line.
    let color = read(buf, atlasWidth, region, i, cut);
    for (let y = cut; y < Math.min(h, cut + 4 * d); y++) {
      const px = read(buf, atlasWidth, region, i, y);
      if (px[3] > 0 && !isOutlineColor(px)) {
        color = px;
        break;
      }
    }
    const rows = spill.height(i, dist[i]) * d;
    for (let k = 1; k <= rows; k++) {
      const y = cut - k;
      if (y < 0) break;
      write(buf, atlasWidth, region, i, y, [color[0], color[1], color[2], 255]);
      puff.push({ x: i, y });
      painted.add(keyOf(i, y));
      changed = true;
    }
  }

  // ...and wrap the puff in the line colour, one px up and to the sides (a
  // `d`-thick dilation on hi-res hair). Never down — the puff sits on hair —
  // and never over an existing pixel, so the hat's neighbouring art and the
  // hair itself stay untouched.
  let frontier = puff;
  for (let pass = 0; pass < d && frontier.length > 0; pass++) {
    const next: { x: number; y: number }[] = [];
    for (const { x, y } of frontier) {
      const neighbours = [
        { x, y: y - 1 },
        { x: x - 1, y },
        { x: x + 1, y },
      ];
      for (const n of neighbours) {
        if (n.x < 0 || n.x >= w || n.y < 0 || n.y >= h) continue;
        if (painted.has(keyOf(n.x, n.y))) continue;
        if (alphaAt(buf, atlasWidth, region, n.x, n.y) > 0) continue;
        write(buf, atlasWidth, region, n.x, n.y, outline);
        painted.add(keyOf(n.x, n.y));
        next.push(n);
        changed = true;
      }
    }
    frontier = next;
  }

  if (!spill.shadow) return changed;

  // Brim shadow: the first `d` hair rows directly under the hat's hem darken,
  // only in columns where the hem actually meets hair. After the grow pass
  // that's any under-hat column whose hem is on the canvas — grown hair
  // touches the hem by construction.
  for (let i = 0; i < w; i++) {
    if (!underHat[i]) continue;
    const hm = hem[i];
    if (hm === null) continue;
    const cut = Math.min(h, Math.max(0, hm));
    let shaded = 0;
    for (let y = cut; y < h && shaded < d; y++) {
      const px = read(buf, atlasWidth, region, i, y);
      if (px[3] === 0) break; // a gap below the hem is air, not hair
      write(buf, atlasWidth, region, i, y, [
        Math.round(px[0] * 0.6),
        Math.round(px[1] * 0.6),
        Math.round(px[2] * 0.6),
        px[3],
      ]);
      shaded++;
      changed = true;
    }
  }
  return changed;
}
