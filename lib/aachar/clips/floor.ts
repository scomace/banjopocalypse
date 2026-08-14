// AA clips — the floor set: going down, being down, getting up.
//
// ── THE NECK-SEAM RULE (measured 2026-07-29, the death_sleep head split) ────
//
// This character is one interlocked blob: the torso region's top rows are
// SKIN — the chin — and the head region's bottom row is open-bottomed face,
// so the art's face straddles the head/body seam. The seam is invisible only
// while the two sprites stay aligned. The head channel's pivot (P_Head) sits
// ~1px below that seam, dead centre, which means ANY relative head rotation
// opens a wedge at the seam's ends (~8.5px half-width × sin θ) and any +y
// delta lifts the whole face apart. Measured on the rig: the bones stayed
// rigidly attached to within 1px — the "head split from body" was entirely
// this wedge plus a +0.2 lift.
//
// So, on this rig:
//   * head |rot| ≤ ~3° is free; up to ~6° needs a −y tuck of ≥ 0.4px;
//   * head y must never be positive — settle INTO the torso, never lift
//     (the same lesson sit_idle's breath already learned, see below).
// The head still reads as the most expressive channel because the hat's
// painted art reaches ~18px from the bone (rig.ts): 5° of neck is 3px+ of
// hat swing. Author the bounce in hat pixels, not neck degrees.
//
// ── HOW SPUM ANIMATES death_sleep (measured off the real curves) ────────────
//
// The reference is a BACKWARD faint with an inertia bounce, phrased as:
//   f0–10   sway FORWARD (+11.9° body, +9.8° head) — anticipation against
//           the coming fall, arms already swinging;
//   f10–20  teeter back through upright (+5°), root starting to sink;
//   f20–30  the collapse — body +5° → −89° in ten frames, feet kicking up
//           in front (−70..−90°) as the legs leave the ground;
//   f30–43  the body holds flat, but the HEAD KEEPS TRAVELLING: its relative
//           rotation rides through the impact to +8.1° at f40 — ten frames
//           AFTER the floor — then flops to −0.85° in three frames. That lag
//           and quick flop IS the "feel": the skull has momentum the torso
//           lost when it hit. Arms and the far foot overshoot and settle on
//           the same delay.
//   f43–60  held still. Nearly a third of the clip is stillness.
//
// The AA clip below keeps that STRUCTURE (sway, collapse, post-contact head
// bounce, long still tail) and none of its values or timing: the fall here is
// two-stage (the sink leads, the tip follows), the collapse lands earlier,
// the bounce peaks sooner and gets a damped second settle, and the arms
// windmill FORWARD for balance before flopping back — where SPUM's drop early
// and flop up. Interior beats sit off SPUM's pose keys and the originality
// gate holds (clip.test.ts).
//
// The character sleeps ON ITS BACK, like the reference — the earlier
// face-down flop survives as the AA-original `fall_forward` below.
// (Historical note: `getup` was originally the exact reverse of the fall and
// `death_sleep`/`sleep_idle` were built from the shared `SLEEP_POSE`. The
// 2026-07-31 promotion of the editor-tuned overrides made all three authored
// literals — their chain poses still match by construction of the tuning,
// but they are no longer mechanically coupled; retune them together.)

import type { AaClip, AaPose } from "../clip";

// On the back, on the floor. Deltas from stance: the blob is sunk to the
// ground (root −4.2) and shifted a step behind (+x = behind), tipped fully
// backward (−72 body — deliberately past every budget; a lying pose is not
// motion), head at a seam-safe −2 with its tuck, arms sprawled overhead
// (+rot = hand backward, which is above the head once you're lying down),
// legs laid out along the floor IN FRONT (−rot with −x, the coupling sign
// for a forward foot).
export const SLEEP_POSE: AaPose = {
  root: { x: 2, y: -4.2 },
  body: { rot: -72, x: 0.5, y: -0.5 },
  head: { rot: -2, y: -0.2 },
  larm: { rot: 24, x: 0.8, y: 0.2 },
  rarm: { rot: 16, x: 0.5 },
  // The deltas ride the stance (lfoot +4, rfoot −4), so −5 tucks the left
  // leg UNDER the lying torso (local −1) and −3 lays the right leg out front
  // past the hip (local −7) — the first cut sent it to local −9, a floating
  // stick with no overlap on the body. Same stagger the face-down pose uses,
  // mirrored.
  lfoot: { rot: -74, x: -5, y: 1.2 },
  rfoot: { rot: -82, x: -3, y: 1.6 },
};

// Sway forward, sink, collapse backward, slap flat — then the head bounce —
// then still. Non-loop: it ends asleep. The tail from f48 to f60 is
// deliberately still, exactly what the reference does with its own tail.
// PROMOTED 2026-07-31: the hand-tuned /admin/aachar override is now the
// master; the manifest override layer was cleared (see aachar-plan session log).
export const death_sleep: AaClip = {
  name: "death_sleep",
  frames: 60,
  loop: false,
  note: "backward faint — sway (8), knees give (18), floor (28), head bounce peaks (35), flop (42), settled (48), held to 60; getup derives from this",
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
        root: { y: -0.3 },
        body: { rot: 4, x: -0.3 },
        head: { rot: 1.5, y: -0.15 },
        larm: { rot: -6 },
        rarm: { rot: -5 },
      },
      note: "the sway — a first nod forward before the faint takes him the other way, hips already drifting",
    },
    {
      frame: 18,
      role: "strike",
      pose: {
        root: { x: 0.6, y: -1.6 },
        body: { rot: -24, x: -1.2 },
        head: { rot: 2, y: -0.2 },
        larm: { rot: -18, x: -0.6 },
        rarm: { rot: -14, x: -0.4 },
        lfoot: { rot: -8, x: -0.5 },
        rfoot: { rot: -5, x: -0.8 },
      },
      note: "knees give — the SINK leads, the tip follows, hips thrust FORWARD as the shoulders go back (the x path SPUM's fall doesn't have); arms windmill forward grasping at air, head lags the tip (relative +)",
    },
    {
      frame: 28,
      role: "contact",
      pose: {
        root: { x: 1.6, y: -4.2 },
        body: { rot: -70, x: 0.2, y: -0.4 },
        head: { rot: 2.5, y: -0.25 },
        larm: { rot: 10, x: 0.5, y: 0.2 },
        rarm: { rot: 6, x: 0.3 },
        lfoot: { rot: -54, x: -7.5, y: -0.8 },
        rfoot: { rot: -62, x: -2.2, y: 1.1 },
      },
      note: "the slap — flat on the back, arms flung past the shoulders, legs kicked up front and still airborne",
    },
    {
      frame: 35,
      role: "overshoot",
      pose: {
        root: { x: 1.9, y: -4.2 },
        body: { rot: -73.5, x: 0.6, y: -0.55 },
        head: { rot: 6, y: -0.4 },
        larm: { rot: 30, x: 1, y: 0.3 },
        rarm: { rot: 22, x: 0.8 },
        lfoot: { rot: -80, x: -7.7, y: -0.6 },
        rfoot: { rot: -89, x: -2.5, y: 2.1 },
      },
      note: "the HEAD BOUNCE — the skull's momentum carries past the stopped torso (chin toward chest, hat flapping); arms and feet overshoot on the same delay. Seam-safe: +6° rides a 0.4px tuck",
    },
    {
      frame: 42,
      role: "settle",
      pose: {
        root: { x: 2, y: -4.2 },
        body: { rot: -72, x: 0.5, y: -0.5 },
        head: { rot: -4, y: -0.3 },
        larm: { rot: 20, x: 0.7, y: 0.2 },
        rarm: { rot: 16, x: 0.5 },
        lfoot: { rot: -74, x: -7.2, y: -0.7 },
        rfoot: { rot: -80, x: -2.4, y: 1.7 },
      },
      note: "the flop down — head lands a touch past its rest, the damped half of the bounce",
    },
    {
      frame: 48,
      role: "settle",
      pose: {
        root: { x: 2, y: -4.2 },
        body: { rot: -72, x: 0.5, y: -0.5 },
        head: { rot: -2, y: -0.2 },
        larm: { rot: 24, x: 0.8, y: 0.2 },
        rarm: { rot: 16, x: 0.5 },
        lfoot: { rot: -74, x: -7.6, y: -0.7 },
        rfoot: { rot: -82, x: -2.4, y: 1.6 },
      },
      note: "second, smaller recovery dies out; asleep",
    },
    {
      frame: 60,
      role: "hold",
      pose: {
        root: { x: 2, y: -4.2 },
        body: { rot: -72, x: 0.5, y: -0.5 },
        head: { rot: -2, y: -0.2 },
        larm: { rot: 24, x: 0.8, y: 0.2 },
        rarm: { rot: 16, x: 0.5 },
        lfoot: { rot: -74, x: -7.6, y: -0.9 },
        rfoot: { rot: -82, x: -2.4, y: 1.6 },
      },
    },
  ],
};

// Rising was originally derived as `reverse(death_sleep)`; the editor tuning
// (2026-07-31) reshaped its interior poses independently of the fall, so it
// is now authored in its own right. Its frame layout is still the fall's
// mirror, and its f0 still matches where `death_sleep` ends, so the
// lie-then-rise chain reads continuously.
// PROMOTED 2026-07-31: the hand-tuned /admin/aachar override is now the
// master; the manifest override layer was cleared (see aachar-plan session log).
export const getup: AaClip = {
  name: "getup",
  frames: 60,
  loop: false,
  note: "reverse of death_sleep",
  beats: [
    {
      frame: 0,
      role: "hold",
      pose: {
        root: { x: 2, y: -4.2 },
        body: { rot: -72, x: 0.5, y: -0.5 },
        head: { rot: -2, y: -0.2 },
        larm: { rot: 24, x: 0.8, y: 0.2 },
        rarm: { rot: 16, x: 0.5 },
        lfoot: { rot: -74, x: -7.6, y: -0.9 },
        rfoot: { rot: -82, x: -2.3, y: 1.6 },
      },
    },
    {
      frame: 12,
      role: "anticipate",
      pose: {
        root: { x: 2, y: -4.2 },
        body: { rot: -72, x: 0.5, y: -0.5 },
        head: { rot: -2, y: -0.2 },
        larm: { rot: 24, x: 0.8, y: 0.2 },
        rarm: { rot: 16, x: 0.5 },
        lfoot: { rot: -74, x: -7.6, y: -0.9 },
        rfoot: { rot: -82, x: -2.3, y: 1.6 },
      },
      note: "second, smaller recovery dies out; asleep",
    },
    {
      frame: 18,
      role: "anticipate",
      pose: {
        root: { x: 2, y: -4.2 },
        body: { rot: -72, x: 0.5, y: -0.5 },
        head: { rot: -4, y: -0.3 },
        larm: { rot: 20, x: 0.7, y: 0.2 },
        rarm: { rot: 16, x: 0.5 },
        lfoot: { rot: -74, x: -7.9, y: -0.8 },
        rfoot: { rot: -80, x: -2.3, y: 1.5 },
      },
      note: "the flop down — head lands a touch past its rest, the damped half of the bounce",
    },
    {
      frame: 25,
      role: "overshoot",
      pose: {
        root: { x: 1.9, y: -4.2 },
        body: { rot: -73.5, x: 0.6, y: -0.55 },
        head: { rot: 6, y: -0.4 },
        larm: { rot: 30, x: 1, y: 0.3 },
        rarm: { rot: 22, x: 0.8 },
        lfoot: { rot: -80, x: -5.4, y: 1.5 },
        rfoot: { rot: -89, x: -2.3, y: 2.1 },
      },
      note: "the HEAD BOUNCE — the skull's momentum carries past the stopped torso (chin toward chest, hat flapping); arms and feet overshoot on the same delay. Seam-safe: +6° rides a 0.4px tuck",
    },
    {
      frame: 32,
      role: "contact",
      pose: {
        root: { x: 1.6, y: -4.2 },
        body: { rot: -70, x: 0.2, y: -0.4 },
        head: { rot: 2.5, y: -0.25 },
        larm: { rot: 10, x: 0.5, y: 0.2 },
        rarm: { rot: 6, x: 0.3 },
        lfoot: { rot: -54, x: -3.6, y: 0.8 },
        rfoot: { rot: -62, x: -2.2, y: 1.1 },
      },
      note: "the slap — flat on the back, arms flung past the shoulders, legs kicked up front and still airborne",
    },
    {
      frame: 42,
      role: "strike",
      pose: {
        root: { x: 0.6, y: -1.6 },
        body: { rot: -24, x: -1.2 },
        head: { rot: 2, y: -0.2 },
        larm: { rot: -18, x: -0.6 },
        rarm: { rot: -14, x: -0.4 },
        lfoot: { rot: -8, x: -0.5 },
        rfoot: { rot: -5, x: -0.8 },
      },
      note: "knees give — the SINK leads, the tip follows, hips thrust FORWARD as the shoulders go back (the x path SPUM's fall doesn't have); arms windmill forward grasping at air, head lags the tip (relative +)",
    },
    {
      frame: 52,
      role: "settle",
      pose: {
        root: { y: -0.3 },
        body: { rot: 4, x: -0.3 },
        head: { rot: 1.5, y: -0.15 },
        larm: { rot: -6 },
        rarm: { rot: -5 },
      },
      note: "the sway — a first nod forward before the faint takes him the other way, hips already drifting",
    },
    {
      frame: 60,
      role: "rest",
      pose: {},
    },
  ],
};

// Breathing, on the back. The belly (which is what the camera sees) lifts a
// touch on the inhale — a POSITIVE body delta eases the −72 tip back toward
// upright — and the whole thing lives in the calm band. The head's share of
// the breath keeps its tuck (seam rule above).
// PROMOTED 2026-07-31: the hand-tuned /admin/aachar override is now the
// master; the manifest override layer was cleared (see aachar-plan session log).
export const sleep_idle: AaClip = {
  name: "sleep_idle",
  frames: 30,
  loop: true,
  rest: {
        root: { x: 2, y: -4.2 },
        body: { rot: -72, x: 0.5, y: -0.5 },
        head: { rot: -2, y: -0.2 },
        larm: { rot: 24, x: 0.8, y: 0.2 },
        rarm: { rot: 16, x: 0.5 },
        lfoot: { rot: -74, x: -5, y: 1.2 },
        rfoot: { rot: -82, x: -3, y: 1.6 },
      },
  note: "breath over SLEEP_POSE; the visible belly rises on the inhale",
  beats: [
    {
      frame: 0,
      role: "rest",
      pose: {
        lfoot: { x: -3.8, y: -2 },
        rfoot: { x: 0.7 },
      },
    },
    {
      frame: 16,
      role: "settle",
      pose: {
        body: { rot: 2.5, y: 0.4 },
        head: { rot: 1, y: -0.1 },
        larm: { rot: -2 },
        lfoot: { x: -3.8, y: -2 },
        rfoot: { x: 0.7 },
      },
      note: "inhale — the belly swells up",
    },
    {
      frame: 30,
      role: "rest",
      pose: {
        lfoot: { x: -3.8, y: -2 },
        rfoot: { x: 0.7 },
      },
    },
  ],
};

// Face-down on the floor — the end pose of `fall_forward`. The original
// face-plant read of this character (a round blob has no on-its-back
// silhouette problem a hat-first plant doesn't solve better), kept as its own
// pose now that `death_sleep` matches the reference's backward fall. Head is
// seam-safe: +3 with a tuck, where the first version's +9 with a LIFT was
// exactly the split the seam rule above forbids.
export const FACEPLANT_POSE: AaPose = {
  root: { x: 1, y: -4.2 },
  body: { rot: 72, y: -0.5 },
  head: { rot: 3, y: -0.3 },
  larm: { rot: -20, x: -0.8, y: 0.3 },
  rarm: { rot: -14, x: -0.5 },
  // Near-horizontal (+90 would be flat back): the stick legs LIE along the
  // floor behind the body. The first cut used +55/+48 and the pose strip
  // showed them spiking diagonally into the ground.
  lfoot: { rot: 82, x: 3, y: 2 },
  rfoot: { rot: 76, x: 5, y: 1.5 },
};

// AA-ORIGINAL. Sag, buckle forward, face-plant, bounce, settle, hold — the
// forward mirror of death_sleep's phrase, with the same post-contact head
// bounce (here the face pops back UP off the floor, so the relative rotation
// runs the other way). No SPUM counterpart: no locked duration, no gate.
export const fall_forward: AaClip = {
  name: "fall_forward",
  frames: 60,
  loop: false,
  note: "face-down flop — sag (9), buckle (21), floor contact (31), head bounce (35), settle (38), held to 60",
  beats: [
    { frame: 0, role: "rest", pose: {} },
    {
      frame: 9,
      role: "anticipate",
      pose: {
        root: { y: -0.6 },
        body: { rot: 6 },
        head: { rot: 1.5, y: -0.15 },
        larm: { rot: -8 },
        rarm: { rot: -6 },
      },
      note: "the sag — eyes heavy, everything slumps a first inch",
    },
    {
      frame: 21,
      role: "strike",
      pose: {
        root: { x: -0.5, y: -2.8 },
        body: { rot: 42 },
        head: { rot: 2.5, y: -0.25 },
        larm: { rot: -45, x: -2.5 },
        rarm: { rot: -38, x: -2 },
        lfoot: { rot: 20, x: 1.5 },
        rfoot: { rot: 14, x: 2 },
      },
      note: "buckling forward — arms out to catch, feet starting to trail",
    },
    {
      frame: 31,
      role: "contact",
      pose: {
        root: { x: 1, y: -4.2 },
        body: { rot: 70, y: -0.4 },
        head: { rot: 3, y: -0.3 },
        larm: { rot: -32, x: -1.5, y: 0.3 },
        rarm: { rot: -26, x: -1 },
        lfoot: { rot: 78, x: 3, y: 2 },
        rfoot: { rot: 72, x: 5, y: 1.5 },
      },
      note: "the floor arrives — flat, arms still braced, legs laid out behind",
    },
    {
      frame: 35,
      role: "overshoot",
      pose: {
        root: { x: 1, y: -4.2 },
        body: { rot: 72.5, y: -0.5 },
        head: { rot: -2, y: -0.15 },
        larm: { rot: -36, x: -1.8, y: 0.4 },
        rarm: { rot: -30, x: -1.3 },
        lfoot: { rot: 86, x: 3.2, y: 2.3 },
        rfoot: { rot: 80, x: 5.2, y: 1.8 },
      },
      note: "the head bounce — the face pops back up off the floor (relative −, the mirror of death_sleep's +) while the feet overshoot behind",
    },
    {
      frame: 38,
      role: "settle",
      pose: {
        ...FACEPLANT_POSE,
        head: { rot: 4, y: -0.3 },
      },
      note: "arms give up the brace and sprawl; the head flops back down a touch past its rest",
    },
    { frame: 60, role: "hold", pose: FACEPLANT_POSE },
  ],
};

// Seated on the floor, legs out front. Shared the same way SLEEP_POSE is:
// `sit_idle` breathes over it (as its `rest`) and `sit` ENDS on it, so a
// character that sits down lands exactly where the seated idle lives — the
// chain plays without a pop, structurally.
export const SIT_POSE: AaPose = {
  root: { x: 0.5, y: -3.2 },
  body: { rot: -6 },
  head: { rot: 2 },
  larm: { rot: -5, x: -0.5 },
  rarm: { rot: -4 },
  // Near-horizontal forward (−rot swings a hanging leg forward): the legs
  // rest ALONG the floor out front. The first cut (−35/−28, y −1) left
  // them angled down through the ground — caught on the pose strip.
  lfoot: { rot: -72, x: -2.5, y: 0.5 },
  rfoot: { rot: -63, x: -1.5, y: 0.8 },
};

// Sitting on the floor, legs out front, gently rocking. The sit is root
// displacement (down −3.2), the legs stick out FORWARD (−x with −rot, the
// coupling sign for a forward foot), and the lean-back is a body angle the
// hair stack can afford.
export const sit_idle: AaClip = {
  name: "sit_idle",
  frames: 30,
  loop: true,
  rest: SIT_POSE,
  note: "seated, legs out front; breath rocks the torso in the calm band",
  beats: [
    { frame: 0, role: "rest", pose: {} },
    {
      frame: 16,
      role: "settle",
      pose: {
        // The head is a CHILD of the body — the rock already carries it.
        // Its own delta must only ever settle INTO the torso (−y) and nod
        // WITH the body, or the neck seam opens on every breath (shipped
        // that way first; visible as the head lifting off the shoulders).
        body: { rot: 2, y: 0.4 },
        head: { rot: 0.8, y: -0.2 },
        larm: { rot: -2 },
        rarm: { rot: 2 },
      },
      note: "rocks forward off the lean on the exhale; head nods with it, settling in",
    },
    { frame: 30, role: "rest", pose: {} },
  ],
};

// ── The transitions + the rest of the going-down family (2026-07-30) ────────
//
// These four closed the floor half of the SPUM fall-through tail. None are
// referenced by content yet, so nothing locks their INTERIOR structure — only
// their total durations (LOCKED_FRAMES) and the originality gate. Authored to
// the same rules as the rest of this file: the neck-seam rule, foot coupling,
// root displacement for weight, and interior beats off SPUM's pose keys
// (sit/death_sit avoid f10/13/17/20/25/30/33/40; sleep also f43; die avoids
// f6/10/15/17/19/25).

// Standing → seated. A DELIBERATE sit, not a collapse: glance down, lower on
// bending knees with the arms out front for balance, land on the seat a
// touch deep (−3.4, the compression), rock back past the lean-back, come to
// rest ON `SIT_POSE` — so chaining into `sit_idle` is seamless by
// construction.
export const sit: AaClip = {
  name: "sit",
  frames: 60,
  loop: false,
  note: "deliberate sit-down — check (9), lower (18), seat lands deep (27), rock-back (36), settled on SIT_POSE (44), held to 60; chains into sit_idle",
  beats: [
    { frame: 0, role: "rest", pose: {} },
    {
      frame: 9,
      role: "anticipate",
      pose: {
        root: { y: -0.8 },
        body: { rot: 5 },
        head: { rot: 2, y: -0.2 },
        larm: { rot: -8, x: -0.5 },
        rarm: { rot: -6 },
      },
      note: "the glance down at the ground he's about to own",
    },
    {
      frame: 18,
      role: "strike",
      pose: {
        root: { y: -2.4 },
        body: { rot: 10 },
        head: { rot: 2.5, y: -0.25 },
        larm: { rot: -32, x: -2 },
        rarm: { rot: -28, x: -1.5 },
        lfoot: { rot: -18, x: -1 },
        rfoot: { rot: -12, x: -0.6 },
      },
      note: "the lower — knees bend, arms counterweight out front, feet starting to slide forward",
    },
    {
      frame: 27,
      role: "contact",
      pose: {
        root: { x: 0.5, y: -3.4 },
        body: { rot: -2 },
        head: { rot: 1.5, y: -0.2 },
        larm: { rot: -20, x: -1 },
        rarm: { rot: -16 },
        lfoot: { rot: -52, x: -1.8, y: 0.4 },
        rfoot: { rot: -44, x: -1.2, y: 0.6 },
      },
      note: "the seat lands — a touch below the resting height (compression), legs sliding out",
    },
    {
      frame: 36,
      role: "overshoot",
      pose: {
        root: { x: 0.5, y: -3.2 },
        body: { rot: -9 },
        head: { rot: -1, y: -0.2 },
        larm: { rot: -8 },
        rarm: { rot: -6 },
        lfoot: { rot: -74, x: -2.6, y: 0.5 },
        rfoot: { rot: -66, x: -1.6, y: 0.8 },
      },
      note: "rocks back past the seated lean as the legs shoot out — the momentum spends itself",
    },
    { frame: 44, role: "settle", pose: SIT_POSE, note: "home — exactly sit_idle's base" },
    { frame: 60, role: "hold", pose: SIT_POSE },
  ],
};

// Seated and dead — slumped FORWARD over the outstretched legs, head hung
// (seam-safe: +4 rides a 0.4 tuck), arms dangling toward the floor. Where
// SIT_POSE leans back at ease, this pitches forward: the spine gave up.
export const DEATH_SIT_POSE: AaPose = {
  root: { x: 0.8, y: -3.3 },
  body: { rot: 16, y: -0.3 },
  head: { rot: 4, y: -0.4 },
  larm: { rot: -16, x: -1, y: 0.3 },
  rarm: { rot: -12, x: -0.6 },
  lfoot: { rot: -68, x: -2.2, y: 0.5 },
  rfoot: { rot: -58, x: -1.4, y: 0.8 },
};

// Collapse into a seated slump — the knees give STRAIGHT DOWN (this fall has
// no backward or forward travel to speak of; the seat simply arrives), then
// the torso whips forward over the lap with the same post-contact head-lag
// this file's other falls carry, rebounds a touch, and hangs there.
export const death_sit: AaClip = {
  name: "death_sit",
  frames: 60,
  loop: false,
  eyeState: "closed",
  note: "seated collapse — sag (8), knees give straight down (15), seat hits (22), torso whips forward + head bounce (28), rebound (36), slumped (44), held to 60",
  beats: [
    { frame: 0, role: "rest", pose: {} },
    {
      frame: 8,
      role: "anticipate",
      pose: {
        root: { y: -0.5 },
        body: { rot: 4 },
        head: { rot: 1.5, y: -0.15 },
        larm: { rot: -6 },
        rarm: { rot: -5 },
      },
      note: "the sag — everything lets go a first inch",
    },
    {
      frame: 15,
      role: "strike",
      pose: {
        root: { y: -2 },
        body: { rot: 8 },
        head: { rot: 2, y: -0.2 },
        larm: { rot: -14, x: -0.8 },
        rarm: { rot: -10 },
        lfoot: { rot: -14, x: -0.8 },
        rfoot: { rot: -10, x: -0.5 },
      },
      note: "knees buckle — the drop is vertical, feet skating out from under",
    },
    {
      frame: 22,
      role: "contact",
      pose: {
        root: { x: 0.8, y: -3.5 },
        body: { rot: 6 },
        head: { rot: 2.5, y: -0.25 },
        larm: { rot: 8, x: 0.4 },
        rarm: { rot: 6 },
        lfoot: { rot: -44, x: -1.4, y: 1.4 },
        rfoot: { rot: -36, x: -0.9, y: 1.6 },
      },
      note: "the seat hits, a hair deep — loose arms flop UP off the impact, legs thrown out front and briefly AIRBORNE",
    },
    {
      frame: 28,
      role: "overshoot",
      pose: {
        root: { x: 0.8, y: -3.3 },
        body: { rot: 22, y: -0.3 },
        head: { rot: 6, y: -0.45 },
        larm: { rot: -22, x: -1.4, y: 0.3 },
        rarm: { rot: -18, x: -0.8 },
        lfoot: { rot: -70, x: -2.3, y: 0.5 },
        rfoot: { rot: -60, x: -1.5, y: 0.8 },
      },
      note: "the torso whips forward over the lap and the HEAD keeps travelling — the same skull-momentum lag as death_sleep, upright",
    },
    {
      frame: 36,
      role: "settle",
      pose: {
        ...DEATH_SIT_POSE,
        body: { rot: 13, y: -0.3 },
        head: { rot: 2, y: -0.3 },
      },
      note: "a small rebound back off the deepest slump",
    },
    { frame: 44, role: "settle", pose: DEATH_SIT_POSE, note: "hung there" },
    { frame: 60, role: "hold", pose: DEATH_SIT_POSE },
  ],
};

// Standing → asleep on the back, ON PURPOSE — the deliberate twin of
// death_sleep's faint. The structural difference IS the storytelling: a faint
// goes down through a teeter and a slap; going to bed goes down through a
// SIT (crouch, seat, hands braced behind), then reclines the shoulders to
// the floor and slides the legs out. Ends on SLEEP_POSE, so `sleep →
// sleep_idle` chains exactly the way `sit → sit_idle` does.
export const sleep: AaClip = {
  name: "sleep",
  frames: 60,
  loop: false,
  eyeState: "closed",
  note: "deliberate lie-down — slump (9), crouch (16), seated hands-behind (24), shoulders reach floor (31), legs slide out (38), SLEEP_POSE (47), held to 60; chains into sleep_idle",
  beats: [
    { frame: 0, role: "rest", pose: {} },
    {
      frame: 9,
      role: "anticipate",
      pose: {
        root: { y: -0.6 },
        body: { rot: 4 },
        head: { rot: 2, y: -0.2 },
        larm: { rot: -6 },
        rarm: { rot: -5 },
      },
      note: "the drowsy slump — heavy eyes, shoulders down",
    },
    {
      frame: 16,
      role: "strike",
      pose: {
        root: { y: -2.6 },
        body: { rot: 12, x: -0.4 },
        head: { rot: 2.5, y: -0.25 },
        larm: { rot: -26, x: -1.6 },
        rarm: { rot: -22, x: -1.2 },
        lfoot: { rot: -16, x: -1 },
        rfoot: { rot: -11, x: -0.6 },
      },
      note: "lowering through the crouch — folded well forward over the knees, hips drifting back",
    },
    {
      frame: 24,
      role: "settle",
      pose: {
        root: { x: 0.6, y: -3.4 },
        body: { rot: 6, y: -0.3 },
        head: { rot: 2.5, y: -0.3 },
        larm: { rot: -12, x: -0.6 },
        rarm: { rot: -9 },
        lfoot: { rot: -54, x: -2, y: 0.5 },
        rfoot: { rot: -46, x: -1.3, y: 0.7 },
      },
      note: "seated and STILL HUNCHED FORWARD over the lap, nodding off — the tip backward hasn't started yet",
    },
    {
      frame: 31,
      role: "contact",
      pose: {
        root: { x: 1.4, y: -4 },
        body: { rot: -30, x: 0.3, y: -0.3 },
        head: { rot: 1, y: -0.2 },
        larm: { rot: 20, x: 0.7, y: 0.2 },
        rarm: { rot: 14, x: 0.5 },
        lfoot: { rot: -30, x: -1, y: 1.5 },
        rfoot: { rot: -38, x: -0.6, y: 1.8 },
      },
      note: "lets himself flop back — elbows catch the floor half-reclined; KNEES UP, feet drawn back near the hips",
    },
    {
      frame: 38,
      role: "settle",
      pose: {
        ...SLEEP_POSE,
        body: { rot: -62, x: 0.4, y: -0.4 },
        head: { rot: -1, y: -0.2 },
      },
      note: "the legs slide out along the floor; nearly flat",
    },
    { frame: 47, role: "settle", pose: SLEEP_POSE, note: "settled — exactly sleep_idle's base" },
    { frame: 60, role: "hold", pose: SLEEP_POSE },
  ],
};

// Dying is falling forward. `fall_forward` (above) was born as this
// character's death read — a round blob planting hat-first — and `die`
// keeps that choreography at the engine's locked 40 frames: the same
// sag → buckle → face-plant → head-bounce phrase, compressed (the sag is
// heavier and the still tail shorter, because 40f buys less silence than
// 60f). Ends on FACEPLANT_POSE, the same source of truth, so the two
// face-down clips cannot drift apart in where they leave the body.
export const die: AaClip = {
  name: "die",
  frames: 40,
  loop: false,
  eyeState: "closed",
  note: "the death — sag (8), buckle (14), face-plant (21), head bounce (26), settle (30), held to 40; fall_forward's phrase at the locked length",
  beats: [
    { frame: 0, role: "rest", pose: {} },
    {
      frame: 8,
      role: "anticipate",
      pose: {
        root: { y: -0.8 },
        body: { rot: 7 },
        head: { rot: 2, y: -0.2 },
        larm: { rot: -9 },
        rarm: { rot: -7 },
      },
      note: "the mortal sag — deeper than a sleepy slump, the strength going",
    },
    {
      frame: 14,
      role: "strike",
      pose: {
        root: { x: -0.4, y: -2.6 },
        body: { rot: 40 },
        head: { rot: 2.5, y: -0.25 },
        larm: { rot: -42, x: -2.3 },
        rarm: { rot: -36, x: -1.8 },
        lfoot: { rot: 18, x: 1.4 },
        rfoot: { rot: 13, x: 1.8 },
      },
      note: "buckling forward — arms half-raised, too slow to catch anything",
    },
    {
      frame: 21,
      role: "contact",
      pose: {
        root: { x: 1, y: -4.2 },
        body: { rot: 70, y: -0.4 },
        head: { rot: 3, y: -0.3 },
        larm: { rot: -30, x: -1.4, y: 0.3 },
        rarm: { rot: -24, x: -0.9 },
        lfoot: { rot: 78, x: 3, y: 2 },
        rfoot: { rot: 72, x: 5, y: 1.5 },
      },
      note: "the floor — flat, legs laid out behind",
    },
    {
      frame: 26,
      role: "overshoot",
      pose: {
        root: { x: 1, y: -4.2 },
        body: { rot: 72.5, y: -0.5 },
        head: { rot: -2, y: -0.15 },
        larm: { rot: -34, x: -1.7, y: 0.4 },
        rarm: { rot: -28, x: -1.2 },
        lfoot: { rot: 85, x: 3.2, y: 2.3 },
        rfoot: { rot: 79, x: 5.2, y: 1.8 },
      },
      note: "the head bounce — the face pops back up off the floor once, the last movement",
    },
    {
      frame: 30,
      role: "settle",
      pose: {
        ...FACEPLANT_POSE,
        head: { rot: 4, y: -0.3 },
      },
      note: "everything lets go",
    },
    { frame: 40, role: "hold", pose: FACEPLANT_POSE },
  ],
};
