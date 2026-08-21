// Persistence behind a Storage adapter so Electron can swap in a file-backed
// store later without touching game code. Schema banjo/v1/*.

import type { RunState } from "../run/run";

export type StorageAdapter = {
  get(key: string): string | null;
  set(key: string, value: string): void;
};

let adapter: StorageAdapter = {
  get: (k) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k, v) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* storage may be unavailable; the arcade goes on */
    }
  },
};

export function setStorageAdapter(a: StorageAdapter): void {
  adapter = a;
}

export type SaveData = {
  /** highest world index (1..9) unlocked as a starting checkpoint */
  worldsUnlocked: number;
  /** worlds fully cleared (fallback character unlock + stats) */
  worldsCleared: number;
  /** cousins busted out of their rescue cages (cast ids); unlocks for good */
  castRescued: string[];
  wonOnce: boolean;
  wonDeathless: boolean;
};

export type ScoreEntry = { initials: string; score: number; cast: string; level: number };

export type Settings = {
  musicVolume: number;
  sfxVolume: number;
  screenShake: boolean;
  reducedFlash: boolean;
};

const KEY_SAVE = "banjo/v1/save";
const KEY_SCORES = "banjo/v1/scores";
const KEY_SETTINGS = "banjo/v1/settings";
const KEY_INITIALS = "banjo/v1/initials";

export function loadSave(): SaveData {
  try {
    const raw = adapter.get(KEY_SAVE);
    if (raw) {
      const d = JSON.parse(raw) as Partial<SaveData>;
      return {
        worldsUnlocked: Math.max(1, Math.min(9, d.worldsUnlocked ?? 1)),
        worldsCleared: Math.max(0, Math.min(9, d.worldsCleared ?? 0)),
        castRescued: Array.isArray(d.castRescued)
          ? d.castRescued.filter((id): id is string => typeof id === "string")
          : [],
        wonOnce: !!d.wonOnce,
        wonDeathless: !!d.wonDeathless,
      };
    }
  } catch {
    /* fresh save below */
  }
  return { worldsUnlocked: 1, worldsCleared: 0, castRescued: [], wonOnce: false, wonDeathless: false };
}

export function writeSave(data: SaveData): void {
  adapter.set(KEY_SAVE, JSON.stringify(data));
}

/** Called when a world boss falls: unlock the next world checkpoint. */
export function saveCheckpoint(run: RunState): void {
  const save = loadSave();
  const clearedWorld = Math.floor((run.levelIndex - 1) / 11); // world just finished
  const nextWorld = Math.min(9, clearedWorld + 1);
  save.worldsUnlocked = Math.max(save.worldsUnlocked, nextWorld);
  save.worldsCleared = Math.max(save.worldsCleared, clearedWorld);
  writeSave(save);
}

/** A rescue cage popped: that cousin is on the roster for good. */
export function markRescued(castId: string): void {
  const save = loadSave();
  if (save.castRescued.includes(castId)) return;
  save.castRescued = [...save.castRescued, castId];
  writeSave(save);
}

export function markVictory(deathlessNoContinue: boolean): void {
  const save = loadSave();
  save.wonOnce = true;
  save.worldsCleared = 9;
  if (deathlessNoContinue) save.wonDeathless = true;
  writeSave(save);
}

export function loadScores(): ScoreEntry[] {
  try {
    const raw = adapter.get(KEY_SCORES);
    if (raw) return (JSON.parse(raw) as ScoreEntry[]).slice(0, 10);
  } catch {
    /* empty board */
  }
  return [];
}

export function addScoreEntry(entry: ScoreEntry): ScoreEntry[] {
  const scores = [...loadScores(), entry]
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
  adapter.set(KEY_SCORES, JSON.stringify(scores));
  adapter.set(KEY_INITIALS, entry.initials);
  return scores;
}

/** The last initials carved: pre-filled on the next entry so a pad player
 *  can confirm a repeat in three presses. */
export function loadLastInitials(): string {
  return adapter.get(KEY_INITIALS) ?? "";
}

export function loadSettings(): Settings {
  try {
    const raw = adapter.get(KEY_SETTINGS);
    if (raw) {
      const s = JSON.parse(raw) as Partial<Settings>;
      return {
        musicVolume: s.musicVolume ?? 0.7,
        sfxVolume: s.sfxVolume ?? 0.9,
        screenShake: s.screenShake ?? true,
        reducedFlash: s.reducedFlash ?? false,
      };
    }
  } catch {
    /* defaults below */
  }
  return { musicVolume: 0.7, sfxVolume: 0.9, screenShake: true, reducedFlash: false };
}

export function writeSettings(s: Settings): void {
  adapter.set(KEY_SETTINGS, JSON.stringify(s));
}
