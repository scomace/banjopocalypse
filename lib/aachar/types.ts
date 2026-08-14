// AA character pipeline — document types.
//
// A second, isolated character-authoring pipeline (see docs/aachar-plan.md).
// It shares SPUM's RENDERER and BONE PATHS but none of its catalog, art, or
// save path: parts live in `public/aachar/` and are registered in a runtime
// manifest, never in `lib/spum/catalog.ts`.
//
// Nothing in `lib/aachar/` may import from `src/screens/admin-spum/`, and the
// only SPUM imports permitted are pure types plus the renderer itself.
//
// THE MODEL / CHARACTER SPLIT (docs/aachar-plan.md D10). Two different things
// were originally conflated in one document:
//
//   AaModel      the base model — ONE canonical set of sprite dimensions plus
//                the library of art drawn to them. This is what the Body and
//                Slots tabs author. There is exactly one per project.
//   AaCharacter  a named instance — which part it wears in each slot, and its
//                bone proportions. Cheap to create; requires no drawing.
//
// The distinction that makes this work: **region sizes** (a sprite's pixel
// rect) require new art to change and live on the part, while **bone
// proportions** (`defaultPos`) rearrange existing art for free and live on the
// character. So several characters can share every sprite and still read as
// different builds.

import type { SpriteAtlas, Vec2 } from "@/lib/spum/types";

import type { AaClip, AaStance } from "./clip";
import type { AaHorseModel } from "./horse/model";

// Slots this pipeline authors. Deliberately narrower than SpumSlot: no
// `pant`, `armor`, or `back` (docs/aachar-plan.md D4). The bones for the
// dropped slots stay in the skeleton — nothing renders on them, so they cost
// nothing. `weapon2` (the LEFT hand — SpumCharacter routes its `Weapon`
// region to the `L_Weapon` bone, z 19, just behind the front left arm) was
// originally dropped too and un-dropped in Phase 8b once held items worked.
export const AA_SLOTS = [
  "body",
  "cloth",
  "hair",
  "eye",
  "faceHair",
  "helmet",
  "weapon",
  "weapon2",
] as const;

export type AaSlot = (typeof AA_SLOTS)[number];

// What each slot is actually USED for in this pipeline, for the admin UI.
// The ids above are frozen — they're manifest folder paths, atlas region
// names, and SPUM bone routing — so renaming happens at the display layer.
export const SLOT_LABEL: Record<AaSlot, string> = {
  body: "body",
  cloth: "clothing",
  hair: "hair",
  eye: "eye",
  faceHair: "mouth",
  helmet: "hat",
  weapon: "item R",
  weapon2: "item L",
};

// Slots whose sheet geometry is DERIVED from the model's `geometry` block
// rather than authored freely. With a single canonical geometry these can
// never drift apart — cloth's torso is the body's torso by construction.
export const DERIVED_GEOMETRY_SLOTS: readonly AaSlot[] = ["body", "cloth"];

export type Size = { width: number; height: number };

// The four measurements every derived sheet is built from, in source pixels.
// SPUM's `Human_3` for reference: head 17×15, body 12×10, arm 6×7, foot 4×7 —
// i.e. its head is larger than its torso. An AA model is expected to depart
// from that (the whole point).
//
// There is ONE of these per project. It is expected to change repeatedly while
// the look is being explored and then be left alone — which is precisely why
// parts record the geometry they were drawn against (see `AaPart`).
export type AaGeometry = {
  head: Size;
  body: Size;
  arm: Size;
  foot: Size;
};

// A set of the part's own palette entries that a character may recolour as a
// group — the hair's interior shades, a shirt's body, a shirt's trim.
//
// The art is drawn in REAL colours and then tagged; nothing is painted in a
// sentinel white or magenta. That matters twice over: the part reads correctly
// in the editor, and the ramp survives the swap (`lib/aachar/recolor.ts` maps
// each entry to the same position in a ramp built around the target), where a
// flat key colour would come back as one flat tone.
//
// `base` is the anchor — the shade the target colour REPLACES — and every other
// entry keeps its lightness offset, chroma ratio and hue shift from it. It must
// appear in `ramp`. A colour left untagged is never touched, which is what
// keeps an outline put while the fill under it changes.
export type AaColorChannel = {
  /** Stable id a character's colour picks are keyed by (`primary`, `interior`). */
  id: string;
  /** What the Characters tab calls it. Falls back to `id`. */
  label?: string;
  base: string;
  /** Every authored hex in this channel, `base` included. Lowercase `#rrggbb`. */
  ramp: string[];
  /** What Randomize may paint this channel, instead of any hue under the sun.
   *  Born from the body's `skin` channel: an unconstrained tint hands random
   *  villagers purple skin, while a curated list makes variety a feature
   *  (diverse skin tones for free). Absent means unconstrained — right for a
   *  shirt, wrong for skin. Never limits the CHARACTERS tab picker: a human
   *  choosing green on purpose is the zombie feature working. */
  randomPalette?: string[];
};

// Per-part hue/saturation/brightness/contrast, the way SPUM's
// `appearancePerSlot` works — except applied PER PIXEL rather than as a CSS
// filter over the slice, because a filter cannot spare the outline and sparing
// the outline is the whole requirement (see `AaProtect`).
//
// Multipliers are 1 = unchanged and `hue` is 0 = unchanged, so an absent field
// and an identity field mean the same thing. Applied in OKLCh, in the order
// brightness → contrast → saturation → hue.
export type AaAppearance = {
  /** Rotation in degrees, −180…180. */
  hue?: number;
  /** Multipliers over the authored colour. 1 = unchanged. */
  saturation?: number;
  brightness?: number;
  contrast?: number;
};

// How a character's hair behaves under its hat (Phase 5f — replaces the
// always-on renderer clip-path mask). A per-character CHOICE, baked into the
// hair atlas's pixels at render time (`lib/aachar/hatHair.ts`); absent means
// `"none"` — the hair renders exactly as drawn and the hat just sits on it.
//
//   none        hat attached to the hair as drawn; nothing is removed
//   tuckHat     cut hair above the hat's bottom edge, per column, only where
//               the hat has pixels (the old mask's rule — side wings survive)
//   tuckHem     tuckHat, plus the hem extends sideways past the hat's edges so
//               hair wider than the hat is cut at the nearest edge's height
//   tuckLine    one straight cut across the full hair width at the hat's
//               single lowest opaque pixel
//   spill       tuckHem, then where cut hair pokes past the hat's sides the
//               edge is raised 1px in the hair's own colour and wrapped in a
//               1px dark outline — hair squeezed out around the brim
//   spillShadow spill, plus the first hair row under the hat's hem darkens —
//               a brim shadow
//   spillTall   spillShadow with a 2px puff
//   spillWild   spillShadow with a puff that varies 1–3px column to column —
//               an unruly tuft
//   spillSlope  spillShadow with the puff tallest against the hat's side and
//               tapering outward — hair pushed up by the brim
//   squash      instead of deleting the hair above the hem, each column is
//               vertically compressed into the band below it — hat-hair
//
// Every mode except `none` also GROWS hair to meet the hat: columns under the
// hat whose hair stops short of the hem (a hat nudged upward) are stretched up
// to it, so raising the hat never opens a strip of air.
export const AA_HAT_HAIR_MODES = [
  "none",
  "tuckHat",
  "tuckHem",
  "tuckLine",
  "spill",
  "spillShadow",
  "spillTall",
  "spillWild",
  "spillSlope",
  "squash",
] as const;

export type AaHatHairMode = (typeof AA_HAT_HAIR_MODES)[number];

// Auto-shading (Phase 13) — a generated rim of darker pixels along the edges
// facing AWAY from the light, so parts are authored FLAT and volume is the
// engine's job. A per-character CHOICE baked into every worn atlas at render
// time (`lib/aachar/shade.ts` / `useShadedOverrides`), exactly the hat-hair
// pattern; absent means `"none"` — the art renders exactly as drawn.
//
//   none  as drawn
//   soft  1px rim, checker-dithered — a hint of volume
//   cel   1px solid rim — the classic pixel-art one-step edge shade
//   hard  2px solid rim plus a 1px highlight on the lit edges
export const AA_SHADE_STYLES = ["none", "soft", "cel", "hard"] as const;

export type AaShadeStyle = (typeof AA_SHADE_STYLES)[number];

// Where the light comes from. Deliberately a tiny enum, not an angle: every
// baked asset in the game (props, sprites, backgrounds) carries an implied
// top-left light, so the only useful choices are small departures from it —
// and a continuous angle would explode the shade-bake cache for differences
// invisible at sprite scale. `"left"` (≈ top-left, the genre convention) is
// the default. NOT stored on the character: direction belongs to whatever
// composes the character — the admin preview now, a scene's light later.
export const AA_LIGHT_DIRECTIONS = ["left", "top", "right", "below"] as const;

export type AaLightDirection = (typeof AA_LIGHT_DIRECTIONS)[number];

// The shadow the character casts on the ground (rendered by the preview /
// scene compositor, never baked into pixels): a soft ellipse at the feet, or
// a flattened skewed copy of the whole rig that follows the pose.
export const AA_GROUND_SHADOWS = ["none", "ellipse", "silhouette"] as const;

export type AaGroundShadow = (typeof AA_GROUND_SHADOWS)[number];

// The three eye states (Phase 11). NOT bones and NOT clip tracks: a state
// selects which band of the eye part's sheet renders on the open-eye anchor —
// a render-time region swap in `lib/aachar/render.ts` (`applyEyeState`). The
// renderer never learns the feature exists, and the SPUM fall-through
// mechanism (FreeClose on the blink bone, flipped by clip visibility tracks)
// is untouched underneath.
export const AA_EYE_STATES = ["open", "half", "closed"] as const;

export type AaEyeState = (typeof AA_EYE_STATES)[number];

// What a CHARACTER may rest at: open (absent — deleted rather than stored) or
// half. `closed` is deliberately not a resting state — it belongs to clips
// (`AaClip.eyeState`) and, after Phase 7, scenes.
export type AaRestingEyeState = "open" | "half";

// Where the pupils may point (Phase 12). A direction is resolved per eye to
// "the furthest offset that keeps every pupil pixel on the eye's whites" —
// range is derived from the art, so a big eye wanders far and a tiny one
// barely moves, and the pupil can never leave the eyeball
// (`lib/aachar/gaze.ts`).
export const AA_GAZE_DIRECTIONS = [
  "up",
  "down",
  "left",
  "right",
  "up-left",
  "up-right",
  "down-left",
  "down-right",
] as const;

export type AaGazeDirection = (typeof AA_GAZE_DIRECTIONS)[number];

/** A manual pupil offset — exact pixels instead of a direction's full throw.
 *  Placement convention like `AaEyeNudge`: +dx = screen right, +dy = up.
 *  Still clamped at bake time: the pupil walks toward the target and stops
 *  at the last step that keeps every pupil pixel on the whites. */
export type AaGazeOffset = { dx?: number; dy?: number };

/** One eye's resting gaze: a compass direction (furthest the whites allow,
 *  minus any gap) or a manual pixel offset (gap does not apply — the author
 *  owns the exact spot). */
export type AaGazeSide = AaGazeDirection | AaGazeOffset;

/** Per-eye gaze — the crazy-eyes form. A side left unset stays as drawn, so
 *  "one normal eye, one wanderer" is just a pair with one entry. Sides are
 *  VIEWER-relative like `AaPartEyes` (left = leftmost box on screen).
 *  `gap` keeps that many pixels of whites between a direction-driven pupil
 *  and the furthest edge (a flush pupil reads as merged with the eye's
 *  outline on some art, especially diagonals): a number applies to both
 *  eyes, the object form sets each side on its own — 0/absent is the
 *  classic full-throw clamp. */
export type AaGazePair = {
  left?: AaGazeSide;
  right?: AaGazeSide;
  gap?: number | { left?: number; right?: number };
};

/** A gaze: one direction for both pupils (the common case, and what clips
 *  and scene actions speak), or a per-eye pair (cross-eyed, wall-eyed,
 *  derp). Everything downstream resolves per side via `gazeFor`. */
export type AaGaze = AaGazeDirection | AaGazePair;

// Which pixels are eyes and which are pupils (Phase 12) — authored on the
// OPEN band, coordinates relative to the band's own rect (so the same boxes
// serve every band and survive sheet re-layout; bands are always the same
// size). `left`/`right` are ON SCREEN — the character faces screen-left, so
// anatomical naming would be the his-left/your-left trap. Masks (the pupil's
// connected colour region, the whites) are COMPUTED from these at render
// time, never stored — stored masks would go stale the moment the art is
// retouched.
export type AaEyeBox = { x: number; y: number; width: number; height: number };

export type AaEyeSpec = {
  box: AaEyeBox;
  /** One pixel inside the pupil, band-relative. Its connected same-colour
   *  region (clipped to the box) IS the pupil. */
  pupil: { x: number; y: number };
};

export type AaPartEyes = { left: AaEyeSpec; right: AaEyeSpec };

/** Per-eye pixel nudge a character applies (Phase 12). Placement convention:
 *  +dx = screen right, +dy = up. Moves the eye's whole box content, in every
 *  band — the eye should sit where you put it when it blinks too. */
export type AaEyeNudge = { dx?: number; dy?: number };

// Per-slot placement a character applies to whatever it wears there: a pixel
// nudge, a rotation, a mirror. Lives on the CHARACTER, not the part — the
// same hat can sit straight on one character and tilted on another. Rendered
// by the `slotAdjustments` seam on SpumCharacter, so it moves the art without
// touching pivots, bones, or the atlas.
export type AaPlacement = {
  /** Source-sprite px. +dx = screen right (also under a flip), +dy = up. */
  dx?: number;
  dy?: number;
  /** Degrees about the slice's pivot, + = clockwise on screen. */
  rot?: number;
  /** Mirror horizontally about the pivot. */
  flipX?: boolean;
};

// Which of a part's colours a character may NOT touch — its outline.
//
// The default is a lightness threshold rather than a hand-tagged list, because
// "the sliders wreck my black outline" has to be wrong out of the box, not
// after setup. It is deliberately tight (`DEFAULT_PROTECT_LIGHTNESS`, true
// near-black and nothing else), and the editor shows exactly which colours it
// caught so it is never a mystery.
export type AaProtect = {
  /** Protect every colour at or below this OKLab lightness, 0…1. Absent means
   *  `DEFAULT_PROTECT_LIGHTNESS`; 0 protects nothing by lightness. */
  maxLightness?: number;
  /** Extra hexes protected regardless of how light they are. */
  colors?: string[];
};

// One authored part: its atlas (which carries the image URL and the region
// rects) plus the slot it belongs to.
//
// `authoredFor` is a snapshot of the model geometry at the time the pixels
// were drawn. When the model's geometry moves — which it will, repeatedly,
// during exploration — a part whose snapshot no longer matches is STALE: its
// pixels were drawn into rects that no longer exist at those sizes. The editor
// detects this rather than silently rendering misaligned art. Only meaningful
// for slots in `DERIVED_GEOMETRY_SLOTS`; free-sized slots (hair, helmet, …)
// leave it undefined.
export type AaPart = {
  name: string;
  slot: AaSlot;
  atlas: SpriteAtlas;
  /** Where an imported part came from — `"prop:oneoff_oil_can"`,
   *  `"sprite:goose#3"`, `"modern:moderninteriors/…"`, `"file:hat.png"`.
   *  Display-only provenance; the pixels are fully materialised under
   *  `public/aachar/`, so deleting the source can never break the part. */
  source?: string;
  authoredFor?: AaGeometry;
  /** LEGACY — the sprite's top profile per region, written by earlier saves.
   *  No longer written or read: the hair mask cuts at the helmet's BOTTOM edge
   *  (a top-profile mask lets hair leak through the air under a jester hat's
   *  prongs). Kept so old manifests still typecheck; superseded by
   *  `contentBottomProfile`. */
  contentProfile?: Record<string, number[]>;
  /** The sprite's bottom profile per region: for each column, rows from the
   *  region's top to one past its lowest drawn pixel (0 = empty column).
   *  Written on save, and only for slots that MASK something (helmet) — this
   *  is the edge the hat-hair modes cut against (`lib/aachar/hatHair.ts`). A helmet
   *  saved before this existed carries none; the editor measures the PNG
   *  instead (`measureBottomProfile`). */
  contentBottomProfile?: Record<string, number[]>;
  /** Recolourable palette groups. Absent (or empty) means the part renders
   *  exactly as drawn — which is every part authored before this existed. */
  colorChannels?: AaColorChannel[];
  /** What a character's colour and appearance adjustments must leave alone.
   *  Absent means the default lightness threshold, so an untouched part still
   *  keeps its outline. */
  protect?: AaProtect;
  /** Eye parts only (Phase 11): which extra bands carry REAL art. Written at
   *  save time by measuring the canvas — never derived at load, because the
   *  atlas is a URL, not pixels. `applyEyeState` refuses to swap to a band
   *  whose flag is absent/false, which is what keeps a pre-Phase-11 2-band
   *  part (no flags at all) and a blank band rendering exactly as before. */
  eyeBands?: { half?: boolean; close?: boolean };
  /** Eye parts only (Phase 12): the two eye boxes + pupil marks that make
   *  per-eye nudging and gaze possible. Absent means the part predates the
   *  Eyes tool (or the author never marked it) — nudge and gaze are simply
   *  unavailable, nothing renders differently. */
  eyes?: AaPartEyes;
  /** Theme tags (`"zombie"`), lowercase slugs. A tagged part is EXCLUDED from
   *  Randomize's pool by default — a tag exists precisely because the part is
   *  themed, so special stays out of random villagers unless invited back via
   *  the filter next to the 🎲 button. Absent means general wardrobe, which is
   *  every part authored before this existed. Tags never hide a part from the
   *  Wearing pickers: choosing a zombie eye on purpose is the point. */
  tags?: string[];
};

// Per-character `defaultPos` overrides, keyed by bone path. ONLY bones no clip
// animates may appear here — clips write absolute local positions and override
// `defaultPos` outright, so an entry for an animated bone is a silent no-op.
// `lib/aachar/skeleton.ts` enforces this.
export type AaSkeletonOverrides = Record<string, Vec2>;

// The base model: canonical dimensions + the art library. Authored by the Body
// and Slots tabs.
export type AaModel = {
  geometry: AaGeometry;
  /** Library of authored parts. Many per slot is fine (several hairs, several
   *  cloths); the body slot is expected to hold exactly one. */
  parts: AaPart[];
  /** BASE proportions — the body plan the art was drawn for. Head attach
   *  point, shoulder height and neck length belong with the sprites that were
   *  drawn to sit at them, so they live on the model; a character deviates
   *  from this rather than starting from SPUM's stock values. */
  skeleton: AaSkeletonOverrides;
  /** Draw-order overrides, bone path → `sortingOrder`. SPUM's stock stack was
   *  tuned for a small chibi torso; a wide one needs different answers about
   *  which limbs pass in front. Unlike `skeleton`, these are safe on ANY bone —
   *  no clip animates draw order. */
  zOrder?: Record<string, number>;
  /** The neutral standing pose every clip is authored against (Phase 6).
   *  Model-level because it is a property of the BODY — how wide it stands, how
   *  its arms hang — not of any one animation, so editing it restyles the whole
   *  clip set at once. Absent means "derive it from `geometry`". */
  stance?: AaStance;
  /** Per-clip overrides of the built-in library in `lib/aachar/clips/`, keyed
   *  by clip name. The library is the durable copy (TypeScript, deploys with
   *  the app, fails the build on a bad beat sheet); this is the editor's
   *  working surface, so a clip can be tuned and played without a module write
   *  (D5). "Copy TS" promotes one back into the library. */
  clips?: Record<string, AaClip>;
  /** The AA horse rig (docs/aachar-horse-plan.md): original horse sheets +
   *  horse clip overrides. Lives on the MODEL (not the project top level)
   *  because `projectMerge.ts` rebuilds the top-level object but carries
   *  every non-`parts` model field through — a top-level key would be
   *  silently dropped by a conflict merge (H3). Absent until the first horse
   *  part or clip edit is saved. Type-only import: no runtime cycle. */
  horse?: AaHorseModel;
};

// A named instance: what it wears and how it deviates from the base build.
export type AaCharacter = {
  name: string;
  /** Slot → part name. A slot with no pick simply doesn't render. */
  picks: Partial<Record<AaSlot, string>>;
  /** Per-character DELTA over `AaModel.skeleton`, merged per bone path. Empty
   *  means "exactly the base build". */
  skeleton: AaSkeletonOverrides;
  /** Slot → channel id → target hex, against the channels the PICKED part
   *  declares. Per-channel rather than per-slot so a cloth with two channels can
   *  have one changed and one left alone, and an absent entry means the
   *  authored colour — so a character that says nothing renders as drawn. */
  colors?: Partial<Record<AaSlot, Record<string, string>>>;
  /** Slot → hue/saturation/brightness/contrast over the PICKED part's art.
   *  Independent of `colors`: a part with no channels can still be tinted
   *  wholesale, and both skip the same protected outline. */
  appearance?: Partial<Record<AaSlot, AaAppearance>>;
  /** Slot → nudge/rotate/flip over the PICKED part's placement. Per slot
   *  rather than per part for the same reason as `colors`: it describes how
   *  THIS character wears the slot, and swapping the part keeps the fit. An
   *  identity placement is deleted rather than stored. */
  placement?: Partial<Record<AaSlot, AaPlacement>>;
  /** How the hair behaves under the hat (see `AA_HAT_HAIR_MODES`). `"none"`
   *  is deleted rather than stored, same identity rule as `placement`. */
  hatHair?: AaHatHairMode;
  /** Resting eye state (Phase 11) — a personality trait, so it lives on the
   *  CHARACTER, not the outfit (same build/outfit line as proportions, D12).
   *  `"open"` is deleted rather than stored; only `"half"` persists. Applied
   *  at render time via `applyEyeState`, and only when the picked eye part's
   *  `eyeBands.half` flag says the band has art. */
  eyeState?: AaRestingEyeState;
  /** Per-eye pixel nudge (Phase 12) over the picked eye part's marked boxes
   *  — how THIS character wears its eyes: closer together, one higher, etc.
   *  Needs `AaPart.eyes` on the picked part; identity entries are deleted
   *  rather than stored. Deliberately NOT on outfits — eye placement is
   *  face/build, not clothes. */
  eyeNudge?: { left?: AaEyeNudge; right?: AaEyeNudge };
  /** Resting pupil direction(s) — where THIS character's pupils sit when
   *  nothing (clip gaze, scene gaze action) says otherwise. One direction for
   *  both eyes, or a per-eye pair for crazy eyes. A facial trait like
   *  `eyeState`, so it lives on the character, not the outfit. RIG-space: it
   *  rides the art's mirroring, so a cross-glance stays on the same side of
   *  the face when the actor flips. Needs `AaPart.eyes` marks on the picked
   *  eye part; absent means "as drawn" and is deleted rather than stored. */
  gaze?: AaGaze;
  /** Auto-shading style (Phase 13), baked into every worn slot except the
   *  eyes at render time. An art-style trait of the character, not the
   *  outfit; `"none"` is deleted rather than stored. The LIGHT DIRECTION is
   *  deliberately not here — see `AA_LIGHT_DIRECTIONS`. */
  shading?: AaShadeStyle;
  /** Shadow cast on the ground (Phase 13) — composited under the rig, never
   *  baked into pixels. `"none"` is deleted rather than stored. */
  groundShadow?: Exclude<AaGroundShadow, "none">;
};

// A saved LOOK — the outfit half of a character (picks + colours + appearance
// + placement), name-addressable and wearable by any character. Proportions
// are deliberately absent: an outfit is clothes, and the build under them
// belongs to the character — the same build/outfit line D12 and the Randomize
// button already draw. Authored in the Characters tab ("Save current look as
// outfit"); applied WHOLESALE, so a slot absent from `picks` is emptied.
export type AaOutfit = {
  name: string;
  /** Slot → part name. */
  picks: Partial<Record<AaSlot, string>>;
  colors?: Partial<Record<AaSlot, Record<string, string>>>;
  appearance?: Partial<Record<AaSlot, AaAppearance>>;
  placement?: Partial<Record<AaSlot, AaPlacement>>;
  hatHair?: AaHatHairMode;
};

// The whole project — this is BOTH the on-disk manifest
// (`public/aachar/manifest.json`) and the export bundle format. One model,
// many characters.
export type AaProject = {
  version: 1;
  model: AaModel;
  characters: AaCharacter[];
  /** Saved looks (Phase 10). Absent on every project saved before then, and
   *  deleted rather than stored when the last one is removed. */
  outfits?: AaOutfit[];
};
