// Level editor model: a grid is 17 strings of 30 chars (the LevelDef format,
// see game/levels/types.ts). Every op returns a new grid; the page keeps the
// history. Nothing here touches the DOM.

import { GRID_H, GRID_W } from "../../game/sim/constants";
import type { EnemyKind } from "../../game/levels/types";
import type { EnemyLetter } from "../../game/levels/drafts";

export type Grid = string[];

export type EditorDoc = {
  grid: Grid;
  /** per-level overrides only (world defaults fill the rest), like LevelDef */
  enemies: Partial<Record<EnemyLetter, EnemyKind>>;
  hurryTicks?: number;
  secondPour?: boolean;
  note: string;
};

export const TIER_ROWS = [1, 4, 7, 10, 13];
export const FLOOR_ROW = GRID_H - 1;
export const SPAWN_ROW = GRID_H - 2;

export function getCell(grid: Grid, x: number, y: number): string {
  if (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H) return ".";
  return grid[y][x] ?? ".";
}

export function setCell(grid: Grid, x: number, y: number, ch: string): Grid {
  if (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H) return grid;
  if (grid[y][x] === ch) return grid;
  const out = grid.slice();
  out[y] = grid[y].slice(0, x) + ch + grid[y].slice(x + 1);
  return out;
}

export function setCells(grid: Grid, cells: { x: number; y: number }[], ch: string): Grid {
  let g = grid;
  for (const c of cells) g = setCell(g, c.x, c.y, ch);
  return g;
}

/** Cells on the straight line between two cells (Bresenham), inclusive. */
export function lineCells(x0: number, y0: number, x1: number, y1: number): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0;
  let y = y0;
  for (let guard = 0; guard < 200; guard++) {
    out.push({ x, y });
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
  return out;
}

/** Symbols that may appear at most once in a level. */
export const UNIQUE_SYMBOLS = "12SWR";

/** Place a one-per-level marker, clearing wherever it was before. */
export function placeUnique(grid: Grid, x: number, y: number, ch: string): Grid {
  let g = grid;
  for (let yy = 0; yy < GRID_H; yy++) {
    const xx = g[yy].indexOf(ch);
    if (xx >= 0) g = setCell(g, xx, yy, ".");
  }
  return setCell(g, x, y, ch);
}

// ---------------------------------------------------------------- runs
// A run is a horizontal stretch of one tile symbol (= # ^). The select tool
// moves and resizes these as units: that is how "platform length/location"
// is edited without pixel-pushing single cells.

export const RUN_SYMBOLS = "=#^";

export type GridRun = { row: number; c0: number; c1: number; ch: string };

export function findRuns(grid: Grid): GridRun[] {
  const runs: GridRun[] = [];
  for (let y = 0; y < GRID_H; y++) {
    let start = -1;
    let cur = "";
    for (let x = 0; x <= GRID_W; x++) {
      const ch = x < GRID_W ? grid[y][x] : ".";
      const isRun = RUN_SYMBOLS.includes(ch);
      if (isRun && ch === cur) continue;
      if (start >= 0) runs.push({ row: y, c0: start, c1: x - 1, ch: cur });
      start = isRun ? x : -1;
      cur = isRun ? ch : "";
    }
  }
  return runs;
}

export function runAt(grid: Grid, x: number, y: number): GridRun | null {
  const ch = getCell(grid, x, y);
  if (!RUN_SYMBOLS.includes(ch)) return null;
  let c0 = x;
  let c1 = x;
  while (c0 > 0 && grid[y][c0 - 1] === ch) c0--;
  while (c1 < GRID_W - 1 && grid[y][c1 + 1] === ch) c1++;
  return { row: y, c0, c1, ch };
}

export function sameRun(a: GridRun | null, b: GridRun | null): boolean {
  return !!a && !!b && a.row === b.row && a.c0 === b.c0 && a.c1 === b.c1 && a.ch === b.ch;
}

/** Lift a run off the grid and put it back at a new span (clamped). */
export function relocateRun(grid: Grid, run: GridRun, row: number, c0: number, c1: number): { grid: Grid; run: GridRun } {
  const width = Math.max(1, c1 - c0 + 1);
  const r = Math.max(0, Math.min(GRID_H - 1, row));
  let start = Math.max(0, Math.min(GRID_W - width, c0));
  let end = start + width - 1;
  if (end > GRID_W - 1) {
    end = GRID_W - 1;
    start = Math.max(0, end - width + 1);
  }
  let g = grid;
  for (let x = run.c0; x <= run.c1; x++) g = setCell(g, x, run.row, ".");
  for (let x = start; x <= end; x++) g = setCell(g, x, r, run.ch);
  return { grid: g, run: { row: r, c0: start, c1: end, ch: run.ch } };
}

export function deleteRun(grid: Grid, run: GridRun): Grid {
  let g = grid;
  for (let x = run.c0; x <= run.c1; x++) g = setCell(g, x, run.row, ".");
  return g;
}

// ---------------------------------------------------------------- diff
export function diffCells(a: Grid, b: Grid): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (let y = 0; y < GRID_H; y++) {
    if (a[y] === b[y]) continue;
    for (let x = 0; x < GRID_W; x++) if (a[y][x] !== b[y][x]) out.push({ x, y });
  }
  return out;
}

/** Human summary of grid changes, one line per changed span, for the note
 *  that travels with an exported draft ("r13 c4-10: '=' -> '.'"). */
export function diffSummary(authored: Grid, edited: Grid): string[] {
  const lines: string[] = [];
  for (let y = 0; y < GRID_H; y++) {
    if (authored[y] === edited[y]) continue;
    let x = 0;
    while (x < GRID_W) {
      if (authored[y][x] === edited[y][x]) {
        x++;
        continue;
      }
      const from = authored[y][x];
      const to = edited[y][x];
      let x1 = x;
      while (x1 + 1 < GRID_W && authored[y][x1 + 1] === from && edited[y][x1 + 1] === to) x1++;
      const span = x1 === x ? `c${x}` : `c${x}-${x1}`;
      lines.push(`r${y} ${span}: '${from}' -> '${to}'`);
      x = x1 + 1;
    }
  }
  return lines;
}

// ---------------------------------------------------------------- tools
export type ToolKind = "paint" | "stamp" | "unique" | "erase" | "hole" | "select";

export type Tool = {
  id: string;
  kind: ToolKind;
  /** grid symbol written by paint/stamp/unique tools */
  ch: string;
  label: string;
  hotkey: string;
  hint: string;
};

export const TOOLS: Tool[] = [
  { id: "select", kind: "select", ch: "", label: "Select / move", hotkey: "v", hint: "click a platform run to select; drag its body to move, its ends to resize; arrows nudge, Delete removes" },
  { id: "platform", kind: "paint", ch: "=", label: "Platform", hotkey: "=", hint: "one-way: jump up through. Drag paints along the row (Shift frees the row)" },
  { id: "solid", kind: "paint", ch: "#", label: "Solid", hotkey: "#", hint: "solid block, drag paints freely" },
  { id: "spikes", kind: "paint", ch: "^", label: "Spikes", hotkey: "^", hint: "pop empty bubbles, hurt players standing on them" },
  { id: "erase", kind: "erase", ch: ".", label: "Erase", hotkey: ".", hint: "clear cells (right-drag erases with any tool)" },
  { id: "hole", kind: "hole", ch: ".", label: "Floor hole", hotkey: "h", hint: "erase the bottom row only: fall through, drop in from the top" },
  { id: "windUp", kind: "paint", ch: "~", label: "Updraft", hotkey: "~", hint: "strong lift column for bubbles" },
  { id: "windLeft", kind: "paint", ch: "<", label: "Wind left", hotkey: "<", hint: "leftward current" },
  { id: "windRight", kind: "paint", ch: ">", label: "Wind right", hotkey: ">", hint: "rightward current" },
  { id: "p1", kind: "unique", ch: "1", label: "P1 spawn", hotkey: "1", hint: "row 15 so they start on the floor" },
  { id: "p2", kind: "unique", ch: "2", label: "P2 spawn", hotkey: "2", hint: "row 15 so they start on the floor" },
  { id: "ea", kind: "stamp", ch: "a", label: "Enemy a", hotkey: "a", hint: "on the row directly ABOVE its platform" },
  { id: "eb", kind: "stamp", ch: "b", label: "Enemy b", hotkey: "b", hint: "on the row directly ABOVE its platform" },
  { id: "ec", kind: "stamp", ch: "c", label: "Enemy c", hotkey: "c", hint: "on the row directly ABOVE its platform" },
  { id: "ed", kind: "stamp", ch: "d", label: "Enemy d", hotkey: "d", hint: "on the row directly ABOVE its platform" },
  { id: "jar", kind: "stamp", ch: "J", label: "Jar point", hotkey: "j", hint: "preferred mason-jar spawn" },
  { id: "secret", kind: "unique", ch: "S", label: "Secret door", hotkey: "s", hint: "warp-cellar door, deathless runs only" },
  { id: "shrine", kind: "unique", ch: "W", label: "Weapon shrine", hotkey: "w", hint: "level 5 of every world only" },
  { id: "cage", kind: "unique", ch: "R", label: "Rescue cage", hotkey: "r", hint: "the cousin assigned to this level sits here" },
];

export function toolByHotkey(key: string): Tool | undefined {
  return TOOLS.find((t) => t.hotkey === key);
}
