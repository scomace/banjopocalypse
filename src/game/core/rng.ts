// Seeded PRNG — mulberry32, the same generator the exclaim lab uses. Every
// piece of gameplay randomness flows through one of these so a (seed, input
// stream) pair replays identically. No Math.random() anywhere in the sim.
//
// The generator state lives on the function itself (`rng.s`) so netcode and
// replays can snapshot/restore it: save `rng.s`, rebuild with rngFromState().

export interface Rng {
  (): number;
  /** mulberry32 state — read to snapshot, write (or rngFromState) to restore */
  s: number;
}

export function mulberry32(seed: number): Rng {
  const next = () => {
    rng.s = (rng.s + 0x6d2b79f5) | 0;
    let t = Math.imul(rng.s ^ (rng.s >>> 15), 1 | rng.s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rng = next as Rng;
  rng.s = seed >>> 0;
  return rng;
}

/** Rebuild an Rng at an exact saved state (replay resume, netcode resync). */
export function rngFromState(s: number): Rng {
  const rng = mulberry32(0);
  rng.s = s | 0;
  return rng;
}

/** Derive a level seed from a run seed: distinct, stable, order-free. */
export function deriveSeed(runSeed: number, salt: number): number {
  let h = (runSeed ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ salt, 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

export function pick<T>(rng: Rng, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

export function shuffled<T>(rng: Rng, arr: readonly T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function rangeInt(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}
