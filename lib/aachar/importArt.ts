// AA character pipeline — import a PNG or SVG into a region.
//
// ISOLATION NOTE: like `shapes.ts`, this reaches into `lib/spum/imageOps.ts`
// for pure image maths (matte removal, trim, box-downsample, vector fitting).
// That module has no canvas, React or catalog dependency and is already tested;
// the isolation rule (D1) is about not coupling to SPUM's CATALOG, ART and SAVE
// PATH, and reimplementing a tested downsampler would serve its letter while
// hurting its point. The browser glue below is written here rather than
// imported, because the Part Studio's copy lives in `src/screens/admin-spum/`,
// which `lib/aachar/` may not import from.
//
// WHY SVG GETS ITS OWN PATH: the raster path downsamples a bitmap that was
// already rasterised at some other size, so it averages pixels whose
// anti-aliasing is already baked in — damage compounding on damage. The vector
// path asks the browser to rasterise AT the destination size, so every sprite
// pixel is a fresh decision made from the original geometry.

import {
  contentBounds,
  downscaleTo,
  fitBoundsToCanvas,
  quantize,
  removeMatte,
  trimTransparent,
  type Rect,
  type Rgba,
  type QuantizeMode,
  type SampleMode,
} from "@/lib/spum/imageOps";

import { createBuffer } from "./pixels";

// One throwaway render at this size, only to find the vector's content box.
// Every render that matters happens later, at sprite size, from the vector.
const SVG_WORK_SIZE = 512;
// Rasterise at 4× sprite size and box down: turns the browser's own coverage
// into accurate per-sprite-pixel alpha. "crisp" renders 1:1 instead and lets
// the rasteriser's hinting decide, which suits flat two-tone icons.
const SVG_SUPERSAMPLE = 4;

export type ImportOptions = {
  /** Strip a uniform background colour before trimming. Raster only. */
  keepMatte: boolean;
  /** Alpha cutoff when snapping partial coverage to 0/255. */
  alphaThreshold: number;
  sampling: SampleMode;
  /** Palette cap; 0 = leave colours alone. */
  colors: number;
  /** How the palette cap picks its colours — see `QuantizeMode`. Defaults to
   *  `distinct`, which keeps a rare red instead of spending four slots on
   *  shades of the dominant brown. */
  palette: QuantizeMode;
};

export const DEFAULT_IMPORT_OPTIONS: ImportOptions = {
  keepMatte: false,
  alphaThreshold: 0.5,
  sampling: "average",
  colors: 0,
  palette: "distinct",
};

export function isSvgFile(file: { name: string; type: string }): boolean {
  return file.type === "image/svg+xml" || /\.svg$/i.test(file.name);
}

function loadImageEl(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not decode the image"));
    img.src = src;
  });
}

function toRgba(canvas: HTMLCanvasElement): Rgba {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas unavailable");
  const id = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return { width: canvas.width, height: canvas.height, data: new Uint8Array(id.data) };
}

function drawToCanvas(
  img: HTMLImageElement,
  w: number,
  h: number,
  draw: (ctx: CanvasRenderingContext2D) => void,
): Rgba {
  const cv = document.createElement("canvas");
  cv.width = Math.max(1, w);
  cv.height = Math.max(1, h);
  const ctx = cv.getContext("2d");
  if (!ctx) throw new Error("2D canvas unavailable");
  ctx.clearRect(0, 0, cv.width, cv.height);
  draw(ctx);
  return toRgba(cv);
}

// --- vector path -------------------------------------------------------

type SvgSource = {
  img: HTMLImageElement;
  naturalW: number;
  naturalH: number;
  /** Content bounding box in the SVG's own coordinate space. */
  bounds: Rect;
};

async function loadSvg(file: File): Promise<{ svg: SvgSource; release: () => void }> {
  const text = await file.text();
  // Re-blob with an explicit type: a .svg picked from disk sometimes arrives
  // with an empty File.type, and an <img> won't render it then.
  const url = URL.createObjectURL(new Blob([text], { type: "image/svg+xml" }));
  const release = () => URL.revokeObjectURL(url);
  try {
    const img = await loadImageEl(url);
    const nw = img.naturalWidth || SVG_WORK_SIZE;
    const nh = img.naturalHeight || SVG_WORK_SIZE;
    const k = SVG_WORK_SIZE / Math.max(nw, nh);
    const ww = Math.max(1, Math.round(nw * k));
    const wh = Math.max(1, Math.round(nh * k));
    const work = drawToCanvas(img, ww, wh, (ctx) => ctx.drawImage(img, 0, 0, ww, wh));
    const box = contentBounds(work);
    if (!box) {
      release();
      throw new Error("The SVG rendered empty — is it blank?");
    }
    const inv = 1 / k;
    return {
      svg: {
        img,
        naturalW: nw,
        naturalH: nh,
        bounds: {
          x: box.x * inv,
          y: box.y * inv,
          width: box.width * inv,
          height: box.height * inv,
        },
      },
      release,
    };
  } catch (err) {
    release();
    throw err;
  }
}

function rasterizeSvg(
  svg: SvgSource,
  outW: number,
  outH: number,
  ss: number,
  alphaThreshold: number,
): Rgba {
  const cw = Math.max(1, outW * ss);
  const ch = Math.max(1, outH * ss);
  const raw = drawToCanvas(svg.img, cw, ch, (ctx) => {
    const { dx, dy, dw, dh } = fitBoundsToCanvas(
      svg.bounds,
      { width: svg.naturalW, height: svg.naturalH },
      cw,
      ch,
    );
    ctx.drawImage(svg.img, dx, dy, dw, dh);
  });
  // ss === 1 makes this an identity box per pixel, which still does the job
  // downscaleTo always does at the end: snap partial alpha to 0/255 and
  // un-premultiply. One code path, both modes.
  return downscaleTo(raw, outW, outH, alphaThreshold);
}

// Centre the fitted art in the destination box. Letterboxing rather than
// stretching: an imported icon that doesn't match the box's aspect should keep
// its proportions, not smear to fill. Art larger than the box is cropped
// symmetrically — that's the "scaled up past the region" case.
function centreInto(fitted: Rgba, width: number, height: number): Uint8ClampedArray {
  const out = createBuffer(width, height);
  const ox = Math.floor((width - fitted.width) / 2);
  const oy = Math.floor((height - fitted.height) / 2);
  for (let y = 0; y < fitted.height; y++) {
    for (let x = 0; x < fitted.width; x++) {
      const tx = ox + x;
      const ty = oy + y;
      if (tx < 0 || tx >= width || ty < 0 || ty >= height) continue;
      const s = (y * fitted.width + x) * 4;
      const d = (ty * width + tx) * 4;
      out[d] = fitted.data[s];
      out[d + 1] = fitted.data[s + 1];
      out[d + 2] = fitted.data[s + 2];
      out[d + 3] = fitted.data[s + 3];
    }
  }
  return out;
}

// --- entry points ------------------------------------------------------

/**
 * A decoded file, ready to be rendered at any size.
 *
 * WHY THE TWO-STAGE SPLIT: the editor lets an import be scaled and dragged
 * before it is committed (Phase 5c), and every scale tick re-renders it. Doing
 * that through `importArt` would re-decode the file — a fresh `Image` decode
 * plus, on the raster path, a full matte/trim pass — sixty times a second while
 * a slider moves. Decoding once and re-rendering is what makes the live
 * transform feel like dragging rather than like waiting.
 */
export type PreparedArt = {
  kind: "raster" | "vector";
  /** height ÷ width of the art's content box — what letterboxing preserves. */
  aspect: number;
  /** Fit the art inside a `width × height` box, centred. */
  render(width: number, height: number, opts: ImportOptions): Uint8ClampedArray;
  /** Release held resources (the vector path keeps an object URL alive). */
  dispose(): void;
};

/**
 * Decode `file` once.
 *
 * Only `opts.keepMatte` is read here: matte removal and the trim that follows
 * it define the content box, so they belong to the decode. Everything else
 * (sampling, alpha threshold, palette cap) is a `render` argument and can be
 * changed without re-preparing — a caller that flips `keepMatte` must prepare
 * again.
 */
export async function prepareArt(
  file: File,
  opts: ImportOptions = DEFAULT_IMPORT_OPTIONS,
): Promise<PreparedArt> {
  if (isSvgFile(file)) {
    const { svg, release } = await loadSvg(file);
    const aspect = svg.bounds.height / svg.bounds.width;
    let released = false;
    return {
      kind: "vector",
      aspect,
      render(width, height, o) {
        const [fw, fh] = fitInside(width, height, aspect);
        const ss = o.sampling === "crisp" ? 1 : SVG_SUPERSAMPLE;
        let fitted = rasterizeSvg(svg, fw, fh, ss, o.alphaThreshold);
        if (o.colors > 0) fitted = quantize(fitted, o.colors, o.palette);
        return centreInto(fitted, width, height);
      },
      dispose() {
        if (released) return;
        released = true;
        release();
      },
    };
  }

  const url = URL.createObjectURL(file);
  let src: Rgba;
  try {
    const img = await loadImageEl(url);
    src = drawToCanvas(img, img.naturalWidth, img.naturalHeight, (ctx) =>
      ctx.drawImage(img, 0, 0),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
  if (!opts.keepMatte) removeMatte(src);
  const trimmed = trimTransparent(src);
  if (trimmed.width === 0 || trimmed.height === 0) {
    throw new Error("Nothing left after matte removal — try keeping the matte");
  }
  const aspect = trimmed.height / trimmed.width;
  return {
    kind: "raster",
    aspect,
    render(width, height, o) {
      const [fw, fh] = fitInside(width, height, aspect);
      let fitted = downscaleTo(trimmed, fw, fh, o.alphaThreshold, o.sampling);
      if (o.colors > 0) fitted = quantize(fitted, o.colors, o.palette);
      return centreInto(fitted, width, height);
    },
    dispose() {
      /* nothing held — the object URL was revoked above */
    },
  };
}

/**
 * Decode `file` and fit it to exactly `width × height` sprite pixels,
 * preserving aspect ratio by letterboxing inside that box.
 *
 * Returns a flat RGBA buffer of exactly that size, ready to blit into a
 * region. Browser-only — canvas and File are both required, which is why this
 * has no unit tests beyond `isSvgFile`; verify imports in the editor.
 */
export async function importArt(
  file: File,
  width: number,
  height: number,
  opts: ImportOptions = DEFAULT_IMPORT_OPTIONS,
): Promise<Uint8ClampedArray> {
  const art = await prepareArt(file, opts);
  try {
    return art.render(width, height, opts);
  } finally {
    art.dispose();
  }
}

// Largest w×h with the given aspect that fits inside the box. Exported for
// testing — it is the piece that decides whether an import looks squashed.
export function fitInside(
  boxW: number,
  boxH: number,
  aspect: number,
): [number, number] {
  let w = boxW;
  let h = Math.max(1, Math.round(w * aspect));
  if (h > boxH) {
    h = boxH;
    w = Math.max(1, Math.round(h / aspect));
  }
  return [Math.max(1, Math.min(boxW, w)), Math.max(1, Math.min(boxH, h))];
}
