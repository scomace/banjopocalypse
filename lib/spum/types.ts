export type Vec2 = { x: number; y: number };
export type Vec3 = { x: number; y: number; z: number };

export type Bone = {
  name: string;
  path: string;
  parent: string | null;
  defaultPos: Vec2;
  defaultRot: Vec3;
  pivot: Vec2;
  // SpriteRenderer sortingOrder if this bone hosts a sprite in Unity. Drives
  // CSS z-index. Undefined for intermediate (transform-only) bones.
  sortingOrder?: number;
  // Unity GameObject `m_IsActive`. When false (e.g. P_LClose/P_RClose in the
  // prefab default), this bone and all descendants are hidden unless a clip's
  // visibility track flips them on. Omitted when true (the common case).
  defaultActive?: boolean;
};

export type Skeleton = {
  rootPath: string;
  bones: Bone[];
};

export type RotKeyframe = {
  t: number;
  rot: Vec3;
  inSlope?: Vec3;
  outSlope?: Vec3;
};

export type PosKeyframe = {
  t: number;
  pos: Vec2;
  inSlope?: Vec2;
  outSlope?: Vec2;
};

// Visibility (m_IsActive) keyframe — extracted from Unity's m_FloatCurves with
// `attribute: m_IsActive, classID: 1`. Held step-wise: at sample time t, the
// active state is whichever keyframe's t is the latest <= sample t. A SetActive(false)
// on a parent hides all descendants, so the renderer accumulates visibility
// up the bone chain.
export type VisKeyframe = {
  t: number;
  active: boolean;
};

export type Track = {
  rot?: RotKeyframe[];
  pos?: PosKeyframe[];
  vis?: VisKeyframe[];
};

export type Clip = {
  name: string;
  duration: number;
  fps: number;
  tracks: Record<string, Track>;
};

export type AtlasRegion = {
  x: number;
  y: number;
  width: number;
  height: number;
  // Unity sprite pivot, normalised 0..1 from the sprite rect's bottom-left.
  // The renderer flips Y at draw time to anchor the pivot at the bone origin.
  pivot: Vec2;
};

export type SpriteAtlas = {
  image: string;
  width: number;
  height: number;
  regions: Record<string, AtlasRegion>;
  // Hi-res parts (AA pipeline). Source pixels per LOGICAL pixel — the atlas
  // image and its region rects are stored at native resolution and the
  // renderer folds 1/pixelDensity into the slice scale, so the art occupies
  // `height / pixelDensity` sprite pixels on the rig. Absent = 1 (every
  // pre-existing atlas, byte-identical rendering). Because the shrink is a CSS
  // transform, the browser samples the native-resolution source at final
  // display resolution — this is what makes lossless resize possible.
  pixelDensity?: number;
  // Render this atlas's slices with `image-rendering: auto` instead of the
  // default `pixelated` — for imported art that should scale smoothly rather
  // than as chunky pixels. Absent = pixelated (the default everywhere else).
  smooth?: boolean;
};

// E16 — bone transform export. SpumCharacter writes one entry per bone every
// rAF tick (after the existing slice-transform pass) so scene-level code
// (props, future speech bubbles, camera-follow, particle attachments) can read
// "where is this bone right now."
//
// Coordinate space: **post-outer-scale + post-facing-flip character-local CSS
// pixels.** I.e. the bone's position relative to SpumCharacter's render origin
// (the zero-size root div), with the character's `scale(outerRemainderScale)`
// and optional `scaleX(-1)` (facing right) already folded in. Scene-level
// consumers add the actor's scene-pixel position (read from the motion.div
// wrapper) to get true scene coordinates.
//
// `rotation` is in CSS degrees (clockwise positive, Unity-Y-up flip already
// applied), `scale` is the character's apparent size multiplier (so a prop
// rendered at base size multiplied by `scale` ends up the right size for the
// character).
export type BoneTransform = {
  x: number;
  y: number;
  rotation: number;
  scale: number;
};

export type BoneTransformMap = Map<string, BoneTransform>;

// E24b/E25a — per-bone pose override consumed by `<SpumCharacter>` via the
// `poseOverride` prop. When a bone path is present in the map, `sampleAt`
// substitutes the override's `rot` and/or `pos` for that bone instead of
// sampling the active clip's tracks. Bones absent from the map fall through
// to the clip sample; individual fields (`rot`, `pos`) are independently
// optional, so a bone can override rotation without position or vice versa.
// The shape stays close to `RotKeyframe.rot` / `PosKeyframe.pos` so the
// editor can derive an override directly from a sampled or sketched
// keyframe.
export type BonePose = {
  rot?: Vec3;
  pos?: Vec2;
  // E31 — additive rotation in Unity degrees, added ON TOP of whatever
  // rotation the bone otherwise has (the clip sample, or the absolute `rot`
  // override above). Used by the scene-level `pose` action so a head can
  // tilt while the clip keeps animating the rest of the rig. Missing = 0.
  addRotZ?: number;
};

// Scene runtime types (Phase 9). A SceneScript is a hand-authorable or
// editor-emitted timeline that drives multiple `<SpumCharacter>` instances
// plus optional props inside a fixed-size viewport. All positions are in
// scene pixels with the origin at the scene's top-left; +Y goes down.
export type SceneVec2 = { x: number; y: number };

export type SceneEase = "linear" | "easeIn" | "easeOut" | "easeInOut";

// Imported as a string to avoid a circular type dep; the catalog exports the
// `SceneAnimation` literal union we ultimately want here (SPUM's clip names
// plus the AA-original ones, which only play on an `aachar` actor).
import type { CharacterColors, CharacterConfig, SceneAnimation } from "./catalog";
import type { HorseAnimation, HorseColors, HorsePart } from "./horseCatalog";
import type { AppearanceFields, AppearancePerSlot } from "./appearance";
// BANJOPOCALYPSE port: propCatalog (3.5 MB of asset-pack data) is not ported.
// PropKey degrades to string; the game never renders SPUM props.
type PropKey = string;

// E22 — mount: an optional horse + horse animation attached to an actor.
// When set, the scene renders a `<SpumHorse>` at the actor's position, then
// renders the actor's `<SpumCharacter>` at the saddle bone position (read
// live from the horse's E16 BoneTransformMap each frame).
//
// `speed` is the horse-specific playback speed (multiplied through the same
// E21 speedRef accumulator as the rider character has). Default 1. The
// rider's clip speed is independent — authors can set `SceneActor.speed`
// for the rider and `mount.speed` for the horse separately.
//
// `colors` tints the horse atlas via the same SVG feColorMatrix pipeline
// the character rig uses for per-slot tints.
//
// H8 follow-up (docs/aachar-horse-plan.md): exactly ONE of `horse` /
// `aaHorse` must be set (Zod enforces). `horse` casts a SPUM catalog horse;
// `aaHorse` names an AA horse part from `model.horse.parts` in
// public/aachar/manifest.json (e.g. "biscuit") — the scene then renders the
// AA art (face composited) with the AA-rebuilt horse clips, same skeleton.
// Typed as a plain string here for the same reason `SceneAaRef.name` is:
// lib/spum stays free of runtime lib/aachar imports; the real roster check
// runs node-side in scripts/validate-content.ts.
export type SceneMount = {
  horse?: HorsePart;
  aaHorse?: string;
  animation?: HorseAnimation;
  speed?: number;
  colors?: HorseColors;
  // E22c — global hue/sat/brightness/contrast/sepia/blur dial applied to the
  // horse rig. Same `AppearanceFields` primitive the character `appearance`
  // slot uses; composes on top of `colors` (SVG feColorMatrix tint first,
  // then CSS filter chain). Identity / missing = no-op.
  appearance?: AppearanceFields;
  // E22c — author-tunable seat alignment. Added to the saddle bone's
  // transform each rAF so the rider's grounding point lands on the visible
  // saddle artwork (the bone itself is at the horse midline, but the
  // saddle blanket is drawn a few pixels off-centre on some horses, and
  // standing-pose rider clips need a small upward lift). Missing = (0, 0).
  riderOffset?: { x: number; y: number };
  // E22c — depth toggle for the rider's right arm + right-hand weapon.
  // `true` (default) paints them behind the horse alongside the right leg —
  // reads correctly for sword/bow swings on the offside. `false` paints them
  // in front, for shields raised across the body or banners held high.
  rightArmBehind?: boolean;
};

// Phase 7 (docs/aachar-plan.md) — a cast entry that renders a named AA
// character instead of a SPUM catalog config. `name` must match a character
// in `public/aachar/manifest.json` (checked at content-build time by
// scripts/validate-content.ts, which reads the manifest off disk). `hide`
// lists AA slot names ("weapon", "helmet", …) to strip from the character's
// picks for this scene only — e.g. drop a character's axe in a shop scene —
// without forking the character in the editor. Typed as plain strings here
// to keep lib/spum free of runtime lib/aachar imports; the Zod schema
// checks them against the real AA slot list.
// SCREEN-space gaze direction for an AA actor's pupils (mirrors
// lib/aachar's AaGazeDirection literally, re-declared to keep lib/spum free
// of lib/aachar imports). Screen-space: "left" means the pupils look toward
// the left edge of the scene regardless of which way the actor faces — the
// renderer flips the horizontal component for right-facing (mirrored) rigs.
export type SceneGazeDirection =
  | "up"
  | "down"
  | "left"
  | "right"
  | "up-left"
  | "up-right"
  | "down-left"
  | "down-right";

// Per-eye resting gaze — the fine-control form, mirroring lib/aachar's
// `AaGazePair` (re-declared here for the same no-imports reason as above).
// A bare `SceneGazeDirection` throws both pupils as far as the whites allow;
// this form exists for the two things that clamp cannot say:
//
//   `gap`   keep N pixels of white between the pupil and the edge it is
//           heading for. A flush pupil merges with the eye's outline on some
//           art — `AA_eyes7`'s big eye is the worked example: its pupil is a
//           single dark pixel, and at full throw it lands against the
//           outline and reads as a thick rim rather than an eye looking
//           sideways. `gap: 1` is the fix.
//   `{dx, dy}` a manual pixel offset for one eye (+dx = screen right,
//           +dy = UP). Still clamped to the whites at bake time, but `gap`
//           does not apply — an explicit offset owns its exact spot.
//
// Sides are VIEWER-relative (`left` = the leftmost eye box on screen), and
// the renderer swaps them along with the direction when a right-facing actor
// renders mirrored. A side left unset stays as drawn, so "one eye wanders"
// is a pair with one entry.
export type SceneGazeSide = SceneGazeDirection | { dx?: number; dy?: number };

export type SceneGazePair = {
  left?: SceneGazeSide;
  right?: SceneGazeSide;
  gap?: number | { left?: number; right?: number };
};

// Cast-time gaze accepts either form. The mid-scene `gaze` ACTION stays
// direction-only on purpose: a beat is "he looks left", and anything needing
// per-pixel control is a resting look, not a beat.
export type SceneGaze = SceneGazeDirection | SceneGazePair;

export type SceneAaRef = {
  name: string;
  hide?: string[];
  // Per-SLICE hide, one level finer than `hide` (which drops a whole slot's
  // pick). Keys are `"<slot>:<region>"` exactly as `SLOT_REGION_TO_BONE` in
  // `SpumCharacter.tsx` names them — the rig's individually-bound pieces.
  // The useful ones:
  //
  //   body:Arm_L / body:Arm_R      the front (z=20) and back (z=-20) arms
  //   cloth:Left / cloth:Right     that arm's sleeve
  //   body:Foot_L / body:Foot_R    a leg
  //   body:Head                    the head
  //
  // Reach for it when the CHARACTER is missing a part, not when the scene
  // wants a part out of the way — an amputee, a prop covering a limb.
  // `unit0-lesson4-ch8` is the worked example: Sterling only has the arm
  // he's waving, so his other arm and its sleeve are hidden.
  //
  // Bones keep animating either way; this only stops the slice being drawn.
  hideSlices?: string[];
  // Initial pupil gaze (screen-space). Omitted = the character's resting
  // pupils. Only moves if the eye part has authored `eyes` marks; range is
  // clamped by the art (see lib/aachar/gaze.ts). A bare direction throws
  // both pupils to that clamp; the `SceneGazePair` form adds `gap` and
  // per-eye offsets — see the type above. Change mid-scene with a `gaze`
  // action (directions only).
  gaze?: SceneGaze;
  // Mouth override: a faceHair-slot part name from the AA manifest (e.g.
  // "grin", "jawagape") swapped in for the character's own mouth pick.
  // Omitted = the character's default mouth. An unknown name warns and
  // keeps the default. First consumer: CONVO's feelings (see
  // lib/challenge-adapters/convo-feelings.ts).
  mouth?: string;
};

export type SceneActor = {
  id: string;
  // Phase 7 — when set, the scene renders this AA character (via
  // `AaSceneCharacter`) and `config` may be omitted; the character's whole
  // editor look (colours, hat-hair, eye state, shading) comes with it. The
  // actor's `id` stays the scene's own handle — actions, prop anchors and
  // bubbles keep addressing the id, so swapping a SPUM rig for an AA
  // character is a cast-entry edit, not a scene rewrite. Composes with
  // `mount` since the H8 follow-up: an AA character rides with its legs held
  // to the model-level straddle pose (`model.horse.rider`) while every other
  // channel plays its normal clip.
  aachar?: SceneAaRef;
  // Required for SPUM-config actors; optional (ignored except for
  // appearance-action overrides) when `aachar` is set.
  config?: CharacterConfig;
  position: SceneVec2;
  facing?: "left" | "right";
  animation?: SceneAnimation;
  // Apparent size multiplier (1 = base). E12 added this — it decouples
  // author-facing size from the internal sprite scale so the rig renders at
  // an integer-multiple of source pixels (crisp under `image-rendering:
  // pixelated`) with a small CSS remainder for fractional sizes.
  size?: number;
  // Deprecated alias for `size` — pre-E12 scenes still set `scale` and we
  // keep accepting it; `size` wins if both are present.
  scale?: number;
  // E21 — default playback-speed multiplier for this actor's clips. Mirrors
  // SPUM's `SPUM_AnimationData.SpeedParam`. 1 = normal, 0.5 = half-speed,
  // 2 = double. Per-`play`-action `speed` overrides this for the duration
  // of that play. Missing = 1.
  speed?: number;
  // Frame-stepped playback: quantize this actor's clip clock to `stepFps`
  // poses per clip-second (wall rate = stepFps × speed) so each pose holds
  // as a stable raster. A cadence/style knob — for killing DPR-1 shimmer
  // use `pixelSnap` instead (stepFps only helps when steps are so sparse
  // the animation reads as choppy). Missing = continuous.
  stepFps?: number;
  // Rotation-sway snapping — THE anti-ripple knob. Quantizes each bone's
  // rotation sway around the clip's own frame-0 baseline to 5° steps,
  // zeroing the ±1–2° idle micro-sways whose row-by-row nearest-neighbor
  // shear IS the shimmer on DPR-1 monitors. Authored stances render
  // exactly (baseline = the clip's frame-0 pose); translations stay
  // continuous so idles glide instead of popping. Works at any scene
  // scale — no art resizing needed. Missing = off.
  pixelSnap?: boolean;
  // E22 — mount (optional horse). When set, the actor rides the horse:
  // the horse renders at the actor's position, the character renders at
  // the horse's saddle bone (Pivot_Body/Acc). The rider's clip plays
  // independently of the horse's; coordinate animation via per-play
  // actions on the actor + on the mount's animation field.
  mount?: SceneMount;
  // E22e — explicit stacking order across actors. When set, the actor's
  // wrapper div uses this as `z-index`; actors with higher values paint on
  // top. Default (undefined) leaves z-index unset and DOM order from
  // `script.cast` decides the layering. Use this to put a charging knight
  // in front of his victim without re-sorting the cast array.
  zIndex?: number;
  // Initial opacity (0..1, default 1). Applied to the actor's wrapper div
  // on mount; subsequent `fade` actions interpolate from here. Use a value
  // below 1 for pre-mounted dramatic reveals (actor starts invisible, fades
  // in at a scripted beat) or ghost/memory tableaux that read translucent
  // throughout.
  opacity?: number;
};

// Scene-time reference. Either an absolute scene-second (today's behaviour)
// or a relative anchor — `{ after: <label>, offset?: <seconds> }` — that
// resolves to `actionByLabel(after).t + offset` once `resolveSceneTimes` has
// run over the script. The runtime only ever sees the absolute-number form;
// the relative form is an authoring affordance that the preprocessor
// flattens before the rAF (or any other consumer) touches the script.
// Forward refs only — see docs/spum-scene-authoring.md §22.
export type SceneTime = number | { after: string; offset?: number };

type SceneActionBase = {
  t: SceneTime;
  actor: string;
  // Optional author-assigned identifier other actions can anchor against
  // via `{ after: label, offset }`. Scoped to the script being resolved.
  // Labels need to be unique within the script (the preprocessor throws on
  // collisions); a missing/empty label means "no other action can anchor
  // here." Authors only set this on actions other beats reference.
  label?: string;
};

export type SceneMoveAction = SceneActionBase & {
  type: "move";
  to: SceneVec2;
  duration: number;
  ease?: SceneEase;
};

export type ScenePlayAction = SceneActionBase & {
  type: "play";
  animation: SceneAnimation;
  // E21 — one-shot semantics. When true, the clip plays once at its full
  // duration (divided by the effective speed) and the actor reverts to the
  // last looping animation (its `baseAnimation`, set by the most recent
  // non-oneShot play action — or the actor's initial `animation`). Mirrors
  // SPUM's Animator trigger states (ATTACK/DAMAGED/DEATH/OTHER are one-shot
  // triggers; IDLE/MOVE/DEBUFF are bool-driven loops). Missing/false = the
  // clip loops indefinitely (today's behaviour).
  oneShot?: boolean;
  // E21 — per-play speed override. Multiplies the actor's `speed` (and the
  // global default 1) for the duration of this play. Missing = use the
  // actor's `speed`. When the actor reverts from a one-shot, the speed
  // reverts to the baseAnimation's effective speed too.
  speed?: number;
};

export type SceneFaceAction = SceneActionBase & {
  type: "face";
  facing: "left" | "right";
};

// E22d — retarget a mounted actor's horse animation mid-scene. Only meaningful
// for actors with a `mount` config; ignored if the actor isn't mounted. The
// rider's own clip is unaffected — use a separate `play` action with the same
// actor id to coordinate the two rigs.
export type SceneMountPlayAction = SceneActionBase & {
  type: "mountPlay";
  animation: HorseAnimation;
};

// Tween an actor's wrapper opacity from its current value to `to` over
// `duration` seconds. Covers ghost beats, memory cutaways, fade-out on
// death, and pre-mounted reveals (start the actor at `opacity: 0` on the
// cast entry, then fade in to 1). Per-slice opacity within an actor is not
// supported — this is the actor as a whole.
export type SceneFadeAction = SceneActionBase & {
  type: "fade";
  to: number;
  duration: number;
  ease?: SceneEase;
};

// Prop actions don't bind to an actor — `prop` is a unique id within the
// scene. Re-firing an action with the same `prop` id replaces the prop's
// motion segment, so a follow-up prop action can move a settled prop to a
// new location or off-screen.
export type ScenePropAction = {
  t: SceneTime;
  label?: string;
  type: "prop";
  prop: string;
  // Sprite source — pick one:
  //   - `propKey`: typed registry key from `propCatalog`. Preferred path.
  //     Resolves to a URL via `resolvePropImage`.
  //   - `image`: raw URL escape hatch (kept for legacy scenes + truly ad-hoc
  //     paths not worth registering).
  //   - `emoji`: literal emoji rendered instead of an image.
  // Resolution precedence is propKey > image > emoji.
  propKey?: PropKey;
  image?: string;
  emoji?: string;
  from: SceneVec2;
  to: SceneVec2;
  duration: number;
  size?: number;
  ease?: SceneEase;
};

// Scene-level screen-shake. Not scoped to an actor — jitters the inner scene
// wrapper as a whole so every visible element (cast, props, FX, bubbles) is
// displaced together. The offset decays linearly to zero over `duration` so a
// strike beat reads as a snappy impact that settles rather than a sustained
// rumble. `magnitude` is in scene pixels (matches the rest of the coordinate
// system; consistent across responsive scale). `frequency` is oscillations
// per second — high enough to read as a shake (~30 Hz) rather than a slide.
// Multiple shakes overlapping just sum their offsets, so a sword strike and a
// thunderclap on the same beat double up rather than cancel.
export type SceneShakeAction = {
  t: SceneTime;
  label?: string;
  type: "shake";
  duration: number;
  magnitude?: number;
  frequency?: number;
};

// Runtime override of an actor's appearance / per-slot appearance / colours,
// composed on top of the cast-time `CharacterConfig`. Each channel follows a
// tri-state convention: `undefined` = leave the existing override unchanged,
// `null` = clear the override (revert to the cast-time config), value = apply.
// This lets a single action touch one channel without disturbing the others.
//
// `revertAfter` is optional sugar for damage-flash–style beats: snapshot the
// pre-action override state, apply the new override, and N seconds later
// restore the snapshot. When omitted, the override sustains until another
// `appearance` action overrides or clears it.
//
// `colors` merges by key onto whatever's currently in effect — a partial
// override (e.g. just `eyeIris`) composes onto the cast-time tints rather
// than replacing them entirely. `appearance` and `appearancePerSlot` replace
// wholesale since they're "global dial" semantics.
export type SceneAppearanceAction = SceneActionBase & {
  type: "appearance";
  appearance?: AppearanceFields | null;
  appearancePerSlot?: AppearancePerSlot | null;
  colors?: CharacterColors | null;
  revertAfter?: number;
};

// E31 — bone pose offset. Tweens an additive rotation on one of the actor's
// bones from its current offset to `addRot` over `duration` seconds. The
// offset composes ON TOP of the running clip's sampled rotation (the rest of
// the rig keeps animating), holds until the next `pose` action on the same
// actor+bone, and is evaluated as a pure function of scene-time (seek / loop
// replay it deterministically — see lib/spum/poseEvaluator.ts).
//
// `addRot` is in degrees, clockwise-positive on the UNFLIPPED rig. Because
// SPUM rigs are authored facing left and `facing: "right"` mirrors the whole
// character, a positive `addRot` on the head bone reads as "tilt the face
// upward" REGARDLESS of facing (the mirror flips the rotation together with
// the face). Negative = tilt down. Omit (or 0) to tween back to neutral.
//
// Typical use — look up at something falling from the sky:
//   { t: 1.2, actor: "jenny", type: "pose",
//     bone: "Root/BodySet/P_Body/HeadSet/P_Head", addRot: 26, duration: 0.25 }
//   ...
//   { t: 5.8, actor: "jenny", type: "pose",
//     bone: "Root/BodySet/P_Body/HeadSet/P_Head", duration: 0.3 }  // back down
export type ScenePoseAction = SceneActionBase & {
  type: "pose";
  bone: string;
  addRot?: number;
  duration?: number;
  ease?: SceneEase;
};

// E28 — camera move. Scene-level (no actor binding, like `shake`): tweens
// the virtual camera from its state at `t` to a new look-at point and/or
// zoom over `duration` seconds. The camera is a pure function of scene-time
// (see lib/spum/cameraEvaluator.ts), so seeking / looping replays it
// deterministically. Default camera = the whole scene at zoom 1, i.e.
// look-at (width/2, height/2) — override the starting frame with
// `SceneScript.camera`.
//
// Fields (all optional except `t` / `duration`):
//   - `to`      — look-at point in scene pixels (the point that lands at
//                 the viewport centre). Omitted = keep the current look-at
//                 (zoom-only move).
//   - `zoom`    — absolute magnification (1 = full frame, 2 = 2×). Omitted
//                 = keep the current zoom (pan-only move). Values < 1 pull
//                 back past the scene edges — whatever lies outside the
//                 scene shows the viewport background, so reserve it for
//                 deliberate "big world" reveals.
//   - `follow`  — actor id. While this segment is active (and after it
//                 locks on), the look-at tracks the actor's live position
//                 (≈ its feet anchor) plus `followOffset` each frame — the
//                 tween eases *toward the moving target*, then sticks.
//                 Ends when the next camera action fires. Wins over `to`.
//   - `duration`— seconds for the eased tween. 0 = hard cut.
//
// Camera moves compose with `shake` (shake jitters the viewport, outside
// the camera transform, so magnitude reads the same at any zoom) and with
// the scene `loopFade`. Actor-attached decorations (props, bubbles, FX,
// particles) live inside the camera space and zoom/pan with the world.
export type SceneCameraAction = {
  t: SceneTime;
  label?: string;
  type: "camera";
  to?: SceneVec2;
  zoom?: number;
  follow?: string;
  followOffset?: SceneVec2;
  duration: number;
  ease?: SceneEase;
};

// Pupil gaze change on an AA actor (no-op on SPUM-config actors). `gaze` is
// a screen-space direction; `null` restores the character's resting pupils.
// The change is a re-bake of the eye atlas (cached per direction), so it
// lands a beat after `t` on first use and instantly on scene loops.
export type SceneGazeAction = SceneActionBase & {
  type: "gaze";
  gaze: SceneGazeDirection | null;
};

export type SceneAction =
  | SceneMoveAction
  | ScenePlayAction
  | SceneFaceAction
  | SceneMountPlayAction
  | SceneFadeAction
  | ScenePropAction
  | SceneShakeAction
  | SceneAppearanceAction
  | ScenePoseAction
  | SceneGazeAction
  | SceneCameraAction;

// E17 — anchor primitive for scene-affixed elements. Reusable across props
// (E17/E18), speech bubbles (E13d), particle attachments, and future
// scene-affixed UI. A "static" anchor is a fixed scene-pixel coordinate; a
// "bone" anchor resolves per-frame to a live bone position read from the
// `BoneTransformMap` E16 publishes.
//
// Bone anchors carry optional `offset` (local pixels added in the bone's
// rotated frame) and `rotationOffset` (degrees added on top of the bone's
// rotation) so an author can attach a coffee cup that grips the hand bone
// with a small forward offset and tilted 15° without inventing a new bone.
export type SceneAnchor =
  | { kind: "static"; x: number; y: number; rotation?: number }
  | {
      kind: "bone";
      actor: string;
      bone: string;
      offset?: { x: number; y: number };
      rotationOffset?: number;
    };

// E17 — prop timeline segment. Each segment carries a from→to motion over
// [from, to] seconds; segments on the same prop must not overlap in time.
// `trajectory` picks the path shape: linear (straight line) or arc (parabola
// via `arcPeakY`). `spinRate` rotates the prop continuously (deg/sec);
// `orientToTrajectory` overrides spin by aligning the prop to the tangent of
// the parametric curve (useful for thrown weapons that should "point where
// they're going"). Opacity and scale interpolate linearly across the segment
// when set.
//
// E17a (this entry) supports linear + static-anchor only. Arc, spin,
// orient-to-trajectory, bone anchors, and rotation continuity across
// segments land in E17b.
export type PropSegment = {
  from: number;
  to: number;
  fromAnchor: SceneAnchor;
  toAnchor: SceneAnchor;
  trajectory: "linear" | "arc";
  arcPeakY?: number;
  spinRate?: number;
  orientToTrajectory?: boolean;
  ease?: SceneEase;
  fromOpacity?: number;
  toOpacity?: number;
  fromScale?: number;
  toScale?: number;
  // Author-set z-index for this segment. When absent, the prop's `layer`
  // resolution wins. Segments can override (e.g. a carried prop bumps to
  // a higher z while attached). Authors are responsible for bumping zIndex
  // if a back-of-body arm pose needs to occlude a held prop.
  zIndex?: number;
};

// E13e — static scene props. Distinct from `ScenePropAction` (timeline-fired,
// animated from→to): a `SceneProp` is a fixed decoration drawn at (x, y) for
// the entire scene. `layer` picks which side of the character layer the prop
// renders on — "back" draws below the cast, "front" draws on top. Anchor is
// top-left in scene pixels so positioning lines up with the background image
// and scene edges.
//
// Sizing: the prop renders at the image's natural pixel resolution; `scale`
// multiplies both axes uniformly so aspect ratio is preserved (1 = 100%,
// 0.5 = half, 2 = double).
//
// E17 — `timeline` optionally drives the prop through a series of motion
// segments. When set, the renderer routes through `evaluatePropAt` each
// rAF tick and the (x, y) base position is treated as the prop's initial
// rest position before the first segment (and the position after the last
// segment ends). `pivot` picks the prop's grab point — 0..1 normalised
// against the image's natural bounds (default `{x: 0.5, y: 0.5}` = centre).
// When `timeline` is absent, the prop renders statically at (x, y) as today.
export type SceneProp = {
  id: string;
  // Sprite source — pick one. `propKey` (typed registry key from
  // `propCatalog`) is the preferred path so the editor + scenes get
  // autocomplete, tag-search, and packwide browsing. `image` is the raw URL
  // fallback that the previous scene format used; existing scenes keep
  // working without migration. Resolution precedence: propKey > image.
  propKey?: PropKey;
  image?: string;
  x: number;
  y: number;
  scale?: number;
  // Horizontal-only squash/stretch, multiplied ON TOP of `scale` (and on top
  // of a timeline segment's `fromScale`/`toScale`, which stay uniform). 1 =
  // untouched, 0.8 = 80% as wide, 1.3 = stretched. Applied around the prop's
  // pivot like every other transform, so a top-left-pivoted prop squashes
  // toward its left edge. Use it to fit a stock asset to a scene's
  // proportions without redrawing it — `unit0-lesson2-ch7`'s generator is
  // the worked example.
  scaleX?: number;
  // Static rotation in degrees (positive = clockwise). Applied around the
  // prop's pivot point. When `timeline` drives the prop, timeline-segment
  // rotation composes on top of this base value.
  rotation?: number;
  // Mirror the sprite horizontally around its pivot. Useful for re-using a
  // single asset that needs to face the other way (props look identical to
  // their mirror image often enough that authoring both directions would be
  // wasteful).
  flipX?: boolean;
  layer: "back" | "front";
  timeline?: PropSegment[];
  pivot?: { x: number; y: number };
  // Static appearance dial (hue/sat/brightness/…) applied via CSS `filter`
  // on the prop wrapper — same `AppearanceFields` primitive FX and mounts
  // use. Wrapper-level so destruct shards inherit it too.
  appearance?: AppearanceFields;
  // E29 — destruction. Same config + engine as sprite destruct (see
  // SceneSprite.destruct); the prop's natural image box is the frame that
  // gets cut. Tune in /admin/spum?tab=destruct (each prop's card in
  // /admin/spum/props has a 💥 shortcut).
  destruct?: SceneSpriteDestruct;
};

// E26 — animated sprite actors. Non-SPUM spritesheet characters from the
// sprite catalog (`lib/sprites/spriteCatalog.ts` — the /admin/spum "Sprites"
// tab) placed directly in a scene. A sprite plays one flattened animation
// row (`anim`, 1-based — same "anim3" numbering the admin library shows) on
// its own wall-clock interval, and moves via the same E17 `PropSegment`
// timeline machinery props use. Distinct from `SceneProp` (static image,
// no frame animation) and `SceneFx` (registered one-shot cue sheets):
// a SceneSprite is a living background character — a goose waddling by,
// a beholder hovering menacingly.
//
// Frame stepping is wall-clock (not scene-clock): sprite anims are ambient
// loops, so editor pause/seek doesn't freeze their cycle. Motion, however,
// IS scene-clock via the timeline, so looping scenes replay sprite paths.
export type SceneSprite = {
  id: string;
  /** Sprite catalog id, e.g. "goose". */
  sprite: string;
  /** 1-based flattened animation index (the admin library's "animN"). */
  anim: number;
  // Rest position in scene pixels — the pivot point lands here. Same
  // contract as SceneProp: when `timeline` is set this is the position
  // before the first segment starts.
  x: number;
  y: number;
  /** Uniform scale on the natural frame pixels. Default 1. */
  scale?: number;
  /** Frame rate override. Default: the catalog entry's fps. */
  fps?: number;
  // Mirror horizontally around the pivot. Farm-pack side rows face right,
  // so leftward movers set this.
  flipX?: boolean;
  rotation?: number;
  layer: "back" | "front";
  zIndex?: number;
  // Pivot (0..1 of the frame box) — where (x, y) grabs the sprite. Default
  // `{x: 0.5, y: 0.5}` (centre), unlike props' top-left legacy default.
  pivot?: { x: number; y: number };
  // E17 motion segments — same shape and evaluator as prop timelines.
  timeline?: PropSegment[];
  // E29/E30 — destruction. At scene-time `destruct.t` the sprite is
  // destroyed by one of eleven kinds: tumbling shards (slice / crack /
  // explode / shatter), falling sand or rising ash (sand / burn),
  // corrupted scanlines (glitch), or vortex / melt / topple / pop. Tune in
  // /admin/spum?tab=destruct and paste the emitted config here. See
  // lib/spum/destructEngine.ts for field docs.
  destruct?: SceneSpriteDestruct;
};

// E13c — scene background. Three shapes are accepted:
//
//  1. CSS color/value as a plain string: `"#f5f5f4"` / `"transparent"` / a
//     `linear-gradient(...)` blob. Rendered via the inner scene div's
//     `background:` shorthand.
//  2. Image path as a plain string: `"/images/.../bunker.png"` or `"https://…"`.
//     Detected by `isSceneBackgroundImage()`. Renders as a `cover`-fit
//     pixelated `<img>` layer that fills the scene viewport.
//  3. Positioned image as an object: `{ image, x?, y?, width?, height? }`.
//     Renders the `<img>` at the exact `(x, y)` top-left in scene pixels and
//     the given `width × height`. Each field defaults to the corresponding
//     full-scene cover value when omitted (`x=0`, `y=0`, `width=scene.width`,
//     `height=scene.height`), so an `{ image: "..." }` object form behaves
//     the same as the bare string form.
//
// Shape (3) lets authors slide a backdrop sideways, scale it up to a
// pixel-multiple, or crop into a region of a larger source PNG without
// pre-processing the asset.
export type SceneBackgroundImage = {
  image: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
};

export type SceneBackground = string | SceneBackgroundImage;

// E19 — sprite-sheet FX. Author-placed decorative animations (explosions,
// sparkles, dust puffs) fired at any scene anchor — static or bone — with
// the same scale/pivot/appearance machinery props already use. Distinct
// from rigged-character motion (clips on SceneActor) and rigid-object
// motion (SceneProp): FX is the "decorative emphasis" slot.
//
// Frame stepping: the renderer fetches the FX's `.fx.json` metadata (rows,
// cols, frameCount, fps) at mount and per rAF computes
// `frameIndex = floor((t - start) * fps) % frameCount`. Anchor resolution
// reuses the prop-pipeline `resolveAnchor` (static / bone with offset).
//
// Loops semantics:
//   - `loops` default 1 (play once and stop)
//   - `loops: 0` plays forever while the FX exists in the scene
//   - `onEnd: "hold"` freezes on the last frame after the final loop
//   - `onEnd: "remove"` (default) hides the FX after the final loop
// BANJOPOCALYPSE port: the scene-FX catalogs (fxCatalog, atmosphereCatalog,
// particleCatalog, destructEngine — ~200 KB of data for accountingsurvivor's
// lesson scenes) are not ported. Their key types degrade to permissive
// aliases; the game never spawns SPUM scene FX.
type FxKey = string;
type AtmosphereConfig = Record<string, unknown>;
type ParticleKey = string;
export type SceneSpriteDestruct = Record<string, unknown>;

export type SceneFx = {
  id: string;
  fx: FxKey;
  anchor: SceneAnchor;
  // Scene-time seconds at which the FX begins playing. Before this time
  // the FX renders hidden (opacity 0).
  start: number;
  // Loop count. Default 1 = play once. `0` = play forever while alive.
  loops?: number;
  // Optional playback-rate override. When set, the renderer steps frames at
  // this FPS instead of the source's authored `meta.fps`. Lets authors slow
  // a 24 fps explosion to 4 fps for a dramatic beat without re-authoring
  // the sheet. Total playback duration becomes `frameCount * loops / fps`.
  fps?: number;
  // Apparent size multiplier on the source frame dimensions. Default 1.
  scale?: number;
  // Pivot point on the FX frame, 0..1 normalised against frame size.
  // Default `{x: 0.5, y: 0.5}` — centred on the anchor.
  pivot?: { x: number; y: number };
  rotation?: number;
  opacity?: number;
  layer: "back" | "front";
  // Optional hex tint (e.g. "#7d4a2a"). Multiplied per-pixel into the FX
  // sheet via an SVG `<feColorMatrix>` filter — same mechanic as character
  // slot tints, faithful to Unity's `SpriteRenderer.color`. Composes with
  // `appearance`: tint applies first (RGB multiply), then the appearance
  // filter chain (brightness / hue-rotate / etc.).
  color?: string;
  // Optional per-FX appearance dial (hue/sat/brightness/etc.) applied via
  // CSS `filter`. Composes on top of the FX div directly.
  appearance?: AppearanceFields;
  // What to do after the final loop completes. Default "remove" hides
  // the FX; "hold" freezes on the last frame so the residue stays visible
  // (useful for impact marks, lingering smoke).
  onEnd?: "remove" | "hold";
};

// E13d — speech / thought / exclamation bubbles. Lives in the scene as a
// top-level array (like `props` and `fx`), not as a time-bounded action,
// so a bubble can sit on a static point (a building label) just as easily
// as it can be glued to an actor's head bone. The author's "say X for N
// seconds" intent maps to a single `SceneBubble` with start + end.
//
// Style is a discriminated union over three families:
//   - `rounded`   — classic speech bubble with a triangle tail. Variant
//                   picks "classic" (single-line border) or "drop-shadow"
//                   (extra silhouette offset).
//   - `thought`   — ellipse or cloud body with a three-dot dotted tail.
//   - `exclaim`   — Batman-66 starburst (no tail; impact effect).
//
// Common fields (pixelSize, fontScale, padding, etc.) live on every variant
// so the editor's slider state maps 1:1 into any style without losing knobs
// when the user switches kinds. `widthPx`/`heightPx === null` means "auto-
// size to text" — same convention the harness uses for its sliders.
type SceneBubbleStyleCommon = {
  pixelSize: number;
  fontScale: number;
  paddingX: number;
  paddingY: number;
  lineHeight: number;
  sideTrim: number;
  widthPx: number | null;
  heightPx: number | null;
  wrap: boolean;
  textAlignH: "left" | "center" | "right";
  textAlignV: "top" | "middle" | "bottom";
  textOffsetX: number;
  textOffsetY: number;
  textColor: string;
  bgColor: string;
};

type SceneBubbleStyleTail = {
  // "none" draws no tail at all — for captions / title cards, where a tail
  // would imply a speaker who isn't in the shot.
  tailShape: "none" | "slanted-left" | "wide" | "slanted-right";
  tailXPercent: number;
};

export type SceneBubbleStyle =
  | ({
      kind: "rounded";
      variant: "classic" | "drop-shadow";
      cornerRadius: number;
    } & SceneBubbleStyleTail &
      SceneBubbleStyleCommon)
  | ({
      kind: "thought";
      shape: "ellipse" | "cloud";
    } & SceneBubbleStyleTail &
      SceneBubbleStyleCommon)
  | ({
      kind: "exclaim";
      shape: "star-8" | "spiky-5";
    } & SceneBubbleStyleCommon);

// Optional enter/exit transition on a bubble. Defaults (undefined) preserve
// the hard-cut behaviour: bubble snaps in at `start` and snaps out at `end`.
//   - `fade`:   opacity 0 ↔ 1 over `duration` seconds (linear).
//   - `pop`:    scale 0 → 1.15 → 1.0 (enter) or 1.0 → 1.15 → 0 (exit) — a
//               brief overshoot for comedic emphasis.
//   - `bounce`: bubble drops in from above with a three-bounce decay (enter),
//               or accelerates up and fades (exit). Y-position based; reads
//               as a physical drop / lift.
//   - `shake`:  damped horizontal wobble. Enter snaps to visible with a
//               startled jitter that settles; exit shakes while fading.
// One kind per direction — pick the one that fits the beat. Scale, opacity,
// and the dx/dy offsets are written to the same wrapper that carries the
// body-bottom-centre translate, with `transform-origin: 50% 100%` so pop's
// scale grows around the bubble's anchored bottom-centre.
export type SceneBubbleTransition = {
  kind: "fade" | "pop" | "bounce" | "shake";
  duration: number;
};

// A bubble lives at a `SceneAnchor` between `start` and `end` (omitted end =
// stays visible to scene duration). The bubble's body-bottom-centre lands at
// `resolveAnchor(anchor) + offset`; the tail (if the style has one) hangs
// below toward the anchor itself, so the natural read for speech is
// "anchor at head, offset.y small/zero → tail tip near the head."
// `layer` defaults to `"front"` (bubbles almost always sit on top of the
// cast); set `"back"` for backdrop labels meant to sit behind characters.
export type SceneBubble = {
  id: string;
  anchor: SceneAnchor;
  start: number;
  end?: number;
  text: string;
  style: SceneBubbleStyle;
  offset?: { x: number; y: number };
  layer?: "back" | "front";
  // E22e — explicit stacking order. When set, the bubble wrapper applies this
  // as `z-index`; higher values paint on top. Needed when an actor's own
  // `zIndex` lifts it above sibling DOM order — without an explicit bubble
  // `zIndex`, the actor would otherwise occlude its own speech bubble.
  // Default (undefined) leaves z-index unset and DOM order decides.
  zIndex?: number;
  enterTransition?: SceneBubbleTransition;
  exitTransition?: SceneBubbleTransition;
};

// Anchored particle-emitter instance. Third leg of the decoration stool:
// `atmosphere` is scene-wide weather, `fx` is a sprite-sheet cue, and a
// SceneParticle is a PROCEDURAL emitter running at an anchor — bubbles off a
// cauldron, a torch flame, a lightning strike on a head bone. Presets live
// in `lib/spum/particleCatalog.ts`; browse + tune in /admin/spum?tab=particles.
//
// Timing: emission runs while scene-time is in [start, end). `start`
// defaults to 0; omitted `end` means "the whole scene" (and ambient
// emitters keep breathing after a non-looping scene settles, like sprite
// anims do). One-shot presets (explosions, poofs) fire their bursts at
// `start` and drain — `end` is irrelevant for them. Existing particles
// always finish their lifetime after the window closes (graceful drain).
//
// Overrides (all optional):
//   - `scale`    — geometric multiplier: sizes, spawn zones, speeds and
//                  gravity all scale together, so 2× looks like the same
//                  effect built twice as big.
//   - `intensity`— 0..1.5 multiplier on spawn rate / burst size.
//   - `speed`    — simulation-time multiplier (0.5 = slow motion).
//   - `angle`    — degrees added to the preset's emission direction
//                  (0 = up, clockwise positive). Aim jets/cones with this.
//   - `flipX`    — mirror the effect horizontally (tear sprays, side jets).
//   - `color`    — replace the preset's palette with a single tint.
//   - `opacity`  — 0..1 multiplier on every particle's alpha.
//   - `pixel`    — pixel-art mode: the instance renders at 1/N resolution
//                  and upscales nearest-neighbour, so every shape reads as
//                  chunky N-px blocks (3 is a good start; 2–12). Omit for
//                  smooth rendering. Note: additive ("lighter") emitters
//                  lose their glow-through against the scene in this mode —
//                  which is usually what pixel art wants anyway.
//   - `seed`     — vary the deterministic random stream when two instances
//                  of the same preset share an id-like name.
export type SceneParticle = {
  id: string;
  preset: ParticleKey;
  anchor: SceneAnchor;
  layer: "back" | "front";
  start?: number;
  end?: number;
  scale?: number;
  intensity?: number;
  speed?: number;
  angle?: number;
  flipX?: boolean;
  color?: string;
  opacity?: number;
  pixel?: number;
  seed?: number;
};

export type SceneScript = {
  width: number;
  height: number;
  duration: number;
  cast: SceneActor[];
  actions: SceneAction[];
  background?: SceneBackground;
  props?: SceneProp[];
  // E26 — animated sprite actors from the sprite catalog.
  sprites?: SceneSprite[];
  fx?: SceneFx[];
  bubbles?: SceneBubble[];
  // Scene-level ambient particle/weather layer (rain, snow, dust, embers,
  // fog, cherry blossom). Continuous backdrop — distinct from `fx` which is
  // per-cue. Author by tuning a variant in the Atmosphere tab, then pasting
  // the emitted config here. Omit for no atmosphere.
  atmosphere?: AtmosphereConfig;
  // Anchored particle emitters (bubbles, fire, smoke, lightning, magic…).
  // Author by tuning a preset in the Particles tab, then pasting the
  // emitted entry here. See `SceneParticle` above.
  particles?: SceneParticle[];
  // E28 — initial camera framing. Look-at point (scene px; the point that
  // renders at the viewport centre) + zoom. Every field optional: missing
  // x/y default to the scene centre, missing zoom to 1 — so an omitted
  // `camera` is the classic full-frame locked-off shot. `camera` actions
  // tween from here.
  camera?: { x?: number; y?: number; zoom?: number };
  // When true, the rAF resets to t=0 (rebuilding actor/prop runtimes from
  // the cast's initial state) every time it crosses `duration` instead of
  // halting at the settled final frame. Use it for ambient / idle scenes
  // that should keep playing forever while the learner reads the question
  // — e.g. a giggling creep on a SELECT challenge. Default false (one-shot
  // playback, matches the pre-existing engine behaviour). Independent of
  // per-actor clip looping (actors loop their current clip regardless);
  // this flag controls the *scene-level* timeline only.
  loop?: boolean;
  // Seconds of scene-wide fade at both edges of a looping pass: the whole
  // scene (background, cast, props, bubbles — everything, as one unit, so
  // carried props stay visually locked to their bones) fades out over the
  // last `loopFade` seconds of each pass and back in over the first
  // `loopFade` seconds of the next. Only meaningful with `loop: true`;
  // must be well under `duration / 2`. This fade-out → restart → fade-in
  // repetition is the house default ending for lesson scenes (see the
  // authoring doc §1) — a hard settle reads as the scene "dying".
  loopFade?: number;
  // Phase 7 / Phase 13 — the scene's light direction, consumed by AA actors'
  // auto-shading bake ("left" ≈ top-left is the genre default; "below" is
  // the campfire underlight). SPUM-config actors ignore it (their art is
  // pre-shaded). A mirrored actor (facing right) swaps left/right
  // automatically. Omitted = "left".
  light?: "left" | "top" | "right" | "below";
};

export function isSceneBackgroundImage(value: string): boolean {
  return value.startsWith("/") || /^https?:\/\//i.test(value);
}

// Resolved render plan for the scene's background, normalised against the
// scene's pixel dimensions. Callers branch on `mode` and use the resolved
// fields directly — no further defaulting required.
export type ResolvedSceneBackground =
  | { mode: "none" }
  | { mode: "css"; value: string }
  | {
      mode: "image";
      src: string;
      // Top-left in scene pixels. (0, 0) is the scene's top-left corner.
      x: number;
      y: number;
      // Display size in scene pixels. May be larger than the scene to crop or
      // smaller to leave gutters. The `<img>` is clipped by the scene's
      // `overflow: hidden`.
      width: number;
      height: number;
      // `cover` means the source string was a bare image path — caller can
      // use `object-fit: cover` to letterbox/crop preserving source aspect.
      // `exact` means the author provided x/y/width/height explicitly — the
      // image stretches to fill that box (no aspect preservation; authors
      // pick integer-pixel multiples for pixel-art crispness).
      fit: "cover" | "exact";
    };

export function resolveSceneBackground(
  bg: SceneBackground | undefined,
  sceneWidth: number,
  sceneHeight: number,
): ResolvedSceneBackground {
  if (bg === undefined) return { mode: "none" };
  if (typeof bg === "string") {
    if (isSceneBackgroundImage(bg)) {
      return {
        mode: "image",
        src: bg,
        x: 0,
        y: 0,
        width: sceneWidth,
        height: sceneHeight,
        fit: "cover",
      };
    }
    return { mode: "css", value: bg };
  }
  return {
    mode: "image",
    src: bg.image,
    x: bg.x ?? 0,
    y: bg.y ?? 0,
    width: bg.width ?? sceneWidth,
    height: bg.height ?? sceneHeight,
    fit: "exact",
  };
}
