// Cousin Eddie behaviour check. Runs the cousin frenzy headless on a few
// layouts and measures what a player would see: how often the kin reverse
// direction (the old brain flipped every tick under a target -> visible
// shaking), how long they sit in one spot while varmints are still up,
// how many walls they bonk and how many varmints they actually headbutt.
// Run: npx tsx scripts/qa-eddie.mts

import { getLevelDef } from "../src/game/levels";
import { worldForLevel, isBossLevel } from "../src/game/levels/worlds";
import { createSim, step, startFrenzy } from "../src/game/sim/sim";
import type { Sim } from "../src/game/sim/types";

const LEVELS = [2, 6, 13, 24, 35, 47];
const VARIANTS = ["L1", "L5", "EVO"] as const;
const TICKS = 60 * 12;

function mkSim(level: number, lvl: number, evolved: boolean): Sim {
  const sim = createSim({
    seed: 1234 + level,
    levelDef: getLevelDef(level),
    world: worldForLevel(level),
    levelIndex: level,
    isBoss: isBossLevel(level),
    players: [
      { castId: "earl", loadout: { weapons: [{ id: "cousin", level: lvl }], tonics: [], evolved: evolved ? ["cousin"] : [] }, livesLeft: 3 },
      null,
    ],
    deathless: false,
    shrine: null,
  });
  return sim;
}

type Track = { lastFacing: number; lastFlipTick: number; flips: number; rapid: number; xs: number[]; stuck: number; bonks: number; wasBonk: boolean; hops: number; wasGrounded: boolean };

let totalFlips = 0, totalRapid = 0, totalStuck = 0, totalBonks = 0, totalKills = 0, totalPetTicks = 0, totalHops = 0;
let worstStuck = 0;
let fails = 0;

for (const level of LEVELS) {
  for (const v of VARIANTS) {
    const sim = mkSim(level, v === "L1" ? 1 : 5, v === "EVO");
    const p = sim.players[0];
    startFrenzy(sim, p, 0);
    const tracks = new Map<number, Track>();
    const enemies0 = sim.enemies.length;
    let kills = 0;
    let lastAlive = sim.enemies.filter((e) => e.phase.kind === "normal").length;
    let flips = 0, rapid = 0, stuck = 0, bonks = 0, hops = 0, petTicks = 0, maxStuck = 0;
    for (let t = 0; t < TICKS; t++) {
      p.invuln = 20;
      step(sim, [0, 0], [0, 0]);
      const alive = sim.enemies.filter((e) => e.phase.kind === "normal").length;
      if (alive < lastAlive) kills += lastAlive - alive;
      lastAlive = alive;
      for (const pet of sim.pets) {
        petTicks++;
        let tr = tracks.get(pet.id);
        if (!tr) {
          tr = { lastFacing: pet.facing, lastFlipTick: -999, flips: 0, rapid: 0, xs: [], stuck: 0, bonks: 0, wasBonk: false, hops: 0, wasGrounded: pet.grounded };
          tracks.set(pet.id, tr);
        }
        if (!Number.isFinite(pet.x) || !Number.isFinite(pet.y)) { fails++; console.log(`  !! non-finite pet pos lvl${level} ${v}`); }
        if (pet.facing !== tr.lastFacing) {
          tr.flips++; flips++;
          if (sim.tick - tr.lastFlipTick < 10) { tr.rapid++; rapid++; }
          tr.lastFlipTick = sim.tick;
          tr.lastFacing = pet.facing;
        }
        const isBonk = pet.mode === 2;
        if (isBonk && !tr.wasBonk) { tr.bonks++; bonks++; }
        tr.wasBonk = isBonk;
        if (tr.wasGrounded && !pet.grounded && pet.vy < -3) { tr.hops++; hops++; }
        tr.wasGrounded = pet.grounded;
        // stuck: over the last 90 ticks the kin stayed inside a 24px box while
        // not bonked and varmints were still up
        tr.xs.push(pet.x);
        if (tr.xs.length > 90) tr.xs.shift();
        if (tr.xs.length === 90 && alive > 0 && !isBonk) {
          const span = Math.max(...tr.xs) - Math.min(...tr.xs);
          if (span < 24) { tr.stuck++; stuck++; }
        }
      }
    }
    for (const tr of tracks.values()) maxStuck = Math.max(maxStuck, tr.stuck);
    worstStuck = Math.max(worstStuck, maxStuck);
    totalFlips += flips; totalRapid += rapid; totalStuck += stuck; totalBonks += bonks; totalKills += kills; totalPetTicks += petTicks; totalHops += hops;
    const secs = petTicks / 60;
    console.log(
      `lvl${String(level).padStart(2)} ${v.padEnd(3)} pets=${tracks.size} kills=${String(kills).padStart(2)}/${enemies0}` +
      ` flips/s=${(flips / secs).toFixed(2)} rapidFlips=${rapid} bonks=${bonks} hops=${hops} stuckTicks=${stuck} (worst pet ${maxStuck})`,
    );
  }
}
const secs = totalPetTicks / 60;
console.log(`\nTOTAL pet-seconds=${secs.toFixed(0)} kills=${totalKills} flips/s=${(totalFlips / secs).toFixed(2)} rapidFlips=${totalRapid} bonks=${totalBonks} hops=${totalHops} stuckTicks=${totalStuck} worstStuck=${worstStuck}`);
// Guardrails: the old brain flipped several times a second and sat in place
// for whole seconds under unreachable targets.
if (totalRapid / secs > 0.05) { fails++; console.log("FAIL: rapid flips (shaking)"); }
if (worstStuck > 60) { fails++; console.log("FAIL: a kin sat still for >1s with varmints up"); }
if (totalKills === 0) { fails++; console.log("FAIL: nobody got headbutted"); }
console.log(fails ? `EDDIE QA: ${fails} FAIL(S)` : "EDDIE QA: ALL GREEN");
process.exit(fails ? 1 : 0);
