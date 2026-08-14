// AA clips — casting, archery and self-effort. Authored from this rig's
// measured levers (`lib/aachar/rig.ts`), by STUDYING the SPUM references for
// what each motion IS, never from their numbers (the Phase 6c method — see
// docs/aachar-plan.md).
//
// What the references teach, named out loud before authoring:
//   * skill_magic  — the big version LEVITATES: rise off the ground, hover
//     while charging, land WITH the release.
//   * attack_bow   — raise the bow forward, DRAW with the body arched back
//     (the string hand travels, the bow hand holds), LOOSE on a short snap,
//     lower. The bow arm's job is stillness — the loose lives in the string
//     hand and the body.
//   * buff         — a self-directed puff: gather in and down, then chest
//     out and up, and back. Small, round, symmetric-ish.
//   * concentrate  — barely motion at all: the front hand held up near the
//     face, a slow ponderous rock.
//
// Rig discipline carried over from the first re-authoring: torso/head stay in
// the 3–11° band (the hair stack triples them), impact/weight is `root.x`/`.y`
// DISPLACEMENT over a held foot stagger, never a root rotation, and the back
// arm (rarm — the front-facing SIDE, drawn BEHIND the torso) gets −x pushes
// whenever it must read past the silhouette.

import type { AaClip } from "../clip";

// The big cast levitates. `root.y` lifts the whole character (feet are
// children of Root — greeting2's hop proved the lever), the feet dangle
// while airborne, and the landing IS the release: touch down and thrust in
// the same beat.
export const skill_magic: AaClip = {
  name: "skill_magic",
  frames: 40,
  loop: true,
  note: "crouch, float up (root.y), hover-charge, land-and-release in one beat",
  beats: [
    { frame: 0, role: "rest", pose: {} },
    {
      frame: 8,
      role: "anticipate",
      pose: {
        root: { y: -1.2 },
        body: { rot: 6 },
        head: { rot: 3 },
        larm: { rot: 10, x: 0.5 },
        rarm: { rot: 12, x: 0.8 },
        lfoot: { rot: 5, x: 0.5 },
        rfoot: { rot: -4, x: -0.5 },
      },
      note: "crouch — down before up",
    },
    {
      frame: 16,
      role: "extreme",
      pose: {
        root: { y: 4.5 },
        body: { rot: -6 },
        // Seam rule: the look-up is capped at −5 with a tuck — the first cut's
        // −9 with a +0.3 LIFT opened the neck wedge (the reported "head
        // detaching"). The body's −6 carries most of the upward read.
        head: { rot: -5, y: -0.4 },
        rarm: { rot: -125, x: -1, y: 2.8 },
        larm: { rot: -30, x: -1, y: 1 },
        lfoot: { rot: 14, y: 0.8 },
        rfoot: { rot: -12, y: 0.6 },
      },
      note: "airborne — casting hand overhead, feet dangle loose",
    },
    {
      frame: 27,
      role: "hold",
      pose: {
        root: { y: 5 },
        body: { rot: -7 },
        head: { rot: -6, y: -0.5 },
        rarm: { rot: -138, x: -1.5, y: 3.2 },
        larm: { rot: -36, y: 1.2 },
        lfoot: { rot: 14, y: 0.8 },
        rfoot: { rot: -12, y: 0.6 },
      },
      note: "hover — a touch higher, the charge deepens",
    },
    {
      frame: 34,
      role: "strike",
      pose: {
        root: { x: -2 },
        body: { rot: 11 },
        head: { rot: 1, y: -0.3 },
        rarm: { rot: -40, x: -5.5, y: 0.5 },
        larm: { rot: 14, x: 1 },
        lfoot: { rot: 10, x: 1 },
        rfoot: { rot: -12, x: -1.5 },
      },
      note: "LAND + RELEASE — touch down into a stagger, hand thrusts forward",
    },
    { frame: 40, role: "rest", pose: {} },
  ],
};

// Draw and loose. The bow arm (rarm, the front side) raises early and then
// its job is to HOLD — a flat plateau from nock to loose — while the string
// hand (larm) travels: forward to the nock, back past the cheek at full
// draw, snapped forward at the loose. The body arches back drawing and
// recovers through the release; weight shifts on root.x.
export const attack_bow: AaClip = {
  name: "attack_bow",
  frames: 50,
  loop: true,
  note: "raise early, plateau through the draw, loose on a 7-frame snap; the bow arm holds, the string hand travels",
  beats: [
    { frame: 0, role: "rest", pose: {} },
    {
      frame: 12,
      role: "anticipate",
      pose: {
        body: { rot: -4 },
        head: { rot: 2 },
        rarm: { rot: -70, x: -3.5, y: 1.5 },
        larm: { rot: -30, x: -1.5, y: 0.5 },
        lfoot: { rot: 10, x: 1 },
        rfoot: { rot: -12, x: -1.8 },
      },
      note: "bow up-forward, string hand meets it at the nock; archer stance set wide",
    },
    {
      frame: 26,
      role: "anticipate",
      pose: {
        root: { x: 1 },
        body: { rot: -10, y: 0.3 },
        head: { rot: 4, y: -0.45 },
        rarm: { rot: -74, x: -4, y: 1.8 },
        larm: { rot: 25, x: 2.5, y: 0.8 },
        lfoot: { rot: 10, x: 1 },
        rfoot: { rot: -12, x: -1.8 },
      },
      note: "FULL DRAW — string hand back past the cheek, body arched back, bow dead steady; head 4° rides a full seam tuck",
    },
    {
      frame: 33,
      role: "strike",
      pose: {
        root: { x: -1.5 },
        body: { rot: 6 },
        head: { rot: 1 },
        rarm: { rot: -72, x: -4.2, y: 1.6 },
        larm: { rot: -20, x: -2.5, y: 0.5 },
        lfoot: { rot: 10, x: 1 },
        rfoot: { rot: -12, x: -1.8 },
      },
      note: "LOOSE — the string hand snaps forward, the bow arm barely moves; feet hold",
    },
    {
      frame: 41,
      role: "settle",
      pose: {
        body: { rot: 2 },
        head: { rot: 0.5 },
        rarm: { rot: -18, x: -1.2, y: 0.3 },
        larm: { rot: -8, x: -1 },
        lfoot: { rot: 5, x: 0.5 },
        rfoot: { rot: -6, x: -0.8 },
      },
      note: "bow drops fast once the arrow is gone",
    },
    { frame: 50, role: "rest", pose: {} },
  ],
};

// A self-buff: gather down and in, puff up and out, ease home. The rise is
// `root.y` (the whole blob lifts), the chest-out is a modest −rot lean back
// with the chin up, and both fists flex out — the back arm pushed +x behind
// so it reads past the torso on its own side.
export const buff: AaClip = {
  name: "buff",
  frames: 30,
  loop: true,
  note: "gather (7) → puff (18) → settle (24); rise is root.y, chest-out stays inside the head-stack budget",
  beats: [
    { frame: 0, role: "rest", pose: {} },
    {
      frame: 7,
      role: "anticipate",
      pose: {
        root: { y: -0.8 },
        body: { rot: 5, y: -0.3 },
        head: { rot: 3 },
        larm: { rot: 18, x: 1 },
        rarm: { rot: 15, x: 0.8 },
        lfoot: { rot: 6, x: 0.5 },
        rfoot: { rot: -5, x: -0.5 },
      },
      note: "gather — hunch in, arms draw back",
    },
    {
      frame: 18,
      role: "extreme",
      pose: {
        root: { y: 1.4 },
        body: { rot: -8, y: 0.5 },
        // Chin-up is the −rot; the lift is root.y + body.y. A +y on the HEAD
        // (the first cut's 0.3) opens the neck seam — tuck instead.
        head: { rot: -4, y: -0.4 },
        larm: { rot: -28, x: -1.5, y: 0.8 },
        rarm: { rot: -24, x: 2, y: 0.5 },
        lfoot: { rot: 3, x: 0.3 },
        rfoot: { rot: -3, x: -0.3 },
      },
      note: "PUFF — up on the toes, chest out, chin up, fists flexed",
    },
    {
      frame: 24,
      role: "settle",
      pose: {
        root: { y: 0.3 },
        body: { rot: -2 },
        head: { rot: -1 },
        larm: { rot: -8 },
        rarm: { rot: -6, x: 0.5 },
      },
      note: "easing down",
    },
    { frame: 30, role: "rest", pose: {} },
  ],
};

// Thinking. The FRONT-drawn arm (larm, sortingOrder +20) is the one that can
// hold a hand up near the face and be seen doing it; the whole clip is a
// slow rock around that held pose, everything in the calm band.
export const concentrate: AaClip = {
  name: "concentrate",
  frames: 30,
  loop: true,
  // SPUM's original thinks with its eyes shut (static flip for the whole
  // clip); the AA re-author dropped that with the eye tracks, and this is
  // where it comes back — as whole-clip state, not track machinery.
  eyeState: "closed",
  rest: {
    body: { rot: 2 },
    // The tuck lives in the REST because the lean-in beat adds another 2.5°
    // on top — the seam rule is about the TOTAL, and the untucked total
    // (5.5°) was the reported neck gap on this clip.
    head: { rot: 3, y: -0.3 },
    larm: { rot: -95, x: -1.5, y: 1 },
    rarm: { rot: 8, x: 0.5 },
    lfoot: { rot: 4, x: 0.5 },
    rfoot: { rot: -3, x: -0.5 },
  },
  note: "front hand up near the chin; a lean-in / rock-back cycle in the calm band",
  beats: [
    { frame: 0, role: "rest", pose: {} },
    {
      frame: 9,
      role: "hold",
      pose: {
        body: { rot: 1.5, y: -0.3 },
        head: { rot: 2.5, x: -0.3, y: -0.2 },
        larm: { rot: -6, y: 0.3 },
      },
      note: "leans into the thought — the extra nod deepens the tuck with it",
    },
    {
      frame: 22,
      role: "settle",
      pose: {
        body: { rot: -1, y: 0.2 },
        // Eases the rest tuck without ever going net-positive (rest −0.3
        // + 0.1 = −0.2) — the first cut's +0.2 lifted the face off the chin.
        head: { rot: -2, y: 0.1 },
        larm: { rot: 4 },
      },
      note: "rocks back off it",
    },
    { frame: 30, role: "rest", pose: {} },
  ],
};

// The power shot — a VOLLEY, where attack_bow is a flat shot (2026-07-30,
// closing the fall-through tail). The choreography differs in kind, not
// size: raise-and-nock arrive in ONE motion (attack_bow gives them a beat
// each), the bow aims HIGH (both arms carry +y through the draw, the body
// arches further back, the chin comes up), the aim is HELD with a tremor —
// two nearly-identical beats, which is what a held draw looks like in a
// pose-sheet engine — and the loose drops the arms fast once the arrow is
// away. Interior beats sit off SPUM skill_bow's f20/25/29/33 keys.
export const skill_bow: AaClip = {
  name: "skill_bow",
  frames: 40,
  loop: true,
  note: "high volley — raise+nock in one (10), full draw aimed up (18), held aim w/ tremor (27), loose (34), quick drop (37)",
  beats: [
    { frame: 0, role: "rest", pose: {} },
    {
      frame: 10,
      role: "anticipate",
      pose: {
        body: { rot: -5 },
        head: { rot: 1 },
        rarm: { rot: -78, x: -3.8, y: 2.2 },
        larm: { rot: -34, x: -1.2, y: 1 },
        lfoot: { rot: 11, x: 1.2 },
        rfoot: { rot: -13, x: -2 },
      },
      note: "bow up and arrow nocked in one motion, already angled skyward",
    },
    {
      frame: 18,
      role: "anticipate",
      pose: {
        root: { x: 1.4 },
        body: { rot: -13, y: 0.3 },
        head: { rot: -3, y: -0.2 },
        rarm: { rot: -80, x: -4.2, y: 2.6 },
        larm: { rot: 28, x: 2.8, y: 1.4 },
        lfoot: { rot: 11, x: 1.2 },
        rfoot: { rot: -13, x: -2 },
      },
      note: "FULL DRAW aimed high — arched back under the bow, chin up, string hand past the cheek",
    },
    {
      frame: 27,
      role: "hold",
      pose: {
        root: { x: 1.5 },
        body: { rot: -12.5, y: 0.3 },
        head: { rot: -2.5, y: -0.2 },
        rarm: { rot: -79, x: -4.1, y: 2.55 },
        larm: { rot: 27, x: 2.7, y: 1.35 },
        lfoot: { rot: 11, x: 1.2 },
        rfoot: { rot: -13, x: -2 },
      },
      note: "the held aim — a sub-pixel tremor, the pose-sheet spelling of muscles under load",
    },
    {
      frame: 34,
      role: "strike",
      pose: {
        root: { x: -1.8 },
        body: { rot: 5 },
        head: { rot: 1 },
        rarm: { rot: -76, x: -4.3, y: 2.4 },
        larm: { rot: -24, x: -2.6, y: 1 },
        lfoot: { rot: 11, x: 1.2 },
        rfoot: { rot: -13, x: -2 },
      },
      note: "LOOSE — the string hand snaps forward, the bow arm barely moves, weight rides through",
    },
    {
      frame: 37,
      role: "settle",
      pose: {
        body: { rot: 1.5 },
        rarm: { rot: -20, x: -1.4, y: 0.5 },
        larm: { rot: -8, x: -0.8 },
        lfoot: { rot: 5, x: 0.5 },
        rfoot: { rot: -6, x: -0.8 },
      },
      note: "the bow drops fast, eyes still following the arc",
    },
    { frame: 40, role: "rest", pose: {} },
  ],
};
