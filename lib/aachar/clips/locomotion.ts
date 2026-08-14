// AA clips — standing and travelling. Authored against THIS rig's measured
// levers and silhouette (`lib/aachar/rig.ts`), not against any other rig's
// numbers. The facts that shaped every value here:
//
//   * The hair/hat stack rides root, body AND head — 30° of head is ~11px of
//     flying hair. Torso/head rotations live in the 3–10° band; the whole
//     stack's SUM stays under ~20° even at peaks.
//   * The feet are BURIED behind a 17px torso at stance: rotation is
//     invisible until a position offset carries the foot out, so locomotion
//     is POSITION-dominant — strides are x-travel, angles just aim the leg.
//   * Foot coupling (verified empirically): a foot forward of its own hip
//     carries NEGATIVE rot, a trailing foot POSITIVE — the stub must slant
//     like the leg it implies, or the stride reads as broken ankles.
//   * −rot swings a hanging limb's tip FORWARD (the character faces left,
//     +rot is counter-clockwise on screen).
//   * Arm_L draws in FRONT of the torso, Arm_R BEHIND it — the front arm
//     crosses the body art when it swings big, the back arm vanishes unless
//     pushed out. Arm motion here is position pushes with modest rotation.
//
// Beat structures are deliberately NOT SPUM's (different interior frames,
// different pose counts) — the similarity gate in clip.test.ts enforces it.

import type { AaClip, AaPose } from "../clip";
import { holdChannels } from "../clipOps";
import { applyVariant } from "../clipVariants";

// A breath, nothing more. Interior beat at f11 (off-centre on purpose — an
// exact midpoint reads as a metronome). Everything is in the calm band; the
// feet are left alone entirely because at stance they are invisible.
// PROMOTED 2026-07-31: the hand-tuned /admin/aachar override is now the
// master; the manifest override layer was cleared (see aachar-plan session log).
export const idle: AaClip = {
  name: "idle",
  frames: 20,
  loop: true,
  rest: {
        body: { rot: 2 },
        head: { rot: -2 },
      },
  note: "breath cycle; the whole clip lives under 7° so it reads as stillness",
  beats: [
    {
      frame: 0,
      role: "rest",
      pose: {},
    },
    {
      frame: 10,
      role: "settle",
      pose: {
        body: { rot: -0.84, y: -0.42 },
        head: { rot: 0.98, y: -0.28 },
        larm: { rot: -4.55, x: 0.21 },
        rarm: { rot: 2.24, y: -0.56 },
        lfoot: { rot: 0.35 },
        rfoot: { rot: -0.49 },
      },
      note: "exhale — weight settles, head tips against the shoulder drop",
    },
    {
      frame: 20,
      role: "rest",
      pose: {},
    },
  ],
};

// Walk cycle. Contacts at 0/20/40 with EARLY passes at 8/28 — the short
// front half of each step gives the walk a putter that equal quarters
// wouldn't have.
//
// The stride geometry that reads on this rig (learned by LOOKING, the first
// attempt converged both feet at the centre and they crossed into an X): at a
// CONTACT the feet are maximally SPLIT — one planted well forward of the
// body, one trailing well behind — and they gather underneath at the PASS.
// Each foot travels ~10px per half-cycle; only the SWINGING foot lifts, the
// planted one stays down and rolls (its rotation interpolating through the
// transit is exactly the heel-to-toe roll).
// PROMOTED 2026-07-31: the hand-tuned /admin/aachar override is now the
// master; the manifest override layer was cleared (see aachar-plan session log).
export const move: AaClip = {
  name: "move",
  frames: 40,
  loop: true,
  note: "split-contact walk, ~10px stride per foot; planted foot stays down, swinging foot lifts",
  beats: [
    {
      frame: 0,
      role: "contact",
      pose: {
        lfoot: { rot: -26, x: -8.5 },
        rfoot: { rot: 30, x: 8.4 },
        larm: { rot: 22, x: 1.5 },
        rarm: { rot: -26, x: -2.4, y: -0.9 },
        body: { rot: 2 },
        head: { rot: -1.5, y: -0.3 },
      },
      note: "split: left foot planted far forward (−rot), right trailing far behind (+rot)",
    },
    {
      frame: 8,
      role: "pass",
      pose: {
        lfoot: { rot: -2, x: -4.2 },
        rfoot: { rot: 8, x: 4, y: 1.8 },
        larm: { rot: 6 },
        rarm: { rot: -7, y: -0.9 },
        body: { rot: 0.5, y: 1.4 },
        head: { rot: 0.8, y: -0.5 },
      },
      note: "left foot PLANTED under the body mid-roll; right swings past, lifted",
    },
    {
      frame: 20,
      role: "contact",
      pose: {
        lfoot: { rot: 28, x: 1.2 },
        rfoot: { rot: -26, x: -1.4 },
        larm: { rot: -24, x: -2.2 },
        rarm: { rot: 20, x: 1.4, y: -0.9 },
        body: { rot: -1.6 },
        head: { rot: 1.2, y: -0.4 },
      },
      note: "sides traded — left now trails at +5.2, right plants at −5.4",
    },
    {
      frame: 28,
      role: "pass",
      pose: {
        lfoot: { rot: -4, x: -3.7, y: 2 },
        rfoot: { rot: -3, x: 3.5 },
        larm: { rot: -7 },
        rarm: { rot: 6, y: -0.9 },
        body: { rot: -0.4, y: 1.6 },
        head: { rot: -0.7, y: -0.5 },
      },
      note: "right foot planted mid-roll; left swings past, lifted — second rise higher",
    },
    {
      frame: 40,
      role: "contact",
      pose: {
        lfoot: { rot: -26, x: -8.5 },
        rfoot: { rot: 30, x: 8.4 },
        larm: { rot: 22, x: 1.5 },
        rarm: { rot: -26, x: -2.4, y: -0.9 },
        body: { rot: 2 },
        head: { rot: -1.5, y: -0.3 },
      },
    },
  ],
};

// A run: wider strides, airborne passes — and NOT an even cycle. The two
// half-strides are 9 and 11 frames (contacts 0/9/20), a lopsided skippy gait
// that suits a round character and is structurally its own thing rather than
// a symmetric cycle retimed. The constant forward lean lives in `rest` with
// the head counter-rotated to keep looking ahead; +8° is the top of the
// violent band shared across the hair-stack channels — as far as this rig
// tips before it reads as falling. Speed is sold by stride width and beat
// timing, not by more tilt.
// PROMOTED 2026-07-31: the hand-tuned /admin/aachar override is now the
// master; the manifest override layer was cleared (see aachar-plan session log).
export const run: AaClip = {
  name: "run",
  frames: 20,
  loop: true,
  rest: {
        body: { rot: 8, y: 0.3 },
        head: { rot: -7, y: -0.6 },
      },
  note: "lopsided 9/11 gait; strides ±4.5px, airborne passes at 4/13",
  beats: [
    {
      frame: 0,
      role: "contact",
      pose: {
        rfoot: { rot: -38, x: -4.5, y: -0.5 },
        lfoot: { rot: 45, x: 4, y: 2.5 },
        rarm: { rot: 30, x: 2, y: -0.5 },
        larm: { rot: -40, x: -3.5, y: 0.5 },
        body: { rot: 2 },
        head: { rot: -1 },
      },
      note: "right foot planted forward, left kicked up behind; left arm pumps forward",
    },
    {
      frame: 4,
      role: "pass",
      pose: {
        lfoot: { rot: -12, x: -6, y: 2.2 },
        rfoot: { rot: 25, x: 1.5, y: 2.6 },
        larm: { rot: -8 },
        rarm: { rot: 6 },
        body: { rot: -2, y: 2.2 },
        head: { rot: 2, y: 0.3 },
      },
      note: "airborne — the left foot REACHES past where it will plant, then paws back",
    },
    {
      frame: 9,
      role: "contact",
      pose: {
        lfoot: { rot: -42, x: -4.2, y: -0.5 },
        rfoot: { rot: 40, x: 4.8, y: 2.6 },
        larm: { rot: 26, x: 1.8, y: -0.5 },
        rarm: { rot: -42, x: -4, y: 1 },
        body: { rot: 2.6 },
        head: { rot: -1.5 },
      },
      note: "early second contact — the short half of the stride; back arm pushed clear of the torso",
    },
    {
      frame: 13,
      role: "pass",
      pose: {
        lfoot: { rot: 22, x: 1.2, y: 2.4 },
        rfoot: { rot: -10, x: -4.9, y: 2.4 },
        larm: { rot: 7 },
        rarm: { rot: -6 },
        body: { rot: -1.4, y: 2.5 },
        head: { rot: 1.5, y: 0.2 },
      },
      note: "second flight — now the right foot reaches and paws back into f20",
    },
    {
      frame: 20,
      role: "contact",
      pose: {
        rfoot: { rot: -38, x: -4.5, y: -0.5 },
        lfoot: { rot: 45, x: 4, y: 2.5 },
        rarm: { rot: 30, x: 2, y: -0.5 },
        larm: { rot: -40, x: -3.5, y: 0.5 },
        body: { rot: 2 },
        head: { rot: -1 },
      },
    },
  ],
};

// The other sprint (2026-07-30, part of closing the fall-through tail). Where
// `run` is a lopsided skip, `run2` is a POUNDING dash: even 10/10 cadence,
// tight low arm pumps instead of big swings, and — the signature `run`
// doesn't have — a constant forward PRESS carried as root.x displacement in
// the rest, so the whole silhouette rides ahead of its own feet. Contacts sit
// on the even quarters (contact beats are exempt from the key-avoidance
// rule); the passes at 4/14 are both AIRBORNE with the reaching foot past its
// plant — the reach-and-paw read carried over from `run`.
export const run2: AaClip = {
  name: "run2",
  frames: 20,
  loop: true,
  rest: { root: { x: -1 }, body: { rot: 7, y: 0.1 }, head: { rot: -6, y: -0.4 } },
  note: "pounding even-cadence dash; forward press is root.x in rest, arms pump tight and low",
  beats: [
    {
      frame: 0,
      role: "contact",
      pose: {
        lfoot: { rot: -34, x: -7, y: -0.3 },
        rfoot: { rot: 42, x: 6, y: 2.2 },
        larm: { rot: 34, x: 2, y: -0.5 },
        rarm: { rot: -34, x: -3.8, y: 0.5 },
        body: { rot: 1.5 },
        head: { rot: -1 },
      },
      note: "left foot pounds down forward, right driving off behind; arms pump contralateral",
    },
    {
      frame: 4,
      role: "pass",
      pose: {
        lfoot: { rot: 10, x: 1.8, y: 2.6 },
        rfoot: { rot: -6, x: -4.8, y: 2.4 },
        larm: { rot: 8 },
        rarm: { rot: -8 },
        body: { rot: -1.5, y: 2.6 },
        head: { rot: 1.8, y: 0.2 },
      },
      note: "flight — right foot reaches past its coming plant, both airborne",
    },
    {
      frame: 10,
      role: "contact",
      pose: {
        rfoot: { rot: -30, x: -6.6, y: -0.3 },
        lfoot: { rot: 46, x: 5.6, y: 2.4 },
        rarm: { rot: 30, x: 2.4, y: -0.5 },
        larm: { rot: -38, x: -3.4, y: 0.6 },
        body: { rot: 2.2 },
        head: { rot: -1.4 },
      },
      note: "sides traded — deliberately NOT the mirror of f0 (real gaits aren't)",
    },
    {
      frame: 14,
      role: "pass",
      pose: {
        rfoot: { rot: 12, x: 2, y: 2.8 },
        lfoot: { rot: -9, x: -5.2, y: 2.5 },
        rarm: { rot: 7 },
        larm: { rot: -7 },
        body: { rot: -1.8, y: 2.4 },
        head: { rot: 1.5, y: 0.25 },
      },
      note: "second flight, a shade higher — now the left reaches",
    },
    {
      frame: 20,
      role: "contact",
      pose: {
        lfoot: { rot: -34, x: -7, y: -0.3 },
        rfoot: { rot: 42, x: 6, y: 2.2 },
        larm: { rot: 34, x: 2, y: -0.5 },
        rarm: { rot: -34, x: -3.8, y: 0.5 },
        body: { rot: 1.5 },
        head: { rot: -1 },
      },
    },
  ],
};

// A standing jump on the spot. `root.y` is the proven lift lever (greeting2's
// hop, skill_magic's levitation); here it carries a full crouch–launch–apex–
// absorb arc while the feet do the airborne storytelling: trailing on the way
// up, an ASYMMETRIC tuck at the apex (one knee up, one heel back — a straight
// symmetric pencil-jump reads as an elevator), stagger on the landing.
// Interior beats sit off SPUM's f10/15/20 keys; the landing is a contact.
export const jump: AaClip = {
  name: "jump",
  frames: 30,
  loop: true,
  note: "crouch (7), rise (12), asymmetric-tuck apex (17), landing absorb (23), settle (26)",
  beats: [
    { frame: 0, role: "rest", pose: {} },
    {
      frame: 7,
      role: "anticipate",
      pose: {
        root: { y: -2.2 },
        body: { rot: 9 },
        head: { rot: 2, y: -0.3 },
        larm: { rot: 24, x: 1.4 },
        rarm: { rot: 20, x: 1 },
      },
      note: "the crouch — down before up, arms swung back for the throw",
    },
    {
      frame: 12,
      role: "strike",
      pose: {
        root: { y: 3.2 },
        body: { rot: -4 },
        head: { rot: -3 },
        larm: { rot: -68, x: -1.5, y: 1.4 },
        rarm: { rot: -58, x: -2, y: 1.2 },
        lfoot: { rot: 26, x: 1, y: 1.2 },
        rfoot: { rot: 22, x: 0.8, y: 1 },
      },
      note: "launch — arms flung up-forward, feet still trailing the lift",
    },
    {
      frame: 17,
      role: "extreme",
      pose: {
        root: { y: 5.2 },
        body: { rot: -6 },
        head: { rot: -5, y: -0.4 },
        larm: { rot: -112, x: -1, y: 2.4 },
        rarm: { rot: -96, x: -1.8, y: 2 },
        lfoot: { rot: 36, x: 1.6, y: 2.4 },
        rfoot: { rot: -18, x: -1.4, y: 1.8 },
      },
      note: "apex — arms overhead, ASYMMETRIC tuck: left heel kicked back, right knee driven forward",
    },
    {
      frame: 23,
      role: "contact",
      pose: {
        root: { y: -1.9 },
        body: { rot: 10 },
        head: { rot: 3, y: -0.4 },
        larm: { rot: -20, x: -1.2 },
        rarm: { rot: -16, x: -0.8 },
        lfoot: { rot: 20, x: 1.6 },
        rfoot: { rot: -15, x: -2.2 },
      },
      note: "the landing — absorbed into a crouch over a fresh stagger, arms dropped forward for balance",
    },
    {
      frame: 26,
      role: "settle",
      pose: {
        root: { y: -0.4 },
        body: { rot: 3 },
        head: { rot: 1, y: -0.2 },
        larm: { rot: -6 },
        rarm: { rot: -5 },
      },
      note: "rising out of the absorb",
    },
    { frame: 30, role: "rest", pose: {} },
  ],
};

// The wilder leap — `jump`'s springy variant, derived rather than baked (the
// same rule as yay/uppercut: retune the parent and this follows). Bigger in
// everything (1.25×), the L/R apex tuck exaggerated to a full flail (1.6×),
// and a touch of forward body over the top. Beat frames are the parent's,
// which already sit off SPUM jump2's f10/15/19/20 keys.
export const jump2: AaClip = {
  ...applyVariant(jump, { amplitude: 1.25, asymmetry: 1.6, posture: { body: { rot: 3 } } }, "jump2"),
  note: "jump flung bigger — 1.25× swing, flailed asymmetric tuck, forward press over the apex",
};

// Both hands cradle across the belly. The left arm draws in FRONT of the
// torso, so pulling it to the centre line reads as holding something against
// the chest; −rot swings both hands forward.
export const CARRY_ARMS: AaPose = {
  larm: { rot: -45, x: -2, y: -1.5 },
  rarm: { rot: -50, x: -2.5, y: -1.5 },
};

// Derived, not copied — a change to `move` reaches every carry on the next
// build (the desync SPUM's catalog warns about cannot happen).
export const move_carry_loop: AaClip = holdChannels(
  move,
  ["larm", "rarm"],
  CARRY_ARMS,
  "move_carry_loop",
);

// AA-ORIGINAL carry variants — start as exact duplicates of `move_carry_loop`,
// each with its own arms constant so adjusting one cannot reach the others.

// Two hands raised overhead.
export const CARRY_2HANDUP_ARMS: AaPose = {
  larm: { rot: -45, x: -2, y: -1.5 },
  rarm: { rot: -50, x: -2.5, y: -1.5 },
};

export const move_2handcarryup_loop: AaClip = holdChannels(
  move,
  ["larm", "rarm"],
  CARRY_2HANDUP_ARMS,
  "move_2handcarryup_loop",
);

// One hand raised overhead.
export const CARRY_1HANDUP_ARMS: AaPose = {
  larm: { rot: -45, x: -2, y: -1.5 },
  rarm: { rot: -99, x: -2.5, y: -1.5 },
};

export const move_1handcarryup_loop: AaClip = holdChannels(
  move,
  ["larm", "rarm"],
  CARRY_1HANDUP_ARMS,
  "move_1handcarryup_loop",
);

// Two hands at chest height.
export const CARRY_2HAND_ARMS: AaPose = {
  larm: { rot: -45, x: -2, y: -1.5 },
  rarm: { rot: -50, x: -2.5, y: -1.5 },
};

export const move_2handcarry_loop: AaClip = holdChannels(
  move,
  ["larm", "rarm"],
  CARRY_2HAND_ARMS,
  "move_2handcarry_loop",
);

// The zombie shuffle: `move`'s legs and bob with the arms DEAD — held at pure
// stance (an empty held pose = zero delta), so they hang motionless while the
// body walks. Tune the shamble by putting offsets in this constant; the legs
// keep tracking `move` either way.
export const ZOMBIE_ARMS: AaPose = {};

export const zombie_walk: AaClip = holdChannels(
  move,
  ["larm", "rarm"],
  ZOMBIE_ARMS,
  "zombie_walk",
);

// Both hands on a long shaft, forward-low. Shared by the spear walk and the
// spear idle so a character that stops walking keeps holding the weapon in
// the same place. The back arm (rarm) gets the bigger −x push because it is
// drawn behind the torso and must clear the silhouette to read at all.
export const SPEAR_GRIP: AaPose = {
  larm: { rot: -38, x: -2.2, y: -0.8 },
  rarm: { rot: -52, x: -3.2, y: -0.3 },
};

// The march posture: a modest forward press with the head counter-rotated to
// keep the eyes level — same shape as `run`'s rest, milder. Deliberately NOT
// a root rotation (the reference leans its root; on this rig that tips the
// feet and the hair with it).
const SPEAR_REST: AaPose = {
  body: { rot: 5, y: 0.2 },
  head: { rot: -4, y: -0.3 },
};

// The spear walk is the walk — same legs, same bob — with the arms locked to
// the grip and the march posture on top. Derived, so retuning `move` retunes
// this on the next build.
export const long_spear_walk: AaClip = {
  ...holdChannels(move, ["larm", "rarm"], SPEAR_GRIP, "long_spear_walk"),
  rest: SPEAR_REST,
  note: "move's legs under a locked two-hand spear grip; march press lives in rest",
};

// The guard stance: the grip plus a light stagger. Shared by the spear idle
// AND `long_spear_attack` (action.ts), so a spearman who thrusts starts and
// ends exactly where one standing guard does.
export const SPEAR_GUARD_REST: AaPose = {
  ...SPEAR_GRIP,
  body: { rot: 2, y: 0.2 },
  head: { rot: -1, y: -0.2 },
  lfoot: { rot: 5, x: 0.6 },
  rfoot: { rot: -6, x: -0.8 },
};

// Standing guard with the spear: the same grip, a light stagger, and a
// breath. Everything lives in the calm band — the point of the pose is that
// nothing moves but the breathing.
// PROMOTED 2026-07-31: the hand-tuned /admin/aachar override is now the
// master; the manifest override layer was cleared (see aachar-plan session log).
export const long_spear_idle: AaClip = {
  name: "long_spear_idle",
  frames: 26,
  loop: true,
  rest: {
        larm: { rot: -38, x: -2.2, y: -0.8 },
        rarm: { rot: -52, x: -3.2, y: -0.3 },
        body: { rot: 2, y: 0.2 },
        head: { rot: -1, y: -0.2 },
        lfoot: { rot: 5, x: 0.6 },
        rfoot: { rot: -6, x: -0.8 },
      },
  note: "guard stance over SPEAR_GRIP; one breath beat, calm band only",
  beats: [
    {
      frame: 0,
      role: "rest",
      pose: {
        larm: { rot: 28 },
      },
    },
    {
      frame: 14,
      role: "settle",
      pose: {
        body: { rot: 1.2, y: -0.4 },
        head: { rot: 1.5, y: -0.3 },
        larm: { rot: 28, y: -0.3 },
        rarm: { rot: 3, y: -0.4 },
      },
      note: "inhale — the grip rides the shoulders a hair",
    },
    {
      frame: 26,
      role: "rest",
      pose: {
        larm: { rot: 28 },
      },
    },
  ],
};
