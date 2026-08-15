// Level geometry audit. Answers one question for all 99 levels: can the player
// actually GET there? Builds the graph of standing surfaces, derives the jump
// arc from the real sim constants, and BFSes from the P1 spawn.
//
// Run: npx tsx scripts/level-audit.mts            (summary)
//      npx tsx scripts/level-audit.mts 1          (detail for world 1)
//      npx tsx scripts/level-audit.mts 1 --map    (ASCII reachability map)

import { getLevelDef } from "../src/game/levels";
import { parseLevel } from "../src/game/levels/parse";
import { T_EMPTY, T_SOLID } from "../src/game/levels/types";
import {
  GRID_H,
  GRID_W,
  P_GRAVITY,
  P_JUMP_VY,
  P_MAX_FALL,
  P_MAX_SPEED,
  TILE,
} from "../src/game/sim/constants";
import { CAST, castJumpMult } from "../src/game/cast";
import { worldForLevel } from "../src/game/levels/worlds";
import { createSim, step } from "../src/game/sim/sim";

// ---- jump arc, integrated exactly the way sim.ts does it -------------------
// per tick: vy += G (clamped to MAX_FALL), then y += vy. So the first step of
// a jump already has gravity applied to the launch impulse.
function arcRise(jumpVy: number): number[] {
  const rise: number[] = [];
  let v = jumpVy;
  let h = 0;
  for (let t = 0; t < 400; t++) {
    v = Math.min(v + P_GRAVITY, P_MAX_FALL);
    h -= v;
    rise.push(h);
    if (h < -TILE * GRID_H) break;
  }
  return rise;
}

// weakest jumper in the cast defines what levels are allowed to demand
const WEAKEST_MULT = Math.min(...CAST.map((c) => castJumpMult(c.jump)));
const ARC = arcRise(P_JUMP_VY * WEAKEST_MULT);
const MAX_RISE = Math.max(...ARC);

/** Horizontal px available while the arc is at or above `need` px of rise. */
function reachAt(need: number): number {
  let last = -1;
  for (let t = 0; t < ARC.length; t++) if (ARC[t] >= need) last = t;
  if (last < 0) return -1; // that height is simply not reachable
  return last * P_MAX_SPEED;
}

const SAFETY = 6; // px of headroom demanded over the bare-minimum arc

// ---- surfaces --------------------------------------------------------------
type Run = {
  id: number;
  row: number; // grid row of the surface tile
  c0: number;
  c1: number; // inclusive column span
};

function standable(t: number): boolean {
  return t !== T_EMPTY;
}

function buildRuns(col: Uint8Array[]): Run[] {
  const runs: Run[] = [];
  for (let y = 0; y < GRID_H; y++) {
    let start = -1;
    for (let x = 0; x <= GRID_W; x++) {
      // a tile is stand-on-able if it is solid-ish and the tile above is not solid
      const ok =
        x < GRID_W &&
        standable(col[y][x]) &&
        (y === 0 || col[y - 1][x] !== T_SOLID);
      if (ok && start < 0) start = x;
      else if (!ok && start >= 0) {
        runs.push({ id: runs.length, row: y, c0: start, c1: x - 1 });
        start = -1;
      }
    }
  }
  return runs;
}

/** px gap between two column spans (0 if they overlap). */
function colGap(a: Run, b: Run): number {
  if (b.c1 < a.c0) return (a.c0 - b.c1 - 1) * TILE;
  if (b.c0 > a.c1) return (b.c0 - a.c1 - 1) * TILE;
  return 0;
}

/** Is the vertical corridor between a run and a higher target blocked by solid? */
function corridorBlocked(col: Uint8Array[], from: Run, to: Run): boolean {
  const lo = Math.max(from.c0, to.c0);
  const hi = Math.min(from.c1, to.c1);
  if (lo > hi) return false; // not a straight-up jump, don't judge it
  for (let x = lo; x <= hi; x++) {
    let clear = true;
    for (let y = to.row + 1; y < from.row; y++) {
      if (col[y][x] === T_SOLID) {
        clear = false;
        break;
      }
    }
    if (clear) return false;
  }
  return true;
}

function edges(col: Uint8Array[], runs: Run[]): Map<number, number[]> {
  const g = new Map<number, number[]>();
  for (const a of runs) g.set(a.id, []);
  for (const a of runs) {
    for (const b of runs) {
      if (a.id === b.id) continue;
      const gap = colGap(a, b);
      const dRows = a.row - b.row; // >0 means b is above a
      let ok = false;
      if (dRows > 0) {
        const need = dRows * TILE + SAFETY;
        if (need <= MAX_RISE) {
          const reach = reachAt(need);
          ok = reach >= 0 && gap <= reach && !corridorBlocked(col, a, b);
        }
      } else if (dRows === 0) {
        ok = gap <= reachAt(SAFETY);
      } else {
        // dropping down: generous, you just walk off and steer
        ok = gap <= TILE * 6;
      }
      if (ok) g.get(a.id)!.push(b.id);
    }
  }
  // vertical screen wrap: an open column in the bottom row drops you in at the top
  const bottomOpen: number[] = [];
  for (let x = 0; x < GRID_W; x++) {
    let clear = true;
    for (let y = GRID_H - 1; y < GRID_H; y++) if (col[y][x] !== T_EMPTY) clear = false;
    if (clear) bottomOpen.push(x);
  }
  if (bottomOpen.length) {
    for (const a of runs) {
      for (const b of runs) {
        if (a.id === b.id) continue;
        // after wrapping you enter at row 0 and fall; reachable if b's span is
        // under an open shaft from the top
        let open = false;
        for (let x = Math.max(0, b.c0 - 2); x <= Math.min(GRID_W - 1, b.c1 + 2); x++) {
          let clear = true;
          for (let y = 0; y < b.row; y++) if (col[y][x] === T_SOLID) clear = false;
          if (clear) open = true;
        }
        if (open && !g.get(a.id)!.includes(b.id)) g.get(a.id)!.push(b.id);
      }
    }
  }
  return g;
}

function runUnder(runs: Run[], px: number, py: number): Run | null {
  const cx = Math.floor(px / TILE);
  const row = Math.round(py / TILE);
  let best: Run | null = null;
  for (const r of runs) {
    if (cx < r.c0 || cx > r.c1) continue;
    if (r.row < row) continue;
    if (!best || r.row < best.row) best = r;
  }
  return best;
}

// ---- audit -----------------------------------------------------------------
type Report = {
  level: number;
  widthErrors: string[];
  totalRuns: number;
  orphanRuns: Run[];
  strandedEnemies: { kind: string; x: number; y: number }[];
  worstGap: number; // largest rows the level asks you to jump on the main path
};

function audit(level: number): Report {
  const def = getLevelDef(level);
  const widthErrors: string[] = [];
  def.grid.forEach((row, i) => {
    if (row.length !== GRID_W) widthErrors.push(`row ${i}: ${row.length} chars`);
  });
  const parsed = parseLevel(def);
  const runs = buildRuns(parsed.collision);
  const g = edges(parsed.collision, runs);

  const start = runUnder(runs, parsed.spawns.p1.x, parsed.spawns.p1.y);
  const seen = new Set<number>();
  if (start) {
    const q = [start.id];
    seen.add(start.id);
    while (q.length) {
      const cur = q.shift()!;
      for (const n of g.get(cur) ?? []) {
        if (!seen.has(n)) {
          seen.add(n);
          q.push(n);
        }
      }
    }
  }

  const orphanRuns = runs.filter((r) => !seen.has(r.id));
  const strandedEnemies = parsed.enemySpawns.filter((e) => {
    const r = runUnder(runs, e.x, e.y);
    return r ? !seen.has(r.id) : false;
  });

  // worst vertical gap: for every reachable run, how far above the nearest
  // support below it sits (informational)
  let worstGap = 0;
  for (const r of runs) {
    let best = Infinity;
    for (const o of runs) {
      if (o.row <= r.row) continue;
      if (colGap(r, o) > TILE * 4) continue;
      best = Math.min(best, o.row - r.row);
    }
    if (best !== Infinity) worstGap = Math.max(worstGap, best);
  }

  return {
    level,
    widthErrors,
    totalRuns: runs.length,
    orphanRuns,
    strandedEnemies: strandedEnemies.map((e) => ({ kind: e.kind, x: e.x, y: e.y })),
    worstGap,
  };
}

// ---- keep the model honest -------------------------------------------------
// Everything above is arithmetic ABOUT the sim. This drives the actual sim so a
// future physics change can't silently invalidate the whole audit.
function verifyModel(): string[] {
  const problems: string[] = [];
  const weakest = CAST.reduce((a, b) => (a.jump <= b.jump ? a : b));
  const sim = createSim({
    seed: 7,
    levelDef: getLevelDef(1),
    world: worldForLevel(1),
    levelIndex: 1,
    isBoss: false,
    players: [
      {
        castId: weakest.id,
        loadout: { weapons: [{ id: "twang", level: 2 }], tonics: [], evolved: [] },
        livesLeft: 3,
      },
      null,
    ],
    deathless: false,
  });
  const p = sim.players[0];
  p.x = 7 * TILE + TILE / 2;
  p.y = 16 * TILE;
  p.vx = 0;
  p.vy = 0;
  p.grounded = true;
  sim.status = "play";
  let peak = p.y;
  let prev: [number, number] = [0, 0];
  for (let t = 0; t < 120; t++) {
    p.invuln = 60;
    const inputs: [number, number] = [4 /* CMD_JUMP */, 0];
    step(sim, inputs, prev);
    prev = inputs;
    peak = Math.min(peak, p.y);
  }
  const realRise = 16 * TILE - peak;
  if (Math.abs(realRise - MAX_RISE) > 2) {
    problems.push(
      `model drift: audit predicts ${MAX_RISE.toFixed(1)}px rise, sim gives ${realRise.toFixed(1)}px`,
    );
  }
  if (!p.grounded || Math.abs(p.y - 13 * TILE) > 1) {
    problems.push(
      `${weakest.id} could not land on 1-1's first tier (ended at y=${p.y.toFixed(1)}, want 416)`,
    );
  }
  return problems;
}

// ---- output ----------------------------------------------------------------
const arg = process.argv[2];
const wantWorld = arg && /^\d+$/.test(arg) ? Number(arg) : null;
const wantMap = process.argv.includes("--map");

console.log(
  `jump: rise ${MAX_RISE.toFixed(1)}px = ${(MAX_RISE / TILE).toFixed(2)} tiles ` +
    `(weakest cast jump, x${WEAKEST_MULT.toFixed(3)})`,
);
console.log(
  `clears a ${Math.floor((MAX_RISE - SAFETY) / TILE)}-tile step; ` +
    `horizontal reach at 3 tiles up: ${reachAt(3 * TILE + SAFETY).toFixed(0)}px`,
);
const drift = verifyModel();
console.log(drift.length ? `MODEL CHECK: ${drift.join("; ")}\n` : "model checked against live sim: ok\n");

let bad = 0;
const lo = wantWorld ? (wantWorld - 1) * 11 + 1 : 1;
const hi = wantWorld ? wantWorld * 11 : 99;
for (let lvl = lo; lvl <= hi; lvl++) {
  const r = audit(lvl);
  const world = Math.ceil(lvl / 11);
  const inW = ((lvl - 1) % 11) + 1;
  const tag = `${world}-${inW}`;
  const problems: string[] = [];
  if (r.widthErrors.length) problems.push(`${r.widthErrors.length} ragged rows`);
  if (r.orphanRuns.length)
    problems.push(
      `${r.orphanRuns.length}/${r.totalRuns} unreachable surfaces [${r.orphanRuns
        .map((o) => `r${o.row}c${o.c0}-${o.c1}`)
        .join(" ")}]`,
    );
  if (r.strandedEnemies.length)
    problems.push(`${r.strandedEnemies.length} stranded enemies`);
  if (problems.length) {
    bad++;
    console.log(`  ${tag.padEnd(5)} ${problems.join("; ")}`);
  } else if (wantWorld) {
    console.log(`  ${tag.padEnd(5)} ok (${r.totalRuns} surfaces, all reachable)`);
  }

  if (wantMap) {
    const def = getLevelDef(lvl);
    console.log(def.grid.map((row, i) => `    ${String(i).padStart(2)} ${row}`).join("\n"));
  }
}

console.log(
  bad === 0
    ? `\nLEVEL AUDIT: all ${hi - lo + 1} levels fully reachable`
    : `\nLEVEL AUDIT: ${bad}/${hi - lo + 1} levels have problems`,
);
