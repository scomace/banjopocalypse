// The kinfolk's one-shot air specials: what the second JUMP press does
// midair. stepPlayer gates the press (airborne, not swinging, special
// unspent) and calls fireAirSpecial once per airtime. Two specials do NOT
// live here because they aren't one-shot bursts: Buford's hook (hook.ts,
// hold-to-swing) and Darlene's possum chute (the glide clamp in stepPlayer,
// hold-to-drift).
//
// Attack specials ride the REAL systems, not bespoke damage loops: Cooter
// drops an actual jug (contact hits + fire pool on smash), Bobbie Sue fires
// actual pellets, Zeke's strike is an actual chaining bolt — so they all
// inherit projectile rendering, boss chipping, and score attribution.
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
  FLUTTER_ANIM_TICKS,
  FLUTTER_VX_CAP,
  FLUTTER_VX_MULT,
  FLUTTER_VY_MULT,
  JUGBLAST_JUG_VY,
  JUGBLAST_VY,
  P_AIR_JUMP_MULT,
  P_HEIGHT,
  RECOIL_PELLETS,
  RECOIL_VY,
  TICK_HZ,
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
      emit(sim, { t: "sfx", name: "skunk", pitch: 0.75 });
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
    case "recoil": {
      // Bobbie Sue: the scattergun fired straight down — the kick is the
      // jump, the pellets are real pellets, and she visibly shoulders it.
      p.vy = RECOIL_VY;
      p.anim = "blow";
      p.animLock = 12;
      for (let i = 0; i < RECOIL_PELLETS; i++) {
        const a = Math.PI / 2 + (i - (RECOIL_PELLETS - 1) / 2) * 0.22;
        sim.projectiles.push({
          id: sim.nextId++,
          kind: "pellet",
          hostile: false,
          owner: p.index,
          x: p.x,
          y: p.y - P_HEIGHT * 0.4,
          vx: Math.cos(a) * 6.4,
          vy: Math.sin(a) * 6.4,
          ticks: 40,
          data: 0,
          power: 2,
        });
      }
      emit(sim, { t: "sfx", name: "scattergun" });
      break;
    }
    case "bolt": {
      // Grandpappy Zeke: strikes one through six were luck; the seventh is
      // on demand. The shockwave zaps the yard, a real bolt cracks down on
      // his position and chains to the next varmint over, and a boss in
      // range takes the jolt too.
      p.vy = BOLT_VY;
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
      emit(sim, { t: "sfx", name: "boltHit", pitch: 0.9 });
      emit(sim, { t: "flash", color: 0xcfe8ff });
      emit(sim, { t: "shake", power: 2 });
      emit(sim, { t: "burst", text: "SEVENTH STRIKE!", x: p.x, y: p.y - P_HEIGHT - 14, palette: "Electric" });
      break;
    }
    default: {
      // Earl: the honest standard double jump, exactly as advertised.
      p.vy = p.jumpVy * P_AIR_JUMP_MULT;
      emit(sim, { t: "sfx", name: "jump", pitch: 1.18 });
    }
  }
}
