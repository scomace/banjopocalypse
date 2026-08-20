// Items: food (score), mason jars (frenzy), YEEHAW letters, extra-life jugs.
// Food tiers by chain size; everything is an original hillbilly snack.

import { rangeInt } from "../core/rng";
import {
  FIELD_H,
  FIELD_W,
  P_HEIGHT,
  P_WIDTH,
  TICK_HZ,
  TILE,
  YEEHAW,
} from "./constants";
import { circleOverlapsBox, moveBody } from "./physics";
import type { Item, Sim } from "./types";
import { emit, score, startFrenzy } from "./sim";

export const FOOD_TIERS = [
  { name: "porkrinds", value: 500 },
  { name: "corndog", value: 700 },
  { name: "moonpie", value: 1000 },
  { name: "jerky", value: 2000 },
  { name: "possumpie", value: 3000 },
  { name: "friedbutter", value: 5000 },
  { name: "goldenbanjo", value: 10000 },
] as const;

export function spawnFood(
  sim: Sim,
  x: number,
  y: number,
  chain: number,
  bonusTier: number,
): void {
  const tier = Math.min(FOOD_TIERS.length - 1, Math.max(0, chain - 1 + bonusTier));
  const clampedX = Math.max(40, Math.min(FIELD_W - 40, x));
  sim.items.push({
    id: sim.nextId++,
    kind: "food",
    x: clampedX,
    y: Math.min(y, FIELD_H - TILE),
    vx: 0,
    vy: -1.5,
    grounded: false,
    ttl: 10 * TICK_HZ,
    data: tier,
    forPlayer: 0,
    value: FOOD_TIERS[tier].value,
    arcTicks: 0,
    fromX: 0,
    fromY: 0,
    targetX: 0,
    targetY: 0,
  });

  // Rare treats ride big chains: YEEHAW letters and (very rarely) a life jug.
  const luckiest = Math.max(...sim.players.map((p) => (p.alive ? p.luck : 0)), 0);
  if (chain >= 3 && sim.rng() < 0.10 + luckiest * 0.012) {
    sim.items.push({
      id: sim.nextId++,
      kind: "letter",
      x: clampedX + rangeInt(sim.rng, -40, 40),
      y: Math.min(y, FIELD_H - TILE * 2),
      vx: sim.rng() < 0.5 ? -0.4 : 0.4,
      vy: -0.6,
      grounded: false,
      ttl: 12 * TICK_HZ,
      data: rangeInt(sim.rng, 0, YEEHAW.length - 1),
      forPlayer: 0,
      value: 0,
      arcTicks: 0,
      fromX: 0,
      fromY: 0,
      targetX: 0,
      targetY: 0,
    });
  } else if (chain >= 5 && sim.rng() < 0.05) {
    sim.items.push({
      id: sim.nextId++,
      kind: "life",
      x: clampedX,
      y: Math.min(y - 30, FIELD_H - TILE * 2),
      vx: 0,
      vy: -0.5,
      grounded: false,
      ttl: 9 * TICK_HZ,
      data: 0,
      forPlayer: 0,
      value: 0,
      arcTicks: 0,
      fromX: 0,
      fromY: 0,
      targetX: 0,
      targetY: 0,
    });
  }
}

function stepItem(sim: Sim, it: Item): boolean {
  it.ttl--;
  if (it.ttl <= 0) return false;

  if (it.kind === "letter" || it.kind === "life") {
    // drifting bubble-like items
    it.x += it.vx + Math.sin((it.ttl + it.id * 31) / 34) * 0.3;
    it.y += it.vy;
    if (it.x < 30 || it.x > FIELD_W - 30) it.vx *= -1;
    if (it.y < 50) it.vy = Math.abs(it.vy) * 0.6;
    if (it.y > FIELD_H - 30) it.vy = -Math.abs(it.vy);
  } else {
    // food + jars fall and settle
    if (!it.grounded) {
      it.vy = Math.min(it.vy + 0.22, 5);
      const moved = moveBody(sim.level, it.x, it.y, it.vx, it.vy, 18, 18);
      it.x = moved.x;
      it.y = moved.y;
      it.vy = moved.vy;
      it.grounded = moved.grounded;
      if (moved.grounded) it.vx = 0;
    }
  }

  // pickup
  for (const p of sim.players) {
    if (!p.alive) continue;
    const magnet = p.loadout.tonics.includes("spectacles") ? 30 : 0;
    if (
      !circleOverlapsBox(
        it.x,
        it.y - 8,
        14 + magnet,
        p.x,
        p.y,
        P_WIDTH + 8,
        P_HEIGHT,
      )
    ) {
      continue;
    }
    switch (it.kind) {
      case "food": {
        score(sim, p.index, it.value);
        emit(sim, {
          t: "sfx",
          name: "food",
          pitch: 1 + it.data * 0.08,
        });
        break;
      }
      case "jar": {
        // your jar glows your color; a shared pour jar is first-come-first-swig
        if (it.forPlayer !== p.index && !it.shared) continue;
        startFrenzy(sim, p, it.data);
        break;
      }
      case "letter": {
        sim.lettersFound.push({ player: p.index, letter: it.data });
        emit(sim, { t: "sfx", name: "letter" });
        emit(sim, {
          t: "burst",
          text: YEEHAW[it.data] + "!",
          x: it.x,
          y: it.y - 24,
        });
        break;
      }
      case "life": {
        sim.livesFound.push({ player: p.index });
        emit(sim, { t: "sfx", name: "extraLife" });
        emit(sim, { t: "burst", text: "1-UP, CUZ!", x: it.x, y: it.y - 24, big: true });
        break;
      }
    }
    return false;
  }
  return true;
}

export function stepItems(sim: Sim): void {
  sim.items = sim.items.filter((it) => stepItem(sim, it));
}
