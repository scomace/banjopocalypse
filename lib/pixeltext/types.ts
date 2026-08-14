// Pixel-text — bitmap font format.
//
// A deliberately NEUTRAL module (see docs/pixel-text.md): it imports nothing
// from `lib/spum/` or `lib/aachar/`, so either pipeline — and later the prop /
// modern / sprite tooling — can consume it without coupling the two. Fonts are
// pure TypeScript data; there are no font FILES, no canvas, no browser APIs
// anywhere in this package except what the caller brings.
//
// Every glyph in every shipped font was hand-authored for this project
// (clean-room — nothing traced from a licensed font's bitmaps), which matters
// for the same reason the AA clip library's originality gate does.

/** One glyph: rows of `#` (on) and `.` (off), top to bottom. All rows in a
 *  glyph share one width; widths VARY between glyphs (an `I` is narrower than
 *  a `W`), which is most of what makes a tiny font readable. */
export type PixelGlyph = string[];

export type PixelFont = {
  /** Stable id — text stamps saved into art reference nothing (pixels are
   *  baked), but UI state and future content fields key on this. */
  id: string;
  /** What pickers call it. */
  label: string;
  /** One-liner for pickers: what it's good at. */
  description: string;
  /** Every glyph is exactly this many rows tall. */
  glyphHeight: number;
  /** Advance for a space character, in px. */
  spaceWidth: number;
  /** True → the font has no lowercase; lowercase input folds to uppercase.
   *  (Folding also runs as a FALLBACK for any font when a glyph is missing.) */
  capsOnly?: boolean;
  /** For icon fonts (dingbats): what each character renders as, for tooltips
   *  and docs. Absent for ordinary letter fonts. */
  legend?: Record<string, string>;
  glyphs: Record<string, PixelGlyph>;
};

/** Throws on malformed glyph data. Run at module load by the font registry —
 *  a bad row fails the build/test run, not the editor session (same policy as
 *  the content registry's duplicate-id throw). */
export function validateFont(font: PixelFont): void {
  if (!/^[a-z][a-z0-9-]*$/.test(font.id)) {
    throw new Error(`pixeltext: bad font id "${font.id}"`);
  }
  if (font.glyphHeight < 1) {
    throw new Error(`pixeltext: font "${font.id}" has glyphHeight ${font.glyphHeight}`);
  }
  for (const [ch, rows] of Object.entries(font.glyphs)) {
    if (rows.length !== font.glyphHeight) {
      throw new Error(
        `pixeltext: font "${font.id}" glyph "${ch}" is ${rows.length} rows, ` +
          `expected ${font.glyphHeight}`,
      );
    }
    const width = rows[0].length;
    if (width < 1) {
      throw new Error(`pixeltext: font "${font.id}" glyph "${ch}" has an empty row`);
    }
    for (const row of rows) {
      if (row.length !== width) {
        throw new Error(
          `pixeltext: font "${font.id}" glyph "${ch}" has ragged rows ` +
            `(${row.length} vs ${width})`,
        );
      }
      if (!/^[#.]*$/.test(row)) {
        throw new Error(
          `pixeltext: font "${font.id}" glyph "${ch}" contains characters other than "#" and "."`,
        );
      }
    }
  }
}
