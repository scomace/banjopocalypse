// AA character pipeline — per-slot sheet shapes and onion mappings.
//
// Phase 4. Each non-body slot falls into one of three shapes:
//
//   DERIVED   `cloth` — regions sized from the model geometry, so sleeves stay
//             attached to the torso they're worn over.
//   FREE EYE  `eye` — SPUM's free layer (see lib/spum/freeEye.ts), grown to
//             THREE stacked bands here (Phase 11): open / half / blink. One
//             stamp, both eyes hand-placed, no forced 5px spacing.
//   SINGLE    everything else — one region at whatever size the art wants.

import { FREE_EYE_CLOSE_REGION, FREE_EYE_REGION, clampFreeEyeDim } from "@/lib/spum/freeEye";
import type { Skeleton } from "@/lib/spum/types";

import {
  REGION_GUTTER,
  packClothSheet,
  packSingleSheet,
  type PackedSheet,
} from "./geometry";
import type { OnionMapping } from "./onion";
import { PX_PER_UNIT } from "./skeleton";
import type { AaGeometry, AaSlot, Size } from "./types";

// The half-closed eye band (Phase 11). Defined HERE, not in lib/spum/freeEye.ts:
// the SPUM side never needs the name — the renderer skips unrecognised regions
// on the open-eye bone by construction (SpumCharacter's `freeEye` filter), so
// this band is invisible to it until `applyEyeState` points the `Free` region's
// rect at it. Sits between the open and blink bands on the sheet.
export const FREE_EYE_HALF_REGION = "FreeHalf";

export type SlotShape = "derived" | "freeEye" | "single";

export const SLOT_SHAPE: Record<AaSlot, SlotShape> = {
  body: "derived",
  cloth: "derived",
  eye: "freeEye",
  hair: "single",
  faceHair: "single",
  helmet: "single",
  weapon: "single",
  weapon2: "single",
};

// The single region name each simple slot must use. These are the keys
// `SLOT_REGION_TO_BONE` routes on — a typo means the slice silently never
// renders, so they're centralised here rather than typed at each call site.
export const SINGLE_REGION_NAME: Partial<Record<AaSlot, string>> = {
  hair: "Hair",
  faceHair: "FaceHair",
  helmet: "Helmet",
  weapon: "Weapon",
  // Same region NAME as weapon — SpumCharacter's weapon2 table routes
  // `Weapon` to the left-hand bone; the slot, not the region, picks the hand.
  weapon2: "Weapon",
};

// Starting canvas sizes for the free-sized slots. Nothing clips a slice to the
// skull, so hair and helmets may overhang — and they need canvas to overhang
// INTO. These start about a head-height taller than the head itself, with
// `DEFAULT_HEADROOM` putting that extra height above it rather than under the
// chin, so tall hair and a helmet's crown have somewhere to go before anything
// is resized.
export const DEFAULT_SINGLE_SIZE: Partial<Record<AaSlot, Size>> = {
  hair: { width: 28, height: 34 },
  faceHair: { width: 20, height: 14 },
  helmet: { width: 32, height: 38 },
  weapon: { width: 16, height: 16 },
  weapon2: { width: 16, height: 16 },
};

// Where a new part's anchor starts, in px below its canvas centre. See
// `headroomPivot` — this is what turns the generous heights above into room
// ABOVE the head instead of half of it under the chin.
//
// faceHair sits ON the face, so it stays centred; weapon has no head to be
// above at all.
export const DEFAULT_HEADROOM: Partial<Record<AaSlot, number>> = {
  hair: 8,
  helmet: 10,
};

export function buildSlotSheet(
  slot: AaSlot,
  geometry: AaGeometry,
  size: Size,
): PackedSheet {
  if (slot === "cloth") return packClothSheet(geometry);
  if (slot === "eye") {
    // Laid out here rather than delegating to `makeFreeEyeSheet`, which stacks
    // bands edge-to-edge and knows nothing of the half band. Same region names
    // and band sizes — SPUM's clamp still governs the dimensions — but with
    // the gutter every other AA sheet gets, so no band can bleed into its
    // neighbour. Three bands since Phase 11: open / half / blink, in the order
    // the eyes close. A part saved with the old two-band sheet carries its own
    // rects, so it renders untouched; reopening it in the editor migrates the
    // pixels by region name and leaves `FreeHalf` blank.
    const g = REGION_GUTTER;
    const w = clampFreeEyeDim(size.width);
    const b = clampFreeEyeDim(size.height);
    return {
      width: w + g * 2,
      height: b * 3 + g * 4,
      regions: {
        [FREE_EYE_REGION]: { x: g, y: g, width: w, height: b },
        [FREE_EYE_HALF_REGION]: { x: g, y: g + b + g, width: w, height: b },
        [FREE_EYE_CLOSE_REGION]: { x: g, y: g + (b + g) * 2, width: w, height: b },
      },
    };
  }
  return packSingleSheet(SINGLE_REGION_NAME[slot] ?? "Region", size);
}

// HEADROOM — why a head-worn slot needs an off-centre pivot.
//
// The pivot is the point the renderer pins to the bone, and hair, helmet and
// faceHair all pin to the same place the head sprite does. With the stock
// centre pivot the canvas is therefore centred on the head: half of any height
// you add lands UNDER the skull, where nothing is ever drawn, and tall hair or
// a hat worn high runs out of canvas long before the sheet gets wide.
//
// `headroom` slides the anchor DOWN its own canvas by that many source px, so
// the rows it frees all appear above the head. It also moves the onion
// reference down by the same amount (`compositeOnion` aligns on the pivot), so
// what you see is the head sitting lower in a taller canvas — which is exactly
// what "more space above the head" means.
//
// Clamped so the anchor stays inside the sprite: the renderer clamps pivots to
// [0, 1] anyway (`clamp01` in SpumCharacter), so an out-of-range value would
// silently snap and misplace the art.
export function clampHeadroom(headroom: number, height: number): number {
  const limit = height / 2;
  return Math.max(-limit, Math.min(limit, Math.round(headroom)));
}

/** The pivot a single-region slot carries for a given headroom. */
export function headroomPivot(headroom: number, height: number): { x: number; y: number } {
  // `pivot.y` is measured from the region's BOTTOM (Unity's convention — see
  // `pivotAnchor`), so dropping the anchor means lowering it.
  return { x: 0.5, y: 0.5 - clampHeadroom(headroom, height) / height };
}

/** Read a saved region's pivot back as a headroom, so reopening a part keeps
 *  the canvas it was drawn in. Inverse of `headroomPivot`. */
export function headroomFromPivot(pivotY: number, height: number): number {
  return Math.round((0.5 - pivotY) * height);
}

/**
 * A canvas with `above` px of room over the head's top edge and `below` px
 * under its bottom edge, for a head this tall. The "give me room for tall
 * hair" button, and the shape the defaults above are aimed at.
 *
 *   room above the anchor = height / 2 + headroom
 *   the anchor IS the head's centre, so the head's top edge is
 *   `head / 2` above it.
 */
export function roomyCanvas(
  headHeight: number,
  above: number,
  below: number,
): { height: number; headroom: number } {
  const height = Math.max(1, Math.round(headHeight + above + below));
  const headroom = clampHeadroom(headHeight / 2 + above - height / 2, height);
  return { height, headroom };
}

// Free-eye regions carry a centre pivot; `makeFreeEyeSheet` is the authority.
// Single-region slots carry one only when headroom moves it off centre — an
// absent entry means centre, which is what every part saved before this
// existed recorded.
export function slotPivots(
  slot: AaSlot,
  size?: Size,
  headroom = 0,
): Record<string, { x: number; y: number }> {
  if (slot === "eye") {
    return {
      [FREE_EYE_REGION]: { x: 0.5, y: 0.5 },
      [FREE_EYE_HALF_REGION]: { x: 0.5, y: 0.5 },
      [FREE_EYE_CLOSE_REGION]: { x: 0.5, y: 0.5 },
    };
  }
  const region = SINGLE_REGION_NAME[slot];
  if (!region || !size || clampHeadroom(headroom, size.height) === 0) return {};
  return { [region]: headroomPivot(headroom, size.height) };
}

function boneY(skeleton: Skeleton, path: string): number {
  return skeleton.bones.find((b) => b.path === path)?.defaultPos.y ?? 0;
}

const HEAD_BONE_PARENT = "Root/BodySet/P_Body/HeadSet/P_Head/";
/** The bone each head-worn slot's sprite hangs from. All are siblings of the
 *  head sprite's own bone under `P_Head`, so their offsets compare directly. */
const SLOT_ANCHOR_BONE: Partial<Record<AaSlot, string>> = {
  hair: `${HEAD_BONE_PARENT}P_Hair`,
  helmet: `${HEAD_BONE_PARENT}P_Helmet`,
  faceHair: `${HEAD_BONE_PARENT}P_Mustache`,
};
const HEAD_SPRITE_BONE = `${HEAD_BONE_PARENT}P_Head`;

/**
 * Where the head sprite actually sits relative to a head-worn slot's anchor,
 * in SHEET pixels (dy positive = down).
 *
 * NOT ZERO, which is what the onion assumed until this existed. SPUM hangs each
 * head-worn sprite from its own bone: hair sits 3.5px above the head sprite's
 * anchor, the helmet 2.5px above, and faceHair 5px BELOW and 1.5px to the side.
 * Drawing the reference head at the slot's own anchor therefore put it 2.5–5px
 * out, and art lined up against it rendered that far off — a hat drawn to sit
 * on the reference floats above the real head.
 */
export function headOffsetFromSlotAnchorPx(
  skeleton: Skeleton | null,
  slot: AaSlot,
): { dx: number; dy: number } {
  const anchor = SLOT_ANCHOR_BONE[slot];
  if (!skeleton || !anchor) return { dx: 0, dy: 0 };
  const bone = (path: string) =>
    skeleton.bones.find((b) => b.path === path)?.defaultPos ?? { x: 0, y: 0 };
  const head = bone(HEAD_SPRITE_BONE);
  const slotBone = bone(anchor);
  return {
    dx: (head.x - slotBone.x) * PX_PER_UNIT,
    dy: -(head.y - slotBone.y) * PX_PER_UNIT,
  };
}

// How far the head sprite's centre sits ABOVE the free-eye anchor, in source
// px. Derived from the live skeleton rather than hardcoded, because the AA
// model overrides exactly these bones (neck length, eye height) — a constant
// would drift out of alignment the moment proportions are tuned.
export function headAboveEyeAnchorPx(skeleton: Skeleton): number {
  return (
    (boneY(skeleton, "Root/BodySet/P_Body/HeadSet/P_Head/P_Head") -
      boneY(skeleton, "Root/BodySet/P_Body/HeadSet/P_Head/P_Eye") -
      boneY(skeleton, "Root/BodySet/P_Body/HeadSet/P_Head/P_Eye/P_LEye/PivotFront")) *
    PX_PER_UNIT
  );
}

// Where each slot's regions should read their onion reference FROM, on the
// character's own body sheet. Region names never coincide across slots, so
// every pairing is explicit.
//
// `dy` is positive downward in sheet pixels: the eye bands sit below the head
// sprite's centre by `headAboveEyeAnchorPx`, so the head is drawn that far up.
export function onionMappingFor(slot: AaSlot, skeleton: Skeleton | null): OnionMapping {
  switch (slot) {
    case "cloth":
      return {
        Body: { from: "Body" },
        Left: { from: "Arm_L" },
        Right: { from: "Arm_R" },
      };
    case "eye": {
      const dy = skeleton ? -headAboveEyeAnchorPx(skeleton) : 0;
      return {
        [FREE_EYE_REGION]: { from: "Head", dy },
        [FREE_EYE_HALF_REGION]: { from: "Head", dy },
        [FREE_EYE_CLOSE_REGION]: { from: "Head", dy },
      };
    }
    case "hair":
    case "faceHair":
    case "helmet": {
      // Offset by where the head sprite really is relative to THIS slot's bone
      // — same correction the eye bands get, and for the same reason.
      const { dx, dy } = headOffsetFromSlotAnchorPx(skeleton, slot);
      return { [SINGLE_REGION_NAME[slot] as string]: { from: "Head", dx, dy } };
    }
    case "weapon":
    case "weapon2":
      // Nothing on the body sheet is a useful reference for a held object.
      return {};
    default:
      return {};
  }
}
