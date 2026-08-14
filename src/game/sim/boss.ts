// The nine bosses. One framework: HP bar, phases, minion spawns, contact
// damage, pattern modes on timers; per-boss update hooks give each fight its
// own personality. Damage comes mostly from popped-minion wallops (see
// enemies.ts dying arc), chipped by frenzy weapons.
//
// Level 99 is OL' SCRATCH, three phases, ending in the banjo duel: his fiddle
// notes can be bubbled mid-flight (they ride bubbles like enemies would) and
// popping a note-bubble fires the note BACK at him on the beat.

import type { EnemyKind } from "../levels/types";
import {
  FIELD_H,
  FIELD_W,
  P_HEIGHT,
  P_WIDTH,
  TICK_HZ,
  TILE,
} from "./constants";
import { circleOverlapsBox } from "./physics";
import type { BossState, Sim } from "./types";
import { emit } from "./sim";
import * as simMod from "./sim";
import { spawnEnemy } from "./enemies";

type BossSpec = {
  hp: number;
  w: number;
  h: number;
  minions: EnemyKind[];
  minionCap: number;
  contactRadius: number;
};

const BOSS_SPECS: Record<string, BossSpec> = {
  bertha: { hp: 120, w: 130, h: 100, minions: ["radpossum", "jackalope"], minionCap: 4, contactRadius: 58 },
  catfish: { hp: 150, w: 150, h: 90, minions: ["cartgator", "fanbat"], minionCap: 4, contactRadius: 62 },
  chemist: { hp: 170, w: 110, h: 110, minions: ["tweekergecko", "gaswisp"], minionCap: 5, contactRadius: 52 },
  kernel: { hp: 190, w: 120, h: 130, minions: ["corndoghound", "balloonclown"], minionCap: 5, contactRadius: 56 },
  swampthang: { hp: 210, w: 140, h: 120, minions: ["skeeter", "snapturtle"], minionCap: 5, contactRadius: 60 },
  bigrig: { hp: 230, w: 190, h: 90, minions: ["tirefireimp", "mufflersnake"], minionCap: 5, contactRadius: 80 },
  meltdownmel: { hp: 250, w: 130, h: 140, minions: ["glowslime", "guvdrone"], minionCap: 6, contactRadius: 58 },
  beefnado: { hp: 270, w: 120, h: 160, minions: ["cyclonechick", "flyincow"], minionCap: 6, contactRadius: 64 },
  olscratch: { hp: 320, w: 110, h: 130, minions: ["impfiddler", "hellhound"], minionCap: 5, contactRadius: 54 },
};

export function bossSpec(id: string): BossSpec {
  return BOSS_SPECS[id] ?? BOSS_SPECS.bertha;
}

export function createBoss(id: string, name: string): BossState {
  const spec = bossSpec(id);
  return {
    id,
    name,
    x: FIELD_W / 2,
    y: TILE * 5,
    vx: 0,
    vy: 0,
    hp: spec.hp,
    maxHp: spec.hp,
    phase: 1,
    phaseTimer: 0,
    mode: 0,
    modeTimer: 3 * TICK_HZ,
    facing: -1,
    hitFlash: 0,
    invuln: 0,
    dead: false,
    deathTicks: 0,
    duel: id === "olscratch" ? { beat: 0, notesReturned: 0 } : null,
  };
}

function spawnMinions(sim: Sim, boss: BossState, count: number): void {
  const spec = bossSpec(boss.id);
  const live = sim.enemies.filter((e) => e.phase.kind !== "dying").length;
  for (let i = 0; i < count && live + i < spec.minionCap; i++) {
    const kind = spec.minions[Math.floor(sim.rng() * spec.minions.length)];
    const e = spawnEnemy(sim, kind, boss.x + (sim.rng() - 0.5) * 120, boss.y + 30);
    e.vy = -3;
    sim.enemies.push(e);
  }
  emit(sim, { t: "sfx", name: "minionSpawn" });
}

function fireNote(sim: Sim, boss: BossState, hostile: boolean, tx: number, ty: number): void {
  const dx = tx - boss.x;
  const dy = ty - boss.y;
  const len = Math.hypot(dx, dy) || 1;
  sim.projectiles.push({
    id: sim.nextId++,
    kind: "note",
    hostile,
    owner: 0,
    x: boss.x,
    y: boss.y,
    vx: (dx / len) * 2.2,
    vy: (dy / len) * 2.2,
    ticks: 7 * TICK_HZ,
    data: 0,
    power: 10,
  });
}

export function stepBoss(sim: Sim): void {
  const boss = sim.boss;
  if (!boss) return;
  const spec = bossSpec(boss.id);

  if (boss.dead) {
    boss.deathTicks++;
    boss.y += Math.sin(boss.deathTicks / 6) * 0.8;
    if (boss.deathTicks % 12 === 0) {
      emit(sim, {
        t: "burst",
        text: boss.deathTicks % 24 === 0 ? "BOOM!" : "POW!",
        x: boss.x + (sim.rng() - 0.5) * spec.w,
        y: boss.y + (sim.rng() - 0.5) * spec.h,
      });
      emit(sim, { t: "sfx", name: "boom" });
    }
    return;
  }

  if (boss.hitFlash > 0) boss.hitFlash--;
  if (boss.invuln > 0) boss.invuln--;
  boss.phaseTimer++;
  boss.modeTimer--;

  // phase transitions at 2/3 and 1/3 HP
  const phaseNow = boss.hp > boss.maxHp * 0.66 ? 1 : boss.hp > boss.maxHp * 0.33 ? 2 : 3;
  if (phaseNow > boss.phase) {
    boss.phase = phaseNow;
    boss.invuln = TICK_HZ;
    emit(sim, { t: "sfx", name: "bossPhase" });
    emit(sim, { t: "shake", power: 7 });
    emit(sim, {
      t: "burst",
      text: phaseNow === 2 ? "NOW HE'S MAD!" : "FINAL FORM!",
      x: boss.x,
      y: boss.y - spec.h,
      big: true,
    });
    spawnMinions(sim, boss, 2);
  }

  const target = sim.players.find((p) => p.alive) ?? null;
  const speedUp = 1 + (boss.phase - 1) * 0.35;

  // ---- movement personalities ----
  switch (boss.id) {
    case "bertha": {
      // wall-to-wall charges along the floor, hops between
      if (boss.mode === 0) {
        boss.vx = boss.facing * 1.6 * speedUp;
        boss.y = FIELD_H - TILE - spec.h / 2 + Math.sin(sim.tick / 9) * 3;
        if (boss.x < spec.w / 2 + 8 || boss.x > FIELD_W - spec.w / 2 - 8) {
          boss.facing = -boss.facing as 1 | -1;
          emit(sim, { t: "shake", power: 5 });
          emit(sim, { t: "sfx", name: "wallSlam" });
          if (sim.rng() < 0.5) spawnMinions(sim, boss, 1);
        }
      }
      break;
    }
    case "catfish": {
      // surfaces and dives through a waterline; gulps bubbles when surfaced
      const surfaceY = FIELD_H - TILE * 4;
      const diveY = FIELD_H + spec.h;
      if (boss.modeTimer <= 0) {
        boss.mode = boss.mode === 0 ? 1 : 0;
        boss.modeTimer = (boss.mode === 1 ? 4 : 2.4) * TICK_HZ;
        if (boss.mode === 1) {
          boss.x = target ? target.x : FIELD_W / 2;
          emit(sim, { t: "sfx", name: "splash" });
        }
      }
      const ty = boss.mode === 1 ? surfaceY : diveY;
      boss.y += (ty - boss.y) * 0.06;
      // gulp: while surfaced, nearby bubbles get eaten (and he takes damage from trapped ones)
      if (boss.mode === 1) {
        for (const b of sim.bubbles) {
          if (Math.abs(b.x - boss.x) < spec.w && Math.abs(b.y - boss.y) < spec.h) {
            if (b.state.kind === "trapped") {
              boss.hp -= 6;
              boss.hitFlash = 8;
              emit(sim, { t: "sfx", name: "bossHit" });
              emit(sim, { t: "burst", text: "GULP-OW!", x: boss.x, y: boss.y - 50 });
            }
            b.rides = 999;
          }
        }
      }
      break;
    }
    case "chemist": {
      // teleport-scurries between corners, floods the floor with fumes
      if (boss.modeTimer <= 0) {
        boss.modeTimer = (3.2 - boss.phase * 0.5) * TICK_HZ;
        boss.x = 100 + sim.rng() * (FIELD_W - 200);
        boss.y = TILE * (3 + sim.rng() * 6);
        emit(sim, { t: "sfx", name: "teleport" });
        if (sim.rng() < 0.4 + boss.phase * 0.15) {
          sim.zones.push({
            id: sim.nextId++,
            kind: "skunk",
            x: boss.x - TILE * 2,
            y: FIELD_H - TILE * 2,
            w: TILE * 4,
            h: TILE * 2,
            ticks: 3 * TICK_HZ,
            spreading: false,
          });
        }
        if (sim.rng() < 0.5) spawnMinions(sim, boss, 1);
      }
      break;
    }
    case "kernel": {
      // bounces around; each floor hit pops popcorn (minions)
      boss.vy += 0.18;
      boss.x += boss.vx || (boss.vx = 1.4);
      boss.y += boss.vy;
      if (boss.x < spec.w / 2 || boss.x > FIELD_W - spec.w / 2) boss.vx *= -1;
      if (boss.y > FIELD_H - TILE - spec.h / 2) {
        boss.y = FIELD_H - TILE - spec.h / 2;
        boss.vy = -(6 + boss.phase);
        emit(sim, { t: "shake", power: 4 });
        emit(sim, { t: "sfx", name: "kernelBounce" });
        if (sim.rng() < 0.45) spawnMinions(sim, boss, 1);
      }
      break;
    }
    case "swampthang": {
      // sits center-bottom, sweeps vine arms (washarc-style hostile sweeps)
      boss.x = FIELD_W / 2 + Math.sin(sim.tick / 90) * 140;
      boss.y = FIELD_H - TILE - spec.h / 2;
      if (boss.modeTimer <= 0 && target) {
        boss.modeTimer = (2.6 - boss.phase * 0.4) * TICK_HZ;
        fireNote(sim, boss, true, target.x, target.y - P_HEIGHT / 2);
        emit(sim, { t: "sfx", name: "vineWhip" });
        if (sim.rng() < 0.5) spawnMinions(sim, boss, 1);
      }
      break;
    }
    case "bigrig": {
      // circles the screen wrap: drives across the floor, reappears from the top rows
      boss.vx = boss.facing * (2.4 + boss.phase * 0.5);
      boss.x += boss.vx;
      if (boss.x > FIELD_W + spec.w) {
        boss.x = -spec.w;
        boss.y = boss.y > FIELD_H / 2 ? TILE * 4 : FIELD_H - TILE - spec.h / 2;
        spawnMinions(sim, boss, 1);
      } else if (boss.x < -spec.w) {
        boss.x = FIELD_W + spec.w;
        boss.y = boss.y > FIELD_H / 2 ? TILE * 4 : FIELD_H - TILE - spec.h / 2;
        spawnMinions(sim, boss, 1);
      }
      break;
    }
    case "meltdownmel": {
      // stands center, meltdown timer: periodic screen-flash slam unless chilled by pops
      boss.x = FIELD_W / 2;
      boss.y = FIELD_H - TILE - spec.h / 2;
      if (boss.modeTimer <= 0) {
        boss.modeTimer = (5 - boss.phase * 0.8) * TICK_HZ;
        emit(sim, { t: "flash", color: 0x40c8ff });
        emit(sim, { t: "shake", power: 8 });
        emit(sim, { t: "sfx", name: "meltdown" });
        emit(sim, { t: "burst", text: "MELTDOWN!", x: boss.x, y: boss.y - spec.h, big: true });
        // floor slam hurts grounded players
        for (const p of sim.players) {
          if (p.alive && p.grounded && p.invuln <= 0 && p.prayer <= 0) {
            simMod.hurtPlayer(sim, p);
          }
        }
        spawnMinions(sim, boss, 2);
      }
      break;
    }
    case "beefnado": {
      // wandering tornado that flings cows
      boss.x += Math.sin(sim.tick / 70) * (1.6 + boss.phase * 0.4);
      boss.y = TILE * 6 + Math.sin(sim.tick / 47) * TILE * 2;
      if (boss.modeTimer <= 0 && target) {
        boss.modeTimer = (2.2 - boss.phase * 0.3) * TICK_HZ;
        fireNote(sim, boss, true, target.x, target.y);
        emit(sim, { t: "sfx", name: "cowFling" });
        if (sim.rng() < 0.6) spawnMinions(sim, boss, 1);
      }
      break;
    }
    case "olscratch": {
      // P1: classic minion fight. P2: fiddle barrage. P3: THE BANJO DUEL.
      boss.x = FIELD_W / 2 + Math.sin(sim.tick / 80) * 180;
      boss.y = TILE * 4.5 + Math.sin(sim.tick / 53) * 14;
      if (boss.phase === 1) {
        if (boss.modeTimer <= 0) {
          boss.modeTimer = 3 * TICK_HZ;
          spawnMinions(sim, boss, 2);
        }
      } else if (boss.phase === 2) {
        if (boss.modeTimer <= 0 && target) {
          boss.modeTimer = Math.floor(1.4 * TICK_HZ);
          for (let i = -1; i <= 1; i++) {
            fireNote(sim, boss, true, target.x + i * 90, target.y - P_HEIGHT / 2);
          }
          emit(sim, { t: "sfx", name: "devilFiddle" });
        }
      } else if (boss.duel) {
        // P3 duel: notes come on the beat; bubbles can catch them (bubble
        // launch overlapping a hostile note converts it to a friendly return)
        boss.duel.beat++;
        if (boss.duel.beat % Math.max(30, 54 - boss.phase * 6) === 0 && target) {
          fireNote(sim, boss, true, target.x, target.y - P_HEIGHT / 2);
          emit(sim, { t: "sfx", name: "duelNote" });
        }
        for (const pr of sim.projectiles) {
          if (pr.kind !== "note" || !pr.hostile) continue;
          for (const b of sim.bubbles) {
            if (b.state.kind !== "launch") continue;
            if (circleOverlapsBox(pr.x, pr.y, 14, b.x, b.y - 10, 26, 26)) {
              pr.hostile = false;
              pr.power = 14;
              const dx = boss.x - pr.x;
              const dy = boss.y - pr.y;
              const len = Math.hypot(dx, dy) || 1;
              pr.vx = (dx / len) * 5;
              pr.vy = (dy / len) * 5;
              boss.duel.notesReturned++;
              emit(sim, { t: "sfx", name: "noteReturn", pitch: 1 + (boss.duel.notesReturned % 5) * 0.12 });
              emit(sim, { t: "burst", text: "TWANG!", x: pr.x, y: pr.y - 18 });
              b.rides = 999;
            }
          }
        }
      }
      break;
    }
  }

  // shared: keep a minion floor on all bosses so pops always have ammo
  if (boss.phaseTimer % (6 * TICK_HZ) === 0) {
    const live = sim.enemies.filter((e) => e.phase.kind !== "dying").length;
    if (live === 0) spawnMinions(sim, boss, 2);
  }

  // contact damage
  for (const p of sim.players) {
    if (!p.alive || p.invuln > 0 || p.prayer > 0) continue;
    if (
      circleOverlapsBox(
        boss.x,
        boss.y,
        spec.contactRadius,
        p.x,
        p.y,
        P_WIDTH,
        P_HEIGHT,
      )
    ) {
      simMod.hurtPlayer(sim, p);
    }
  }

  // death
  if (boss.hp <= 0) {
    boss.hp = 0;
    boss.dead = true;
    boss.deathTicks = 0;
    // roast every remaining minion into food
    for (const e of sim.enemies) {
      if (e.phase.kind !== "dying") {
        e.phase = {
          kind: "dying",
          ticks: 0,
          targetX: 80 + sim.rng() * (FIELD_W - 160),
          targetY: FIELD_H - TILE * 1.5,
          chain: 2,
          toBoss: false,
        };
      }
    }
    emit(sim, { t: "sfx", name: "bossDefeat" });
    emit(sim, { t: "shake", power: 10 });
    emit(sim, {
      t: "burst",
      text: boss.id === "olscratch" ? "GIT OFF MY PORCH!" : "HOG-TIED!",
      x: boss.x,
      y: boss.y - spec.h,
      big: true,
    });
  }
}
