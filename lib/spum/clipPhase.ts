// Scene-clock → clip-phase derivation, shared by SpumCharacter and SpumHorse.
//
// Rigs inside a SpumScene don't free-run: the scene's rAF publishes its
// current scene-time into a shared ref, and each rig derives its clip phase
// from that clock every frame:
//
//   phase = ((sceneT - clockStart) * speed) mod clipDuration
//
// `clockStart` is the scene-time the current clip's phase 0 is anchored to —
// 0 for cast-time clips, the action's `t` for `play` actions, the scheduled
// revert time for one-shot reverts. Because phase is a pure function of
// scene-time, looping the scene (which wraps scene-time back to ~0) snaps
// every rig back to its exact loop-start pose, so FX / actions timed against
// a looping animation stay in sync forever. The free-running accumulator this
// replaced drifted whenever the scene duration wasn't an integer multiple of
// the effective clip period (clipDuration / speed) — e.g. attack_melee
// (0.4167s) at speed 0.4 in a 4s scene shifted phase by 0.84 of a swing on
// every scene loop.
//
// Negative elapsed (the clock wraps a frame before the actor-state rebuild
// lands, or a stale `clockStart` outlives a loop wrap by one render) folds
// into [0, clipDuration), so the worst case is one frame sampled at an
// equivalent in-range phase rather than an out-of-range sample.
export function clipPhaseAt(
  sceneT: number,
  clockStart: number,
  speed: number,
  clipDuration: number,
): number {
  if (clipDuration <= 0) return 0;
  const phase = ((sceneT - clockStart) * speed) % clipDuration;
  return phase < 0 ? phase + clipDuration : phase;
}
