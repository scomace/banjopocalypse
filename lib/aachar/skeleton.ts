// AA character pipeline — proportion overrides on the shared skeleton.
//
// The AA character reuses SPUM's bone PATHS (docs/aachar-plan.md D2): the
// renderer looks bones up by path and tolerates both bones missing from the
// skeleton and clip tracks with no matching bone, so path-compatibility keeps
// every existing clip, scene, anchor, prop, bubble, camera and particle
// working untouched. Proportions therefore live in `defaultPos` overrides
// rather than in a second skeleton file.
//
// THE CATCH — clips write ABSOLUTE local positions:
//
//     track?.pos ? samplePos(track.pos, t) : bone.defaultPos
//
// so any bone a clip has a `pos` track for ignores its skeleton default
// entirely. Overriding one is a silent no-op. `POS_ANIMATED_BONES` below is
// the measured list of those bones (all 38 clips in `public/spum/anims/`
// scanned); `isProportionBone` is the guard the editor uses so a slider that
// can't work is never shown.

import type { Skeleton, Vec2 } from "@/lib/spum/types";

import type { AaGeometry, AaSkeletonOverrides } from "./types";

// Bones with a `pos` track in at least one clip. Their `defaultPos` is dead
// weight at runtime — do NOT expose these as proportion controls.
export const POS_ANIMATED_BONES: ReadonlySet<string> = new Set([
  "Root",
  "Root/BodySet/P_Body",
  "Root/BodySet/P_Body/P_Back",
  "Root/BodySet/P_Body/HeadSet/P_Head",
  "Root/BodySet/P_Body/ArmSet/ArmL/P_LArm",
  "Root/BodySet/P_Body/ArmSet/ArmR/P_RArm",
  "Root/BodySet/P_Body/ArmSet/ArmR",
  "Root/BodySet/P_Body/ArmSet/ArmL/P_LArm/P_Arm",
  "Root/BodySet/P_Body/ArmSet/ArmL/P_LArm/P_Weapon",
  "Root/BodySet/P_Body/ArmSet/ArmL/P_LArm/P_Shield",
  "Root/BodySet/P_Body/ArmSet/ArmR/P_RArm/P_Weapon",
  "Root/P_LFoot",
  "Root/P_RFoot",
  "Root/BodySet/P_Body/HeadSet/P_Head/P_Eye/P_LClose",
  "Root/BodySet/P_Body/HeadSet/P_Head/P_Eye/P_RClose",
]);

// 32 source pixels per Unity unit — the scale the renderer assumes
// (`BASE_SPRITE_SCALE = BASE_UNIT_PX / 32`). Proportion sliders are authored
// in px and stored in units.
export const PX_PER_UNIT = 32;

export const unitsToPx = (u: number): number => u * PX_PER_UNIT;
export const pxToUnits = (px: number): number => px / PX_PER_UNIT;

export type ProportionBone = {
  path: string;
  label: string;
  hint: string;
  /** Which axes are meaningful to expose for this bone. */
  axes: ("x" | "y")[];
};

// The proportion knobs — every one verified to have NO pos track in any of the
// 38 clips, so its `defaultPos` is live at runtime.
//
// `HeadSet` is the interesting one: 18 clips rotate it, but none position it,
// so it is safe to move even though it is not a static bone.
export const PROPORTION_BONES: readonly ProportionBone[] = [
  {
    path: "Root/BodySet",
    label: "Torso height",
    hint: "Raises the whole torso + head above the feet. Stock 8px.",
    axes: ["y"],
  },
  {
    path: "Root/BodySet/P_Body/HeadSet",
    label: "Head attach",
    hint: "Where the head sits on the torso. Stock (1, 4.5)px.",
    axes: ["x", "y"],
  },
  {
    path: "Root/BodySet/P_Body/HeadSet/P_Head/P_Head",
    label: "Neck length",
    hint: "Head sprite offset from its own pivot. Stock 6px.",
    axes: ["x", "y"],
  },
  {
    path: "Root/BodySet/P_Body/ArmSet",
    label: "Shoulder height",
    hint: "Where the arms hang off the torso. Stock 3px.",
    axes: ["y"],
  },
  {
    path: "Root/BodySet/P_Body/Body",
    label: "Torso offset",
    hint: "Body sprite offset from its pivot. Stock −0.5px.",
    axes: ["x", "y"],
  },
  {
    path: "Root/BodySet/P_Body/HeadSet/P_Head/P_Eye",
    label: "Eye height",
    hint: "Eye position within the head. Stock 2.5px.",
    axes: ["x", "y"],
  },
  {
    path: "Root/P_LFoot/_3L_Foot",
    label: "Foot drop (L)",
    hint: "Foot sprite offset below its pivot. Stock −2px.",
    axes: ["x", "y"],
  },
  {
    path: "Root/P_RFoot/_12R_Foot",
    label: "Foot drop (R)",
    hint: "Foot sprite offset below its pivot. Stock −2px.",
    axes: ["x", "y"],
  },
];

const PROPORTION_PATHS = new Set(PROPORTION_BONES.map((b) => b.path));

// True when overriding this bone's `defaultPos` will actually do something.
export function isProportionBone(path: string): boolean {
  return PROPORTION_PATHS.has(path) && !POS_ANIMATED_BONES.has(path);
}

// The sprite-bearing bones whose stacking is worth exposing, with SPUM's stock
// `sortingOrder`. The body slice sits at 0, so anything above it draws in
// front and anything below draws behind.
export type LayerBone = {
  path: string;
  label: string;
  stock: number;
};

export const LAYER_BONES: readonly LayerBone[] = [
  { path: "Root/BodySet/P_Body/HeadSet/P_Head/P_Head/5_Head", label: "Head", stock: 5 },
  { path: "Root/BodySet/P_Body/Body", label: "Body", stock: 0 },
  { path: "Root/BodySet/P_Body/ArmSet/ArmL/P_LArm/P_Arm/20_L_Arm", label: "Arm L", stock: 20 },
  { path: "Root/BodySet/P_Body/ArmSet/ArmR/P_RArm/P_Arm/-20_R_Arm", label: "Arm R", stock: -20 },
  { path: "Root/P_LFoot/_3L_Foot", label: "Foot L", stock: -3 },
  { path: "Root/P_RFoot/_12R_Foot", label: "Foot R", stock: -12 },
];

// AA's starting stack, where it departs from SPUM's.
//
// SPUM puts BOTH feet behind the body (-3 and -12) while the left ARM is in
// front at +20. That asymmetry reads fine on their small chibi torso, which
// barely overlaps the feet. On a wide, round torso the near leg disappears
// behind it — so the left foot moves in front, matching the left arm.
export const AA_DEFAULT_Z: Record<string, number> = {
  "Root/P_LFoot/_3L_Foot": 1,
};

// Where the head sprite's bottom edge falls relative to the body sprite's top
// edge, in source px. Positive = a visible seam; negative = the head tucks in.
//
// WHY THIS NEEDS SHOWING: the two sprites are adjacent on the SHEET but placed
// by separate bones on the RIG, so sheet adjacency says nothing about whether
// they meet. SPUM's stock proportions hide this — a 15px head overlaps the
// torso by 2px, so no gap is possible. Shorten the head and the overlap
// silently becomes a gap.
//
// Approximate: `P_Head` carries a pos track in every clip, so its animated
// value shifts this a little frame to frame. Good enough to dial against; the
// live preview is the real judge.
export function headBodySeamPx(skeleton: Skeleton, geometry: AaGeometry): number {
  const y = (p: string) =>
    skeleton.bones.find((b) => b.path === p)?.defaultPos.y ?? 0;
  // P_Body cancels — it's an ancestor of both sprites.
  const centreToCentre =
    (y("Root/BodySet/P_Body/HeadSet") +
      y("Root/BodySet/P_Body/HeadSet/P_Head") +
      y("Root/BodySet/P_Body/HeadSet/P_Head/P_Head") -
      y("Root/BodySet/P_Body/Body")) *
    PX_PER_UNIT;
  const headBottom = centreToCentre - geometry.head.height / 2;
  const bodyTop = geometry.body.height / 2;
  return headBottom - bodyTop;
}

export type SkeletonComposeResult = {
  skeleton: Skeleton;
  /** Override paths that were dropped, and why — surfaced in the editor so a
   *  no-op is never silent (docs/aachar-plan.md I1). */
  ignored: { path: string; reason: "animated" | "unknown" }[];
};

// Apply a character's `defaultPos` overrides to a base skeleton, returning a
// NEW skeleton (the base is shared with the SPUM pipeline and must not be
// mutated). Overrides for animated or unknown bones are dropped and reported
// rather than applied, because applying them would do nothing visible.
export function composeSkeleton(
  base: Skeleton,
  overrides: AaSkeletonOverrides,
  zOverrides: Record<string, number> = {},
): SkeletonComposeResult {
  const known = new Set(base.bones.map((b) => b.path));
  const ignored: SkeletonComposeResult["ignored"] = [];
  const effective = new Map<string, Vec2>();

  for (const [path, pos] of Object.entries(overrides)) {
    if (!known.has(path)) {
      ignored.push({ path, reason: "unknown" });
      continue;
    }
    if (POS_ANIMATED_BONES.has(path)) {
      ignored.push({ path, reason: "animated" });
      continue;
    }
    effective.set(path, pos);
  }

  // Draw order needs no animated-bone guard: clips carry rot/pos/visibility
  // tracks, never `sortingOrder`, so an override always takes effect.
  for (const path of Object.keys(zOverrides)) {
    if (!known.has(path)) ignored.push({ path, reason: "unknown" });
  }

  return {
    skeleton: {
      rootPath: base.rootPath,
      bones: base.bones.map((bone) => {
        const pos = effective.get(bone.path);
        const z = zOverrides[bone.path];
        if (pos === undefined && z === undefined) return bone;
        return {
          ...bone,
          ...(pos ? { defaultPos: { ...pos } } : {}),
          ...(z !== undefined ? { sortingOrder: z } : {}),
        };
      }),
    },
    ignored,
  };
}

// Stock defaults for the proportion bones, read off a base skeleton. Used to
// seed the sliders and to render "stock Npx" hints.
export function stockProportions(base: Skeleton): AaSkeletonOverrides {
  const byPath = new Map(base.bones.map((b) => [b.path, b]));
  const out: AaSkeletonOverrides = {};
  for (const { path } of PROPORTION_BONES) {
    const bone = byPath.get(path);
    if (bone) out[path] = { ...bone.defaultPos };
  }
  return out;
}
