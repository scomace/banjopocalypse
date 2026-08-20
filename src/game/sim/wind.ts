// Wind: the kinfolk's air-special stamina.
//
// Every air special (the second JUMP press midair: Earl's honest double,
// Merle's flutter, the attack bursts) spends one pip of wind; pips come back
// while boots are on the ground. Gassed out, a press is a coin flip, rolled
// ONCE per airtime (stepPlayer sets airJumpUsed before paying, so mashing
// can't reroll). The whiff is a stumble: a hiccup, a token hop, wobbly legs.
// A punishment, not a pit sentence.
//
// Not charged: Buford's cast and Darlene's chute (not jumps; they never
// reach spendWind) and boss floors (long fights: stamina there is grind).
//
// Pure sim: no Phaser, no DOM. The roll is sim.rng, so lockstep and replay
// hashes hold.

import {
  FIELD_W,
  P_AIR_JUMP_MULT,
  P_HEIGHT,
  WIND_ENABLED,
  WIND_FAIL_CHANCE,
  WIND_MAX,
  WIND_REGEN_TICKS,
  WIND_STRAIN_AT,
  WIND_STUMBLE_MULT,
  WIND_STUMBLE_TICKS,
} from "./constants";
import type { PlayerState, Sim } from "./types";
import { emit } from "./sim";

export function windExempt(sim: Sim): boolean {
  return !WIND_ENABLED || sim.isBoss;
}

/** Boots on the ground: bank ticks toward the next pip. */
export function regenWind(sim: Sim, p: PlayerState): void {
  if (windExempt(sim) || p.wind >= WIND_MAX) {
    p.windTicks = 0;
    return;
  }
  p.windTicks++;
  if (p.windTicks >= WIND_REGEN_TICKS) {
    p.windTicks = 0;
    p.wind++;
  }
}

/** A second wind: level start, respawn, the Second Pour. */
export function refillWind(p: PlayerState): void {
  p.wind = WIND_MAX;
  p.windTicks = 0;
}

/**
 * Pay for an air special. True = it fires. Spends a pip if there is one;
 * gassed out, rolls the dice. The last pips wheeze so the cliff is heard
 * coming, and a lucky gassed press squeaks.
 */
export function spendWind(sim: Sim, p: PlayerState): boolean {
  if (windExempt(sim)) return true;
  const pan = (p.x / FIELD_W) * 2 - 1;
  if (p.wind > 0) {
    p.wind--;
    if (p.wind <= WIND_STRAIN_AT) {
      emit(sim, { t: "sfx", name: "windStrain", pitch: 1 - p.wind * 0.12, pan });
    }
    return true;
  }
  const fires = sim.rng() >= WIND_FAIL_CHANCE;
  if (fires) emit(sim, { t: "sfx", name: "windStrain", pitch: 1.18, pan });
  return fires;
}

/** The whiff: hiccup mid-press, a stumble hop, legs going every which way. */
export function stumble(sim: Sim, p: PlayerState): void {
  p.vy = Math.min(p.vy, p.jumpVy * P_AIR_JUMP_MULT * WIND_STUMBLE_MULT);
  p.stumbleTicks = WIND_STUMBLE_TICKS;
  emit(sim, {
    t: "sfx",
    name: "windFail",
    pitch: 0.92 + sim.rng() * 0.16,
    pan: (p.x / FIELD_W) * 2 - 1,
  });
  emit(sim, { t: "burst", text: "HIC!", x: p.x, y: p.y - P_HEIGHT - 10 });
  emit(sim, { t: "balloon", player: p.index, trigger: "winded" });
}
