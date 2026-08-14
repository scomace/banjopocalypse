// AA clips — greetings and hand-offs. Rig facts that shaped these
// (see `lib/aachar/rig.ts`): the wave uses the RIGHT arm because Arm_R is
// the character's front side (screen-left, the direction faced) — and it is
// drawn BEHIND the torso, so every raised pose pushes the hand forward
// (−x) past the torso edge or the wave would happen invisibly behind the
// blob. Torso/head tilts stay in the active band (≤10°) because the
// hair/hat stack amplifies them ~3×.
//
// `givereceive` is the third most-used clip in the course. Its CONTACT pose
// (frame 26, where the prop changes hands) is load-bearing for scene prop
// timing and reach — locked, and marked `role: "contact"`.

import type { AaClip, AaPose } from "../clip";
import { reverseClip } from "../clipOps";

// A two-flick wave with the front arm. Beats 0/12/18/24/30/40 — raise,
// dip, second peak slightly higher, lower, home. The torso leans INTO the
// wave (+rot = toward the person being greeted) and the head tips with it.
// PROMOTED 2026-07-31: the hand-tuned /admin/aachar override is now the
// master; the manifest override layer was cleared (see aachar-plan session log).
export const greeting1: AaClip = {
  name: "greeting1",
  frames: 40,
  loop: true,
  note: "front-arm wave, two flicks; hand pushed forward past the torso edge so it reads",
  beats: [
    {
      frame: 0,
      role: "rest",
      pose: {
        rarm: { y: -2.4 },
      },
    },
    {
      frame: 12,
      role: "extreme",
      pose: {
        rarm: { rot: -100, x: -3, y: -0.6 },
        body: { rot: 4, y: 0.2 },
        head: { rot: 3, y: -0.2 },
        larm: { rot: 6 },
      },
      note: "hand up-forward, clear of the silhouette",
    },
    {
      frame: 18,
      role: "pass",
      pose: {
        rarm: { rot: -35, x: -2.5, y: -0.6 },
        body: { rot: 2.5 },
        head: { rot: 1.5 },
        larm: { rot: 4 },
      },
    },
    {
      frame: 24,
      role: "extreme",
      pose: {
        rarm: { rot: -100, x: -3, y: -0.6 },
        body: { rot: 4.5 },
        head: { rot: 3.5, y: -0.2 },
        larm: { rot: 6 },
      },
      note: "second flick, a touch higher",
    },
    {
      frame: 30,
      role: "settle",
      pose: {
        rarm: { rot: -20, x: -1.5, y: -0.6 },
        body: { rot: 1.5 },
        head: { rot: 1 },
        larm: { rot: 2 },
      },
    },
    {
      frame: 40,
      role: "rest",
      pose: {
        rarm: { y: -2.4 },
      },
    },
  ],
};

// A cheer with a hop under each arm-raise. The hop is `root.y` — the feet
// are children of Root, so lifting the root takes the whole character
// including them (lifting the body alone would hoist the torso off its own
// legs). Arms go up with big rotation (−120° swings the hand from hanging to
// overhead) PLUS a y push, and the head tips BACK (−rot) to look up.
export const greeting2: AaClip = {
  name: "greeting2",
  frames: 40,
  loop: true,
  note: "two hops (root.y), arms overhead; second hop lands higher — not a copy of the first",
  beats: [
    { frame: 0, role: "rest", pose: {} },
    {
      frame: 7,
      role: "anticipate",
      pose: {
        root: { y: -1.2 },
        body: { rot: 3, y: -0.3 },
        head: { rot: 2 },
        larm: { rot: 12, x: 1 },
        rarm: { rot: 14, x: 1 },
      },
      note: "crouch — down before up, arms flare back",
    },
    {
      frame: 14,
      role: "extreme",
      pose: {
        root: { y: 3.5 },
        larm: { rot: -120, x: 1, y: 3 },
        rarm: { rot: -115, x: -1, y: 3 },
        head: { rot: -3, y: 0.3 },
        body: { rot: -2 },
        lfoot: { rot: 12, y: 0.5 },
        rfoot: { rot: -10, y: 0.5 },
      },
      note: "first hop — feet dangle, head tips back to look up",
    },
    {
      frame: 19,
      role: "settle",
      pose: {
        body: { rot: 3, y: -0.2 },
        head: { rot: 1 },
        larm: { rot: -60, y: 1 },
        rarm: { rot: -55, y: 1 },
      },
      note: "landed, arms half-lowered",
    },
    {
      frame: 26,
      role: "extreme",
      pose: {
        root: { y: 3.8 },
        larm: { rot: -125, x: 1, y: 3.2 },
        rarm: { rot: -118, x: -1, y: 3.1 },
        head: { rot: -3.5, y: 0.3 },
        body: { rot: -2.2 },
        lfoot: { rot: 11, y: 0.5 },
        rfoot: { rot: -11, y: 0.5 },
      },
      note: "second hop, slightly higher",
    },
    {
      frame: 32,
      role: "settle",
      pose: {
        body: { rot: 2 },
        head: { rot: 0.5 },
        larm: { rot: -40, y: 0.5 },
        rarm: { rot: -35, y: 0.5 },
      },
    },
    { frame: 40, role: "rest", pose: {} },
  ],
};

// Taking something offered. The `rest` posture is the holding stance —
// front hand slightly forward-low, feet in a light stagger for balance —
// and the beats carry the reach out of it. The reach DEEPENS the arm
// rotation (−30 → −58: −rot swings the hand further forward) while the
// position pushes it past the torso edge to meet the prop.
export const receive: AaClip = {
  name: "receive",
  frames: 26,
  loop: false,
  rest: {
    body: { rot: 1.5, y: 0.2 },
    head: { rot: 1, y: -0.4 },
    rarm: { rot: -30, x: -1.5, y: -0.5 },
    larm: { rot: 4, y: -0.3 },
    lfoot: { rot: 6, x: 0.5 },
    rfoot: { rot: -5, x: -0.5 },
  },
  note: "one-shot reach; f26 is the prop hand-off CONTACT — frame and reach are locked",
  beats: [
    { frame: 0, role: "hold", pose: {} },
    {
      frame: 14,
      role: "anticipate",
      pose: {
        rarm: { rot: -8, x: -0.7, y: 0.3 },
        body: { rot: 1 },
        head: { rot: 1.5, y: -0.2 },
      },
      note: "attention turns to the giver, hand starts out",
    },
    {
      frame: 26,
      role: "contact",
      pose: {
        rarm: { rot: -28, x: -3, y: 1.7 },
        body: { rot: 2.5, y: 0.2 },
        head: { rot: 2, y: -0.3 },
        larm: { rot: 4, x: 0.5 },
      },
      note: "hand arrives forward-up, past the torso edge — props hand off HERE",
    },
  ],
};

// A BOW — what the greeting3 reference is: tip at the waist, hold it, rise
// with a small overshoot. On this rig a real waist-bow is the one place the
// torso is allowed past its budget on purpose (+19 body +5 head ≈ 24° of
// hair-stack — deliberate, and slow enough to read as courtesy rather than
// falling). The hands sweep BEHIND the back (+rot swings a hanging hand
// backward), the feet slide together formally, and the weight shifts
// forward-down on root displacement, never root rotation.
export const greeting3: AaClip = {
  name: "greeting3",
  frames: 50,
  loop: true,
  note: "formal bow — gather (11), bow (18), held (30), overshoot rise (42); hands behind the back, feet together",
  beats: [
    { frame: 0, role: "rest", pose: {} },
    {
      frame: 11,
      role: "anticipate",
      pose: {
        body: { rot: 4, y: -0.2 },
        head: { rot: 3 },
        larm: { rot: 8, x: 0.5 },
        rarm: { rot: 6 },
        lfoot: { x: -1 },
        rfoot: { x: 0.8 },
      },
      note: "gather — feet slide together, hands start back",
    },
    {
      frame: 18,
      role: "extreme",
      pose: {
        root: { x: -0.8, y: -0.4 },
        body: { rot: 19, y: -0.6 },
        // 5° needs the full ≥0.4 tuck (seam rule) — the 0.2 this shipped
        // with was the reported neck gap at the bottom of the bow.
        head: { rot: 5, y: -0.45 },
        larm: { rot: 14, x: 1, y: -0.5 },
        rarm: { rot: 18, x: 1.5, y: -0.5 },
        lfoot: { x: -1 },
        rfoot: { x: 0.8 },
      },
      note: "the bow — deliberate hair-stack spend; hands clasped behind",
    },
    {
      frame: 30,
      role: "hold",
      pose: {
        root: { x: -0.8, y: -0.4 },
        body: { rot: 19, y: -0.6 },
        head: { rot: 6, y: -0.5 },
        larm: { rot: 14, x: 1, y: -0.5 },
        rarm: { rot: 18, x: 1.5, y: -0.5 },
        lfoot: { x: -1 },
        rfoot: { x: 0.8 },
      },
      note: "held — the courtesy is the hold; only the head drifts a degree deeper",
    },
    {
      frame: 42,
      role: "overshoot",
      pose: {
        body: { rot: -4, y: 0.2 },
        head: { rot: -3 },
        larm: { rot: -4 },
        rarm: { rot: -5 },
        lfoot: { x: -0.4 },
        rfoot: { x: 0.3 },
      },
      note: "risen past upright, chin up a touch",
    },
    { frame: 50, role: "rest", pose: {} },
  ],
};

// Handing over is receiving backwards; deriving it means the two share the
// contact pose, so a prop passed between two actors meets in one place.
export const give: AaClip = reverseClip(receive, "give");

// The exchange beat: reach out, contact at the locked halfway frame (26),
// return. NO LONGER DERIVED — the concat construction (`receive + give`)
// went through two rounds of correction (the "her hand snaps back" playtest,
// 2026-07-30: SPUM's clip starts and ends where idle lives, so a one-shot
// reverts invisibly; the AA halves' polarity put the contact at both ends
// instead) and was then hand-tuned in the editor. This literal is that tuned
// version, promoted. Two properties are load-bearing:
//
// - **Contact sits at f26** (+0.433s) — every scene hand-off is timed to it
//   (`RECEIVE_CONTACT_FRAME`, doc §7.2/§25).
// - **First and last beats hold the SAME hand-at-bottom pose** (rarm +28
//   over the −30 rest ≈ −2° absolute — idle's arm), so a scene one-shot
//   cuts to idle with nothing to snap. Pinned by test.
// PROMOTED 2026-07-31: the hand-tuned /admin/aachar override is now the
// master; the manifest override layer was cleared (see aachar-plan session log).
export const givereceive: AaClip = {
  name: "givereceive",
  frames: 52,
  loop: false,
  rest: {
        body: { rot: 1.5, y: 0.2 },
        head: { rot: 1, y: -0.4 },
        rarm: { rot: -30, x: -1.5, y: -0.5 },
        larm: { rot: 4, y: -0.3 },
        lfoot: { rot: 6, x: 0.5 },
        rfoot: { rot: -5, x: -0.5 },
      },
  note: "rotated 2026-07-30: starts/ends at the hand-at-bottom hold so a one-shot reverts to idle cleanly; contact at f26",
  beats: [
    {
      frame: 0,
      role: "hold",
      pose: {
        body: {  },
        head: {  },
        larm: {  },
        rarm: { rot: 28 },
        lfoot: {  },
        rfoot: {  },
      },
    },
    {
      frame: 14,
      role: "anticipate",
      pose: {
        body: { rot: 1 },
        head: { rot: 1.5, y: -0.2 },
        larm: {  },
        rarm: { rot: -8 },
        lfoot: {  },
        rfoot: {  },
      },
    },
    {
      frame: 26,
      role: "contact",
      pose: {
        body: { rot: 2.5, y: 0.2 },
        head: { rot: 2, y: -0.3 },
        larm: { rot: 4, x: 0.5 },
        rarm: { rot: -28 },
        lfoot: {  },
        rfoot: {  },
      },
      note: "hand-off contact — locked halfway frame",
    },
    {
      frame: 38,
      role: "settle",
      pose: {
        body: { rot: 1 },
        head: { rot: 1.5, y: -0.2 },
        larm: {  },
        rarm: { rot: -8 },
        lfoot: {  },
        rfoot: {  },
      },
    },
    {
      frame: 52,
      role: "hold",
      pose: {
        body: {  },
        head: {  },
        larm: {  },
        rarm: { rot: 28 },
        lfoot: {  },
        rfoot: {  },
      },
    },
  ],
};

/** The pose a prop changes hands on. */
export const RECEIVE_CONTACT_FRAME = 26;

export const CARRY_HANDOFF: AaPose = receive.beats[receive.beats.length - 1].pose;
