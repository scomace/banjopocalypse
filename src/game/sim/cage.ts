// Rescue cages: one per rescue level (cast.ts `rescue`), placed by the level's
// `R` tile. A cousin sits behind a padlock; body-checking the bars or hitting
// them with a frenzy weapon chips the lock, and on the last hit the cousin
// steps out, hollers, and the host marks them rescued in the save.
//
// The cage is always present on its level, even once rescued. The sim stays
// save-independent on purpose: lockstep peers with different saves must build
// identical sims, and a repeat rescue is still a food shower and a score bump.

import { castById, rescueForLevel } from "../cast";
import type { ParsedLevel } from "../levels/types";
import {
  CAGE_H,
  CAGE_HITS,
  CAGE_HIT_COOLDOWN,
  CAGE_HOLLER_EVERY,
  CAGE_HOLLER_FIRST,
  CAGE_W,
  FIELD_W,
  P_HEIGHT,
  P_WIDTH,
} from "./constants";
import { spawnFood } from "./items";
import { boxesOverlap } from "./physics";
import { emit } from "./sim";
import type { CageState, PlayerState, Sim } from "./types";

/** Ticks after the pop before the cousin gets their line in (the banner first). */
const CAGE_LINE_DELAY = 12;
/** Balloon speaker slot for the caged cousin (players are 0/1). */
export const CAGE_SPEAKER = 9;

/** What the caged cousin hollers on the first and second lock hits. */
const HIT_CHEERS = ["Harder! It's rusted shut!", "One more! Put yer hip in it!"];

function cageMouth(c: CageState): { x: number; y: number } {
  return { x: c.x, y: c.y - CAGE_H + 4 };
}

export function createCage(levelIndex: number, level: ParsedLevel, isBoss: boolean): CageState | null {
  if (isBoss || !level.rescue) return null;
  const m = rescueForLevel(levelIndex);
  if (!m) return null;
  return {
    castId: m.id,
    x: level.rescue.x,
    y: level.rescue.y,
    hits: 0,
    hitsNeeded: CAGE_HITS,
    hitCooldown: 0,
    rattle: 0,
    openedTick: -1,
    hollers: 0,
    nextHollerTick: -1,
  };
}

/** Is this player's body on the bars? */
export function touchesCage(c: CageState, p: PlayerState): boolean {
  if (!p.alive || p.respawnIn > 0) return false;
  return boxesOverlap(c.x, c.y, CAGE_W, CAGE_H, p.x, p.y, P_WIDTH + 4, P_HEIGHT);
}

/** One hit on the padlock, credited to `player`. Pops the cage on the last one. */
export function hitCage(sim: Sim, player: number): void {
  const c = sim.cage;
  if (!c || c.openedTick >= 0 || c.hitCooldown > 0) return;
  c.hits++;
  c.hitCooldown = CAGE_HIT_COOLDOWN;
  c.rattle = 14;
  if (c.hits < c.hitsNeeded) {
    // the padlock chips and wobbles (renderer) and the cousin eggs you on;
    // no comic burst here, it would sit right on top of the cage
    emit(sim, { t: "sfx", name: "bounce", pitch: 0.6 + c.hits * 0.1 });
    emit(sim, { t: "shake", power: 1 });
    const cheer = HIT_CHEERS[Math.min(HIT_CHEERS.length - 1, c.hits - 1)];
    emit(sim, { t: "balloon", player: CAGE_SPEAKER, trigger: "cageHit", text: cheer, at: cageMouth(c) });
    // push the next holler out so it doesn't talk over the cheer
    c.nextHollerTick = sim.tick + CAGE_HOLLER_EVERY;
    return;
  }
  c.openedTick = sim.tick;
  const m = castById(c.castId);
  emit(sim, { t: "sfx", name: "gospel" });
  emit(sim, { t: "shake", power: 3 });
  // banner up top, center screen: the cage corner stays clear for the bow + balloon
  emit(sim, { t: "burst", text: `${m.displayName.toUpperCase()} JOINED THE KIN!`, x: FIELD_W / 2, y: 150, big: true });
  sim.scored.push({ player: player as 0 | 1, amount: 5000 });
  // food shower, same spread as the warp cellar
  for (let i = 0; i < 6; i++) {
    spawnFood(sim, 80 + sim.rng() * (FIELD_W - 160), 120, 3 + Math.floor(sim.rng() * 3), 0);
  }
  emit(sim, { t: "rescue", cast: c.castId, player });
}

export function stepCage(sim: Sim): void {
  const c = sim.cage;
  if (!c) return;
  if (c.hitCooldown > 0) c.hitCooldown--;
  if (c.rattle > 0) c.rattle--;
  const m = castById(c.castId);
  if (c.openedTick < 0) {
    // call out from the cage so the detour gets noticed
    if (c.nextHollerTick < 0) c.nextHollerTick = sim.tick + CAGE_HOLLER_FIRST;
    if (sim.tick >= c.nextHollerTick && m.rescue && m.rescue.cagedLines.length > 0) {
      const line = m.rescue.cagedLines[c.hollers % m.rescue.cagedLines.length];
      emit(sim, { t: "balloon", player: CAGE_SPEAKER, trigger: "caged", text: line, at: cageMouth(c) });
      c.hollers++;
      c.nextHollerTick = sim.tick + CAGE_HOLLER_EVERY;
    }
  } else if (sim.tick === c.openedTick + CAGE_LINE_DELAY && m.rescue) {
    emit(sim, { t: "balloon", player: CAGE_SPEAKER, trigger: "rescued", text: m.rescue.line, at: cageMouth(c) });
  }
}
