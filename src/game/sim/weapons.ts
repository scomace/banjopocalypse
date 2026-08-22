// The 12 frenzy weapons. Base play never auto-fires: these only run while a
// player's frenzy is live (mason jar grabbed). Level 1-5 scaling + an evolved
// form per weapon (run layer marks loadout.evolved when the card is taken).

import { rangeInt } from "../core/rng";
import {
  CAGE_H,
  CAGE_W,
  FIELD_H,
  FIELD_W,
  P_HEIGHT,
  P_WIDTH,
  TICK_HZ,
  TILE,
} from "./constants";
import { circleOverlapsBox, groundAhead, isSolidAt, moveBody, standingOnGround, tileAt } from "./physics";
import { T_PLATFORM, T_SOLID, T_SPIKES, type ParsedLevel } from "../levels/types";
import type { Enemy, Pet, PlayerState, Projectile, Sim } from "./types";
import { emit } from "./sim";
import { killEnemyByWeapon } from "./enemies";
import { hitCage } from "./cage";

export type WeaponDef = {
  id: string;
  name: string;
  evolvedName: string;
  desc: string;
  evolveTonic: string;
};

export const WEAPONS: WeaponDef[] = [
  { id: "goodbook", name: "Granny's Good Book", evolvedName: "King James Cyclone", desc: "Bibles orbit and smite.", evolveTonic: "spectacles" },
  { id: "twang", name: "Twang Wave", evolvedName: "Duelin' Banjos", desc: "Banjo chord shockwaves.", evolveTonic: "pickinfinger" },
  { id: "jug", name: "Moonshine Jug", evolvedName: "White Lightning", desc: "Lobbed jars, fire pools.", evolveTonic: "rocketfuel" },
  { id: "scattergun", name: "Cornholio", evolvedName: "Boomstick Bertha", desc: "Auto-blasts the nearest varmint.", evolveTonic: "grit" },
  { id: "possum", name: "Possum Posse", evolvedName: "Possum Stampede", desc: "Possums patrol and bite.", evolveTonic: "rabbitfoot" },
  { id: "jawharp", name: "Jaw Harp Boinger", evolvedName: "Boingpocalypse", desc: "Ricochetin' twang bolts.", evolveTonic: "lungbutter" },
  { id: "washboard", name: "Washboard Scrub", evolvedName: "Washboard Abs", desc: "Scrub 'em raw up close.", evolveTonic: "hogfat" },
  { id: "chicken", name: "Chicken Coop", evolvedName: "Fowl Weather", desc: "Attack hens cross the sky.", evolveTonic: "rabbitfoot" },
  { id: "spittoon", name: "Spittoon Special", evolvedName: "Long-Range Loogie", desc: "Arcin' chaw artillery.", evolveTonic: "lungbutter" },
  { id: "lightnin", name: "Lightnin' Rod", evolvedName: "Act of God", desc: "Bolts pick their own targets.", evolveTonic: "pickinfinger" },
  { id: "cousin", name: "Cousin Eddie", evolvedName: "Family Reunion", desc: "Kin runs in headbuttin'.", evolveTonic: "chaw" },
  { id: "hound", name: "Hound Dawg", evolvedName: "The Howlin'", desc: "Dog herds 'em into belches.", evolveTonic: "grit" },
];

export function weaponById(id: string): WeaponDef {
  const w = WEAPONS.find((x) => x.id === id);
  if (!w) throw new Error(`unknown weapon ${id}`);
  return w;
}

const dmgScale = (p: PlayerState) => (p.loadout.tonics.includes("grit") ? 1.5 : 1);

function nearestEnemy(sim: Sim, x: number, y: number): Enemy | null {
  let best: Enemy | null = null;
  let bestD = Infinity;
  for (const e of sim.enemies) {
    if (e.phase.kind !== "normal") continue;
    const d = (e.x - x) * (e.x - x) + (e.y - y) * (e.y - y);
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  return best;
}

function fireWeapon(sim: Sim, p: PlayerState): void {
  const f = p.frenzy;
  if (!f) return;
  const lvl = f.level;
  const evolved = p.loadout.evolved.includes(f.weapon);
  const cd = p.weaponCooldowns;
  const t = sim.tick;
  const power = Math.ceil((1 + lvl * 0.6) * dmgScale(p));
  const px = p.x;
  const py = p.y - P_HEIGHT * 0.5;

  const ready = (key: string, interval: number): boolean => {
    if ((cd[key] ?? 0) > t) return false;
    cd[key] = t + interval;
    return true;
  };

  switch (f.weapon) {
    case "goodbook": {
      // continuous orbit — (re)spawn missing books
      const want = evolved ? 6 : lvl >= 5 ? 3 : lvl >= 3 ? 2 : 1;
      const books = sim.projectiles.filter(
        (pr) => pr.kind === "book" && pr.owner === p.index,
      );
      if (books.length < want && ready("book", 12)) {
        sim.projectiles.push({
          id: sim.nextId++,
          kind: "book",
          hostile: false,
          owner: p.index,
          x: px,
          y: py,
          vx: 0,
          vy: 0,
          ticks: 9999,
          data: (books.length / want) * Math.PI * 2,
          power,
        });
      }
      break;
    }
    case "twang": {
      const interval = Math.max(70, 240 - lvl * 30) / (evolved ? 1 : 1);
      if (ready("twang", interval)) {
        sim.projectiles.push({
          id: sim.nextId++,
          kind: "twangring",
          hostile: false,
          owner: p.index,
          x: px,
          y: py,
          vx: 0,
          vy: 0,
          ticks: 40,
          data: evolved ? 2 : 1, // ring count
          power,
        });
        emit(sim, { t: "sfx", name: "twang", pitch: 0.9 + sim.rng() * 0.2 });
      }
      break;
    }
    case "jug": {
      const jars = lvl >= 4 ? 2 : 1;
      if (ready("jug", Math.max(50, 150 - lvl * 15))) {
        for (let i = 0; i < jars; i++) {
          sim.projectiles.push({
            id: sim.nextId++,
            kind: "jug",
            hostile: false,
            owner: p.index,
            x: px,
            y: py,
            vx: p.facing * (2.2 + i * 0.8) * (sim.rng() * 0.4 + 0.8),
            vy: -5 - sim.rng() * 1.5,
            ticks: 6 * TICK_HZ,
            data: evolved ? 1 : 0,
            power,
          });
        }
        emit(sim, { t: "sfx", name: "jugThrow" });
      }
      break;
    }
    case "scattergun": {
      if (ready("scatter", Math.max(40, 110 - lvl * 12))) {
        const target = nearestEnemy(sim, px, py);
        const pellets = evolved ? 12 : 3 + Math.floor(lvl / 2);
        const baseAngle = evolved
          ? 0
          : target
            ? Math.atan2(target.y - 12 - py, target.x - px)
            : p.facing > 0
              ? 0
              : Math.PI;
        for (let i = 0; i < pellets; i++) {
          const spread = evolved
            ? (i / pellets) * Math.PI * 2
            : baseAngle + (i - (pellets - 1) / 2) * 0.16;
          sim.projectiles.push({
            id: sim.nextId++,
            kind: "pellet",
            hostile: false,
            owner: p.index,
            x: px,
            y: py,
            vx: Math.cos(spread) * 6.4,
            vy: Math.sin(spread) * 6.4,
            ticks: 40,
            data: 0,
            power,
          });
        }
        emit(sim, { t: "sfx", name: "scattergun" });
      }
      break;
    }
    case "possum": {
      const want = evolved ? 8 : Math.min(1 + Math.floor(lvl / 2), 3);
      const have = sim.pets.filter(
        (pet) => pet.kind === "possum" && pet.owner === p.index,
      ).length;
      if (have < want && ready("possum", 30)) {
        sim.pets.push({
          id: sim.nextId++,
          kind: "possum",
          owner: p.index,
          x: px + p.facing * 20,
          y: p.y,
          vx: p.facing * 1.4,
          vy: 0,
          facing: p.facing,
          grounded: false,
          ticks: 0,
          mode: 0,
          power,
        });
        emit(sim, { t: "sfx", name: "possum" });
      }
      break;
    }
    case "jawharp": {
      if (ready("jawharp", Math.max(45, 120 - lvl * 14))) {
        sim.projectiles.push({
          id: sim.nextId++,
          kind: "boinger",
          hostile: false,
          owner: p.index,
          x: px,
          y: py,
          vx: p.facing * 4.2,
          vy: -3,
          ticks: evolved ? 12 * TICK_HZ : 5 * TICK_HZ,
          data: evolved ? 999 : 4 + lvl, // bounce budget
          power,
        });
        emit(sim, { t: "sfx", name: "boing" });
      }
      break;
    }
    case "washboard": {
      if (evolved) {
        // contact aura
        if (ready("washaura", 10)) {
          for (const e of sim.enemies) {
            if (e.phase.kind !== "normal") continue;
            if (circleOverlapsBox(e.x, e.y - 12, 14, p.x, p.y, P_WIDTH + 34, P_HEIGHT + 16)) {
              killEnemyByWeapon(sim, e, p.index, power);
            }
          }
        }
      }
      if (ready("wash", Math.max(18, 45 - lvl * 5))) {
        sim.projectiles.push({
          id: sim.nextId++,
          kind: "washarc",
          hostile: false,
          owner: p.index,
          x: px + p.facing * (P_WIDTH + 10),
          y: py,
          vx: p.facing * 0.8,
          vy: 0,
          ticks: 12,
          data: lvl,
          power,
        });
        emit(sim, { t: "sfx", name: "scrub", pitch: 0.9 + sim.rng() * 0.3 });
      }
      break;
    }
    case "chicken": {
      const interval = evolved ? 26 : Math.max(60, 160 - lvl * 20);
      if (ready("chicken", interval)) {
        const fromLeft = sim.rng() < 0.5;
        sim.projectiles.push({
          id: sim.nextId++,
          kind: "chicken",
          hostile: false,
          owner: p.index,
          x: fromLeft ? -20 : FIELD_W + 20,
          y: evolved ? 30 + sim.rng() * 60 : 60 + sim.rng() * (FIELD_H - 200),
          vx: (fromLeft ? 1 : -1) * (2.6 + lvl * 0.3),
          vy: evolved ? 1.2 : 0,
          ticks: 8 * TICK_HZ,
          data: lvl >= 3 ? 1 : 0, // drops eggs
          power,
        });
        emit(sim, { t: "sfx", name: "cluck", pitch: 0.85 + sim.rng() * 0.4 });
      }
      break;
    }
    case "spittoon": {
      if (ready("spit", Math.max(35, 100 - lvl * 12))) {
        const globs = 1 + Math.floor(lvl / 3);
        for (let i = 0; i < globs; i++) {
          sim.projectiles.push({
            id: sim.nextId++,
            kind: "spit",
            hostile: false,
            owner: p.index,
            x: px,
            y: py - 6,
            vx: p.facing * (3.4 + i) * (evolved ? 1.6 : 1),
            vy: evolved ? -7.5 : -4.5,
            ticks: 5 * TICK_HZ,
            data: 2 + lvl, // pierce budget
            power,
          });
        }
        emit(sim, { t: "sfx", name: "spit" });
      }
      break;
    }
    case "lightnin": {
      const interval = evolved ? 14 : Math.max(60, 180 - lvl * 24);
      if (ready("bolt", interval)) {
        const target = nearestEnemy(
          sim,
          sim.rng() * FIELD_W,
          sim.rng() * FIELD_H,
        );
        if (target) {
          sim.projectiles.push({
            id: sim.nextId++,
            kind: "bolt",
            hostile: false,
            owner: p.index,
            x: target.x,
            y: target.y,
            vx: 0,
            vy: 0,
            ticks: 14,
            data: lvl >= 3 ? 1 + Math.floor(lvl / 2) : 0, // chain jumps
            power: power + 2,
          });
          emit(sim, { t: "sfx", name: "boltHit" });
        }
      }
      break;
    }
    case "cousin": {
      const want = evolved ? 3 : lvl >= 4 ? 2 : 1;
      const have = sim.pets.filter(
        (pet) => (pet.kind === "cousin" || pet.kind === "granny") && pet.owner === p.index,
      ).length;
      if (have < want && ready("cousin", 40)) {
        const isGranny = evolved && have === 2;
        // second cousin runs the other way so the family fans out
        const facing = (have % 2 === 0 ? p.facing : -p.facing) as 1 | -1;
        sim.pets.push({
          id: sim.nextId++,
          kind: isGranny ? "granny" : "cousin",
          owner: p.index,
          x: px - p.facing * 24,
          y: p.y,
          vx: facing * 2,
          vy: 0,
          facing,
          grounded: false,
          ticks: 0,
          mode: 0,
          power: power + (isGranny ? 2 : 0),
          speed: isGranny ? KIN_GRANNY_SPEED : KIN_SPEED_BASE + lvl * KIN_SPEED_PER_LVL,
          lock: KIN_LOCK_TICKS,
          hopCd: 0,
          lungeCd: 0,
          lunge: 0,
          bonk: 0,
        });
        emit(sim, { t: "sfx", name: "cousinYell" });
      }
      break;
    }
    case "hound": {
      const want = evolved ? 4 : 1 + Math.floor(lvl / 3);
      const have = sim.pets.filter(
        (pet) => pet.kind === "hound" && pet.owner === p.index,
      ).length;
      if (have < want && ready("hound", 35)) {
        sim.pets.push({
          id: sim.nextId++,
          kind: "hound",
          owner: p.index,
          x: px,
          y: p.y,
          vx: p.facing * 2.4,
          vy: 0,
          facing: p.facing,
          grounded: false,
          ticks: 0,
          mode: 0,
          power,
        });
        emit(sim, { t: "sfx", name: "houndBark" });
      }
      if (evolved && ready("howl", 6 * TICK_HZ)) {
        // pack howl stuns everything briefly
        for (const e of sim.enemies) {
          if (e.phase.kind === "normal") e.stateTimer = Math.max(e.stateTimer, 90);
        }
        emit(sim, { t: "sfx", name: "howl" });
        emit(sim, { t: "burst", text: "AWOOOO!", x: px, y: py - 40 });
      }
      break;
    }
  }
}

// ------------------------------------------------------------ projectiles

function hitEnemies(sim: Sim, pr: Projectile, radius: number): number {
  let hits = 0;
  for (const e of sim.enemies) {
    if (e.phase.kind === "dying") continue;
    if (circleOverlapsBox(pr.x, pr.y, radius, e.x, e.y, 26, 26)) {
      killEnemyByWeapon(sim, e, pr.owner, pr.power);
      hits++;
    }
  }
  // ...and the rescue cage's padlock
  if (sim.cage && sim.cage.openedTick < 0 && sim.cage.hitCooldown <= 0) {
    const c = sim.cage;
    if (circleOverlapsBox(pr.x, pr.y, radius, c.x, c.y, CAGE_W, CAGE_H)) {
      hitCage(sim, pr.owner);
      hits++;
    }
  }
  // frenzy weapons chip the boss too
  if (sim.boss && !sim.boss.dead && sim.boss.invuln <= 0) {
    if (circleOverlapsBox(pr.x, pr.y, radius, sim.boss.x, sim.boss.y, 90, 90)) {
      sim.boss.hp -= Math.max(1, Math.floor(pr.power / 2));
      sim.boss.hitFlash = 6;
      hits++;
    }
  }
  return hits;
}

// Lobbed projectiles (jug, egg, boinger) land on platforms only when falling
// onto them; rising through a platform from below passes clean. Straight
// shots (spit, pellet, enemyshot) ignore platforms entirely via isSolidAt.
function landsAt(sim: Sim, px: number, py: number, vy: number): boolean {
  const t = tileAt(sim.level, px, py);
  return t === T_SOLID || t === T_SPIKES || (t === T_PLATFORM && vy > 0);
}

function stepProjectile(sim: Sim, pr: Projectile): boolean {
  pr.ticks--;
  if (pr.ticks <= 0) return false;

  switch (pr.kind) {
    case "book": {
      const p = sim.players.find((q) => q.index === pr.owner);
      if (!p || !p.frenzy || p.frenzy.weapon !== "goodbook" || !p.alive) return false;
      const evolved = p.loadout.evolved.includes("goodbook");
      const speed = 0.05 + p.frenzy.level * 0.012;
      pr.data += speed;
      const r = evolved ? 74 : 52;
      pr.x = p.x + Math.cos(pr.data) * r;
      pr.y = p.y - P_HEIGHT * 0.5 + Math.sin(pr.data) * r * 0.8;
      hitEnemies(sim, pr, 16);
      if (evolved) {
        // pull enemies gently inward
        for (const e of sim.enemies) {
          if (e.phase.kind !== "normal") continue;
          const dx = p.x - e.x;
          if (Math.abs(dx) < 160) e.x += Math.sign(dx) * 0.35;
        }
      }
      return true;
    }
    case "twangring": {
      const age = 40 - pr.ticks;
      const radius = 20 + age * 3.2;
      // ring hit test: enemies near the circumference
      for (const e of sim.enemies) {
        if (e.phase.kind === "dying") continue;
        const d = Math.hypot(e.x - pr.x, e.y - 12 - pr.y);
        if (Math.abs(d - radius) < 16) killEnemyByWeapon(sim, e, pr.owner, pr.power);
      }
      if (sim.boss && !sim.boss.dead) {
        const d = Math.hypot(sim.boss.x - pr.x, sim.boss.y - pr.y);
        if (Math.abs(d - radius) < 26) {
          sim.boss.hp -= 1;
          sim.boss.hitFlash = 4;
        }
      }
      // echo ring for Duelin' Banjos
      if (pr.data === 2 && pr.ticks === 20) {
        sim.projectiles.push({ ...pr, id: sim.nextId++, ticks: 40, data: 1 });
      }
      return true;
    }
    case "jug": {
      pr.vy += 0.28;
      pr.x += pr.vx;
      pr.y += pr.vy;
      const solid = landsAt(sim, pr.x, pr.y, pr.vy);
      if (solid || pr.y > FIELD_H - 4) {
        // smash: fire pool
        const evolved = pr.data === 1;
        const w = evolved ? TILE * 8 : TILE * (2 + Math.min(3, pr.power));
        sim.zones.push({
          id: sim.nextId++,
          kind: "fire",
          x: pr.x - w / 2,
          y: Math.min(pr.y, FIELD_H - 8) - 6,
          w,
          h: 14,
          ticks: (evolved ? 3.5 : 2) * TICK_HZ,
          spreading: evolved,
        });
        emit(sim, { t: "sfx", name: "jugSmash" });
        if (evolved) emit(sim, { t: "burst", text: "WHITE LIGHTNIN'!", x: pr.x, y: pr.y - 30, big: true });
        return false;
      }
      hitEnemies(sim, pr, 12);
      return true;
    }
    case "pellet": {
      pr.x += pr.vx;
      pr.y += pr.vy;
      if (isSolidAt(sim.level, pr.x, pr.y)) return false;
      if (hitEnemies(sim, pr, 10) > 0) return false;
      return true;
    }
    case "boinger": {
      pr.vy += 0.25;
      pr.x += pr.vx;
      pr.y += pr.vy;
      if (pr.x < 12 || pr.x > FIELD_W - 12) {
        pr.vx *= -1;
        pr.data--;
      }
      if (landsAt(sim, pr.x, pr.y + 8, pr.vy) && pr.vy > 0) {
        pr.vy = -Math.abs(pr.vy) * 0.95 - 1;
        pr.data--;
        emit(sim, { t: "sfx", name: "boingSmall", pitch: 1 + sim.rng() * 0.4 });
      }
      if (isSolidAt(sim.level, pr.x, pr.y - 8) && pr.vy < 0) {
        pr.vy = Math.abs(pr.vy);
        pr.data--;
      }
      if (pr.y > FIELD_H + 20) pr.y = -10;
      hitEnemies(sim, pr, 12);
      return pr.data > 0;
    }
    case "washarc": {
      pr.x += pr.vx;
      hitEnemies(sim, pr, 18 + pr.data * 2);
      return true;
    }
    case "chicken": {
      pr.x += pr.vx;
      pr.y += pr.vy + Math.sin((pr.ticks + pr.id * 17) / 9) * 1.4;
      if (pr.y > FIELD_H - 20) pr.vy = -Math.abs(pr.vy || 1);
      if (pr.data === 1 && pr.ticks % 50 === 0) {
        sim.projectiles.push({
          id: sim.nextId++,
          kind: "egg",
          hostile: false,
          owner: pr.owner,
          x: pr.x,
          y: pr.y + 8,
          vx: 0,
          vy: 1,
          ticks: 4 * TICK_HZ,
          data: 0,
          power: pr.power,
        });
      }
      hitEnemies(sim, pr, 14);
      return pr.x > -30 && pr.x < FIELD_W + 30;
    }
    case "egg": {
      pr.vy += 0.3;
      pr.y += pr.vy;
      if (landsAt(sim, pr.x, pr.y, pr.vy) || pr.y > FIELD_H) {
        hitEnemies(sim, pr, 26);
        emit(sim, { t: "sfx", name: "eggPop" });
        return false;
      }
      if (hitEnemies(sim, pr, 10) > 0) return false;
      return true;
    }
    case "spit": {
      pr.vy += 0.22;
      pr.x += pr.vx;
      pr.y += pr.vy;
      if (isSolidAt(sim.level, pr.x, pr.y)) return false;
      const hits = hitEnemies(sim, pr, 11);
      pr.data -= hits;
      return pr.data > 0 && pr.y < FIELD_H + 30;
    }
    case "bolt": {
      // instant strike visual; chains on spawn tick
      if (pr.ticks === 13) {
        hitEnemies(sim, pr, 22);
        if (pr.data > 0) {
          const next = nearestEnemy(sim, pr.x, pr.y);
          if (next) {
            sim.projectiles.push({
              id: sim.nextId++,
              kind: "bolt",
              hostile: false,
              owner: pr.owner,
              x: next.x,
              y: next.y,
              vx: 0,
              vy: 0,
              ticks: 14,
              data: pr.data - 1,
              power: pr.power,
            });
          }
        }
      }
      return true;
    }
    case "note": {
      pr.x += pr.vx;
      pr.y += pr.vy + Math.sin((pr.ticks + pr.id * 23) / 14) * 0.8;
      if (pr.hostile) {
        for (const p of sim.players) {
          if (!p.alive || p.invuln > 0 || p.prayer > 0) continue;
          if (circleOverlapsBox(pr.x, pr.y, 10, p.x, p.y, P_WIDTH, P_HEIGHT)) {
            const { hurtPlayer } = simHurt();
            hurtPlayer(sim, p);
            return false;
          }
        }
      } else if (sim.boss && !sim.boss.dead) {
        if (circleOverlapsBox(pr.x, pr.y, 14, sim.boss.x, sim.boss.y, 90, 90)) {
          sim.boss.hp -= pr.power;
          sim.boss.hitFlash = 8;
          emit(sim, { t: "sfx", name: "noteHit" });
          return false;
        }
      }
      return pr.x > -30 && pr.x < FIELD_W + 30 && pr.y > -30 && pr.y < FIELD_H + 30;
    }
    case "firepool":
      return false; // legacy guard; fire lives in zones
    case "enemyshot": {
      pr.x += pr.vx;
      pr.y += pr.vy;
      if (isSolidAt(sim.level, pr.x, pr.y)) return false;
      for (const p of sim.players) {
        if (!p.alive || p.invuln > 0 || p.prayer > 0) continue;
        if (circleOverlapsBox(pr.x, pr.y, 8, p.x, p.y, P_WIDTH, P_HEIGHT)) {
          const { hurtPlayer } = simHurt();
          hurtPlayer(sim, p);
          return false;
        }
      }
      return pr.x > -20 && pr.x < FIELD_W + 20 && pr.y > -20 && pr.y < FIELD_H + 20;
    }
  }
  return true;
}

// Lazy import breaker: sim.ts imports this module, so pull hurtPlayer at call
// time to keep the module graph acyclic for the bundler's sake.
import * as simModule from "./sim";
function simHurt(): { hurtPlayer: typeof simModule.hurtPlayer } {
  return { hurtPlayer: simModule.hurtPlayer };
}

// ---------------------------------------------------------------- pets

// ---- Cousin Eddie / Granny: the dumb linebacker ----
// Kin commit to a direction and GO. They run through varmints, bonk off walls
// (stunned, then turn), run straight off ledges (vertical wrap brings them back
// around), and only hop when the target is above and within reach. No pathing:
// the comedy is in the commitment, and the commitment is what keeps them from
// vibrating in place when a target sits above/below or behind a wall.
const KIN_SPEED_BASE = 2.1;
const KIN_SPEED_PER_LVL = 0.15;
const KIN_GRANNY_SPEED = 1.4;
const KIN_LOCK_TICKS = 20; // min ticks between facing changes
const KIN_DEAD_ZONE = 16; // |dx| below this never changes facing
const KIN_BEHIND = 24; // target must be this far behind to earn a turn
const KIN_SAME_FLOOR = TILE * 1.5; // |dy| within this = "on my floor"
const KIN_HOP_VY = -9; // ~4.2 tiles under pet gravity (a hair over a player jump)
const KIN_HOP_MIN_DY = TILE * 0.5; // target must be at least this far above to hop
const KIN_HOP_MAX_DY = TILE * 4; // ...and no further than this
const KIN_SHELF_MIN_ROWS = 1; // climbable shelf: top edge this many rows above the feet...
const KIN_SHELF_MAX_ROWS = 4; // ...up to this many (must be inside hop height)
const KIN_HOP_CD = 24; // between in-place hops; ledge jumps are exempt (can't pogo off a ledge)
const KIN_LUNGE_RANGE = TILE * 4;
const KIN_LUNGE_TICKS = 10;
const KIN_LUNGE_CD = 50;
const KIN_LUNGE_MULT = 2;
const KIN_BONK_TICKS = 15;
const KIN_BONK_TICKS_GRANNY = 24;
const KIN_LEASH = TILE * 3; // no varmints: jog back if further than this from owner

/** Nearest enemy, preferring ones on roughly the kin's own floor. */
function kinTarget(sim: Sim, pet: Pet): Enemy | null {
  let best: Enemy | null = null;
  let bestD = Infinity;
  let bestFloor = false;
  for (const e of sim.enemies) {
    if (e.phase.kind !== "normal") continue;
    const onFloor = Math.abs(e.y - pet.y) <= KIN_SAME_FLOOR;
    if (bestFloor && !onFloor) continue;
    const d = (e.x - pet.x) * (e.x - pet.x) + (e.y - pet.y) * (e.y - pet.y);
    if ((onFloor && !bestFloor) || d < bestD) {
      best = e;
      bestD = d;
      bestFloor = onFloor;
    }
  }
  return best;
}

/** Is there a shelf (platform/solid top with air above it) a hop ahead and up? */
function shelfAhead(level: ParsedLevel, x: number, y: number, facing: number): boolean {
  const px = x + facing * 20;
  for (let k = KIN_SHELF_MIN_ROWS; k <= KIN_SHELF_MAX_ROWS; k++) {
    const top = y - k * TILE;
    const t = tileAt(level, px, top + 1);
    if (t === T_SOLID || t === T_PLATFORM) return tileAt(level, px, top - 1) === 0;
  }
  return false;
}

function stepKin(sim: Sim, pet: Pet, owner: PlayerState | undefined): void {
  const granny = pet.kind === "granny";
  const speed = pet.speed ?? (granny ? KIN_GRANNY_SPEED : KIN_SPEED_BASE);
  if ((pet.lock ?? 0) > 0) pet.lock = (pet.lock ?? 0) - 1;
  if ((pet.hopCd ?? 0) > 0) pet.hopCd = (pet.hopCd ?? 0) - 1;
  if ((pet.lungeCd ?? 0) > 0) pet.lungeCd = (pet.lungeCd ?? 0) - 1;
  if ((pet.lunge ?? 0) > 0) pet.lunge = (pet.lunge ?? 0) - 1;

  // BONK: stand there seeing stars, then turn around once and recommit
  if ((pet.bonk ?? 0) > 0) {
    pet.bonk = (pet.bonk ?? 0) - 1;
    pet.vx = 0;
    if (pet.bonk === 0) {
      pet.mode = 0;
      pet.facing = -pet.facing as 1 | -1;
      pet.lock = KIN_LOCK_TICKS;
    }
    return;
  }

  const target = kinTarget(sim, pet);
  const hop = (): void => {
    pet.vy = KIN_HOP_VY;
    pet.grounded = false;
    pet.hopCd = KIN_HOP_CD;
  };
  const canHop = !granny && pet.grounded && (pet.hopCd ?? 0) <= 0;

  if (target) {
    const dx = target.x - pet.x;
    const dy = target.y - pet.y; // negative = target above
    const sameFloor = Math.abs(dy) <= KIN_SAME_FLOOR;
    const overhead = dy < -KIN_SAME_FLOOR; // on a higher floor
    const inHopRange = dy <= -KIN_HOP_MIN_DY && dy >= -KIN_HOP_MAX_DY;
    // Only a target on my floor or a hop above earns a turn, and only with
    // boots on the ground (a mid-hop turn throws away the jump). Anything
    // else: keep charging - walls, ledges and the wrap are how kin change floors.
    const reachable = sameFloor || inHopRange;
    if (Math.abs(dx) < KIN_DEAD_ZONE) {
      // right under it: never flip, hop if it's close enough overhead
      if (inHopRange && canHop) hop();
    } else if ((pet.lock ?? 0) <= 0 && reachable && pet.grounded) {
      const behind = Math.sign(dx) !== pet.facing && Math.abs(dx) > KIN_BEHIND;
      if (behind) {
        pet.facing = Math.sign(dx) as 1 | -1;
        pet.lock = KIN_LOCK_TICKS;
      }
    }
    // climbing, kin style: target's up there and there's a shelf a hop ahead -> take it
    if (overhead && canHop && shelfAhead(sim.level, pet.x, pet.y, pet.facing)) hop();
    // headbutt lunge: same floor, in front, close
    if (
      !granny &&
      sameFloor &&
      pet.grounded &&
      (pet.lunge ?? 0) <= 0 &&
      (pet.lungeCd ?? 0) <= 0 &&
      Math.sign(dx) === pet.facing &&
      Math.abs(dx) < KIN_LUNGE_RANGE
    ) {
      pet.lunge = KIN_LUNGE_TICKS;
      pet.lungeCd = KIN_LUNGE_CD;
      emit(sim, { t: "sfx", name: "cousinYell", pitch: 1.25 });
    }
    pet.vx = pet.facing * speed * ((pet.lunge ?? 0) > 0 ? KIN_LUNGE_MULT : 1);
    // ledge: run right off it, unless the target's up there ahead and a jump can
    // make it. No cooldown check: leaving the ledge is its own anti-pogo.
    if (pet.grounded && !groundAhead(sim.level, pet.x, pet.y, pet.facing, 12)) {
      if (inHopRange && !granny && Math.sign(dx) === pet.facing) hop();
    }
  } else {
    // nothing to headbutt: jog back toward the owner, commit so we don't jitter
    pet.lunge = 0;
    if (owner && pet.grounded && (pet.lock ?? 0) <= 0) {
      const dx = owner.x - pet.x;
      if (Math.abs(dx) > KIN_LEASH && Math.sign(dx) !== pet.facing) {
        pet.facing = Math.sign(dx) as 1 | -1;
        pet.lock = KIN_LOCK_TICKS * 1.5;
      }
    }
    const near = owner ? Math.abs(owner.x - pet.x) <= KIN_LEASH : false;
    pet.vx = near ? 0 : pet.facing * speed * 0.5;
    if (pet.grounded && !groundAhead(sim.level, pet.x, pet.y, pet.facing, 12)) {
      // don't wander off the edge for nothing
      pet.vx = 0;
    }
  }
}

function stepPet(sim: Sim, pet: Pet): boolean {
  const owner = sim.players.find((p) => p.index === pet.owner);
  const frenzyLive =
    owner?.frenzy &&
    ((pet.kind === "possum" && owner.frenzy.weapon === "possum") ||
      ((pet.kind === "cousin" || pet.kind === "granny") && owner.frenzy.weapon === "cousin") ||
      (pet.kind === "hound" && owner.frenzy.weapon === "hound"));
  if (!frenzyLive) return false;

  pet.ticks++;
  switch (pet.kind) {
    case "possum": {
      if (pet.mode === 1) {
        // playing dead
        pet.vx = 0;
        if (pet.ticks % 90 === 0) pet.mode = 0;
        break;
      }
      pet.vx = pet.facing * 1.5;
      if (pet.grounded && !groundAhead(sim.level, pet.x, pet.y, pet.facing, 12)) {
        pet.facing = -pet.facing as 1 | -1;
      }
      if (pet.ticks % 200 === 150) pet.mode = 1; // flop over dramatically
      break;
    }
    case "cousin":
    case "granny":
      stepKin(sim, pet, owner);
      break;
    case "hound": {
      const target = nearestEnemy(sim, pet.x, pet.y);
      if (target) {
        pet.facing = (Math.sign(target.x - pet.x) || pet.facing) as 1 | -1;
        pet.vx = pet.facing * 2.6;
        if (pet.grounded && target.y < pet.y - TILE && sim.rng() < 0.03) {
          pet.vy = -6.5;
          pet.grounded = false;
        }
      } else {
        pet.vx = pet.facing * 1.2;
      }
      break;
    }
  }

  pet.vy = Math.min(pet.vy + 0.3, 6);
  const moved = moveBody(sim.level, pet.x, pet.y, pet.vx, pet.vy, 20, 20);
  pet.x = moved.x;
  pet.y = moved.y;
  pet.vy = moved.vy;
  pet.grounded = moved.grounded || standingOnGround(sim.level, pet.x, pet.y, 20);
  const kin = pet.kind === "cousin" || pet.kind === "granny";
  if (moved.hitWall) {
    if (kin) {
      // BONK: kin runs face-first into the wall, sees stars, then turns around
      if ((pet.bonk ?? 0) <= 0) {
        pet.bonk = pet.kind === "granny" ? KIN_BONK_TICKS_GRANNY : KIN_BONK_TICKS;
        pet.mode = 2;
        pet.lunge = 0;
        emit(sim, { t: "sfx", name: "cousinBonk", pitch: pet.kind === "granny" ? 0.8 : 1 });
        emit(sim, { t: "burst", text: pet.kind === "granny" ? "OOF!" : "BONK!", x: pet.x, y: pet.y - 26 });
      }
    } else {
      pet.facing = -pet.facing as 1 | -1;
    }
  }

  // bite/headbutt (bonked kin is harmless)
  if (pet.mode === 0) {
    const hbW = pet.kind === "granny" ? 30 : 22; // rolling pin reach
    for (const e of sim.enemies) {
      if (e.phase.kind !== "normal") continue;
      if (circleOverlapsBox(e.x, e.y - 12, 13, pet.x, pet.y, hbW, 22)) {
        killEnemyByWeapon(sim, e, pet.owner, pet.power);
        if (pet.kind === "hound") {
          // hounds knock enemies toward the owner's bubbles instead of killing
          e.vx = pet.facing * 3;
        }
      }
    }
  }
  return true;
}

export function stepWeapons(sim: Sim): void {
  for (const p of sim.players) {
    if (p.alive && p.frenzy) fireWeapon(sim, p);
  }
  sim.projectiles = sim.projectiles.filter((pr) => stepProjectile(sim, pr));
  sim.pets = sim.pets.filter((pet) => stepPet(sim, pet));
}
