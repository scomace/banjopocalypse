// Headless sim torture test. The simulation is pure TS (no DOM, no Phaser),
// so this runs the actual game logic thousands of ticks in node:
//   1. parse all 99 levels (structural validation)
//   2. random-input survival runs on every level (no crashes, finite state)
//   3. scripted "perfect play" pops on normal levels (chains, food, clear)
//   4. all 9 bosses driven to death (phases, minions, duel, victory path)
//   5. frenzy sweep: every weapon at L1/L5/evolved fires for 12s
//   7. weapon shrines: all 9 shrine levels parse a W, guardians stay leashed,
//      claiming grants the gift + a frenzy and releases the level-clear hold
//   8. run layer: signature Lv1, hands are always 3 cards w/o newWeapon,
//      shrine offers never repeat an owned weapon and go relic when full
// Run: npx tsx scripts/sim-smoke.mts

import { getLevelDef, levelCountCheck } from "../src/game/levels";
import { hashSim } from "../src/game/sim/hash";
import { worldForLevel, isBossLevel } from "../src/game/levels/worlds";
import { parseLevel } from "../src/game/levels/parse";
import { createSim, step, startFrenzy, hurtPlayer } from "../src/game/sim/sim";
import type { Sim } from "../src/game/sim/types";
import { WEAPONS } from "../src/game/sim/weapons";
import { CAST } from "../src/game/cast";
import { mulberry32 } from "../src/game/core/rng";
import { SHRINE_LEASH_R, takeShrine } from "../src/game/sim/shrine";
import { P_HEIGHT, PVP_BOUNCE, PVP_BOUNCE_VY } from "../src/game/sim/constants";
import type { ShrineGift } from "../src/game/sim/types";
import {
  MAX_WEAPONS,
  applyCard,
  dealCards,
  isShrineLevel,
  newRun,
  shrineGiftsFor,
  type Card,
} from "../src/game/run/run";

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

function mkSim(
  level: number,
  weapons = [{ id: "twang", level: 2 }],
  castId = "earl",
  shrine: ShrineGift[] | null = null,
) {
  return createSim({
    seed: 1234 + level,
    levelDef: getLevelDef(level),
    world: worldForLevel(level),
    levelIndex: level,
    isBoss: isBossLevel(level),
    players: [
      {
        castId,
        loadout: { weapons, tonics: [], evolved: [] },
        livesLeft: 3,
      },
      null,
    ],
    deathless: false,
    shrine,
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

// ---- 2b. Buford + Fishin' Line random runs (hook bit held in long bursts) ----
console.log("[2b] Buford fishin' line random runs (1500 ticks x 99 levels)");
for (let lvl = 1; lvl <= 99; lvl++) {
  const sim = mkSim(lvl, [{ id: "washboard", level: 2 }], "buford");
  const rng = mulberry32(4242 + lvl);
  let prev: [number, number] = [0, 0];
  let hookHold = 0;
  try {
    for (let t = 0; t < 1500; t++) {
      if (hookHold > 0) hookHold--;
      else if (rng() < 0.06) hookHold = 10 + Math.floor(rng() * 60);
      const cmd =
        (rng() < 0.4 ? 1 : 0) |
        (rng() < 0.4 ? 2 : 0) |
        (rng() < 0.2 ? 4 : 0) |
        (rng() < 0.3 ? 8 : 0) |
        (hookHold > 0 ? 16 : 0);
      const inputs: [number, number] = [cmd, 0];
      step(sim, inputs, prev);
      prev = inputs;
      const p = sim.players[0];
      if (p.alive && (p.y < -200 || p.y > 1200)) fail(`level ${lvl}: buford flew off the map at t${t} (${p.x},${p.y})`);
    }
    finite(sim, `level ${lvl} (buford)`);
    for (const e of sim.enemies) {
      if (!Number.isFinite(e.x) || !Number.isFinite(e.y)) fail(`level ${lvl}: flung enemy NaN`);
    }
  } catch (err) {
    fail(`level ${lvl} buford random run crashed: ${err}`);
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

// ---- 7. weapon shrines ----
console.log("[7] weapon shrines");
for (let w = 1; w <= 9; w++) {
  const lvl = (w - 1) * 11 + 5;
  if (!isShrineLevel(lvl)) fail(`level ${lvl} should be a shrine level`);
  const parsed = parseLevel(getLevelDef(lvl));
  if (!parsed.shrine) {
    fail(`shrine level ${lvl} has no W marker`);
    continue;
  }
  const gifts: ShrineGift[] = [
    { kind: "weapon", weaponId: "jug" },
    { kind: "relic", relicId: "hootenanny" },
  ];
  const sim = mkSim(lvl, [{ id: "twang", level: 1 }], "earl", gifts);
  try {
    if (!sim.shrine) {
      fail(`level ${lvl}: createSim dropped the shrine`);
      continue;
    }
    const guardians = sim.enemies.filter((e) => e.leash);
    if (guardians.length !== 3) fail(`level ${lvl}: ${guardians.length} guardians, want 3`);
    // guardians stay fenced through a random-input run
    const rng = mulberry32(77 + lvl);
    let prev: [number, number] = [0, 0];
    for (let t = 0; t < 900; t++) {
      const cmd = (rng() < 0.4 ? 1 : 0) | (rng() < 0.4 ? 2 : 0) | (rng() < 0.25 ? 4 : 0) | (rng() < 0.3 ? 8 : 0);
      const inputs: [number, number] = [cmd, 0];
      step(sim, inputs, prev);
      prev = inputs;
      for (const e of sim.enemies) {
        if (!e.leash || e.phase.kind !== "normal" || e.flung > 0) continue;
        if (Math.abs(e.x - e.leash.x) > SHRINE_LEASH_R + 1) {
          fail(`level ${lvl}: guardian ${e.kind} wandered to ${e.x.toFixed(0)} (shrine ${e.leash.x})`);
          break;
        }
      }
    }
    // kill every enemy: the unclaimed shrine must hold the level open
    for (const e of sim.enemies) {
      e.phase = { kind: "dying", ticks: 0, targetX: e.x, targetY: e.y, chain: 1, toBoss: false };
    }
    for (let t = 0; t < 120; t++) step(sim, [0, 0], [0, 0]);
    if (sim.status !== "play") fail(`level ${lvl}: cleared with the shrine unclaimed (${sim.status})`);
    if (!sim.shrine.nagged) fail(`level ${lvl}: no claim-yer-prize nag`);
    // claim pedestal 0: jug joins the arsenal at Lv1, frenzy lights with it
    const p = sim.players[0];
    takeShrine(sim, p, 0);
    if (sim.shrine.taken !== 0) fail(`level ${lvl}: shrine not marked taken`);
    if (!sim.shrineTaken || sim.shrineTaken.gift.kind !== "weapon") fail(`level ${lvl}: no shrineTaken event`);
    if (!p.loadout.weapons.some((x) => x.id === "jug" && x.level === 1)) fail(`level ${lvl}: jug not granted`);
    if (!p.frenzy || p.frenzy.weapon !== "jug") fail(`level ${lvl}: frenzy not lit with the new weapon`);
    for (let t = 0; t < 240; t++) step(sim, [0, 0], [0, 0]);
    if (sim.status !== "cleared") fail(`level ${lvl}: level did not clear after claiming (${sim.status})`);
    finite(sim, `shrine ${lvl}`);
  } catch (err) {
    fail(`shrine level ${lvl} crashed: ${err}`);
  }
}
// relic path: full arsenal, hootenanny levels everything, still evolves the best
{
  const six = WEAPONS.slice(0, 6).map((w) => ({ id: w.id, level: 3 }));
  const sim = mkSim(5, six, "earl", [
    { kind: "relic", relicId: "hootenanny" },
    { kind: "relic", relicId: "forbiddenstill" },
  ]);
  for (let t = 0; t < 100; t++) step(sim, [0, 0], [0, 0]);
  takeShrine(sim, sim.players[0], 0);
  if (!sim.players[0].loadout.weapons.every((w) => w.level === 4)) fail("hootenanny did not level all weapons");
  const sim2 = mkSim(5, six.map((w) => ({ ...w })), "earl", [{ kind: "relic", relicId: "forbiddenstill" }]);
  for (let t = 0; t < 100; t++) step(sim2, [0, 0], [0, 0]);
  takeShrine(sim2, sim2.players[0], 0);
  if (sim2.players[0].loadout.evolved.length !== 1) fail("forbidden still did not evolve a weapon");
  console.log("    shrines + relics ok");
}

// ---- 8. run layer: card hands + shrine offers ----
console.log("[8] run layer hands + shrine offers");
{
  const run = newRun(4321, 1, ["earl", null]);
  const pr = run.players[0]!;
  if (pr.loadout.weapons.length !== 1 || pr.loadout.weapons[0].level !== 1) {
    fail(`new run should start with one Lv1 signature weapon, got ${JSON.stringify(pr.loadout.weapons)}`);
  }
  // simulate 98 intermissions of "always take the Lv-up", claiming a shrine
  // weapon at every shrine level, and check the hand shape throughout
  const kinds = new Set<string>();
  for (let lvl = 1; lvl <= 98; lvl++) {
    run.levelIndex = lvl;
    if (isShrineLevel(lvl)) {
      const gifts = shrineGiftsFor(run);
      if (gifts.length !== 2) fail(`level ${lvl}: shrine offers ${gifts.length} gifts, want 2`);
      const owned = new Set(pr.loadout.weapons.map((w) => w.id));
      for (const g of gifts) {
        if (g.kind === "weapon" && owned.has(g.weaponId)) fail(`level ${lvl}: shrine re-offered owned ${g.weaponId}`);
        if (g.kind === "weapon" && pr.loadout.weapons.length >= MAX_WEAPONS) fail(`level ${lvl}: offered a weapon to a full arsenal`);
      }
      const g0 = gifts[0];
      if (g0.kind === "weapon") pr.loadout.weapons.push({ id: g0.weaponId, level: 1 });
    } else if (shrineGiftsFor(run).length !== 0) {
      fail(`level ${lvl}: non-shrine level offered gifts`);
    }
    const hand: Card[] = dealCards(run, pr);
    if (hand.length !== 3) fail(`level ${lvl}: hand has ${hand.length} cards, want 3`);
    const keys = hand.map((c) => JSON.stringify(c));
    if (new Set(keys).size !== hand.length) fail(`level ${lvl}: duplicate cards in hand ${keys.join(" | ")}`);
    if (hand.filter((c) => c.kind === "tonic").length > 1) fail(`level ${lvl}: more than one tonic in hand`);
    for (const c of hand) kinds.add(c.kind);
    if ((hand as { kind: string }[]).some((c) => c.kind === "newWeapon")) fail(`level ${lvl}: newWeapon card dealt`);
    if (lvl <= 4 && !hand.some((c) => c.kind === "upgrade" && c.weaponId === "twang")) {
      fail(`level ${lvl}: early hand is missing the signature Lv-up (${keys.join(" | ")})`);
    }
    applyCard(pr, hand.find((c) => c.kind === "upgrade") ?? hand[0]);
  }
  if (pr.loadout.weapons.length !== MAX_WEAPONS) fail(`expected a full arsenal by level 98, got ${pr.loadout.weapons.length}`);
  console.log(`    hands ok; card kinds seen: ${[...kinds].sort().join(", ")}`);
  // full arsenal across a co-op party: relics only
  const coop = newRun(99, 60, ["earl", "buford"]);
  for (const p of coop.players) if (p) p.loadout.weapons = WEAPONS.slice(0, 6).map((w) => ({ id: w.id, level: 2 }));
  const relics = shrineGiftsFor(coop);
  if (!relics.every((g) => g.kind === "relic")) fail("full arsenal shrine should offer relics only");
}

// ---- 9. determinism: same seed + same inputs => identical state hashes ----
// The netcode contract. Every level is replayed from scratch with an
// identical command stream; checkpoint hashes must match exactly.
console.log("[9] determinism replay (99 solo + 9 co-op levels, run twice)");
{
  const mkStream = (seedN: number, ticks: number): number[] => {
    const rng = mulberry32(seedN);
    const cmds: number[] = [];
    let hookHold = 0;
    for (let t = 0; t < ticks; t++) {
      if (hookHold > 0) hookHold--;
      else if (rng() < 0.05) hookHold = 10 + Math.floor(rng() * 50);
      cmds.push(
        (rng() < 0.4 ? 1 : 0) |
          (rng() < 0.4 ? 2 : 0) |
          (rng() < 0.3 ? 4 : 0) |
          (rng() < 0.3 ? 8 : 0) |
          (hookHold > 0 ? 16 : 0),
      );
    }
    return cmds;
  };
  const replay = (make: () => Sim, streams: number[][]): number[] => {
    const sim = make();
    const hashes: number[] = [];
    let prev: number[] = streams.map(() => 0);
    for (let t = 0; t < streams[0].length; t++) {
      const inputs = streams.map((s) => s[t]);
      step(sim, inputs, prev);
      prev = inputs;
      if (t % 300 === 299) hashes.push(hashSim(sim));
    }
    hashes.push(hashSim(sim));
    return hashes;
  };
  // solo, Buford so the grapple state is exercised too
  for (let lvl = 1; lvl <= 99; lvl++) {
    const streams = [mkStream(31337 + lvl, 900)];
    const make = () => mkSim(lvl, [{ id: "washboard", level: 2 }], "buford");
    const a = replay(make, streams);
    const b = replay(make, streams);
    if (a.join() !== b.join()) fail(`level ${lvl}: solo replay diverged (${a.join()} vs ${b.join()})`);
  }
  // 2-player (one level per world): covers co-op paths + the PVP head bounce
  for (let w = 0; w < 9; w++) {
    const lvl = w * 11 + 3;
    const make = () =>
      createSim({
        seed: 555 + lvl,
        levelDef: getLevelDef(lvl),
        world: worldForLevel(lvl),
        levelIndex: lvl,
        isBoss: false,
        players: [
          { castId: "earl", loadout: { weapons: [{ id: "twang", level: 2 }], tonics: [], evolved: [] }, livesLeft: 3 },
          { castId: "buford", loadout: { weapons: [{ id: "washboard", level: 2 }], tonics: [], evolved: [] }, livesLeft: 3 },
        ],
        deathless: false,
        shrine: null,
      });
    const streams = [mkStream(111 + lvl, 900), mkStream(222 + lvl, 900)];
    const a = replay(make, streams);
    const b = replay(make, streams);
    if (a.join() !== b.join()) fail(`level ${lvl}: co-op replay diverged`);
  }
  console.log("    replays hash-identical");
}

// ---- 10. PVP head bounce ----
console.log("[10] pvp head bounce");
if (PVP_BOUNCE) {
  const sim = createSim({
    seed: 42,
    levelDef: getLevelDef(1),
    world: worldForLevel(1),
    levelIndex: 1,
    isBoss: false,
    players: [
      { castId: "earl", loadout: { weapons: [{ id: "twang", level: 2 }], tonics: [], evolved: [] }, livesLeft: 3 },
      { castId: "buford", loadout: { weapons: [{ id: "washboard", level: 2 }], tonics: [], evolved: [] }, livesLeft: 3 },
    ],
    deathless: false,
    shrine: null,
  });
  const [a, b] = sim.players;
  a.x = 300;
  b.x = 480;
  // through the intro, then settle both on the floor out of bounce range
  for (let t = 0; t < 220 && !(a.grounded && b.grounded); t++) {
    a.invuln = 60;
    b.invuln = 60;
    step(sim, [0, 0], [0, 0]);
  }
  if (!a.grounded || !b.grounded) fail("bounce test: players never settled");
  // drop the bouncer onto the trampoline's head
  a.x = b.x;
  a.y = b.y - P_HEIGHT - 2;
  a.vx = 0;
  a.vy = 3;
  a.grounded = false;
  step(sim, [0, 0], [0, 0]);
  if (a.vy > PVP_BOUNCE_VY + 3) fail(`bounce did not launch the bouncer (vy ${a.vy.toFixed(1)})`);
  if (b.squash <= 0) fail("bounce did not squash the trampoline");
  // a squashed jump is a stump-hop, not a real jump
  step(sim, [0, 4], [0, 0]);
  if (b.vy >= 0) fail("squashed player could not jump at all");
  if (b.vy < b.jumpVy * 0.7) fail(`squashed jump too strong (vy ${b.vy.toFixed(1)} vs full ${b.jumpVy})`);
  console.log("    bounce + squash ok");
} else {
  console.log("    PVP_BOUNCE is off; skipped");
}

// ---- 11. co-op ghost rules: free partner save, party wipe pays ----
console.log("[11] co-op ghost rules");
{
  const sim = createSim({
    seed: 7,
    levelDef: getLevelDef(1),
    world: worldForLevel(1),
    levelIndex: 1,
    isBoss: false,
    players: [
      { castId: "earl", loadout: { weapons: [{ id: "twang", level: 2 }], tonics: [], evolved: [] }, livesLeft: 3 },
      { castId: "buford", loadout: { weapons: [{ id: "goodbook", level: 2 }], tonics: [], evolved: [] }, livesLeft: 3 },
    ],
    deathless: false,
    shrine: null,
  });
  for (let t = 0; t < 100; t++) step(sim, [0, 0], [0, 0]); // through the intro
  const [a, b] = sim.players;
  // single death: ghost, no life charged
  a.invuln = 0;
  a.prayer = 0;
  hurtPlayer(sim, a);
  if (!a.ghost || a.alive) fail("co-op death should ghost");
  if (a.livesLeft !== 3) fail(`lone ghost charged a life (${a.livesLeft})`);
  // partner pop: free revive
  a.ghost!.x = b.x;
  a.ghost!.y = b.y - 10;
  b.invuln = 60;
  step(sim, [0, 0], [0, 0]);
  if (!a.alive || a.livesLeft !== 3) fail(`partner save should be free (alive ${a.alive}, lives ${a.livesLeft})`);
  // party wipe: both ghosts regenerate in place, one life each
  a.invuln = 0;
  b.invuln = 0;
  b.prayer = 0;
  hurtPlayer(sim, a);
  hurtPlayer(sim, b);
  if (!a.ghost || !b.ghost) fail("party wipe: both should ghost first");
  step(sim, [0, 0], [0, 0]);
  if (!a.alive || !b.alive) fail("party wipe: both should regenerate");
  if (a.livesLeft !== 2 || b.livesLeft !== 2) fail(`party wipe should charge one life each (${a.livesLeft}, ${b.livesLeft})`);
  if (a.invuln <= 0 || b.invuln <= 0) fail("regenerated players should get mercy invuln");
  console.log("    ghost rules ok");
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
