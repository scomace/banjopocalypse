// lib/spum/imageOps.ts — pure RGBA-buffer image operations shared by the
// node-side part importer (scripts/custom-part-import.ts) and the browser-side
// Part Studio editor (src/screens/admin-spum/PartStudio.tsx). No node or DOM
// APIs — callers bring their own PNG decode/encode (pngjs in node, canvas in
// the browser).

export type Rgba = { width: number; height: number; data: Uint8Array };

const px = (img: Rgba, x: number, y: number) => (y * img.width + x) * 4;

// Flood fill from every border pixel whose color is within `tolerance` of the
// image's corner color, making those pixels transparent. Removes an opaque
// background matte (white or any other flat color) while PRESERVING interior
// pixels of the same color that aren't connected to the border — a chef hat's
// white body survives white-matte removal. No-op when the corners aren't a
// consistent opaque color (i.e. the source already has real transparency).
export function removeMatte(img: Rgba, tolerance = 24): boolean {
  const { width, height, data } = img;
  const corners = [
    px(img, 0, 0),
    px(img, width - 1, 0),
    px(img, 0, height - 1),
    px(img, width - 1, height - 1),
  ];
  const [r0, g0, b0, a0] = [
    data[corners[0]], data[corners[0] + 1], data[corners[0] + 2], data[corners[0] + 3],
  ];
  if (a0 < 250) return false;
  const near = (i: number) =>
    data[i + 3] >= 250 &&
    Math.abs(data[i] - r0) <= tolerance &&
    Math.abs(data[i + 1] - g0) <= tolerance &&
    Math.abs(data[i + 2] - b0) <= tolerance;
  if (!corners.every(near)) return false;

  const visited = new Uint8Array(width * height);
  const stack: number[] = [];
  const push = (x: number, y: number) => {
    const idx = y * width + x;
    if (visited[idx]) return;
    visited[idx] = 1;
    if (near(idx * 4)) stack.push(idx);
  };
  for (let x = 0; x < width; x++) {
    push(x, 0);
    push(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    push(0, y);
    push(width - 1, y);
  }
  while (stack.length > 0) {
    const idx = stack.pop()!;
    data[idx * 4 + 3] = 0;
    const x = idx % width;
    const y = (idx - x) / width;
    if (x > 0) push(x - 1, y);
    if (x < width - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y < height - 1) push(x, y + 1);
  }
  return true;
}

// Fill transparent regions NOT connected to the image border with a solid
// color. Outline-style icons (most of flaticon) are black strokes over a
// transparent interior — without this a hat renders see-through with the
// character's head poking out. `#ffffff` makes the enclosed interior solid
// while leaving the outside transparent.
export function fillEnclosed(img: Rgba, hex: string): number {
  const { width, height, data } = img;
  const rgb = parseHex(hex);
  const transparent = (i: number) => data[i * 4 + 3] < 128;
  const outside = new Uint8Array(width * height);
  const stack: number[] = [];
  const push = (x: number, y: number) => {
    const idx = y * width + x;
    if (outside[idx] || !transparent(idx)) return;
    outside[idx] = 1;
    stack.push(idx);
  };
  for (let x = 0; x < width; x++) {
    push(x, 0);
    push(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    push(0, y);
    push(width - 1, y);
  }
  while (stack.length > 0) {
    const idx = stack.pop()!;
    const x = idx % width;
    const y = (idx - x) / width;
    if (x > 0) push(x - 1, y);
    if (x < width - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y < height - 1) push(x, y + 1);
  }
  let filled = 0;
  for (let idx = 0; idx < width * height; idx++) {
    if (transparent(idx) && !outside[idx]) {
      const i = idx * 4;
      data[i] = rgb.r;
      data[i + 1] = rgb.g;
      data[i + 2] = rgb.b;
      data[i + 3] = 255;
      filled++;
    }
  }
  return filled;
}

export function parseHex(hex: string): { r: number; g: number; b: number } {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex);
  if (!m) throw new Error(`Invalid hex color: "${hex}" (expected #rrggbb)`);
  const v = parseInt(m[1], 16);
  return { r: (v >> 16) & 0xff, g: (v >> 8) & 0xff, b: v & 0xff };
}

export type Rect = { x: number; y: number; width: number; height: number };

// Bounding box of pixels with alpha > 0, or null if the image is empty.
// Split out from trimTransparent because the SVG import needs the box
// WITHOUT the crop: it re-renders the vector with that box mapped onto the
// sprite canvas, rather than cropping a bitmap.
export function contentBounds(img: Rgba): Rect | null {
  const { width, height, data } = img;
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[px(img, x, y) + 3] > 0) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

// Crop to the bounding box of pixels with alpha > 0. Throws on fully
// transparent input (nothing to import).
export function trimTransparent(img: Rgba): Rgba {
  const box = contentBounds(img);
  if (!box) throw new Error("Image is fully transparent after matte removal");
  const { x: minX, y: minY, width: w, height: h } = box;
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const srcStart = px(img, minX, minY + y);
    out.set(img.data.subarray(srcStart, srcStart + w * 4), y * w * 4);
  }
  return { width: w, height: h, data: out };
}

// Box-downsample to `targetW` wide (aspect preserved). Colors are averaged
// weighted by alpha so edge pixels don't wash toward the (invisible) color of
// transparent neighbours; output alpha is snapped to 0/255 at
// `alphaThreshold` for the crisp pixel-art look SPUM parts share.
export function downscale(
  img: Rgba,
  targetW: number,
  alphaThreshold = 0.5,
  mode: SampleMode = "average",
): Rgba {
  const targetH = Math.max(1, Math.round((img.height / img.width) * targetW));
  return downscaleTo(img, targetW, targetH, alphaThreshold, mode);
}

// Where to draw a whole vector image so that `bounds` — its content box, in
// the image's own coordinates — lands exactly on a `cw × ch` canvas. Returned
// as the four arguments canvas drawImage() takes.
//
// Pure so the placement can be tested without a browser: it is the piece the
// SVG import cannot get subtly wrong without every imported vector sitting
// slightly off-centre or clipped.
export function fitBoundsToCanvas(
  bounds: Rect,
  natural: { width: number; height: number },
  cw: number,
  ch: number,
): { dx: number; dy: number; dw: number; dh: number } {
  const sx = cw / bounds.width;
  const sy = ch / bounds.height;
  // `-0 * n` is -0, which is a needless surprise for anything comparing the
  // result with Object.is. Normalise it away at the boundary.
  const noNegZero = (n: number) => (n === 0 ? 0 : n);
  return {
    dx: noNegZero(-bounds.x * sx),
    dy: noNegZero(-bounds.y * sy),
    dw: natural.width * sx,
    dh: natural.height * sy,
  };
}

// How a destination pixel picks its colour from the source box it covers.
// "average" (the default) is right for photographic and anti-aliased sources.
// "crisp" takes the single source pixel at the box centre instead: on flat
// vector-style art, averaging invents dozens of in-between tones along every
// colour boundary, and those muddy tones are what make a downsampled icon
// read as "shrunk artwork" rather than pixel art.
export type SampleMode = "average" | "crisp";

// Box-downsample to an exact `targetW × targetH` box (aspect NOT preserved —
// the Part Studio's fit-to-region path pre-computes the aspect-preserving box
// and letterboxes inside the region itself).
export function downscaleTo(
  img: Rgba,
  targetW: number,
  targetH: number,
  alphaThreshold = 0.5,
  mode: SampleMode = "average",
): Rgba {
  if (mode === "crisp") {
    const out = new Uint8Array(targetW * targetH * 4);
    for (let dy = 0; dy < targetH; dy++) {
      const sy = Math.min(
        img.height - 1,
        Math.floor(((dy + 0.5) / targetH) * img.height),
      );
      for (let dx = 0; dx < targetW; dx++) {
        const sx = Math.min(
          img.width - 1,
          Math.floor(((dx + 0.5) / targetW) * img.width),
        );
        const i = px(img, sx, sy);
        if (img.data[i + 3] < alphaThreshold * 255) continue;
        const o = (dy * targetW + dx) * 4;
        out[o] = img.data[i];
        out[o + 1] = img.data[i + 1];
        out[o + 2] = img.data[i + 2];
        out[o + 3] = 255;
      }
    }
    return { width: targetW, height: targetH, data: out };
  }
  const out = new Uint8Array(targetW * targetH * 4);
  for (let dy = 0; dy < targetH; dy++) {
    const y0 = Math.floor((dy / targetH) * img.height);
    const y1 = Math.max(y0 + 1, Math.ceil(((dy + 1) / targetH) * img.height));
    for (let dx = 0; dx < targetW; dx++) {
      const x0 = Math.floor((dx / targetW) * img.width);
      const x1 = Math.max(x0 + 1, Math.ceil(((dx + 1) / targetW) * img.width));
      let sumA = 0, sumR = 0, sumG = 0, sumB = 0, count = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = px(img, x, y);
          const a = img.data[i + 3];
          sumA += a;
          sumR += img.data[i] * a;
          sumG += img.data[i + 1] * a;
          sumB += img.data[i + 2] * a;
          count++;
        }
      }
      const o = (dy * targetW + dx) * 4;
      if (count > 0 && sumA / count >= alphaThreshold * 255) {
        out[o] = Math.round(sumR / sumA);
        out[o + 1] = Math.round(sumG / sumA);
        out[o + 2] = Math.round(sumB / sumA);
        out[o + 3] = 255;
      }
    }
  }
  return { width: targetW, height: targetH, data: out };
}

/**
 * How a palette is chosen when several colours must share one slot.
 *
 * `coverage` — median cut. Splits the box with the widest channel spread at
 *   its MEDIAN PIXEL, so palette slots land where the pixels are. Faithful to
 *   the image's area, and the reason a large brown region gets four shades
 *   while a small red highlight is swallowed: red has few pixels, so no split
 *   ever separates it.
 *
 * `distinct` — farthest-point seeding, then weighted Lloyd. Seeds are picked
 *   for how UNLIKE the already-chosen colours they are, not how common, so
 *   black/yellow/brown/red survive four slots and the extra browns collapse
 *   into one. This is what you want for reference art being turned into pixel
 *   art: the hues carry the reading, the shading doesn't.
 */
export type QuantizeMode = "coverage" | "distinct";

// Perceptual-ish squared distance between two RGB triples ("redmean"). Plain
// Euclidean RGB rates dark brown and dark red as further apart than they look
// and mid greens as closer, which shows up directly as the wrong colour being
// dropped at small palette sizes. Cheap enough to run inside the seeding loop.
function colorDist2(
  r1: number, g1: number, b1: number,
  r2: number, g2: number, b2: number,
): number {
  const rmean = (r1 + r2) / 2;
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return (2 + rmean / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rmean) / 256) * db * db;
}

type ColorBin = { r: number; g: number; b: number; count: number };

function colorBins(img: Rgba): ColorBin[] {
  const { width, height, data } = img;
  const bins = new Map<number, ColorBin>();
  for (let i = 0; i < width * height; i++) {
    if (data[i * 4 + 3] === 0) continue;
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    const key = (r << 16) | (g << 8) | b;
    const bin = bins.get(key);
    if (bin) bin.count++;
    else bins.set(key, { r, g, b, count: 1 });
  }
  return Array.from(bins.values());
}

// Colours too rare to be a real part of the art — a handful of pixels left by
// anti-aliasing. They still get MAPPED to a palette entry; they just can't be
// chosen as one, or a three-pixel fringe artefact would win a slot over the
// subject's own colour purely for being unusual.
const RARE_FRACTION = 0.004;
const LLOYD_PASSES = 8;

function quantizeDistinct(img: Rgba, maxColors: number): Rgba {
  const { width, height, data } = img;
  const out = new Uint8Array(data);
  const bins = colorBins(img);
  if (bins.length === 0 || bins.length <= maxColors) return { width, height, data: out };

  const total = bins.reduce((n, b) => n + b.count, 0);
  const floor = Math.max(1, Math.floor(total * RARE_FRACTION));
  const common = bins.filter((b) => b.count >= floor);
  // Fall back to every colour when the image is so dappled that nothing clears
  // the floor — better a noisy palette than fewer entries than asked for.
  const seedable = common.length >= maxColors ? common : bins;

  // Seed 1 is the most common colour: whatever else the palette does, the
  // dominant colour has to be in it. After that it's farthest-point — each new
  // seed is the colour furthest from everything already chosen.
  const seeds: ColorBin[] = [seedable.reduce((a, b) => (b.count > a.count ? b : a))];
  const far = seedable.map((b) =>
    colorDist2(b.r, b.g, b.b, seeds[0].r, seeds[0].g, seeds[0].b),
  );
  while (seeds.length < maxColors) {
    let best = -1;
    let bestD = -1;
    for (let i = 0; i < seedable.length; i++) {
      // Ties broken by count so the result doesn't depend on Map order.
      if (far[i] > bestD || (far[i] === bestD && best >= 0 && seedable[i].count > seedable[best].count)) {
        bestD = far[i];
        best = i;
      }
    }
    if (best < 0 || bestD <= 0) break; // every remaining colour is already a seed
    const picked = seedable[best];
    seeds.push(picked);
    for (let i = 0; i < seedable.length; i++) {
      const d = colorDist2(seedable[i].r, seedable[i].g, seedable[i].b, picked.r, picked.g, picked.b);
      if (d < far[i]) far[i] = d;
    }
  }

  // Weighted Lloyd. Assignment is unweighted (nearest wins) but the centroid is
  // the count-weighted mean, so a cluster settles on the shade most of its
  // pixels actually are — the many browns converge on one brown, while the red
  // cluster only ever contains red and stays put.
  let centroids = seeds.map((s) => ({ r: s.r, g: s.g, b: s.b }));
  let assignment = new Int32Array(bins.length);
  for (let pass = 0; pass < LLOYD_PASSES; pass++) {
    let moved = false;
    for (let i = 0; i < bins.length; i++) {
      const bin = bins[i];
      let best = 0;
      let bestD = Infinity;
      for (let c = 0; c < centroids.length; c++) {
        const d = colorDist2(bin.r, bin.g, bin.b, centroids[c].r, centroids[c].g, centroids[c].b);
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      if (assignment[i] !== best) moved = true;
      assignment[i] = best;
    }
    if (pass > 0 && !moved) break;
    const sums = centroids.map(() => ({ r: 0, g: 0, b: 0, n: 0 }));
    for (let i = 0; i < bins.length; i++) {
      const s = sums[assignment[i]];
      const bin = bins[i];
      s.r += bin.r * bin.count;
      s.g += bin.g * bin.count;
      s.b += bin.b * bin.count;
      s.n += bin.count;
    }
    centroids = centroids.map((c, i) =>
      // An empty cluster keeps its seed rather than being dropped: it was
      // chosen for being unlike the others, and the caller asked for N.
      sums[i].n === 0
        ? c
        : {
            r: Math.round(sums[i].r / sums[i].n),
            g: Math.round(sums[i].g / sums[i].n),
            b: Math.round(sums[i].b / sums[i].n),
          },
    );
  }

  const lookup = new Map<number, { r: number; g: number; b: number }>();
  for (let i = 0; i < bins.length; i++) {
    const bin = bins[i];
    lookup.set((bin.r << 16) | (bin.g << 8) | bin.b, centroids[assignment[i]]);
  }
  for (let i = 0; i < width * height; i++) {
    if (data[i * 4 + 3] === 0) continue;
    const c = lookup.get((data[i * 4] << 16) | (data[i * 4 + 1] << 8) | data[i * 4 + 2]);
    if (!c) continue;
    out[i * 4] = c.r;
    out[i * 4 + 1] = c.g;
    out[i * 4 + 2] = c.b;
  }
  return { width, height, data: out };
}

// Reduce the image to at most `maxColors` distinct colors by median cut, in
// place of the hundreds a box-downsampled photo/vector icon carries. Without
// this an imported hat is a smooth gradient at sprite resolution and reads as
// "shrunk artwork" rather than pixel art; snapping to 8-16 colors is what
// makes it sit next to hand-drawn parts. Only opaque pixels participate —
// alpha is already 0/255 by the time this runs, and transparent pixels have
// no meaningful color to cluster. Run AFTER downscaling: the cost is
// O(maxColors x pixels), which is nothing on a 22x20 sprite and painful on a
// 1024x1024 source.
export function quantize(
  img: Rgba,
  maxColors: number,
  mode: QuantizeMode = "coverage",
): Rgba {
  if (!Number.isInteger(maxColors) || maxColors < 1) {
    throw new Error(`maxColors must be a positive integer, got ${maxColors}`);
  }
  if (mode === "distinct") return quantizeDistinct(img, maxColors);
  const { width, height, data } = img;
  const out = new Uint8Array(data);
  const opaque: number[] = [];
  for (let i = 0; i < width * height; i++) {
    if (data[i * 4 + 3] > 0) opaque.push(i);
  }
  if (opaque.length === 0) return { width, height, data: out };

  // Each box is a set of pixel indices; split the box with the single widest
  // channel spread at that channel's median until we run out of boxes to make
  // or every box is a single flat color.
  let boxes: number[][] = [opaque];
  while (boxes.length < maxColors) {
    let target = -1;
    let widest = 0;
    let channel = 0;
    for (let b = 0; b < boxes.length; b++) {
      if (boxes[b].length < 2) continue;
      for (let c = 0; c < 3; c++) {
        let lo = 255;
        let hi = 0;
        for (const i of boxes[b]) {
          const v = data[i * 4 + c];
          if (v < lo) lo = v;
          if (v > hi) hi = v;
        }
        if (hi - lo > widest) {
          widest = hi - lo;
          target = b;
          channel = c;
        }
      }
    }
    if (target < 0 || widest === 0) break;
    const sorted = boxes[target]
      .slice()
      .sort((p, q) => data[p * 4 + channel] - data[q * 4 + channel]);
    const mid = sorted.length >> 1;
    boxes.splice(target, 1, sorted.slice(0, mid), sorted.slice(mid));
  }

  for (const box of boxes) {
    let r = 0;
    let g = 0;
    let b = 0;
    for (const i of box) {
      r += data[i * 4];
      g += data[i * 4 + 1];
      b += data[i * 4 + 2];
    }
    const n = box.length;
    const ar = Math.round(r / n);
    const ag = Math.round(g / n);
    const ab = Math.round(b / n);
    for (const i of box) {
      out[i * 4] = ar;
      out[i * 4 + 1] = ag;
      out[i * 4 + 2] = ab;
    }
  }
  return { width, height, data: out };
}

// Detect the block size of a source that is ALREADY pixel art, exported
// upscaled — a 28x23 sprite saved at 4x is a 112x92 PNG of flat 4x4 blocks.
// Box-downsampling such a source by a non-integer factor cuts across its
// existing blocks and averages them into mush, which is exactly what makes an
// imported pixel-art hat look worse than the file you started with. Knowing
// the scale lets the caller snap to the native grid instead.
//
// Works by GCD of edge positions rather than by testing candidate block sizes:
// every colour change must land on a block boundary, so the greatest common
// divisor of all change positions IS the block size. A smooth (non-pixel-art)
// source has changes at coprime positions and collapses to 1 almost
// immediately, which also makes this cheap on the common case.
export function detectPixelScale(img: Rgba): number {
  const { width, height, data } = img;
  const same = (i: number, j: number) =>
    data[i] === data[j] &&
    data[i + 1] === data[j + 1] &&
    data[i + 2] === data[j + 2] &&
    data[i + 3] === data[j + 3];
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

  let g = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 1; x < width; x++) {
      const i = (y * width + x) * 4;
      if (!same(i, i - 4)) {
        g = gcd(g, x);
        if (g === 1) return 1;
      }
    }
  }
  for (let x = 0; x < width; x++) {
    for (let y = 1; y < height; y++) {
      const i = (y * width + x) * 4;
      if (!same(i, i - width * 4)) {
        g = gcd(g, y);
        if (g === 1) return 1;
      }
    }
  }
  if (g === 0) return 1; // flat or empty — no grid to infer
  // The image extent has to be a whole number of blocks too, or the "grid" is
  // a coincidence of where the edges happen to fall.
  g = gcd(g, gcd(width, height));
  // A scale that collapses the art below 2px in either axis is not a grid,
  // it's a solid rectangle.
  if (g < 2 || width / g < 2 || height / g < 2) return 1;
  return g;
}

// Default pivot for a custom sprite, derived from the slot's reference part.
// Copying the reference's pivot FRACTION misplaces sprites whose size differs
// from the reference (a 22px-tall chef hat with Helmet_m01's y=0.375 hangs
// 8px below the head bone where the 16px reference hangs 6px — the hat sinks
// over the face). Instead preserve the reference's pivot offset in PIXELS:
// same distance below the bone origin, same horizontal offset from center.
export function computeDefaultPivot(
  ref: { width: number; height: number; pivot: { x: number; y: number } },
  out: { width: number; height: number },
): { x: number; y: number } {
  const belowOriginPx = ref.pivot.y * ref.height;
  const centerOffsetPx = (ref.pivot.x - 0.5) * ref.width;
  return {
    x: 0.5 + centerOffsetPx / out.width,
    y: belowOriginPx / out.height,
  };
}

// Apply a nudge (output pixels; +x moves the sprite right, +y moves it up) to
// a pivot. Moving the sprite is the inverse of moving the pivot: sprite up =
// pivot closer to the sprite's bottom.
export function applyNudge(
  pivot: { x: number; y: number },
  nudge: { dx: number; dy: number },
  size: { width: number; height: number },
): { x: number; y: number } {
  return {
    x: pivot.x - nudge.dx / size.width,
    y: pivot.y - nudge.dy / size.height,
  };
}
