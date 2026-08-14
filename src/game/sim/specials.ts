// The moonshine set: drifting special bubbles with level-wide effects, plus
// the lingering zones they leave behind (fire cascades, skunk clouds) and the
// wild hog. Popping one triggers THE BELCH RULE: Mega-Belch SFX + belch
// animation + a BRAAAP exclaim burst on the popper. Spiky shapes come from
// the exclaim system only, never speech balloons.

import { pick } from "../core/rng";
import {
  FIELD_H,
  FIELD_W,
  P_HEIGHT,
  P_WIDTH,
  TICK_HZ,
  TILE,
} from "./constants";
import { circleOverlapsBox, standingOnGround, tileAt } from "./physics";
import type { SpecialBubble, SpecialKind, Sim, Zone } from "./types";
import { emit } from "./sim";
import { killEnemyByWeapon } from "./enemies";

const SPECIAL_KINDS: SpecialKind[] = [
  "moonshine",
  "lightnin",
  "skunk",
  "hog",
  "prayer",
];

export function spawnSpecial(sim: Sim): void {
  const kind = pick(sim.rng, SPECIAL_KINDS);
  const fromLeft = sim.rng() < 0.5;
  sim.specials.push({
    id: sim.nextId++,
    kind,
    x: fromLeft ? -16 : FIELD_W + 16,
    y: 70 + sim.rng() * (FIELD_H - 220),
    vx: (fromLeft ? 1 : -1) * (0.55 + sim.rng() * 0.3),
    vy: 0,
    age: 0,
  });
}

function activateSpecial(sim: Sim, s: SpecialBubble, by: 0 | 1): void {
  const popper = sim.players.find((p) => p.index === by);
  // THE BELCH RULE — every special activation is a huge belch from the popper.
  emit(sim, { t: "belch", player: by });
  emit(sim, { t: "sfx", name: "megaBelch" });
  if (popper) {
    popper.anim = "belch";
    popper.animLock = 40;
    emit(sim, {
      t: "burst",
      text: "BRAAAP!",
      x: popper.x,
      y: popper.y - P_HEIGHT - 16,
      big: true,
      palette: "toxic",
    });
  }

  switch (s.kind) {
    case "moonshine": {
      // flaming flood cascades down from the pop point
      for (let i = 0; i < 5; i++) {
        sim.zones.push({
          id: sim.nextId++,
          kind: "fire",
          x: s.x - TILE * (2 + i),
          y: Math.min(FIELD_H - 10, s.y + i * TILE),
          w: TILE * (4 + i * 2),
          h: 14,
          ticks: Math.floor(2.5 * TICK_HZ) + i * 12,
          spreading: true,
        });
      }
      emit(sim, { t: "sfx", name: "moonshineFlood" });
      emit(sim, { t: "flash", color: 0xff9a30 });
      break;
    }
    case "lightnin": {
      // bolt across the pop row
      for (const e of sim.enemies) {
        if (e.phase.kind === "dying") continue;
        if (Math.abs(e.y - s.y) < TILE * 1.3) {
          killEnemyByWeapon(sim, e, by, 99);
        }
      }
      emit(sim, { t: "sfx", name: "lightninJar" });
      emit(sim, { t: "flash", color: 0x80d8ff });
      emit(sim, { t: "shake", power: 5 });
      break;
    }
    case "skunk": {
      sim.zones.push({
        id: sim.nextId++,
        kind: "skunk",
        x: s.x - TILE * 2.5,
        y: s.y - TILE * 1.5,
        w: TILE * 5,
        h: TILE * 3,
        ticks: 6 * TICK_HZ,
        spreading: false,
      });
      emit(sim, { t: "sfx", name: "skunk" });
      break;
    }
    case "hog": {
      sim.hog = {
        active: true,
        x: s.x < FIELD_W / 2 ? -30 : FIELD_W + 30,
        y: FIELD_H - TILE,
        vx: s.x < FIELD_W / 2 ? 3.4 : -3.4,
        facing: s.x < FIELD_W / 2 ? 1 : -1,
        ticks: 0,
      };
      emit(sim, { t: "sfx", name: "hogSqueal" });
      emit(sim, { t: "burst", text: "HOG STAMPEDE!", x: FIELD_W / 2, y: FIELD_H - 90, big: true });
      break;
    }
    case "prayer": {
      for (const p of sim.players) {
        if (p.alive) p.prayer = 5 * TICK_HZ;
      }
      emit(sim, { t: "sfx", name: "gospel" });
      emit(sim, { t: "flash", color: 0xfff2b0 });
      break;
    }
  }
}

function stepSpecial(sim: Sim, s: SpecialBubble): boolean {
  s.age++;
  s.x += s.vx + Math.sin((s.age + s.id * 29) / 38) * 0.25;
  s.y += Math.sin((s.age + s.id * 47) / 30) * 0.45;
  // leave the screen eventually
  if (s.x < -40 || s.x > FIELD_W + 40) return false;

  for (const p of sim.players) {
    if (!p.alive) continue;
    if (circleOverlapsBox(s.x, s.y, 18, p.x, p.y, P_WIDTH + 6, P_HEIGHT)) {
      activateSpecial(sim, s, p.index);
      return false;
    }
  }
  return true;
}

function stepZone(sim: Sim, z: Zone): boolean {
  z.ticks--;
  if (z.ticks <= 0) return false;

  if (z.spreading && z.ticks % 8 === 0 && z.w < TILE * 14) {
    z.x -= 5;
    z.w += 10;
    // cascade down ledges: if a zone edge hangs over air, spill a child
    for (const edgeX of [z.x, z.x + z.w]) {
      const below = tileAt(sim.level, edgeX, z.y + TILE);
      if (below === 0 && z.ticks > TICK_HZ && sim.zones.length < 24) {
        sim.zones.push({
          id: sim.nextId++,
          kind: "fire",
          x: edgeX - TILE / 2,
          y: z.y + TILE * 2,
          w: TILE,
          h: 14,
          ticks: z.ticks - 10,
          spreading: false,
        });
      }
    }
    z.spreading = z.w < TILE * 14;
  }

  // hurt enemies inside (grounded fire hits grounded enemies; skunk hits all)
  if (z.ticks % 10 === 0) {
    for (const e of sim.enemies) {
      if (e.phase.kind === "dying") continue;
      const inside =
        e.x > z.x && e.x < z.x + z.w && e.y > z.y - z.h && e.y < z.y + z.h + 8;
      if (!inside) continue;
      if (z.kind === "fire" && e.flying && e.kind !== "flyincow") continue;
      killEnemyByWeapon(sim, e, 0, z.kind === "fire" ? 3 : 2);
    }
  }
  return true;
}

function stepHog(sim: Sim): void {
  const hog = sim.hog;
  if (!hog.active) return;
  hog.ticks++;
  hog.x += hog.vx;
  // hog bulldozes along the floor line, snapping to ground
  if (!standingOnGround(sim.level, hog.x, hog.y, 30)) {
    hog.y = Math.min(hog.y + 4, FIELD_H);
  }
  for (const e of sim.enemies) {
    if (e.phase.kind === "dying") continue;
    if (circleOverlapsBox(hog.x, hog.y - 14, 22, e.x, e.y, 26, 26)) {
      killEnemyByWeapon(sim, e, 0, 99);
      emit(sim, { t: "shake", power: 2 });
    }
  }
  if (hog.x < -60 || hog.x > FIELD_W + 60) hog.active = false;
}

export function stepSpecialsAndZones(sim: Sim): void {
  sim.specials = sim.specials.filter((s) => stepSpecial(sim, s));
  sim.zones = sim.zones.filter((z) => stepZone(sim, z));
  stepHog(sim);

  // zones hurt players too (fire only; skunk only stinks for enemies)
  for (const z of sim.zones) {
    if (z.kind !== "fire") continue;
    for (const p of sim.players) {
      if (!p.alive || p.invuln > 0 || p.prayer > 0) continue;
      if (p.x > z.x && p.x < z.x + z.w && p.y > z.y - 6 && p.y < z.y + z.h + 10) {
        // your own moonshine burns you too. Cooter knows.
        simHurtLocal(sim, p.index);
      }
    }
  }
}

// local, import-cycle-safe hurt
import * as simMod from "./sim";
function simHurtLocal(sim: Sim, idx: number): void {
  const p = sim.players.find((q) => q.index === idx);
  if (p) simMod.hurtPlayer(sim, p);
}
