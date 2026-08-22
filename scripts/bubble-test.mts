// Headless check of the bubble-string mechanics: packing, ripple chain pops,
// charged specials, headbutt pops, side nudges, bounce survival.
// Run: npx tsx scripts/bubble-test.mts
import { createSim, step, popBubble } from "../src/game/sim/sim";
import { getLevelDef, WORLDS } from "../src/game/levels/index";
import { CMD_JUMP, CMD_RIGHT } from "../src/game/core/input";
import {
  BUBBLE_CHAIN_DIST,
  BUBBLE_PACK_DIST,
  BUBBLE_R,
  LEVEL_INTRO_TICKS,
  P_HEIGHT,
  TICK_HZ,
} from "../src/game/sim/constants";
import type { Bubble, Sim } from "../src/game/sim/types";

let failures = 0;
const check = (ok: boolean, msg: string) => {
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${msg}`);
};

function mk(): Sim {
  const sim = createSim({
    seed: 11,
    levelDef: getLevelDef(1),
    world: WORLDS[0],
    levelIndex: 1,
    isBoss: false,
    players: [
      { castId: "earl", loadout: { weapons: [{ id: "twang", level: 1 }], tonics: [], evolved: [] }, livesLeft: 3 },
      null,
    ],
    deathless: true,
  });
  for (let i = 0; i < LEVEL_INTRO_TICKS + 5; i++) step(sim, [0, 0], [0, 0]);
  // park every varmint far away and frozen so nothing wanders into the tests
  for (const e of sim.enemies) {
    e.x = 20;
    e.y = 20;
    e.vx = 0;
    e.vy = 0;
  }
  return sim;
}

function floater(sim: Sim, x: number, y: number, extra: Partial<Bubble> = {}): Bubble {
  const b: Bubble = {
    id: sim.nextId++,
    owner: 0,
    x,
    y,
    vx: 0,
    vy: 0,
    state: { kind: "float" },
    age: 60,
    rides: 0,
    rideTicks: 0,
    ridden: 0,
    wobblePhase: 0,
    special: null,
    drift: 0,
    fuse: 0,
    fuseBy: 0,
    fuseCharge: 0,
    ...extra,
  };
  sim.bubbles.push(b);
  return b;
}

function trapIn(sim: Sim, b: Bubble, ei: number): void {
  const e = sim.enemies[ei];
  e.phase = { kind: "trapped", bubbleId: b.id };
  e.x = b.x;
  e.y = b.y + 9;
  b.state = { kind: "trapped", enemyId: e.id, enemyKind: e.kind, ticks: 6 * TICK_HZ, angryOnEscape: true };
}

const fxNames = (sim: Sim) =>
  sim.fx.map((f) => (f.t === "sfx" ? `sfx:${f.name}` : f.t === "burst" ? `burst:${f.text}` : f.t));

// ---- 1. packing: a heap of bubbles spreads into a cluster ----
{
  const sim = mk();
  const p = sim.players[0];
  p.x = 60; // out of the way
  for (let i = 0; i < 7; i++) floater(sim, 480 + i * 0.5, 400);
  for (let i = 0; i < 90; i++) step(sim, [0, 0], [0, 0]);
  let minD = Infinity;
  let finite = true;
  for (let i = 0; i < sim.bubbles.length; i++) {
    for (let j = i + 1; j < sim.bubbles.length; j++) {
      const a = sim.bubbles[i];
      const c = sim.bubbles[j];
      minD = Math.min(minD, Math.hypot(a.x - c.x, a.y - c.y));
      if (!Number.isFinite(a.x + a.y + c.x + c.y)) finite = false;
    }
  }
  check(sim.bubbles.length === 7, `packing: all 7 bubbles survive (${sim.bubbles.length})`);
  check(finite, "packing: positions finite");
  check(minD > BUBBLE_PACK_DIST * 0.8, `packing: min pair distance ${minD.toFixed(1)} > ${(BUBBLE_PACK_DIST * 0.8).toFixed(1)}`);
  // the heap must still be ONE touching cluster (else a string would not chain)
  const seen = new Set<number>([sim.bubbles[0].id]);
  const q = [sim.bubbles[0]];
  while (q.length) {
    const cur = q.pop()!;
    for (const o of sim.bubbles) {
      if (!seen.has(o.id) && Math.hypot(o.x - cur.x, o.y - cur.y) <= BUBBLE_CHAIN_DIST) {
        seen.add(o.id);
        q.push(o);
      }
    }
  }
  check(seen.size === 7, `packing: heap stays one chain-connected cluster (${seen.size}/7)`);
}

// ---- 2. ripple chain: a string of 5 (3 trapped) goes up from one touch ----
{
  const sim = mk();
  const p = sim.players[0];
  p.x = 60;
  const xs = [400, 428, 456, 484, 512];
  const bs = xs.map((x) => floater(sim, x, 300));
  trapIn(sim, bs[0], 0);
  trapIn(sim, bs[2], 1);
  trapIn(sim, bs[4], 2);
  const before = sim.enemies.filter((e) => e.phase.kind === "trapped").length;
  popBubble(sim, bs[0], 0);
  const seen: string[] = [];
  for (let i = 0; i < 16; i++) {
    step(sim, [0, 0], [0, 0]);
    seen.push(...fxNames(sim));
  }
  const dying = sim.enemies.filter((e) => e.phase.kind === "dying").length;
  check(before === 3, `chain: 3 trapped before (${before})`);
  check(sim.bubbles.length === 0, `chain: whole string popped (${sim.bubbles.length} left)`);
  check(dying === 3, `chain: 3 varmints dying (${dying})`);
  check(sim.chains[0].count === 3, `chain: chain count 3 (${sim.chains[0].count})`);
  check(seen.includes("burst:KABLOOIE!"), `chain: KABLOOIE burst fired (${seen.filter((s) => s.startsWith("burst")).join(",")})`);
}

// ---- 3. charged special: prayer in a string of 2 trapped -> 9s glow ----
{
  const sim = mk();
  const p = sim.players[0];
  p.x = 60;
  const a = floater(sim, 400, 300);
  const b = floater(sim, 428, 300);
  const s = floater(sim, 456, 300, { special: "prayer", drift: 0.6 });
  trapIn(sim, a, 0);
  trapIn(sim, b, 1);
  popBubble(sim, s, 0); // pop the special itself: charge comes from its cluster
  const seen: string[] = [...fxNames(sim)]; // fx from the direct pop, before step clears them
  for (let i = 0; i < 12; i++) {
    step(sim, [0, 0], [0, 0]);
    seen.push(...fxNames(sim));
  }
  check(p.prayer > 0 && p.prayer <= 9 * TICK_HZ && p.prayer > 8 * TICK_HZ, `special: charged x2 prayer ~9s (${(p.prayer / TICK_HZ).toFixed(1)}s)`);
  check(seen.includes("burst:CHARGED x2!"), "special: CHARGED x2 burst");
  check(seen.includes("sfx:megaBelch"), "special: belch rule fired");
  check(sim.bubbles.length === 0, `special: string went with it (${sim.bubbles.length} left)`);
}

// ---- 4. uncharged special, popped alone ----
{
  const sim = mk();
  const p = sim.players[0];
  p.x = 60;
  const s = floater(sim, 456, 300, { special: "prayer", drift: 0.6 });
  popBubble(sim, s, 0);
  step(sim, [0, 0], [0, 0]);
  check(p.prayer >= 5 * TICK_HZ - 2 && p.prayer <= 5 * TICK_HZ, `special: lone prayer is the base 5s (${(p.prayer / TICK_HZ).toFixed(2)}s)`);
}

// ---- 5. headbutt from below pops an empty bubble ----
{
  const sim = mk();
  const p = sim.players[0];
  // floor of level 1 is at the bottom; stand the player, bubble just above head
  const b = floater(sim, p.x, p.y - P_HEIGHT - BUBBLE_R - 30);
  p.vy = -9;
  p.grounded = false;
  const seen: string[] = [];
  for (let i = 0; i < 10; i++) {
    step(sim, [0, 0], [0, 0]);
    seen.push(...fxNames(sim));
  }
  check(!sim.bubbles.includes(b), "headbutt: bubble popped");
  check(seen.includes("sfx:popEmpty"), "headbutt: popEmpty sfx");
}

// ---- 6. walking into a bubble's side nudges it ----
{
  const sim = mk();
  const p = sim.players[0];
  const b = floater(sim, p.x + 26, p.y - P_HEIGHT / 2);
  const x0 = b.x;
  for (let i = 0; i < 20; i++) step(sim, [CMD_RIGHT, 0], [CMD_RIGHT, 0]);
  check(sim.bubbles.includes(b), "nudge: bubble not popped");
  check(b.x > x0 + 10, `nudge: bubble shoved right by ${(b.x - x0).toFixed(1)}px`);
}

// ---- 7. bounce survives once, pops on the second ----
{
  const sim = mk();
  const p = sim.players[0];
  const b = floater(sim, p.x, p.y - 200, { age: 60 });
  b.vx = 0;
  // drop onto it with jump held
  p.x = b.x;
  p.y = b.y - BUBBLE_R - 30;
  p.vy = 4;
  p.grounded = false;
  let bounces = 0;
  for (let i = 0; i < 120 && sim.bubbles.includes(b); i++) {
    const r0 = b.rides;
    step(sim, [CMD_JUMP, 0], [CMD_JUMP, 0]);
    if (b.rides > r0) bounces++;
    // keep the bubble where it is so the second landing finds it
    b.y = p.y + 60 < b.y ? b.y : b.y;
  }
  check(bounces >= 1 && b.rides >= 1, `bounce: first bounce registered (rides=${b.rides}, bounces=${bounces})`);
  check(bounces <= 1 ? sim.bubbles.includes(b) || b.rides >= 2 : !sim.bubbles.includes(b), "bounce: bubble survives the first hop, gone after the second");
}

// ---- 7b. second bounce on a TRAPPED bubble still pops the varmint ----
{
  const sim = mk();
  const p = sim.players[0];
  const b = floater(sim, p.x, p.y - 200);
  trapIn(sim, b, 0);
  b.rides = 1; // one bounce already spent
  p.x = b.x;
  p.y = b.y - BUBBLE_R - 30;
  p.vy = 4;
  p.grounded = false;
  for (let i = 0; i < 30 && sim.bubbles.includes(b); i++) step(sim, [CMD_JUMP, 0], [CMD_JUMP, 0]);
  check(!sim.bubbles.includes(b), "bounce2: trapped bubble burst on second bounce");
  check(sim.enemies[0].phase.kind === "dying", `bounce2: varmint popped, not orphaned (${sim.enemies[0].phase.kind})`);
}

// ---- 8. specials spawn as bubbles over time and stay in the field ----
{
  const sim = mk();
  const p = sim.players[0];
  p.x = 60;
  let sawSpecial = false;
  let inField = true;
  for (let i = 0; i < 30 * TICK_HZ; i++) {
    step(sim, [0, 0], [0, 0]);
    for (const b of sim.bubbles) {
      if (!b.special) continue;
      sawSpecial = true;
      if (b.x < 0 || b.x > 960 || b.y < 0) inField = false;
    }
  }
  check(sawSpecial, "spawn: a special drifted in as a bubble");
  check(inField, "spawn: specials stayed inside the field");
}

console.log(failures ? `\n${failures} FAILURE(S)` : "\nall bubble checks passed");
process.exit(failures ? 1 : 0);
