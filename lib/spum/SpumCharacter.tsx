"use client";

import { useEffect, useId, useMemo, useRef, useState, type MutableRefObject } from "react";

import type { CharacterColors, CharacterConfig, SceneAnimation, SpumAnimation, SpumPart, SpumSlot, WeaponPart } from "./catalog";
import { atlasPath, isShieldPart, resolveHideHair } from "./catalog";
import { FREE_EYE_CLOSE_REGION, FREE_EYE_REGION } from "./freeEye";
import {
  composeNudge,
  resolveAdjustment,
  type PartAdjustment,
  type PartNudge,
} from "./partAdjustments";

export type { SceneAnimation, SpumAnimation };
import { cssFilterFromAppearance } from "./appearance";
import { clipPhaseAt } from "./clipPhase";
import { samplePos, sampleRotZ, sampleVis } from "./curve";
import type { Bone, BonePose, BoneTransform, BoneTransformMap, Clip, Skeleton, SpriteAtlas } from "./types";

// Base sizing constants — the rig at `size=1` apparent.
//
// SPUM sprites are authored at 32 px-per-Unity-unit (`spritePixelsToUnits: 32`
// in `.png.meta`). Bone positions are in Unity units scaled by `BASE_UNIT_PX`,
// so each sprite pixel must occupy `BASE_UNIT_PX / 32` CSS pixels for spacings
// inside the atlas to line up with the gaps between bones.
//
// E12 (sizing knob) makes these per-instance — at the requested apparent
// `size`, we want each source pixel to occupy an INTEGER number of CSS pixels
// for pixel-perfect rendering through `image-rendering: pixelated`. The
// component computes:
//   effectiveSpriteScale = max(1, round(BASE_SPRITE_SCALE * size))
//   effectiveUnitPx      = effectiveSpriteScale * 32
//   outerRemainderScale  = (BASE_SPRITE_SCALE * size) / effectiveSpriteScale
// and uses the effective values in slice transforms + bone positions, with
// a small outer `scale(outerRemainderScale)` (~ 0.97–1.03) recovering the
// requested apparent size. See R9 in `docs/spum-engine-completeness.md`.
const BASE_UNIT_PX = 220;
// Exported so embedders (e.g. the ShareOSelect investor avatar) can snap a
// computed `size` onto an integer-sprite-scale step: sizes where
// BASE_SPRITE_SCALE * size is an integer render with outerRemainderScale = 1
// (no fractional CSS scale → no seam ripple between slices during clips).
export const BASE_SPRITE_SCALE = BASE_UNIT_PX / 32;

// Region-name → bone-path mapping, per slot. Keys come from the atlas region
// names emitted by the importer (which in turn come from the SPUM .meta
// files for `spriteMode: 2` assets, or the synthetic single-region name for
// `spriteMode: 1` assets — see `SPRITE_ASSETS` in scripts/spum-import.ts).
//
// Verified against the prefab's PartType/Structure references:
//  - Body  → Head/Body/Arm_L/Arm_R/Foot_L/Foot_R         (PartType: Body)
//  - Hair  → Hair                                        (PartType: Hair)
//  - Cloth → Body/Right/Left  (Body_b skipped — back of body, front view only in v1)
//                                                        (PartType: Cloth)
//  - Pant  → Right/Left                                  (PartType: Pant)
//  - Eye   → Back/Front (sclera + iris). Each region binds to TWO bones
//            (L + R), so values are string[] not string. Closed-eye bones
//            (P_LClose/P_RClose) are handled separately via the
//            `EYE_CLOSE_BINDINGS` constant below — they always render the
//            Eye_Close.png "Back" region regardless of which open-eye sprite
//            the user picked. Every eye bone renders `EYE_Z_LIFT` above its
//            prefab sortingOrder so eyes paint over hair AND helmet.
//  - Helmet → Helmet (single-region atlas) on `12_Helmet2 ` (Front bone,
//            sortingOrder 12 — above hair at 6 and the head at 5, below the
//            lifted eyes at 14/15). Note the
//            trailing space in `12_Helmet2 ` — that's the literal GameObject
//            name in the Modern prefab. The Back helmet bone (`11_Helmet1`)
//            is unused: SPUM_ImprovedTagManager.cs:2507 only ever assigns
//            user picks to the Front renderer.
//  - FaceHair → FaceHair (single-region atlas) on `6_FaceHair`, parented to
//            `P_Mustache` under the head. SPUM names it "FaceHair" but Modern
//            uses it for face accessories (face_lip = mouth, face_cheek =
//            blush, face_eyelash, face_acc_m01..06 = glasses); Legacy/Ver121
//            ship the more traditional mustaches/beards. sortingOrder 5 — same
//            z as 5_Head, so slot ordering below puts faceHair AFTER body so
//            face_lip paints on top of the head sprite. Hair (z=6) and the
//            lifted eyes (z=14/15) render above; faceHair sits between them
//            and the head. Single slot per character — the prefab file contains TWO
//            characters, not two stackable FaceHair bones (see Decisions Log
//            entry "FaceHair: single slot, not two stackable").
//  - Weapon → Weapon (single-region atlas) on `R_Weapon`, parented to
//            `P_Weapon` under the right arm. Bone's prefab sortingOrder is
//            -15 — sits between the back-of-body right arm (-20) and the body
//            (~4), so the held prop tracks the arm through clips like
//            greeting1 without poking through the body silhouette. When the
//            selected part is a shield, `slicesByBone` rewrites the bone path
//            to `R_Shield` (P_Shield bone, ±45° tilt, sortingOrder -21) — see
//            `WEAPON_SHIELD_BONE` below.
//  - Weapon2 → Weapon (same single-region atlas — the slot reuses the
//            `/spum/sprites/weapon/` folder via the shared-`pathSlot` trick
//            in catalog.ts) on `L_Weapon`, parented to `P_Weapon` under the
//            left arm. Bone's prefab sortingOrder is 19 — just behind the
//            front-arm L_Arm (z=20) so the arm covers the grip while the
//            blade pokes out beyond the arm silhouette. SPUM's prefab ships
//            this renderer; only the SPUM character creator UI hardwired
//            the user pick to R_Weapon. This binding is the "drop a sprite
//            on the L_Weapon SpriteRenderer" equivalent. When the selected
//            part is a shield, `slicesByBone` rewrites the bone path to
//            `L_Shield` — see `WEAPON_SHIELD_BONE` below.
//  - Back   → Back (single-region atlas) on `P_Back/Back`. Bone's prefab
//            sortingOrder is -100 — sits behind every other slot including
//            the back-of-body right arm (-20), so capes/wings/backpacks
//            render correctly behind the silhouette. Modern ships no Back
//            assets; v1's catalogue is Legacy-only.
//  - Armor → Body/Right/Left across three bones: BodyArmor (sortingOrder 2 —
//            in front of the back-of-body right arm but behind body slices
//            using DOM order), -15_R_Shoulder (sortingOrder -15, same z as
//            the weapon — both sit between the right arm and the body), and
//            25_L_Shoulder (sortingOrder 25, above the left arm and cloth).
//            Same three-region pattern as Cloth. Modern ships no Armor
//            assets; v1's catalogue is Legacy-only.
//
// "Right" and "Left" mean different things per slot:
//  - cloth.Right / cloth.Left are SLEEVES → attach to the cloth-arm bones
//    (`-19_RCArm` / `21_LCArm`), nested under the lower-arm bones.
//  - pant.Right / pant.Left are BOOTS → attach to the foot-cloth bones
//    (`_11R_Cloth` / `_2L_Cloth`), which overlay the body atlas's
//    `Foot_R`/`Foot_L` slices.
// Resolved by grepping the prefab for `Structure: <name>` entries under each
// `PartType`, looking up the SpriteRenderer fileID, and finding the GameObject
// whose `m_Component` list includes that fileID. Phase 7+ should follow the
// same lookup pattern when wiring new packs/parts.
// ---------------------------------------------------------------------------
// Free eye layer
//
// SPUM's stock eye system is two 1×3-pixel regions (`Back` = sclera, `Front` =
// iris) STAMPED TWICE — once on P_LEye, once on P_REye — at bone offsets the
// prefab hardcodes 5 source px apart and ~0.5 px out of vertical alignment
// with each other. You draw one 1px sliver and the rig decides where both eyes
// go. There is no way to author a wide, asymmetric, or unevenly-spaced face.
//
// The free eye layer is the escape hatch: an eye atlas that carries a `Free`
// region renders that region ONCE, as a single sprite, so the author draws
// both eyes exactly where they want them and places the pair by hand
// (PART_ADJUSTMENTS dx/dy/scale, or the Part Studio's drag handle). Presence
// of the region IS the mode switch — no extra flag file to keep in sync — and
// when it's present the stock Back/Front stamps are suppressed so a free part
// can keep them around as leftovers harmlessly. The region names are the
// contract with the Part Studio; both ends import them from `./freeEye`.
//
// The layer is NOT bounded by the head — slices are absolutely-positioned
// siblings of the bone tree, so a band far bigger than the character just
// draws past it. Oversized eyes clear both hair and helmet because every eye
// bone is lifted above them at render time — see EYE_Z_LIFT.
//
// The layer anchors on the LEFT eye bone rather than the centred P_Eye on
// purpose: P_LEye carries SPUM's m_IsActive blink track, so a free layer is
// hidden by blink clips exactly like a stock eye. The cost is that the bone
// sits FREE_EYE_BASE_DX source px left of the head's centre line, which the
// renderer adds back so a layer drawn centred on its canvas lands centred on
// the face.
const FREE_EYE_BONE = "Root/BodySet/P_Body/HeadSet/P_Head/P_Eye/P_LEye/PivotFront/Front";
// (P_LEye.x -0.140625 + PivotFront.x 0.015625) × 32 px/unit = -4 px.
const FREE_EYE_BASE_DX = 4;

const FREE_EYE_CLOSE_BONE =
  "Root/BodySet/P_Body/HeadSet/P_Head/P_Eye/P_LClose/PivotFront/Front";

// A free layer's base placement: the part's own adjustment plus the anchor
// compensation, so an authored dx stays measured from the head's centre line.
// `perBone` is deliberately dropped — a free layer is one stamp.
function freeEyeBase(adj: PartAdjustment | undefined): PartNudge {
  return {
    dx: (adj?.dx ?? 0) + FREE_EYE_BASE_DX,
    dy: adj?.dy,
    scaleX: adj?.scaleX,
    scaleY: adj?.scaleY,
  };
}

export const SLOT_REGION_TO_BONE: Record<SpumSlot, Record<string, string | string[]>> = {
  body: {
    Head: "Root/BodySet/P_Body/HeadSet/P_Head/P_Head/5_Head",
    Body: "Root/BodySet/P_Body/Body",
    Arm_L: "Root/BodySet/P_Body/ArmSet/ArmL/P_LArm/P_Arm/20_L_Arm",
    Arm_R: "Root/BodySet/P_Body/ArmSet/ArmR/P_RArm/P_Arm/-20_R_Arm",
    Foot_L: "Root/P_LFoot/_3L_Foot",
    Foot_R: "Root/P_RFoot/_12R_Foot",
  },
  // faceHair declared before hair so its sprites paint AFTER body's head
  // slice (both sit at sortingOrder 5 — DOM order breaks the tie).
  faceHair: {
    FaceHair: "Root/BodySet/P_Body/HeadSet/P_Head/P_Mustache/6_FaceHair",
  },
  hair: {
    Hair: "Root/BodySet/P_Body/HeadSet/P_Head/P_Hair/7_Hair",
  },
  cloth: {
    Body: "Root/BodySet/P_Body/Body/P_ClothBody/ClothBody",
    Right: "Root/BodySet/P_Body/ArmSet/ArmR/P_RArm/P_Arm/-20_R_Arm/P_RCArm/-19_RCArm",
    Left: "Root/BodySet/P_Body/ArmSet/ArmL/P_LArm/P_Arm/20_L_Arm/P_LCArm/21_LCArm",
  },
  pant: {
    Right: "Root/P_RFoot/P_RCloth/_11R_Cloth",
    Left: "Root/P_LFoot/P_LCloth/_2L_Cloth",
  },
  eye: {
    Back: [
      "Root/BodySet/P_Body/HeadSet/P_Head/P_Eye/P_LEye/PivotBack/Back",
      "Root/BodySet/P_Body/HeadSet/P_Head/P_Eye/P_REye/PivotBack/Back",
    ],
    Front: [
      "Root/BodySet/P_Body/HeadSet/P_Head/P_Eye/P_LEye/PivotFront/Front",
      "Root/BodySet/P_Body/HeadSet/P_Head/P_Eye/P_REye/PivotFront/Front",
    ],
    // Free eye layer — see FREE_EYE_REGION below. One stamp, not two.
    Free: FREE_EYE_BONE,
  },
  helmet: {
    Helmet: "Root/BodySet/P_Body/HeadSet/P_Head/P_Helmet/12_Helmet2 ",
  },
  weapon: {
    Weapon: "Root/BodySet/P_Body/ArmSet/ArmR/P_RArm/P_Weapon/R_Weapon",
  },
  weapon2: {
    Weapon: "Root/BodySet/P_Body/ArmSet/ArmL/P_LArm/P_Weapon/L_Weapon",
  },
  back: {
    Back: "Root/BodySet/P_Body/P_Back/Back",
  },
  armor: {
    Body: "Root/BodySet/P_Body/Body/P_ArmorBody/BodyArmor",
    Right:
      "Root/BodySet/P_Body/ArmSet/ArmR/P_RArm/P_Arm/-20_R_Arm/P_Shoulder/-15_R_Shoulder",
    Left:
      "Root/BodySet/P_Body/ArmSet/ArmL/P_LArm/P_Arm/20_L_Arm/P_Shoulder/25_L_Shoulder",
  },
};

// Shield-aware bone override for the two weapon slots. SPUM's prefab ships a
// SECOND pair of weapon SpriteRenderers (`R_Shield` / `L_Shield`) parented to
// `P_Shield` bones angled at ±45° instead of P_Weapon's 60°/120° — that ±45°
// tilt is what holds a shield "raised across the body" instead of pointing it
// sideways like a sword. `SPUM_SpriteEditManager.SetWeapon()` in the source
// routes any sprite whose name contains "Shield" to the *_Shield renderer,
// else to *_Weapon. We reproduce that runtime swap in `slicesByBone` — when
// the weapon/weapon2 part is a shield, the slice's bone path is rewritten
// from *_Weapon to *_Shield, and the slice's z is also overridden when
// needed (see `zOverride` below).
//
// `zOverride` (left-hand only): L_Shield's prefab sortingOrder is 25, which
// TIES with the same-side shoulder armor `25_L_Shoulder` (also 25). Unity
// breaks the tie by hierarchy order — P_Shield is the LAST child of P_LArm,
// so L_Shield wins and the held shield renders in front of the shoulder
// plate. Our flat-slice DOM render breaks ties by insertion order, and
// `armor` iterates after `weapon2` in `SLOT_REGION_TO_BONE`, so armor would
// win the tie and obscure the shield. Bumping the shield slice's z to 26
// (one step above the tied armor) reproduces SPUM's hierarchy-order
// tiebreak. R_Shield (sortingOrder -21) is left alone — SPUM only ever
// routes shields to "Left", so the right-hand shield bone is effectively
// the "shield slung on the back" decoration position, and a user picking a
// shield in the right hand inherits that (back-slung) z by design.
type ShieldBoneOverride = { path: string; zOverride?: number };

const WEAPON_SHIELD_BONE: Record<"weapon" | "weapon2", ShieldBoneOverride> = {
  weapon: {
    path: "Root/BodySet/P_Body/ArmSet/ArmR/P_RArm/P_Shield/R_Shield",
  },
  weapon2: {
    path: "Root/BodySet/P_Body/ArmSet/ArmL/P_LArm/P_Shield/L_Shield",
    zOverride: 26,
  },
};

// Closed-eye sprite is always Eye_Close.png — the prefab hardwires both
// P_LClose/PivotFront/Front and P_RClose/PivotFront/Front to render
// Eye_Close's "Back" region (yes — the prefab uses the "Back" region of
// Eye_Close on GameObjects named "Front"; SPUM's naming is internally
// inconsistent). The renderer loads this atlas in parallel with the user's
// chosen `eye` part and switches between open/closed via the m_IsActive
// visibility tracks on P_LEye/P_REye vs P_LClose/P_RClose.
const EYE_CLOSE_PART = "Eye_Close";
const EYE_CLOSE_REGION = "Back";
const EYE_CLOSE_BONES = [
  "Root/BodySet/P_Body/HeadSet/P_Head/P_Eye/P_LClose/PivotFront/Front",
  "Root/BodySet/P_Body/HeadSet/P_Head/P_Eye/P_RClose/PivotFront/Front",
];

// Eyes paint above hair AND helmet.
//
// The prefab sorts the eye bones at 6/7: level with hair (6, which eyes win on
// DOM order since `eye` is declared after `hair` in SLOT_REGION_TO_BONE) but
// UNDER the helmet (11/12). That's fine for SPUM's stock 1×3-px sliver — it
// sits low on the face where no helmet reaches — but a free eye layer (or any
// tall custom eye) is wide enough that a helmet's brow band slices straight
// through it. Every eye bone therefore gets a constant lift at render time.
//
// A CONSTANT lift, not fixed z values: the offset preserves the internal
// ordering the prefab encodes (Back under Front, left under right) including
// the DOM-order ties, so only the eyes-vs-hair/helmet relationship changes.
// 6/7 → 14/15 clears the helmet at 12 and still lands below the arms
// (L_Weapon 19, 20_L_Arm 20), so a raised arm keeps occluding the face.
//
// The prefix covers every eye bone in one test — open (P_LEye/P_REye), blink
// (P_LClose/P_RClose), both pivots, and the free layer all hang under P_Eye.
const EYE_BONE_PREFIX = "Root/BodySet/P_Body/HeadSet/P_Head/P_Eye/";
const EYE_Z_LIFT = 8;

export type SpumCharacterProps = {
  config: CharacterConfig;
  // Widened to SceneAnimation for the AA-original clip names. Those are only
  // ever reached with a `clipOverride` supplied (AaSceneCharacter always
  // supplies one); without an override this name becomes a SPUM fetch path
  // and would 404 — which is exactly what content/validation.ts refuses to
  // let an author express.
  animation: SceneAnimation;
  // Apparent size multiplier (1 = base). E12 decomposes this into an
  // integer-multiple internal sprite scale + a small outer CSS remainder so
  // per-source-pixel rendering stays crisp at any size. `scale` is accepted
  // as a backward-compat alias — if both `size` and `scale` are provided,
  // `size` wins.
  size?: number;
  scale?: number;
  facing?: "left" | "right";
  // E21 — playback-speed multiplier. 1 = normal (today's behaviour),
  // 0.5 = half-speed, 2 = double. The rAF accumulates `clipTime` from
  // wall-clock delta × speed, so changing `speed` mid-clip continues
  // smoothly from the current frame (no jump). Ignored when `paused` is
  // true — the editor's scrubber sets `time` directly. Default 1.
  speed?: number;
  // Frame-stepped playback: quantize the clip clock to `stepFps` poses per
  // CLIP-second (wall rate = stepFps × speed), holding each pose as a
  // stable raster between steps. A cadence/style knob. NOTE: it only kills
  // DPR-1 shimmer when steps are sparse enough to read as choppy — at
  // pleasant rates the per-step deltas go sub-pixel and the row-by-row
  // shimmer returns; use `pixelSnap` for that. Undefined = continuous.
  stepFps?: number;
  // Rotation-sway snapping (the anti-ripple knob): quantize each bone's
  // rotation sway around the clip's OWN frame-0 baseline to
  // PIXEL_SNAP_ROT_DEG steps. Continuously interpolated micro-rotations
  // (the ±1–2° idle sways) shear pixel rows a fraction at a time, which
  // nearest-neighbor resamples into a row-by-row shimmer on DPR-1
  // monitors; the quantum zeroes them while real rotations (walk swings)
  // keep animating in discrete steps. The baseline is the clip's frame-0
  // pose — NOT the skeleton rest pose — so sustained authored stances
  // render exactly (an earlier rest-pose baseline shifted stances up to
  // ±2.5°: visibly "leaning" characters). Translations are deliberately
  // NOT snapped: a gliding slice reads as motion, not shimmer, and
  // snapping them made idles choppy. Editor pose overrides bypass the
  // quantization. Undefined = off.
  pixelSnap?: boolean;
  // Scene-clock binding (set by SpumScene). When `clockRef` is provided, the
  // autoplay rAF derives the clip phase from the shared scene-time ref via
  // `clipPhaseAt` instead of free-running — see clipPhase.ts for why (loop
  // determinism). The ref holds `null` once a non-looping scene completes;
  // the rig then falls back to the accumulator, seeded from the last derived
  // phase, so "clips keep looping after the scene settles" still holds.
  // `clockStart` is the scene-time the current clip's phase 0 is anchored to
  // (default 0); ref-backed internally so changes don't restart the rAF.
  clockRef?: MutableRefObject<number | null>;
  clockStart?: number;
  // Playback controls — used by the /admin/spum editor for scrub/pause.
  // When `paused` is true the rAF loop stops and the rig is sampled once at
  // `time` (seconds, clamped to [0, clip.duration]). When `paused` is
  // false/undefined the rig autoplays and `time` is ignored.
  paused?: boolean;
  time?: number;
  // Fires once the clip metadata is known (after every animation change).
  // The editor uses `duration` to size the scrubber.
  onClipLoad?: (info: { duration: number; fps: number }) => void;
  // Debug — all no-ops when undefined/false. Used only by /admin/spum.
  hiddenSlices?: Set<string>;
  // Allow-list counterpart to `hiddenSlices`. When set, only slices whose key
  // appears in this set are rendered (others are skipped entirely — they
  // never enter `sliceRefs`, so the rAF transform-write pass also skips
  // them). Used by the mounted-rider composite to spin up a "back-leg-only"
  // clone that paints under the horse: same character config + clip as the
  // main rider, but only the right-foot slices come through, and the whole
  // clone is rendered as a DOM sibling rendered BEFORE the horse so it
  // sorts behind the horse body. `hiddenSlices` still applies on top — a
  // slice in `visibleSlices` and `hiddenSlices` is hidden.
  visibleSlices?: Set<string>;
  showBoneMarkers?: boolean;
  outlineSlices?: boolean;
  // E16 — bone-transform export. When provided, the rAF loop writes each
  // bone's composed world transform into `.current` after the existing slice
  // pass. See `BoneTransformMap` in types.ts for the coordinate space.
  // `.current` is populated/replaced by this component; consumers should not
  // assume the Map identity persists across renders. No-op when undefined.
  boneTransformRef?: MutableRefObject<BoneTransformMap | null>;
  // E24b — clip data injection. When provided, the renderer SKIPS its
  // `/spum/anims/<animation>.json` fetch and uses this object as the clip.
  // Used by the /admin/spum Clips tab so the editor can mutate the clip
  // (insert/move/delete keyframes) and have the renderer pick up the edits
  // without a network round-trip. `animation` is still required (it labels
  // the pose-override lookups + onClipLoad metadata + future track-routing).
  // When `clipOverride` is undefined the renderer behaves exactly as before
  // (fetches by `animation` name) — all existing consumers omit this prop.
  clipOverride?: Clip;
  // E24b — per-bone pose override consumed inside `sampleAt`. Ref-backed so
  // the editor can mutate the map on every drag-handle frame without
  // restarting the rAF effect or triggering a render. For each bone in the
  // map, the renderer substitutes the override's `rot` for the bone's
  // sampled rotation. Bones absent from the map fall through to the clip's
  // sampled value, so the editor can "live edit" one bone without freezing
  // every other bone at its current pose. See R15 in the engine-completeness
  // doc — this is the one non-additive engine touch in E24's phase plan.
  poseOverride?: MutableRefObject<ReadonlyMap<string, BonePose> | null>;
  // Live-preview overlay for per-part placement adjustments, keyed by
  // `adjustmentKey(slot, part)`. An entry here shadows the checked-in
  // PART_ADJUSTMENTS default for that part (an explicit `{}` previews
  // "default removed"). Used by the /admin/spum character editor; production
  // consumers omit it and get the static map.
  partAdjustments?: Record<string, PartAdjustment>;
  // Per-SLOT placement nudge, composed on top of the per-part adjustment for
  // every slice the slot renders. This is the AA characters seam: an AA
  // character stores a placement per worn slot (`AaCharacter.placement`) and
  // the admin converts it to this map (`toSlotAdjustments`). Keyed by slot —
  // NOT by `adjustmentKey`, whose weapon2→weapon fold would make the two
  // hands share one placement. Offsets add, scales multiply, rotations add,
  // flips cancel in pairs with the part-level adjustment. Undefined = exactly
  // today's behaviour.
  slotAdjustments?: Partial<Record<SpumSlot, PartNudge>>;
  // Part Studio — atlas data injection, the sprite-side sibling of
  // `clipOverride`. For each slot present in the map, the renderer uses the
  // provided SpriteAtlas INSTEAD of the atlas fetched for the slot's part in
  // `config` (which must still name some part for the slot so downstream
  // routing — shield checks, adjustments — has a key to work with). The
  // atlas's `image` may be a data:/blob: URL, which is how the editor feeds
  // an in-progress canvas to the rig without a network round-trip or a
  // dev-server write. Applied as a memo overlay on the fetched atlas map —
  // per-stroke updates never refetch the other slots. Undefined = exactly
  // today's behaviour.
  atlasOverrides?: Partial<Record<SpumSlot, SpriteAtlas>>;
  // AA-character seam — resolve a slot+part to its `.atlas.json` URL. Defaults
  // to `atlasPath`, i.e. the SPUM catalog (`SPUM_SPRITES`). A second character
  // pipeline (`/admin/aachar`, see docs/aachar-plan.md) passes its own resolver
  // so its parts never need registering in `lib/spum/catalog.ts`.
  //
  // Resolving the ATLAS is sufficient to redirect the art: slices take their
  // PNG from the atlas's own `image` field (see the `push(...)` call in
  // `slicesByBone`), so the sprite follows the atlas wherever it points.
  // Undefined = exactly today's behaviour.
  resolvePart?: (slot: string, part: string) => string;
  // AA-character seam — use this skeleton instead of fetching
  // `/spum/skeleton.json`. The sibling of `clipOverride` on the rig side: the
  // AA pipeline stores per-character `defaultPos` overrides (proportions) and
  // composes a modified skeleton client-side rather than shipping a second
  // skeleton file.
  //
  // Only affects bones a clip has no track for — clips write ABSOLUTE local
  // positions and override `defaultPos` outright (see the `sampleAt` merge),
  // so overriding an animated bone's default is a silent no-op. The
  // never-animated proportion bones are catalogued in docs/aachar-plan.md §3.
  skeletonOverride?: Skeleton;
};

const BONE_MARKER_PALETTE = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#06b6d4",
  "#3b82f6",
  "#a855f7",
  "#ec4899",
];

function boneMarkerColor(path: string): string {
  let h = 0;
  for (let i = 0; i < path.length; i++) h = (h * 31 + path.charCodeAt(i)) | 0;
  return BONE_MARKER_PALETTE[Math.abs(h) % BONE_MARKER_PALETTE.length];
}

type TreeNode = { bone: Bone; children: TreeNode[] };
type AtlasSlice = {
  key: string;
  image: string;
  x: number;
  y: number;
  width: number;
  height: number;
  pivotX: number;
  pivotY: number;
  // Per-part placement adjustment (PART_ADJUSTMENTS / editor preview):
  // per-axis multipliers folded into the slice's render scale.
  // 1/undefined = native. An atlas's `pixelDensity` (hi-res parts) is folded
  // in here too, as 1/density on both axes.
  scaleX?: number;
  scaleY?: number;
  // Rotation about the pivot (degrees, + = clockwise on screen) and a
  // horizontal mirror about the pivot, from the part/slot adjustment. The
  // rotate sits OUTSIDE the flip in the transform chain so its on-screen
  // direction doesn't invert on a mirrored slice.
  rot?: number;
  flipX?: boolean;
  // Render smoothly (`image-rendering: auto`) instead of pixelated — set from
  // the atlas's `smooth` flag for imported hi-res art.
  smooth?: boolean;
};

function buildTree(skeleton: Skeleton): TreeNode {
  const byPath = new Map<string, TreeNode>();
  for (const bone of skeleton.bones) {
    byPath.set(bone.path, { bone, children: [] });
  }
  let root: TreeNode | null = null;
  for (const bone of skeleton.bones) {
    const node = byPath.get(bone.path);
    if (!node) continue;
    if (bone.parent === null) {
      root = node;
    } else {
      const parent = byPath.get(bone.parent);
      parent?.children.push(node);
    }
  }
  if (!root) throw new Error("SPUM skeleton has no root bone");
  return root;
}

// Rendering model: flat-slice hoist.
//
// Bones are rendered as a nested DOM tree purely for debug ergonomics — each
// bone div is a 0×0 transform anchor whose composed CSS transform reflects
// its world-space position, so `document.querySelector('[data-bone=...]')` +
// `getBoundingClientRect` and the bone-marker debug toggle still work. Bone
// divs host no sprites and have no `zIndex`; they exist only as positional
// reference points.
//
// Every sprite slice renders as a flat sibling of the bone tree directly
// under the SpumCharacter root container. Each slice carries:
//   - its own `zIndex = bone.sortingOrder` (negative values supported), so
//     back-of-body parts (right arm at -20, P_Back, future helmet-back/
//     shield-back) drop behind the body without fighting stacking-context
//     constraints
//   - a per-frame world transform composed in JS by walking the bone path
//     root→leaf and concatenating each ancestor's local transform string,
//     then appending the slice's pivot-anchored scale
//     (`${world} scale(SPRITE_SCALE) translate(-originX, -originY)` with
//     `transform-origin: 0 0`)
//
// Why this model: an earlier iteration kept slices nested inside their bone
// divs and rolled `sortingOrder` up the tree as `max(own, descendants)`. That
// worked for most parts but couldn't render the right arm behind the body —
// `ArmSet` wraps both arms in one subtree, so the rolled-up z forced the
// whole subtree to paint at the frontmost arm's z. Hoisting slices out of
// the stacking-context hierarchy fixes the class of bug rather than point-
// fixing ArmSet: any future back-of-body part with a negative sortingOrder
// now stacks correctly without renderer changes.
//
// Compute cost: ~12 slices × ~3 ancestor bones = ~36 string concats per
// frame, plus ~10 bone local-transform recomputations. Trivial vs the prior
// ~10 bone updates.
// Compose a per-slice CSS `filter` value from the tint (an `url(#...)` ref to
// the per-character feColorMatrix) and a per-slot appearance filter chain
// (E1c — `brightness(...) contrast(...) ...`). Returns undefined when both
// inputs are absent so the slice div carries no `filter` style at all,
// keeping the rendered DOM byte-identical to today for plain slices.
function composeSliceFilter(
  tint: string | undefined,
  perSlot: string | undefined,
): string | undefined {
  if (tint && perSlot) return `${tint} ${perSlot}`;
  return tint ?? perSlot;
}

// SPUM sprite pivots are normalised to the sprite's own rect and should lie
// within [0, 1]. Some addon-pack assets ship pivots outside that range — e.g.
// the "2D Monster Undead" pack's cloth `Body` sprite carries `pivot.y` ≈ 1.67
// (the anchor sits *above* a 3px-tall scrap). Those values encode an offset
// against that pack's own rig; rendered on our shared skeleton they fling the
// slice far from its bone — the Undead cloth scrap drops down past the feet
// and reads as a stray pixel blob under the character. Clamping to [0, 1]
// keeps every slice anchored within its own bounds: a sane fallback that
// trades exact Unity parity (already lost on the shared skeleton) for
// "stays attached to its bone".
function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

// Parse `#abc` or `#aabbcc` into [r, g, b] in 0..255. Caller responsible for
// passing only the regex-validated forms — schema rejects everything else.
function parseHexRgb(hex: string): [number, number, number] {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

// Slice keys are `slot:region` or `slot:region#i` (the `#i` disambiguates
// multi-bone targets like Eye's L/R). Returns the bare slot string.
function slotFromSliceKey(key: string): string {
  const colon = key.indexOf(":");
  return colon < 0 ? key : key.slice(0, colon);
}

// Returns the region part of a slice key, stripping any `#i` disambiguator.
function regionFromSliceKey(key: string): string {
  const colon = key.indexOf(":");
  if (colon < 0) return "";
  const rest = key.slice(colon + 1);
  const hash = rest.indexOf("#");
  return hash < 0 ? rest : rest.slice(0, hash);
}

// Resolve which hex (if any) tints a given slice. Mirrors SPUM's per-slot
// `SpriteRenderer.color` mechanic — see Decisions Log "Per-slot tint via SVG
// feColorMatrix" in docs/spum-engine-completeness.md.
//   - Eye sclera (region `Back`): always untinted. SPUM's prefab carries
//     `ignoreColorPart: [Back]` on the Eye button, so the "Eye colour" picker
//     in SPUM only affects the iris. We replicate that hardcoded rule rather
//     than generalising `ignoreColorPart` since this is the only populated
//     case in SPUM's source.
//   - Eye iris (region `Front`): falls back colors.eyeIris → colors.eye →
//     untinted. eyeIris is a separate addressable channel because SPUM's
//     prefab ships a non-identity default specifically on the iris
//     (`{0.278, 0.102, 0.102}` — dark brown) while letting authors tweak the
//     "eye colour" independently.
//   - Eye-close sprite (synthetic slot `eyeClose`): untinted. It's the
//     eyelash, not part of the eye structure SPUM tints.
//   - Every other slot: `colors[slot]` directly.
function resolveSliceTint(sliceKey: string, colors: CharacterColors | undefined): string | undefined {
  if (!colors) return undefined;
  const slot = slotFromSliceKey(sliceKey);
  const region = regionFromSliceKey(sliceKey);
  if (slot === "eyeClose") return undefined;
  if (slot === "eye") {
    if (region === "Back") return undefined;
    if (region === "Front") return colors.eyeIris ?? colors.eye;
    // A free layer is one sprite — there's no sclera/iris split to honour, so
    // it takes the eye-colour channel whole. Untinted unless a scene asks for
    // a colour, which is the sane default for hand-drawn eyes.
    if (region === FREE_EYE_REGION) return colors.eyeIris ?? colors.eye;
    return undefined;
  }
  return (colors as Record<string, string | undefined>)[slot];
}

function unityRotToCss(rotZ: number): number {
  return -rotZ;
}

function unityPosToCss(
  x: number,
  y: number,
  unitPx: number,
): { x: number; y: number } {
  return { x: x * unitPx, y: -y * unitPx };
}

function localTransformCss(
  pos: { x: number; y: number },
  rotZ: number,
  unitPx: number,
): string {
  const css = unityPosToCss(pos.x, pos.y, unitPx);
  return `translate(${css.x}px, ${css.y}px) rotate(${unityRotToCss(rotZ)}deg)`;
}

// pixelSnap rotation quantum (Unity degrees). Big enough to zero the ±1–2°
// idle micro-sways (the DPR-1 shimmer source), small enough that a walk
// cycle's ~30° arm swing still gets several distinct poses.
const PIXEL_SNAP_ROT_DEG = 5;

function defaultLocalTransform(bone: Bone, unitPx: number): string {
  return localTransformCss(bone.defaultPos, bone.defaultRot.z, unitPx);
}

function defaultWorldTransform(
  bone: Bone,
  bonesByPath: Map<string, Bone>,
  unitPx: number,
): string {
  const chain: string[] = [];
  let current: Bone | undefined = bone;
  while (current) {
    chain.unshift(defaultLocalTransform(current, unitPx));
    current = current.parent ? bonesByPath.get(current.parent) : undefined;
  }
  return chain.join(" ");
}

export function SpumCharacter({
  config,
  animation,
  size,
  scale,
  facing = "left",
  speed = 1,
  stepFps,
  pixelSnap,
  clockRef,
  clockStart = 0,
  paused,
  time,
  onClipLoad,
  hiddenSlices,
  visibleSlices,
  showBoneMarkers,
  outlineSlices,
  boneTransformRef,
  clipOverride,
  poseOverride,
  partAdjustments,
  slotAdjustments,
  atlasOverrides,
  resolvePart,
  skeletonOverride,
}: SpumCharacterProps) {
  // E21 — keep the current speed in a ref so a mid-clip speed change doesn't
  // restart the rAF loop. The tick reads `speedRef.current` each frame so
  // accumulated `clipTime` stays continuous when speed changes (e.g. slowing
  // a throw down from 1× to 0.5× mid-arc continues from wherever the clip
  // currently is rather than snapping back to t=0).
  const speedRef = useRef(speed);
  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);
  // Scene-clock anchor — same ref pattern as `speedRef` so a `play` action
  // re-anchoring the clip (new clockStart, same clip) doesn't restart the
  // rAF; the tick reads the live value each frame.
  const clockStartRef = useRef(clockStart);
  useEffect(() => {
    clockStartRef.current = clockStart;
  }, [clockStart]);
  // E12 sizing-knob decomposition. `size` is the apparent multiplier
  // (1 = base). The browser renders crispest with `image-rendering: pixelated`
  // when each source pixel maps to an integer number of CSS pixels — so we
  // pick the nearest integer to `BASE_SPRITE_SCALE * size`, render the slices
  // and position the bones using that integer (and a matching unitPx so the
  // 32-source-pixels-per-Unity-unit ratio is preserved), then apply a small
  // outer CSS scale (~0.97–1.03) to recover the requested apparent size.
  // `scale` accepted as a backward-compat alias for `size`.
  const apparentSize = size ?? scale ?? 1;
  const effectiveSpriteScale = Math.max(
    1,
    Math.round(BASE_SPRITE_SCALE * apparentSize),
  );
  const effectiveUnitPx = effectiveSpriteScale * 32;
  const outerRemainderScale =
    (BASE_SPRITE_SCALE * apparentSize) / effectiveSpriteScale;

  const [skeleton, setSkeleton] = useState<Skeleton | null>(null);
  const [clip, setClip] = useState<Clip | null>(null);
  const [atlases, setAtlases] = useState<Partial<Record<SpumSlot, SpriteAtlas>>>({});
  const boneRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Atlas-URL resolver. Defaults to the SPUM catalog lookup; the AA-character
  // pipeline injects its own. Consumers passing `resolvePart` should memoize
  // it — it's a dependency of the atlas fetch effects, so a fresh identity
  // every render would refetch every slot's atlas on every render. (Omitting
  // the prop is stable by definition, which is why no existing consumer is
  // affected.)
  const resolveAtlasUrl = useMemo(
    () =>
      resolvePart ??
      ((slot: string, part: string) =>
        atlasPath(slot as SpumSlot, part as SpumPart<SpumSlot>)),
    [resolvePart],
  );

  // E24b — when `clipOverride` is provided the renderer uses that object
  // instead of fetching. This is how the /admin/spum Clips tab feeds
  // in-progress edits to the rig. The skeleton fetch stays unconditional
  // (one-shot, doesn't depend on the active clip). The clip path branches:
  // override → setState directly + fire onClipLoad with the override's
  // metadata; no override → fall back to the original network fetch by
  // `animation` name. Both arms write into the same `clip` state so the
  // downstream rAF tick reads from one source.
  useEffect(() => {
    if (skeletonOverride) {
      setSkeleton(skeletonOverride);
      return;
    }
    let cancelled = false;
    fetch("/spum/skeleton.json")
      .then((r) => r.json() as Promise<Skeleton>)
      .then((s) => {
        if (!cancelled) setSkeleton(s);
      });
    return () => {
      cancelled = true;
    };
  }, [skeletonOverride]);

  useEffect(() => {
    if (clipOverride) {
      setClip(clipOverride);
      onClipLoad?.({ duration: clipOverride.duration, fps: clipOverride.fps });
      return;
    }
    let cancelled = false;
    fetch(`/spum/anims/${animation}.json`)
      .then((r) => r.json() as Promise<Clip>)
      .then((c) => {
        if (!cancelled) {
          setClip(c);
          onClipLoad?.({ duration: c.duration, fps: c.fps });
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animation, clipOverride]);

  const [eyeCloseAtlas, setEyeCloseAtlas] = useState<SpriteAtlas | null>(null);

  // Re-fetch each slot's atlas when its part changes. Storing per-slot keeps
  // the atlas-slice memo stable for slots that didn't change. Entries with
  // undefined parts (optional slots like `eye`) are skipped. The key is
  // derived only from the part picks — non-atlas fields (colours, global
  // appearance, per-slot appearance) must not invalidate this effect or
  // dragging an appearance slider would refetch every atlas per tick.
  const slotKeys = useMemo(() => Object.keys(SLOT_REGION_TO_BONE) as SpumSlot[], []);
  const configKey = useMemo(
    () =>
      slotKeys
        .map((s) => `${s}:${(config as Record<string, unknown>)[s] ?? ""}`)
        .join("|"),
    [config, slotKeys],
  );
  useEffect(() => {
    let cancelled = false;
    setAtlases({});
    // Only iterate sprite-bearing slots. CharacterConfig also carries non-
    // slot fields (`colors`, `appearance`, `appearancePerSlot`) — filter
    // against the slot-key set so `atlasPath("colors", ...)` doesn't try to
    // look up a non-existent slot in SPUM_SPRITES and crash.
    const slotKeySet = new Set<string>(slotKeys);
    const entries = (Object.entries(config) as [string, unknown][])
      .filter((e): e is [SpumSlot, string] => slotKeySet.has(e[0]) && typeof e[1] === "string");
    Promise.all(
      entries.map(([slot, part]) =>
        fetch(resolveAtlasUrl(slot, part))
          .then((r) => r.json() as Promise<SpriteAtlas>)
          .then((atlas) => [slot, atlas] as const),
      ),
    ).then((results) => {
      if (cancelled) return;
      const next: Partial<Record<SpumSlot, SpriteAtlas>> = {};
      for (const [slot, atlas] of results) next[slot] = atlas;
      setAtlases(next);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configKey, resolveAtlasUrl]);

  // Eye_Close.png loads in parallel with whatever the user picked for `eye` so
  // P_LClose/P_RClose have a sprite ready to show the instant a visibility
  // track flips them on. Loaded only when an eye is selected; without an eye
  // the head stays featureless (no point loading just the eyelash sprite).
  const hasEye = config.eye !== undefined;
  useEffect(() => {
    if (!hasEye) {
      setEyeCloseAtlas(null);
      return;
    }
    let cancelled = false;
    fetch(resolveAtlasUrl("eye", EYE_CLOSE_PART))
      .then((r) => r.json() as Promise<SpriteAtlas>)
      .then((atlas) => {
        if (!cancelled) setEyeCloseAtlas(atlas);
      });
    return () => {
      cancelled = true;
    };
  }, [hasEye, resolveAtlasUrl]);

  const tree = useMemo(() => (skeleton ? buildTree(skeleton) : null), [skeleton]);

  const bonesByPath = useMemo(() => {
    if (!skeleton) return null;
    const map = new Map<string, Bone>();
    for (const bone of skeleton.bones) map.set(bone.path, bone);
    return map;
  }, [skeleton]);

  // E23 — drop hair slices when a helmet is set and the helmet's hair-mask
  // default + per-actor override resolve to "hide hair." Cheap to recompute
  // every render (pure function over 2 fields); passed into the slicesByBone
  // memo as a dep so the slice DOM regenerates when the toggle flips.
  const hideHair = resolveHideHair(config);

  // Part Studio overlay — an override atlas shadows the fetched atlas for its
  // slot. Memo (not merged into the fetch effect) so a per-stroke override
  // update rebuilds slices without refetching untouched slots.
  const effectiveAtlases = useMemo(() => {
    if (!atlasOverrides) return atlases;
    const next = { ...atlases };
    for (const [slot, atlas] of Object.entries(atlasOverrides)) {
      if (atlas) next[slot as SpumSlot] = atlas;
    }
    return next;
  }, [atlases, atlasOverrides]);

  const slicesByBone = useMemo(() => {
    const map = new Map<string, AtlasSlice[]>();
    const push = (bonePath: string, key: string, image: string, region: { x: number; y: number; width: number; height: number; pivot: { x: number; y: number } }, adj?: PartNudge, atlasOpts?: { pixelDensity?: number; smooth?: boolean }) => {
      const list = map.get(bonePath) ?? [];
      // Per-part placement adjustment: dx/dy are source-sprite px (+dy = up),
      // folded into the pivot (which anchors the slice to the bone origin, so
      // moving the pivot moves the sprite the opposite way). Applied AFTER
      // clamp01 — the clamp guards against garbage pack pivots; an authored
      // adjustment may legitimately push the anchor outside the sprite rect.
      // Under a flip the pivot fold runs through scaleX(-1), so dx is negated
      // here to keep its screen meaning (+dx = right) either way.
      const dx = (adj?.flipX ? -1 : 1) * (adj?.dx ?? 0);
      const dy = adj?.dy ?? 0;
      // Hi-res atlas: region rects are native px, 1/pixelDensity folds into the
      // render scale so the art occupies `size / density` logical px. Pivot and
      // origin math stay in native px — the translate happens inside the scaled
      // frame, so it comes out right without further conversion. When density
      // is 1 (every pre-existing atlas) the slice is byte-identical to before.
      const k = atlasOpts?.pixelDensity && atlasOpts.pixelDensity !== 1 ? 1 / atlasOpts.pixelDensity : 1;
      list.push({
        key,
        image,
        x: region.x,
        y: region.y,
        width: region.width,
        height: region.height,
        pivotX: clamp01(region.pivot.x) - dx / region.width,
        pivotY: clamp01(region.pivot.y) - dy / region.height,
        scaleX: k !== 1 ? (adj?.scaleX ?? 1) * k : adj?.scaleX,
        scaleY: k !== 1 ? (adj?.scaleY ?? 1) * k : adj?.scaleY,
        ...(adj?.rot ? { rot: adj.rot } : {}),
        ...(adj?.flipX ? { flipX: true } : {}),
        ...(atlasOpts?.smooth ? { smooth: true } : {}),
      });
      map.set(bonePath, list);
    };
    (Object.keys(SLOT_REGION_TO_BONE) as SpumSlot[]).forEach((slot) => {
      // E23 — when the hair mask is on, omit hair slices entirely so they
      // don't allocate slice refs or burn rAF transform writes. Bone tree
      // is unaffected — the `7_Hair` bone still renders as a 0×0 transform
      // anchor for debug tooling.
      if (slot === "hair" && hideHair) return;
      const atlas = effectiveAtlases[slot];
      if (!atlas) return;
      const regionToBone = SLOT_REGION_TO_BONE[slot];
      // A free eye layer replaces the two-bone Back/Front stamping outright —
      // see FREE_EYE_REGION. Skipping them here (rather than requiring the
      // atlas to omit them) means a part converted from a stock template can
      // keep its old regions without ghost eyes showing through.
      const freeEye = slot === "eye" && atlas.regions[FREE_EYE_REGION] !== undefined;
      // For weapon/weapon2, if the selected part is a shield, route the slice
      // to the P_Shield bone instead of P_Weapon — see WEAPON_SHIELD_BONE.
      const shieldBone =
        (slot === "weapon" || slot === "weapon2") &&
        typeof config[slot] === "string" &&
        isShieldPart(config[slot] as WeaponPart)
          ? WEAPON_SHIELD_BONE[slot].path
          : null;
      for (const [regionName, bonePathOrPaths] of Object.entries(regionToBone)) {
        const region = atlas.regions[regionName];
        if (!region) continue;
        if (slot === "eye") {
          if (freeEye && regionName !== FREE_EYE_REGION) continue;
          if (!freeEye && regionName === FREE_EYE_REGION) continue;
        }
        // Region values are `string | string[]` so one region can render at
        // multiple bones (Eye's Back/Front feed both L and R sides). Normalise
        // to an array; each target gets its own slice with a disambiguated key
        // so the React reconciler and the rAF loop can address them
        // independently.
        const rawBones = Array.isArray(bonePathOrPaths) ? bonePathOrPaths : [bonePathOrPaths];
        const bones = shieldBone ? rawBones.map(() => shieldBone) : rawBones;
        const adj = resolveAdjustment(slot, config[slot] as string, partAdjustments);
        // The free layer's bone sits left of the head's centre line; fold the
        // compensation in so authored dx stays measured from centre.
        // A slot-level placement (AA characters) composes on top of the
        // part-level base, before any per-stamp delta.
        const base: PartNudge | undefined = composeNudge(
          regionName === FREE_EYE_REGION ? freeEyeBase(adj) : adj,
          slotAdjustments?.[slot],
        );
        bones.forEach((bonePath, idx) => {
          const suffix = bones.length > 1 ? `#${idx}` : "";
          // Per-stamp deltas (eye L/R) layer on top of the base adjustment.
          const nudge = bones.length > 1 ? composeNudge(base, adj?.perBone?.[idx]) : base;
          push(
            bonePath,
            `${slot}:${regionName}${suffix}`,
            atlas.image,
            region,
            nudge,
            atlas,
          );
        });
      }
    });
    // Blink art. Normally Eye_Close.png renders on BOTH close bones regardless
    // of which open-eye sprite the user picked — it's loaded as a sibling
    // atlas (eyeCloseAtlas) so the bones have something to show the instant a
    // clip's visibility track flips them on.
    //
    // A free eye layer takes its blink art with it: stamping the stock eyelash
    // twice at the L/R bone positions underneath a hand-placed pair reads as a
    // glitch. So it renders once, on the left close bone, carrying the same
    // placement as the open layer — and if the author drew their own
    // `FreeClose` region, that art replaces Eye_Close entirely.
    const eyeAtlas = effectiveAtlases.eye;
    const freeEyeLayer = eyeAtlas?.regions[FREE_EYE_REGION] !== undefined;
    if (freeEyeLayer && eyeAtlas) {
      const own = eyeAtlas.regions[FREE_EYE_CLOSE_REGION];
      if (own) {
        const base = freeEyeBase(
          resolveAdjustment("eye", config.eye as string, partAdjustments),
        );
        push(FREE_EYE_CLOSE_BONE, `eyeClose:${FREE_EYE_CLOSE_REGION}`, eyeAtlas.image, own, base, eyeAtlas);
      } else if (eyeCloseAtlas) {
        // Stock eyelash under a free layer: it keeps its own stock geometry,
        // so the part's placement (tuned for the author's wide art) must not
        // drag it around.
        const region = eyeCloseAtlas.regions[EYE_CLOSE_REGION];
        if (region) {
          push(FREE_EYE_CLOSE_BONE, `eyeClose:${EYE_CLOSE_REGION}`, eyeCloseAtlas.image, region);
        }
      }
    } else if (eyeCloseAtlas) {
      const region = eyeCloseAtlas.regions[EYE_CLOSE_REGION];
      if (region) {
        EYE_CLOSE_BONES.forEach((bonePath, idx) => {
          push(bonePath, `eyeClose:${EYE_CLOSE_REGION}#${idx}`, eyeCloseAtlas.image, region);
        });
      }
    }
    return map;
    // `config.weapon` / `config.weapon2` are read inside the loop to decide
    // whether to route the slice to the P_Shield bone, so they need their own
    // deps — `atlases` happens to refire on part swap (the atlas refetch uses
    // configKey) but the dep list should be explicit about what's read.
    // `partAdjustments` (editor live-preview) rebuilds slices on change; the
    // static PART_ADJUSTMENTS map only changes via module reload (HMR/deploy).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveAtlases, eyeCloseAtlas, hideHair, config.weapon, config.weapon2, config.eye, partAdjustments, slotAdjustments]);

  // Flat list of every slice that will be rendered as a sibling of the bone
  // tree. Each entry carries its target bone path + sortingOrder so the
  // render path and rAF loop can drive it without re-traversing the tree.
  const flatSlices = useMemo(() => {
    if (!bonesByPath) return [];
    const list: { slice: AtlasSlice; bonePath: string; sortingOrder: number }[] = [];
    slicesByBone.forEach((slices, bonePath) => {
      const bone = bonesByPath.get(bonePath);
      if (!bone) return;
      // Look up a per-bone-path z override — used for L_Shield, which ties
      // with the same-side shoulder armor in the prefab and would otherwise
      // lose the DOM-order tiebreak to armor. See WEAPON_SHIELD_BONE.
      const zOverride =
        bonePath === WEAPON_SHIELD_BONE.weapon2.path
          ? WEAPON_SHIELD_BONE.weapon2.zOverride
          : bonePath === WEAPON_SHIELD_BONE.weapon.path
            ? WEAPON_SHIELD_BONE.weapon.zOverride
            : undefined;
      // Eye bones ride a constant lift above hair/helmet — see EYE_Z_LIFT.
      const eyeLift = bonePath.startsWith(EYE_BONE_PREFIX) ? EYE_Z_LIFT : 0;
      const sortingOrder = zOverride ?? (bone.sortingOrder ?? 0) + eyeLift;
      for (const slice of slices) {
        list.push({ slice, bonePath, sortingOrder });
      }
    });
    return list;
  }, [slicesByBone, bonesByPath]);

  const sliceRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  useEffect(() => {
    if (!clip || !bonesByPath || !skeleton) return;

    // pixelSnap rotation baseline: the clip's OWN pose at t=0, not the
    // skeleton rest pose. Clips hold bones at their own baseline angles;
    // quantizing against the wrong baseline shifts a sustained stance by up
    // to half a quantum (±2.5°) — characters visibly "leaning". Against the
    // frame-0 baseline, the authored stance renders exactly and only the
    // sway AROUND it quantizes (idle's ±1–2° → 0).
    const snapBaseRot = pixelSnap
      ? new Map(
          skeleton.bones.map((bone) => {
            const rotTrack = clip.tracks[bone.path]?.rot;
            return [
              bone.path,
              rotTrack ? sampleRotZ(rotTrack, 0) : bone.defaultRot.z,
            ] as const;
          }),
        )
      : null;

    const sampleAt = (t: number) => {
      // Phase 1: compute every bone's local transform for this frame —
      // both the CSS string (for slice/bone-div writes) and the numeric
      // pos/rot (for the E16 boneTransformRef export, when present).
      //
      // E24b/E25a — the per-bone pose override short-circuits the clip's
      // rotation AND position sample independently. Bones absent from the
      // map fall through; bones with only `rot` set retain the clip's pos
      // and vice versa. The ref read happens inside the tick (not closed
      // over a snapshot) so the editor can mutate the map every frame
      // without re-binding the rAF effect.
      const overrideMap = poseOverride?.current ?? null;
      const localXfms = new Map<string, string>();
      const localNums = boneTransformRef
        ? new Map<string, { x: number; y: number; rot: number }>()
        : null;
      for (const bone of skeleton.bones) {
        const track = clip.tracks[bone.path];
        const override = overrideMap?.get(bone.path);
        const pos =
          override?.pos ??
          (track?.pos ? samplePos(track.pos, t) : bone.defaultPos);
        const overrideRotZ = override?.rot?.z;
        const baseRotZ =
          overrideRotZ !== undefined
            ? overrideRotZ
            : track?.rot
              ? sampleRotZ(track.rot, t)
              : bone.defaultRot.z;
        // E31 — additive offset (scene `pose` actions) composes on top of
        // the sampled/overridden rotation so the clip keeps animating.
        let rotZ = baseRotZ + (override?.addRotZ ?? 0);
        // pixelSnap — quantize the clip's rotation SWAY around its frame-0
        // baseline so continuously interpolated micro-rotations (±1–2°
        // idle sways) can't shear pixel rows frame-by-frame ("ripple" on
        // DPR-1 monitors). Translations stay continuous — a gliding slice
        // reads as motion, not shimmer, and snapping them made idles
        // choppy. Editor pose overrides bypass the quantization (they want
        // exact values).
        if (
          pixelSnap &&
          snapBaseRot &&
          overrideRotZ === undefined &&
          !override?.addRotZ
        ) {
          const base = snapBaseRot.get(bone.path) ?? bone.defaultRot.z;
          rotZ =
            base +
            Math.round((rotZ - base) / PIXEL_SNAP_ROT_DEG) *
              PIXEL_SNAP_ROT_DEG;
        }
        const css = unityPosToCss(pos.x, pos.y, effectiveUnitPx);
        localXfms.set(
          bone.path,
          `translate(${css.x}px, ${css.y}px) rotate(${unityRotToCss(rotZ)}deg)`,
        );
        if (localNums) {
          localNums.set(bone.path, { x: css.x, y: css.y, rot: unityRotToCss(rotZ) });
        }
      }

      // Phase 2: push locals to bone divs so getBoundingClientRect / the
      // bone-marker debug overlay still reflect the live pose.
      localXfms.forEach((xfm, path) => {
        const el = boneRefs.current.get(path);
        if (el) el.style.transform = xfm;
      });

      // Phase 3: compose world transforms by walking up the bone tree.
      // Memoized per-frame so siblings sharing ancestors don't re-walk.
      const worldXfms = new Map<string, string>();
      const getWorld = (path: string): string => {
        const cached = worldXfms.get(path);
        if (cached !== undefined) return cached;
        const bone = bonesByPath.get(path);
        if (!bone) {
          worldXfms.set(path, "");
          return "";
        }
        const local = localXfms.get(path) ?? "";
        const parentWorld = bone.parent ? getWorld(bone.parent) : "";
        const world = parentWorld ? `${parentWorld} ${local}` : local;
        worldXfms.set(path, world);
        return world;
      };

      // Phase 3a (E16): compose world pos+rot numerically when an export ref
      // was provided. Same parent-chain memoization pattern as Phase 3, but in
      // numeric form so we can post-multiply by the outer transform (scale +
      // facing flip) and hand a clean { x, y, rotation, scale } per bone to
      // scene-level consumers. Skipped entirely when no ref was provided so
      // the cost (one extra walk + a Map populate per frame) doesn't burn on
      // every character on a static page.
      const worldNums = localNums
        ? new Map<string, { x: number; y: number; rot: number }>()
        : null;
      if (localNums && worldNums) {
        const getWorldNum = (path: string): { x: number; y: number; rot: number } => {
          const cached = worldNums.get(path);
          if (cached !== undefined) return cached;
          const bone = bonesByPath.get(path);
          if (!bone) {
            const zero = { x: 0, y: 0, rot: 0 };
            worldNums.set(path, zero);
            return zero;
          }
          const local = localNums.get(path) ?? { x: 0, y: 0, rot: 0 };
          const parent = bone.parent ? getWorldNum(bone.parent) : { x: 0, y: 0, rot: 0 };
          // CSS transform order is `translate(local) rotate(local)` applied
          // on top of the parent's world. The translate is expressed in the
          // parent's *rotated* frame, so we rotate the local offset by the
          // parent's accumulated world rotation before adding.
          const rad = (parent.rot * Math.PI) / 180;
          const cos = Math.cos(rad);
          const sin = Math.sin(rad);
          const world = {
            x: parent.x + (local.x * cos - local.y * sin),
            y: parent.y + (local.x * sin + local.y * cos),
            rot: parent.rot + local.rot,
          };
          worldNums.set(path, world);
          return world;
        };
        for (const bone of skeleton.bones) getWorldNum(bone.path);
      }

      // Phase 3.5: resolve per-bone visibility. Unity's SetActive(false) on a
      // parent hides all descendants, so accumulate up the chain: a slice is
      // visible iff every ancestor (including itself) is active. Bone-level
      // result is cached so siblings don't re-walk the chain. Sources:
      //   - clip's m_IsActive vis track for this bone (if present, sampled
      //     stepwise — Unity authors with Infinity tangents),
      //   - else the bone's prefab `defaultActive` (currently only false on
      //     P_LClose/P_RClose),
      //   - else true (the default).
      const visByBone = new Map<string, boolean>();
      const getVis = (path: string): boolean => {
        const cached = visByBone.get(path);
        if (cached !== undefined) return cached;
        const bone = bonesByPath.get(path);
        if (!bone) {
          visByBone.set(path, true);
          return true;
        }
        const track = clip.tracks[path];
        let self: boolean;
        if (track?.vis && track.vis.length > 0) {
          self = sampleVis(track.vis, t);
        } else {
          self = bone.defaultActive !== false;
        }
        const parentVis = bone.parent ? getVis(bone.parent) : true;
        const result = self && parentVis;
        visByBone.set(path, result);
        return result;
      };

      // Phase 4: push composed world transform + slice pivot anchor to each
      // flat slice div. transform-origin: 0 0 so the appended
      // `scale(SPRITE_SCALE) translate(-origin)` puts the pivot at the bone
      // origin in slice-local coords, after which the world transform places
      // it at the bone's world position. Visibility tracks toggle the slice's
      // `display` — flicker-cheap vs adding/removing nodes per frame.
      for (const item of flatSlices) {
        const el = sliceRefs.current.get(item.slice.key);
        if (!el) continue;
        const visible = getVis(item.bonePath);
        el.style.display = visible ? "" : "none";
        if (!visible) continue;
        const world = getWorld(item.bonePath);
        const originX = item.slice.pivotX * item.slice.width;
        const originY = (1 - item.slice.pivotY) * item.slice.height;
        // Per-part adjustment scale multiplies the integer sprite scale per
        // axis (squish/stretch in the sprite's own frame); the translate
        // stays in source px so the pivot point holds still while the
        // sprite grows/shrinks around it. An adjustment rotation spins the
        // slice about the pivot (which the translate parks at the bone
        // origin); a flip mirrors it there via a negative x scale.
        const flip = item.slice.flipX ? -1 : 1;
        const spin = item.slice.rot ? `rotate(${item.slice.rot}deg) ` : "";
        const sliceScaleX = effectiveSpriteScale * (item.slice.scaleX ?? 1);
        const sliceScaleY = effectiveSpriteScale * (item.slice.scaleY ?? 1);
        el.style.transform = `${world} ${spin}scale(${sliceScaleX * flip}, ${sliceScaleY}) translate(${-originX}px, ${-originY}px)`;
      }

      // Phase 5 (E16): post-multiply numeric world transforms by the outer
      // transform (outerRemainderScale + optional facing flip) and write into
      // the export ref. Result is in post-outer character-local CSS pixels;
      // scene-level consumers add the actor's scene-pixel position.
      if (worldNums && boneTransformRef) {
        const facingFlip = facing === "right" ? -1 : 1;
        const map: BoneTransformMap =
          boneTransformRef.current ?? new Map<string, BoneTransform>();
        // Iterate skeleton.bones (stable order) and overwrite each entry so
        // stale bones from a previous mount don't linger if the skeleton ever
        // changes. Skeletons are static in v1, but keep this safe.
        map.clear();
        for (const bone of skeleton.bones) {
          const w = worldNums.get(bone.path);
          if (!w) continue;
          map.set(bone.path, {
            x: w.x * outerRemainderScale * facingFlip,
            y: w.y * outerRemainderScale,
            rotation: w.rot * facingFlip,
            scale: apparentSize,
          });
        }
        boneTransformRef.current = map;
      }
    };

    if (paused) {
      const clamped = Math.max(0, Math.min(time ?? 0, clip.duration));
      // E24b — when a consumer is using poseOverride (the Clips-tab editor),
      // we need to re-sample every frame at the same clipped time so
      // mutations to `poseOverride.current` (driven by drag handles) become
      // visible without the consumer having to bump `time` or restart the
      // effect. Other paused consumers (debug-harness scrubber, etc.) keep
      // the original single-shot behaviour — no rAF cost in production.
      if (poseOverride) {
        let raf = 0;
        const tick = () => {
          sampleAt(clamped);
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
      }
      sampleAt(clamped);
      return;
    }

    // Two autoplay clocks:
    //  - Scene-clock mode (`clockRef` holds a number): phase is a pure
    //    function of scene-time (see clipPhase.ts), so scene loops and seeks
    //    keep the rig deterministic against FX / action timings.
    //  - E21 accumulator mode (no clockRef, or the scene completed and set
    //    the ref to null): clipTime accumulates wall-clock delta × current
    //    speed each frame so a mid-clip speed change continues smoothly.
    //    `lastNow` stays fresh in scene-clock mode so the handover into
    //    accumulator mode continues from the current phase without a jump.
    let raf = 0;
    let lastNow: number | null = null;
    let clipTime = 0;
    // stepFps hold-tracking: while the quantized time is unchanged the pose
    // is byte-identical, so skip the resample. Pose-override consumers still
    // resample every frame (their refs mutate outside the clock).
    let lastSampled: number | null = null;
    const tick = (now: number) => {
      const clockT = clockRef ? clockRef.current : null;
      if (clockT !== null && clockT !== undefined) {
        clipTime = clipPhaseAt(
          clockT,
          clockStartRef.current,
          speedRef.current,
          clip.duration,
        );
        lastNow = now;
      } else if (lastNow === null) {
        lastNow = now;
      } else {
        const deltaSec = (now - lastNow) / 1000;
        lastNow = now;
        clipTime = (clipTime + deltaSec * speedRef.current) % clip.duration;
        // Guard against negative modulo if a future feature ever lets speed
        // go negative (reverse playback). Today schema rejects negative
        // speeds, so this branch is defensive.
        if (clipTime < 0) clipTime += clip.duration;
      }
      const sampleTime = stepFps
        ? Math.floor(clipTime * stepFps) / stepFps
        : clipTime;
      if (sampleTime !== lastSampled || poseOverride) {
        sampleAt(sampleTime);
        lastSampled = sampleTime;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [
    clip,
    bonesByPath,
    skeleton,
    paused,
    time,
    flatSlices,
    effectiveUnitPx,
    effectiveSpriteScale,
    // E16 — re-create the rAF loop when these change so the export ref
    // reflects the live outer transform. `boneTransformRef` itself is stable
    // across renders (it's a ref) so adding it as a dep is a no-op but
    // documents the intent.
    outerRemainderScale,
    apparentSize,
    facing,
    stepFps,
    pixelSnap,
    boneTransformRef,
    // Scene-clock ref identity is stable for the scene's lifetime (same
    // no-op-but-documents-intent rationale as boneTransformRef). clockStart
    // is deliberately absent — it's read via clockStartRef.
    clockRef,
    // E24b — when paused, the rAF branch is gated on whether
    // `poseOverride` is provided. Re-create the effect when the prop
    // toggles between undefined and a ref so the continuous-resample loop
    // starts/stops correctly. Ref identity itself is stable for the
    // editor's lifetime, so this is a no-op once mounted.
    poseOverride,
  ]);

  // Per-slice tint resolution. Each unique hex used by this character
  // generates one `<feColorMatrix>` filter; slice divs reference it by id.
  // useId() namespaces the filter ids so multiple `<SpumCharacter>` instances
  // on the same page (Scene editor cast row) don't collide. React's id format
  // contains colons that aren't legal in CSS selectors / HTML 4 ids — strip
  // them. The `url(#...)` reference doesn't need CSS escaping because it
  // resolves against the document's ID map, not a selector.
  const reactIdRaw = useId();
  const filterIdPrefix = `spum-tint-${reactIdRaw.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
  const filterIdFor = (hex: string) =>
    `${filterIdPrefix}-${hex.replace("#", "").toLowerCase()}`;

  const sliceTints = useMemo(() => {
    const map = new Map<string, string>();
    if (!config.colors) return map;
    for (const { slice } of flatSlices) {
      const hex = resolveSliceTint(slice.key, config.colors);
      if (hex) map.set(slice.key, hex.toLowerCase());
    }
    return map;
  }, [config.colors, flatSlices]);

  const uniqueTints = useMemo(() => {
    const s = new Set<string>();
    sliceTints.forEach((hex) => s.add(hex));
    return Array.from(s);
  }, [sliceTints]);

  // E1c appearance: precompute per-slot CSS filter strings (so the slice loop
  // doesn't re-emit the function chain per slice). Keys are SpumSlot values;
  // missing/identity entries simply don't appear in the map.
  const slotAppearanceFilter = useMemo(() => {
    const map = new Map<string, string>();
    const per = config.appearancePerSlot;
    if (!per) return map;
    for (const [slot, fields] of Object.entries(per)) {
      const css = cssFilterFromAppearance(fields);
      if (css) map.set(slot, css);
    }
    return map;
  }, [config.appearancePerSlot]);

  const globalAppearanceFilter = useMemo(
    () => cssFilterFromAppearance(config.appearance),
    [config.appearance],
  );

  if (!tree || !bonesByPath) return null;

  // SPUM rigs are authored facing screen-left — that's the natural, unflipped
  // orientation (confirmed against the Character screen, which never passes
  // `facing` and renders every part facing left). `facing: "right"` mirrors
  // the whole character via scaleX(-1).
  const facingTransform = facing === "right" ? "scaleX(-1)" : "";

  return (
    <div
      data-spum-character
      style={{
        position: "relative",
        width: 0,
        height: 0,
        transform: `scale(${outerRemainderScale}) ${facingTransform}`.trim(),
        transformOrigin: "center",
        // E1c global appearance filter — applies to the composited character
        // (slices + their per-slot filters). Skipped entirely when identity
        // so the rendered DOM stays byte-identical to today for plain
        // characters.
        filter: globalAppearanceFilter,
      }}
    >
      {/* SVG filter defs for per-slot tinting (E1). One `<feColorMatrix>` per
          unique hex used by this character; slices reference the matching
          filter by id. `color-interpolation-filters=sRGB` matches Unity's
          gamma-space multiply (`SpriteRenderer.color`) byte-for-byte. The 0×0
          absolutely-positioned <svg> keeps the defs in the DOM without
          contributing to layout. Browsers preserve `image-rendering: pixelated`
          through the filter pass because filters apply post-scaling; the
          `filter` style creates a new stacking context only for the slice's
          (non-existent) descendants, so the negative-z arm hoist is
          unaffected. */}
      {uniqueTints.length > 0 ? (
        <svg
          width={0}
          height={0}
          aria-hidden="true"
          style={{ position: "absolute", width: 0, height: 0, pointerEvents: "none" }}
        >
          <defs>
            {uniqueTints.map((hex) => {
              const [r, g, b] = parseHexRgb(hex);
              const matrix = `${r / 255} 0 0 0 0  0 ${g / 255} 0 0 0  0 0 ${b / 255} 0 0  0 0 0 1 0`;
              return (
                <filter
                  key={hex}
                  id={filterIdFor(hex)}
                  colorInterpolationFilters="sRGB"
                  // The filter region needs to fully cover the slice. Default
                  // is -10%..110% on each axis; that's enough for our small
                  // slices and avoids the manual width/height bookkeeping that
                  // a tighter region would need.
                  x="-10%"
                  y="-10%"
                  width="120%"
                  height="120%"
                >
                  <feColorMatrix type="matrix" values={matrix} />
                </filter>
              );
            })}
          </defs>
        </svg>
      ) : null}

      {/* Bone tree: nested 0×0 transform anchors. No slices, no zIndex —
          exists only so debug tooling can locate bones in DOM. */}
      <BoneNode
        node={tree}
        boneRefs={boneRefs}
        unitPx={effectiveUnitPx}
        showBoneMarkers={showBoneMarkers}
      />

      {/* Flat slices: each carries its own zIndex (= bone.sortingOrder) so
          back-of-body parts can drop behind the body without being trapped
          inside an ancestor stacking context. World transform is computed
          per-frame in the rAF loop above; the initial value here is the
          default pose so we don't flash a frame of un-positioned sprites
          between mount and the first tick. Initial display is `none` for
          slices on bones whose prefab `defaultActive` is false (i.e. eye-
          close bones) so the eyelash sprite doesn't flash visible for one
          frame before the rAF loop applies the clip's vis tracks. */}
      {flatSlices.map(({ slice, bonePath, sortingOrder }) => {
        if (visibleSlices && !visibleSlices.has(slice.key)) return null;
        if (hiddenSlices?.has(slice.key)) return null;
        const bone = bonesByPath.get(bonePath);
        if (!bone) return null;
        const originX = slice.pivotX * slice.width;
        const originY = (1 - slice.pivotY) * slice.height;
        const initialWorld = defaultWorldTransform(bone, bonesByPath, effectiveUnitPx);
        // Walk the chain to compute default visibility — a parent's
        // defaultActive=false hides descendants too.
        let initialActive = true;
        for (
          let cursor: Bone | undefined = bone;
          cursor && initialActive;
          cursor = cursor.parent ? bonesByPath.get(cursor.parent) : undefined
        ) {
          if (cursor.defaultActive === false) initialActive = false;
        }
        return (
          <div
            key={slice.key}
            ref={(el) => {
              if (el) sliceRefs.current.set(slice.key, el);
              else sliceRefs.current.delete(slice.key);
            }}
            data-spum-slice={slice.key}
            data-bone={bonePath}
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: slice.width,
              height: slice.height,
              backgroundImage: `url(${slice.image})`,
              backgroundPosition: `-${slice.x}px -${slice.y}px`,
              backgroundRepeat: "no-repeat",
              transformOrigin: "0 0",
              transform: `${initialWorld} ${slice.rot ? `rotate(${slice.rot}deg) ` : ""}scale(${effectiveSpriteScale * (slice.scaleX ?? 1) * (slice.flipX ? -1 : 1)}, ${effectiveSpriteScale * (slice.scaleY ?? 1)}) translate(${-originX}px, ${-originY}px)`,
              imageRendering: slice.smooth ? "auto" : "pixelated",
              pointerEvents: "none",
              zIndex: sortingOrder,
              display: initialActive ? undefined : "none",
              // Compose tint (SVG filter ref) with the per-slot appearance
              // (CSS filter functions). Either, both, or neither may be set;
              // we omit `filter` entirely when neither applies to keep the
              // rendered DOM byte-identical to today for plain slices.
              filter: composeSliceFilter(
                sliceTints.has(slice.key)
                  ? `url(#${filterIdFor(sliceTints.get(slice.key)!)})`
                  : undefined,
                slotAppearanceFilter.get(slotFromSliceKey(slice.key)),
              ),
              ...(outlineSlices ? { outline: "1px solid red" } : {}),
            }}
          />
        );
      })}
    </div>
  );
}

function BoneNode({
  node,
  boneRefs,
  unitPx,
  showBoneMarkers,
}: {
  node: TreeNode;
  boneRefs: MutableRefObject<Map<string, HTMLDivElement>>;
  unitPx: number;
  showBoneMarkers?: boolean;
}) {
  const { bone, children } = node;

  return (
    <div
      ref={(el) => {
        if (el) boneRefs.current.set(bone.path, el);
        else boneRefs.current.delete(bone.path);
      }}
      data-bone={bone.path}
      data-bone-name={bone.name}
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: 0,
        height: 0,
        transform: defaultLocalTransform(bone, unitPx),
        transformOrigin: "0 0",
      }}
    >
      {showBoneMarkers ? (
        <div
          style={{
            position: "absolute",
            left: -1.5,
            top: -1.5,
            width: 3,
            height: 3,
            background: boneMarkerColor(bone.path),
            borderRadius: "50%",
            pointerEvents: "none",
            zIndex: 99999,
          }}
        />
      ) : null}
      {children.map((child) => (
        <BoneNode
          key={child.bone.path}
          node={child}
          boneRefs={boneRefs}
          unitPx={unitPx}
          showBoneMarkers={showBoneMarkers}
        />
      ))}
    </div>
  );
}
