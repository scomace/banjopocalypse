// AA clips — impact and effort. The engine has no easing, so "sudden" can
// only be a short beat; but the FIRST library also learned the hard way that
// on this rig "big" cannot be rotation: the hair/hat stack turns 30°+ of
// root/body/head into ~25px of flying headgear, and the character reads as
// falling over rather than lunging.
//
// So impact here is carried by DISPLACEMENT and beat length instead:
//   * the lunge is `root.x` (the whole character shifts forward, feet
//     included, since the feet are children of Root);
//   * torso tips peak at ±14° — the top of this rig's violent band;
//   * the feet set a visible STAGGER (position, out from under the blob)
//     so the action has a base to happen over;
//   * the head keeps its eyes on the target through the strike instead of
//     whipping — the hair whips on `damaged`, where flying headgear IS the
//     point.

import type { AaClip } from "../clip";
import { applyVariant } from "../clipVariants";

import { SPEAR_GUARD_REST } from "./locomotion";

// A swing: coil at f8, snap through in FOUR frames (SPUM's strike beats are
// five), long unwind. Root never rotates — the lunge is a 4.5px forward
// shift and back. The rig study's coupling holds even mid-attack: the
// trailing left foot pushes off (+rot), the planted right foot braces (−rot).
// PROMOTED 2026-07-31: the hand-tuned /admin/aachar override is now the
// master; the manifest override layer was cleared (see aachar-plan session log).
export const attack_melee: AaClip = {
  name: "attack_melee",
  frames: 25,
  loop: true,
  note: "8:4:13 — coil, 4-frame snap, long unwind; lunge is root.x displacement, not rotation",
  beats: [
    {
      frame: 0,
      role: "rest",
      pose: {},
    },
    {
      frame: 8,
      role: "anticipate",
      pose: {
        root: { x: 1.5 },
        body: { rot: -9 },
        head: { rot: 2, y: -0.2 },
        rarm: { rot: 55, x: 3, y: -1 },
        larm: { rot: -20, x: -2 },
        lfoot: { rot: 25, x: 2 },
        rfoot: { rot: -18, x: -3 },
      },
      note: "coiled back, hand wound behind, stagger set — eyes stay on the target",
    },
    {
      frame: 12,
      role: "strike",
      pose: {
        root: { x: -3 },
        body: { rot: 14 },
        head: { rot: 6, y: -0.4 },
        rarm: { rot: -65, x: -3.6, y: -0.6 },
        larm: { rot: 18, x: 1.5, y: -0.5 },
        lfoot: { rot: 38, x: 2 },
        rfoot: { rot: -24, x: -3 },
      },
      note: "snap — 4.5px lunge, hand whips through; feet HOLD their stagger",
    },
    {
      frame: 25,
      role: "rest",
      pose: {},
    },
  ],
};

// Taking a hit from the front. This is the one clip where the hair-stack
// lever is used ON PURPOSE: −18° of head whips the hair forward over the
// face, which reads as impact better than any torso angle could. Recoil at
// f8, overshoot PAST rest at f13 (both body and head change sign), settle.
export const damaged: AaClip = {
  name: "damaged",
  frames: 20,
  loop: true,
  // SPUM's original plays this eyes-closed for its whole length (a static
  // visibility flip, not a track) — the wince. Same statement, Phase 11 form.
  eyeState: "closed",
  note: "8:5:7 — recoil (hair whips), overshoot past rest, settle; knockback is root.x",
  beats: [
    { frame: 0, role: "rest", pose: {} },
    {
      frame: 8,
      role: "strike",
      pose: {
        root: { x: 2 },
        body: { rot: -12, y: 0.3 },
        head: { rot: -18, x: 0.5, y: -0.5 },
        larm: { rot: -35, x: -2, y: 1 },
        rarm: { rot: -40, x: -2.5, y: 1.5 },
        lfoot: { rot: 15, x: 1 },
        rfoot: { rot: 10, x: 1.5 },
      },
      note: "knocked back — loose arms lag FORWARD toward the hitter, feet skid",
    },
    {
      frame: 13,
      role: "overshoot",
      pose: {
        root: { x: 0.5 },
        body: { rot: 5 },
        head: { rot: 8, y: -0.3 },
        larm: { rot: 12, x: 0.5 },
        rarm: { rot: 10 },
        lfoot: { rot: 4 },
        rfoot: { rot: -3 },
      },
      note: "rebound past rest — skip this and it reads as a lean, not a hit",
    },
    { frame: 20, role: "rest", pose: {} },
  ],
};

// A stab — a straight forward drive over a braced stagger. This WAS the
// first cut of `throw`: playtest read it as a poke, not a toss, which is a
// good stab and a bad throw. Renamed rather than discarded (the user's call).
// An AA-original clip name: no SPUM counterpart exists, so nothing falls
// through to and nothing is locked against it.
export const stab: AaClip = {
  name: "stab",
  frames: 21,
  loop: false,
  note: "forward drive, held stagger; the strike lands at f17 — born as throw v1, reads as a stab",
  beats: [
    {
      frame: 0,
      role: "anticipate",
      pose: {
        root: { x: 1 },
        body: { rot: -8 },
        head: { rot: 2 },
        rarm: { rot: 50, x: 2.5, y: -1 },
        larm: { rot: -18, x: -1.5 },
        lfoot: { rot: 20, x: 1.5 },
        rfoot: { rot: -15, x: -2.5 },
      },
      note: "wound — hand back-low, base set wide, eyes forward",
    },
    {
      frame: 9,
      role: "anticipate",
      pose: {
        root: { x: 1.5 },
        body: { rot: -10 },
        head: { rot: 3 },
        rarm: { rot: 58, x: 3, y: -0.5 },
        larm: { rot: -20, x: -1.5 },
        lfoot: { rot: 20, x: 1.5 },
        rfoot: { rot: -15, x: -2.5 },
      },
      note: "one more inch of load before the drive",
    },
    {
      frame: 17,
      role: "contact",
      pose: {
        root: { x: -2.5 },
        body: { rot: 12 },
        head: { rot: 5, y: -0.3 },
        rarm: { rot: -62, x: -6, y: 1.5 },
        larm: { rot: 15, x: 1, y: -0.5 },
        lfoot: { rot: 30, x: 1.5 },
        rfoot: { rot: -22, x: -2.5 },
      },
      note: "the point lands here",
    },
    {
      frame: 21,
      role: "settle",
      pose: {
        root: { x: -2 },
        body: { rot: 7 },
        head: { rot: 4, y: -0.2 },
        rarm: { rot: -50, x: -5, y: 0.5 },
        larm: { rot: 8, x: 0.5 },
        lfoot: { rot: 30, x: 1.5 },
        rfoot: { rot: -22, x: -2.5 },
      },
      note: "held extended",
    },
  ],
};

// An UPPERCUT — throw v2 renamed by playtest. Authored as an "underhand
// sling" throw, but what the motion actually IS: body drives bottom-to-top
// while the arm sweeps bottom-to-top through the hanging position — a rising
// punch, not a toss. Kept verbatim under the name it earns. AA-original.
export const uppercut: AaClip = {
  name: "uppercut",
  frames: 21,
  loop: false,
  note: "rising drive; body and arm both travel bottom-to-top, impact at f17 — born as throw v2",
  beats: [
    {
      frame: 0,
      role: "rest",
      pose: {
        body: { rot: 2 },
        head: { rot: 1 },
        rarm: { rot: 18, x: 1, y: -0.5 },
        lfoot: { rot: 12, x: 1 },
        rfoot: { rot: -10, x: -1.5 },
      },
      note: "addressing the target",
    },
    {
      frame: 8,
      role: "anticipate",
      pose: {
        root: { x: 2 },
        body: { rot: 6, y: -0.6 },
        head: { rot: -1, y: -0.3 },
        rarm: { rot: 74, x: 4, y: -3 },
        larm: { rot: -24, x: -2 },
        lfoot: { rot: 24, x: 2 },
        rfoot: { rot: -12, x: -1.5 },
      },
      note: "crouched, fist dropped low-behind — the bottom of the rise",
    },
    {
      frame: 17,
      role: "contact",
      pose: {
        root: { x: -2.5, y: 0.5 },
        body: { rot: -13, y: 1 },
        head: { rot: 6, y: -0.4 },
        rarm: { rot: -142, x: -6.5, y: 3 },
        larm: { rot: 22, x: 1.5, y: -1 },
        lfoot: { rot: 38, x: 2.5, y: 1 },
        rfoot: { rot: -24, x: -3 },
      },
      note: "IMPACT — fist high-forward at the top of the rise, body thrown back, heel off",
    },
    {
      frame: 21,
      role: "settle",
      pose: {
        root: { x: -1.5 },
        body: { rot: -6, y: 0.4 },
        head: { rot: 4, y: -0.2 },
        rarm: { rot: -118, x: -5.5, y: 1.5 },
        larm: { rot: 12, x: 0.8 },
        lfoot: { rot: 18, x: 0.5 },
        rfoot: { rot: -14, x: -2 },
      },
      note: "spent — arm floats down, weight settles",
    },
  ],
};

// A cheer — the SYMMETRIC VARIANT of the uppercut, spotted in the variant
// grid by playtest: mirror the limb pairs and the rising punch becomes both
// arms thrown up together. Derived through `applyVariant` rather than baked,
// so it stays a function of `uppercut` (same rule as give/receive). The
// impact beat is re-roled: nothing is being hit, the arms-up moment is the
// clip's extreme. AA-original.
export const yay: AaClip = {
  ...applyVariant(uppercut, { asymmetry: 0 }, "yay"),
  note: "both arms up together — the uppercut's symmetric twin; a cheer, not a hit",
  beats: applyVariant(uppercut, { asymmetry: 0 }, "yay").beats.map((b) =>
    b.role === "contact" ? { ...b, role: "extreme" as const, note: "arms up — the yay" } : b,
  ),
};

// A throw, take three — OVERHAND this time, which is what the SPUM reference
// actually is (playtest, correctly: "can you seriously not tell the
// difference?"). Theirs windmills the arm SOCKET −178° over the top; this
// format doesn't animate sockets, but the arm channel can trace the same arc
// the long way round: rot +25 → +150 → +240 → +268 keeps increasing, so the
// hand travels back → up-over-the-BACK → over the top → forward-down. The
// body arches BACK under the raised arm and snaps FORWARD at release —
// opposite choreography to the uppercut, whose body rises backward.
// PROMOTED 2026-07-31: the hand-tuned /admin/aachar override is now the
// master; the manifest override layer was cleared (see aachar-plan session log).
export const throwClip: AaClip = {
  name: "throw",
  frames: 21,
  loop: false,
  note: "overhand; hand goes over the top (rot through +180), body arches back then snaps forward; release locked at f17",
  beats: [
    {
      frame: 0,
      role: "rest",
      pose: {
        body: { rot: 2 },
        head: { rot: 1 },
        rarm: { rot: 25, x: 1.5, y: -0.5 },
        lfoot: { rot: 12, x: 1 },
        rfoot: { rot: -10, x: -1.5 },
      },
      note: "addressing the target",
    },
    {
      frame: 8,
      role: "anticipate",
      pose: {
        root: { x: 2 },
        body: { rot: -9, y: 0.3 },
        head: { rot: 3, y: -0.2 },
        rarm: { rot: 150, x: 2.5, y: 2 },
        larm: { rot: -20, x: -2 },
        lfoot: { rot: 22, x: 1.5 },
        rfoot: { rot: -12, x: -1.5 },
      },
      note: "arched back, hand raised up-BEHIND the head — the overhand load",
    },
    {
      frame: 17,
      role: "contact",
      pose: {
        root: { x: -3, y: 0.3 },
        body: { rot: 13, y: 0.5 },
        head: { rot: 4, y: -0.4 },
        rarm: { rot: 240, x: -3.1, y: 0.1 },
        larm: { rot: 18, x: 1 },
        lfoot: { rot: 38, x: 2, y: 1 },
        rfoot: { rot: -24, x: -3 },
      },
      note: "RELEASE — hand came OVER the top, now forward-high; body snapped forward, back heel off",
    },
    {
      frame: 21,
      role: "settle",
      pose: {
        root: { x: -2.5 },
        body: { rot: 8, y: 0.2 },
        head: { rot: 3, y: -0.2 },
        rarm: { rot: 268, x: -3.3 },
        larm: { rot: 10, x: 0.5 },
        lfoot: { rot: 20, x: 0.5 },
        rfoot: { rot: -16, x: -2 },
      },
      note: "follow-through — arm spent forward-horizontal, weight through",
    },
  ],
};

/** Frame the thrown prop leaves the hand. */
export const THROW_RELEASE_FRAME = 17;

// ── The weapon tail (2026-07-30, closing the SPUM fall-through) ─────────────
//
// Four more strikes, each a DIFFERENT action rather than attack_melee resized:
// a quick slash, a heavy overhead chop, a leaping two-fist slam, a spear
// thrust. All keep the file's rules — impact as root.x displacement over a
// held stagger, torso peaks ≤ ~15°, the head watches the target — and their
// interior beats sit off the corresponding SPUM clip's pose keys.

// The light, fast cut. Against attack_melee's wound-up swing this is a wrist
// action: a short high-back cock (+y — the hand rises to ear height, where
// attack_melee's winds low-behind) and a diagonal sweep DOWN and across
// (finishing −y, below the shoulder). Strike beat 5 frames in from the coil,
// a lazy 7-frame drift out, and the smallest lunge of the family.
export const short_sword_attack: AaClip = {
  name: "short_sword_attack",
  frames: 25,
  loop: true,
  note: "6:5:14 — flick coil, diagonal slash down-across, lazy drift home; the light cut of the family",
  beats: [
    { frame: 0, role: "rest", pose: {} },
    {
      frame: 6,
      role: "anticipate",
      pose: {
        root: { x: 1 },
        body: { rot: -7 },
        head: { rot: 2, y: -0.2 },
        rarm: { rot: 48, x: 2.6, y: 0.5 },
        larm: { rot: -14, x: -1.2 },
        lfoot: { rot: 16, x: 1.2 },
        rfoot: { rot: -12, x: -1.8 },
      },
      note: "the flick-coil — blade cocked high behind the ear (+y), not wound low like the melee swing",
    },
    {
      frame: 11,
      role: "strike",
      pose: {
        root: { x: -2.6 },
        body: { rot: 11 },
        head: { rot: 4, y: -0.3 },
        rarm: { rot: -78, x: -5.5, y: -0.5 },
        larm: { rot: 14, x: 1 },
        lfoot: { rot: 26, x: 1.4 },
        rfoot: { rot: -18, x: -2 },
      },
      note: "the slash — down and across, hand finishing BELOW the shoulder; small quick lunge",
    },
    {
      frame: 18,
      role: "overshoot",
      pose: {
        root: { x: -1.6 },
        body: { rot: 5 },
        head: { rot: 2, y: -0.2 },
        rarm: { rot: -52, x: -3.6 },
        larm: { rot: 6 },
        lfoot: { rot: 14, x: 0.8 },
        rfoot: { rot: -10, x: -1.2 },
      },
      note: "the blade floats on through before coming home",
    },
    { frame: 25, role: "rest", pose: {} },
  ],
};

// The heavy chop. 43 frames buys what the quick cuts can't afford: a
// two-stage lift (raise, then a held full-overhead load), ONE chop driven
// over the top — the arm channel traces the overhand arc the same way
// `throw` does, rot climbing through +150 and finishing down-forward at
// +250 — a beat where the blade stays BURIED, and a slow wrench back up over
// the shoulder. The biggest lunge of the family (−3.5) under a torso still
// capped at +15.
export const axe_attack: AaClip = {
  name: "axe_attack",
  frames: 43,
  loop: true,
  note: "one heavy overhand chop — raise (9), overhead load (16), chop (22), buried (27), wrench back up (33), home (43)",
  beats: [
    { frame: 0, role: "rest", pose: {} },
    {
      frame: 9,
      role: "anticipate",
      pose: {
        root: { x: 1 },
        body: { rot: -6 },
        head: { rot: 2, y: -0.2 },
        rarm: { rot: 120, x: 2, y: 1.5 },
        larm: { rot: -15, x: -1.2 },
        lfoot: { rot: 18, x: 1.5 },
        rfoot: { rot: -14, x: -2.2 },
      },
      note: "hauling the head up over the shoulder, base set wide",
    },
    {
      frame: 16,
      role: "anticipate",
      pose: {
        root: { x: 1.6, y: -0.3 },
        body: { rot: -11 },
        head: { rot: 3, y: -0.25 },
        rarm: { rot: 158, x: 2.5, y: 2.5 },
        larm: { rot: -22, x: -1.8 },
        lfoot: { rot: 18, x: 1.5 },
        rfoot: { rot: -14, x: -2.2 },
      },
      note: "full overhead load — arched back under the weight, a beat of held threat",
    },
    {
      frame: 22,
      role: "contact",
      pose: {
        root: { x: -3.5, y: -0.6 },
        body: { rot: 15 },
        head: { rot: 5, y: -0.4 },
        rarm: { rot: 252, x: -6, y: -1 },
        larm: { rot: 16, x: 1.2 },
        lfoot: { rot: 34, x: 2 },
        rfoot: { rot: -22, x: -2.8 },
      },
      note: "the CHOP — over the top and buried low-forward, the family's biggest lunge, root sunk with it",
    },
    {
      frame: 27,
      role: "hold",
      pose: {
        root: { x: -3.2, y: -0.4 },
        body: { rot: 12 },
        head: { rot: 4, y: -0.3 },
        rarm: { rot: 248, x: -5.6, y: -1 },
        larm: { rot: 12, x: 0.8 },
        lfoot: { rot: 34, x: 2 },
        rfoot: { rot: -22, x: -2.8 },
      },
      note: "the blade stays buried — heavy weapons don't bounce",
    },
    {
      frame: 33,
      role: "settle",
      pose: {
        root: { x: -1 },
        body: { rot: 2 },
        head: { rot: 1, y: -0.15 },
        rarm: { rot: 150, x: 0.5, y: 1.5 },
        larm: { rot: -8 },
        lfoot: { rot: 12, x: 0.8 },
        rfoot: { rot: -10, x: -1.2 },
      },
      note: "wrenched free and hauled back up over the shoulder — the recovery is work",
    },
    { frame: 43, role: "rest", pose: {} },
  ],
};

// The power move: a leaping two-fist slam. Structurally a jump grafted onto a
// strike — deep crouch, root.y flight with both arms overhead, and the
// landing IS the hit (the skill_magic land-and-release trick, violent):
// touch down into the lunge with both fists driven low-forward together.
export const skill_melee: AaClip = {
  name: "skill_melee",
  frames: 30,
  loop: true,
  note: "leaping slam — crouch (8), airborne both-fists-up (13), land-and-slam in one beat (18), recoil (23)",
  beats: [
    { frame: 0, role: "rest", pose: {} },
    {
      frame: 8,
      role: "anticipate",
      pose: {
        root: { x: 1, y: -2.4 },
        body: { rot: 8 },
        head: { rot: 2, y: -0.3 },
        larm: { rot: 30, x: 1.8 },
        rarm: { rot: 26, x: 1.4 },
        lfoot: { rot: 10, x: 0.8 },
        rfoot: { rot: -8, x: -0.8 },
      },
      note: "the gather — deep crouch, both fists drawn back",
    },
    {
      frame: 13,
      role: "extreme",
      pose: {
        root: { x: -0.5, y: 3.8 },
        body: { rot: -7 },
        head: { rot: -5, y: -0.4 },
        larm: { rot: -105, x: -1.2, y: 2.2 },
        rarm: { rot: -92, x: -1.8, y: 1.9 },
        lfoot: { rot: 28, x: 1.2, y: 1.6 },
        rfoot: { rot: 24, x: 1, y: 1.4 },
      },
      note: "airborne — both fists overhead, feet trailing the leap",
    },
    {
      frame: 18,
      role: "contact",
      pose: {
        root: { x: -2.5, y: -1.6 },
        body: { rot: 14, y: -0.3 },
        head: { rot: 5, y: -0.4 },
        larm: { rot: -38, x: -4.5, y: -1 },
        rarm: { rot: -34, x: -4, y: -1 },
        lfoot: { rot: 30, x: 1.8 },
        rfoot: { rot: -22, x: -2.6 },
      },
      note: "LAND + SLAM in one beat — both fists driven low-forward, root sunk into the stagger",
    },
    {
      frame: 23,
      role: "overshoot",
      pose: {
        root: { x: -1.2, y: -0.3 },
        body: { rot: -4 },
        head: { rot: -1, y: -0.2 },
        larm: { rot: -12, x: -1 },
        rarm: { rot: -10, x: -0.8 },
        lfoot: { rot: 12, x: 0.8 },
        rfoot: { rot: -10, x: -1.2 },
      },
      note: "the shockwave pushes him back off it",
    },
    { frame: 30, role: "rest", pose: {} },
  ],
};

// The spear thrust. Rides SPEAR_GUARD_REST — the exact stance
// `long_spear_idle` holds — so guard → thrust → guard chains without the
// hands re-finding the shaft. A thrust is a TRANSLATION: both hands drive
// the shaft forward as −x with barely any rotation (the arm arcs belong to
// the swung weapons), over a double-load like `stab`'s and the family lunge.
export const long_spear_attack: AaClip = {
  name: "long_spear_attack",
  frames: 30,
  loop: true,
  rest: SPEAR_GUARD_REST,
  note: "thrust from the guard — draw (9), one more inch (14), drive (19), held long (24), home (30); the shaft translates, it doesn't swing",
  beats: [
    { frame: 0, role: "rest", pose: {} },
    {
      frame: 9,
      role: "anticipate",
      pose: {
        root: { x: 1.8 },
        body: { rot: -7 },
        head: { rot: 2, y: -0.2 },
        larm: { rot: 10, x: 1.8, y: 0.3 },
        rarm: { rot: 8, x: 1.5 },
        lfoot: { rot: 10, x: 0.8 },
        rfoot: { rot: -8, x: -1 },
      },
      note: "the draw — both hands pull the shaft back along its own line",
    },
    {
      frame: 14,
      role: "anticipate",
      pose: {
        root: { x: 2.2 },
        body: { rot: -9 },
        head: { rot: 3, y: -0.25 },
        larm: { rot: 12, x: 2.2, y: 0.3 },
        rarm: { rot: 10, x: 1.8 },
        lfoot: { rot: 10, x: 0.8 },
        rfoot: { rot: -8, x: -1 },
      },
      note: "one more inch of load — same trick as stab's double coil",
    },
    {
      frame: 19,
      role: "contact",
      pose: {
        root: { x: -3.2 },
        body: { rot: 12 },
        head: { rot: 4, y: -0.35 },
        larm: { rot: -14, x: -4.5, y: -0.3 },
        rarm: { rot: -12, x: -5 },
        lfoot: { rot: 26, x: 1.6 },
        rfoot: { rot: -20, x: -2.4 },
      },
      note: "the DRIVE — hands shoot forward together, the back hand furthest; point lands here",
    },
    {
      frame: 24,
      role: "hold",
      pose: {
        root: { x: -2.8 },
        body: { rot: 9 },
        head: { rot: 3, y: -0.25 },
        larm: { rot: -12, x: -3.8 },
        rarm: { rot: -10, x: -4.2 },
        lfoot: { rot: 26, x: 1.6 },
        rfoot: { rot: -20, x: -2.4 },
      },
      note: "held at full extension — a spear pins before it returns",
    },
    { frame: 30, role: "rest", pose: {} },
  ],
};

// Stunned — seeing stars. A slow drunken wobble around a slumped rest: the
// sway visits three DIFFERENT corners at three different depths (back-left
// shallow, forward deep, back-right shallower still) so it reads as reeling,
// not as a metronome. All head beats keep the seam tuck; the whole thing
// lives at the calm/active boundary because a stun is motion without
// intention. Eyes at half — the dazed lid.
export const debuff_stun: AaClip = {
  name: "debuff_stun",
  frames: 30,
  loop: true,
  eyeState: "half",
  rest: {
    body: { rot: 3 },
    head: { rot: 1, y: -0.2 },
    larm: { rot: -8, x: -0.5, y: 0.3 },
    rarm: { rot: -6, y: 0.3 },
    lfoot: { rot: 6, x: 0.5 },
    rfoot: { rot: -5, x: -0.5 },
  },
  note: "drunken three-corner wobble over a slump; half-lidded eyes sell the daze",
  beats: [
    { frame: 0, role: "rest", pose: {} },
    {
      frame: 7,
      role: "extreme",
      pose: {
        root: { x: 0.8 },
        body: { rot: -5, y: -0.2 },
        head: { rot: -4, y: -0.4 },
        larm: { rot: 6, x: 0.4 },
        rarm: { rot: 5 },
      },
      note: "reels back — arms trail the sway",
    },
    {
      frame: 15,
      role: "extreme",
      pose: {
        root: { x: -0.6, y: -0.3 },
        body: { rot: 6, y: -0.2 },
        head: { rot: 5, y: -0.45 },
        larm: { rot: -14, x: -0.8 },
        rarm: { rot: -12, x: -0.5 },
      },
      note: "pitches forward, the deep corner — knees dip with it",
    },
    {
      frame: 23,
      role: "extreme",
      pose: {
        root: { x: 0.5 },
        body: { rot: -3.5 },
        head: { rot: -3, y: -0.4 },
        larm: { rot: 4 },
        rarm: { rot: 6, x: 0.4 },
      },
      note: "back the other way, shallower — the wobble decaying into the loop",
    },
    { frame: 30, role: "rest", pose: {} },
  ],
};
