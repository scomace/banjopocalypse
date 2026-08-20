// The simulation orchestrator: createSim + step. Deterministic — everything
// flows from (seed, input stream). Presentation reads state + drains fx.

import { CMD_BLOW, CMD_JUMP, CMD_LEFT, CMD_RIGHT } from "../core/input";
import { mulberry32, pick, rangeInt } from "../core/rng";
import type { EnemyKind, LevelDef, ParsedLevel, WorldDef } from "../levels/types";
import { W_LEFT, W_RIGHT, W_UP } from "../levels/types";
import { parseLevel } from "../levels/parse";
import { castById, castJumpMult } from "../cast";
import {
  BUBBLE_BLOW_COOLDOWN,
  BUBBLE_BOUNCE_VY,
  BUBBLE_LAUNCH_SPEED,
  BUBBLE_LAUNCH_TICKS,
  BUBBLE_PUFF_TICKS_PER_PIP,
  BUBBLE_R,
  BUBBLE_RIDE_POPS_AT,
  BUBBLE_RIDE_TICKS,
  BUBBLE_RISE,
  BUBBLE_TRAP_TICKS,
  BUBBLE_TTL_TICKS,
  CHAIN_WINDOW_TICKS,
  COYOTE_TICKS,
  FIELD_H,
  FIELD_W,
  FRENZY_TICKS,
  GHOST_REVIVE_TICKS,
  HURRY_UP_TICKS,
  JAR_INTERVAL_TICKS,
  JUMP_BUFFER_TICKS,
  LEVEL_CLEAR_TICKS,
  LEVEL_INTRO_TICKS,
  P_ACCEL,
  P_AIR_CONTROL,
  P_CEILING_Y,
  P_DECEL,
  P_GRAVITY,
  P_HEIGHT,
  P_INVULN_TICKS,
  P_JUMP_CUT_VY,
  P_JUMP_VY,
  P_MAX_FALL,
  P_MAX_SPEED,
  P_RESPAWN_TICKS,
  P_WIDTH,
  PVP_BOUNCE,
  PVP_BOUNCE_LAUNCH_TICKS,
  PVP_BOUNCE_VY,
  PVP_SQUASH_JUMP_MULT,
  PVP_SQUASH_TICKS,
  SCORE_POP_BASE,
  SPECIAL_FIRST_TICKS,
  SPECIAL_INTERVAL_TICKS,
  TICK_HZ,
  TILE,
} from "./constants";
import {
  circleOverlapsBox,
  moveBody,
  standingOnGround,
  tileAt,
  windAt,
} from "./physics";
import { T_SPIKES } from "../levels/types";
import type {
  Bubble,
  Enemy,
  FxEvent,
  Item,
  Loadout,
  PlayerState,
  ShrineGift,
  Sim,
  SimInputs,
} from "./types";
import { killEnemyByWeapon, spawnEnemy, stepEnemies } from "./enemies";
import { stepWeapons } from "./weapons";
import { spawnSpecial, stepSpecialsAndZones } from "./specials";
import { createBoss, stepBoss } from "./boss";
import { spawnFood, stepItems } from "./items";
import { applyHookConstraint, stepHookBody, stepHookControl } from "./hook";
import { createShrine, nagShrine, shrineHoldsLevel, stepShrine } from "./shrine";

export type SimPlayerConfig = {
  castId: string;
  loadout: Loadout;
  livesLeft: number;
  /** Jar o' Lightnin' card: open the level already in a frenzy */
  headStart?: boolean;
};

export type SimConfig = {
  seed: number;
  levelDef: LevelDef;
  world: WorldDef;
  levelIndex: number;
  isBoss: boolean;
  players: (SimPlayerConfig | null)[];
  /** run has been deathless this world -> secret door may appear on boss level */
  deathless: boolean;
  /** weapon shrine pedestals for this level (level 5 of a world), else absent */
  shrine?: ShrineGift[] | null;
};

export function createSim(cfg: SimConfig): Sim {
  const rng = mulberry32(cfg.seed);
  const level = parseLevel(cfg.levelDef);
  const players: PlayerState[] = [];
  for (let i = 0; i < 2; i++) {
    const pc = cfg.players[i];
    if (!pc) continue;
    const cast = castById(pc.castId);
    const spawn = i === 0 ? level.spawns.p1 : level.spawns.p2;
    players.push({
      index: i as 0 | 1,
      castId: pc.castId,
      loadout: pc.loadout,
      livesLeft: pc.livesLeft,
      alive: pc.livesLeft > 0,
      spectating: pc.livesLeft <= 0,
      ghost: null,
      x: spawn.x,
      y: spawn.y,
      vx: 0,
      vy: 0,
      facing: i === 0 ? 1 : -1,
      grounded: false,
      coyote: 0,
      jumpBuffer: 0,
      jumpHeld: false,
      blowHeld: false,
      blowCooldown: 0,
      invuln: P_INVULN_TICKS,
      respawnIn: 0,
      maxSpeed: P_MAX_SPEED * (0.85 + cast.speed * 0.06),
      jumpVy: P_JUMP_VY * castJumpMult(cast.jump),
      puffTicks:
        BUBBLE_LAUNCH_TICKS +
        cast.puff * BUBBLE_PUFF_TICKS_PER_PIP +
        (pc.loadout.tonics.includes("lungbutter") ? 8 : 0),
      luck: cast.luck + (pc.loadout.tonics.includes("rabbitfoot") ? 2 : 0),
      frenzy: null,
      weaponCooldowns: {},
      hogFatCharge: pc.loadout.tonics.includes("hogfat"),
      headStart: !!pc.headStart && pc.livesLeft > 0,
      prayer: 0,
      hook: null,
      hookCooldown: 0,
      hookKick: 0,
      pvpLaunch: 0,
      squash: 0,
      anim: "idle",
      animLock: 0,
      hicPitch: 1,
    });
  }

  const sim: Sim = {
    tick: 0,
    rng,
    level,
    world: cfg.world,
    levelIndex: cfg.levelIndex,
    isBoss: cfg.isBoss,
    status: "intro",
    statusTicks: LEVEL_INTRO_TICKS,
    players,
    bubbles: [],
    enemies: [],
    projectiles: [],
    pets: [],
    items: [],
    specials: [],
    zones: [],
    hog: { active: false, x: 0, y: 0, vx: 0, facing: 1, ticks: 0 },
    boss: cfg.isBoss ? createBoss(cfg.world.bossId, cfg.world.bossName) : null,
    revenuer: { active: false, x: -60, y: 60, vx: 0, vy: 0 },
    nextId: 1,
    nextJarTick: Math.floor(JAR_INTERVAL_TICKS * (0.5 + rng() * 0.5)),
    nextSpecialTick: Math.floor(SPECIAL_FIRST_TICKS * (0.8 + rng() * 0.6)),
    chains: [
      { count: 0, lastTick: -9999 },
      { count: 0, lastTick: -9999 },
    ],
    fx: [],
    scored: [],
    lettersFound: [],
    livesFound: [],
    deaths: [],
    secretDoorOpen: cfg.deathless && cfg.isBoss && level.secretDoor !== null,
    secretEntered: false,
    shrine: null,
    shrineTaken: null,
  };

  // Enemies present from tick 0 (non-boss levels).
  if (!cfg.isBoss) {
    for (const s of level.enemySpawns) {
      sim.enemies.push(spawnEnemy(sim, s.kind, s.x, s.y));
    }
  }
  if (cfg.shrine && cfg.shrine.length > 0 && !cfg.isBoss) {
    sim.shrine = createShrine(sim, cfg.shrine);
  }
  return sim;
}

export function emit(sim: Sim, e: FxEvent): void {
  if (sim.fx.length < 64) sim.fx.push(e);
}

export function score(sim: Sim, player: 0 | 1, amount: number): void {
  sim.scored.push({ player, amount });
}

// ---------------------------------------------------------------- players

function stepPlayer(sim: Sim, p: PlayerState, cmd: number, prevCmd: number): void {
  if (p.spectating) return;

  // Ghost bubble (dead in co-op, waiting for partner revive).
  if (p.ghost) {
    const g = p.ghost;
    g.ticks++;
    g.x += g.vx;
    g.y += g.vy + Math.sin(g.ticks / 22) * 0.35;
    if (g.x < 30 || g.x > FIELD_W - 30) g.vx *= -1;
    if (g.y < 40) g.vy = Math.abs(g.vy);
    if (g.y > FIELD_H - 40) g.vy = -Math.abs(g.vy);
    // partner pop check
    const partner = sim.players.find((q) => q !== p && q.alive);
    if (partner && circleOverlapsBox(g.x, g.y, 20, partner.x, partner.y, P_WIDTH + 8, P_HEIGHT)) {
      // A partner pop is a free save — no life was charged for this death.
      p.ghost = null;
      p.alive = true;
      p.x = partner.x;
      p.y = partner.y - 4;
      p.vy = -4;
      p.invuln = P_INVULN_TICKS;
      emit(sim, { t: "sfx", name: "revive" });
      emit(sim, { t: "burst", text: "HALLELUJAH!", x: g.x, y: g.y - 30 });
      emit(sim, { t: "balloon", player: p.index, trigger: "revive" });
    }
    return;
  }

  if (!p.alive) {
    if (p.respawnIn > 0) {
      p.respawnIn--;
      if (p.respawnIn === 0) {
        const spawn = p.index === 0 ? sim.level.spawns.p1 : sim.level.spawns.p2;
        p.alive = true;
        p.x = spawn.x;
        p.y = spawn.y;
        p.vx = 0;
        p.vy = 0;
        p.invuln = P_INVULN_TICKS;
        p.anim = "idle";
      }
    }
    return;
  }

  const left = (cmd & CMD_LEFT) !== 0;
  const right = (cmd & CMD_RIGHT) !== 0;
  const jump = (cmd & CMD_JUMP) !== 0;
  const jumpPressed = jump && !(prevCmd & CMD_JUMP);
  const blow = (cmd & CMD_BLOW) !== 0;
  const blowPressed = blow && !(prevCmd & CMD_BLOW);

  const speedMult = p.loadout.tonics.includes("rocketfuel") ? 1.18 : 1;
  const maxSpeed = p.maxSpeed * speedMult;

  // Fishin' Line: cast / reel / let go (Buford)
  if (castById(p.castId).hook) stepHookControl(sim, p, cmd, prevCmd);
  const swinging = p.hook !== null && p.hook.kind === "hold";

  // horizontal. On the line you pump harder; off it, a launch past maxSpeed
  // is kept (and bled off only on the ground) instead of clipped.
  const accel = p.grounded ? P_ACCEL : P_ACCEL * (swinging ? 0.8 : P_AIR_CONTROL);
  if (left && !right) {
    p.vx = p.vx <= -maxSpeed ? p.vx : Math.max(p.vx - accel, -maxSpeed);
    p.facing = -1;
  } else if (right && !left) {
    p.vx = p.vx >= maxSpeed ? p.vx : Math.min(p.vx + accel, maxSpeed);
    p.facing = 1;
  } else if (p.grounded) {
    if (p.vx > 0) p.vx = Math.max(0, p.vx - P_DECEL);
    else if (p.vx < 0) p.vx = Math.min(0, p.vx + P_DECEL);
  }
  if (p.grounded && !swinging && Math.abs(p.vx) > maxSpeed) {
    p.vx = Math.sign(p.vx) * Math.max(maxSpeed, Math.abs(p.vx) - P_DECEL);
  }

  // jump buffering + coyote
  if (jumpPressed) p.jumpBuffer = JUMP_BUFFER_TICKS;
  else if (p.jumpBuffer > 0) p.jumpBuffer--;
  if (p.grounded) p.coyote = COYOTE_TICKS;
  else if (p.coyote > 0) p.coyote--;

  if (p.jumpBuffer > 0 && p.coyote > 0) {
    p.vy = p.jumpVy * (p.squash > 0 ? PVP_SQUASH_JUMP_MULT : 1);
    p.grounded = false;
    p.coyote = 0;
    p.jumpBuffer = 0;
    emit(sim, { t: "sfx", name: "jump", pitch: 0.95 + sim.rng() * 0.1 });
  }
  // variable jump height (a Fishin' Line launch or head bounce is not a
  // jump: leave those be)
  if (!jump && p.vy < P_JUMP_CUT_VY && !swinging && p.hookKick <= 0 && p.pvpLaunch <= 0) {
    p.vy = P_JUMP_CUT_VY;
  }

  // gravity
  p.vy = Math.min(p.vy + P_GRAVITY, P_MAX_FALL);

  // bubble riding/bouncing: check before tile move (bubbles are soft floors)
  if (p.vy > 0 && !swinging) {
    for (const b of sim.bubbles) {
      if (b.state.kind === "launch") continue;
      if (b.age < 12) continue;
      const dx = Math.abs(p.x - b.x);
      const feetAbove = p.y <= b.y - BUBBLE_R * 0.35;
      const feetNear = p.y + p.vy >= b.y - BUBBLE_R - 2 && p.y <= b.y - BUBBLE_R + 14;
      if (dx < BUBBLE_R + 4 && feetAbove && feetNear) {
        if (jump) {
          p.vy = BUBBLE_BOUNCE_VY;
          b.rides += BUBBLE_RIDE_POPS_AT; // bouncing always bursts it
          emit(sim, { t: "sfx", name: "bounce" });
        } else {
          p.vy = 0;
          p.y = b.y - BUBBLE_R - 1;
          p.grounded = true;
          p.coyote = COYOTE_TICKS;
          // A ridden bubble is a slow elevator, not a trapdoor: it keeps its
          // lift (double in an updraft column) and gives out on a tick budget.
          b.rideTicks += 1;
          b.ridden = 2;
          if (b.rideTicks >= BUBBLE_RIDE_TICKS) popBubble(sim, b, p.index);
        }
        if (b.rides >= BUBBLE_RIDE_POPS_AT) popBubble(sim, b, p.index);
        break;
      }
    }
  }

  // head bounce off yer partner (kill switch: PVP_BOUNCE in constants)
  if (PVP_BOUNCE && p.vy > 0 && !swinging) stepHeadBounce(sim, p);

  // the line goes taut
  applyHookConstraint(p);

  // move through tiles
  const moved = moveBody(sim.level, p.x, p.y, p.vx, p.vy, P_WIDTH, P_HEIGHT);
  p.x = moved.x;
  p.y = moved.y;
  p.vy = moved.vy;
  if (moved.hitWall && swinging) p.vx = 0;
  if (moved.grounded) p.grounded = true;
  else if (!p.grounded || p.vy !== 0) p.grounded = moved.grounded;
  // bonk the sky (never on a wrap: that enters from above, already falling)
  if (p.vy < 0 && p.y < P_CEILING_Y) {
    p.y = P_CEILING_Y;
    p.vy = 0;
  }
  if (moved.onSpikes && p.invuln <= 0 && p.prayer <= 0) hurtPlayer(sim, p);
  if (p.hook || p.hookKick > 0) stepHookBody(sim, p, moved.grounded);

  // blow a bubble (the famous burp)
  if (p.blowCooldown > 0) p.blowCooldown--;
  if (blowPressed && p.blowCooldown === 0) {
    p.blowCooldown = BUBBLE_BLOW_COOLDOWN;
    p.hicPitch = 0.85 + sim.rng() * 0.35;
    sim.bubbles.push({
      id: sim.nextId++,
      owner: p.index,
      x: p.x + p.facing * (P_WIDTH / 2 + BUBBLE_R - 4),
      y: p.y - P_HEIGHT * 0.62,
      vx: p.facing * BUBBLE_LAUNCH_SPEED,
      vy: 0,
      state: { kind: "launch", ticks: p.puffTicks },
      age: 0,
      rides: 0,
      rideTicks: 0,
      ridden: 0,
      wobblePhase: sim.rng() * Math.PI * 2,
    });
    emit(sim, { t: "sfx", name: "hic", pitch: p.hicPitch, pan: (p.x / FIELD_W) * 2 - 1 });
    p.anim = "blow";
    p.animLock = 14;
  }

  // trapped-bubble pops by touch
  for (const b of sim.bubbles) {
    if (b.state.kind !== "trapped") continue;
    if (circleOverlapsBox(b.x, b.y, BUBBLE_R + 2, p.x, p.y, P_WIDTH + 6, P_HEIGHT)) {
      popBubble(sim, b, p.index);
    }
  }

  // secret warp-cellar door (deathless boss levels only)
  if (sim.secretDoorOpen && sim.level.secretDoor) {
    const d = sim.level.secretDoor;
    if (Math.abs(p.x - d.x) < 22 && Math.abs(p.y - d.y) < 30) {
      sim.secretDoorOpen = false;
      sim.secretEntered = true;
      emit(sim, { t: "sfx", name: "gospel" });
      emit(sim, { t: "burst", text: "WARP CELLAR!", x: d.x, y: d.y - 40, big: true });
      // food shower
      for (let i = 0; i < 8; i++) {
        spawnFood(sim, 80 + sim.rng() * (FIELD_W - 160), 120, 3 + Math.floor(sim.rng() * 3), 0);
      }
    }
  }

  // invuln / prayer / bounce timers
  if (p.invuln > 0) p.invuln--;
  if (p.prayer > 0) p.prayer--;
  if (p.pvpLaunch > 0) p.pvpLaunch--;
  if (p.squash > 0) p.squash--;

  // frenzy timer
  if (p.frenzy) {
    p.frenzy.ticksLeft--;
    if (p.frenzy.ticksLeft <= 0) {
      p.frenzy = null;
      emit(sim, { t: "sfx", name: "frenzyEnd" });
    }
  }

  // anim selection
  if (p.animLock > 0) {
    p.animLock--;
  } else if (!p.grounded) {
    p.anim = "jump";
  } else if (Math.abs(p.vx) > 0.4) {
    p.anim = "run";
  } else {
    p.anim = "idle";
  }
}

// The whole PVP head-bounce mechanic is this function + its one PVP_BOUNCE
// call site in stepPlayer; the constants.ts flag removes it wholesale.
// A falling player springboards off their partner's head — a high,
// uncuttable rise for the bouncer, buckled knees for the trampoline.
function stepHeadBounce(sim: Sim, p: PlayerState): void {
  for (const q of sim.players) {
    if (q === p || !q.alive || q.ghost || q.spectating) continue;
    const headY = q.y - P_HEIGHT;
    const dx = Math.abs(p.x - q.x);
    const feetAbove = p.y <= headY + 8;
    const feetNear = p.y + p.vy >= headY - 2 && p.y <= headY + 14;
    if (dx < P_WIDTH && feetAbove && feetNear) {
      p.vy = PVP_BOUNCE_VY;
      p.y = headY - 1;
      p.grounded = false;
      p.pvpLaunch = PVP_BOUNCE_LAUNCH_TICKS;
      q.squash = PVP_SQUASH_TICKS;
      emit(sim, { t: "sfx", name: "bounce", pitch: 0.75 });
      emit(sim, { t: "burst", text: "BOING!", x: p.x, y: headY - 20 });
      return;
    }
  }
}

export function hurtPlayer(sim: Sim, p: PlayerState): void {
  if (p.invuln > 0 || p.prayer > 0 || !p.alive) return;
  if (p.hogFatCharge) {
    p.hogFatCharge = false;
    p.invuln = P_INVULN_TICKS;
    emit(sim, { t: "sfx", name: "hogfat" });
    emit(sim, { t: "burst", text: "LARD SAVE!", x: p.x, y: p.y - P_HEIGHT - 10 });
    return;
  }
  p.alive = false;
  p.frenzy = null;
  p.hook = null;
  p.hookKick = 0;
  emit(sim, { t: "sfx", name: "playerDie" });
  emit(sim, { t: "balloon", player: p.index, trigger: "death" });
  emit(sim, { t: "shake", power: 5 });
  p.anim = "die";

  const partnerUp = sim.players.some((q) => q !== p && (q.alive || q.ghost));
  if (partnerUp) {
    // co-op: drift as a ghost bubble. No life charged yet — a partner pop
    // is a free save; the charge lands only on a party wipe (see step()).
    p.ghost = {
      x: p.x,
      y: Math.max(60, p.y - P_HEIGHT),
      vx: p.x < FIELD_W / 2 ? 0.7 : -0.7,
      vy: -0.5,
      ticks: 0,
    };
    return;
  }
  p.livesLeft--;
  sim.deaths.push(p.index);
  if (p.livesLeft > 0) {
    p.respawnIn = P_RESPAWN_TICKS;
  }
  // else: out of lives with nobody up -> run layer sees allDead status below
}

// ---------------------------------------------------------------- bubbles

function stepBubble(sim: Sim, b: Bubble): boolean {
  b.age++;
  if (b.state.kind === "launch") {
    b.state.ticks--;
    b.x += b.vx;
    // walls end the launch phase early
    const wallAhead =
      tileAt(sim.level, b.x + Math.sign(b.vx) * (BUBBLE_R - 2), b.y) !== 0;
    if (wallAhead || b.state.ticks <= 0) {
      b.state = { kind: "float" };
      b.vx = 0;
      b.vy = BUBBLE_RISE * 0.4;
    }
    // trap check
    for (const e of sim.enemies) {
      if (e.phase.kind !== "normal") continue;
      const fromBehind =
        (b.vx > 0 && e.facing === 1) || (b.vx < 0 && e.facing === -1);
      if (e.shielded && !fromBehind) continue;
      if (circleOverlapsBox(b.x, b.y, BUBBLE_R, e.x, e.y, 26, 26)) {
        e.phase = { kind: "trapped", bubbleId: b.id };
        e.vx = 0;
        e.vy = 0;
        e.flung = 0;
        b.state = {
          kind: "trapped",
          enemyId: e.id,
          enemyKind: e.kind,
          ticks: BUBBLE_TRAP_TICKS,
          angryOnEscape: true,
        };
        b.vx = 0;
        b.vy = BUBBLE_RISE * 0.5;
        emit(sim, { t: "sfx", name: "trap" });
        if (sim.tick - sim.chains[b.owner].lastTick > CHAIN_WINDOW_TICKS * 4) {
          emit(sim, { t: "balloon", player: b.owner, trigger: "trap" });
        }
        break;
      }
    }
  } else {
    // float / trapped: wind field + gentle wobble
    const w = windAt(sim.level, b.x, b.y);
    let tx = 0;
    let ty = BUBBLE_RISE;
    if (w === W_UP) ty = BUBBLE_RISE * 2.6;
    else if (w === W_LEFT) {
      tx = -1.0;
      ty = BUBBLE_RISE * 0.4;
    } else if (w === W_RIGHT) {
      tx = 1.0;
      ty = BUBBLE_RISE * 0.4;
    } else if (b.y < TILE * 2.2) {
      // ceiling: drift toward top center and mill around
      tx = b.x < FIELD_W / 2 ? 0.35 : -0.35;
      ty = 0;
    }
    if (b.ridden > 0) {
      b.ridden--;
      ty *= 0.55; // a rider is heavy, but a bubble under one still climbs
    }
    b.vx += (tx - b.vx) * 0.04;
    b.vy += (ty - b.vy) * 0.05;
    b.x += b.vx + Math.sin((b.age + b.wobblePhase * 60) / 30) * 0.18;
    b.y += b.vy;

    // soft-collide with solids: nudge out
    if (tileAt(sim.level, b.x - BUBBLE_R, b.y) !== 0) b.x += 1.2;
    if (tileAt(sim.level, b.x + BUBBLE_R, b.y) !== 0) b.x -= 1.2;
    if (tileAt(sim.level, b.x, b.y - BUBBLE_R) !== 0) b.y += 1.2;
    if (b.y < BUBBLE_R + 2) b.y = BUBBLE_R + 2;

    // spikes pop bubbles
    if (
      tileAt(sim.level, b.x, b.y + BUBBLE_R - 2) === T_SPIKES ||
      tileAt(sim.level, b.x, b.y - BUBBLE_R + 2) === T_SPIKES
    ) {
      popBubble(sim, b, b.owner, true);
      return false;
    }

    if (b.state.kind === "trapped") {
      b.state.ticks--;
      if (b.state.ticks <= 0) {
        // escape! enemy comes back angry
        const e = sim.enemies.find(
          (en) => b.state.kind === "trapped" && en.id === b.state.enemyId,
        );
        if (e && e.phase.kind === "trapped") {
          e.phase = { kind: "normal" };
          e.angry = true;
          e.x = b.x;
          e.y = b.y + 10;
          e.vy = 0;
          emit(sim, { t: "sfx", name: "escape" });
          emit(sim, { t: "burst", text: "RILED UP!", x: b.x, y: b.y - 24 });
        }
        return false;
      }
      // keep enemy centered in bubble
      const e = sim.enemies.find(
        (en) => b.state.kind === "trapped" && en.id === b.state.enemyId,
      );
      if (e) {
        e.x = b.x;
        e.y = b.y + 9;
      }
    }
  }

  if (b.age > BUBBLE_TTL_TICKS) {
    popBubble(sim, b, b.owner, true);
    return false;
  }
  return b.rides < BUBBLE_RIDE_POPS_AT && !(b.state.kind === "trapped" && b.state.ticks <= 0);
}

export function popBubble(
  sim: Sim,
  b: Bubble,
  by: 0 | 1,
  silent = false,
): void {
  // remove from list lazily: mark via rides
  b.rides = BUBBLE_RIDE_POPS_AT + 99;
  if (b.state.kind === "trapped") {
    const e = sim.enemies.find(
      (en) => b.state.kind === "trapped" && en.id === b.state.enemyId,
    );
    if (e && e.phase.kind === "trapped") {
      // chain accounting
      const chain = sim.chains[by];
      if (sim.tick - chain.lastTick <= CHAIN_WINDOW_TICKS) chain.count++;
      else chain.count = 1;
      chain.lastTick = sim.tick;
      const n = chain.count;
      const points = SCORE_POP_BASE * Math.pow(2, Math.min(n - 1, 6));
      score(sim, by, points);
      const boss = sim.boss && !sim.boss.dead ? sim.boss : null;
      e.phase = {
        kind: "dying",
        ticks: 0,
        targetX: boss ? boss.x : 60 + sim.rng() * (FIELD_W - 120),
        targetY: boss ? boss.y : FIELD_H - TILE * 1.5,
        chain: n,
        toBoss: !!boss,
      };
      emit(sim, { t: "sfx", name: "pop", pitch: 1 + Math.min(n - 1, 7) * 0.12 });
      if (n === 3) emit(sim, { t: "burst", text: "KABLOOIE!", x: b.x, y: b.y - 26 });
      else if (n === 4) emit(sim, { t: "burst", text: "HOG WILD!", x: b.x, y: b.y - 26 });
      else if (n >= 5)
        emit(sim, { t: "burst", text: "YEE-HAW!", x: b.x, y: b.y - 26, big: true });
      if (n >= 3) emit(sim, { t: "balloon", player: by, trigger: "chain" });
    }
  } else if (!silent) {
    emit(sim, { t: "sfx", name: "popEmpty", pitch: 0.9 + sim.rng() * 0.25 });
  }
}

// ---------------------------------------------------------------- jars

function stepJars(sim: Sim): void {
  if (sim.tick < sim.nextJarTick) return;
  // guaranteed cadence, biased toward authored jar points
  sim.nextJarTick =
    sim.tick + Math.floor(JAR_INTERVAL_TICKS * (0.75 + sim.rng() * 0.5) * (sim.isBoss ? 0.45 : 1));
  for (const p of sim.players) {
    if (!p.alive || p.loadout.weapons.length === 0) continue;
    const luckBonus = 1 + p.luck * 0.04;
    if (sim.rng() > 0.85 * luckBonus && !sim.isBoss) continue;
    const wIdx = rangeInt(sim.rng, 0, p.loadout.weapons.length - 1);
    const point =
      sim.level.jarPoints.length > 0
        ? pick(sim.rng, sim.level.jarPoints)
        : { x: 80 + sim.rng() * (FIELD_W - 160), y: 0 };
    sim.items.push({
      id: sim.nextId++,
      kind: "jar",
      x: point.x,
      y: Math.max(40, point.y - TILE),
      vx: 0,
      vy: 0.4,
      grounded: false,
      ttl: 14 * TICK_HZ,
      data: wIdx,
      forPlayer: p.index,
      value: 0,
      arcTicks: 0,
      fromX: 0,
      fromY: 0,
      targetX: 0,
      targetY: 0,
    });
    emit(sim, { t: "sfx", name: "jarSpawn" });
  }
}

export function startFrenzy(sim: Sim, p: PlayerState, weaponIdx: number): void {
  const slot = p.loadout.weapons[weaponIdx] ?? p.loadout.weapons[0];
  if (!slot) return;
  const cast = castById(p.castId);
  const bonus =
    (cast.frenzyBonus ?? 0) * TICK_HZ +
    (p.loadout.tonics.includes("pickinfinger") ? 5 * TICK_HZ : 0);
  p.frenzy = {
    weapon: slot.id,
    level: slot.level,
    ticksLeft: FRENZY_TICKS + bonus,
  };
  emit(sim, { t: "sfx", name: "jarGrab" });
  emit(sim, { t: "sfx", name: "frenzyStart" });
  emit(sim, {
    t: "burst",
    text: "GIT SOME!",
    x: p.x,
    y: p.y - P_HEIGHT - 14,
    big: true,
  });
  emit(sim, { t: "balloon", player: p.index, trigger: "frenzy" });
}

// ---------------------------------------------------------------- revenuer

function stepRevenuer(sim: Sim): void {
  const r = sim.revenuer;
  if (!r.active) {
    if (sim.tick === HURRY_UP_TICKS && sim.status === "play" && !sim.isBoss) {
      r.active = true;
      r.x = -40;
      r.y = 80;
      emit(sim, { t: "burst", text: "HURRY UP!", x: FIELD_W / 2, y: 120, big: true });
      emit(sim, { t: "sfx", name: "hurryUp" });
    }
    return;
  }
  // home on nearest living player, through walls, relentless
  let target: PlayerState | null = null;
  let best = Infinity;
  for (const p of sim.players) {
    if (!p.alive) continue;
    const d = Math.abs(p.x - r.x) + Math.abs(p.y - r.y);
    if (d < best) {
      best = d;
      target = p;
    }
  }
  if (!target) return;
  const speed = 1.45 + Math.min(0.9, (sim.tick - HURRY_UP_TICKS) / (30 * TICK_HZ));
  const dx = target.x - r.x;
  const dy = target.y - P_HEIGHT / 2 - r.y;
  const len = Math.hypot(dx, dy) || 1;
  r.vx = (dx / len) * speed;
  r.vy = (dy / len) * speed;
  r.x += r.vx;
  r.y += r.vy;
  if (
    target.invuln <= 0 &&
    target.prayer <= 0 &&
    circleOverlapsBox(r.x, r.y, 16, target.x, target.y, P_WIDTH, P_HEIGHT)
  ) {
    hurtPlayer(sim, target);
  }
}

// ---------------------------------------------------------------- step

export function step(sim: Sim, inputs: SimInputs, prevInputs: SimInputs): void {
  sim.tick++;
  sim.fx.length = 0;
  sim.scored.length = 0;
  sim.lettersFound.length = 0;
  sim.livesFound.length = 0;
  sim.deaths.length = 0;

  if (sim.status === "intro") {
    sim.statusTicks--;
    if (sim.statusTicks <= 0) {
      sim.status = "play";
      // Jar o' Lightnin': the level opens with the jar already in hand
      for (const p of sim.players) {
        if (!p.headStart || !p.alive || p.loadout.weapons.length === 0) continue;
        p.headStart = false;
        startFrenzy(sim, p, rangeInt(sim.rng, 0, p.loadout.weapons.length - 1));
      }
    }
    return;
  }
  if (sim.status === "cleared" || sim.status === "bossDead") {
    sim.statusTicks--;
    for (const p of sim.players) {
      if (p.alive) p.anim = sim.statusTicks % 120 < 60 ? "victory" : "goof";
    }
    return;
  }
  if (sim.status === "allDead") return;

  for (const p of sim.players) {
    stepPlayer(sim, p, inputs[p.index], prevInputs[p.index]);
  }

  sim.bubbles = sim.bubbles.filter((b) => stepBubble(sim, b));
  stepEnemies(sim);
  stepWeapons(sim);
  stepItems(sim);
  stepJars(sim);
  stepShrine(sim);

  // specials cadence (never on boss levels' final phase; still fun mid-boss)
  if (sim.tick >= sim.nextSpecialTick && sim.specials.length < 2) {
    sim.nextSpecialTick =
      sim.tick + Math.floor(SPECIAL_INTERVAL_TICKS * (0.8 + sim.rng() * 0.6));
    spawnSpecial(sim);
  }
  stepSpecialsAndZones(sim);
  if (sim.boss) stepBoss(sim);
  stepRevenuer(sim);

  // Party wipe: nobody left standing to pop a ghost, so every ghost pays the
  // life a partner save would have spared and regenerates right where it
  // drifted. (A lone ghost stays free — see hurtPlayer.)
  if (!sim.players.some((p) => p.alive) && sim.players.some((p) => p.ghost)) {
    for (const p of sim.players) {
      if (!p.ghost) continue;
      const g = p.ghost;
      p.ghost = null;
      p.livesLeft--;
      sim.deaths.push(p.index);
      if (p.livesLeft > 0) {
        p.alive = true;
        p.x = Math.min(Math.max(g.x, 30), FIELD_W - 30);
        p.y = Math.min(Math.max(g.y, 60), FIELD_H - 40);
        p.vx = 0;
        p.vy = 0;
        p.invuln = P_INVULN_TICKS;
        p.anim = "idle";
      } else {
        p.spectating = true;
      }
    }
    if (sim.players.some((p) => p.alive)) {
      emit(sim, { t: "sfx", name: "revive" });
      emit(sim, { t: "burst", text: "BORN AGAIN!", x: FIELD_W / 2, y: 160, big: true });
      emit(sim, { t: "shake", power: 4 });
    }
  }

  const anyAlive = sim.players.some((p) => p.alive || p.ghost || p.respawnIn > 0);
  if (!anyAlive) {
    sim.status = "allDead";
    return;
  }
  if (sim.isBoss) {
    if (sim.boss && sim.boss.dead && sim.boss.deathTicks > 90) {
      sim.status = "bossDead";
      sim.statusTicks = LEVEL_CLEAR_TICKS * 2;
      emit(sim, { t: "sfx", name: "bossDown" });
    }
  } else {
    const enemiesLeft = sim.enemies.some(
      (e) => e.phase.kind === "normal" || e.phase.kind === "trapped",
    );
    if (!enemiesLeft && sim.status === "play" && shrineHoldsLevel(sim)) {
      // varmints gone, prize unclaimed: hold the level open and point at it
      nagShrine(sim);
    } else if (!enemiesLeft && sim.status === "play") {
      sim.status = "cleared";
      sim.statusTicks = LEVEL_CLEAR_TICKS;
      sim.revenuer.active = false;
      // leftover empty bubbles become bonus food
      for (const b of sim.bubbles) {
        if (b.state.kind !== "trapped") {
          spawnFood(sim, b.x, b.y, 0, 0);
        }
      }
      sim.bubbles = [];
      emit(sim, { t: "sfx", name: "levelClear" });
    }
  }
}
