// The run layer: campaign state across levels. Lives, score, arsenal,
// upgrade cards, YEEHAW progress, continues, world checkpoints. The sim is
// per-level; this survives between sims and talks to the save system.
//
// Weapon flow: you start with your signature weapon at Lv1 and nothing else.
// New weapons come ONLY from the shrine on level 5 of each world (pick one of
// two pedestals, see sim/shrine.ts); intermission cards level up what you
// have, hand out tonics, or small bonuses. Once the arsenal is full the
// shrines switch to relics.

import { deriveSeed, mulberry32, shuffled, type Rng } from "../core/rng";
import { EXTRA_LIFE_EVERY, YEEHAW, YEEHAW_BONUS } from "../sim/constants";
import type { Loadout, ShrineGift } from "../sim/types";
import { WEAPONS, weaponById } from "../sim/weapons";
import { RELICS } from "../sim/shrine";
import { castById } from "../cast";
import { isBossLevel, levelInWorld } from "../levels/worlds";

export const MAX_WEAPONS = 6;
export const MAX_TONICS = 4;
export const MAX_WEAPON_LEVEL = 5;
export const START_LIVES = 3;
export const CONTINUES = 3;
/** Signature weapon starts here; four Lv-ups fill levels 1-4 before shrine #1. */
export const SIGNATURE_START_LEVEL = 1;
/** Shrines sit on this level of every world (1..11). */
export const SHRINE_LEVEL_IN_WORLD = 5;
export const PENNIES_BONUS = 10000;

export type TonicDef = { id: string; name: string; desc: string };

export const TONICS: TonicDef[] = [
  { id: "grit", name: "Grit", desc: "Weapons hit 50% harder." },
  { id: "rocketfuel", name: "Rocket-Fuel Shine", desc: "Run 18% faster." },
  { id: "lungbutter", name: "Lung Butter", desc: "Belches fly farther." },
  { id: "hogfat", name: "Hog Fat", desc: "Survive one hit per level." },
  { id: "rabbitfoot", name: "Lucky Rabbit Foot", desc: "More drops, more jars." },
  { id: "pickinfinger", name: "Extra Pickin' Finger", desc: "Frenzies last 5s longer." },
  { id: "spectacles", name: "Granny's Spectacles", desc: "Vacuum up nearby vittles." },
  { id: "chaw", name: "Chaw of Immortality", desc: "+1 life, right now." },
];

export type PlayerRun = {
  castId: string;
  lives: number;
  score: number;
  nextLifeAt: number;
  loadout: Loadout;
  letters: boolean[]; // Y E E H A W collected
  rerollsLeft: number;
  /** Jar o' Lightnin' card: next level opens in a frenzy */
  headStart: boolean;
};

export type Card =
  | { kind: "upgrade"; weaponId: string; toLevel: number }
  | { kind: "evolve"; weaponId: string }
  | { kind: "tonic"; tonicId: string }
  // bonus fillers: keep every hand at three real choices
  | { kind: "life" }
  | { kind: "headstart" }
  | { kind: "pennies" };

export type RunState = {
  seed: number;
  levelIndex: number; // 1..99
  players: (PlayerRun | null)[];
  continuesLeft: number;
  deathlessThisWorld: boolean;
  cardRng: Rng;
  /** pending warp: secret cellar skips one level */
  warpPending: boolean;
};

export function newPlayerRun(castId: string): PlayerRun {
  const cast = castById(castId);
  return {
    castId,
    lives: START_LIVES,
    score: 0,
    nextLifeAt: EXTRA_LIFE_EVERY,
    loadout: {
      weapons: [{ id: cast.signatureWeapon, level: SIGNATURE_START_LEVEL }],
      tonics: [],
      evolved: [],
    },
    letters: [false, false, false, false, false, false],
    rerollsLeft: 1,
    headStart: false,
  };
}

export function newRun(
  seed: number,
  startLevel: number,
  castIds: (string | null)[],
): RunState {
  return {
    seed,
    levelIndex: startLevel,
    players: castIds.map((c) => (c ? newPlayerRun(c) : null)),
    continuesLeft: CONTINUES,
    deathlessThisWorld: true,
    cardRng: mulberry32(deriveSeed(seed, 777)),
    warpPending: false,
  };
}

export function addScore(pr: PlayerRun, amount: number): { extraLife: boolean } {
  pr.score += amount;
  if (pr.score >= pr.nextLifeAt) {
    pr.nextLifeAt += EXTRA_LIFE_EVERY;
    pr.lives++;
    return { extraLife: true };
  }
  return { extraLife: false };
}

export function collectLetter(pr: PlayerRun, letter: number): { completed: boolean } {
  // YEEHAW has two E's; fill the first empty matching slot
  const ch = YEEHAW[letter];
  for (let i = 0; i < YEEHAW.length; i++) {
    if (YEEHAW[i] === ch && !pr.letters[i]) {
      pr.letters[i] = true;
      break;
    }
  }
  if (pr.letters.every(Boolean)) {
    pr.letters = [false, false, false, false, false, false];
    pr.lives++;
    pr.score += YEEHAW_BONUS;
    return { completed: true };
  }
  return { completed: false };
}

/**
 * Deal 3 cards for a player at the intermission.
 *
 * Shape: one weapon card (Lv-up or evolve) whenever one exists, at most one
 * tonic, then more weapon cards for other weapons, then bonus fillers. With a
 * single weapon (levels 1-4) that reads `Lv-up / tonic / bonus`; with two or
 * more it is mostly `Lv-up / Lv-up / tonic`. Tonics stop being filler, so the
 * cap doesn't get hit by level 5, and the hand never collapses below three.
 */
export function dealCards(run: RunState, pr: PlayerRun): Card[] {
  const rng = run.cardRng;

  const weaponCards: Card[] = [];
  for (const w of pr.loadout.weapons) {
    const def = weaponById(w.id);
    if (
      w.level >= MAX_WEAPON_LEVEL &&
      !pr.loadout.evolved.includes(w.id) &&
      pr.loadout.tonics.includes(def.evolveTonic)
    ) {
      weaponCards.push({ kind: "evolve", weaponId: w.id });
    } else if (w.level < MAX_WEAPON_LEVEL) {
      weaponCards.push({ kind: "upgrade", weaponId: w.id, toLevel: w.level + 1 });
    }
  }
  const tonicCards: Card[] =
    pr.loadout.tonics.length < MAX_TONICS
      ? TONICS.filter((t) => !pr.loadout.tonics.includes(t.id)).map(
          (t): Card => ({ kind: "tonic", tonicId: t.id }),
        )
      : [];
  const fillers: Card[] = [{ kind: "life" }, { kind: "headstart" }, { kind: "pennies" }];

  const wPool = shuffled(rng, weaponCards);
  const tPool = shuffled(rng, tonicCards);
  const fPool = shuffled(rng, fillers);
  const hand: Card[] = [];
  if (wPool.length) hand.push(wPool.shift()!);
  // a tonic every hand while the arsenal is thin; 65% once Lv-ups compete
  if (tPool.length && (wPool.length === 0 || rng() < 0.65)) hand.push(tPool.shift()!);
  while (hand.length < 3 && wPool.length) hand.push(wPool.shift()!);
  if (hand.length < 3 && tPool.length && !hand.some((c) => c.kind === "tonic")) {
    hand.push(tPool.shift()!);
  }
  while (hand.length < 3 && fPool.length) hand.push(fPool.shift()!);
  return shuffled(rng, hand);
}

// ---------------------------------------------------------------- shrines

export function isShrineLevel(levelIndex: number): boolean {
  return !isBossLevel(levelIndex) && levelInWorld(levelIndex) === SHRINE_LEVEL_IN_WORLD;
}

/**
 * What the shrine on this level offers: two weapons nobody in the party owns
 * (the pick is shared — whoever touches, everyone gets it), or relics once
 * anyone's arsenal is full / the bestiary of weapons is exhausted. Seeded
 * from (run seed, level) so rerolling the intermission can't fish for it.
 */
export function shrineGiftsFor(run: RunState): ShrineGift[] {
  if (!isShrineLevel(run.levelIndex)) return [];
  const rng = mulberry32(deriveSeed(run.seed, 5000 + run.levelIndex));
  const live = run.players.filter((p): p is PlayerRun => !!p && p.lives > 0);
  const owned = new Set<string>();
  for (const p of live) for (const w of p.loadout.weapons) owned.add(w.id);
  const anyFull = live.some((p) => p.loadout.weapons.length >= MAX_WEAPONS);
  const candidates = anyFull ? [] : WEAPONS.filter((w) => !owned.has(w.id)).map((w) => w.id);
  const gifts: ShrineGift[] = shuffled(rng, candidates)
    .slice(0, 2)
    .map((id): ShrineGift => ({ kind: "weapon", weaponId: id }));
  const relics = shuffled(rng, RELICS.map((r) => r.id));
  while (gifts.length < 2 && relics.length) {
    gifts.push({ kind: "relic", relicId: relics.shift()! });
  }
  return gifts;
}

export function applyCard(pr: PlayerRun, card: Card): void {
  switch (card.kind) {
    case "life":
      pr.lives++;
      break;
    case "headstart":
      pr.headStart = true;
      break;
    case "pennies":
      addScore(pr, PENNIES_BONUS);
      break;
    case "upgrade": {
      const w = pr.loadout.weapons.find((x) => x.id === card.weaponId);
      if (w) w.level = Math.min(MAX_WEAPON_LEVEL, card.toLevel);
      break;
    }
    case "evolve":
      if (!pr.loadout.evolved.includes(card.weaponId)) {
        pr.loadout.evolved.push(card.weaponId);
      }
      break;
    case "tonic":
      if (!pr.loadout.tonics.includes(card.tonicId)) {
        pr.loadout.tonics.push(card.tonicId);
        if (card.tonicId === "chaw") pr.lives++;
      }
      break;
  }
}

export function cardTitle(card: Card): string {
  switch (card.kind) {
    case "life":
      return "Spare Overalls";
    case "headstart":
      return "Jar o' Lightnin'";
    case "pennies":
      return "Coffee Can Savings";
    case "upgrade":
      return `${weaponById(card.weaponId).name} Lv${card.toLevel}`;
    case "evolve":
      return weaponById(card.weaponId).evolvedName;
    case "tonic":
      return TONICS.find((t) => t.id === card.tonicId)?.name ?? card.tonicId;
  }
}

export function cardDesc(card: Card): string {
  switch (card.kind) {
    case "life":
      return "+1 life. Patched at the knees.";
    case "headstart":
      return "Start the next level already frenzied.";
    case "pennies":
      return `+${PENNIES_BONUS.toLocaleString()} points, counted twice.`;
    case "upgrade":
      return "Meaner, faster, more of it.";
    case "evolve":
      return "The forbidden form. Hoo boy.";
    case "tonic":
      return TONICS.find((t) => t.id === card.tonicId)?.desc ?? "";
  }
}

/** A continue: restart the current world, arsenal reset to signature. */
export function applyContinue(run: RunState): void {
  run.continuesLeft--;
  run.levelIndex = Math.floor((run.levelIndex - 1) / 11) * 11 + 1;
  run.deathlessThisWorld = true;
  for (const pr of run.players) {
    if (!pr) continue;
    const cast = castById(pr.castId);
    pr.lives = START_LIVES;
    pr.headStart = false;
    pr.loadout = {
      weapons: [{ id: cast.signatureWeapon, level: SIGNATURE_START_LEVEL }],
      tonics: [],
      evolved: [],
    };
  }
}
