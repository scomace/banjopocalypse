// Level replays: because the sim is deterministic, a whole level is just
// (config, input log) — a few KB. The recorder deep-copies the config at
// level start (loadouts are live objects the shrine mutates mid-level),
// appends each tick's commands, and stamps the end-state hash. verifyReplay
// re-runs the log through a fresh sim and must land on the same hash — the
// same contract online peers will hold each other to.

import { getLevelDef } from "./levels";
import { isBossLevel, worldForLevel } from "./levels/worlds";
import { createSim, step, type SimConfig, type SimPlayerConfig } from "./sim/sim";
import { hashSim } from "./sim/hash";
import type { ShrineGift, Sim, SimInputs } from "./sim/types";
import { ReplayInputSource } from "./core/inputsource";

export type LevelReplay = {
  v: 1;
  seed: number;
  levelIndex: number;
  deathless: boolean;
  shrine: ShrineGift[] | null;
  players: (SimPlayerConfig | null)[];
  /** log[t][i] = InputCommand for player i on tick t */
  log: number[][];
  endTick: number;
  endHash: number;
};

export class ReplayRecorder {
  private replay: LevelReplay;

  constructor(cfg: SimConfig) {
    this.replay = {
      v: 1,
      seed: cfg.seed,
      levelIndex: cfg.levelIndex,
      deathless: cfg.deathless,
      shrine: cfg.shrine ? cfg.shrine.map((g) => ({ ...g })) : null,
      players: cfg.players.map((pc) =>
        pc
          ? {
              castId: pc.castId,
              loadout: {
                weapons: pc.loadout.weapons.map((w) => ({ ...w })),
                tonics: [...pc.loadout.tonics],
                evolved: [...pc.loadout.evolved],
              },
              livesLeft: pc.livesLeft,
              headStart: pc.headStart,
            }
          : null,
      ),
      log: [],
      endTick: 0,
      endHash: 0,
    };
  }

  record(inputs: SimInputs): void {
    this.replay.log.push([...inputs]);
  }

  /** Stamp the end state and hand over the replay (call at level end). */
  finish(sim: Sim): LevelReplay {
    this.replay.endTick = sim.tick;
    this.replay.endHash = hashSim(sim);
    return this.replay;
  }
}

export function simFromReplay(r: LevelReplay): Sim {
  return createSim({
    seed: r.seed,
    levelDef: getLevelDef(r.levelIndex),
    world: worldForLevel(r.levelIndex),
    levelIndex: r.levelIndex,
    isBoss: isBossLevel(r.levelIndex),
    players: r.players,
    deathless: r.deathless,
    shrine: r.shrine,
  });
}

/** Re-run the whole log through a fresh sim; ok iff it lands on the
 *  recorded end hash. This is the tick-perfect playback proof. */
export function verifyReplay(r: LevelReplay): { ok: boolean; hash: number; tick: number } {
  const sim = simFromReplay(r);
  const src = new ReplayInputSource(r.log);
  let prev: number[] = [0, 0];
  for (;;) {
    const inputs = src.poll(sim.tick);
    if (!inputs) break;
    step(sim, inputs, prev);
    prev = inputs;
  }
  const hash = hashSim(sim);
  return { ok: hash === r.endHash && sim.tick === r.endTick, hash, tick: sim.tick };
}

// -------------------------------------------------- localStorage persistence

const LS_KEY = "banjo.lastReplay";

export function saveLastReplay(r: LevelReplay): void {
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(LS_KEY, JSON.stringify(r));
  } catch {
    // storage full or blocked: losing a replay is never fatal
  }
}

export function loadLastReplay(): LevelReplay | null {
  try {
    if (typeof localStorage === "undefined") return null;
    const s = localStorage.getItem(LS_KEY);
    return s ? (JSON.parse(s) as LevelReplay) : null;
  } catch {
    return null;
  }
}
