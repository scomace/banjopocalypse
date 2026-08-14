// AA character pipeline — pixel buffer operations for the body editor.
//
// The editor's working state is a flat RGBA `Uint8ClampedArray` sized to the
// sheet, which is what `CanvasRenderingContext2D.putImageData` wants and what
// undo snapshots copy. Everything here is pure and browser-free so it can be
// tested directly.
//
// REGION BOUNDS MATTER. The packer places regions edge-to-edge with no gutter
// (Body at x=0 and Arm_R at x=body.width share a boundary), so an unbounded
// flood fill would leak from the torso into the arm and quietly corrupt a
// neighbouring sprite. Every fill is clipped to the region it started in.

import type { PackedRegion, PackedSheet } from "./geometry";

export type Rgba = [number, number, number, number];

export function createBuffer(width: number, height: number): Uint8ClampedArray {
  return new Uint8ClampedArray(width * height * 4);
}

export function getPixel(
  buf: Uint8ClampedArray,
  width: number,
  x: number,
  y: number,
): Rgba {
  const i = (y * width + x) * 4;
  return [buf[i], buf[i + 1], buf[i + 2], buf[i + 3]];
}

export function setPixel(
  buf: Uint8ClampedArray,
  width: number,
  x: number,
  y: number,
  [r, g, b, a]: Rgba,
): void {
  const i = (y * width + x) * 4;
  buf[i] = r;
  buf[i + 1] = g;
  buf[i + 2] = b;
  buf[i + 3] = a;
}

export function rgbaEquals(a: Rgba, b: Rgba): boolean {
  // Fully transparent pixels compare equal regardless of their RGB, which is
  // what makes "fill the empty area" work on a canvas whose cleared pixels
  // may carry stale colour channels.
  if (a[3] === 0 && b[3] === 0) return true;
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];
}

export function hexToRgba(hex: string, alpha = 255): Rgba {
  const h = hex.replace("#", "");
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h;
  return [
    parseInt(full.slice(0, 2), 16) || 0,
    parseInt(full.slice(2, 4), 16) || 0,
    parseInt(full.slice(4, 6), 16) || 0,
    alpha,
  ];
}

export function rgbaToHex([r, g, b]: Rgba): string {
  const p = (n: number) => n.toString(16).padStart(2, "0");
  return `#${p(r)}${p(g)}${p(b)}`;
}

export function regionAt(sheet: PackedSheet, x: number, y: number): string | null {
  for (const [name, r] of Object.entries(sheet.regions)) {
    if (x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height) return name;
  }
  return null;
}

// Scanline-free flood fill, clipped to `bounds`. Small canvases (a 21×31 sheet
// is 651 px) make the simple stack version more than fast enough, and it keeps
// the bounds check in one place.
export function floodFill(
  buf: Uint8ClampedArray,
  width: number,
  startX: number,
  startY: number,
  color: Rgba,
  bounds: PackedRegion,
): number {
  const target = getPixel(buf, width, startX, startY);
  if (rgbaEquals(target, color)) return 0;

  const stack: [number, number][] = [[startX, startY]];
  const seen = new Set<number>();
  let filled = 0;

  while (stack.length > 0) {
    const [x, y] = stack.pop() as [number, number];
    if (
      x < bounds.x ||
      x >= bounds.x + bounds.width ||
      y < bounds.y ||
      y >= bounds.y + bounds.height
    ) {
      continue;
    }
    const key = y * width + x;
    if (seen.has(key)) continue;
    seen.add(key);
    if (!rgbaEquals(getPixel(buf, width, x, y), target)) continue;
    setPixel(buf, width, x, y, color);
    filled++;
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  return filled;
}

// The pivot's position within a region, in sheet pixel coordinates. `pivot.y`
// is measured from the region's BOTTOM (Unity's convention, which the renderer
// mirrors as `originY = (1 - pivotY) * height`), so it flips here.
export function pivotAnchor(
  region: PackedRegion,
  pivot: { x: number; y: number },
): { x: number; y: number } {
  return {
    x: region.x + pivot.x * region.width,
    y: region.y + (1 - pivot.y) * region.height,
  };
}

export type PivotMap = Record<string, { x: number; y: number }>;

const CENTRE = { x: 0.5, y: 0.5 };

// Re-pack migration (docs/aachar-plan.md I3). Geometry is expected to move
// repeatedly while the look is being explored; without this, every tweak means
// redrawing from scratch because the regions land at new rects and sizes.
//
// Each region's pixels are copied so its PIVOT stays put — the pivot is the
// point the renderer anchors to the bone, so aligning on it means a resized
// sprite grows or crops around the spot that matters instead of drifting.
// Pixels that fall outside the new rect are dropped; new area arrives
// transparent.
//
// `toPivots` defaults to `pivots` and only differs when the pivot ITSELF moves
// — the headroom control on a head-worn slot, which slides the anchor down its
// own canvas to free rows above it. Aligning anchor-to-anchor across that move
// is what keeps art pinned to the head it was drawn against, rather than
// sliding up the skull as the room appears.
export function migratePixels(
  src: Uint8ClampedArray,
  from: PackedSheet,
  to: PackedSheet,
  pivots: PivotMap = {},
  toPivots: PivotMap = pivots,
): Uint8ClampedArray {
  const out = createBuffer(to.width, to.height);
  for (const [name, dst] of Object.entries(to.regions)) {
    const s = from.regions[name];
    if (!s) continue;
    const sa = pivotAnchor(s, pivots[name] ?? CENTRE);
    const da = pivotAnchor(dst, toPivots[name] ?? CENTRE);
    // Round once, here, so a half-pixel pivot can't smear the copy.
    const dx = Math.round(da.x - sa.x);
    const dy = Math.round(da.y - sa.y);
    for (let y = s.y; y < s.y + s.height; y++) {
      for (let x = s.x; x < s.x + s.width; x++) {
        const tx = x + dx;
        const ty = y + dy;
        if (
          tx < dst.x ||
          tx >= dst.x + dst.width ||
          ty < dst.y ||
          ty >= dst.y + dst.height
        ) {
          continue;
        }
        setPixel(out, to.width, tx, ty, getPixel(src, from.width, x, y));
      }
    }
  }
  return out;
}

// --- selection ---------------------------------------------------------

// Normalise a drag into a rect, clipped to `bounds`. Returns null when the
// drag lands entirely outside — a click-off, which should clear the selection
// rather than create an empty one.
export function rectFromDrag(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  bounds: PackedRegion,
): PackedRegion | null {
  const left = Math.max(Math.min(x0, x1), bounds.x);
  const top = Math.max(Math.min(y0, y1), bounds.y);
  const right = Math.min(Math.max(x0, x1), bounds.x + bounds.width - 1);
  const bottom = Math.min(Math.max(y0, y1), bounds.y + bounds.height - 1);
  if (right < left || bottom < top) return null;
  return { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}

// Lift a rect's pixels out into their own buffer.
export function copyRect(
  buf: Uint8ClampedArray,
  width: number,
  rect: PackedRegion,
): Uint8ClampedArray {
  const out = createBuffer(rect.width, rect.height);
  for (let y = 0; y < rect.height; y++) {
    for (let x = 0; x < rect.width; x++) {
      setPixel(out, rect.width, x, y, getPixel(buf, width, rect.x + x, rect.y + y));
    }
  }
  return out;
}

// Erase a rect. `bounds` clips it, and lifting a selection MUST pass one: a
// rect can extend past its region (a rotation's bounding box grows, a move can
// straddle a boundary), and an unclipped clear would erase the neighbouring
// sprite — or, past the sheet's right edge, wrap onto the next row.
export function clearRect(
  buf: Uint8ClampedArray,
  width: number,
  rect: PackedRegion,
  bounds?: PackedRegion,
): void {
  const clip = bounds ? intersectRect(rect, bounds) : rect;
  if (!clip) return;
  for (let y = clip.y; y < clip.y + clip.height; y++) {
    for (let x = clip.x; x < clip.x + clip.width; x++) {
      setPixel(buf, width, x, y, [0, 0, 0, 0]);
    }
  }
}

// Overlap of two rects, or null when they don't touch.
export function intersectRect(
  a: PackedRegion,
  b: PackedRegion,
): PackedRegion | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  if (right <= x || bottom <= y) return null;
  return { x, y, width: right - x, height: bottom - y };
}

// Stamp a lifted buffer back down at (dx, dy), clipped to `bounds`.
//
// Transparent source pixels are SKIPPED rather than written, so a moved
// selection composites over whatever it lands on instead of punching a
// transparent hole around itself.
export function blitRect(
  dst: Uint8ClampedArray,
  dstWidth: number,
  src: Uint8ClampedArray,
  srcWidth: number,
  srcHeight: number,
  dx: number,
  dy: number,
  bounds: PackedRegion,
): void {
  for (let y = 0; y < srcHeight; y++) {
    for (let x = 0; x < srcWidth; x++) {
      const tx = dx + x;
      const ty = dy + y;
      if (
        tx < bounds.x ||
        tx >= bounds.x + bounds.width ||
        ty < bounds.y ||
        ty >= bounds.y + bounds.height
      ) {
        continue;
      }
      const px = getPixel(src, srcWidth, x, y);
      if (px[3] === 0) continue;
      setPixel(dst, dstWidth, tx, ty, px);
    }
  }
}

export function rectContains(rect: PackedRegion, x: number, y: number): boolean {
  return (
    x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height
  );
}

export type RotatedBuffer = {
  pixels: Uint8ClampedArray;
  width: number;
  height: number;
};

// Rotate a lifted buffer about its own centre. Nearest-neighbour by inverse
// mapping: every destination pixel asks which source pixel it came from, so no
// source pixel can be written twice and none of the holes a forward mapping
// leaves can appear. That is also the only resampling a pixel-art editor may do
// — an interpolated rotation invents colours that aren't in the palette.
//
// The result is the rotated BOUNDING BOX, which is bigger than the source for
// anything that isn't a multiple of 90°. Callers stamp it centred on the
// original rect's centre, so the art turns in place rather than drifting.
//
// Rotation is measured clockwise on screen (y grows downward), matching the
// angle a pointer drag reports.
export function rotateBuffer(
  src: Uint8ClampedArray,
  width: number,
  height: number,
  angle: number,
): RotatedBuffer {
  // Snap the trig to exact 0/±1 near the quarter turns. Math.cos(Math.PI / 2)
  // is 6.1e-17, not 0, and left alone that smear costs a 90° turn a row of
  // pixels along one edge.
  const snap = (v: number) =>
    Math.abs(v) < 1e-9 ? 0 : Math.abs(Math.abs(v) - 1) < 1e-9 ? Math.sign(v) : v;
  const cos = snap(Math.cos(angle));
  const sin = snap(Math.sin(angle));

  const hw = width / 2;
  const hh = height / 2;
  const outW = Math.max(1, Math.ceil(Math.abs(width * cos) + Math.abs(height * sin) - 1e-9));
  const outH = Math.max(1, Math.ceil(Math.abs(width * sin) + Math.abs(height * cos) - 1e-9));
  const out = createBuffer(outW, outH);

  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      // Sample from the pixel's CENTRE, otherwise a half-pixel bias shifts the
      // whole sprite one pixel at some angles and not others.
      const px = x + 0.5 - outW / 2;
      const py = y + 0.5 - outH / 2;
      const sx = Math.floor(px * cos + py * sin + hw);
      const sy = Math.floor(-px * sin + py * cos + hh);
      if (sx < 0 || sx >= width || sy < 0 || sy >= height) continue;
      setPixel(out, outW, x, y, getPixel(src, width, sx, sy));
    }
  }
  return { pixels: out, width: outW, height: outH };
}

// Where a rotated buffer's top-left lands so its centre sits on (cx, cy),
// given in sheet pixels. Rounded once, here, so a rect is never half a pixel
// off its own art.
export function centredRect(
  cx: number,
  cy: number,
  width: number,
  height: number,
): PackedRegion {
  return {
    x: Math.round(cx - width / 2),
    y: Math.round(cy - height / 2),
    width,
    height,
  };
}

// The sprite's BOTTOM PROFILE: for each column of the region, rows from the
// region's top to one past its lowest drawn pixel. `0` for a column with
// nothing in it at all.
//
// The region rect says where a sprite MAY draw; this says where it actually
// does, column by column. This is the hat-hair modes' input
// (lib/aachar/hatHair.ts): hair is cut against the helmet's bottom edge in
// the columns it covers. The BOTTOM edge, not the top outline — a jester
// hat's prongs droop with air underneath, and a top-profile cut lets hair
// leak through those notches.
export function regionBottomProfile(
  buf: Uint8ClampedArray,
  width: number,
  region: PackedRegion,
): number[] {
  const profile: number[] = [];
  for (let x = 0; x < region.width; x++) {
    let bottom = 0;
    for (let y = region.height - 1; y >= 0; y--) {
      if (buf[((region.y + y) * width + region.x + x) * 4 + 3] !== 0) {
        bottom = y + 1;
        break;
      }
    }
    profile.push(bottom);
  }
  return profile;
}

// True when every pixel in the region is fully transparent — used to tell
// "not drawn yet" from "deliberately blank".
export function isRegionEmpty(
  buf: Uint8ClampedArray,
  width: number,
  region: PackedRegion,
): boolean {
  for (let y = region.y; y < region.y + region.height; y++) {
    for (let x = region.x; x < region.x + region.width; x++) {
      if (buf[(y * width + x) * 4 + 3] !== 0) return false;
    }
  }
  return true;
}
