// The kinfolk's air specials: what the second JUMP press does midair.
// stepPlayer gates the press (airborne, not swinging, special unspent) and
// calls fireAirSpecial once per airtime. Three specials are NOT one-shot
// bursts and only partly live here: Buford's hook (hook.ts, hold-to-swing),
// Darlene's possum chute (the glide clamp in stepPlayer, hold-to-drift) and
// Bobbie Sue's sputter (the putt-putt loop in stepPlayer; sputterPuff below
// is the per-puff physics).
//
// Attack specials ride the REAL systems, not bespoke damage loops: Cooter
// drops an actual jug (contact hits + fire pool on smash), Bobbie Sue's
// puffs fire actual pellets, Zeke's jackpot is an actual chaining bolt — so
// they all inherit projectile rendering, boss chipping, and score
// attribution.
//
// Pure sim: no Phaser, no DOM.

import type { CastMember } from "../cast";
import {
  BOLT_DMG,
  BOLT_RADIUS,
  BOLT_VY,
  FART_BLAST_R,
  FART_CLOUD_TICKS,
  FART_CLOUD_W,
  FART_LIFT_VY,
  FART_VX,
  FIELD_W,
  FLUTTER_ANIM_TICKS,
  FLUTTER_VX_CAP,
  FLUTTER_VX_MULT,
  FLUTTER_VY_MULT,
  JUGBLAST_JUG_VY,
  JUGBLAST_VY,
  P_AIR_JUMP_MULT,
  P_HEIGHT,
  SPUTTER_VX,
  SPUTTER_VX_CAP,
  SPUTTER_VY,
  TICK_HZ,
  WILD_CHARGE_TICKS,
  WILD_RIDE_TICKS,
} from "./constants";
import type { PlayerState, Sim } from "./types";
import { emit } from "./sim";
import { flingEnemy } from "./hook";
import { killEnemyByWeapon } from "./enemies";

export function fireAirSpecial(
  sim: Sim,
  p: PlayerState,
  special: CastMember["airSpecial"],
): void {
  switch (special) {
    case "flutter": {
      // Merle: identical to Earl's double jump except for one legally
      // distinguishing feature — the panic-speed leg scramble keeps his
      // momentum and kicks it up a notch. Distance over height.
      p.vy = p.jumpVy * FLUTTER_VY_MULT;
      const dir = p.vx !== 0 ? Math.sign(p.vx) : p.facing;
      const sp = Math.max(Math.abs(p.vx) * FLUTTER_VX_MULT, p.maxSpeed * 1.1);
      p.vx = dir * Math.min(sp, p.maxSpeed * FLUTTER_VX_CAP);
      p.flutterTicks = FLUTTER_ANIM_TICKS;
      emit(sim, { t: "sfx", name: "boingSmall", pitch: 1.35 });
      break;
    }
    case "fart": {
      // Granny Mae: beans at every meal. The blast scoots her sideways
      // farther than any double jump, bowls over whatever varmint was
      // nipping at her heels, and hangs a little green cloud of shame
      // where the deed was done.
      p.vx = p.facing * FART_VX;
      p.vy = Math.min(p.vy, FART_LIFT_VY);
      for (const e of sim.enemies) {
        if (
          Math.abs(e.x - p.x) < FART_BLAST_R &&
          Math.abs(e.y - p.y) < FART_BLAST_R
        ) {
          flingEnemy(sim, e, p.index, -p.facing, 0.8);
        }
      }
      sim.zones.push({
        id: sim.nextId++,
        kind: "skunk",
        x: p.x - p.facing * 22 - FART_CLOUD_W / 2,
        y: p.y - 14,
        w: FART_CLOUD_W,
        h: 13,
        ticks: FART_CLOUD_TICKS,
        spreading: false,
      });
      emit(sim, { t: "sfx", name: "fart", pan: (p.x / FIELD_W) * 2 - 1 });
      emit(sim, { t: "burst", text: "TOOT!", x: p.x - p.facing * 20, y: p.y - 8, palette: "Toxic" });
      break;
    }
    case "jugblast": {
      // Cooter: he rockets up, the lit jug goes the other way. Real jug:
      // it clonks varmints on the drop and smashes into a fire pool that
      // burns everybody — Cooter included. He knows.
      p.vy = JUGBLAST_VY;
      sim.projectiles.push({
        id: sim.nextId++,
        kind: "jug",
        hostile: false,
        owner: p.index,
        x: p.x,
        y: p.y - P_HEIGHT * 0.4,
        vx: 0,
        vy: JUGBLAST_JUG_VY,
        ticks: 6 * TICK_HZ,
        data: 0,
        power: 1, // pool width TILE*3
      });
      emit(sim, { t: "sfx", name: "boom", pitch: 1.35 });
      emit(sim, { t: "burst", text: "FWOOSH!", x: p.x, y: p.y + 22, palette: "Inferno" });
      break;
    }
    case "wildride": {
      // Grandpappy Zeke: the sky owes him one, but nobody said which one.
      // A beat of crackle (stepPlayer holds him still), then launchWildRide
      // rolls the table below.
      p.wildCharge = WILD_CHARGE_TICKS;
      emit(sim, { t: "sfx", name: "charge", pitch: 1.4 });
      break;
    }
    default: {
      // Earl: the honest standard double jump, exactly as advertised.
      p.vy = p.jumpVy * P_AIR_JUMP_MULT;
      emit(sim, { t: "sfx", name: "jump", pitch: 1.18 });
    }
  }
}

// ------------------------------------------------------------ Bobbie Sue
/**
 * One putt of the scattergun (stepPlayer fires these on a cadence while
 * JUMP is held and the tank has wind): a token of lift tuned to a slow
 * net SINK, a shove the way she's facing, and a real pellet out the muzzle.
 */
export function sputterPuff(sim: Sim, p: PlayerState): void {
  p.vy = Math.min(p.vy, SPUTTER_VY);
  const cap = p.maxSpeed * SPUTTER_VX_CAP;
  p.vx = Math.max(-cap, Math.min(cap, p.vx + p.facing * SPUTTER_VX));
  p.anim = "blow";
  p.animLock = 6;
  sim.projectiles.push({
    id: sim.nextId++,
    kind: "pellet",
    hostile: false,
    owner: p.index,
    x: p.x,
    y: p.y - P_HEIGHT * 0.3,
    vx: (sim.rng() - 0.5) * 1.6,
    vy: 6.4,
    ticks: 40,
    data: 0,
    power: 2,
  });
  emit(sim, {
    t: "sfx",
    name: "scattergun",
    pitch: 1.45 + sim.rng() * 0.2,
    pan: (p.x / FIELD_W) * 2 - 1,
  });
}

// ------------------------------------------------------------ Zeke
/**
 * Zeke's slot machine. Weights are integer percents (sum 100). Every launch
 * burns exactly three rng draws — row, direction, jitter — whatever the row
 * lands, so lockstep peers and replays stay in phase. The Dud is what makes
 * the Big One funny; Seventh Strike is the old bolt, demoted to jackpot.
 */
const WILD_TABLE = [
  { key: "dud", w: 15, vx: 0, vy: -1.5, text: "...HUH.", sfx: "windFail", pitch: 0.8 },
  { key: "sideways", w: 22, vx: 8.8, vy: -1.0, text: "WHOA NELLY!", sfx: "boing", pitch: 0.9 },
  { key: "corkscrew", w: 20, vx: 5.0, vy: -6.0, text: "WHICHAWAY?!", sfx: "boing", pitch: 1.15 },
  { key: "moonshot", w: 15, vx: 0.8, vy: -13.0, text: "MOON SHOT!", sfx: "boom", pitch: 1.5 },
  { key: "faceplant", w: 12, vx: 1.5, vy: 9.0, text: "OH NO.", sfx: "boing", pitch: 0.6 },
  { key: "bigone", w: 13, vx: 8.5, vy: -9.0, text: "YEEEEHAW!", sfx: "boom", pitch: 1.2 },
  { key: "seventh", w: 3, vx: 0, vy: BOLT_VY, text: "SEVENTH STRIKE!", sfx: "boltHit", pitch: 0.9 },
] as const;

/** The crackle ended: roll the table and let fly (stepPlayer calls this). */
export function launchWildRide(sim: Sim, p: PlayerState): void {
  // three draws, always, so the rng stream length never depends on the row
  const rRow = sim.rng();
  const rDir = sim.rng();
  const rJit = sim.rng();
  let row: (typeof WILD_TABLE)[number] = WILD_TABLE[0];
  let acc = 0;
  const target = rRow * 100;
  for (const r of WILD_TABLE) {
    acc += r.w;
    if (target < acc) {
      row = r;
      break;
    }
  }
  const dir = rDir < 0.5 ? -1 : 1;
  const jit = 0.9 + rJit * 0.2;
  p.vx = dir * row.vx * jit;
  p.vy = row.vy * jit;
  if (p.vx !== 0) p.facing = p.vx < 0 ? -1 : 1;
  p.grounded = false;
  p.wildTicks = WILD_RIDE_TICKS;
  if (row.key === "seventh") fireSeventhStrike(sim, p);
  if (row.key === "dud") emit(sim, { t: "balloon", player: p.index, trigger: "wildride" });
  emit(sim, { t: "sfx", name: row.sfx, pitch: row.pitch, pan: (p.x / FIELD_W) * 2 - 1 });
  emit(sim, {
    t: "burst",
    text: row.text,
    x: p.x,
    y: p.y - P_HEIGHT - 12,
    big: row.key === "seventh" || row.key === "bigone",
    palette: row.key === "seventh" ? "Electric" : undefined,
  });
}

/** The jackpot: the old seventh strike, exactly as it was. Zaps the yard,
 *  chains a real bolt, jolts a boss in range. */
function fireSeventhStrike(sim: Sim, p: PlayerState): void {
  for (const e of sim.enemies) {
    if (e.phase.kind !== "normal") continue;
    const d2 = (e.x - p.x) * (e.x - p.x) + (e.y - p.y) * (e.y - p.y);
    if (d2 < BOLT_RADIUS * BOLT_RADIUS) {
      e.hp -= BOLT_DMG;
      e.hitFlash = 10;
      if (e.hp <= 0) killEnemyByWeapon(sim, e, p.index, 0);
    }
  }
  const boss = sim.boss;
  if (boss && !boss.dead && boss.invuln <= 0) {
    const d = Math.hypot(boss.x - p.x, boss.y - p.y);
    if (d < BOLT_RADIUS + 60) {
      boss.hp -= BOLT_DMG;
      boss.hitFlash = 8;
      emit(sim, { t: "sfx", name: "bossHit" });
    }
  }
  sim.projectiles.push({
    id: sim.nextId++,
    kind: "bolt",
    hostile: false,
    owner: p.index,
    x: p.x,
    y: p.y - 20,
    vx: 0,
    vy: 0,
    ticks: 14,
    data: 1, // one chain jump
    power: 2,
  });
  emit(sim, { t: "flash", color: 0xcfe8ff });
  emit(sim, { t: "shake", power: 2 });
}
