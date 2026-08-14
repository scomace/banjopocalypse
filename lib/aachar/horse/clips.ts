// AA horse clips — the clean-room rebuild of SPUM's 12 horse animations.
//
// Authored from quadruped motion principles, NOT from SPUM's keyframes — the
// originality gate in horse.test.ts enforces it (interior beats off SPUM's
// pose keys; no channel a scaled copy of SPUM's joint curve). The facts that
// shaped the values:
//
//   * The legs are 6–8px stubs mostly hidden behind a 17px-deep body:
//     rotation reads only when big (±25°+), and the fetlock (`…Low`) doubles
//     the apparent swing because it compounds the upper leg's rotation.
//   * NEGATIVE rot lifts the nose / swings a hanging leg FORWARD; +y is up,
//     −x is toward the nose (the horse faces left).
//   * A real walk is a 4-beat gait (each foot lands alone), a gallop is a
//     rotary 3-beat with a suspension phase — SPUM shipped `run` as a byte
//     copy of `move`; here they are genuinely different gaits (H7).
//   * The FRONT pair rides `Pivot_Body` (it inherits the torso bob); the
//     hind pair rides `Pivot_Root`. Within a pair the far leg staggers
//     slightly forward of the near leg — free depth realism, and slight
//     near/far phase asymmetry rides on top of it.
//
// First-pass numbers — tune live in /admin/aachar → Horse → Animate, then
// "Copy TS" back into this file (same promotion flow as the character clips).

import type { AaHorseClip } from "./clip";

// Frame counts of SPUM's own horse clips at 60fps, LOCKED for swap parity:
// if AA horses ever ride into scenes, mount timings authored against SPUM
// durations must not drift. Verified against `public/spum/horse-anims/*.json`
// by test.
export const HORSE_LOCKED_FRAMES: Record<string, number> = {
  idle: 30,
  move: 25,
  run: 25,
  attack_melee: 25,
  attack_bow: 35,
  attack_magic: 25,
  damaged: 20,
  death: 90,
  debuff: 20,
  concentrate: 25,
  buff: 25,
  other: 25,
};

// A standing breath with the hooves FASTENED to the ground (Scott, 2026-08-11:
// idle legs must not float). The dip lives on `body`, never `root` — root
// moves the hind pair and every hoof with it. The front pair rides
// `Pivot_Body`, so it counters the dip with an equal +y and its hooves stay
// planted; the hind pair hangs off the untouched root and never moves. No
// body ROTATION either (rotation swings the front leg set), and no fetlock
// wiggles: the legs are pillars, the torso/neck/head/tail do the breathing.
export const idle: AaHorseClip = {
  name: "idle",
  frames: 30,
  loop: true,
  note: "breath cycle — torso dips on body.y with the front legs countering, hooves planted; neck/head/tail carry the life",
  beats: [
    { frame: 0, role: "rest", pose: {} },
    {
      frame: 13,
      role: "settle",
      pose: {
        body: { y: -0.7 },
        frontNear: { y: 0.7 },
        frontFar: { y: 0.7 },
        neck: { rot: 2.5 },
        head: { rot: 3.5 },
        tail: { rot: -4 },
      },
      note: "exhale — chest sinks 0.7px, front legs counter so the hooves stay put",
    },
    {
      frame: 22,
      role: "overshoot",
      pose: {
        body: { y: -0.15 },
        frontNear: { y: 0.15 },
        frontFar: { y: 0.15 },
        neck: { rot: 0.8 },
        head: { rot: -1 },
        tail: { rot: 2 },
      },
      note: "inhale recovery, a touch past rest",
    },
    { frame: 30, role: "rest", pose: {} },
  ],
};

// The walk — a 4-beat gait compressed into the rig's two visible leg layers.
// Near and far sides trade phase across the half-cycle; the head nods INTO
// each contact (real horses nod on the walk). Contacts at 0/13, passes at
// 6/19 — all interior frames off SPUM's 5/10/15/20 keys.
export const move: AaHorseClip = {
  name: "move",
  frames: 25,
  loop: true,
  note: "4-beat walk; near/far legs trade phase, head nods into the contacts",
  beats: [
    {
      frame: 0,
      role: "contact",
      pose: {
        root: { y: 0.5 },
        body: { rot: 1 },
        neck: { rot: 2 },
        head: { rot: -2 },
        tail: { rot: -3 },
        frontNear: { rot: -22, x: -1.5 },
        frontNearLow: { rot: 10 },
        frontFar: { rot: 18, x: 1 },
        frontFarLow: { rot: 6 },
        hindNear: { rot: 16 },
        hindNearLow: { rot: -8 },
        hindFar: { rot: -20, x: -1 },
        hindFarLow: { rot: -4 },
      },
      note: "near front planted forward, far hind reaching under; diagonal support",
    },
    {
      frame: 6,
      role: "pass",
      pose: {
        root: { y: -0.5 },
        body: { rot: 0.3 },
        neck: { rot: 4 },
        head: { rot: 2 },
        tail: { rot: 2 },
        frontNear: { rot: -4, y: 1.2 },
        frontNearLow: { rot: -14 },
        frontFar: { rot: 5 },
        frontFarLow: { rot: 3 },
        hindNear: { rot: 4 },
        hindNearLow: { rot: -3 },
        hindFar: { rot: -6, y: 1 },
        hindFarLow: { rot: -10 },
      },
      note: "legs gather under the body; swinging feet lift, head dips",
    },
    {
      frame: 13,
      role: "contact",
      pose: {
        root: { y: 0.4 },
        body: { rot: -0.8 },
        neck: { rot: 1.5 },
        head: { rot: -2.5 },
        tail: { rot: -2 },
        frontNear: { rot: 17 },
        frontNearLow: { rot: -7 },
        frontFar: { rot: -21, x: -1.2 },
        frontFarLow: { rot: -5 },
        hindNear: { rot: -23, x: -1.4 },
        hindNearLow: { rot: 9 },
        hindFar: { rot: 17, x: 0.8 },
        hindFarLow: { rot: 5 },
      },
      note: "sides traded — deliberately not a mirror of f0 (real gaits aren't)",
    },
    {
      frame: 19,
      role: "pass",
      pose: {
        root: { y: -0.6 },
        neck: { rot: 4.5 },
        head: { rot: 1.5 },
        tail: { rot: 3 },
        frontNear: { rot: 5 },
        frontNearLow: { rot: -3 },
        frontFar: { rot: -5, y: 1.1 },
        frontFarLow: { rot: -11 },
        hindNear: { rot: -5, y: 1 },
        hindNearLow: { rot: -12 },
        hindFar: { rot: 4 },
        hindFarLow: { rot: 3 },
      },
      note: "second gather, the other diagonal swings through",
    },
    {
      frame: 25,
      role: "contact",
      pose: {
        root: { y: 0.5 },
        body: { rot: 1 },
        neck: { rot: 2 },
        head: { rot: -2 },
        tail: { rot: -3 },
        frontNear: { rot: -22, x: -1.5 },
        frontNearLow: { rot: 10 },
        frontFar: { rot: 18, x: 1 },
        frontFarLow: { rot: 6 },
        hindNear: { rot: 16 },
        hindNearLow: { rot: -8 },
        hindFar: { rot: -20, x: -1 },
        hindFarLow: { rot: -4 },
      },
    },
  ],
};

// The gallop — rotary, with a real SUSPENSION phase (f0: all four gathered,
// airborne) and a GATHER (f13: feet crossing under the lowest point of the
// bounce). Structurally nothing like the walk: different beat frames
// (0/7/13/18/25), position-led root bounce, streaming tail. The neck reaches
// with the stride instead of nodding.
export const run: AaHorseClip = {
  name: "run",
  frames: 25,
  loop: true,
  rest: { body: { rot: -2 }, neck: { rot: -2 }, head: { rot: 2 } },
  note: "rotary gallop — suspension at f0, front landing f7, gather f13, hind drive f18",
  beats: [
    {
      frame: 0,
      role: "pass",
      pose: {
        root: { y: 3 },
        body: { rot: -4 },
        neck: { rot: -4 },
        head: { rot: 6 },
        tail: { rot: 14 },
        frontNear: { rot: 30 },
        frontNearLow: { rot: 45 },
        frontFar: { rot: -25 },
        frontFarLow: { rot: 35 },
        hindNear: { rot: 25 },
        hindNearLow: { rot: 40 },
        hindFar: { rot: -20 },
        hindFarLow: { rot: 30 },
      },
      note: "suspension — airborne, all four legs folded under, tail streaming",
    },
    {
      frame: 7,
      role: "contact",
      pose: {
        root: { y: -0.5 },
        body: { rot: 5 },
        neck: { rot: 8 },
        head: { rot: -4 },
        tail: { rot: -6 },
        frontNear: { rot: -45, x: -2 },
        frontNearLow: { rot: -20 },
        frontFar: { rot: 35, x: 1.5 },
        frontFarLow: { rot: 20 },
        hindNear: { rot: -35 },
        hindNearLow: { rot: -15 },
        hindFar: { rot: 30 },
        hindFarLow: { rot: 18 },
      },
      note: "front legs reach and land; hinds still trailing behind",
    },
    {
      frame: 13,
      role: "pass",
      pose: {
        root: { y: -1.5 },
        body: { rot: 2 },
        neck: { rot: 5 },
        head: { rot: 2 },
        tail: { rot: -10 },
        frontNear: { rot: 20 },
        frontNearLow: { rot: 10 },
        frontFar: { rot: -40, x: -2 },
        frontFarLow: { rot: -25 },
        hindNear: { rot: 15 },
        hindNearLow: { rot: 8 },
        hindFar: { rot: -35 },
        hindFarLow: { rot: -20 },
      },
      note: "the gather — lowest point, hinds swing forward under the body",
    },
    {
      frame: 18,
      role: "strike",
      pose: {
        root: { y: 1.5 },
        body: { rot: -4 },
        neck: { rot: -2 },
        head: { rot: 3 },
        tail: { rot: 6 },
        frontNear: { rot: -15 },
        frontNearLow: { rot: 20 },
        frontFar: { rot: 45, x: 2 },
        frontFarLow: { rot: 55 },
        hindNear: { rot: -10 },
        hindNearLow: { rot: 15 },
        hindFar: { rot: 40 },
        hindFarLow: { rot: 48 },
      },
      note: "hind drive — push-off launches the next flight, fronts folding forward",
    },
    {
      frame: 25,
      role: "pass",
      pose: {
        root: { y: 3 },
        body: { rot: -4 },
        neck: { rot: -4 },
        head: { rot: 6 },
        tail: { rot: 14 },
        frontNear: { rot: 30 },
        frontNearLow: { rot: 45 },
        frontFar: { rot: -25 },
        frontFarLow: { rot: 35 },
        hindNear: { rot: 25 },
        hindNearLow: { rot: 40 },
        hindFar: { rot: -20 },
        hindFarLow: { rot: 30 },
      },
    },
  ],
};

// Rear and strike with the front hooves. −rot on `body` lifts the front end
// (the neck hangs off the body's forward edge), so the rear is body −30 with
// the hinds coiled under. Interior beats 6/12/19 sit off SPUM's 8/17 keys.
export const attack_melee: AaHorseClip = {
  name: "attack_melee",
  frames: 25,
  loop: false,
  note: "rear up and lash out with both front hooves; lands with an overshoot",
  beats: [
    { frame: 0, role: "rest", pose: {} },
    {
      frame: 6,
      role: "anticipate",
      pose: {
        root: { y: -1.5 },
        body: { rot: 4 },
        neck: { rot: 6 },
        head: { rot: 4 },
        frontFar: { rot: -8 },
        frontFarLow: { rot: -10 },
        hindFar: { rot: -6 },
      },
      note: "the coil — front dips, haunches gather underneath",
    },
    {
      frame: 12,
      role: "strike",
      pose: {
        root: { y: 3.5 },
        body: { rot: -30 },
        neck: { rot: -10 },
        head: { rot: -8 },
        tail: { rot: -8 },
        frontNear: { rot: -55 },
        frontNearLow: { rot: -30 },
        hindNear: { rot: -45 },
        hindNearLow: { rot: -25 },
        frontFar: { rot: 12 },
        frontFarLow: { rot: 8 },
        hindFar: { rot: 10 },
      },
      note: "the rear — front end thrown up, hooves lashing forward",
    },
    {
      frame: 19,
      role: "overshoot",
      pose: {
        root: { y: -1 },
        body: { rot: 5 },
        neck: { rot: 7 },
        head: { rot: 5 },
        frontNear: { rot: -10 },
        frontNearLow: { rot: -4 },
        hindNear: { rot: -8 },
      },
      note: "hooves slam down past rest — the landing carries the weight",
    },
    { frame: 25, role: "rest", pose: {} },
  ],
};

// SPUM's `attack_bow` slot, reauthored as a BUCK — weight rocks onto the
// forehand, the hinds kick up and back twice (big kick, then a bounce), the
// tail flicks over the top. Interior beats 9/16/24/29 avoid SPUM's 12/23.
export const attack_bow: AaHorseClip = {
  name: "attack_bow",
  frames: 35,
  loop: false,
  note: "double buck — weight to the forehand, hinds kick back-up, tail flicks over",
  beats: [
    { frame: 0, role: "rest", pose: {} },
    {
      frame: 9,
      role: "anticipate",
      pose: {
        root: { y: -1 },
        body: { rot: 8 },
        neck: { rot: 10 },
        head: { rot: 8 },
        tail: { rot: 6 },
        frontNear: { rot: -8 },
        hindNear: { rot: -6 },
      },
      note: "head drops, weight rocks forward onto braced front legs",
    },
    {
      frame: 16,
      role: "strike",
      pose: {
        root: { y: 2 },
        body: { rot: 16 },
        neck: { rot: 14 },
        head: { rot: 10 },
        tail: { rot: -20 },
        frontNear: { rot: -12 },
        frontFar: { rot: 60, x: 2, y: 2 },
        frontFarLow: { rot: 70 },
        hindFar: { rot: 50 },
        hindFarLow: { rot: 60 },
      },
      note: "the kick — haunches thrown up, hinds fired back, tail over the top",
    },
    {
      frame: 24,
      role: "strike",
      pose: {
        root: { y: 0.5 },
        body: { rot: 10 },
        neck: { rot: 8 },
        head: { rot: 5 },
        tail: { rot: -12 },
        frontFar: { rot: 35 },
        frontFarLow: { rot: 40 },
        hindFar: { rot: 28 },
        hindFarLow: { rot: 32 },
      },
      note: "second, smaller kick-bounce before the hinds come down",
    },
    {
      frame: 29,
      role: "settle",
      pose: {
        body: { rot: 3 },
        neck: { rot: 4 },
        head: { rot: 2 },
        frontFar: { rot: 6 },
      },
      note: "hinds land, weight re-centres",
    },
    { frame: 35, role: "rest", pose: {} },
  ],
};

// SPUM's `attack_magic` slot — a showy flourish: head thrown up and back,
// one front hoof sweeping a wide arc, tail snapped high. Interior beats
// 5/13/20 avoid SPUM's 8/17 keys.
export const attack_magic: AaHorseClip = {
  name: "attack_magic",
  frames: 25,
  loop: false,
  note: "flourish — head toss with a sweeping front-hoof arc; pairs with cast FX",
  beats: [
    { frame: 0, role: "rest", pose: {} },
    {
      frame: 5,
      role: "anticipate",
      pose: {
        root: { y: -0.5 },
        neck: { rot: 6 },
        head: { rot: 6 },
        frontNear: { rot: -6 },
      },
      note: "nose dips, hoof cocks back",
    },
    {
      frame: 13,
      role: "strike",
      pose: {
        root: { y: 1.5 },
        body: { rot: -6 },
        neck: { rot: -12 },
        head: { rot: -14 },
        tail: { rot: -16 },
        frontNear: { rot: -40 },
        frontNearLow: { rot: -35 },
        hindNear: { rot: -10 },
      },
      note: "the toss — head flung up, near hoof sweeps the arc",
    },
    {
      frame: 20,
      role: "overshoot",
      pose: {
        neck: { rot: -4 },
        head: { rot: 4 },
        tail: { rot: 8 },
        frontNear: { rot: -12 },
        frontNearLow: { rot: 6 },
      },
      note: "settles through, tail follows late",
    },
    { frame: 25, role: "rest", pose: {} },
  ],
};

// The hit reaction — knocked back along +x with the nose snapping up, legs
// splayed to catch the stagger. Interior beats 7/14 avoid SPUM's 10 key.
export const damaged: AaHorseClip = {
  name: "damaged",
  frames: 20,
  loop: false,
  note: "recoil — knocked toward the tail, nose snaps up, legs splay to catch it",
  beats: [
    { frame: 0, role: "rest", pose: {} },
    {
      frame: 7,
      role: "strike",
      pose: {
        root: { x: 2.5, y: -0.8 },
        body: { rot: -5 },
        neck: { rot: -8 },
        head: { rot: -10 },
        tail: { rot: 10 },
        frontNear: { rot: 10, x: 1 },
        frontNearLow: { rot: -6 },
        hindNear: { rot: 8 },
        frontFar: { rot: -8, x: -1 },
        frontFarLow: { rot: 5 },
        hindFar: { rot: -6 },
      },
      note: "impact — thrown back over splayed legs",
    },
    {
      frame: 14,
      role: "settle",
      pose: {
        root: { x: 0.8 },
        body: { rot: -1 },
        neck: { rot: -2 },
        head: { rot: -2 },
        tail: { rot: 3 },
      },
      note: "recovering the stance",
    },
    { frame: 20, role: "rest", pose: {} },
  ],
};

// The collapse. Staged: stagger → front knees buckle → hinds give → down →
// slump → last breath → still. Non-loop, so the renderer clamps and holds the
// final pose.
export const death: AaHorseClip = {
  name: "death",
  frames: 90,
  loop: false,
  // Interior beats 9/20/33/46/58/74 — measured off SPUM death's actual keys
  // (0/15/23/45/55/60/65/90).
  note: "staged collapse — stagger, front buckle, hinds give, slump, last breath",
  beats: [
    { frame: 0, role: "rest", pose: {} },
    {
      frame: 9,
      role: "anticipate",
      pose: {
        root: { x: 1.5, y: -0.5 },
        body: { rot: -3 },
        neck: { rot: -4 },
        head: { rot: -5 },
        frontNear: { rot: -10, x: -1 },
        hindFar: { rot: 8, x: 1 },
      },
      note: "the stagger — head jerks up, legs splay",
    },
    {
      frame: 20,
      role: "strike",
      pose: {
        root: { y: -2.5 },
        body: { rot: 8 },
        neck: { rot: 6 },
        head: { rot: 4 },
        frontNear: { rot: 20 },
        frontNearLow: { rot: 55 },
        hindNear: { rot: 16 },
        hindNearLow: { rot: 45 },
        frontFar: { rot: -4 },
      },
      note: "front knees buckle and fold",
    },
    {
      frame: 33,
      role: "strike",
      pose: {
        root: { y: -4.5 },
        body: { rot: 4 },
        neck: { rot: 12 },
        head: { rot: 10 },
        tail: { rot: -6 },
        frontNear: { rot: 22 },
        frontNearLow: { rot: 58 },
        hindNear: { rot: 18 },
        hindNearLow: { rot: 48 },
        frontFar: { rot: 25 },
        frontFarLow: { rot: 50 },
        hindFar: { rot: 20 },
        hindFarLow: { rot: 42 },
      },
      note: "the hinds give — the whole frame sinks",
    },
    {
      frame: 46,
      role: "contact",
      pose: {
        root: { y: -6.5 },
        body: { rot: 12 },
        neck: { rot: 20 },
        head: { rot: 18 },
        tail: { rot: 4 },
        frontNear: { rot: 24 },
        frontNearLow: { rot: 60 },
        hindNear: { rot: 20 },
        hindNearLow: { rot: 50 },
        frontFar: { rot: 28 },
        frontFarLow: { rot: 55 },
        hindFar: { rot: 22 },
        hindFarLow: { rot: 45 },
      },
      note: "down — belly meets the ground, legs folded",
    },
    {
      frame: 58,
      role: "settle",
      pose: {
        root: { x: 0.5, y: -7.5 },
        body: { rot: 16 },
        neck: { rot: 26 },
        head: { rot: 26 },
        tail: { rot: 10 },
        frontNear: { rot: 24 },
        frontNearLow: { rot: 60 },
        hindNear: { rot: 20 },
        hindNearLow: { rot: 50 },
        frontFar: { rot: 28 },
        frontFarLow: { rot: 55 },
        hindFar: { rot: 22 },
        hindFarLow: { rot: 45 },
      },
      note: "the slump — neck lowers toward the ground",
    },
    {
      frame: 74,
      role: "settle",
      pose: {
        root: { x: 0.5, y: -7.8 },
        body: { rot: 17 },
        neck: { rot: 28 },
        head: { rot: 29 },
        tail: { rot: 10 },
        frontNear: { rot: 24 },
        frontNearLow: { rot: 60 },
        hindNear: { rot: 20 },
        hindNearLow: { rot: 50 },
        frontFar: { rot: 28 },
        frontFarLow: { rot: 55 },
        hindFar: { rot: 22 },
        hindFarLow: { rot: 45 },
      },
      note: "last breath",
    },
    {
      frame: 90,
      role: "hold",
      pose: {
        root: { x: 0.5, y: -8 },
        body: { rot: 17.5 },
        neck: { rot: 28.5 },
        head: { rot: 30 },
        tail: { rot: 10 },
        frontNear: { rot: 24 },
        frontNearLow: { rot: 60 },
        hindNear: { rot: 20 },
        hindNearLow: { rot: 50 },
        frontFar: { rot: 28 },
        frontFarLow: { rot: 55 },
        hindFar: { rot: 22 },
        hindFarLow: { rot: 45 },
      },
      note: "still — the renderer clamps here",
    },
  ],
};

// The debuff — a cower. The whole posture lives in `rest` (hung head, tucked
// tail, splayed stance) and the beats are a small shiver around it, so the
// loop closes trivially. Interior beats 6/13 avoid SPUM's 10 key.
export const debuff: AaHorseClip = {
  name: "debuff",
  frames: 20,
  loop: true,
  rest: {
    root: { y: -1.2 },
    body: { rot: 4 },
    neck: { rot: 10 },
    head: { rot: 12 },
    tail: { rot: 14 },
    frontNear: { rot: -5, x: -0.8 },
    hindFar: { rot: 5, x: 0.8 },
  },
  note: "cower held in rest; the beats are the shiver",
  beats: [
    { frame: 0, role: "rest", pose: {} },
    {
      frame: 6,
      role: "extreme",
      pose: {
        root: { x: 0.6 },
        head: { rot: 2 },
        tail: { rot: 3 },
        frontNearLow: { rot: 2 },
      },
      note: "shiver one way",
    },
    {
      frame: 13,
      role: "extreme",
      pose: {
        root: { x: -0.5 },
        head: { rot: -1.5 },
        tail: { rot: -3 },
        hindFarLow: { rot: 2 },
      },
      note: "shiver back",
    },
    { frame: 20, role: "rest", pose: {} },
  ],
};

// Concentrate — pawing the ground, head low and fixed on the spot being
// pawed. One front hoof cocks, scrapes forward, lifts and re-cocks.
// Interior beats 6/12/19 avoid SPUM's 8/17 keys.
export const concentrate: AaHorseClip = {
  name: "concentrate",
  frames: 25,
  loop: true,
  rest: { body: { rot: 2 }, neck: { rot: 8 }, head: { rot: 6 } },
  note: "pawing the ground; the head stays low, watching the hoof",
  beats: [
    {
      frame: 0,
      role: "anticipate",
      pose: {
        frontNear: { rot: 12, x: 1 },
        frontNearLow: { rot: -8 },
      },
      note: "hoof cocked back",
    },
    {
      frame: 6,
      role: "strike",
      pose: {
        root: { y: -0.3 },
        head: { rot: 2 },
        frontNear: { rot: -25, x: -2, y: 0.5 },
        frontNearLow: { rot: -20 },
      },
      note: "the scrape — hoof drags forward through the ground",
    },
    {
      frame: 12,
      role: "pass",
      pose: {
        head: { rot: -2 },
        frontNear: { rot: -8, y: 1.5 },
        frontNearLow: { rot: 15 },
      },
      note: "hoof lifts clear, fetlock folded",
    },
    {
      frame: 19,
      role: "settle",
      pose: {
        tail: { rot: 4 },
        frontNear: { rot: 10, x: 0.8 },
        frontNearLow: { rot: -5 },
      },
      note: "swings back toward the cock",
    },
    {
      frame: 25,
      role: "anticipate",
      pose: {
        frontNear: { rot: 12, x: 1 },
        frontNearLow: { rot: -8 },
      },
    },
  ],
};

// Buff — a proud prance in place: neck arched, chin tucked, tail carried
// high, knees lifted alternately. The arch lives in `rest`. Interior beats
// 6/13/19 avoid SPUM's 8/17 keys.
export const buff: AaHorseClip = {
  name: "buff",
  frames: 25,
  loop: true,
  rest: {
    body: { rot: -2 },
    neck: { rot: -10 },
    head: { rot: 14 },
    tail: { rot: -12 },
  },
  note: "prance in place — arched neck and high tail in rest, knees alternate",
  beats: [
    {
      frame: 0,
      role: "contact",
      pose: {
        root: { y: 0.8 },
        frontNear: { rot: -30 },
        frontNearLow: { rot: 40 },
        hindFar: { rot: -18 },
        hindFarLow: { rot: 25 },
        hindNear: { rot: 6 },
        frontFar: { rot: 6 },
      },
      note: "near knee high with the far hind — diagonal pair lifted",
    },
    {
      frame: 6,
      role: "pass",
      pose: {
        root: { y: -0.5 },
        frontNear: { rot: -5 },
        frontNearLow: { rot: 10 },
        hindFar: { rot: -4 },
        hindFarLow: { rot: 8 },
        hindNear: { rot: -8 },
        hindNearLow: { rot: 12 },
        frontFar: { rot: -6 },
        frontFarLow: { rot: 10 },
      },
      note: "legs swap through underneath",
    },
    {
      frame: 13,
      role: "contact",
      pose: {
        root: { y: 0.7 },
        hindNear: { rot: -28 },
        hindNearLow: { rot: 38 },
        frontFar: { rot: -16 },
        frontFarLow: { rot: 22 },
        frontNear: { rot: 7 },
        hindFar: { rot: 5 },
      },
      note: "the other diagonal lifts — close but not a mirror",
    },
    {
      frame: 19,
      role: "pass",
      pose: {
        root: { y: -0.4 },
        frontNear: { rot: -6 },
        frontNearLow: { rot: 9 },
        hindFar: { rot: -5 },
        hindFarLow: { rot: 7 },
        hindNear: { rot: -4 },
        frontFar: { rot: -4 },
      },
      note: "second swap, a touch softer",
    },
    {
      frame: 25,
      role: "contact",
      pose: {
        root: { y: 0.8 },
        frontNear: { rot: -30 },
        frontNearLow: { rot: 40 },
        hindFar: { rot: -18 },
        hindFarLow: { rot: 25 },
        hindNear: { rot: 6 },
        frontFar: { rot: 6 },
      },
    },
  ],
};

// Other — the happy fidget: a head toss with a tail wag and a tiny hop.
// The catch-all OTHER slot reads best as personality, not action. Interior
// beats 6/13/19 avoid SPUM's 8/17 keys.
export const other: AaHorseClip = {
  name: "other",
  frames: 25,
  loop: true,
  note: "happy fidget — head toss, tail wag, tiny hop",
  beats: [
    { frame: 0, role: "rest", pose: {} },
    {
      frame: 6,
      role: "extreme",
      pose: {
        root: { y: 0.6 },
        neck: { rot: -6 },
        head: { rot: -8 },
        tail: { rot: -18 },
        frontNear: { rot: -6, y: 0.5 },
      },
      note: "toss up, tail whips one way",
    },
    {
      frame: 13,
      role: "extreme",
      pose: {
        root: { y: -0.3 },
        neck: { rot: -2 },
        head: { rot: 4 },
        tail: { rot: 16 },
      },
      note: "head drops through, tail whips back",
    },
    {
      frame: 19,
      role: "extreme",
      pose: {
        root: { y: 0.4 },
        neck: { rot: -4 },
        head: { rot: -3 },
        tail: { rot: -12 },
        hindNear: { rot: -5 },
      },
      note: "half-height second toss",
    },
    { frame: 25, role: "rest", pose: {} },
  ],
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

import { checkHorseClip } from "./clip";

const AUTHORED: AaHorseClip[] = [
  idle,
  move,
  run,
  attack_melee,
  attack_bow,
  // Banned for CHARACTERS (lib/aachar/clips BANNED_CLIPS), legitimate here —
  // the ban was about the character's arm-waggle magic pose, not the name.
  attack_magic,
  damaged,
  death,
  debuff,
  concentrate,
  buff,
  other,
];

// Duplicate names and structural errors fail at MODULE LOAD, not in the
// browser — same bargain as the character registry and the content registry.
export const AA_HORSE_CLIPS: Record<string, AaHorseClip> = (() => {
  const out: Record<string, AaHorseClip> = {};
  for (const clip of AUTHORED) {
    if (out[clip.name]) throw new Error(`duplicate AA horse clip "${clip.name}"`);
    const locked = HORSE_LOCKED_FRAMES[clip.name];
    if (locked !== undefined && clip.frames !== locked) {
      throw new Error(
        `AA horse clip "${clip.name}" is ${clip.frames}f but the engine's is ${locked}f`,
      );
    }
    const errors = checkHorseClip(clip).filter((p) => p.level === "error");
    if (errors.length > 0) {
      throw new Error(
        `AA horse clip "${clip.name}": ${errors.map((e) => e.message).join("; ")}`,
      );
    }
    out[clip.name] = clip;
  }
  return out;
})();

export const AA_HORSE_CLIP_NAMES: string[] = Object.keys(AA_HORSE_CLIPS).sort();
