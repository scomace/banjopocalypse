// Font registry. Every font is validated AT MODULE LOAD — a ragged glyph row
// or duplicate id fails the build and the test run, never the editor session
// (same policy as the content registry's duplicate-id throw).

import type { PixelFont } from "../types";
import { validateFont } from "../types";

import { chunky } from "./chunky";
import { dingbats } from "./dingbats";
import { micro } from "./micro";
import { nano } from "./nano";
import { slim } from "./slim";
import { standard } from "./standard";

/** Order is the picker order: smallest → largest, icons last. */
export const PIXEL_FONTS: readonly PixelFont[] = [
  nano,
  micro,
  slim,
  standard,
  chunky,
  dingbats,
];

const byId = new Map<string, PixelFont>();
for (const font of PIXEL_FONTS) {
  validateFont(font);
  if (byId.has(font.id)) throw new Error(`pixeltext: duplicate font id "${font.id}"`);
  byId.set(font.id, font);
}

export function fontById(id: string): PixelFont | undefined {
  return byId.get(id);
}
