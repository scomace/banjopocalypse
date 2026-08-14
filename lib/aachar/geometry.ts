// AA character pipeline — sheet packing and atlas derivation.
//
// The thing Part Studio structurally cannot do: build a multi-region sheet
// whose regions are sized by the author rather than copied from a stock SPUM
// template. `PartStudio.tsx` only records resizable geometry for single-region
// parts, so `body` (6 regions) has no resize path there.
//
// Region SIZE is free as far as animation is concerned: the renderer places
// each slice at `originX = pivotX*width, originY = (1-pivotY)*height` and then
// applies the bone's world transform, so a slice is pinned by its pivot
// FRACTION and its size never enters the bone math. Resizing changes how big
// the art draws, not where the rig puts it.

import type { SpriteAtlas } from "@/lib/spum/types";

import type { AaGeometry, Size } from "./types";

// Region names must match `SLOT_REGION_TO_BONE` in SpumCharacter — that map is
// what routes a region onto a bone. Getting a name wrong here means the slice
// silently never renders.
export const BODY_REGIONS = [
  "Head",
  "Body",
  "Arm_L",
  "Arm_R",
  "Foot_L",
  "Foot_R",
] as const;

export const CLOTH_REGIONS = ["Body", "Left", "Right"] as const;

// Transparent padding between regions, and around the sheet edge.
//
// WITHOUT THIS THE RIG BLEEDS. Each slice renders as a region-sized box with
// the whole sheet as its background, offset into place — then scaled by a
// FRACTIONAL factor (`outerRemainderScale`, ~0.982 at size 1), so the box
// edges land on fractional device pixels and the browser samples one texel
// past the boundary. With regions packed edge-to-edge that texel belongs to
// the neighbouring sprite, and you get a stray line of head across the
// shoulder, or of torso across the leg.
//
// SPUM's own sheets are packed adjacently too, but their art carries
// transparent margins inside each region, so the bleed is invisible. Art drawn
// to the edge of its region — which the editor actively encourages, since the
// region IS the sprite — has no such luck. One transparent pixel is enough:
// the bleed then samples nothing.
export const REGION_GUTTER = 1;

// SPUM's stock proportions, kept as the starting point for a new character and
// as the default onion-skin reference.
export const STOCK_GEOMETRY: AaGeometry = {
  head: { width: 17, height: 15 },
  body: { width: 12, height: 10 },
  arm: { width: 6, height: 7 },
  foot: { width: 4, height: 7 },
};

// Exact equality on all four sizes. Used to detect parts drawn against a
// geometry the model has since moved away from (see `isPartStale`) — while the
// look is being explored, geometry changes are frequent and existing art needs
// to visibly go stale rather than quietly misalign.
export function geometryEquals(a: AaGeometry, b: AaGeometry): boolean {
  return (["head", "body", "arm", "foot"] as const).every(
    (k) => a[k].width === b[k].width && a[k].height === b[k].height,
  );
}

export type PackedRegion = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type PackedSheet = {
  width: number;
  height: number;
  regions: Record<string, PackedRegion>;
};

// Deterministic packer laid out so the sheet READS LIKE THE CHARACTER: head
// over torso over feet, each centred on the same vertical axis, so those three
// are drawn in place rather than mentally reassembled.
//
//   row 0:  Head           (centred)
//   row 1:  Body           (centred — owns the full sheet width)
//   row 2:  Foot_R Foot_L  (centred as a pair, directly under the torso)
//   row 3:  Arm_L  Arm_R   (parked — they can't sit in place, see below)
//
// The arms get their own row at the bottom. They can't join the in-place
// column: on the rig they hang either side of the torso, so putting them
// beside `Body` would cap the torso at `sheetWidth - 2*arm.width` — exactly
// backwards for a wide, round body, where the torso is the region that wants
// to grow. Parked below, the torso gets its row to itself and the sheet
// widens with it.
//
// Region coordinates are arbitrary as far as the renderer is concerned (it
// slices by rect and places by pivot), so this costs nothing at runtime.
export function packBodySheet(geom: AaGeometry): PackedSheet {
  const { head, body, arm, foot } = geom;
  const g = REGION_GUTTER;
  // Pairs carry a gutter between them as well as around them.
  const feetWidth = foot.width * 2 + g;
  const armsWidth = arm.width * 2 + g;
  const inner = Math.max(head.width, body.width, feetWidth, armsWidth);
  const width = inner + g * 2;

  const headY = g;
  const bodyY = headY + head.height + g;
  const feetY = bodyY + body.height + g;
  const armsY = feetY + foot.height + g;
  const height = armsY + arm.height + g;

  const centre = (w: number) => g + Math.floor((inner - w) / 2);
  const feetX = centre(feetWidth);
  const armsX = centre(armsWidth);

  return {
    width,
    height,
    regions: {
      Head: { x: centre(head.width), y: headY, ...head },
      Body: { x: centre(body.width), y: bodyY, ...body },
      // Foot_R first so the pair reads left-to-right as the character faces
      // you — same order the bottom row of SPUM's own sheets uses.
      Foot_R: { x: feetX, y: feetY, ...foot },
      Foot_L: { x: feetX + foot.width + g, y: feetY, ...foot },
      Arm_L: { x: armsX, y: armsY, ...arm },
      Arm_R: { x: armsX + arm.width + g, y: armsY, ...arm },
    },
  };
}

// Cloth covers the torso and the two forearms, so its regions track the body's
// torso and arm sizes. Deriving rather than authoring them is what keeps
// sleeves attached when the torso is resized.
export function packClothSheet(geom: AaGeometry): PackedSheet {
  const { body, arm } = geom;
  const g = REGION_GUTTER;
  return {
    width: g + body.width + g + arm.width + g + arm.width + g,
    height: Math.max(body.height, arm.height) + g * 2,
    regions: {
      Body: { x: g, y: g, ...body },
      Right: { x: g + body.width + g, y: g, ...arm },
      Left: { x: g + body.width + g + arm.width + g, y: g, ...arm },
    },
  };
}

// Single-region slots (hair, helmet, faceHair, weapon, eye) are authored at
// whatever size suits the art — nothing derives from them.
export function packSingleSheet(name: string, size: Size): PackedSheet {
  const g = REGION_GUTTER;
  return {
    width: size.width + g * 2,
    height: size.height + g * 2,
    regions: { [name]: { x: g, y: g, ...size } },
  };
}

// Turn a packed sheet into a SpriteAtlas the renderer can consume. Pivots
// default to centre (0.5, 0.5) — matching every stock SPUM region — unless the
// caller supplies overrides for regions that need to hang off-centre.
export function sheetToAtlas(
  sheet: PackedSheet,
  image: string,
  pivots?: Record<string, { x: number; y: number }>,
): SpriteAtlas {
  return {
    image,
    width: sheet.width,
    height: sheet.height,
    regions: Object.fromEntries(
      Object.entries(sheet.regions).map(([name, r]) => [
        name,
        { ...r, pivot: pivots?.[name] ?? { x: 0.5, y: 0.5 } },
      ]),
    ),
  };
}
