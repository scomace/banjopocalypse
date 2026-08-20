// Headless smoke test for Buford's Fishin' Line. Run: npx tsx scripts/hook-test.mts
// The line is Buford's air special now: JUMP once to leave the ground, press
// JUMP again midair to cast, keep it held to swing, release to let fly.
import { createSim, step } from "../src/game/sim/sim";
import { getLevelDef, WORLDS } from "../src/game/levels/index";
import { CMD_JUMP, CMD_RIGHT } from "../src/game/core/input";
import { LEVEL_INTRO_TICKS } from "../src/game/sim/constants";

const sim = createSim({
  seed: 7,
  levelDef: getLevelDef(1),
  world: WORLDS[0],
  levelIndex: 1,
  isBoss: false,
  players: [{ castId: "buford", loadout: { weapons: [{ id: "washboard", level: 2 }], tonics: [], evolved: [] }, livesLeft: 3 }, null],
  deathless: true,
});
let prev: [number, number] = [0, 0];
const run = (cmd: number, n: number, label?: string) => {
  for (let i = 0; i < n; i++) {
    const inputs: [number, number] = [cmd, 0];
    step(sim, inputs, prev);
    prev = inputs;
    for (const e of sim.fx) if (e.t === "sfx" || e.t === "burst") console.log(`  t${sim.tick} fx`, e.t === "sfx" ? e.name : e.text);
  }
  const p = sim.players[0];
  console.log(`${label ?? ""} t=${sim.tick} pos=(${p.x.toFixed(0)},${p.y.toFixed(0)}) v=(${p.vx.toFixed(2)},${p.vy.toFixed(2)}) grounded=${p.grounded} hook=${p.hook ? p.hook.kind + (p.hook.kind === "hold" ? ` len=${p.hook.len.toFixed(0)} a=(${p.hook.ax.toFixed(0)},${p.hook.ay.toFixed(0)})` : "") : "none"} kick=${p.hookKick}`);
};
const p = sim.players[0];
/** Park Buford airborne with the line stowed so a JUMP press casts clean. */
const airborneAt = (x: number, y: number) => {
  p.x = x; p.y = y; p.vx = 0; p.vy = 0; p.facing = 1;
  p.hook = null; p.hookCooldown = 0; p.hookKick = 0;
  p.grounded = false; p.coyote = 0; p.jumpBuffer = 0;
};
run(0, LEVEL_INTRO_TICKS + 5, "intro done");
// The honest full flow: ground jump, release, second press casts.
run(CMD_JUMP, 2, "ground jump");
run(0, 6, "rising, released");
run(CMD_JUMP, 1, "air press: cast");
run(CMD_JUMP, 3, "flying");
run(CMD_JUMP, 20, "swinging+reel");
run(CMD_JUMP | CMD_RIGHT, 30, "pumping right");
run(0, 1, "released: let fly");
run(0, 10, "airborne");
run(0, 60, "landed?");
// Cast straight into an enemy sitting on the 50-degree ray.
const e = sim.enemies[0];
airborneAt(480, 512);
e.x = 480 + 32; e.y = 487 - 38 + 14; e.vx = 0; e.vy = 0; e.phase = { kind: "normal" }; e.flung = 0;
console.log("enemy0", e.kind, e.x.toFixed(0), e.y.toFixed(0), "hp", e.hp);
run(CMD_JUMP, 1, "cast at enemy");
run(CMD_JUMP, 4, "hook flying");
console.log("enemy0 after", e.kind, "hp", e.hp, "flung", e.flung, "v", e.vx.toFixed(1), e.vy.toFixed(1), "phase", e.phase.kind);
run(0, 90, "enemy settles");
console.log("enemy0 settled", "flung", e.flung, "pos", e.x.toFixed(0), e.y.toFixed(0), "phase", e.phase.kind, "hp", e.hp);
// Swing-kick: put an enemy under the swing arc and swing through it fast.
const e2 = sim.enemies[1];
airborneAt(480, 512);
e2.x = 560; e2.y = 512; e2.vx = 0; e2.vy = 0; e2.phase = { kind: "normal" }; e2.flung = 0;
const hp2 = e2.hp;
run(CMD_JUMP | CMD_RIGHT, 1, "cast");
run(CMD_JUMP | CMD_RIGHT, 45, "swing right");
console.log("enemy1", e2.kind, "hp", hp2, "->", e2.hp, "flung", e2.flung, "phase", e2.phase.kind, "player alive", p.alive, "lives", p.livesLeft);
// Under-the-porch case: hang beneath the low left platform and cast.
airborneAt(127, 512);
run(0, 2, "porch setup");
airborneAt(127, 512);
run(CMD_JUMP, 1, "porch cast");
run(CMD_JUMP, 8, "porch fly");
run(CMD_JUMP, 50, "porch hold");
run(CMD_JUMP, 40, "porch hold more");
