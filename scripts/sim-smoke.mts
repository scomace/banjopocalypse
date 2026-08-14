// Headless sim torture test. The simulation is pure TS (no DOM, no Phaser),
// so this runs the actual game logic thousands of ticks in node:
//   1. parse all 99 levels (structural validation)
//   2. random-input survival runs on every level (no crashes, finite state)
//   3. scripted "perfect play" pops on normal levels (chains, food, clear)
//   4. all 9 bosses driven to death (phases, minions, duel, victory path)
//   5. frenzy sweep: every weapon at L1/L5/evolved fires for 12s
// Run: npx tsx scripts/sim-smoke.mts

import { getLevelDef, levelCountCheck } from "../src/game/levels";
import { worldForLevel, isBossLevel } from "../src/game/levels/worlds";
import { parseLevel } from "../src/game/levels/parse";
import { createSim, step, startFrenzy } from "../src/game/sim/sim";
import type { Sim } from "../src/game/sim/types";
import { WEAPONS } from "../src/game/sim/weapons";
import { CAST } from "../src/game/cast";
import { mulberry32 } from "../src/game/core/rng";

let failures = 0;
function fail(msg: string): void {
  failures++;
  console.error("FAIL:", msg);
}

function finite(sim: Sim, ctx: string): void {
  for (const p of sim.players) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) {
      fail(`${ctx}: player pos not finite`);
      return;
    }
  }
  for (const e of sim.enemies) {
    if (!Number.isFinite(e.x) || !Number.isFinite(e.y)) {
      fail(`${ctx}: enemy ${e.kind} pos not finite`);
      return;
    }
  }
  if (sim.bubbles.length > 200) fail(`${ctx}: bubble leak (${sim.bubbles.length})`);
  if (sim.projectiles.length > 500) fail(`${ctx}: projectile leak (${sim.projectiles.length})`);
  if (sim.items.length > 300) fail(`${ctx}: item leak`);
}

function mkSim(level: number, weapons = [{ id: "twang", level: 2 }]) {
  return createSim({
    seed: 1234 + level,
    levelDef: getLevelDef(level),
    world: worldForLevel(level),
    levelIndex: level,
    isBoss: isBossLevel(level),
    players: [
      {
        castId: "earl",
        loadout: { weapons, tonics: [], evolved: [] },
        livesLeft: 3,
      },
      null,
    ],
    deathless: false,
  });
}

// ---- 1. parse all 99 ----
console.log("[1] parsing all 99 levels");
const counts = levelCountCheck();
for (const c of counts) {
  if (c.count !== 11) fail(`world ${c.world} has ${c.count} levels, want 11`);
}
for (let i = 1; i <= 99; i++) {
  try {
    const parsed = parseLevel(getLevelDef(i));
    if (!isBossLevel(i) && parsed.enemySpawns.length === 0) {
      fail(`level ${i} has no enemies`);
    }
    if (isBossLevel(i) && parsed.enemySpawns.length > 0) {
      fail(`boss level ${i} has authored enemies`);
    }
  } catch (err) {
    fail(`level ${i} parse: ${err}`);
  }
}

// ---- 2. random-input survival on every level ----
console.log("[2] random-input runs (1500 ticks x 99 levels)");
for (let lvl = 1; lvl <= 99; lvl++) {
  const sim = mkSim(lvl);
  const rng = mulberry32(999 + lvl);
  let prev: [number, number] = [0, 0];
  try {
    for (let t = 0; t < 1500; t++) {
      const cmd =
        (rng() < 0.4 ? 1 : 0) |
        (rng() < 0.4 ? 2 : 0) |
        (rng() < 0.25 ? 4 : 0) |
        (rng() < 0.3 ? 8 : 0);
      const inputs: [number, number] = [cmd, 0];
      step(sim, inputs, prev);
      prev = inputs;
    }
    finite(sim, `level ${lvl}`);
  } catch (err) {
    fail(`level ${lvl} random run crashed: ${err}`);
  }
}

// ---- 3. scripted perfect pops on a normal level ----
console.log("[3] scripted trap-and-pop clear");
{
  const sim = mkSim(1);
  try {
    let cleared = false;
    for (let t = 0; t < 60 * 60 && !cleared; t++) {
      // cheat: teleport player near an untrapped enemy and blow toward it
      const target = sim.enemies.find((e) => e.phase.kind === "normal");
      const trapped = sim.enemies.find((e) => e.phase.kind === "trapped");
      const p = sim.players[0];
      let cmd = 0;
      if (trapped) {
        p.x = trapped.x;
        p.y = trapped.y + 10;
      } else if (target && sim.status === "play") {
        p.x = target.x - 60;
        p.y = target.y;
        p.facing = 1;
        cmd = 8; // blow
      }
      p.invuln = 20; // keep the cheat-bot alive
      const inputs: [number, number] = [t % 3 === 0 ? cmd : 0, 0];
      step(sim, inputs, [0, 0]);
      if (sim.status === "cleared") cleared = true;
    }
    if (!cleared) fail("scripted clear never cleared level 1");
    else console.log("    level 1 cleared by script");
  } catch (err) {
    fail(`scripted clear crashed: ${err}`);
  }
}

// ---- 4. every boss driven to death ----
console.log("[4] boss gauntlet");
for (let w = 1; w <= 9; w++) {
  const lvl = w * 11;
  const sim = mkSim(lvl, [{ id: "twang", level: 5 }]);
  try {
    let died = false;
    for (let t = 0; t < 60 * 90 && !died; t++) {
      const p = sim.players[0];
      p.invuln = 20;
      p.x = 480;
      p.y = 400;
      // pop trapped minions onto the boss + chip damage
      const trapped = sim.enemies.find((e) => e.phase.kind === "trapped");
      const target = sim.enemies.find((e) => e.phase.kind === "normal");
      let cmd = 0;
      if (trapped) {
        p.x = trapped.x;
        p.y = trapped.y + 10;
      } else if (target) {
        p.x = target.x - 50;
        p.y = target.y;
        p.facing = 1;
        cmd = 8;
      }
      if (sim.boss && t % 120 === 0) sim.boss.hp -= 6; // impatient chip
      step(sim, [t % 2 === 0 ? cmd : 0, 0], [0, 0]);
      if (sim.status === "bossDead") died = true;
    }
    if (!died) fail(`boss ${sim.world.bossId} never died`);
    else console.log(`    ${sim.world.bossId} down`);
    finite(sim, `boss ${sim.world.bossId}`);
  } catch (err) {
    fail(`boss level ${lvl} crashed: ${err}`);
  }
}

// ---- 5. frenzy sweep: every weapon at L1, L5, evolved ----
console.log("[5] weapon frenzy sweep");
for (const w of WEAPONS) {
  for (const variant of ["L1", "L5", "EVO"] as const) {
    const level = variant === "L1" ? 1 : 5;
    const sim = mkSim(6, [{ id: w.id, level }]);
    if (variant === "EVO") sim.players[0].loadout.evolved.push(w.id);
    try {
      startFrenzy(sim, sim.players[0], 0);
      for (let t = 0; t < 60 * 12; t++) {
        sim.players[0].invuln = 20;
        step(sim, [t % 7 < 3 ? 2 : 1, 0], [0, 0]);
      }
      finite(sim, `${w.id} ${variant}`);
    } catch (err) {
      fail(`weapon ${w.id} ${variant} crashed: ${err}`);
    }
  }
}

// ---- 6. cast sanity ----
for (const c of CAST) {
  if (!WEAPONS.some((w) => w.id === c.signatureWeapon)) {
    fail(`cast ${c.id} signature weapon ${c.signatureWeapon} unknown`);
  }
}

if (failures === 0) {
  console.log("\nSIM SMOKE: ALL GREEN");
} else {
  console.log(`\nSIM SMOKE: ${failures} FAILURES`);
  process.exit(1);
}
