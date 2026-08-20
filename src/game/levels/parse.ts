import { GRID_H, GRID_W, TILE } from "../sim/constants";
import {
  type EnemyKind,
  type LevelDef,
  type ParsedLevel,
  T_EMPTY,
  T_PLATFORM,
  T_SOLID,
  T_SPIKES,
  W_LEFT,
  W_NONE,
  W_RIGHT,
  W_UP,
} from "./types";

const tileCenter = (col: number, row: number) => ({
  x: col * TILE + TILE / 2,
  y: row * TILE + TILE, // feet anchor: bottom of the tile
});

export function parseLevel(def: LevelDef): ParsedLevel {
  if (def.grid.length !== GRID_H) {
    throw new Error(`level grid must have ${GRID_H} rows, got ${def.grid.length}`);
  }
  const collision: Uint8Array[] = [];
  const wind: Uint8Array[] = [];
  let p1 = { x: 5 * TILE, y: 15 * TILE };
  let p2 = { x: 24 * TILE, y: 15 * TILE };
  const enemySpawns: ParsedLevel["enemySpawns"] = [];
  const jarPoints: ParsedLevel["jarPoints"] = [];
  let secretDoor: ParsedLevel["secretDoor"] = null;
  let shrine: ParsedLevel["shrine"] = null;

  for (let y = 0; y < GRID_H; y++) {
    const row = def.grid[y].padEnd(GRID_W, ".");
    const cRow = new Uint8Array(GRID_W);
    const wRow = new Uint8Array(GRID_W);
    for (let x = 0; x < GRID_W; x++) {
      const ch = row[x];
      switch (ch) {
        case "#":
          cRow[x] = T_SOLID;
          break;
        case "=":
          cRow[x] = T_PLATFORM;
          break;
        case "^":
          cRow[x] = T_SPIKES;
          break;
        case "~":
          wRow[x] = W_UP;
          break;
        case "<":
          wRow[x] = W_LEFT;
          break;
        case ">":
          wRow[x] = W_RIGHT;
          break;
        case "1":
          p1 = tileCenter(x, y);
          break;
        case "2":
          p2 = tileCenter(x, y);
          break;
        case "J":
          jarPoints.push(tileCenter(x, y));
          break;
        case "S":
          secretDoor = tileCenter(x, y);
          break;
        case "W":
          shrine = tileCenter(x, y);
          break;
        case "a":
        case "b":
        case "c":
        case "d": {
          const kind = def.enemies[ch];
          if (kind) enemySpawns.push({ kind, ...tileCenter(x, y) });
          break;
        }
        default:
          cRow[x] = T_EMPTY;
          wRow[x] = W_NONE;
      }
    }
    collision.push(cRow);
    wind.push(wRow);
  }
  return { collision, wind, spawns: { p1, p2 }, enemySpawns, jarPoints, secretDoor, shrine };
}

/** Merge a world's default enemy letters with a level's overrides. */
export function levelWithWorldDefaults(
  def: LevelDef,
  defaults: Partial<Record<"a" | "b" | "c" | "d", EnemyKind>>,
): LevelDef {
  return { ...def, enemies: { ...defaults, ...def.enemies } };
}
