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
// Bubble Bobble's whole ladder is "one platform = one jump". Levels are laid
// out on a 3-tile tier grid (96px), so the weakest jumper in the cast must
// clear 96px with room to spare: -10.0 @ 0.40g rises ~118px (3.7 tiles) for
// jump-2 characters, ~133px for Buford. Anything 4 tiles up needs a bubble.
// Verify with: npx tsx scripts/level-audit.mts
export const P_JUMP_VY = -10.0;
export const P_GRAVITY = 0.4;
export const P_MAX_FALL = 8.5;
/** Releasing jump cuts the rise to this — a tap is a ~1 tile hop. */
export const P_JUMP_CUT_VY = -5.2;
/**
 * Feet may rise one tile above the field, then you bonk the sky. Mirrors the
 * FIELD_H + 8 slack the bottom wrap allows. Without it a hook dismount can
 * throw a player hundreds of px above the screen, blind and uncontrollable.
 */
export const P_CEILING_Y = -TILE;
export const COYOTE_TICKS = 4;
export const JUMP_BUFFER_TICKS = 6;
export const P_INVULN_TICKS = 120; // post-respawn mercy
export const P_RESPAWN_TICKS = 120;

// --- Fishin' Line (Buford's grapple) ---
export const HOOK_SPEED = 18; // px/tick the hook sails out
export const HOOK_RANGE = 11 * TILE; // cast reach
export const HOOK_RETRACT_SPEED = 26;
export const HOOK_MIN_LEN = 30; // reel-in stops here
export const HOOK_REEL = 2.3; // px/tick of line reeled while held
export const HOOK_YANK = 3.2; // impulse toward the anchor on bite
export const HOOK_SWING_MAX = 10.5; // speed cap while on the line
export const HOOK_HOP_VY = -12.0; // hardest a line dismount can throw you
export const HOOK_COOLDOWN = 8; // ticks before the next cast
export const HOOK_POWER = 2; // chip damage on a hooked varmint
export const HOOK_KICK_SPEED = 2.2; // moving at least this fast on the line, your boots fling enemies
export const FLING_VX = 7.5;
export const FLING_VY = -6.5;
export const FLING_TICKS = 70;

// --- player-vs-player head bounce ---
/** Kill switch: jump off yer partner's head. Flip to false to remove the
 *  whole mechanic — every other PVP_BOUNCE_* constant is inert without it. */
export const PVP_BOUNCE = true;
export const PVP_BOUNCE_VY = -14.0; // springboard off a head: ~7.6 tiles
export const PVP_BOUNCE_LAUNCH_TICKS = 20; // rise immune to the jump-release cut
export const PVP_SQUASH_TICKS = 30; // the landed-on player's knees buckle
export const PVP_SQUASH_JUMP_MULT = 0.45; // squashed jump strength

// --- player-vs-player grapple fling ---
/** Kill switch: the Fishin' Line snags yer partner too — a friendly, no-
 *  damage yank toward the caster. Flip to false to remove wholesale. */
export const PVP_FLING = true;
export const PVP_FLING_VX = 6.0; // launched toward the caster
export const PVP_FLING_VY = -7.5;
export const PVP_FLING_LAUNCH_TICKS = 22; // rise immune to the jump-release cut

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
/** Ticks you can stand on a bubble before it gives out (~1.7s of elevator). */
export const BUBBLE_RIDE_TICKS = 100;
export const BUBBLE_BOUNCE_VY = -12.0; // ~5.4 tiles: the two-tier bubble launch
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
/** Weapon level cap (mirrored by the run layer's MAX_WEAPON_LEVEL). */
export const WEAPON_LEVEL_CAP = 5;
export const JAR_INTERVAL_TICKS = 40 * TICK_HZ;
export const SPECIAL_INTERVAL_TICKS = 12 * TICK_HZ;
export const SPECIAL_FIRST_TICKS = 4 * TICK_HZ; // first special drifts in early
export const GHOST_REVIVE_TICKS = 14 * TICK_HZ; // ghost bubble lifetime before re-drift

// --- scoring ---
export const SCORE_POP_BASE = 1000; // chain n: base * 2^(n-1)
export const SCORE_WEAPON_KILL = 300;
export const YEEHAW_BONUS = 10000;
export const EXTRA_LIFE_EVERY = 100000;

export const YEEHAW = ["Y", "E", "E", "H", "A", "W"] as const;
