// Simulation constants. The sim is tuned in these units:
//   - positions/velocities in playfield px (per tick where noted)
//   - the playfield is a 30×17 grid of 32px tiles = 960×544
//   - 60 simulation ticks per second, fixed

export const TILE = 32;
export const GRID_W = 30;
export const GRID_H = 17;
export const FIELD_W = GRID_W * TILE; // 960
export const FIELD_H = GRID_H * TILE; // 544
export const TICK_HZ = 60;
export const TICK_MS = 1000 / TICK_HZ;

// --- player movement (px/tick, px/tick²) ---
export const P_WIDTH = 20;
export const P_HEIGHT = 40;
export const P_ACCEL = 0.55;
export const P_DECEL = 0.65;
export const P_MAX_SPEED = 2.6; // ~4.9 tiles/s at 60hz
export const P_AIR_CONTROL = 0.42;
export const P_JUMP_VY = -7.4; // clears 3.5 tiles
export const P_GRAVITY = 0.34;
export const P_MAX_FALL = 7.0;
export const COYOTE_TICKS = 4;
export const JUMP_BUFFER_TICKS = 6;
export const P_INVULN_TICKS = 120; // post-respawn mercy
export const P_RESPAWN_TICKS = 120;

// --- bubbles ---
export const BUBBLE_R = 15;
export const BUBBLE_LAUNCH_SPEED = 5.2;
export const BUBBLE_LAUNCH_TICKS = 22; // ~3.5 tiles of travel at base puff
export const BUBBLE_PUFF_TICKS_PER_PIP = 5; // stat scaling
export const BUBBLE_RISE = -0.55; // float phase target vy
export const BUBBLE_TTL_TICKS = 12 * TICK_HZ;
export const BUBBLE_TRAP_TICKS = 6 * TICK_HZ;
export const BUBBLE_BLOW_COOLDOWN = 16;
export const BUBBLE_RIDE_POPS_AT = 2;
export const BUBBLE_BOUNCE_VY = -8.6;
export const CHAIN_WINDOW_TICKS = 30; // 0.5s

// --- enemies ---
export const E_GRAVITY = 0.3;
export const E_MAX_FALL = 6.0;
export const ANGRY_SPEED_MULT = 1.4;
export const TRAP_ARC_TICKS = 26; // popped enemy's food arc

// --- flow ---
export const HURRY_UP_TICKS = 45 * TICK_HZ;
export const LEVEL_INTRO_TICKS = 90;
export const LEVEL_CLEAR_TICKS = 180;
export const FRENZY_TICKS = 20 * TICK_HZ;
export const JAR_INTERVAL_TICKS = 40 * TICK_HZ;
export const SPECIAL_INTERVAL_TICKS = 30 * TICK_HZ;
export const GHOST_REVIVE_TICKS = 14 * TICK_HZ; // ghost bubble lifetime before re-drift

// --- scoring ---
export const SCORE_POP_BASE = 1000; // chain n: base * 2^(n-1)
export const SCORE_WEAPON_KILL = 300;
export const YEEHAW_BONUS = 10000;
export const EXTRA_LIFE_EVERY = 100000;

export const YEEHAW = ["Y", "E", "E", "H", "A", "W"] as const;
