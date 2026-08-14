// E22 — Horse rider catalog. Mirrors `./catalog.ts` for the horse rig:
// part names, animation names, sprite/atlas/clip URL helpers, and the
// region-bone binding map the renderer uses.
//
// The horse is a separate rig from the character (own skeleton at
// `/spum/horse-skeleton.json`, own clips under `/spum/horse-anims/`). The
// scene runtime composites the two: horse renders at the actor's scene
// position; the actor's `<SpumCharacter>` renders parented to the horse's
// saddle anchor (`Pivot_Body/Acc`).
//
// To add a horse part:
//   1. Drop the PNG + .meta under `temp/SPUM/Resources/Addons/Legacy/1_Horse/
//      0_Sprite/0_Body/<Name>.png[.meta]`
//   2. Add the part key to `HORSE_PARTS` here
//   3. Register it in `HORSE_PARTS` in `scripts/spum-import.ts`
//   4. Run `npx tsx scripts/spum-import.ts --pack=Horse`

const HORSE_PARTS = [
  // Legacy's 4 horse body atlases. Each is a 64×64 PNG with 10 named
  // regions (Head/Neck/BodyFront/BodyBack/Tail/FootFrontTop/FootFrontBottom/
  // FootBackTop/FootBackBottom/Acc).
  "Horse1", "Horse2", "BlackHorse", "RedHorse",
  // Procedurally-generated robot variants of Horse1. Same atlas regions
  // (the atlas JSONs are copies of Horse1.atlas.json with the image path
  // swapped); only the pixel palette + a handful of accent pixels differ.
  // Source recipe: scripts/gen-robot-horses.ts.
  "RobotHorse1", "RobotHorse2", "RobotHorse3", "RobotHorse4", "RobotHorse5",
] as const;

export const HORSE_SPRITES = HORSE_PARTS.reduce(
  (out, part) => {
    out[part] = `/spum/sprites/horse/${part}.png`;
    return out;
  },
  {} as Record<(typeof HORSE_PARTS)[number], string>,
);

export type HorsePart = (typeof HORSE_PARTS)[number];

export const HORSE_PART_LIST = HORSE_PARTS;

export function horseSpritePath(part: HorsePart): string {
  return HORSE_SPRITES[part];
}

export function horseAtlasPath(part: HorsePart): string {
  return horseSpritePath(part).replace(/\.png$/, ".atlas.json");
}

// 12 horse clips imported in E22. Naming roughly mirrors the character
// catalog (idle/walk_run/run/attack_*/damaged/death/debuff/concentrate/buff/
// etc) so author muscle memory transfers across rigs. Three SPUM upstream
// typos cleaned at the catalog level: `Conventrate.anim` → `concentrate`
// (different from the character's `Conecntrate.anim` typo — TWO distinct
// upstream typos), `Ect.anim` → `etc`, `OTHER 1.anim` → `buff` (author
// mislabel of the asset file).
// 12 clips spanning SPUM's 7 base PlayerStates (IDLE, MOVE, ATTACK,
// DAMAGED, DEATH, DEBUFF, OTHER), with variants where Legacy ships them.
// `move`/`run` are the two move variants (standard walk-run cycle vs.
// faster gallop); `concentrate`/`buff`/`other` are the three OTHER-slot
// variants Legacy ships under `06_Other/`.
export const HORSE_ANIMATIONS = [
  "idle",
  "move", "run",
  "attack_melee", "attack_bow", "attack_magic",
  "damaged", "death", "debuff",
  "concentrate", "buff", "other",
] as const;

export type HorseAnimation = (typeof HORSE_ANIMATIONS)[number];

export function horseClipPath(anim: HorseAnimation): string {
  return `/spum/horse-anims/${anim}.json`;
}

// Region → bone-path map. Mirrors `SLOT_REGION_TO_BONE` for the character
// rig. Each horse atlas (Horse1, Horse2, BlackHorse, RedHorse) is a
// spriteMode-2 PNG with 10 named regions; this table routes each region to
// the bone GameObject whose SpriteRenderer holds it in SPUM's prefab.
//
// The mapping was reverse-engineered from the horse skeleton walk (the
// importer's `parseHorseSkeleton` populates `bone.sortingOrder` only for
// sprite-bearing leaf GameObjects; the four FrontFootTop/FrontFootBottom
// leaves under each of the four Pivot_*Foot bones are the sprite anchors
// for the FootFront*/FootBack* atlas regions).
//
// **Foot pair semantics:** SPUM splits each set of legs (front-of-body
// pair and back-of-body pair) across two render Sets — `Pivot_FootFrontSet`
// (the layer closer to camera) and `Pivot_FootBackSet` (the layer behind
// the body). Each Set carries one `Pivot_FrontFoot` + one `Pivot_BackFoot`
// child. The atlas's `FootFrontTop` region renders at BOTH `Pivot_FrontFoot/
// FrontFootTop` GameObjects (front-of-body leg, layered front + layered
// back); `FootBackTop` renders at both `Pivot_BackFoot/FrontFootTop`
// GameObjects (back-of-body leg, same dual-layer pattern). The leaf
// GameObject is always named `FrontFootTop` regardless of whether it
// represents a front-of-body or back-of-body leg — SPUM's author reused
// the same sub-prefab.
//
// Each region binds to two bones via `string[]` (same pattern as eye
// Back/Front renders at L+R bones in the character rig).
export const HORSE_REGION_TO_BONE: Record<string, string | string[]> = {
  // Body — two halves, each on its own bone with distinct sortingOrder.
  // BodyBack (z=-6) renders behind BodyFront (z=-7? — actually BodyBack
  // higher z = in front). Hierarchy: BodyBack is a direct child of
  // Pivot_Root (not Pivot_Body) so it stays put when Pivot_Body translates
  // for a bob — that's SPUM's authoring intent (the back of the horse is
  // structural, the front lifts/lowers with breath).
  BodyBack: "Pivot_Main/Pivot_Root/BodyBack",
  BodyFront: "Pivot_Main/Pivot_Root/Pivot_Body/BodyFront",
  // Neck + Head — chained for the bob (Pivot_Neck rotates around its base,
  // Pivot_Head is the tip).
  Neck: "Pivot_Main/Pivot_Root/Pivot_Body/Pivot_Neck/Neck",
  Head: "Pivot_Main/Pivot_Root/Pivot_Body/Pivot_Neck/Pivot_Head/Head",
  // AA horse hats (lib/aachar/horse/hat.ts): an AA horse atlas may carry a
  // composited "Hat" region. Routed to the head sprite bone so it rides
  // every nod; listed AFTER Head so the equal-z tie renders it on top. No
  // SPUM atlas has this region, so the entry is inert for SPUM horses.
  Hat: "Pivot_Main/Pivot_Root/Pivot_Body/Pivot_Neck/Pivot_Head/Head",
  // Tail — single bone, big z-below so it doesn't paint over the body.
  Tail: "Pivot_Main/Pivot_Root/Pivot_Tail/Tail",
  // Saddle sprite (the `Acc` region of the atlas — often a small leather
  // patch or blanket). Renders at the saddle anchor; the rider rides on
  // top of this via the scene-runtime mount integration.
  Acc: "Pivot_Main/Pivot_Root/Pivot_Body/Acc",
  // Front-of-body leg pair (the two legs in front of the torso). One sprite
  // per leg renders in each render-Set, total 2 anchors per region.
  FootFrontTop: [
    "Pivot_Main/Pivot_Root/Pivot_Body/Pivot_FootFrontSet/Pivot_FrontFoot/FrontFootTop",
    "Pivot_Main/Pivot_Root/Pivot_FootBackSet/Pivot_FrontFoot/FrontFootTop",
  ],
  FootFrontBottom: [
    "Pivot_Main/Pivot_Root/Pivot_Body/Pivot_FootFrontSet/Pivot_FrontFoot/PivotBottom/FrontFootBottom",
    "Pivot_Main/Pivot_Root/Pivot_FootBackSet/Pivot_FrontFoot/PivotBottom/FrontFootBottom",
  ],
  // Back-of-body leg pair (the two legs behind the torso). Same dual-layer
  // pattern. Confusing naming: the *leaf* GameObject is always named
  // `FrontFootTop`/`FrontFootBottom` regardless of front-vs-back leg — the
  // distinction comes from the parent (`Pivot_BackFoot` vs `Pivot_FrontFoot`).
  FootBackTop: [
    "Pivot_Main/Pivot_Root/Pivot_Body/Pivot_FootFrontSet/Pivot_BackFoot/FrontFootTop",
    "Pivot_Main/Pivot_Root/Pivot_FootBackSet/Pivot_BackFoot/FrontFootTop",
  ],
  FootBackBottom: [
    "Pivot_Main/Pivot_Root/Pivot_Body/Pivot_FootFrontSet/Pivot_BackFoot/PivotBottom/FrontFootBottom",
    "Pivot_Main/Pivot_Root/Pivot_FootBackSet/Pivot_BackFoot/PivotBottom/FrontFootBottom",
  ],
};

// Saddle anchor bone — where the rider character renders. The scene runtime
// reads this bone's transform from the horse's `boneTransformRef` each
// frame and parents the rider's `<SpumCharacter>` to that position.
//
// `Acc/Root` (not `Acc`) is SPUM's authored attachment point: in the
// prefab, the rider character's hierarchy lives under `Acc/Root/BodySet/...`,
// so `Acc/Root` is the transform that defines exactly where the rider's
// own Root bone should render. We include this bone in the horse skeleton
// (the importer's walk descends INTO `Acc` to capture `Root`, then stops —
// the rider's character hierarchy below Root is excluded). Without `Root`
// in the chain, the rider rendered at the saddle bone (`Acc`) directly,
// missing the small upward offset SPUM authored between the saddle and
// the rider's grounding point (visible as the rider sitting too low /
// half-inside the horse).
export const HORSE_SADDLE_BONE = "Pivot_Main/Pivot_Root/Pivot_Body/Acc/Root";

// E1-style per-channel colour map for horse parts. Today only one slot
// (`horse`), but the type leaves room for future per-region channels (e.g.
// `mane`, `tail`) if SPUM ever ships per-region tints on the horse atlas.
export type HorseColors = Partial<Record<"horse", string>>;
