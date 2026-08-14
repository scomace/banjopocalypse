// All 99 levels, resolved by absolute index (1..99).

import { levelWithWorldDefaults } from "./parse";
import type { LevelDef } from "./types";
import { WORLDS, worldForLevel } from "./worlds";
import { W1_LEVELS } from "./w1";
import { W2_LEVELS } from "./w2";
import { W3_LEVELS } from "./w3";
import { W4_LEVELS } from "./w4";
import { W5_LEVELS } from "./w5";
import { W6_LEVELS } from "./w6";
import { W7_LEVELS } from "./w7";
import { W8_LEVELS } from "./w8";
import { W9_LEVELS } from "./w9";

const ALL: LevelDef[][] = [
  W1_LEVELS,
  W2_LEVELS,
  W3_LEVELS,
  W4_LEVELS,
  W5_LEVELS,
  W6_LEVELS,
  W7_LEVELS,
  W8_LEVELS,
  W9_LEVELS,
];

export function getLevelDef(levelIndex1: number): LevelDef {
  const idx = Math.max(1, Math.min(99, levelIndex1));
  const world = worldForLevel(idx);
  const inWorld = (idx - 1) % 11;
  const defs = ALL[world.index - 1];
  const def = defs[Math.min(inWorld, defs.length - 1)];
  return levelWithWorldDefaults(def, world.defaultEnemies);
}

export function levelCountCheck(): { world: number; count: number }[] {
  return ALL.map((defs, i) => ({ world: i + 1, count: defs.length }));
}

export { WORLDS };
