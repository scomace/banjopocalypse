// AA character pipeline — what the bones actually do on screen (Phase 6b).
//
// The first pass at the clip library was authored from SPUM's numbers and
// looked broken on the real character. The root cause was authoring against a
// different rig than the one on screen: this model is a 17px-wide pear with
// 6×7 arm nubs and 4×7 foot stubs, wearing a hat whose painted art extends
// ~18px from the head bone. Amplitudes that read on a chibi with a narrow
// torso read as falling over, crossed twigs and flailing sticks here.
//
// This module makes the rig MEASURABLE, so authoring starts from this
// character's own levers instead of someone else's tuning. Everything below
// was verified empirically by probe clips (single channel, single value)
// rendered through the real renderer and measured off `getBoundingClientRect`.
//
// ── Screen semantics (measured, not assumed) ────────────────────────────────
//
// The character faces LEFT. The renderer maps Unity's y-up space to CSS with
// `translate(x·u, −y·u) rotate(−rot.z)` per bone, chained root→leaf
// (`SpumCharacter.tsx: localTransformCss`), so:
//
//   +x   = screen RIGHT  = BEHIND the character
//   −x   = screen LEFT   = FORWARD (the direction faced)
//   +y   = screen UP
//   +rot = counter-clockwise on screen = a bone's top tips FORWARD
//        → for the torso/head: +rot = lean forward, −rot = lean back
//        → for a hanging limb (arm, foot): the sprite is below its pivot, so
//          +rot swings the hand/toe BACKWARD and −rot swings it FORWARD.
//
// ── Coupling rule for feet (verified against locomotion absolutes) ──────────
//
// A foot FORWARD of its own hip carries NEGATIVE rot (toe down, leg slanting
// back up to the hip); a TRAILING foot carries POSITIVE rot. Get this
// backwards and the stride reads as broken ankles — position says one thing,
// the leg line says the other. This was the single worst defect of the first
// clip library.
//
// ── Hierarchy facts that change authoring ───────────────────────────────────
//
//   * Feet are children of ROOT, not the body: a body lean does NOT carry the
//     feet, and a root rotation tips EVERYTHING including them.
//   * The head bone carries the head sprite, hair, eyes, faceHair AND helmet.
//     Painted hat art reaches ~18px from the bone, so head rotation is the
//     highest-gain control on the rig — root and body rotations add the same
//     lever on top of their own.
//   * Arm_L draws IN FRONT of the body (sortingOrder +20), Arm_R BEHIND
//     (−20). On a torso this wide the sockets sit ~3.5px INSIDE the
//     silhouette: the back arm is invisible until pushed out, and the front
//     arm crosses the torso art whenever it swings big.

import { SLOT_REGION_TO_BONE } from "@/lib/spum/SpumCharacter";
import type { Skeleton, SpriteAtlas, Vec2 } from "@/lib/spum/types";

import { AA_CHANNELS, type AaChannel, CHANNEL_BONES, type AaStance, channelAt } from "./clip";
import type { AaSlot } from "./types";

export const PX_PER_UNIT = 32;

// ---------------------------------------------------------------------------
// Painted extents — the art's real bounding box, not the region rect
// ---------------------------------------------------------------------------

/** Painted bounding box of one region, in region-local px (image space,
 *  y down, origin at the region's top-left). Null when nothing is painted. */
export type PaintedExtent = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} | null;

/**
 * Scan a part's PNG for the painted bbox of every atlas region. Lever maths
 * built on region RECTS would overstate sprites that are mostly transparent
 * (the 34×40 helmet sheet) and understate nothing — the painted box is the
 * honest lever.
 *
 * `rgba` is the decoded image (4 bytes/px, stride = atlas.width), which is
 * `pngjs`'s layout in tests and `ImageData.data` in the browser.
 */
export function atlasExtents(
  atlas: SpriteAtlas,
  rgba: Uint8ClampedArray,
): Record<string, PaintedExtent> {
  const out: Record<string, PaintedExtent> = {};
  for (const [name, r] of Object.entries(atlas.regions)) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let y = 0; y < r.height; y++) {
      for (let x = 0; x < r.width; x++) {
        const a = rgba[((r.y + y) * atlas.width + (r.x + x)) * 4 + 3];
        if (a === 0) continue;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    out[name] = maxX < minX ? null : { minX, minY, maxX, maxY };
  }
  return out;
}

// ---------------------------------------------------------------------------
// Placement — which sprite rides which bone, and where its art sits
// ---------------------------------------------------------------------------

export type PlacedSprite = {
  /** `slot:Region` — matches the renderer's `data-spum-slice` keys. */
  label: string;
  slot: AaSlot;
  region: string;
  /** Full bone path the slice rides (leaf sprite bone). */
  bone: string;
  /** Painted-art corner offsets from the bone origin, px, y-UP world axes.
   *  The region pivot lands exactly at the bone origin, so these are the
   *  extremes of where art actually is relative to the bone. */
  corners: Vec2[];
};

/**
 * Resolve a character's picks into placed sprites. Needs each picked part's
 * atlas + painted extents (`extentsBySlot[slot][region]`). Regions with no
 * painted pixels are skipped — an empty region has no lever.
 */
export function placedSprites(
  picks: Partial<Record<AaSlot, string>>,
  atlasesBySlot: Partial<Record<AaSlot, SpriteAtlas>>,
  extentsBySlot: Partial<Record<AaSlot, Record<string, PaintedExtent>>>,
): PlacedSprite[] {
  const out: PlacedSprite[] = [];
  for (const slot of Object.keys(picks) as AaSlot[]) {
    const atlas = atlasesBySlot[slot];
    const extents = extentsBySlot[slot];
    if (!atlas || !extents) continue;
    const boneMap = (SLOT_REGION_TO_BONE as Record<string, Record<string, string | string[]>>)[
      slot
    ];
    if (!boneMap) continue;
    for (const [region, ext] of Object.entries(extents)) {
      if (!ext) continue;
      const r = atlas.regions[region];
      const mapped = boneMap[region];
      if (!r || !mapped) continue;
      const bone = Array.isArray(mapped) ? mapped[0] : mapped;
      // Pivot position inside the region, image space: pivot.x·w from the
      // left, (1−pivot.y)·h from the top. A painted pixel (ix, iy) therefore
      // sits at world offset (ix−pivotX, pivotYimg−iy) — y flips to y-up.
      const pivotX = r.pivot.x * r.width;
      const pivotYimg = (1 - r.pivot.y) * r.height;
      const corners: Vec2[] = [];
      for (const ix of [ext.minX, ext.maxX + 1]) {
        for (const iy of [ext.minY, ext.maxY + 1]) {
          corners.push({ x: ix - pivotX, y: pivotYimg - iy });
        }
      }
      out.push({ label: `${slot}:${region}`, slot, region, bone: bone.trim(), corners });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// World rest positions and levers
// ---------------------------------------------------------------------------

/** World rest position of every bone, px, y-up, rotations treated as 0.
 *  (The only non-zero rest rotation on the paths we use is P_Body's 3.056°,
 *  which every clip overrides to 0 — the rig's visual rest is upright.) */
export function worldRestPositions(skeleton: Skeleton): Map<string, Vec2> {
  const byPath = new Map(skeleton.bones.map((b) => [b.path, b]));
  const world = new Map<string, Vec2>();
  const resolve = (path: string): Vec2 => {
    const hit = world.get(path);
    if (hit) return hit;
    const bone = byPath.get(path);
    if (!bone) return { x: 0, y: 0 };
    const parent = bone.parent ? resolve(bone.parent) : { x: 0, y: 0 };
    const pos = {
      x: parent.x + bone.defaultPos.x * PX_PER_UNIT,
      y: parent.y + bone.defaultPos.y * PX_PER_UNIT,
    };
    world.set(path, pos);
    return pos;
  };
  for (const b of skeleton.bones) resolve(b.path);
  return world;
}

export type ChannelLever = {
  /** Furthest painted-art distance from the channel bone's origin, px. */
  radius: number;
  /** Which sprite owns that furthest point. */
  driver: string;
  /** Every sprite the channel carries, with its own radius. */
  riders: { label: string; radius: number }[];
};

/**
 * For each animation channel: every sprite that rides it (its bone is at or
 * below the channel bone in the hierarchy) and how far that sprite's painted
 * art reaches from the channel's pivot. This is the number that converts
 * degrees into on-screen pixels — the same 30° moves this character's hat
 * 9px and its foot 1px.
 */
export function channelLevers(
  skeleton: Skeleton,
  sprites: PlacedSprite[],
): Record<AaChannel, ChannelLever> {
  const world = worldRestPositions(skeleton);
  const out = {} as Record<AaChannel, ChannelLever>;
  for (const ch of AA_CHANNELS) {
    const channelBone = CHANNEL_BONES[ch];
    const origin = world.get(channelBone) ?? { x: 0, y: 0 };
    const riders: { label: string; radius: number }[] = [];
    for (const s of sprites) {
      if (s.bone !== channelBone && !s.bone.startsWith(channelBone + "/")) continue;
      const boneWorld = world.get(s.bone) ?? origin;
      let radius = 0;
      for (const c of s.corners) {
        const dx = boneWorld.x + c.x - origin.x;
        const dy = boneWorld.y + c.y - origin.y;
        radius = Math.max(radius, Math.hypot(dx, dy));
      }
      riders.push({ label: s.label, radius });
    }
    riders.sort((a, b) => b.radius - a.radius);
    out[ch] = {
      radius: riders[0]?.radius ?? 0,
      driver: riders[0]?.label ?? "(nothing rides this bone)",
      riders,
    };
  }
  return out;
}

/** Chord displacement of a lever tip, px: how far the furthest art actually
 *  travels on screen for a rotation of `deg` at radius `radius`. */
export function displacementPx(radius: number, deg: number): number {
  return 2 * radius * Math.sin((Math.abs(deg) * Math.PI) / 360);
}

// ---------------------------------------------------------------------------
// Amplitude budgets — degrees that produce a chosen visual intensity
// ---------------------------------------------------------------------------

export type Intensity = "calm" | "active" | "violent";

/** Target tip displacement per intensity, px. Chosen against this art's
 *  scale: a 1.5px shift reads as breathing, 4px as real motion, 9px as an
 *  impact — beyond that the sprite detaches from the body it belongs to. */
export const INTENSITY_TARGET_PX: Record<Intensity, number> = {
  calm: 1.5,
  active: 4,
  violent: 9,
};

/**
 * The rotation, per channel, whose tip displacement equals the intensity
 * target on THIS character. The inversion of `displacementPx`, capped at
 * 120° — past that a rotation stops reading as motion and starts reading as
 * the sprite tumbling.
 *
 * What this encodes: on a rig where the same intensity is 5° of head and 60°
 * of foot, copying any other rig's amplitudes produces nonsense. Budgets are
 * ceilings for ordinary motion, not quotas — a beat can exceed its budget
 * deliberately (whiplash), and should expect the result to read as violence.
 */
export function amplitudeBudget(
  levers: Record<AaChannel, ChannelLever>,
  intensity: Intensity = "active",
): Record<AaChannel, number> {
  const target = INTENSITY_TARGET_PX[intensity];
  const out = {} as Record<AaChannel, number>;
  for (const ch of AA_CHANNELS) {
    const r = levers[ch].radius;
    out[ch] =
      r <= 0 ? 0 : Math.min(120, (2 * Math.asin(Math.min(1, target / (2 * r))) * 180) / Math.PI);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Silhouette — which limbs are buried behind the torso at stance
// ---------------------------------------------------------------------------

export type SilhouetteCheck = {
  channel: AaChannel;
  /** Outermost painted-art |x| of the limb at stance, px from centre. */
  reach: number;
  /** True when the limb never clears the torso's half-width — its rotation
   *  is invisible until a position offset carries it out. */
  buried: boolean;
};

/**
 * On SPUM's 12px torso the feet at ±4 peek past the edge; on a 17px torso
 * they are entirely hidden behind it. A buried limb's rotation does nothing
 * on screen — locomotion on this rig must be POSITION-dominant, moving feet
 * out wide before angle can say anything.
 */
export function silhouetteChecks(
  skeleton: Skeleton,
  sprites: PlacedSprite[],
  torsoHalfWidth: number,
  stance: AaStance = {},
): SilhouetteCheck[] {
  const world = worldRestPositions(skeleton);
  const out: SilhouetteCheck[] = [];
  for (const ch of ["larm", "rarm", "lfoot", "rfoot"] as AaChannel[]) {
    const channelBone = CHANNEL_BONES[ch];
    // A stance value REPLACES the channel bone's local position (same
    // semantics as a clip keyframe), so the bone's world x is its parent's
    // plus the stance x when one is set.
    const bone = skeleton.bones.find((b) => b.path === channelBone);
    const parentWorld = bone?.parent ? (world.get(bone.parent) ?? { x: 0, y: 0 }) : { x: 0, y: 0 };
    const boneX =
      parentWorld.x +
      (stance[ch] ? channelAt(stance, ch).x : (bone?.defaultPos.x ?? 0) * PX_PER_UNIT);
    let reach = 0;
    for (const s of sprites) {
      if (s.bone !== channelBone && !s.bone.startsWith(channelBone + "/")) continue;
      const sBone = world.get(s.bone) ?? { x: 0, y: 0 };
      const offset = sBone.x - (world.get(channelBone)?.x ?? 0);
      for (const c of s.corners) reach = Math.max(reach, Math.abs(boneX + offset + c.x));
    }
    out.push({ channel: ch, reach, buried: reach <= torsoHalfWidth });
  }
  return out;
}

/** World rest offset from bone A to bone B, px, y-up. */
export function offsetBetween(skeleton: Skeleton, pathA: string, pathB: string): Vec2 {
  const world = worldRestPositions(skeleton);
  const a = world.get(pathA) ?? { x: 0, y: 0 };
  const b = world.get(pathB) ?? { x: 0, y: 0 };
  return { x: b.x - a.x, y: b.y - a.y };
}
