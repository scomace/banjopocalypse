// Pixel-text — the renderer. Pure buffer math: text + font + style in, an
// RGBA `Uint8ClampedArray` out. No canvas, no DOM — callers blit the result
// wherever they need it (the AA part canvas today; props / modern / sprites
// whenever they grow a text feature — see docs/pixel-text.md).

import type { PixelFont, PixelGlyph } from "./types";

export type PixelTextStyle = {
  font: PixelFont;
  /** Text colour, `#rgb` or `#rrggbb`. */
  color: string;
  /** 1px outline colour (drawn on the 8-neighbourhood), or absent for none.
   *  The outline is applied BEFORE scaling, so it thickens with the text. */
  outline?: string;
  /** Integer pixel multiplier ≥ 1. Non-integers are floored — fractional
   *  scaling of a bitmap font is exactly the smearing this module exists to
   *  avoid. */
  scale?: number;
  /** Blank columns between glyphs, pre-scale. Default 1. */
  letterSpacing?: number;
  /** Blank rows between lines, pre-scale. Default 1. */
  lineSpacing?: number;
  /** Multi-line alignment. Default "center" — text on a shirt is almost
   *  always centred. */
  align?: "left" | "center" | "right";
  /** Shear glyph rows rightward for an italic read. Works on every font, so
   *  each font ships its own italic for free. */
  slant?: boolean;
};

export type RenderedText = {
  pixels: Uint8ClampedArray;
  width: number;
  height: number;
};

// Unknown characters render as a hollow box (per font height, cached) rather
// than vanishing — an invisible miss on a 20px canvas would just read as a
// kerning bug.
const fallbackCache = new Map<number, PixelGlyph>();
function fallbackGlyph(height: number): PixelGlyph {
  let g = fallbackCache.get(height);
  if (!g) {
    const w = 3;
    g = Array.from({ length: height }, (_, y) =>
      y === 0 || y === height - 1 ? "#".repeat(w) : "#" + ".".repeat(w - 2) + "#",
    );
    fallbackCache.set(height, g);
  }
  return g;
}

/** Resolve one character to a glyph. Case folds both ways so a caps-only font
 *  accepts lowercase and a font missing some uppercase still tries. Returns
 *  null only for characters that ADVANCE without drawing (space). */
export function glyphFor(font: PixelFont, ch: string): PixelGlyph | null {
  if (ch === " ") return null;
  return (
    font.glyphs[ch] ??
    font.glyphs[ch.toUpperCase()] ??
    font.glyphs[ch.toLowerCase()] ??
    fallbackGlyph(font.glyphHeight)
  );
}

function parseHex(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const full =
    h.length === 3 ? h.split("").map((c) => c + c).join("") : h.padEnd(6, "0").slice(0, 6);
  const n = parseInt(full, 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

type Line = { glyphs: (PixelGlyph | null)[]; width: number };

function layout(text: string, style: PixelTextStyle): {
  lines: Line[];
  width: number;
  height: number;
  slantExtra: number;
} {
  const { font } = style;
  const letterSpacing = style.letterSpacing ?? 1;
  const lineSpacing = style.lineSpacing ?? 1;
  const slantExtra = style.slant ? Math.floor((font.glyphHeight - 1) / 2) : 0;
  const lines: Line[] = text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((raw) => {
      const glyphs = Array.from(raw).map((ch) => glyphFor(font, ch));
      let width = 0;
      for (const g of glyphs) width += (g ? g[0].length : font.spaceWidth) + letterSpacing;
      if (glyphs.length > 0) width -= letterSpacing;
      return { glyphs, width: width + (glyphs.length > 0 ? slantExtra : 0) };
    });
  // A line of pure spaces has an advance but no ink; text with no ink at all
  // renders as nothing rather than an invisible box of blank columns.
  const hasInk = lines.some((l) => l.glyphs.some((g) => g !== null));
  const width = hasInk ? Math.max(0, ...lines.map((l) => l.width)) : 0;
  const drawn = lines.length;
  const height = drawn * font.glyphHeight + (drawn - 1) * lineSpacing;
  return { lines, width, height, slantExtra };
}

/** Size of the rendered text in px, including outline padding and scale —
 *  i.e. exactly the dimensions `renderText` will return. */
export function measureText(text: string, style: PixelTextStyle): {
  width: number;
  height: number;
} {
  const scale = Math.max(1, Math.floor(style.scale ?? 1));
  const pad = style.outline ? 2 : 0;
  const { width, height } = layout(text, style);
  if (width === 0) return { width: 0, height: 0 };
  return { width: (width + pad) * scale, height: (height + pad) * scale };
}

/** Render `text` to a fresh RGBA buffer. Returns 0×0 for text with nothing to
 *  draw (empty string, spaces only). */
export function renderText(text: string, style: PixelTextStyle): RenderedText {
  const { font } = style;
  const scale = Math.max(1, Math.floor(style.scale ?? 1));
  const letterSpacing = style.letterSpacing ?? 1;
  const lineSpacing = style.lineSpacing ?? 1;
  const align = style.align ?? "center";
  const { lines, width, height } = layout(text, style);
  if (width === 0) return { pixels: new Uint8ClampedArray(0), width: 0, height: 0 };

  // Stage 1: stamp at 1×, padded by 1px all round when an outline is wanted.
  const pad = style.outline ? 1 : 0;
  const w1 = width + pad * 2;
  const h1 = height + pad * 2;
  const base = new Uint8ClampedArray(w1 * h1 * 4);
  const [tr, tg, tb] = parseHex(style.color);

  let y0 = pad;
  for (const line of lines) {
    let x0 =
      pad +
      (align === "left" ? 0 : align === "right" ? width - line.width : (width - line.width) >> 1);
    for (const g of line.glyphs) {
      if (!g) {
        x0 += font.spaceWidth + letterSpacing;
        continue;
      }
      for (let y = 0; y < g.length; y++) {
        // Slant shears the TOP rows rightward — same shear per row for every
        // glyph on the line, so baselines stay aligned.
        const shear = style.slant ? Math.floor((font.glyphHeight - 1 - y) / 2) : 0;
        const row = g[y];
        for (let x = 0; x < row.length; x++) {
          if (row[x] !== "#") continue;
          const px = x0 + x + shear;
          const py = y0 + y;
          const i = (py * w1 + px) * 4;
          base[i] = tr;
          base[i + 1] = tg;
          base[i + 2] = tb;
          base[i + 3] = 255;
        }
      }
      x0 += g[0].length + letterSpacing;
    }
    y0 += font.glyphHeight + lineSpacing;
  }

  // Stage 2: outline — every transparent pixel with a drawn 8-neighbour.
  if (style.outline) {
    const [or_, og, ob] = parseHex(style.outline);
    const src = new Uint8ClampedArray(base);
    for (let y = 0; y < h1; y++) {
      for (let x = 0; x < w1; x++) {
        const i = (y * w1 + x) * 4;
        if (src[i + 3] !== 0) continue;
        let touch = false;
        for (let dy = -1; dy <= 1 && !touch; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= w1 || ny >= h1) continue;
            if (src[(ny * w1 + nx) * 4 + 3] !== 0) {
              touch = true;
              break;
            }
          }
        }
        if (touch) {
          base[i] = or_;
          base[i + 1] = og;
          base[i + 2] = ob;
          base[i + 3] = 255;
        }
      }
    }
  }

  // Stage 3: integer scale, nearest-neighbour.
  if (scale === 1) return { pixels: base, width: w1, height: h1 };
  const w2 = w1 * scale;
  const h2 = h1 * scale;
  const out = new Uint8ClampedArray(w2 * h2 * 4);
  for (let y = 0; y < h2; y++) {
    const sy = Math.floor(y / scale);
    for (let x = 0; x < w2; x++) {
      const si = (sy * w1 + Math.floor(x / scale)) * 4;
      const di = (y * w2 + x) * 4;
      out[di] = base[si];
      out[di + 1] = base[si + 1];
      out[di + 2] = base[si + 2];
      out[di + 3] = base[si + 3];
    }
  }
  return { pixels: out, width: w2, height: h2 };
}
