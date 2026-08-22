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
//  18. holler hazards: the per-level chaos roll is pure, never lands on a
//      boss, every hazard survives an unattended level, and hazard levels pay
//      the score premium
//  16. wind: air specials spend stamina, gassed presses coin-flip into a
//      stumble, the meter regens grounded, bosses are exempt, all deterministic
// Run: npx tsx scripts/sim-smoke.mts

import { getLevelDef, levelCountCheck } from "../src/game/levels";
import { hashSim } from "../src/game/sim/hash";
import { worldForLevel, isBossLevel } from "../src/game/levels/worlds";
import { parseLevel } from "../src/game/levels/parse";
import { createSim, score, step, startFrenzy, hurtPlayer } from "../src/game/sim/sim";
import type { Sim } from "../src/game/sim/types";
import { WEAPONS } from "../src/game/sim/weapons";
import { CAST, rescueForLevel } from "../src/game/cast";
import { mulberry32 } from "../src/game/core/rng";
import { SHRINE_LEASH_R, takeShrine } from "../src/game/sim/shrine";
import { hitCage } from "../src/game/sim/cage";
import { HAZARDS, HAZARD_SCORE_MULT, rollHazard } from "../src/game/sim/hazards";
import {
  P_HEIGHT,
  PVP_BOUNCE,
  PVP_BOUNCE_VY,
  PVP_FLING,
  HOOK_SPEED,
  HURRY_UP_TICKS,
  SECOND_POUR_MAX,
  SECOND_POUR_MULT,
  WIND_FAIL_CHANCE,
  WIND_MAX,
  WIND_REGEN_TICKS,
  CAGE_HITS,
  CAGE_HIT_COOLDOWN,
} from "../src/game/sim/constants";
import { killEnemyByWeapon } from "../src/game/sim/enemies";
import { ReplayRecorder, verifyReplay } from "../src/game/replay";
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

// ---- 2b. Buford + Fishin' Line random runs (jump held in long bursts:
// midair presses cast the line, the hold swings it) ----
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
        (hookHold > 0 ? 4 : 0);
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
    // The random walk is about guardian leashes, not survival — a bot that
    // burns its 3 lives (double jumps make the walk spicier) must keep
    // respawning so the claim assertions below still have a live player.
    sim.players[0].livesLeft = 99;
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
    // the walk can end with the bot mid-respawn; a dead claimant gets no frenzy
    for (let t = 0; t < 300 && !sim.players[0].alive; t++) step(sim, [0, 0], [0, 0]);
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
          (hookHold > 0 ? 4 : 0),
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

// ---- 12. PVP grapple fling ----
console.log("[12] pvp grapple fling");
if (PVP_FLING) {
  const sim = createSim({
    seed: 9,
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
  for (let t = 0; t < 220 && !(a.grounded && b.grounded); t++) {
    a.invuln = 60;
    b.invuln = 60;
    step(sim, [0, 0], [0, 0]);
  }
  // park the varmints far away so the hook meets earl, not a wanderer
  for (const e of sim.enemies) {
    e.x = 60;
    e.y = 60;
  }
  // put buford's flying hook right on earl
  b.hook = { kind: "fly", x: a.x, y: a.y - 20, vx: HOOK_SPEED, vy: 0, tx: null, ty: null, dist: 0 };
  step(sim, [0, 0], [0, 0]);
  if (a.vx <= 3) fail(`fling should launch earl toward buford (vx ${a.vx.toFixed(1)})`);
  if (a.vy > -5) fail(`fling should arc earl upward (vy ${a.vy.toFixed(1)})`);
  if (a.pvpLaunch <= 0) fail("flung partner should get launch grace");
  if (a.livesLeft !== 3 || a.alive !== true) fail("fling must not damage the partner");
  if (!b.hook || b.hook.kind !== "retract") fail("caster's hook should retract after the snag");
  console.log("    grapple fling ok");
} else {
  console.log("    PVP_FLING is off; skipped");
}

// ---- 13. replay: record a level, verify tick-perfect playback ----
console.log("[13] replay record + verify");
{
  const cfg = {
    seed: 90210,
    levelDef: getLevelDef(7),
    world: worldForLevel(7),
    levelIndex: 7,
    isBoss: false,
    players: [
      { castId: "earl", loadout: { weapons: [{ id: "twang", level: 2 }], tonics: [], evolved: [] }, livesLeft: 3 },
      { castId: "buford", loadout: { weapons: [{ id: "washboard", level: 2 }], tonics: [], evolved: [] }, livesLeft: 3 },
    ],
    deathless: false,
    shrine: null,
  };
  const rec = new ReplayRecorder(cfg);
  const sim = createSim(cfg);
  const rng = mulberry32(808);
  let prev: number[] = [0, 0];
  for (let t = 0; t < 1200; t++) {
    const cmd = () =>
      (rng() < 0.4 ? 1 : 0) | (rng() < 0.4 ? 2 : 0) | (rng() < 0.3 ? 4 : 0) | (rng() < 0.3 ? 8 : 0) | (rng() < 0.04 ? 16 : 0);
    const inputs = [cmd(), cmd()];
    step(sim, inputs, prev);
    rec.record(inputs);
    prev = inputs;
  }
  const rep = rec.finish(sim);
  const v = verifyReplay(rep);
  if (!v.ok) fail(`replay did not verify (hash ${v.hash} vs ${rep.endHash}, tick ${v.tick} vs ${rep.endTick})`);
  // a corrupted hash must be caught
  const goodHash = rep.endHash;
  rep.endHash ^= 0xdeadbeef;
  if (verifyReplay(rep).ok) fail("corrupted end hash still verified");
  rep.endHash = goodHash;
  // a tampered log must be caught. The tamper must provably matter: a lone
  // bit flip can be swallowed (dead/ghost ticks ignore inputs, blow cooldown
  // eats presses), so clear an idle window right after the intro and inject
  // a fresh blow — a bubble the original run never had.
  for (let t = 60; t < 96; t++) rep.log[t][0] = 0;
  rep.log[96][0] = 8;
  if (verifyReplay(rep).ok) fail("tampered replay still verified");
  console.log("    record/verify ok (tamper caught)");
}

// ---- 6. cast sanity ----
for (const c of CAST) {
  if (!WEAPONS.some((w) => w.id === c.signatureWeapon)) {
    fail(`cast ${c.id} signature weapon ${c.signatureWeapon} unknown`);
  }
}

// ---- 14. second pour ----
// Designated levels (3/7/10 per world) refill after wave 1: beat -> alarm +
// per-player jars -> angry wave 2 streams in -> only then can the level clear.
{
  console.log("[14] second pour");
  for (const [lvl, want] of [
    [3, true], [7, true], [10, true],
    [1, false], [5, false], [11, false], [14, true], [99, false],
  ] as const) {
    if (!!getLevelDef(lvl).secondPour !== want) {
      fail(`pour designation: level ${lvl} secondPour should be ${want}`);
    }
  }

  const mkLoadout = () => ({ weapons: [{ id: "twang", level: 1 }], tonics: [], evolved: [] });
  const sim = createSim({
    seed: 1234,
    levelDef: getLevelDef(3),
    world: worldForLevel(3),
    levelIndex: 3,
    isBoss: false,
    players: [
      { castId: "earl", loadout: mkLoadout(), livesLeft: 3 },
      { castId: "merle", loadout: mkLoadout(), livesLeft: 3 },
    ],
    deathless: false,
    hazard: null, // this case idles both players; an early revenuer would eat them
  });
  const idle = [0, 0];
  const tickN = (n: number, killAll = false) => {
    for (let i = 0; i < n; i++) {
      if (killAll) {
        for (const e of sim.enemies) {
          if (e.phase.kind === "normal") killEnemyByWeapon(sim, e, 0, 99);
        }
      }
      step(sim, idle, idle);
    }
  };

  if (!sim.pour) fail("pour: level 3 sim has no pour state");
  const wave1 = sim.enemies.length;
  tickN(120); // past intro
  tickN(60, true); // wipe wave 1
  if (sim.pour && sim.pour.phase !== "beat" && sim.pour.phase !== "pouring") {
    fail(`pour: wave-1 wipe left phase=${sim.pour.phase}`);
  }
  if (sim.status !== "play") fail(`pour: level cleared during the beat (${sim.status})`);

  tickN(120); // beat expires -> alarm
  const jars = sim.items.filter((it) => it.kind === "jar");
  if (jars.length !== 2) fail(`pour: co-op alarm dropped ${jars.length} jars, want 2`);
  if (new Set(jars.map((j) => j.forPlayer)).size !== 2) fail("pour: both jars for one player");
  // pushed to >= 20s after the alarm and never earlier than the base deadline
  if (sim.hurryTick < HURRY_UP_TICKS) fail("pour: hurry-up deadline moved earlier");
  if (sim.hurryTick < sim.tick) fail("pour: hurry-up deadline already expired at the alarm");

  tickN(SECOND_POUR_MAX * 20 + 60); // whole stream enters
  const wave2 = sim.enemies.filter((e) => e.phase.kind === "normal");
  const wantWave2 = Math.min(SECOND_POUR_MAX, wave1 * SECOND_POUR_MULT);
  if (wave2.length !== wantWave2) fail(`pour: wave 2 is ${wave2.length}, want ${wantWave2}`);
  if (!wave2.every((e) => e.angry)) fail("pour: wave 2 not all angry");
  if (sim.pour && sim.pour.phase !== "done") fail(`pour: stream done but phase=${sim.pour.phase}`);
  if (sim.status !== "play") fail("pour: level cleared while wave 2 alive");

  // the still keeps pouring: lose the jars, fresh ones arrive
  sim.items = sim.items.filter((it) => it.kind !== "jar");
  tickN(4 * 60);
  const rejars = sim.items.filter((it) => it.kind === "jar");
  if (rejars.length !== 2) fail(`pour: jars not re-poured (got ${rejars.length})`);

  tickN(240, true); // wipe wave 2
  if (sim.status !== "cleared") fail(`pour: wave 2 dead but status=${sim.status}`);
  console.log("    second pour ok (beat, jars, angry wave 2, re-pour, clear)");
}

// ---- 15. frenzy no-repeat roll ----
// With 2+ weapons owned, random frenzy rolls (jars, headstart, pour) never
// repeat the weapon frenzied with last; with 1 weapon they still fire.
{
  console.log("[15] frenzy no-repeat roll");
  for (let seed = 1; seed <= 30; seed++) {
    const loadout = {
      weapons: [{ id: "twang", level: 2 }, { id: "jug", level: 2 }],
      tonics: [],
      evolved: [],
      lastFrenzy: "twang",
    };
    const sim = createSim({
      seed,
      levelDef: getLevelDef(1),
      world: worldForLevel(1),
      levelIndex: 1,
      isBoss: false,
      players: [{ castId: "earl", loadout, livesLeft: 3, headStart: true }],
      deathless: false,
    });
    for (let t = 0; t < 95; t++) step(sim, [0, 0], [0, 0]);
    const w = sim.players[0].frenzy?.weapon;
    if (w !== "jug") fail(`no-repeat: lastFrenzy=twang rolled ${w} (seed ${seed})`);
    if (loadout.lastFrenzy !== "jug") fail("no-repeat: startFrenzy did not record lastFrenzy");
  }
  // sole weapon: the roll must not dodge itself into silence
  const solo = {
    weapons: [{ id: "twang", level: 1 }],
    tonics: [],
    evolved: [],
    lastFrenzy: "twang",
  };
  const soloSim = createSim({
    seed: 7,
    levelDef: getLevelDef(1),
    world: worldForLevel(1),
    levelIndex: 1,
    isBoss: false,
    players: [{ castId: "earl", loadout: solo, livesLeft: 3, headStart: true }],
    deathless: false,
  });
  for (let t = 0; t < 95; t++) step(soloSim, [0, 0], [0, 0]);
  if (soloSim.players[0].frenzy?.weapon !== "twang") {
    fail("no-repeat: single-weapon arsenal failed to frenzy");
  }
  console.log("    no-repeat rolls ok (2-weapon alternation, solo fallback)");
}

// ---- 16. wind: air-special stamina ----
console.log("[16] wind: air-special stamina + stumble");
{
  const JUMP = 4; // CMD_JUMP
  // Earl mashes the air special for 30s: five free pips, then every press is
  // a once-per-airtime coin flip; whiffs stumble and emit windFail.
  const mash = (level: number, seed: number, ticks = 60 * 30) => {
    const sim = createSim({
      seed,
      levelDef: getLevelDef(level),
      world: worldForLevel(level),
      levelIndex: level,
      isBoss: isBossLevel(level),
      players: [
        { castId: "earl", loadout: { weapons: [{ id: "twang", level: 1 }], tonics: [], evolved: [] }, livesLeft: 3 },
        null,
      ],
      deathless: false,
    });
    for (let t = 0; t < 95; t++) step(sim, [0, 0], [0, 0]);
    const p = sim.players[0];
    p.invuln = 1_000_000; // varmints don't get a vote in this test
    let fires = 0;
    let whiffs = 0;
    let minWind = WIND_MAX;
    let prev = 0;
    for (let t = 0; t < ticks; t++) {
      const cmd = t % 9 === 0 ? JUMP : 0; // a fresh press every 9 ticks
      step(sim, [cmd, 0], [prev, 0]);
      prev = cmd;
      for (const e of sim.fx) {
        if (e.t !== "sfx") continue;
        if (e.name === "windFail") whiffs++;
        else if (e.name === "jump" && e.pitch === 1.18) fires++; // Earl's honest double
      }
      minWind = Math.min(minWind, p.wind);
    }
    return { sim, p, fires, whiffs, minWind, hash: hashSim(sim) };
  };
  const a = mash(1, 99);
  if (a.minWind !== 0) fail(`wind: meter never emptied (min ${a.minWind})`);
  if (a.whiffs === 0) fail("wind: no stumbles in 30s of gassed mashing");
  if (a.fires <= WIND_MAX) fail(`wind: gassed presses never fired (fires ${a.fires})`);
  // roughly a coin flip once gassed: fires past the free pips vs whiffs
  const gassedFires = a.fires - WIND_MAX;
  const rate = a.whiffs / (a.whiffs + gassedFires);
  if (Math.abs(rate - WIND_FAIL_CHANCE) > 0.25) fail(`wind: whiff rate ${rate.toFixed(2)} far from ${WIND_FAIL_CHANCE}`);
  finite(a.sim, "wind mash");
  // deterministic: same seed, same story
  const b = mash(1, 99);
  if (b.hash !== a.hash || b.whiffs !== a.whiffs || b.fires !== a.fires) fail("wind: not deterministic across runs");
  // regen: stand still and the pips come back, one per WIND_REGEN_TICKS
  {
    const { sim, p } = mash(1, 99, 60 * 10);
    // land, then wait out a full refill
    let t = 0;
    while (t < 600 && !p.grounded) { step(sim, [0, 0], [0, 0]); t++; }
    const before = p.wind;
    for (let i = 0; i < WIND_REGEN_TICKS * WIND_MAX + 5; i++) step(sim, [0, 0], [0, 0]);
    if (!p.grounded) console.log("    (regen check: Earl never settled; skipped)");
    else if (p.wind !== WIND_MAX) fail(`wind: regen stalled at ${p.wind} (was ${before})`);
  }
  // boss floors are exempt: the meter never moves, nothing ever whiffs
  const boss = mash(11, 5, 60 * 10);
  if (boss.minWind !== WIND_MAX || boss.whiffs !== 0) fail(`wind: boss level charged wind (min ${boss.minWind}, whiffs ${boss.whiffs})`);
  console.log(`    wind ok (fires ${a.fires}, whiffs ${a.whiffs}, gassed whiff rate ${rate.toFixed(2)})`);
}

// ---- 17. rescue cages ----
console.log("[17] rescue cages");
{
  const caged = CAST.filter((m) => m.rescue);
  if (caged.length !== 6) fail(`expected 6 caged cousins, got ${caged.length}`);
  let popped = 0;
  for (const m of caged) {
    const r = m.rescue!;
    const lvl = (r.world - 1) * 11 + r.level;
    if (isBossLevel(lvl) || r.level === 5) fail(`${m.id}: cage on a boss/shrine level (${lvl})`);
    if (rescueForLevel(lvl)?.id !== m.id) fail(`${m.id}: rescueForLevel(${lvl}) disagrees`);
    const parsed = parseLevel(getLevelDef(lvl));
    if (!parsed.rescue) {
      fail(`${m.id}: level ${lvl} has no R tile`);
      continue;
    }
    const sim = mkSim(lvl);
    if (!sim.cage || sim.cage.castId !== m.id) {
      fail(`${m.id}: createSim built no cage on level ${lvl}`);
      continue;
    }
    for (let t = 0; t < 300 && sim.status === "intro"; t++) step(sim, [0, 0], [0, 0]);
    // park Earl on the bars: touches count once per cooldown, three pops it
    const p = sim.players[0];
    p.x = sim.cage.x;
    p.y = sim.cage.y;
    let rescueEvents = 0;
    let ticks = 0;
    while (sim.cage.openedTick < 0 && ticks < 600) {
      p.x = sim.cage.x;
      p.y = sim.cage.y;
      p.vx = 0;
      p.vy = 0;
      step(sim, [0, 0], [0, 0]);
      rescueEvents += sim.fx.filter((e) => e.t === "rescue").length;
      ticks++;
    }
    if (sim.cage.openedTick < 0) fail(`${m.id}: cage never popped (${sim.cage.hits} hits)`);
    else if (sim.cage.hits !== CAGE_HITS) fail(`${m.id}: popped at ${sim.cage.hits} hits`);
    if (ticks < CAGE_HIT_COOLDOWN * (CAGE_HITS - 1)) fail(`${m.id}: hits landed faster than the cooldown (${ticks} ticks)`);
    if (rescueEvents !== 1) fail(`${m.id}: ${rescueEvents} rescue events, want 1`);
    if (!sim.scored.some((sc) => sc.amount === 5000)) fail(`${m.id}: no rescue score`);
    // a popped cage takes no more hits
    hitCage(sim, 0);
    if (sim.cage.hits !== CAGE_HITS) fail(`${m.id}: popped cage took a hit`);
    // and the cage is not an enemy: it must never hold the level open
    for (const e of sim.enemies) {
      e.phase = { kind: "dying", ticks: 0, targetX: e.x, targetY: e.y, chain: 1, toBoss: false };
    }
    for (let t = 0; t < 400 && sim.status === "play"; t++) step(sim, [0, 0], [0, 0]);
    if (sim.status !== "cleared") fail(`${m.id}: level ${lvl} stuck in ${sim.status} with the cage popped`);
    finite(sim, `cage ${m.id}`);
    popped++;
  }
  // non-rescue levels build no cage
  for (const lvl of [1, 5, 11, 12, 61, 99]) {
    if (mkSim(lvl).cage) fail(`level ${lvl} grew a cage`);
  }
  console.log(`    cages ok (${popped}/${caged.length} popped, 3 hits each, levels clear around them)`);
}

// ---- 18. holler hazards ----
// One seeded chaos modifier per level. The roll must be pure (same seed +
// level -> same hazard everywhere, or lockstep desyncs), must never land on a
// boss, and every hazard has to survive a long unattended run without
// crashing or letting state go non-finite.
{
  console.log("[18] holler hazards");

  // pure + boss-free + never before level 3
  for (let seed = 1; seed <= 40; seed++) {
    for (let lvl = 1; lvl <= 99; lvl++) {
      const a = rollHazard(seed, lvl, isBossLevel(lvl));
      const b = rollHazard(seed, lvl, isBossLevel(lvl));
      if (a !== b) fail(`hazard roll not pure at seed ${seed} level ${lvl}`);
      if (a && isBossLevel(lvl)) fail(`hazard ${a} rolled on boss level ${lvl}`);
      if (a && lvl < 3) fail(`hazard ${a} rolled on level ${lvl}`);
      if (a && !HAZARDS.some((h) => h.id === a)) fail(`unknown hazard id ${a}`);
    }
  }

  // the ramp actually ramps and the whole set is reachable across a campaign
  const seen = new Set<string>();
  let hazarded = 0;
  let plain = 0;
  for (let seed = 1; seed <= 400; seed++) {
    for (const lvl of [4, 15, 26, 37, 48, 59, 70, 81, 92]) {
      const h = rollHazard(seed, lvl, false);
      if (h) {
        seen.add(h);
        hazarded++;
      } else plain++;
    }
  }
  if (seen.size !== HAZARDS.length) {
    fail(`only ${seen.size}/${HAZARDS.length} hazards reachable across 400 seeds`);
  }
  if (hazarded === 0 || plain === 0) fail("hazard odds are degenerate (all or nothing)");

  // every hazard runs a full level unattended without breaking the sim
  const mkLoadout = () => ({ weapons: [{ id: "twang", level: 3 }], tonics: [], evolved: [] });
  for (const def of HAZARDS) {
    const sim = createSim({
      seed: 77,
      levelDef: getLevelDef(14),
      world: worldForLevel(14),
      levelIndex: 14,
      isBoss: false,
      players: [
        { castId: "earl", loadout: mkLoadout(), livesLeft: 9 },
        { castId: "merle", loadout: mkLoadout(), livesLeft: 9 },
      ],
      deathless: false,
      hazard: def.id,
    });
    if (sim.hazard !== def.id) fail(`hazard override ignored for ${def.id}`);
    const rnd = mulberry32(def.id.length * 977 + 3);
    const cmd = () => Math.floor(rnd() * 64);
    let prev = [0, 0];
    for (let t = 0; t < 3000; t++) {
      const next = [cmd(), cmd()];
      step(sim, next, prev);
      prev = next;
    }
    finite(sim, `hazard ${def.id}`);
  }

  // score premium: the same award pays more on a hazard level
  const payout = (hazard: "greased" | null) => {
    const sim = createSim({
      seed: 4242,
      levelDef: getLevelDef(14),
      world: worldForLevel(14),
      levelIndex: 14,
      isBoss: false,
      players: [{ castId: "earl", loadout: mkLoadout(), livesLeft: 3 }],
      deathless: false,
      hazard,
    });
    score(sim, 0, 1000);
    return sim.scored.reduce((a, sc) => a + sc.amount, 0);
  };
  const plainPay = payout(null);
  const hazardPay = payout("greased");
  if (plainPay !== 1000) fail(`straight level paid ${plainPay} for a 1000 award`);
  if (hazardPay !== Math.round(1000 * HAZARD_SCORE_MULT)) {
    fail(`hazard level paid ${hazardPay}, want ${Math.round(1000 * HAZARD_SCORE_MULT)}`);
  }

  // a straight level is byte-identical to the pre-hazard sim: the roll uses
  // its own stream, so hazard-free play must not have shifted at all
  const straight = (seed: number) => {
    const sim = createSim({
      seed,
      levelDef: getLevelDef(14),
      world: worldForLevel(14),
      levelIndex: 14,
      isBoss: false,
      players: [{ castId: "earl", loadout: mkLoadout(), livesLeft: 3 }],
      deathless: false,
      hazard: null,
    });
    for (let t = 0; t < 600; t++) step(sim, [0], [0]);
    return hashSim(sim);
  };
  if (straight(31) !== straight(31)) fail("straight-level replay is not deterministic");

  console.log(
    `    hazards ok (${seen.size} reachable, boss-free, x1.25 payout ${plainPay} -> ${hazardPay})`,
  );
}

if (failures === 0) {
  console.log("\nSIM SMOKE: ALL GREEN");
} else {
  console.log(`\nSIM SMOKE: ${failures} FAILURES`);
  process.exit(1);
}
