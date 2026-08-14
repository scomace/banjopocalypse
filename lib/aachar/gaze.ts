// AA character pipeline — pupils: per-eye nudge + gaze (Phase 12).
//
// The eye band is ONE drawing containing both eyes, so per-eye behaviour
// needs to know which pixels belong to which eye and which of those are
// pupil. `AaPart.eyes` supplies that (two boxes + a pupil pixel each,
// authored on the open band, band-relative — see types.ts); everything else
// here is derived from the art at render time:
//
//   pupil  = the connected exact-colour region containing the clicked pixel,
//            clipped to the box
//   whites = opaque box pixels that are neither pupil nor outline-dark
//            (OKLab lightness ≤ DEFAULT_PROTECT_LIGHTNESS — the same
//            constant the recolour outline guard trusts)
//
// A gaze direction resolves per eye to THE FURTHEST OFFSET THAT KEEPS EVERY
// PUPIL PIXEL ON whites-or-vacated-pupil, inside the box. That derived clamp
// is the whole design: range comes from the art (big eyes wander, tiny eyes
// barely move) and the pupil can never leave the eyeball.
//
// This module is pure buffer maths — the browser half (decode the atlas,
// run the pass, re-encode a data URL, cache) lives in `gazeAtlas.ts`.

import type { PackedRegion } from "./geometry";
import { getPixel, setPixel, type Rgba } from "./pixels";
import { DEFAULT_PROTECT_LIGHTNESS, rgbToOklab } from "./recolor";
import type {
  AaEyeBox,
  AaEyeNudge,
  AaEyeSpec,
  AaGaze,
  AaGazeDirection,
  AaGazeSide,
  AaPartEyes,
} from "./types";

export type Point = { x: number; y: number };

// Sheet coordinates: +x = screen right, +y = screen DOWN. The eye band is
// drawn exactly as displayed, so "up-left" on screen is (-1, -1) here.
export const GAZE_VECTORS: Record<AaGazeDirection, Point> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  "up-left": { x: -1, y: -1 },
  "up-right": { x: 1, y: -1 },
  "down-left": { x: -1, y: 1 },
  "down-right": { x: 1, y: 1 },
};

const key = (x: number, y: number) => y * 100000 + x;

function sameColor(a: Rgba, b: Rgba): boolean {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];
}

/** The box in absolute sheet coords, clipped to its band. */
function absBox(band: PackedRegion, box: AaEyeBox): PackedRegion {
  const x = band.x + box.x;
  const y = band.y + box.y;
  const right = Math.min(x + box.width, band.x + band.width);
  const bottom = Math.min(y + box.height, band.y + band.height);
  const cx = Math.max(x, band.x);
  const cy = Math.max(y, band.y);
  return { x: cx, y: cy, width: Math.max(0, right - cx), height: Math.max(0, bottom - cy) };
}

function inRect(r: PackedRegion, x: number, y: number): boolean {
  return x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height;
}

/** The pupil: the connected (4-way) exact-colour region containing the
 *  marked pixel, clipped to the box. Empty when the mark sits on transparent
 *  — a stale mark after the art was redrawn — which downstream treats as
 *  "this eye has no gaze", never an error. Absolute sheet coords. */
export function pupilPixels(
  buf: Uint8ClampedArray,
  width: number,
  band: PackedRegion,
  spec: AaEyeSpec,
): Point[] {
  const box = absBox(band, spec.box);
  const sx = band.x + spec.pupil.x;
  const sy = band.y + spec.pupil.y;
  if (!inRect(box, sx, sy)) return [];
  const target = getPixel(buf, width, sx, sy);
  if (target[3] === 0) return [];
  const seen = new Set<number>([key(sx, sy)]);
  const out: Point[] = [];
  const stack: Point[] = [{ x: sx, y: sy }];
  while (stack.length > 0) {
    const p = stack.pop() as Point;
    out.push(p);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = p.x + dx;
      const ny = p.y + dy;
      if (!inRect(box, nx, ny) || seen.has(key(nx, ny))) continue;
      if (!sameColor(getPixel(buf, width, nx, ny), target)) continue;
      seen.add(key(nx, ny));
      stack.push({ x: nx, y: ny });
    }
  }
  return out;
}

/** The whites: opaque box pixels that are neither pupil nor outline-dark.
 *  Absolute sheet coords. */
export function whitesPixels(
  buf: Uint8ClampedArray,
  width: number,
  band: PackedRegion,
  spec: AaEyeSpec,
  pupil: Point[],
): Point[] {
  const box = absBox(band, spec.box);
  const pupilSet = new Set(pupil.map((p) => key(p.x, p.y)));
  const out: Point[] = [];
  for (let y = box.y; y < box.y + box.height; y++) {
    for (let x = box.x; x < box.x + box.width; x++) {
      if (pupilSet.has(key(x, y))) continue;
      const [r, g, b, a] = getPixel(buf, width, x, y);
      if (a === 0) continue;
      if (rgbToOklab(r, g, b).L <= DEFAULT_PROTECT_LIGHTNESS) continue;
      out.push({ x, y });
    }
  }
  return out;
}

/** The furthest offset along `direction` that keeps EVERY pupil pixel on
 *  whites-or-vacated-pupil, backed off by `gap` steps (never below zero) so
 *  a pupil can keep a sliver of whites between itself and the edge. Zero when
 *  the eye can't move that way at all — which includes "no pupil
 *  marked/found" and "no whites". */
export function gazeOffset(
  direction: AaGazeDirection,
  pupil: Point[],
  whites: Point[],
  gap = 0,
): Point {
  if (pupil.length === 0 || whites.length === 0) return { x: 0, y: 0 };
  const allowed = new Set<number>();
  for (const p of pupil) allowed.add(key(p.x, p.y));
  for (const p of whites) allowed.add(key(p.x, p.y));
  const v = GAZE_VECTORS[direction];
  let best = 0;
  // The walk stops at the first invalid step; the cap is only a backstop and
  // sits past FREE_EYE_MAX_DIM, the largest any band (and so any box) can be.
  for (let k = 1; k <= 256; k++) {
    const fits = pupil.every((p) => allowed.has(key(p.x + v.x * k, p.y + v.y * k)));
    if (!fits) break;
    best = k;
  }
  best = Math.max(0, best - Math.max(0, Math.round(gap)));
  // `|| 0` launders the -0 a zero throw leaves on negative vectors.
  return { x: v.x * best || 0, y: v.y * best || 0 };
}

/** A manual target offset (SHEET coords), clamped the same way a direction
 *  is: walk the straight line toward the target and keep the last step where
 *  EVERY pupil pixel sits on whites-or-vacated-pupil. Stops at the first
 *  blocked step — a pupil cannot jump a gap it could not slide through. */
export function clampGazeOffset(
  target: Point,
  pupil: Point[],
  whites: Point[],
): Point {
  if (pupil.length === 0 || whites.length === 0) return { x: 0, y: 0 };
  const allowed = new Set<number>();
  for (const p of pupil) allowed.add(key(p.x, p.y));
  for (const p of whites) allowed.add(key(p.x, p.y));
  const steps = Math.max(Math.abs(target.x), Math.abs(target.y));
  let best = { x: 0, y: 0 };
  for (let k = 1; k <= steps; k++) {
    const cand = {
      x: Math.round((target.x * k) / steps),
      y: Math.round((target.y * k) / steps),
    };
    const fits = pupil.every((p) => allowed.has(key(p.x + cand.x, p.y + cand.y)));
    if (!fits) break;
    best = cand;
  }
  return best;
}

/** How far this eye can look in every direction — the UI's range readout. */
export function gazeRange(
  buf: Uint8ClampedArray,
  width: number,
  band: PackedRegion,
  spec: AaEyeSpec,
): Record<AaGazeDirection, number> {
  const pupil = pupilPixels(buf, width, band, spec);
  const whites = whitesPixels(buf, width, band, spec, pupil);
  const out = {} as Record<AaGazeDirection, number>;
  for (const dir of Object.keys(GAZE_VECTORS) as AaGazeDirection[]) {
    const off = gazeOffset(dir, pupil, whites);
    out[dir] = Math.max(Math.abs(off.x), Math.abs(off.y));
  }
  return out;
}

/** An eye spec displaced by a nudge, in band-relative coords. Nudge is the
 *  placement convention (+dy = up), sheet y grows down — hence the flip. */
function nudgedSpec(spec: AaEyeSpec, nudge: AaEyeNudge | undefined): AaEyeSpec {
  const dx = Math.round(nudge?.dx ?? 0);
  const dy = -Math.round(nudge?.dy ?? 0);
  if (dx === 0 && dy === 0) return spec;
  return {
    box: { ...spec.box, x: spec.box.x + dx, y: spec.box.y + dy },
    pupil: { x: spec.pupil.x + dx, y: spec.pupil.y + dy },
  };
}

/** One side's gaze out of an `AaGaze` — a plain direction speaks for both
 *  eyes; a pair may leave a side unset (as drawn). A manual offset that
 *  moves nothing normalises to unset, so identity checks stay honest. */
export function gazeFor(
  gaze: AaGaze | undefined,
  side: "left" | "right",
): AaGazeSide | undefined {
  if (!gaze) return undefined;
  const g = typeof gaze === "string" ? gaze : gaze[side];
  if (g && typeof g !== "string" && (g.dx ?? 0) === 0 && (g.dy ?? 0) === 0) {
    return undefined;
  }
  return g;
}

/** True when the gaze moves nothing — absent, or a pair with both sides
 *  unset (a hand-edited manifest can carry one; the editor deletes it). A
 *  gap without a direction is still identity. */
export function isIdentityGaze(gaze: AaGaze | undefined): boolean {
  return !gazeFor(gaze, "left") && !gazeFor(gaze, "right");
}

/** The whites sliver one eye's gaze keeps against the edge — only the pair
 *  form carries one (a number speaks for both eyes, the object form per
 *  side); a plain direction is the classic flush clamp. */
export function gazeGapFor(
  gaze: AaGaze | undefined,
  side: "left" | "right",
): number {
  if (!gaze || typeof gaze === "string") return 0;
  const g = gaze.gap;
  const raw = typeof g === "number" ? g : g?.[side] ?? 0;
  return Math.max(0, Math.round(raw));
}

export function isIdentityEyeNudge(
  nudge: { left?: AaEyeNudge; right?: AaEyeNudge } | undefined,
): boolean {
  const zero = (n: AaEyeNudge | undefined) => !n || ((n.dx ?? 0) === 0 && (n.dy ?? 0) === 0);
  return zero(nudge?.left) && zero(nudge?.right);
}

/** Move one eye's whole box content by its nudge, inside one band. The cut
 *  is a wholesale lift-erase-stamp: pixels shifted past the band's edge are
 *  dropped, pixels the stamp lands on are overwritten. Left is processed
 *  before right by the caller, so an extreme collision resolves
 *  deterministically (right wins). */
function nudgeEyeInBand(
  buf: Uint8ClampedArray,
  width: number,
  band: PackedRegion,
  spec: AaEyeSpec,
  nudge: AaEyeNudge,
): void {
  const dx = Math.round(nudge.dx ?? 0);
  const dy = -Math.round(nudge.dy ?? 0);
  if (dx === 0 && dy === 0) return;
  const box = absBox(band, spec.box);
  const lifted: { p: Point; c: Rgba }[] = [];
  for (let y = box.y; y < box.y + box.height; y++) {
    for (let x = box.x; x < box.x + box.width; x++) {
      lifted.push({ p: { x, y }, c: getPixel(buf, width, x, y) });
      setPixel(buf, width, x, y, [0, 0, 0, 0]);
    }
  }
  for (const { p, c } of lifted) {
    const tx = p.x + dx;
    const ty = p.y + dy;
    if (!inRect(band, tx, ty)) continue;
    setPixel(buf, width, tx, ty, c);
  }
}

/** Move one eye's pupil — along a gaze direction (furthest the whites allow,
 *  minus the gap) or toward a manual offset (exact target, clamped the same
 *  way) — inside one band. Vacated pupil pixels are filled with the NEAREST
 *  whites pixel's colour — right for flat and lightly-shaded scleras — then
 *  the pupil is re-stamped at the clamped offset. A zero clamp (or no pupil
 *  found) leaves the eye alone. */
function gazeEyeInBand(
  buf: Uint8ClampedArray,
  width: number,
  band: PackedRegion,
  spec: AaEyeSpec,
  gazeSide: AaGazeSide,
  gap: number,
): void {
  const pupil = pupilPixels(buf, width, band, spec);
  if (pupil.length === 0) return;
  const whites = whitesPixels(buf, width, band, spec, pupil);
  // Manual offsets are placement convention (+dy = up), sheet y grows down.
  const off =
    typeof gazeSide === "string"
      ? gazeOffset(gazeSide, pupil, whites, gap)
      : clampGazeOffset(
          {
            x: Math.round(gazeSide.dx ?? 0),
            y: -Math.round(gazeSide.dy ?? 0),
          },
          pupil,
          whites,
        );
  if (off.x === 0 && off.y === 0) return;
  // Colours are read before anything is written: pupil colour per pixel, and
  // each vacated pixel's fill from its nearest whites neighbour.
  const stamps = pupil.map((p) => ({
    x: p.x + off.x,
    y: p.y + off.y,
    c: getPixel(buf, width, p.x, p.y),
  }));
  const fills = pupil.map((p) => {
    let bestD = Infinity;
    let c: Rgba = [0, 0, 0, 0];
    for (const w of whites) {
      const d = (w.x - p.x) * (w.x - p.x) + (w.y - p.y) * (w.y - p.y);
      if (d < bestD) {
        bestD = d;
        c = getPixel(buf, width, w.x, w.y);
      }
    }
    return { x: p.x, y: p.y, c };
  });
  for (const f of fills) setPixel(buf, width, f.x, f.y, f.c);
  for (const s of stamps) setPixel(buf, width, s.x, s.y, s.c);
}

/**
 * The whole Phase-12 pixel pass over an eye sheet, returning a NEW buffer:
 *
 *   1. per-eye NUDGE, applied in EVERY band (the eye should sit where the
 *      character wears it when it blinks too — bands share box coordinates
 *      by construction);
 *   2. GAZE, applied in the OPEN band only (other bands' pupils are
 *      unmarked), inside each eye's nudged box.
 *
 * Runs BEFORE the eye-state band swap in the pipeline: this rewrites pixels,
 * the swap then repoints rects at whichever band should show.
 */
export function applyEyeAdjust(
  src: Uint8ClampedArray,
  width: number,
  openBand: PackedRegion,
  otherBands: PackedRegion[],
  eyes: AaPartEyes,
  nudge: { left?: AaEyeNudge; right?: AaEyeNudge } | undefined,
  gaze: AaGaze | undefined,
): Uint8ClampedArray {
  const buf = new Uint8ClampedArray(src);
  for (const band of [openBand, ...otherBands]) {
    for (const side of ["left", "right"] as const) {
      const n = nudge?.[side];
      if (n && ((n.dx ?? 0) !== 0 || (n.dy ?? 0) !== 0)) {
        nudgeEyeInBand(buf, width, band, eyes[side], n);
      }
    }
  }
  for (const side of ["left", "right"] as const) {
    const g = gazeFor(gaze, side);
    if (!g) continue;
    gazeEyeInBand(
      buf,
      width,
      openBand,
      nudgedSpec(eyes[side], nudge?.[side]),
      g,
      gazeGapFor(gaze, side),
    );
  }
  return buf;
}

/** Suggested eye boxes: connected components (4-way) over the band's opaque
 *  pixels; the two LARGEST become the boxes, leftmost = left. Null when the
 *  band doesn't separate into two blobs (glasses, a cyclops, connected art)
 *  — the author falls back to marquee selection. Band-relative, ready to
 *  store. Pupils still need their clicks: a blob says where an eye is, not
 *  where it looks. */
export function detectEyeBoxes(
  buf: Uint8ClampedArray,
  width: number,
  band: PackedRegion,
): { left: AaEyeBox; right: AaEyeBox } | null {
  const seen = new Set<number>();
  const blobs: Point[][] = [];
  for (let y = band.y; y < band.y + band.height; y++) {
    for (let x = band.x; x < band.x + band.width; x++) {
      if (seen.has(key(x, y)) || getPixel(buf, width, x, y)[3] === 0) continue;
      const blob: Point[] = [];
      const stack: Point[] = [{ x, y }];
      seen.add(key(x, y));
      while (stack.length > 0) {
        const p = stack.pop() as Point;
        blob.push(p);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const nx = p.x + dx;
          const ny = p.y + dy;
          if (!inRect(band, nx, ny) || seen.has(key(nx, ny))) continue;
          if (getPixel(buf, width, nx, ny)[3] === 0) continue;
          seen.add(key(nx, ny));
          stack.push({ x: nx, y: ny });
        }
      }
      blobs.push(blob);
    }
  }
  if (blobs.length < 2) return null;
  blobs.sort((a, b) => b.length - a.length);
  const boxOf = (blob: Point[]): AaEyeBox => {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of blob) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    return {
      x: minX - band.x,
      y: minY - band.y,
      width: maxX - minX + 1,
      height: maxY - minY + 1,
    };
  };
  const [a, b] = [boxOf(blobs[0]), boxOf(blobs[1])];
  return a.x <= b.x ? { left: a, right: b } : { left: b, right: a };
}
