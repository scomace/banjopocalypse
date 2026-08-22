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
// ---- air specials (the second JUMP press midair; see cast.airSpecial) ----
/**
 * The default air special: a double jump at this fraction of the character's
 * jump impulse. Under 1 so the level-audit jump envelope stays authored
 * around the GROUND jump; the double is a rescue and a style move, not a
 * taller ladder. The same reasoning caps every burst below: none of them may
 * out-climb a ground jump.
 */
export const P_AIR_JUMP_MULT = 0.88;
/** Merle's flutter: legally distinct — it keeps his speed and kicks it up.
 *  Less rise than the honest double, more distance. */
export const FLUTTER_VY_MULT = 0.8;
export const FLUTTER_VX_MULT = 1.45; // boost on current speed...
export const FLUTTER_VX_CAP = 1.6; // ...capped at this x maxSpeed
export const FLUTTER_ANIM_TICKS = 24; // leg-scramble visual
/** Granny Mae's bean-powered scoot: sideways blast, token lift, and a
 *  little green cloud that bowls over whatever was on her tail. */
export const FART_VX = 7.6;
export const FART_LIFT_VY = -3.4;
export const FART_BLAST_R = 48; // varmints this close get flung
export const FART_CLOUD_W = 52; // lingering stink cloud (skunk zone)
export const FART_CLOUD_TICKS = 45;
/** Cooter's jug backblast: he rockets up, the lit jug goes the other way
 *  and smashes into a real fire pool. His own moonshine burns him too. */
export const JUGBLAST_VY = -8.6;
export const JUGBLAST_JUG_VY = 2.4; // dropped jug's initial fall speed
/** Bobbie Sue's sputter: every JUMP press midair is one putt of the
 *  scattergun — the MASH is the throttle. Unlimited presses, finite fuel:
 *  each puff sips wind (see sipWind). The cooldown is the climb-proofing:
 *  at a perfect mash (a puff every 8 ticks) the clamp + gravity net exactly
 *  zero, so flawless mashing hovers level and anything slower sinks — she
 *  can never out-climb the tier grid, autofire included. */
export const SPUTTER_COOLDOWN_TICKS = 8; // min gap; faster presses are eaten free
export const SPUTTER_VY = -1.4; // puff clamps vy to this
export const SPUTTER_VX = 0.9; // shove toward facing per puff...
export const SPUTTER_VX_CAP = 1.5; // ...capped at this x maxSpeed
export const SPUTTER_PIP_COST = 0.2; // wind per puff (full tank = 25 puffs)
/** Darlene's possum chute: fall speed while JUMP is held on the way down,
 *  and proper steering — the chute turns on a dime (vs P_AIR_CONTROL 0.42). */
export const GLIDE_FALL_VY = 2.1;
export const GLIDE_AIR_CONTROL = 0.9;
/** Grandpappy Zeke's wild ride: the sky picks the trajectory (weighted
 *  table in airspecials.ts). He's hostile-proof until boots touch ground —
 *  you don't steer it, so nothing that happens next is your fault. */
export const WILD_CHARGE_TICKS = 4; // crackle beat before launch
export const WILD_RIDE_TICKS = 120; // immunity safety cap; landing clears it
/** Post-landing mercy: the sky put him down (maybe on spikes), give him a
 *  beat to get his boots under him before anything can claim the kill. */
export const WILD_LAND_MERCY_TICKS = 45;
/** The old seventh strike, demoted to the table's 3% jackpot. */
export const BOLT_VY = -9.2;
export const BOLT_RADIUS = 95;
export const BOLT_DMG = 3;
// ---- wind: air-special stamina (see wind.ts) ----
/** Kill switch: false makes every air special free again, no pips shown. */
export const WIND_ENABLED = true;
/** Pips of wind: free air specials before a press becomes a gamble. */
export const WIND_MAX = 5;
/** Grounded ticks per pip back (2s: land, catch your breath, go again). */
export const WIND_REGEN_TICKS = 120;
/** Gassed out: odds the press whiffs. Rolled once per airtime. */
export const WIND_FAIL_CHANCE = 0.5;
/** The whiff still hops this fraction of an honest double (rescue, not death). */
export const WIND_STUMBLE_MULT = 0.35;
export const WIND_STUMBLE_TICKS = 22; // leg-wobble anim
/** At this many pips left (after the spend) the press starts to wheeze. */
export const WIND_STRAIN_AT = 1;
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
/** Floating bubbles shove each other apart below this centre distance, so a
 *  string packs into a honeycomb instead of one overlapping blob. */
export const BUBBLE_PACK_DIST = BUBBLE_R * 1.9;
export const BUBBLE_PACK_PUSH = 0.3; // fraction of the overlap resolved per tick
/** Bubbles whose centres are this close are "touching": popping one lights
 *  the fuse on the other (Bubble Bobble's adjacency chain). */
export const BUBBLE_CHAIN_DIST = BUBBLE_R * 2 + 6;
export const BUBBLE_CHAIN_RIPPLE_TICKS = 3; // fuse length: the pop ripples outward
/** A player's head coming up under a bubble pops it; walking into its side
 *  nudges it along (herding trapped varmints into one string). */
export const BUBBLE_NUDGE = 1.1;
export const SPECIAL_TTL_TICKS = 22 * TICK_HZ;
export const SPECIAL_DRIFT = 0.6;
export const MAX_SPECIALS_AFLOAT = 2;

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

// --- Second Pour: designated levels (3/7/10 of each world by default) refill
// after wave 1 dies. The last pop draws a quiet beat, then jars drop and an
// angry wave 2 streams in. Frenzy is the intended answer, bubbles remain a
// valid (heroic) one.
export const SECOND_POUR_BEAT_TICKS = 100; // quiet beat between last pop and the alarm
export const SECOND_POUR_TELEGRAPH_TICKS = 30; // "!" flashes this long before each entry
export const SECOND_POUR_STREAM_GAP = 14; // ticks between wave-2 entries
export const SECOND_POUR_MULT = 2; // wave 2 headcount = authored spawns x this
export const SECOND_POUR_MAX = 12; // wave 2 headcount cap
export const SECOND_POUR_HURRY_PUSH = 20 * TICK_HZ; // hurry-up deadline reset at the alarm
export const SECOND_POUR_JAR_RETRY = Math.floor(3.5 * TICK_HZ); // the still keeps pouring
/** Co-op jar policy at the alarm: false = one jar per player. Flip to true for
 *  a single contested jar both players can grab (first swig wins) if that
 *  tension turns out to be funny. */
export const SECOND_POUR_SHARED_JAR = false;

export const SPECIAL_INTERVAL_TICKS = 12 * TICK_HZ;
export const SPECIAL_FIRST_TICKS = 4 * TICK_HZ; // first special drifts in early
export const GHOST_REVIVE_TICKS = 14 * TICK_HZ; // ghost bubble lifetime before re-drift

// --- scoring ---
export const SCORE_POP_BASE = 1000; // chain n: base * 2^(n-1)
export const SCORE_WEAPON_KILL = 300;
export const YEEHAW_BONUS = 10000;
export const EXTRA_LIFE_EVERY = 100000;

export const YEEHAW = ["Y", "E", "E", "H", "A", "W"] as const;

// ------------------------------------------------------------ rescue cages
/** Cage box (feet-anchored like everything else): the 26x36 rigs at x2. */
export const CAGE_W = 52;
export const CAGE_H = 72;
/** Caged cousin calls out: first after this many ticks of play, then every interval. */
export const CAGE_HOLLER_FIRST = 150;
export const CAGE_HOLLER_EVERY = 540;
/** Padlock hits to pop a cage. */
export const CAGE_HITS = 3;
/** Ticks between hits so one shoulder-check is one hit, not six. */
export const CAGE_HIT_COOLDOWN = 28;
