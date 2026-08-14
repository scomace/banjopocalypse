// Pixel-text — bitmap fonts + a pure text-to-RGBA renderer.
// See docs/pixel-text.md for the format, the font roster (with the dingbats
// legend), and how to extend this to new surfaces (props / modern / sprites).

export type { PixelFont, PixelGlyph } from "./types";
export { validateFont } from "./types";
export type { PixelTextStyle, RenderedText } from "./render";
export { glyphFor, measureText, renderText } from "./render";
export { PIXEL_FONTS, fontById } from "./fonts";
