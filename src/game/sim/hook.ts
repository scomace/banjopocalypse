// Buford's Fishin' Line: the cast's one grapple. Press HOOK to cast a line
// up-and-forward; it bites the first platform/wall it reaches and goes taut.
// Hold to swing (the reel shortens the line as you go), release to let fly
// with your momentum, or tap JUMP for a bonus hop off the line. A hook that
// meets a varmint on the way out yanks it off its feet and sends it tumbling,
// and a fast swing's boots do the same. Flung varmints are harmless while
// airborne, bowl over kin they land on, and can still be bubbled mid-tumble.
//
// Pure sim: no Phaser, no DOM. Rendering reads PlayerState.hook.

import { CMD_HOOK, CMD_JUMP } from "../core/input";
import {
  E_GRAVITY,
  E_MAX_FALL,
  FIELD_H,
  FIELD_W,
  FLING_TICKS,
  FLING_VX,
  FLING_VY,
  HOOK_COOLDOWN,
  HOOK_KICK_SPEED,
  HOOK_MIN_LEN,
  HOOK_POWER,
  HOOK_RANGE,
  HOOK_HOP_VY,
  HOOK_REEL,
  HOOK_RETRACT_SPEED,
  HOOK_SPEED,
  HOOK_SWING_MAX,
  HOOK_YANK,
  P_HEIGHT,
  P_WIDTH,
} from "./constants";
import { circleOverlapsBox, moveBody, tileAt } from "./physics";
import type { Enemy, PlayerState, Sim } from "./types";
import { emit } from "./sim";
import { killEnemyByWeapon } from "./enemies";

/** Where the line leaves the player: chest height, body center (stable under facing flips). */
export const handX = (p: PlayerState): number => p.x;
export const handY = (p: PlayerState): number => p.y - P_HEIGHT * 0.62;

/** Ticks after letting go during which a fast body still kicks varmints and
 *  the jump-cut does not clip the launch. */
const LAUNCH_GRACE = 18;

/** Cast angles tried (degrees above the forward horizontal). Every angle is
 *  probed and the best bite wins: the most height gained, biased toward the
 *  50-degree sweet spot where a line actually swings. Under a low porch every
 *  angle bites the same plank, so the bias picks the steep pull-up onto it. */
const CAST_ANGLES_DEG = [50, 38, 64, 26, 76];

function findAnchor(
  sim: Sim,
  hx: number,
  hy: number,
  facing: number,
): { x: number; y: number; dist: number } | null {
  let best: { x: number; y: number; dist: number } | null = null;
  let bestScore = -1;
  for (const deg of CAST_ANGLES_DEG) {
    const a = (deg * Math.PI) / 180;
    const dx = Math.cos(a) * facing;
    const dy = -Math.sin(a);
    for (let d = 14; d <= HOOK_RANGE; d += 6) {
      const x = hx + dx * d;
      const y = hy + dy * d;
      if (y < 2) break; // open sky above the attic: nothing to bite
      if (tileAt(sim.level, x, y) !== 0) {
        const gain = hy - y;
        const score = (gain + d * 0.15) * (1 - Math.abs(deg - 50) / 45);
        if (score > bestScore) {
          bestScore = score;
          best = { x: Math.max(2, Math.min(FIELD_W - 2, x)), y, dist: d };
        }
        break;
      }
    }
  }
  return best;
}

function castLine(sim: Sim, p: PlayerState): void {
  const hx = handX(p);
  const hy = handY(p);
  const target = findAnchor(sim, hx, hy, p.facing);
  let dx: number;
  let dy: number;
  if (target) {
    dx = (target.x - hx) / target.dist;
    dy = (target.y - hy) / target.dist;
  } else {
    const a = (CAST_ANGLES_DEG[0] * Math.PI) / 180;
    dx = Math.cos(a) * p.facing;
    dy = -Math.sin(a);
  }
  p.hook = {
    kind: "fly",
    x: hx,
    y: hy,
    vx: dx * HOOK_SPEED,
    vy: dy * HOOK_SPEED,
    tx: target ? target.x : null,
    ty: target ? target.y : null,
    dist: 0,
  };
  emit(sim, { t: "sfx", name: "castLine", pitch: 0.95 + sim.rng() * 0.1 });
}

function letGo(sim: Sim, p: PlayerState, hop: boolean): void {
  const h = p.hook;
  if (!h || h.kind !== "hold") return;
  p.hook = { kind: "retract", x: h.ax, y: h.ay };
  p.hookCooldown = HOOK_COOLDOWN;
  p.hookKick = LAUNCH_GRACE;
  if (hop) {
    // A dismount SETS a launch, it does not stack on whatever the swing had
    // already built up — otherwise a taut line off a ceiling-high bubble
    // throws you clean out of the playfield.
    p.vy = Math.max(HOOK_HOP_VY, Math.min(p.vy, 0) - 6.2);
    emit(sim, { t: "sfx", name: "jump", pitch: 1.1 });
  } else {
    emit(sim, { t: "sfx", name: "lineSlack" });
  }
}

/**
 * Send a varmint flying. Chips HOOK_POWER first; a varmint that dies from the
 * chip arcs to food as usual, otherwise it tumbles for FLING_TICKS.
 */
export function flingEnemy(
  sim: Sim,
  e: Enemy,
  by: 0 | 1,
  dir: number,
  scale: number,
  power = HOOK_POWER,
): void {
  if (e.phase.kind !== "normal") return;
  e.hp -= power;
  e.hitFlash = 8;
  if (e.hp <= 0) {
    killEnemyByWeapon(sim, e, by, 0);
    return;
  }
  e.flung = FLING_TICKS;
  e.flungBy = by;
  e.vx = (dir || 1) * FLING_VX * scale;
  e.vy = FLING_VY * scale;
  e.grounded = false;
  e.mode = 0; // chargers quit dashing
  emit(sim, { t: "sfx", name: "fling", pitch: 0.9 + sim.rng() * 0.25 });
}

/** The cast / fly / retract / swing-control half. Runs at the top of stepPlayer. */
export function stepHookControl(sim: Sim, p: PlayerState, cmd: number, prevCmd: number): void {
  if (p.hookCooldown > 0) p.hookCooldown--;
  if (p.hookKick > 0) p.hookKick--;

  const held = (cmd & CMD_HOOK) !== 0;
  const pressed = held && !(prevCmd & CMD_HOOK);
  const jumpPressed = (cmd & CMD_JUMP) !== 0 && !(prevCmd & CMD_JUMP);

  const h = p.hook;
  if (!h) {
    if (pressed && p.hookCooldown === 0) castLine(sim, p);
    return;
  }

  if (h.kind === "fly") {
    // bite a varmint on the way out?
    for (const e of sim.enemies) {
      if (e.phase.kind !== "normal" || e.flung > 0) continue;
      if (circleOverlapsBox(h.x, h.y, 12, e.x, e.y, 26, 28)) {
        flingEnemy(sim, e, p.index, Math.sign(h.vx) || p.facing, 1);
        p.hook = { kind: "retract", x: h.x, y: h.y };
        p.hookCooldown = HOOK_COOLDOWN;
        emit(sim, { t: "sfx", name: "hookBite" });
        emit(sim, { t: "burst", text: "YOINK!", x: e.x, y: e.y - 30 });
        if (sim.tick - (p.weaponCooldowns.hookBark ?? -9999) > 240) {
          p.weaponCooldowns.hookBark = sim.tick;
          emit(sim, { t: "balloon", player: p.index, trigger: "hook" });
        }
        return;
      }
    }
    // the boss takes a jab but can't be reeled
    const boss = sim.boss;
    if (boss && !boss.dead && boss.invuln <= 0 && circleOverlapsBox(h.x, h.y, 12, boss.x, boss.y, 90, 90)) {
      boss.hp -= 4;
      boss.hitFlash = 8;
      p.hook = { kind: "retract", x: h.x, y: h.y };
      p.hookCooldown = HOOK_COOLDOWN;
      emit(sim, { t: "sfx", name: "bossHit" });
      emit(sim, { t: "burst", text: "POKE!", x: boss.x, y: boss.y - 60 });
      return;
    }
    if (h.tx !== null && h.ty !== null) {
      const rem = Math.hypot(h.tx - h.x, h.ty - h.y);
      if (rem <= HOOK_SPEED) {
        // bite: line goes taut
        const hx = handX(p);
        const hy = handY(p);
        const len = Math.max(HOOK_MIN_LEN, Math.hypot(h.tx - hx, h.ty - hy));
        p.hook = { kind: "hold", ax: h.tx, ay: h.ty, len, ticks: 0 };
        const ux = (h.tx - hx) / (len || 1);
        const uy = (h.ty - hy) / (len || 1);
        p.vx += ux * HOOK_YANK;
        p.vy += uy * HOOK_YANK;
        if (p.grounded) p.vy = Math.min(p.vy, -3.5); // boots leave the dirt
        p.grounded = false;
        p.coyote = 0;
        emit(sim, { t: "sfx", name: "lineTaut" });
        if (!held) letGo(sim, p, false); // tapped: just the yank
        return;
      }
    }
    h.x += h.vx;
    h.y += h.vy;
    h.dist += HOOK_SPEED;
    if (h.dist >= HOOK_RANGE || h.y < -8) {
      p.hook = { kind: "retract", x: h.x, y: h.y };
      p.hookCooldown = HOOK_COOLDOWN;
    }
    return;
  }

  if (h.kind === "retract") {
    const hx = handX(p);
    const hy = handY(p);
    const dx = hx - h.x;
    const dy = hy - h.y;
    const d = Math.hypot(dx, dy);
    if (d <= HOOK_RETRACT_SPEED) {
      p.hook = null;
    } else {
      h.x += (dx / d) * HOOK_RETRACT_SPEED;
      h.y += (dy / d) * HOOK_RETRACT_SPEED;
    }
    return;
  }

  // hold: swinging
  h.ticks++;
  if (!held) {
    letGo(sim, p, false);
    return;
  }
  if (jumpPressed) {
    letGo(sim, p, true);
    return;
  }
  h.len = Math.max(HOOK_MIN_LEN, h.len - HOOK_REEL);
  // Reeled all the way in and hanging still: hoist yourself up over the
  // snag (through a plank, onto the porch) instead of dangling forever.
  if (h.len <= HOOK_MIN_LEN && h.ticks > 10) {
    const d = Math.hypot(h.ax - handX(p), h.ay - handY(p));
    const sp = Math.hypot(p.vx, p.vy);
    if (d <= HOOK_MIN_LEN + 6 && sp < 2.2) {
      p.hook = { kind: "retract", x: h.ax, y: h.ay };
      p.hookCooldown = HOOK_COOLDOWN;
      p.hookKick = LAUNCH_GRACE;
      p.vy = -9;
      emit(sim, { t: "sfx", name: "lineSlack" });
      emit(sim, { t: "sfx", name: "jump", pitch: 0.9 });
    }
  }
}

/**
 * The pendulum constraint. Runs after gravity/input have set (vx, vy) and
 * before moveBody: the predicted hand position is projected back onto the
 * circle of radius `len` around the anchor and the velocity re-derived, so the
 * tangential momentum survives and the radial part is eaten by the line.
 */
export function applyHookConstraint(p: PlayerState): void {
  const h = p.hook;
  if (!h || h.kind !== "hold") return;
  const hx = handX(p);
  const hy = handY(p);
  let nx = hx + p.vx;
  let ny = hy + p.vy;
  const dx = nx - h.ax;
  const dy = ny - h.ay;
  const d = Math.hypot(dx, dy);
  if (d > h.len && d > 0) {
    const s = h.len / d;
    nx = h.ax + dx * s;
    ny = h.ay + dy * s;
    p.vx = nx - hx;
    p.vy = ny - hy;
  }
  const sp = Math.hypot(p.vx, p.vy);
  if (sp > HOOK_SWING_MAX) {
    p.vx *= HOOK_SWING_MAX / sp;
    p.vy *= HOOK_SWING_MAX / sp;
  }
}

/** After moveBody: landing on something ends the swing unless the line is
 *  still hauling you upward; a moving body on the line boots varmints. */
export function stepHookBody(sim: Sim, p: PlayerState, landed: boolean): void {
  const h = p.hook;
  if (h && h.kind === "hold" && landed && h.ticks > 6) {
    const d = Math.hypot(h.ax - handX(p), h.ay - handY(p));
    const slack = d < h.len - 1.5;
    const anchorBelow = h.ay > p.y - 24;
    if (slack || anchorBelow) letGo(sim, p, false);
  }

  const swinging = !!p.hook && p.hook.kind === "hold";
  if (!swinging && p.hookKick <= 0) return;
  const sp = Math.hypot(p.vx, p.vy);
  if (sp < HOOK_KICK_SPEED) return;
  for (const e of sim.enemies) {
    if (e.phase.kind !== "normal" || e.flung > 0) continue;
    if (circleOverlapsBox(e.x, e.y - 12, 15, p.x, p.y, P_WIDTH + 8, P_HEIGHT)) {
      flingEnemy(sim, e, p.index, Math.sign(p.vx) || p.facing, 0.95);
      emit(sim, { t: "burst", text: "SEE YA!", x: e.x, y: e.y - 30 });
    }
  }
}

/** Tumbling varmint physics. Called from the enemy stepper while e.flung > 0. */
export function stepFlungEnemy(sim: Sim, e: Enemy): void {
  e.flung--;
  const fallVy = Math.min(e.vy + E_GRAVITY * 1.1, E_MAX_FALL + 2);
  e.vy = fallVy;
  const moved = moveBody(sim.level, e.x, e.y, e.vx, e.vy, 24, 26);
  e.x = moved.x;
  e.y = moved.y;
  if (moved.hitWall) {
    e.vx = -e.vx * 0.55;
    e.hp -= 1;
    e.hitFlash = 6;
    emit(sim, { t: "sfx", name: "wallSlam" });
    if (e.hp <= 0) {
      killEnemyByWeapon(sim, e, e.flungBy, 0);
      return;
    }
  }
  if (moved.grounded) {
    if (fallVy > 3.2 && e.flung > 8) {
      e.vy = -fallVy * 0.42;
      e.vx *= 0.7;
      e.grounded = false;
      emit(sim, { t: "sfx", name: "thwack", pitch: 0.7 });
    } else {
      e.flung = 0;
      e.vy = 0;
      e.grounded = true;
    }
  } else {
    e.vy = moved.vy;
    e.grounded = false;
  }
  if (e.y < -40) e.y = -40;

  // bowl over kin
  for (const o of sim.enemies) {
    if (o === e || o.phase.kind !== "normal" || o.flung > 0) continue;
    if (Math.abs(o.x - e.x) < 26 && Math.abs(o.y - e.y) < 28) {
      flingEnemy(sim, o, e.flungBy, Math.sign(e.vx) || 1, 0.8, 1);
      e.vx *= 0.8;
    }
  }

  if (e.flung === 0) {
    e.facing = (e.vx < 0 ? -1 : 1) as -1 | 1;
    e.vx = 0;
    if (e.flying) {
      e.vy = 0;
      e.homeY = Math.max(30, Math.min(FIELD_H - 48, e.y));
    }
  }
}
