// The moonshine set: special bubbles with level-wide effects, plus the
// lingering zones they leave behind (fire cascades, skunk clouds) and the
// wild hog. A special is a real bubble (sim.bubbles with `special` set): it
// rides the wind, packs into strings with the rest, can be stood on, nudged
// and chain-popped. Popping one triggers THE BELCH RULE: Mega-Belch SFX +
// belch animation + a BRAAAP exclaim burst on the popper. Spiky shapes come
// from the exclaim system only, never speech balloons.
//
// CHARGE: a special that goes up in a string of trapped varmints fires
// bigger. `charge` = trapped bubbles in the cluster that detonated it.

import { pick } from "../core/rng";
import {
  BUBBLE_R,
  FIELD_H,
  FIELD_W,
  P_HEIGHT,
  SPECIAL_DRIFT,
  TICK_HZ,
  TILE,
} from "./constants";
import { circleOverlapsBox, tileAt } from "./physics";
import type { SpecialKind, Sim, Zone } from "./types";
import { emit } from "./sim";
import { killEnemyByWeapon } from "./enemies";

const SPECIAL_KINDS: SpecialKind[] = [
  "moonshine",
  "lightnin",
  "skunk",
  "hog",
  "prayer",
];

/** A special drifts in from one side at mid-height as a floating bubble. */
export function spawnSpecial(sim: Sim): void {
  const kind = pick(sim.rng, SPECIAL_KINDS);
  const fromLeft = sim.rng() < 0.5;
  const drift = (fromLeft ? 1 : -1) * SPECIAL_DRIFT;
  sim.bubbles.push({
    id: sim.nextId++,
    owner: 0,
    x: fromLeft ? BUBBLE_R + 6 : FIELD_W - BUBBLE_R - 6,
    y: 70 + sim.rng() * (FIELD_H - 220),
    vx: drift,
    vy: 0,
    state: { kind: "float" },
    age: 0,
    rides: 0,
    rideTicks: 0,
    ridden: 0,
    wobblePhase: sim.rng() * Math.PI * 2,
    special: kind,
    drift,
    fuse: 0,
    fuseBy: 0,
    fuseCharge: 0,
  });
}

export function activateSpecial(
  sim: Sim,
  kind: SpecialKind,
  x: number,
  y: number,
  by: 0 | 1,
  charge: number,
): void {
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
  if (charge >= 2) {
    emit(sim, { t: "burst", text: `CHARGED x${charge}!`, x, y: y - 30, big: charge >= 3 });
  }

  switch (kind) {
    case "moonshine": {
      // flaming flood cascades down from the pop point; a charged one runs
      // deeper and burns longer
      const rows = Math.min(11, 5 + charge * 2);
      for (let i = 0; i < rows; i++) {
        sim.zones.push({
          id: sim.nextId++,
          kind: "fire",
          x: x - TILE * (2 + i),
          y: Math.min(FIELD_H - 10, y + i * TILE),
          w: TILE * (4 + i * 2),
          h: 14,
          ticks: Math.floor(2.5 * TICK_HZ) + i * 12 + charge * 20,
          spreading: true,
        });
      }
      emit(sim, { t: "sfx", name: "moonshineFlood" });
      emit(sim, { t: "flash", color: 0xff9a30 });
      break;
    }
    case "lightnin": {
      // bolt across the pop row; charged bolts fan out into the rows around
      const band = TILE * (1.3 + 0.9 * charge);
      for (const e of sim.enemies) {
        if (e.phase.kind === "dying") continue;
        if (Math.abs(e.y - y) < band) {
          killEnemyByWeapon(sim, e, by, 99);
        }
      }
      emit(sim, { t: "sfx", name: "lightninJar" });
      emit(sim, { t: "flash", color: 0x80d8ff });
      emit(sim, { t: "shake", power: 5 + charge });
      break;
    }
    case "skunk": {
      const grow = 1 + 0.35 * charge;
      sim.zones.push({
        id: sim.nextId++,
        kind: "skunk",
        x: x - TILE * 2.5 * grow,
        y: y - TILE * 1.5 * grow,
        w: TILE * 5 * grow,
        h: TILE * 3 * grow,
        ticks: 6 * TICK_HZ + Math.floor(charge * 1.5 * TICK_HZ),
        spreading: false,
      });
      emit(sim, { t: "sfx", name: "skunk" });
      break;
    }
    case "hog": {
      sim.hog = {
        active: true,
        x: x < FIELD_W / 2 ? -30 : FIELD_W + 30,
        y: FIELD_H - TILE,
        vx: (x < FIELD_W / 2 ? 1 : -1) * (3.4 + 0.6 * charge),
        facing: x < FIELD_W / 2 ? 1 : -1,
        ticks: 0,
      };
      emit(sim, { t: "sfx", name: "hogSqueal" });
      emit(sim, { t: "burst", text: "HOG STAMPEDE!", x: FIELD_W / 2, y: FIELD_H - 90, big: true });
      break;
    }
    case "prayer": {
      for (const p of sim.players) {
        if (p.alive) p.prayer = (5 + 2 * charge) * TICK_HZ;
      }
      emit(sim, { t: "sfx", name: "gospel" });
      emit(sim, { t: "flash", color: 0xfff2b0 });
      break;
    }
  }
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
  // hog bulldozes along the floor line. Creek gaps are no match for a
  // stampede: it barrels straight across at floor height rather than
  // dropping in (dropping used to leave it stuck below the floor row, where
  // there is no ground to snap back to, and it finished the charge buried).
  hog.y = FIELD_H - TILE;
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
