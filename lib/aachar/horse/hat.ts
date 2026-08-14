// AA horse pipeline — hats: any character HELMET part, worn by a horse.
//
// Same trick as the face system, one size up: the hat is composited into the
// horse's atlas at render time, so it is fastened to the skull by
// construction and every surface that renders the atlas (Draw preview, the
// Animate A/B panes, the Ride view, future scene mounts) gets it for free —
// no per-frame glue, no renderer fork. Unlike a face stamp, hat art does not
// fit INSIDE the 25×23 Head region (helmet sheets are 34×40), so the
// composite grows the canvas by a strip below the sheet and adds an extra
// "Hat" region there. `HORSE_REGION_TO_BONE` routes that region to the head
// sprite bone; SPUM atlases carry no such region, so the routing entry is
// inert for every SPUM horse.
//
// SEATING. The Head region renders with pivot (0.5, 0.5): its centre pixel
// sits on the head bone. The Hat region's pivot is therefore COMPUTED so
// that the hat's opaque bottom-centre lands on the crown anchor (a fixed
// spot on the drawn skull, measured off the house-style head) plus the
// per-horse nudge — pivot fractions may leave 0…1, that's just the math.
// Measuring the opaque bounds at composite time (rather than trusting the
// helmet's rect) means a tall wizard hat rises off the crown while a flat
// cap hugs it, with no per-hat data.

import type { SpriteAtlas } from "@/lib/spum/types";

import { HORSE_REGION_SIZES } from "./sheet";

export type HorseHatPick = {
  /** A character HELMET part name (`model.parts`, slot "helmet"). A
   *  dangling name (part since deleted) renders no hat — same leniency as
   *  face picks. */
  name: string;
  /** Source-px nudge over the default crown seat. Placement convention
   *  (`AaPlacement`): +dx = screen right, +dy = up. */
  dx?: number;
  dy?: number;
};

/** The synthetic region name the composite adds. Routed to the head sprite
 *  bone by `HORSE_REGION_TO_BONE`; listed after `Head` there so equal
 *  z-order resolves to "hat above head". */
export const HORSE_HAT_REGION = "Hat";

/** Where a hat's opaque bottom-centre seats, in Head-REGION pixels: the
 *  crown of the drawn skull (top ~y3–4), sunk 2px so the hat grips the head
 *  instead of hovering. One anchor serves every AA horse — the padded sheet
 *  is fixed, and the house-style skull fills the same neighbourhood. */
export const HORSE_HAT_ANCHOR = { x: 15, y: 6 };

const isFiniteNumber = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);

/** null when valid, else a message. The NAME is shape-checked only — like a
 *  face pick, a hat whose helmet part vanished must not invalidate the
 *  model; it simply renders bare-headed. */
export function hatPickError(value: unknown): string | null {
  if (typeof value !== "object" || value === null) return "hat pick is not an object";
  const h = value as Record<string, unknown>;
  if (typeof h.name !== "string" || h.name.length === 0) {
    return "hat pick needs a helmet part name";
  }
  for (const k of ["dx", "dy"] as const) {
    if (h[k] !== undefined && !isFiniteNumber(h[k])) {
      return `hat pick ${k} is not a finite number`;
    }
  }
  return null;
}

export type OpaqueBounds = { x0: number; y0: number; x1: number; y1: number };

/** The Hat region's pivot, from the hat's opaque bounds (region-local px)
 *  and the pick's nudge. Derivation: a region pixel p renders at bone offset
 *  (p.x − pivot.x·w, p.y − (1 − pivot.y)·h); the Head region (pivot .5/.5)
 *  puts its centre (w/2, h/2) on the same bone, so the anchor's bone offset
 *  is anchor − headCentre. Solve for the pivot that sends the opaque
 *  bottom-centre there. Pure math, node-safe, pinned by horse.test.ts. */
export function hatRegionPivot(
  bounds: OpaqueBounds,
  region: { width: number; height: number },
  pick: Pick<HorseHatPick, "dx" | "dy">,
): { x: number; y: number } {
  const head = HORSE_REGION_SIZES.Head;
  const targetX = HORSE_HAT_ANCHOR.x + (pick.dx ?? 0) - head.width / 2;
  const targetY = HORSE_HAT_ANCHOR.y - (pick.dy ?? 0) - head.height / 2;
  const bottomCentreX = (bounds.x0 + bounds.x1 + 1) / 2;
  const bottomCentreY = bounds.y1 + 1;
  return {
    x: (bottomCentreX - targetX) / region.width,
    y: 1 - (bottomCentreY - targetY) / region.height,
  };
}

// ---------------------------------------------------------------------------
// Browser-side compositing (canvas). Everything above stays node-safe for
// validation + tests.
// ---------------------------------------------------------------------------

function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`could not load ${src.slice(0, 64)}`));
    img.src = src;
  });
}

/** The horse atlas with the picked hat appended as a `Hat` region. No pick,
 *  no helmet part, or an all-transparent helmet returns the atlas
 *  unchanged. `helmetAtlas` is the picked helmet part's own atlas (single
 *  region, any name). Composes with `applyHorseFace` — feed its output in. */
export async function applyHorseHat(
  atlas: SpriteAtlas,
  pick: HorseHatPick | undefined,
  helmetAtlas: SpriteAtlas | undefined,
): Promise<SpriteAtlas> {
  if (!pick || !helmetAtlas) return atlas;
  const hatRegion = Object.values(helmetAtlas.regions)[0];
  if (!hatRegion) return atlas;

  const [horseImg, hatImg] = await Promise.all([
    loadImg(atlas.image),
    loadImg(helmetAtlas.image),
  ]);

  // Measure the hat's opaque bounds on its own small canvas first.
  const probe = document.createElement("canvas");
  probe.width = hatRegion.width;
  probe.height = hatRegion.height;
  const probeCtx = probe.getContext("2d");
  if (!probeCtx) return atlas;
  probeCtx.imageSmoothingEnabled = false;
  probeCtx.drawImage(
    hatImg,
    hatRegion.x,
    hatRegion.y,
    hatRegion.width,
    hatRegion.height,
    0,
    0,
    hatRegion.width,
    hatRegion.height,
  );
  const data = probeCtx.getImageData(0, 0, probe.width, probe.height).data;
  let x0 = probe.width;
  let y0 = probe.height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < probe.height; y++) {
    for (let x = 0; x < probe.width; x++) {
      if (data[(y * probe.width + x) * 4 + 3] === 0) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) return atlas;

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(atlas.width, hatRegion.width);
  canvas.height = atlas.height + hatRegion.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return atlas;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(horseImg, 0, 0);
  ctx.drawImage(probe, 0, atlas.height);

  return {
    ...atlas,
    image: canvas.toDataURL("image/png"),
    width: canvas.width,
    height: canvas.height,
    regions: {
      ...atlas.regions,
      [HORSE_HAT_REGION]: {
        x: 0,
        y: atlas.height,
        width: hatRegion.width,
        height: hatRegion.height,
        pivot: hatRegionPivot({ x0, y0, x1, y1 }, hatRegion, pick),
      },
    },
  };
}
