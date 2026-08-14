// AA horse pipeline — the horse drawing sheet.
//
// One fixed layout (H9): SPUM's 10 region NAMES (so `HORSE_REGION_TO_BONE`
// routes the art with no mapping and the onion pairs by name), each padded
// +4px per side over SPUM's sizes for drawing room. Region size is free on
// this rig — the renderer pins a slice by its pivot FRACTION, so padding
// changes how much canvas the art may use, never where the rig puts it.
// All pivots stay centred (0.5, 0.5), matching every SPUM horse region.
//
// Rows read like the horse (facing left): head end on the left, body in the
// middle, tail right, legs along the bottom, saddle (`Acc`) with the body.

import { HORSE_REGION_TO_BONE } from "@/lib/spum/horseCatalog";

import { REGION_GUTTER, type PackedSheet } from "../geometry";

export const HORSE_REGION_NAMES = Object.keys(HORSE_REGION_TO_BONE);

// SPUM's region sizes + 4px padding per side (8 per axis).
const PAD = 8;
export const HORSE_REGION_SIZES: Record<string, { width: number; height: number }> = {
  Head: { width: 17 + PAD, height: 15 + PAD },
  Neck: { width: 10 + PAD, height: 10 + PAD },
  BodyFront: { width: 17 + PAD, height: 13 + PAD },
  BodyBack: { width: 17 + PAD, height: 12 + PAD },
  Tail: { width: 10 + PAD, height: 13 + PAD },
  FootFrontTop: { width: 8 + PAD, height: 6 + PAD },
  FootFrontBottom: { width: 6 + PAD, height: 8 + PAD },
  FootBackTop: { width: 7 + PAD, height: 6 + PAD },
  FootBackBottom: { width: 6 + PAD, height: 8 + PAD },
  Acc: { width: 15 + PAD, height: 14 + PAD },
};

const ROWS: string[][] = [
  ["Head", "Neck", "Tail"],
  ["BodyFront", "BodyBack", "Acc"],
  ["FootFrontTop", "FootFrontBottom", "FootBackTop", "FootBackBottom"],
];

/** The one horse sheet. Deterministic; gutters between and around regions
 *  (the same texel-bleed rule as the character sheets — see REGION_GUTTER). */
export function packHorseSheet(): PackedSheet {
  const g = REGION_GUTTER;
  const regions: PackedSheet["regions"] = {};
  let y = g;
  let sheetWidth = 0;
  for (const row of ROWS) {
    let x = g;
    let rowHeight = 0;
    for (const name of row) {
      const size = HORSE_REGION_SIZES[name];
      regions[name] = { x, y, width: size.width, height: size.height };
      x += size.width + g;
      rowHeight = Math.max(rowHeight, size.height);
    }
    sheetWidth = Math.max(sheetWidth, x);
    y += rowHeight + g;
  }
  return { width: sheetWidth, height: y, regions };
}
