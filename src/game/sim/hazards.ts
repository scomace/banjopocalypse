// HOLLER HAZARDS: one seeded chaos modifier per level.
//
// The campaign is 99 authored layouts, so the layouts themselves never
// surprise a returning player. Hazards do. Each level rolls at most one from
// its own RNG stream (seeded off the level seed, deliberately NOT sim.rng, so
// adding or reordering hazards can never shift the main simulation stream),
// which keeps lockstep peers and replays in agreement for free.
//
// Rules of the roll:
//   - never on boss levels (those arenas are tuned fights, not a lottery)
//   - never before FIRST_HAZARD_LEVEL (learn the verbs first)
//   - odds ramp with the world, so late worlds are mostly weird
//
// Roughly half the set makes life harder (greased, thin air, ornery, the
// early revenuer) and half hands you a mess of free chaos (jar rain, hogs,
// hens, dry lightnin'). Either way a hazard level pays HAZARD_SCORE_MULT, so
// the banner reads as an opportunity instead of a punishment.

import { mulberry32, rangeInt } from "../core/rng";
import { FIELD_H, FIELD_W, TICK_HZ, TILE, WIND_MAX } from "./constants";
import { emit } from "./sim";
import type { Sim } from "./types";

export type HazardId =
  | "greased"
  | "thinair"
  | "ornery"
  | "overflow"
  | "hogwild"
  | "gasleak"
  | "earlybird"
  | "henhouse"
  | "drylightnin"
  | "fulllungs";

export type HazardDef = {
  id: HazardId;
  /** Banner text on the level-intro card. Short, hollerable. */
  name: string;
  tagline: string;
  /** First world this hazard may roll on: the nastier ones ramp in. */
  minWorld: number;
};

export const HAZARDS: HazardDef[] = [
  {
    id: "overflow",
    name: "THE STILL'S OVERFLOWIN'",
    tagline: "Jars comin' faster'n you can drink 'em.",
    minWorld: 1,
  },
  {
    id: "henhouse",
    name: "CHICKEN TRUCK WRECK",
    tagline: "Poultry in motion. Mind yer step.",
    minWorld: 1,
  },
  {
    id: "greased",
    name: "GREASED FLOORS",
    tagline: "Somebody spilt the good stuff.",
    minWorld: 2,
  },
  {
    id: "hogwild",
    name: "HOG WILD",
    tagline: "Gate's open. Hogs is loose.",
    minWorld: 2,
  },
  {
    id: "thinair",
    name: "THIN AIR",
    tagline: "Gravity called in sick.",
    minWorld: 2,
  },
  {
    id: "fulllungs",
    name: "FULL LUNGS",
    tagline: "Air specials on the house.",
    minWorld: 3,
  },
  {
    id: "gasleak",
    name: "GAS LEAK",
    tagline: "Don't nobody light a match.",
    minWorld: 3,
  },
  {
    id: "ornery",
    name: "ORNERY STREAK",
    tagline: "Every varmint woke up mad.",
    minWorld: 3,
  },
  {
    id: "drylightnin",
    name: "DRY LIGHTNIN'",
    tagline: "Storm's got no rain in it.",
    minWorld: 4,
  },
  {
    id: "earlybird",
    name: "THE REVENUER'S EARLY",
    tagline: "He skipped breakfast. He's in a mood.",
    minWorld: 4,
  },
];

const BY_ID = new Map<HazardId, HazardDef>(HAZARDS.map((h) => [h.id, h]));

export function hazardDef(id: HazardId | null): HazardDef | null {
  return id ? (BY_ID.get(id) ?? null) : null;
}

/** Every score event on a hazard level pays this much: chaos is worth money. */
export const HAZARD_SCORE_MULT = 1.25;

/** Levels 1-2 of the whole campaign always play it straight. */
const FIRST_HAZARD_LEVEL = 3;

/** The early revenuer arrives this fast (vs HURRY_UP_TICKS' 45 s). */
export const EARLYBIRD_HURRY_TICKS = 18 * TICK_HZ;

function worldOf(levelIndex: number): number {
  return Math.min(9, Math.max(1, Math.ceil(levelIndex / 11)));
}

/**
 * Deterministic per-level roll. Same (seed, levelIndex) always yields the same
 * hazard on every machine, which is what lockstep and replay verification need.
 */
export function rollHazard(
  seed: number,
  levelIndex: number,
  isBoss: boolean,
): HazardId | null {
  if (isBoss || levelIndex < FIRST_HAZARD_LEVEL) return null;
  // A dedicated stream: the main sim.rng must stay byte-identical to what it
  // was before hazards existed, so level layouts keep their tuned feel.
  const rng = mulberry32((seed ^ 0x9e3779b9) >>> 0);
  const world = worldOf(levelIndex);
  const odds = Math.min(0.62, 0.28 + world * 0.04);
  if (rng() > odds) return null;
  const pool = HAZARDS.filter((h) => h.minWorld <= world);
  return pool[Math.floor(rng() * pool.length)].id;
}

// ------------------------------------------------------------- modulators
// Cheap accessors the sim multiplies its tuned constants by. Each is 1 (a
// no-op) unless its hazard is live, so the hazard-free path is unchanged.

/** THIN AIR: floaty jumps, slow falls. */
export function hazardGravityMult(sim: Sim): number {
  return sim.hazard === "thinair" ? 0.72 : 1;
}

export function hazardFallMult(sim: Sim): number {
  return sim.hazard === "thinair" ? 0.85 : 1;
}

/** GREASED FLOORS: ground friction all but disappears. */
export function hazardFrictionMult(sim: Sim): number {
  return sim.hazard === "greased" ? 0.12 : 1;
}

/** THE STILL'S OVERFLOWIN': jars land roughly every 10 s instead of every 40. */
export function hazardJarMult(sim: Sim): number {
  return sim.hazard === "overflow" ? 0.25 : 1;
}

/** ...and none of them fizzle: the usual per-jar miss roll is overridden, so
 *  the level really is wall-to-wall frenzy rather than a slightly better one. */
export function hazardJarAlwaysDrops(sim: Sim): boolean {
  return sim.hazard === "overflow";
}

/** First jar of an overflowing level lands almost immediately. */
export const OVERFLOW_FIRST_JAR_TICKS = 150;

export function hazardScoreMult(sim: Sim): number {
  return sim.hazard ? HAZARD_SCORE_MULT : 1;
}

// ------------------------------------------------------------- per-tick fx

/** The hazards that fire recurring events off sim.hazardTick. */
const EVENT_HAZARDS = new Set<HazardId>([
  "hogwild",
  "gasleak",
  "henhouse",
  "drylightnin",
]);

function nearestEnemyTo(sim: Sim, x: number, y: number) {
  let best: Sim["enemies"][number] | null = null;
  let bestD = Infinity;
  for (const e of sim.enemies) {
    if (e.phase.kind !== "normal") continue;
    const d = Math.abs(e.x - x) + Math.abs(e.y - y);
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  return best;
}

/**
 * The hazards that keep happening. Called once per played tick; hazards that
 * are pure modulation (greased, thin air, ornery, overflow, earlybird) do
 * their work elsewhere and cost nothing here.
 */
export function stepHazard(sim: Sim): void {
  const h = sim.hazard;
  if (!h) return;

  // FULL LUNGS is a standing condition, not an event: the tank never empties.
  if (h === "fulllungs") {
    for (const p of sim.players) if (p.alive) p.wind = WIND_MAX;
    return;
  }

  // Modulation-only hazards (greased, thin air, ornery, overflow, earlybird)
  // do their work in the sim's own tuned constants; there is no clock to run.
  if (!EVENT_HAZARDS.has(h)) return;
  if (sim.tick < sim.hazardTick) return;

  switch (h) {
    case "hogwild": {
      sim.hazardTick = sim.tick + rangeInt(sim.rng, 5 * TICK_HZ, 9 * TICK_HZ);
      if (sim.hog.active) break; // one hog at a time; the timer still rolls on
      const fromLeft = sim.rng() < 0.5;
      sim.hog = {
        active: true,
        x: fromLeft ? -30 : FIELD_W + 30,
        y: FIELD_H - TILE,
        vx: (fromLeft ? 1 : -1) * (3.1 + sim.rng() * 0.9),
        facing: fromLeft ? 1 : -1,
        ticks: 0,
      };
      emit(sim, { t: "sfx", name: "hogSqueal" });
      emit(sim, { t: "shake", power: 2 });
      break;
    }
    case "gasleak": {
      sim.hazardTick = sim.tick + rangeInt(sim.rng, 3 * TICK_HZ, 6 * TICK_HZ);
      if (sim.zones.length > 14) break;
      sim.zones.push({
        id: sim.nextId++,
        kind: "skunk",
        x: 30 + sim.rng() * (FIELD_W - 30 - TILE * 4),
        y: 70 + sim.rng() * (FIELD_H - 180),
        w: TILE * (3 + sim.rng() * 2),
        h: TILE * 2.5,
        ticks: Math.floor((4 + sim.rng() * 3) * TICK_HZ),
        spreading: false,
      });
      emit(sim, { t: "sfx", name: "skunk", pitch: 0.8 + sim.rng() * 0.5 });
      break;
    }
    case "henhouse": {
      sim.hazardTick = sim.tick + rangeInt(sim.rng, 40, 95);
      const fromLeft = sim.rng() < 0.5;
      sim.projectiles.push({
        id: sim.nextId++,
        kind: "chicken",
        hostile: false,
        owner: 0,
        x: fromLeft ? -20 : FIELD_W + 20,
        y: 50 + sim.rng() * (FIELD_H - 170),
        vx: (fromLeft ? 1 : -1) * (2.4 + sim.rng() * 1.6),
        vy: 0,
        ticks: 8 * TICK_HZ,
        data: 0,
        power: 2,
      });
      emit(sim, { t: "sfx", name: "cluck", pitch: 0.8 + sim.rng() * 0.5 });
      break;
    }
    case "drylightnin": {
      sim.hazardTick = sim.tick + rangeInt(sim.rng, 90, 170);
      const target = nearestEnemyTo(
        sim,
        sim.rng() * FIELD_W,
        sim.rng() * FIELD_H,
      );
      if (!target) break;
      sim.projectiles.push({
        id: sim.nextId++,
        kind: "bolt",
        hostile: false,
        owner: 0,
        x: target.x,
        y: target.y,
        vx: 0,
        vy: 0,
        ticks: 14,
        data: 1, // one chain jump: the storm likes company
        power: 3,
      });
      emit(sim, { t: "sfx", name: "boltHit" });
      emit(sim, { t: "flash", color: 0x9fd8ff });
      break;
    }
  }
}
