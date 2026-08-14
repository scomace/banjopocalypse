// AA horse pipeline — swappable faces (eyes + mouth), locked to the head.
//
// The character pipeline gives eyes their own SLOT; the horse gets something
// lighter: a curated library of eye and mouth STAMPS, composited into the
// Head region of the horse's atlas at render time (the same trick the
// character recolor pipeline uses — the renderer just sees an atlas whose
// `image` is a data URL, so nothing downstream knows). Because the stamps
// live inside the Head region, they are fastened to the head bone by
// construction: whatever the head does, the face does.
//
// The styles are the character eye designs re-imagined for a PROFILE view —
// one visible eye, mouth at the muzzle corner — in the same flat house
// style (#1a1c2c marks, flat white, no shading).
//
// A part with no `face` field renders untouched (hand-drawn faces stay
// exactly as drawn); picking a style writes `face` onto the horse part in
// `model.horse.parts`.

import type { SpriteAtlas } from "@/lib/spum/types";

export type HorseFacePick = {
  /** Name into HORSE_EYE_STYLES / HORSE_MOUTH_STYLES. Absent = leave the
   *  drawn art alone for that feature. */
  eyes?: string;
  mouth?: string;
};

export type HorseFaceStamp = {
  name: string;
  label: string;
  /** Stamp top-left in HEAD-REGION pixels (the padded 25×23 head box —
   *  fixed for every AA horse, so one coordinate set serves all). */
  x: number;
  y: number;
  /** Pixel rows; chars index `palette` (falling back to FACE_PALETTE),
   *  "." is transparent. */
  rows: string[];
  /** Per-stamp colour table for CUSTOM stamps drawn in the editor. Absent
   *  on the built-ins, which use FACE_PALETTE. */
  palette?: Record<string, string>;
};

/** Custom stamps drawn in the editor, stored on `model.horse.faces` — they
 *  appear in the pickers next to the built-ins. */
export type AaHorseFaces = {
  eyes?: HorseFaceStamp[];
  mouths?: HorseFaceStamp[];
};

export const FACE_PALETTE: Record<string, string> = {
  k: "#1a1c2c", // the character outline colour — pupils, lids, mouth lines
  W: "#f4f4f4", // eye whites / teeth
  T: "#ef7d57", // tongue
};

// The drawn head puts the eye around (12,8) and the mouth along the muzzle
// at (3..6, 16..17) — every stamp anchors in that neighbourhood.
export const HORSE_EYE_STYLES: HorseFaceStamp[] = [
  {
    name: "block",
    label: "Block",
    x: 12,
    y: 8,
    // The stock character eye: one flat dark square.
    rows: ["kk", "kk"],
  },
  {
    name: "bead",
    label: "Bead",
    x: 12,
    y: 8,
    // Same square with a glint — the friendliest of the set.
    rows: ["kW", "kk"],
  },
  {
    name: "sleepy",
    label: "Sleepy",
    x: 11,
    y: 8,
    // The character sleepy-eye, profiled: a heavy lid over a half pupil.
    rows: ["kkkk", ".kk."],
  },
  {
    name: "wide",
    label: "Wide",
    x: 11,
    y: 7,
    // Whites showing, pupil pressed forward (toward the nose — he is
    // looking where he is going).
    rows: ["WWWW", "kkWW", "WWWW"],
  },
  {
    name: "angry",
    label: "Angry",
    x: 11,
    y: 6,
    // A brow slash over the block eye.
    rows: ["kkk.", "....", ".kk.", ".kk."],
  },
];

export const HORSE_MOUTH_STYLES: HorseFaceStamp[] = [
  {
    name: "flat",
    label: "Flat",
    x: 3,
    y: 17,
    rows: ["kkk"],
  },
  {
    name: "smile",
    label: "Smile",
    x: 3,
    y: 16,
    // Corner turned up toward the cheek — a profile smile.
    rows: ["...k", "kkk."],
  },
  {
    name: "open",
    label: "Open",
    x: 4,
    y: 16,
    rows: ["kkk", "kkk"],
  },
  {
    name: "grin",
    label: "Grin",
    x: 3,
    y: 16,
    // Mouth line with teeth showing under it.
    rows: ["kkkk", "kWWk"],
  },
  {
    name: "tongue",
    label: "Tongue",
    x: 3,
    y: 17,
    // The derp option: flat mouth, tongue hanging out the front.
    rows: ["kkkk", "TT..", "TT.."],
  },
];

/** Built-ins plus the model's own custom stamps, customs last (the picker
 *  order) — customs may not shadow built-in names (validation enforces). */
export function faceStyleList(
  kind: "eyes" | "mouth",
  custom?: AaHorseFaces,
): HorseFaceStamp[] {
  const builtIn = kind === "eyes" ? HORSE_EYE_STYLES : HORSE_MOUTH_STYLES;
  const extra = (kind === "eyes" ? custom?.eyes : custom?.mouths) ?? [];
  return [...builtIn, ...extra];
}

/** A dangling name (a deleted custom style) resolves to nothing and the
 *  feature simply doesn't stamp — same leniency the character pipeline uses
 *  for stale colour-channel ids. */
export function findFaceStamp(
  kind: "eyes" | "mouth",
  name: string,
  custom?: AaHorseFaces,
): HorseFaceStamp | undefined {
  return faceStyleList(kind, custom).find((s) => s.name === name);
}

export function isCustomFaceStamp(
  kind: "eyes" | "mouth",
  name: string,
  custom?: AaHorseFaces,
): boolean {
  const extra = (kind === "eyes" ? custom?.eyes : custom?.mouths) ?? [];
  return extra.some((s) => s.name === name);
}

// ---------------------------------------------------------------------------
// Browser-side compositing (canvas). Pure data above stays node-safe for the
// validation + tests path.
// ---------------------------------------------------------------------------

function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`could not load ${src.slice(0, 64)}`));
    img.src = src;
  });
}

function drawStamp(
  ctx: CanvasRenderingContext2D,
  stamp: HorseFaceStamp,
  originX: number,
  originY: number,
) {
  const palette = stamp.palette ?? FACE_PALETTE;
  stamp.rows.forEach((row, dy) => {
    for (let dx = 0; dx < row.length; dx++) {
      const ch = row[dx];
      if (ch === ".") continue;
      const color = palette[ch];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(originX + stamp.x + dx, originY + stamp.y + dy, 1, 1);
    }
  });
}

/** The atlas with the given stamps composited into its Head region — the
 *  lower-level seam the editor uses to preview an in-progress draft stamp. */
export async function applyHorseStamps(
  atlas: SpriteAtlas,
  stamps: (HorseFaceStamp | undefined)[],
): Promise<SpriteAtlas> {
  const real = stamps.filter((s): s is HorseFaceStamp => s !== undefined);
  const head = atlas.regions.Head;
  if (real.length === 0 || !head) return atlas;

  const img = await loadImg(atlas.image);
  const canvas = document.createElement("canvas");
  canvas.width = atlas.width;
  canvas.height = atlas.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return atlas;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0);
  for (const s of real) drawStamp(ctx, s, head.x, head.y);
  return { ...atlas, image: canvas.toDataURL("image/png") };
}

/** The atlas with the picked face composited into its Head region. No face
 *  (or no Head region) returns the atlas unchanged. */
export async function applyHorseFace(
  atlas: SpriteAtlas,
  face: HorseFacePick | undefined,
  custom?: AaHorseFaces,
): Promise<SpriteAtlas> {
  return applyHorseStamps(atlas, [
    face?.eyes ? findFaceStamp("eyes", face.eyes, custom) : undefined,
    face?.mouth ? findFaceStamp("mouth", face.mouth, custom) : undefined,
  ]);
}

/** A stamp as a tiny data-URL image for the picker buttons (browser only).
 *  Display it scaled up with `image-rendering: pixelated`. */
export function stampToDataUrl(stamp: HorseFaceStamp): string {
  const w = Math.max(...stamp.rows.map((r) => r.length));
  const h = stamp.rows.length;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  drawStamp(ctx, { ...stamp, x: 0, y: 0 }, 0, 0);
  return canvas.toDataURL("image/png");
}
