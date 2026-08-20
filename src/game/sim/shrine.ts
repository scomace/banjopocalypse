// The weapon shrine: level 5 of every world carries two glowing pedestals
// ringed by leashed guardians. Touch one and EVERY player gets that gift on
// the spot (both get the weapon at Lv1), the toucher's frenzy lights up with
// it immediately — the guardians are the test drive — and the other pedestal
// shatters. Once the arsenal is full the shrine hands out relics instead.
//
// Pure sim: the host layer only reads `sim.shrineTaken` to show the reveal.

import { rangeInt } from "../core/rng";
import type { EnemyKind } from "../levels/types";
import { P_HEIGHT, P_WIDTH, TILE, WEAPON_LEVEL_CAP } from "./constants";
import { circleOverlapsBox } from "./physics";
import { spawnEnemy } from "./enemies";
import { emit, startFrenzy } from "./sim";
import type { Loadout, PlayerState, RelicId, ShrineGift, ShrineState, Sim } from "./types";
import { weaponById } from "./weapons";

export const SHRINE_PEDESTAL_GAP = 56; // px between pedestal centers
export const SHRINE_LEASH_R = TILE * 3; // guardians roam ±3 tiles of the shrine
export const SHRINE_GUARDIANS = 3;

export type RelicDef = { id: RelicId; name: string; desc: string };

export const RELICS: RelicDef[] = [
  { id: "hootenanny", name: "The Hootenanny", desc: "Every weapon you own goes up a level." },
  {
    id: "forbiddenstill",
    name: "The Forbidden Still",
    desc: "Your meanest weapon takes its evolved form. No questions.",
  },
];

export function relicById(id: RelicId): RelicDef {
  const r = RELICS.find((x) => x.id === id);
  if (!r) throw new Error(`unknown relic ${id}`);
  return r;
}

export function giftTitle(g: ShrineGift): string {
  return g.kind === "weapon" ? weaponById(g.weaponId).name : relicById(g.relicId).name;
}

export function giftDesc(g: ShrineGift): string {
  return g.kind === "weapon" ? weaponById(g.weaponId).desc : relicById(g.relicId).desc;
}

export function pedestalX(shrine: ShrineState, i: number): number {
  return shrine.x + (i - (shrine.gifts.length - 1) / 2) * SHRINE_PEDESTAL_GAP;
}

/**
 * Apply a gift to a loadout. Returns the weapon id the recipient should
 * frenzy with (null if nothing sensible). Mutates the loadout in place — the
 * run layer shares the object with the sim, so the arsenal change sticks.
 */
export function applyGift(loadout: Loadout, gift: ShrineGift): string | null {
  if (gift.kind === "weapon") {
    const have = loadout.weapons.find((w) => w.id === gift.weaponId);
    if (have) {
      have.level = Math.min(WEAPON_LEVEL_CAP, have.level + 1);
    } else {
      loadout.weapons.push({ id: gift.weaponId, level: 1 });
    }
    return gift.weaponId;
  }
  switch (gift.relicId) {
    case "hootenanny": {
      for (const w of loadout.weapons) w.level = Math.min(WEAPON_LEVEL_CAP, w.level + 1);
      return loadout.weapons[0]?.id ?? null;
    }
    case "forbiddenstill": {
      let best: Loadout["weapons"][number] | null = null;
      for (const w of loadout.weapons) {
        if (loadout.evolved.includes(w.id)) continue;
        if (!best || w.level > best.level) best = w;
      }
      if (!best) return loadout.weapons[0]?.id ?? null;
      best.level = WEAPON_LEVEL_CAP;
      loadout.evolved.push(best.id);
      return best.id;
    }
  }
}

/** Spawn the shrine + its guardians. Called from createSim on shrine levels. */
export function createShrine(sim: Sim, gifts: ShrineGift[]): ShrineState {
  const anchor = sim.level.shrine ?? { x: sim.level.spawns.p1.x, y: sim.level.spawns.p1.y };
  const shrine: ShrineState = {
    x: anchor.x,
    y: anchor.y,
    gifts,
    taken: -1,
    takenBy: 0,
    guardianIds: [],
    nagged: false,
  };
  // guardians: the level's own roster, no minis, cycled
  const kinds = Array.from(
    new Set(sim.level.enemySpawns.map((s) => s.kind).filter((k) => k !== "glowslime_mini")),
  ) as EnemyKind[];
  const roster = kinds.length > 0 ? kinds : (["radpossum"] as EnemyKind[]);
  for (let i = 0; i < SHRINE_GUARDIANS; i++) {
    const kind = roster[i % roster.length];
    const e = spawnEnemy(
      sim,
      kind,
      shrine.x + (i - (SHRINE_GUARDIANS - 1) / 2) * 44,
      shrine.y - 2,
    );
    e.leash = { x: shrine.x, y: shrine.y - TILE, r: SHRINE_LEASH_R };
    e.facing = i % 2 === 0 ? -1 : 1;
    sim.enemies.push(e);
    shrine.guardianIds.push(e.id);
  }
  return shrine;
}

/** Claim pedestal `idx` for player `p`: everyone gets the gift, frenzies light. */
export function takeShrine(sim: Sim, p: PlayerState, idx: number): void {
  const shrine = sim.shrine;
  if (!shrine || shrine.taken >= 0) return;
  const gift = shrine.gifts[idx];
  if (!gift) return;
  shrine.taken = idx;
  shrine.takenBy = p.index;
  for (const q of sim.players) {
    if (q.spectating) continue;
    const frenzyWith = applyGift(q.loadout, gift);
    if (!q.alive) continue;
    let wIdx = frenzyWith ? q.loadout.weapons.findIndex((w) => w.id === frenzyWith) : -1;
    if (wIdx < 0 && q.loadout.weapons.length > 0) {
      wIdx = rangeInt(sim.rng, 0, q.loadout.weapons.length - 1);
    }
    if (wIdx >= 0) startFrenzy(sim, q, wIdx);
  }
  sim.shrineTaken = { player: p.index, gift };
  emit(sim, { t: "sfx", name: "weaponAcquired" });
  emit(sim, { t: "flash", color: 0xfff0b0 });
  emit(sim, { t: "shake", power: 6 });
}

/** Touch detection for the pedestals. */
export function stepShrine(sim: Sim): void {
  const shrine = sim.shrine;
  if (!shrine || shrine.taken >= 0) return;
  for (const p of sim.players) {
    if (!p.alive) continue;
    for (let i = 0; i < shrine.gifts.length; i++) {
      const px = pedestalX(shrine, i);
      if (circleOverlapsBox(px, shrine.y - 16, 17, p.x, p.y, P_WIDTH + 4, P_HEIGHT)) {
        takeShrine(sim, p, i);
        return;
      }
    }
  }
}

/** True while an unclaimed shrine should hold the level open. */
export function shrineHoldsLevel(sim: Sim): boolean {
  return sim.shrine !== null && sim.shrine.taken < 0;
}

/** Once the varmints are gone, point at the prize (once). */
export function nagShrine(sim: Sim): void {
  const shrine = sim.shrine;
  if (!shrine || shrine.nagged) return;
  shrine.nagged = true;
  emit(sim, { t: "burst", text: "CLAIM YER PRIZE!", x: shrine.x, y: shrine.y - 70, big: true });
  emit(sim, { t: "sfx", name: "jarSpawn" });
}
