// AA character pipeline — procedural placeholder art.
//
// A new character has no pixels yet, and an empty rig is an unhelpful thing to
// stare at: you can't tell whether nothing rendered because the plumbing is
// broken or because you haven't drawn anything. So a blank character starts
// with a blocky mannequin generated from its own geometry — it animates, it
// re-generates when proportions change, and it doubles as the thing you paint
// over on the first pass.
//
// Browser-only (uses a canvas). Not imported by anything server-side.

import type { SpriteAtlas } from "@/lib/spum/types";

import { packBodySheet, sheetToAtlas } from "./geometry";
import type { AaGeometry } from "./types";

// Distinct per region so it's immediately obvious which slice is which when a
// limb ends up on the wrong bone.
const REGION_FILL: Record<string, string> = {
  Head: "#e8c39e",
  Body: "#7c9cbf",
  Arm_L: "#d9a97f",
  Arm_R: "#c9976d",
  Foot_L: "#5f6b7a",
  Foot_R: "#4e5866",
};

const OUTLINE = "#1a1c2c";

export type PlaceholderResult = {
  atlas: SpriteAtlas;
  pngDataUrl: string;
};

// Render a filled, outlined rect per region into a sheet-sized canvas and hand
// back both the PNG and the atlas describing it — the exact pair a real
// authored part provides, so downstream code can't tell the difference.
export function buildPlaceholderBody(geom: AaGeometry): PlaceholderResult {
  const sheet = packBodySheet(geom);
  const canvas = document.createElement("canvas");
  canvas.width = sheet.width;
  canvas.height = sheet.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas unavailable");
  ctx.imageSmoothingEnabled = false;

  for (const [name, r] of Object.entries(sheet.regions)) {
    ctx.fillStyle = REGION_FILL[name] ?? "#999999";
    ctx.fillRect(r.x, r.y, r.width, r.height);
    // 1px inset outline — drawn with fillRect strips rather than strokeRect so
    // it lands on exact pixel boundaries at this scale.
    ctx.fillStyle = OUTLINE;
    ctx.fillRect(r.x, r.y, r.width, 1);
    ctx.fillRect(r.x, r.y + r.height - 1, r.width, 1);
    ctx.fillRect(r.x, r.y, 1, r.height);
    ctx.fillRect(r.x + r.width - 1, r.y, 1, r.height);
  }

  const pngDataUrl = canvas.toDataURL("image/png");
  return { atlas: sheetToAtlas(sheet, pngDataUrl), pngDataUrl };
}
