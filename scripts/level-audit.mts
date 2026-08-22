// Level geometry audit. Answers one question for all 99 levels: can the player
// actually GET there? The model lives in src/game/levels/audit.ts (shared with
// the level editor's lint panel); this script runs it over the campaign and
// drives the real sim once to prove the arithmetic still matches physics.
//
// Run: npx tsx scripts/level-audit.mts            (summary)
//      npx tsx scripts/level-audit.mts 1          (detail for world 1)
//      npx tsx scripts/level-audit.mts 1 --map    (ASCII reachability map)
//      npx tsx scripts/level-audit.mts --drafts   (apply src/game/levels/drafts/*.json first)

import { getLevelDef } from "../src/game/levels";
import { auditLevelDef, MAX_RISE, reachAt, SAFETY, WEAKEST_MULT } from "../src/game/levels/audit";
import { TILE } from "../src/game/sim/constants";
import { CAST } from "../src/game/cast";
import { worldForLevel } from "../src/game/levels/worlds";
import { createSim, step } from "../src/game/sim/sim";
import { loadDraftsFromDisk } from "./level-drafts-node";

// ---- keep the model honest -------------------------------------------------
// Everything in audit.ts is arithmetic ABOUT the sim. This drives the actual
// sim so a future physics change can't silently invalidate the whole audit.
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
const wantDrafts = process.argv.includes("--drafts");

if (wantDrafts) {
  const { loaded, problems } = await loadDraftsFromDisk();
  console.log(`drafts: ${loaded.length} applied [${loaded.join(" ")}]`);
  for (const p of problems) console.log(`  draft problem: ${p}`);
  console.log("");
}

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
let totalTexture = 0;
const lo = wantWorld ? (wantWorld - 1) * 11 + 1 : 1;
const hi = wantWorld ? wantWorld * 11 : 99;
for (let lvl = lo; lvl <= hi; lvl++) {
  const r = auditLevelDef(lvl, getLevelDef(lvl));
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
  problems.push(...r.contentErrors);
  totalTexture += r.textureCount;
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
    ? `\nLEVEL AUDIT: all ${hi - lo + 1} levels reachable and intact` +
        (totalTexture ? ` (${totalTexture} decorative wall bumps ignored)` : "")
    : `\nLEVEL AUDIT: ${bad}/${hi - lo + 1} levels have problems`,
);
