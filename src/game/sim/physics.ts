// Tile collision for feet-anchored AABBs on the 30×17 grid.
// Solid blocks everything; platforms block only downward crossings of their
// top edge; spikes are solid-ish to walkers but mainly a hazard flag.
// Vertical screen wrap: fall off the bottom, drop in from the top.

import { FIELD_H, FIELD_W, GRID_H, GRID_W, TILE } from "./constants";
import { T_PLATFORM, T_SOLID, T_SPIKES, type ParsedLevel } from "../levels/types";

export function tileAt(level: ParsedLevel, px: number, py: number): number {
  const x = Math.floor(px / TILE);
  const y = Math.floor(py / TILE);
  if (x < 0 || x >= GRID_W) return T_SOLID; // side walls are always solid
  if (y < 0 || y >= GRID_H) return 0; // top/bottom open for wrap
  return level.collision[y][x];
}

export function isSolidAt(level: ParsedLevel, px: number, py: number): boolean {
  const t = tileAt(level, px, py);
  return t === T_SOLID || t === T_SPIKES;
}

export function windAt(level: ParsedLevel, px: number, py: number): number {
  const x = Math.floor(px / TILE);
  const y = Math.floor(py / TILE);
  if (x < 0 || x >= GRID_W || y < 0 || y >= GRID_H) return 0;
  return level.wind[y][x];
}

export type MoveResult = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  grounded: boolean;
  hitWall: boolean;
  hitCeiling: boolean;
  onSpikes: boolean;
  wrapped: boolean;
};

/**
 * Move a feet-anchored box (w wide, h tall) through the level.
 * `dropThrough` is reserved for future down-jump support (unused: platforms
 * never let anything drop through, per the design).
 */
export function moveBody(
  level: ParsedLevel,
  x: number,
  y: number,
  vx: number,
  vy: number,
  w: number,
  h: number,
): MoveResult {
  const hw = w / 2;
  let grounded = false;
  let hitWall = false;
  let hitCeiling = false;
  let onSpikes = false;
  let wrapped = false;

  // --- horizontal ---
  let nx = x + vx;
  if (vx > 0) {
    const edge = nx + hw;
    // sample at three heights along the body
    for (const sy of [y - 2, y - h / 2, y - h + 4]) {
      if (isSolidAt(level, edge, sy)) {
        nx = Math.floor(edge / TILE) * TILE - hw - 0.01;
        hitWall = true;
        break;
      }
    }
  } else if (vx < 0) {
    const edge = nx - hw;
    for (const sy of [y - 2, y - h / 2, y - h + 4]) {
      if (isSolidAt(level, edge, sy)) {
        nx = (Math.floor(edge / TILE) + 1) * TILE + hw + 0.01;
        hitWall = true;
        break;
      }
    }
  }
  // hard clamp inside side walls
  if (nx < hw + 1) {
    nx = hw + 1;
    hitWall = true;
  }
  if (nx > FIELD_W - hw - 1) {
    nx = FIELD_W - hw - 1;
    hitWall = true;
  }

  // --- vertical ---
  let ny = y + vy;
  let nvy = vy;
  if (vy >= 0) {
    // falling / standing: check the feet line crossing a tile top
    const prevRow = Math.floor((y - 0.01) / TILE);
    const newRow = Math.floor(ny / TILE);
    outer: for (let row = prevRow; row <= newRow; row++) {
      const top = row * TILE;
      if (top < y - 0.5) continue; // must CROSS the top edge, not start inside
      for (const sx of [nx - hw + 2, nx, nx + hw - 2]) {
        const t = tileAt(level, sx, top + 1);
        if (t === T_SOLID || t === T_SPIKES || t === T_PLATFORM) {
          ny = top;
          nvy = 0;
          grounded = true;
          if (t === T_SPIKES) onSpikes = true;
          break outer;
        }
      }
    }
  } else {
    // rising: head against solid (platforms don't block upward)
    const headY = ny - h;
    for (const sx of [nx - hw + 2, nx, nx + hw - 2]) {
      if (isSolidAt(level, sx, headY)) {
        ny = (Math.floor(headY / TILE) + 1) * TILE + h;
        nvy = 0;
        hitCeiling = true;
        break;
      }
    }
  }

  // --- vertical wrap ---
  if (ny - h > FIELD_H + 8) {
    ny -= FIELD_H + h + 16;
    wrapped = true;
    grounded = false;
  }

  return { x: nx, y: ny, vx: hitWall ? 0 : vx, vy: nvy, grounded, hitWall, hitCeiling, onSpikes, wrapped };
}

/** True when a feet-anchored box stands on ground at its current position. */
export function standingOnGround(
  level: ParsedLevel,
  x: number,
  y: number,
  w: number,
): boolean {
  const hw = w / 2;
  const below = y + 1.5;
  const row = Math.floor(below / TILE);
  if (Math.abs(y - row * TILE) > 2.5) return false;
  for (const sx of [x - hw + 2, x, x + hw - 2]) {
    const t = tileAt(level, sx, below);
    if (t === T_SOLID || t === T_SPIKES || t === T_PLATFORM) return true;
  }
  return false;
}

/** Ground edge probe for walkers that turn at cliffs. */
export function groundAhead(
  level: ParsedLevel,
  x: number,
  y: number,
  facing: number,
  lookAhead: number,
): boolean {
  const px = x + facing * lookAhead;
  const t = tileAt(level, px, y + 6);
  return t === T_SOLID || t === T_SPIKES || t === T_PLATFORM;
}

export function circleOverlapsBox(
  cx: number,
  cy: number,
  r: number,
  bx: number,
  by: number,
  bw: number,
  bh: number,
): boolean {
  // box is feet-anchored: center bx, bottom by
  const nearX = Math.max(bx - bw / 2, Math.min(cx, bx + bw / 2));
  const nearY = Math.max(by - bh, Math.min(cy, by));
  const dx = cx - nearX;
  const dy = cy - nearY;
  return dx * dx + dy * dy <= r * r;
}

export function boxesOverlap(
  ax: number,
  ay: number,
  aw: number,
  ah: number,
  bx: number,
  by: number,
  bw: number,
  bh: number,
): boolean {
  return (
    Math.abs(ax - bx) < (aw + bw) / 2 &&
    ay > by - bh &&
    by > ay - ah
  );
}
