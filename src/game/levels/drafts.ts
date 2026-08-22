// Level drafts: the level editor (/admin/levels) saves its work here instead
// of into the authored w{1-9}.ts files. A draft is one JSON file per level
// slot in src/game/levels/drafts/, written by the Vite dev-server plugin
// (scripts/vite-level-drafts-plugin.ts) and promoted into the real level file
// by `npm run levels:promote w4-07` once it's good.
//
// In dev the game loads every draft at boot (main.tsx -> loadDevDrafts) and
// getLevelDef() hands back the draft instead of the authored grid, so "save in
// the editor, play in the game" needs no build step and no reload. Production
// builds never see this module do anything: the drafts folder is not in the
// module graph and the fetch only exists on the dev server.
//
// This file is shared by the browser, the Vite plugin (Node) and the scripts,
// so it must stay free of DOM/Node-only imports.

import { GRID_H, GRID_W } from "../sim/constants";
import type { EnemyKind, LevelDef } from "./types";

export const DRAFT_VERSION = 1;

/** The symbols a grid may contain (see types.ts for what they mean). */
export const GRID_SYMBOLS = "#=^. 12abcd~<>JSWR";

export const ENEMY_KINDS: EnemyKind[] = [
  "radpossum",
  "jackalope",
  "cartgator",
  "fanbat",
  "tweekergecko",
  "gaswisp",
  "corndoghound",
  "balloonclown",
  "skeeter",
  "snapturtle",
  "tirefireimp",
  "mufflersnake",
  "glowslime",
  "guvdrone",
  "cyclonechick",
  "flyincow",
  "impfiddler",
  "hellhound",
  "glowslime_mini",
];

export type EnemyLetter = "a" | "b" | "c" | "d";
export const ENEMY_LETTERS: EnemyLetter[] = ["a", "b", "c", "d"];

export type LevelDraft = {
  version: typeof DRAFT_VERSION;
  /** World 1..9 and level-in-world 1..11; together they name the slot. */
  world: number;
  level: number;
  grid: string[];
  enemies: Partial<Record<EnemyLetter, EnemyKind>>;
  hurryTicks?: number;
  secondPour?: boolean;
  /** Free text for whoever promotes it: what was tried, how it felt. */
  note?: string;
  /** gridHash() of the authored grid the draft started from. A mismatch at
   *  promote time means the real level moved underneath the draft. */
  basedOn?: string;
  /** ISO timestamp, stamped by the save endpoint. */
  savedAt?: string;
};

/** "w4-07": world 4, level 7. Zero-padded so the folder sorts. */
export function draftId(world: number, level: number): string {
  return `w${world}-${String(level).padStart(2, "0")}`;
}

export function parseDraftId(id: string): { world: number; level: number } | null {
  const m = /^w([1-9])-(0[1-9]|1[01])$/.exec(id);
  return m ? { world: Number(m[1]), level: Number(m[2]) } : null;
}

export function absoluteLevelIndex(world: number, level: number): number {
  return (world - 1) * 11 + level;
}

export function slotOfLevelIndex(levelIndex1: number): { world: number; level: number } {
  const idx = Math.max(1, Math.min(99, levelIndex1));
  return { world: Math.ceil(idx / 11), level: ((idx - 1) % 11) + 1 };
}

/** FNV-1a over the joined rows. Stable across browser and Node, no crypto. */
export function gridHash(grid: string[]): string {
  let h = 0x811c9dc5;
  const s = grid.join("\n");
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** Pad/trim every row to GRID_W and replace spaces with dots. */
export function normalizeGrid(grid: string[]): string[] {
  return grid.map((row) => row.replace(/ /g, ".").padEnd(GRID_W, ".").slice(0, GRID_W));
}

/** Throwing validator; returns a clean copy with only known fields. */
export function validateDraft(body: unknown): LevelDraft {
  const d = body as Partial<LevelDraft> | null;
  if (!d || typeof d !== "object") throw new Error("draft must be an object");
  if (d.version !== DRAFT_VERSION) throw new Error(`unsupported draft version ${String(d.version)}`);
  const isInt = (v: unknown, lo: number, hi: number) =>
    typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi;
  if (!isInt(d.world, 1, 9)) throw new Error("world must be 1..9");
  if (!isInt(d.level, 1, 11)) throw new Error("level must be 1..11");
  if (!Array.isArray(d.grid) || d.grid.length !== GRID_H) {
    throw new Error(`grid must have ${GRID_H} rows`);
  }
  d.grid.forEach((row, i) => {
    if (typeof row !== "string" || row.length !== GRID_W) {
      throw new Error(`grid row ${i} must be ${GRID_W} chars`);
    }
    for (const ch of row) {
      if (!GRID_SYMBOLS.includes(ch)) throw new Error(`grid row ${i}: unknown symbol '${ch}'`);
    }
  });
  const enemies: LevelDraft["enemies"] = {};
  if (d.enemies !== undefined) {
    if (!d.enemies || typeof d.enemies !== "object") throw new Error("enemies must be an object");
    for (const [k, v] of Object.entries(d.enemies)) {
      if (!ENEMY_LETTERS.includes(k as EnemyLetter)) throw new Error(`enemies: bad letter '${k}'`);
      if (v === undefined) continue;
      if (!ENEMY_KINDS.includes(v as EnemyKind)) throw new Error(`enemies.${k}: unknown kind '${String(v)}'`);
      enemies[k as EnemyLetter] = v as EnemyKind;
    }
  }
  if (d.hurryTicks !== undefined && !isInt(d.hurryTicks, 1, 60 * 60 * 10)) {
    throw new Error("hurryTicks must be a positive integer");
  }
  if (d.secondPour !== undefined && typeof d.secondPour !== "boolean") {
    throw new Error("secondPour must be a boolean");
  }
  for (const k of ["note", "basedOn", "savedAt"] as const) {
    if (d[k] !== undefined && typeof d[k] !== "string") throw new Error(`${k} must be a string`);
  }
  return {
    version: DRAFT_VERSION,
    world: d.world as number,
    level: d.level as number,
    grid: [...(d.grid as string[])],
    enemies,
    ...(d.hurryTicks !== undefined ? { hurryTicks: d.hurryTicks } : {}),
    ...(d.secondPour !== undefined ? { secondPour: d.secondPour } : {}),
    ...(d.note ? { note: d.note } : {}),
    ...(d.basedOn ? { basedOn: d.basedOn } : {}),
    ...(d.savedAt ? { savedAt: d.savedAt } : {}),
  };
}

export function draftToLevelDef(d: LevelDraft): LevelDef {
  return {
    grid: [...d.grid],
    enemies: { ...d.enemies },
    ...(d.hurryTicks !== undefined ? { hurryTicks: d.hurryTicks } : {}),
    ...(d.secondPour !== undefined ? { secondPour: d.secondPour } : {}),
  };
}

// ---------------------------------------------------------------- overrides
// The in-memory registry getLevelDef() consults. Keyed by absolute level
// index. Populated by loadDevDrafts() (browser) or the --drafts flag of the
// scripts (Node); the editor also pokes it directly after a save so the game
// tab picks the change up without a reload.

const overrides = new Map<number, LevelDraft>();

export function registerDraft(d: LevelDraft): void {
  overrides.set(absoluteLevelIndex(d.world, d.level), d);
}

export function unregisterDraft(world: number, level: number): void {
  overrides.delete(absoluteLevelIndex(world, level));
}

export function clearDrafts(): void {
  overrides.clear();
}

export function draftForLevel(levelIndex1: number): LevelDraft | undefined {
  return overrides.get(levelIndex1);
}

export function registeredDrafts(): LevelDraft[] {
  return [...overrides.values()].sort(
    (a, b) => absoluteLevelIndex(a.world, a.level) - absoluteLevelIndex(b.world, b.level),
  );
}

// Whether the GAME should honour registered drafts. On by default in dev; the
// editor exposes the switch so you can A/B the authored level against the
// draft without deleting anything. Stored per browser.
const ENABLED_KEY = "banjo.levelDrafts.enabled";

// A draft handed over in the URL (the editor's Play button) always applies:
// that tab was opened specifically to play it.
let forcedOn = false;

export function draftsEnabledInGame(): boolean {
  if (forcedOn) return true;
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(ENABLED_KEY) !== "0";
  } catch {
    return true;
  }
}

/** `?draft=<json LevelDraft>`: register it and pin drafts on for this tab.
 *  Works in production builds too, which is how the shipped editor can still
 *  playtest without a dev server. Returns the draft, or null if absent/bad. */
export function registerDraftFromUrl(search: string): LevelDraft | null {
  const raw = new URLSearchParams(search).get("draft");
  if (!raw) return null;
  try {
    const draft = validateDraft(JSON.parse(raw));
    registerDraft(draft);
    forcedOn = true;
    return draft;
  } catch {
    return null;
  }
}

export function setDraftsEnabledInGame(on: boolean): void {
  try {
    if (on) localStorage.removeItem(ENABLED_KEY);
    else localStorage.setItem(ENABLED_KEY, "0");
  } catch {
    // storage blocked: the flag is a convenience, not a contract
  }
}

// ------------------------------------------------------------------ export
/** The level as it would appear inside a w{N}.ts array: paste-ready. */
export function levelDefToTs(def: LevelDef, indent = "  "): string {
  const i1 = indent;
  const i2 = indent + "  ";
  const i3 = indent + "    ";
  const lines: string[] = [];
  lines.push(`${i1}{`);
  lines.push(`${i2}grid: [`);
  for (const row of def.grid) lines.push(`${i3}${JSON.stringify(row)},`);
  lines.push(`${i2}],`);
  lines.push(`${i2}enemies: ${enemiesToTs(def.enemies)},`);
  if (def.hurryTicks !== undefined) lines.push(`${i2}hurryTicks: ${def.hurryTicks},`);
  if (def.secondPour !== undefined) lines.push(`${i2}secondPour: ${def.secondPour},`);
  lines.push(`${i1}},`);
  return lines.join("\n");
}

/** `{ a: "radpossum", b: "jackalope" }` in the same style the level files use. */
export function enemiesToTs(enemies: LevelDef["enemies"]): string {
  const parts = ENEMY_LETTERS.filter((l) => enemies[l]).map((l) => `${l}: ${JSON.stringify(enemies[l])}`);
  return parts.length ? `{ ${parts.join(", ")} }` : "{}";
}
