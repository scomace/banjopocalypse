// Enemy archetypes. Every world enemy is one of eight engine behaviors plus
// a skin and a twist parameter; anger (+40% speed, red tint) layers on top.
// All enemies are original BANJOPOCALYPSE critters.

import { rangeInt } from "../core/rng";
import type { EnemyKind } from "../levels/types";
import {
  ANGRY_SPEED_MULT,
  E_GRAVITY,
  E_MAX_FALL,
  FIELD_H,
  FIELD_W,
  P_HEIGHT,
  P_WIDTH,
  SCORE_WEAPON_KILL,
  TICK_HZ,
  TILE,
  TRAP_ARC_TICKS,
} from "./constants";
import { circleOverlapsBox, groundAhead, moveBody, standingOnGround } from "./physics";
import type { Enemy, Sim } from "./types";
import { emit, hurtPlayer, score } from "./sim";
import { spawnFood } from "./items";
import { stepFlungEnemy } from "./hook";

type Archetype =
  | "walker"
  | "hopper"
  | "floater"
  | "charger"
  | "shooter"
  | "shielded"
  | "splitter"
  | "erratic";

export type EnemySpec = {
  archetype: Archetype;
  speed: number;
  hp: number;
  /** twist parameter meaning depends on archetype */
  twist: number;
};

export const ENEMY_SPECS: Record<EnemyKind, EnemySpec> = {
  radpossum: { archetype: "walker", speed: 0.75, hp: 3, twist: 0 },
  jackalope: { archetype: "hopper", speed: 1.0, hp: 3, twist: 0 },
  cartgator: { archetype: "charger", speed: 0.7, hp: 4, twist: 3.4 }, // dash speed
  fanbat: { archetype: "floater", speed: 0.9, hp: 3, twist: 0.4 },
  tweekergecko: { archetype: "erratic", speed: 1.5, hp: 3, twist: 0 },
  gaswisp: { archetype: "floater", speed: 0.7, hp: 2, twist: 1 }, // 1 = detonates on pop
  corndoghound: { archetype: "charger", speed: 0.85, hp: 4, twist: 4.0 },
  balloonclown: { archetype: "shooter", speed: 0.55, hp: 3, twist: 1 }, // 1 = floats
  skeeter: { archetype: "floater", speed: 1.35, hp: 2, twist: 0.8 },
  snapturtle: { archetype: "shielded", speed: 0.55, hp: 5, twist: 0 },
  tirefireimp: { archetype: "hopper", speed: 1.2, hp: 3, twist: 1 }, // fiery hops
  mufflersnake: { archetype: "walker", speed: 1.05, hp: 4, twist: 1 }, // long body
  glowslime: { archetype: "splitter", speed: 0.7, hp: 3, twist: 2 }, // splits into 2
  glowslime_mini: { archetype: "erratic", speed: 1.6, hp: 1, twist: 0 },
  guvdrone: { archetype: "shooter", speed: 0.8, hp: 3, twist: 2 }, // 2 = flies
  cyclonechick: { archetype: "floater", speed: 1.5, hp: 2, twist: 1.1 },
  flyincow: { archetype: "charger", speed: 0.75, hp: 5, twist: 3.2 }, // aerial charger
  impfiddler: { archetype: "shooter", speed: 0.9, hp: 3, twist: 3 }, // 3-shot spread
  hellhound: { archetype: "charger", speed: 1.1, hp: 4, twist: 4.6 },
};

export function spawnEnemy(sim: Sim, kind: EnemyKind, x: number, y: number): Enemy {
  const spec = ENEMY_SPECS[kind];
  const flying =
    spec.archetype === "floater" ||
    (kind === "guvdrone") ||
    (kind === "balloonclown") ||
    (kind === "flyincow");
  return {
    id: sim.nextId++,
    kind,
    x,
    y,
    vx: 0,
    vy: 0,
    facing: sim.rng() < 0.5 ? -1 : 1,
    grounded: false,
    angry: false,
    phase: { kind: "normal" },
    hp: spec.hp,
    stateTimer: rangeInt(sim.rng, 30, 140),
    mode: 0,
    homeY: y,
    flying,
    shielded: spec.archetype === "shielded",
    hitFlash: 0,
    flung: 0,
    flungBy: 0,
    leash: null,
  };
}

function nearestPlayer(sim: Sim, x: number, y: number) {
  let best: (typeof sim.players)[number] | null = null;
  let bestD = Infinity;
  for (const p of sim.players) {
    if (!p.alive) continue;
    const d = Math.abs(p.x - x) + Math.abs(p.y - y);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

function stepOne(sim: Sim, e: Enemy): boolean {
  if (e.hitFlash > 0) e.hitFlash--;

  if (e.phase.kind === "trapped") return true; // bubble drives position

  if (e.phase.kind === "dying") {
    // arc toward the food landing spot (or the boss, as a projectile)
    e.phase.ticks++;
    const t = e.phase.ticks / TRAP_ARC_TICKS;
    if (t >= 1) {
      if (e.phase.toBoss && sim.boss && !sim.boss.dead) {
        sim.boss.hp -= 8 + e.phase.chain * 2;
        sim.boss.hitFlash = 12;
        emit(sim, { t: "sfx", name: "bossHit" });
        emit(sim, { t: "shake", power: 4 });
        emit(sim, {
          t: "burst",
          text: "WALLOP!",
          x: sim.boss.x,
          y: sim.boss.y - 60,
        });
      } else {
        spawnFood(sim, e.phase.targetX, e.phase.targetY, e.phase.chain, 0);
      }
      // gas wisp detonation on pop
      if (ENEMY_SPECS[e.kind].twist === 1 && e.kind === "gaswisp") {
        sim.zones.push({
          id: sim.nextId++,
          kind: "fire",
          x: e.phase.targetX - TILE,
          y: e.phase.targetY - TILE,
          w: TILE * 2,
          h: TILE,
          ticks: 2 * TICK_HZ,
          spreading: false,
        });
        emit(sim, { t: "sfx", name: "boom" });
      }
      // splitter spawns minis where it lands
      if (ENEMY_SPECS[e.kind].archetype === "splitter") {
        for (let i = 0; i < ENEMY_SPECS[e.kind].twist; i++) {
          const mini = spawnEnemy(sim, "glowslime_mini", e.phase.targetX + (i ? 14 : -14), e.phase.targetY - 6);
          mini.angry = e.angry;
          sim.enemies.push(mini);
        }
      }
      return false;
    }
    const u = t;
    const arcH = 120 + e.phase.chain * 10;
    e.x = e.x + (e.phase.targetX - e.x) * (u * 0.35);
    e.y =
      e.y + (e.phase.targetY - e.y) * (u * 0.35) - Math.sin(u * Math.PI) * (arcH / TRAP_ARC_TICKS) * 6;
    return true;
  }

  // sent flying by the Fishin' Line: tumble, harmless, until it lands
  if (e.flung > 0) {
    stepFlungEnemy(sim, e);
    return true;
  }

  // -------- normal behavior --------
  const spec = ENEMY_SPECS[e.kind];
  const speed = spec.speed * (e.angry ? ANGRY_SPEED_MULT : 1);
  const target = nearestPlayer(sim, e.x, e.y);
  e.stateTimer--;

  switch (spec.archetype) {
    case "walker": {
      e.vx = e.facing * speed;
      if (!groundAhead(sim.level, e.x, e.y, e.facing, 16) && e.grounded) {
        // hop gaps sometimes, else turn (guardians never leave their perch)
        if (!e.leash && sim.rng() < 0.35) {
          e.vy = -5.4;
          e.grounded = false;
        } else {
          e.facing = -e.facing as 1 | -1;
        }
      }
      break;
    }
    case "hopper": {
      if (e.grounded) {
        e.vx = 0;
        if (e.stateTimer <= 0) {
          e.stateTimer = rangeInt(sim.rng, 40, 90);
          const dir = target ? Math.sign(target.x - e.x) || e.facing : e.facing;
          e.facing = dir as 1 | -1;
          e.vx = dir * speed * 1.7;
          e.vy = -6.2 - sim.rng() * 1.4;
          e.grounded = false;
        }
      }
      break;
    }
    case "floater": {
      const t2 = target;
      const wobble = Math.sin((sim.tick + e.id * 37) / 26) * spec.twist;
      if (t2) {
        const dx = t2.x - e.x;
        const dy = t2.y - P_HEIGHT / 2 - e.y;
        const len = Math.hypot(dx, dy) || 1;
        e.vx += ((dx / len) * speed - e.vx) * 0.03;
        e.vy += ((dy / len) * speed * 0.8 + wobble * 0.15 - e.vy) * 0.03;
      }
      e.x += e.vx;
      e.y += e.vy;
      e.facing = (e.vx >= 0 ? 1 : -1) as 1 | -1;
      if (e.x < 24) e.x = 24;
      if (e.x > FIELD_W - 24) e.x = FIELD_W - 24;
      if (e.y < 30) e.y = 30;
      if (e.y > FIELD_H - 8) e.y -= FIELD_H - 30;
      break;
    }
    case "charger": {
      if (e.mode === 1) {
        // dashing
        e.vx = e.facing * spec.twist * (e.angry ? ANGRY_SPEED_MULT : 1);
        if (e.stateTimer <= 0 || (e.grounded && !groundAhead(sim.level, e.x, e.y, e.facing, 18))) {
          e.mode = 0;
          e.stateTimer = rangeInt(sim.rng, 60, 130);
        }
      } else {
        e.vx = e.facing * speed;
        if (e.grounded && !groundAhead(sim.level, e.x, e.y, e.facing, 16)) {
          e.facing = -e.facing as 1 | -1;
        }
        // spot a player on roughly the same row -> charge
        if (
          target &&
          Math.abs(target.y - e.y) < TILE * 1.4 &&
          Math.sign(target.x - e.x) === e.facing &&
          e.stateTimer <= 0
        ) {
          e.mode = 1;
          e.stateTimer = rangeInt(sim.rng, 40, 70);
          emit(sim, { t: "sfx", name: "charge" });
        }
      }
      if (e.kind === "flyincow") {
        // aerial charger: hovers, then swoops
        e.y += Math.sin((sim.tick + e.id * 53) / 30) * 0.6;
        if (e.mode === 1 && target) e.y += Math.sign(target.y - P_HEIGHT / 2 - e.y) * 1.1;
        e.x += e.vx * 0.55;
        if (e.x < 24 || e.x > FIELD_W - 24) e.facing = -e.facing as 1 | -1;
        return liveChecks(sim, e);
      }
      break;
    }
    case "shooter": {
      const flies = spec.twist === 2 || e.kind === "balloonclown";
      if (flies) {
        e.y = e.homeY + Math.sin((sim.tick + e.id * 41) / 40) * 18;
        e.x += e.facing * speed * 0.7;
        if (e.x < 30 || e.x > FIELD_W - 30) e.facing = -e.facing as 1 | -1;
      } else {
        e.vx = e.facing * speed * 0.7;
        if (e.grounded && !groundAhead(sim.level, e.x, e.y, e.facing, 16)) {
          e.facing = -e.facing as 1 | -1;
        }
      }
      if (e.stateTimer <= 0 && target) {
        e.stateTimer = rangeInt(sim.rng, 130, 220);
        const shots = e.kind === "impfiddler" ? 3 : 1;
        for (let i = 0; i < shots; i++) {
          const dx = target.x - e.x;
          const dy = target.y - P_HEIGHT / 2 - e.y;
          const len = Math.hypot(dx, dy) || 1;
          const spread = (i - (shots - 1) / 2) * 0.35;
          const angle = Math.atan2(dy, dx) + spread;
          sim.projectiles.push({
            id: sim.nextId++,
            kind: "enemyshot",
            hostile: true,
            owner: 0,
            x: e.x,
            y: e.y - 12,
            vx: Math.cos(angle) * 2.4,
            vy: Math.sin(angle) * 2.4,
            ticks: 5 * TICK_HZ,
            data: 0,
            power: 0,
          });
        }
        emit(sim, { t: "sfx", name: "enemyShoot" });
      }
      if (flies) return liveChecks(sim, e);
      break;
    }
    case "shielded": {
      e.vx = e.facing * speed;
      if (e.grounded && !groundAhead(sim.level, e.x, e.y, e.facing, 16)) {
        e.facing = -e.facing as 1 | -1;
      }
      // face the nearest player: shields only trap from behind
      if (target && e.stateTimer <= 0) {
        e.stateTimer = 50;
        e.facing = (Math.sign(target.x - e.x) || e.facing) as 1 | -1;
      }
      break;
    }
    case "splitter": {
      e.vx = e.facing * speed;
      if (e.grounded && !groundAhead(sim.level, e.x, e.y, e.facing, 14)) {
        e.facing = -e.facing as 1 | -1;
      }
      if (e.grounded && e.stateTimer <= 0) {
        e.stateTimer = rangeInt(sim.rng, 90, 160);
        e.vy = -4.6;
      }
      break;
    }
    case "erratic": {
      if (e.stateTimer <= 0) {
        e.stateTimer = rangeInt(sim.rng, 20, 55);
        const roll = sim.rng();
        if (roll < 0.45) e.facing = -e.facing as 1 | -1;
        else if (roll < 0.7 && e.grounded) e.vy = -(4.5 + sim.rng() * 2.4);
      }
      e.vx = e.facing * speed;
      break;
    }
  }

  // gravity + tile movement for grounded archetypes
  if (!e.flying || e.kind === "flyincow") {
    if (!e.flying) {
      e.vy = Math.min(e.vy + E_GRAVITY, E_MAX_FALL);
      const moved = moveBody(sim.level, e.x, e.y, e.vx, e.vy, 24, 26);
      e.x = moved.x;
      e.y = moved.y;
      e.vy = moved.vy;
      e.grounded = moved.grounded || standingOnGround(sim.level, e.x, e.y, 24);
      if (moved.hitWall) e.facing = -e.facing as 1 | -1;
    }
  }

  return liveChecks(sim, e);
}

/** Shrine guardians pace a box around their pedestal; the box wins. */
function applyLeash(e: Enemy): void {
  const l = e.leash;
  if (!l) return;
  if (e.x > l.x + l.r) {
    e.x = l.x + l.r;
    e.facing = -1;
    if (e.vx > 0) e.vx = -e.vx;
    if (e.mode === 1) e.mode = 0; // a charger's dash ends at the fence
  } else if (e.x < l.x - l.r) {
    e.x = l.x - l.r;
    e.facing = 1;
    if (e.vx < 0) e.vx = -e.vx;
    if (e.mode === 1) e.mode = 0;
  }
  if (e.flying) {
    if (e.y > l.y + l.r) {
      e.y = l.y + l.r;
      if (e.vy > 0) e.vy = -e.vy * 0.5;
    } else if (e.y < l.y - l.r) {
      e.y = l.y - l.r;
      if (e.vy < 0) e.vy = -e.vy * 0.5;
    }
  }
}

function liveChecks(sim: Sim, e: Enemy): boolean {
  if (e.leash) applyLeash(e);
  // player contact
  for (const p of sim.players) {
    if (!p.alive || p.invuln > 0) continue;
    if (p.prayer > 0) {
      // prayer glow roasts enemies on contact
      if (circleOverlapsBox(e.x, e.y - 12, 20, p.x, p.y, P_WIDTH + 10, P_HEIGHT)) {
        killEnemyByWeapon(sim, e, p.index, 99);
        return false;
      }
      continue;
    }
    if (circleOverlapsBox(e.x, e.y - 12, 13, p.x, p.y, P_WIDTH, P_HEIGHT - 6)) {
      hurtPlayer(sim, p);
    }
  }
  return true;
}

export function stepEnemies(sim: Sim): void {
  sim.enemies = sim.enemies.filter((e) => stepOne(sim, e));
}

/** A frenzy weapon (or hazard zone) kills an enemy outright. */
export function killEnemyByWeapon(
  sim: Sim,
  e: Enemy,
  by: 0 | 1,
  power: number,
): void {
  if (e.phase.kind === "dying") return;
  e.hp -= power;
  e.hitFlash = 8;
  if (e.hp > 0) {
    emit(sim, { t: "sfx", name: "thwack", pitch: 0.9 + sim.rng() * 0.2 });
    return;
  }
  // if trapped, pop its bubble too
  if (e.phase.kind === "trapped") {
    const b = sim.bubbles.find(
      (bb) => e.phase.kind === "trapped" && bb.id === e.phase.bubbleId,
    );
    if (b) b.rides = 999;
  }
  score(sim, by, SCORE_WEAPON_KILL);
  e.phase = {
    kind: "dying",
    ticks: 0,
    targetX: 60 + sim.rng() * (FIELD_W - 120),
    targetY: FIELD_H - TILE * 1.5,
    chain: 0,
    toBoss: !!(sim.boss && !sim.boss.dead),
  };
  if (sim.boss && !sim.boss.dead) {
    e.phase = { ...e.phase, targetX: sim.boss.x, targetY: sim.boss.y };
  }
  emit(sim, { t: "sfx", name: "weaponKill", pitch: 0.9 + sim.rng() * 0.3 });
}
