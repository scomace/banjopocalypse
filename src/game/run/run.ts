// The run layer: campaign state across levels. Lives, score, arsenal,
// upgrade cards, YEEHAW progress, continues, world checkpoints. The sim is
// per-level; this survives between sims and talks to the save system.

import { deriveSeed, mulberry32, shuffled, type Rng } from "../core/rng";
import { EXTRA_LIFE_EVERY, YEEHAW, YEEHAW_BONUS } from "../sim/constants";
import type { Loadout } from "../sim/types";
import { WEAPONS, weaponById } from "../sim/weapons";
import { castById } from "../cast";

export const MAX_WEAPONS = 6;
export const MAX_TONICS = 4;
export const MAX_WEAPON_LEVEL = 5;
export const START_LIVES = 3;
export const CONTINUES = 3;

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
};

export type Card =
  | { kind: "newWeapon"; weaponId: string }
  | { kind: "upgrade"; weaponId: string; toLevel: number }
  | { kind: "evolve"; weaponId: string }
  | { kind: "tonic"; tonicId: string };

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
      weapons: [{ id: cast.signatureWeapon, level: 2 }],
      tonics: [],
      evolved: [],
    },
    letters: [false, false, false, false, false, false],
    rerollsLeft: 1,
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

/** Deal 3 cards for a player at the intermission. */
export function dealCards(run: RunState, pr: PlayerRun): Card[] {
  const rng = run.cardRng;
  const cards: Card[] = [];
  const options: Card[] = [];

  // evolutions first: weapon at max level + paired tonic owned + not evolved
  for (const w of pr.loadout.weapons) {
    const def = weaponById(w.id);
    if (
      w.level >= MAX_WEAPON_LEVEL &&
      !pr.loadout.evolved.includes(w.id) &&
      pr.loadout.tonics.includes(def.evolveTonic)
    ) {
      options.push({ kind: "evolve", weaponId: w.id });
    }
  }
  // upgrades
  for (const w of pr.loadout.weapons) {
    if (w.level < MAX_WEAPON_LEVEL) {
      options.push({ kind: "upgrade", weaponId: w.id, toLevel: w.level + 1 });
      // upgrades are the bread and butter: weight them double
      options.push({ kind: "upgrade", weaponId: w.id, toLevel: w.level + 1 });
    }
  }
  // new weapons
  if (pr.loadout.weapons.length < MAX_WEAPONS) {
    for (const def of WEAPONS) {
      if (!pr.loadout.weapons.some((w) => w.id === def.id)) {
        options.push({ kind: "newWeapon", weaponId: def.id });
      }
    }
  }
  // tonics
  if (pr.loadout.tonics.length < MAX_TONICS) {
    for (const t of TONICS) {
      if (!pr.loadout.tonics.includes(t.id)) {
        options.push({ kind: "tonic", tonicId: t.id });
      }
    }
  }

  const pool = shuffled(rng, options);
  const seen = new Set<string>();
  for (const c of pool) {
    const key =
      c.kind === "tonic" ? `t:${c.tonicId}` : `${c.kind}:${(c as { weaponId: string }).weaponId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    cards.push(c);
    if (cards.length === 3) break;
  }
  return cards;
}

export function applyCard(pr: PlayerRun, card: Card): void {
  switch (card.kind) {
    case "newWeapon":
      if (pr.loadout.weapons.length < MAX_WEAPONS) {
        pr.loadout.weapons.push({ id: card.weaponId, level: 1 });
      }
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
    case "newWeapon":
      return weaponById(card.weaponId).name;
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
    case "newWeapon":
      return weaponById(card.weaponId).desc;
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
    pr.loadout = {
      weapons: [{ id: cast.signatureWeapon, level: 2 }],
      tonics: [],
      evolved: [],
    };
  }
}
