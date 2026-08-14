// AA character pipeline — hi-res text art.
//
// The SMOOTH counterpart to the pixel-canvas text stamp: text is rendered
// with real fonts on a canvas at large native resolution and becomes a
// Phase 8 hi-res part — so it resizes LOSSLESSLY (display size is just the
// atlas's `pixelDensity`), places by drag, and is never quantised into the
// sprite grid. "I don't care if it exactly fits in with the sprite" is the
// requirement this exists for; when the text should match the sprite's pixel
// grid instead, use the pixel canvas's Text tool (docs/pixel-text.md §4).
//
// Two font kinds in one roster:
//   - "system": CSS font stacks rendered via `fillText` — the variety fonts
//     (Impact, Georgia, Comic Sans, script faces…). Stacks carry fallbacks,
//     so a machine missing one face degrades to a cousin rather than serif
//     soup. Rendered at TEXT_ART_FONT_SIZE native px and anti-aliased by the
//     browser — that smoothness is the point of this path.
//   - "pixel": the `lib/pixeltext` bitmap fonts "treated normally" — rendered
//     once at a large integer scale and then left alone. They keep their
//     pixel LOOK at any display size (save with smooth off) without ever
//     being re-quantised into the part's sheet.
//
// This file is browser glue (canvas + ImageData), same standing as
// `hiresImport.ts`; only the font roster is unit-testable. The caller feeds
// the returned canvas through `prepareHiResArt` (via `toBlob`), which trims
// the transparent margins and enforces the 512px cap — so measurement slop
// here is free.

import { fontById, PIXEL_FONTS, renderText } from "@/lib/pixeltext";

export type HiResFont = { id: string; label: string } & (
  | { kind: "system"; css: string }
  | { kind: "pixel"; pixelFontId: string }
);

// Windows-first stacks (this is a dev-only tool and the project runs on
// Windows), each with a graceful fallback for anything else.
const SYSTEM_FONTS: HiResFont[] = [
  { id: "impact", label: "Impact", kind: "system", css: "Impact, 'Arial Black', sans-serif" },
  { id: "arialblack", label: "Arial Black", kind: "system", css: "'Arial Black', Arial, sans-serif" },
  { id: "arial", label: "Arial", kind: "system", css: "Arial, Helvetica, sans-serif" },
  { id: "verdana", label: "Verdana", kind: "system", css: "Verdana, Geneva, sans-serif" },
  { id: "trebuchet", label: "Trebuchet", kind: "system", css: "'Trebuchet MS', Verdana, sans-serif" },
  { id: "georgia", label: "Georgia", kind: "system", css: "Georgia, 'Times New Roman', serif" },
  { id: "times", label: "Times", kind: "system", css: "'Times New Roman', Times, serif" },
  { id: "garamond", label: "Garamond", kind: "system", css: "Garamond, 'Times New Roman', serif" },
  { id: "courier", label: "Courier", kind: "system", css: "'Courier New', Courier, monospace" },
  { id: "consolas", label: "Consolas", kind: "system", css: "Consolas, 'Courier New', monospace" },
  { id: "comic", label: "Comic Sans", kind: "system", css: "'Comic Sans MS', 'Segoe Print', cursive" },
  { id: "segoeprint", label: "Segoe Print", kind: "system", css: "'Segoe Print', 'Comic Sans MS', cursive" },
  { id: "brush", label: "Brush Script", kind: "system", css: "'Brush Script MT', 'Segoe Script', cursive" },
  { id: "segoescript", label: "Segoe Script", kind: "system", css: "'Segoe Script', 'Brush Script MT', cursive" },
];

/** System faces first (the variety), then every pixeltext font. */
export const HIRES_FONTS: readonly HiResFont[] = [
  ...SYSTEM_FONTS,
  ...PIXEL_FONTS.map(
    (f): HiResFont => ({
      id: `px-${f.id}`,
      label: `${f.label} (pixel)`,
      kind: "pixel",
      pixelFontId: f.id,
    }),
  ),
];

export function hiResFontById(id: string): HiResFont | undefined {
  return HIRES_FONTS.find((f) => f.id === id);
}

export type TextArtSpec = {
  text: string;
  fontId: string;
  color: string;
  outline: boolean;
  outlineColor: string;
  bold: boolean;
  /** System fonts: real italics. Pixel fonts: the pixeltext slant shear. */
  italic: boolean;
};

/** Native px per line for system fonts. Big enough that the downstream
 *  display sizes (4–96 logical px) are always a downscale — the text never
 *  renders from fewer pixels than it shows. Long lines can exceed the 512px
 *  save cap; `prepareHiResArt` downscales those once, from this render. */
export const TEXT_ART_FONT_SIZE = 120;

/** Pixel fonts aim at roughly this native height — the integer scale keeps
 *  every font-pixel a crisp square block. */
const PIXEL_TARGET_HEIGHT = 72;

/**
 * Render the spec to a canvas at native (hi-res) size, or null when there is
 * nothing to draw. The caller owns trimming/capping (`prepareHiResArt`).
 */
export function renderTextArtCanvas(spec: TextArtSpec): HTMLCanvasElement | null {
  const font = hiResFontById(spec.fontId);
  const text = spec.text.replace(/\r\n?/g, "\n");
  if (!font || !text.trim()) return null;
  return font.kind === "pixel"
    ? renderPixelKind(font.pixelFontId, text, spec)
    : renderSystemKind(font.css, text, spec);
}

function renderPixelKind(
  pixelFontId: string,
  text: string,
  spec: TextArtSpec,
): HTMLCanvasElement | null {
  const font = fontById(pixelFontId);
  if (!font) return null;
  const scale = Math.max(1, Math.round(PIXEL_TARGET_HEIGHT / font.glyphHeight));
  const r = renderText(text, {
    font,
    color: spec.color,
    outline: spec.outline ? spec.outlineColor : undefined,
    scale,
    slant: spec.italic,
    align: "center",
  });
  if (r.width === 0) return null;
  const c = document.createElement("canvas");
  c.width = r.width;
  c.height = r.height;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  ctx.putImageData(new ImageData(new Uint8ClampedArray(r.pixels), r.width, r.height), 0, 0);
  return c;
}

function renderSystemKind(
  css: string,
  text: string,
  spec: TextArtSpec,
): HTMLCanvasElement | null {
  const size = TEXT_ART_FONT_SIZE;
  const lines = text.split("\n");
  const fontStr = `${spec.italic ? "italic " : ""}${spec.bold ? "700 " : "400 "}${size}px ${css}`;

  const probe = document.createElement("canvas").getContext("2d");
  if (!probe) return null;
  probe.font = fontStr;
  const widths = lines.map((l) => probe.measureText(l).width);
  const maxW = Math.max(1, ...widths);

  // Stroke sits half inside, half outside the glyph edge, so the visible
  // outline is strokeW/2 thick — size/12 lands near the pixel fonts' 1px-ish
  // proportion. Padding covers the stroke plus swashes and descenders that
  // overhang the em box (script faces especially); the trim pass reclaims
  // whatever goes unused.
  const strokeW = spec.outline ? Math.max(4, Math.round(size / 12)) : 0;
  const pad = strokeW + Math.ceil(size * 0.3);
  const lineHeight = Math.round(size * 1.2);

  const c = document.createElement("canvas");
  c.width = Math.ceil(maxW) + pad * 2;
  c.height = lineHeight * lines.length + pad * 2;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  ctx.font = fontStr;
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  lines.forEach((line, i) => {
    const x = pad + (maxW - widths[i]) / 2; // centre-aligned, like the stamp tool
    const y = pad + i * lineHeight + lineHeight / 2;
    if (strokeW > 0) {
      ctx.strokeStyle = spec.outlineColor;
      ctx.lineWidth = strokeW * 2;
      ctx.strokeText(line, x, y);
    }
    ctx.fillStyle = spec.color;
    ctx.fillText(line, x, y);
  });
  return c;
}
