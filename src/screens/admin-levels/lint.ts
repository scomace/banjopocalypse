// Live lint for the level editor: the geometry audit (reachability, stranded
// enemies, content invariants) plus the tier-grid conventions documented at
// the top of every w{N}.ts. Warnings, not blocks: the rules can be broken on
// purpose, but not by accident.

import { auditLevelDef, type AuditReport } from "../../game/levels/audit";
import { levelWithWorldDefaults } from "../../game/levels/parse";
import type { LevelDef } from "../../game/levels/types";
import { WORLDS } from "../../game/levels/worlds";
import { GRID_H, GRID_W } from "../../game/sim/constants";
import { FLOOR_ROW, SPAWN_ROW, TIER_ROWS, type Grid } from "./model";

export type LintItem = {
  severity: "error" | "warn" | "info";
  message: string;
  /** cells to highlight on the canvas, if any */
  cells?: { x: number; y: number }[];
};

export type LintResult = { items: LintItem[]; audit: AuditReport | null };

export function lintLevel(def: LevelDef, world: number, level: number): LintResult {
  const items: LintItem[] = [];
  const levelIndex = (world - 1) * 11 + level;
  const grid: Grid = def.grid;

  const ragged = grid.map((r, i) => ({ i, len: r.length })).filter((r) => r.len !== GRID_W);
  if (grid.length !== GRID_H || ragged.length) {
    items.push({
      severity: "error",
      message: `grid must be ${GRID_W}x${GRID_H}; ` + (ragged.length ? `row(s) ${ragged.map((r) => r.i).join(", ")} are the wrong width` : `${grid.length} rows`),
    });
    return { items, audit: null };
  }

  // tier grid: platforms belong on rows 1/4/7/10/13 (the floor is row 16)
  const offTier: { x: number; y: number }[] = [];
  for (let y = 0; y < GRID_H; y++) {
    if (TIER_ROWS.includes(y) || y === FLOOR_ROW) continue;
    for (let x = 0; x < GRID_W; x++) if (grid[y][x] === "=") offTier.push({ x, y });
  }
  if (offTier.length) {
    const rows = [...new Set(offTier.map((c) => c.y))].join(", ");
    items.push({ severity: "warn", message: `platforms off the tier grid on row(s) ${rows} (tiers are rows 1/4/7/10/13)`, cells: offTier });
  }

  // spawn markers float unless something stands under them
  const floating: { x: number; y: number }[] = [];
  for (let y = 0; y < GRID_H - 1; y++) {
    for (let x = 0; x < GRID_W; x++) {
      const ch = grid[y][x];
      if (!"abcdJSWR".includes(ch)) continue;
      const below = grid[y + 1][x];
      if (!"=#^".includes(below)) floating.push({ x, y });
    }
  }
  if (floating.length) {
    items.push({ severity: "warn", message: `${floating.length} marker(s) have nothing directly under them (they spawn in the air)`, cells: floating });
  }

  // player spawns: present, and on the row above the floor
  for (const ch of ["1", "2"] as const) {
    let found: { x: number; y: number } | null = null;
    for (let y = 0; y < GRID_H && !found; y++) {
      const x = grid[y].indexOf(ch);
      if (x >= 0) found = { x, y };
    }
    if (!found) items.push({ severity: "warn", message: `no P${ch} spawn marker (defaults to a fixed spot)` });
    else if (found.y !== SPAWN_ROW) items.push({ severity: "warn", message: `P${ch} spawn is on row ${found.y}; want ${SPAWN_ROW} (standing on the floor)`, cells: [found] });
  }

  // the geometry audit wants world defaults merged in, like getLevelDef does
  const merged = levelWithWorldDefaults(def, WORLDS[world - 1].defaultEnemies);
  let audit: AuditReport | null = null;
  try {
    audit = auditLevelDef(levelIndex, merged);
  } catch (err) {
    items.push({ severity: "error", message: `audit failed: ${err instanceof Error ? err.message : String(err)}` });
    return { items, audit: null };
  }
  if (audit.orphanRuns.length) {
    const cells: { x: number; y: number }[] = [];
    for (const r of audit.orphanRuns) for (let x = r.c0; x <= r.c1; x++) cells.push({ x, y: r.row });
    items.push({
      severity: "error",
      message: `${audit.orphanRuns.length} surface(s) the weakest jumper can't reach: ${audit.orphanRuns.map((o) => `r${o.row} c${o.c0}-${o.c1}`).join(", ")}`,
      cells,
    });
  }
  if (audit.strandedEnemies.length) {
    items.push({
      severity: "warn",
      message: `${audit.strandedEnemies.length} enemy spawn(s) sit on unreachable surfaces`,
      cells: audit.strandedEnemies.map((e) => ({ x: Math.floor(e.x / 32), y: Math.round(e.y / 32) - 1 })),
    });
  }
  for (const msg of audit.contentErrors) {
    items.push({ severity: msg.startsWith("spawn letter") ? "error" : "warn", message: msg });
  }
  if (audit.textureCount) {
    items.push({ severity: "info", message: `${audit.textureCount} decorative wall bump(s) ignored by the audit` });
  }

  // bottom row holes are a feature; just say so
  const holes = [...grid[FLOOR_ROW]].filter((c) => c === ".").length;
  if (holes) items.push({ severity: "info", message: `${holes} open floor column(s): players and enemies wrap to the top` });

  return { items, audit };
}
