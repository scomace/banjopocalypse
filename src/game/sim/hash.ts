// Deterministic sim-state fingerprint — the desync canary. Identical
// (seed, input stream) pairs must hash identically on every machine, so
// online peers exchange these periodically and replays verify against them.
// FNV-1a over the JSON snapshot; JSON.stringify skips functions, so the RNG
// state is appended explicitly.

import type { Sim } from "./types";

export function hashSim(sim: Sim): number {
  const json = JSON.stringify(sim) + "|rng:" + sim.rng.s;
  let h = 0x811c9dc5;
  for (let i = 0; i < json.length; i++) {
    h ^= json.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
