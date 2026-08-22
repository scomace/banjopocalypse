// Simulation entity types. The sim is pure data + pure functions over it —
// no Phaser objects, no DOM, no Date.now(). The renderer mirrors this state;
// the audio/fx layers drain `fx` events.

import type { Rng } from "../core/rng";
import type { EnemyKind, ParsedLevel, WorldDef } from "../levels/types";
import type { HazardId } from "./hazards";

export type Facing = -1 | 1;

export type WeaponSlot = { id: string; level: number };

export type Loadout = {
  weapons: WeaponSlot[];
  tonics: string[];
  evolved: string[]; // weapon ids currently in evolved form
  /** id of the last weapon frenzied with; random rolls avoid repeating it
   *  when 2+ are owned. Lives here because the run layer and the sim share
   *  this object, so the memory survives across levels for free. */
  lastFrenzy?: string;
};

/** Buford's Fishin' Line. `fly`: hook sailing out; `hold`: line is taut and
 *  the player swings from (ax, ay); `retract`: hook zipping back to the rod. */
export type HookState =
  | { kind: "fly"; x: number; y: number; vx: number; vy: number; tx: number | null; ty: number | null; dist: number }
  | { kind: "hold"; ax: number; ay: number; len: number; ticks: number }
  | { kind: "retract"; x: number; y: number };

export type PlayerState = {
  index: 0 | 1;
  castId: string;
  loadout: Loadout;
  livesLeft: number;
  alive: boolean;
  spectating: boolean;
  /** Dead-with-lives-left co-op state: drifting ghost bubble. */
  ghost: null | { x: number; y: number; vx: number; vy: number; ticks: number };
  x: number; // feet center
  y: number;
  vx: number;
  vy: number;
  facing: Facing;
  grounded: boolean;
  coyote: number;
  jumpBuffer: number;
  /** The one-shot air special is spent; wiped every time boots touch ground. */
  airJumpUsed: boolean;
  /** Air-special stamina pips left (WIND_* in constants; wind.ts). */
  wind: number;
  /** Grounded ticks banked toward the next wind pip. */
  windTicks: number;
  /** Gassed-out whiff wobble countdown (cosmetic, but sim-owned). */
  stumbleTicks: number;
  /** Merle's flutter-kick anim countdown (cosmetic, but sim-owned). */
  flutterTicks: number;
  /** Darlene's possum chute is open this tick (slow fall; renderer draws it). */
  gliding: boolean;
  jumpHeld: boolean;
  blowHeld: boolean;
  blowCooldown: number;
  invuln: number;
  respawnIn: number; // >0 while waiting to respawn (solo or world edge)
  // stats resolved from cast + tonics
  maxSpeed: number;
  jumpVy: number;
  puffTicks: number;
  luck: number;
  // frenzy
  frenzy: null | { weapon: string; level: number; ticksLeft: number };
  weaponCooldowns: Record<string, number>;
  // run-level flags mirrored into the sim for convenience
  hogFatCharge: boolean; // survive one hit this level
  headStart: boolean; // Jar o' Lightnin' card: frenzy as the level opens
  prayer: number; // invincibility glow ticks (special bubble)
  // Fishin' Line (cast members with airSpecial "hook")
  hook: HookState | null;
  hookCooldown: number;
  /** ticks of post-release momentum during which a fast body still kicks enemies */
  hookKick: number;
  // PVP head bounce (see PVP_BOUNCE): both fields stay 0 with the flag off
  /** ticks a head-bounce launch ignores the jump-release height cut */
  pvpLaunch: number;
  /** ticks of buckled knees after a partner bounced off this head */
  squash: number;
  // presentation hints
  anim: string;
  animLock: number;
  hicPitch: number;
};

export type BubbleState =
  | { kind: "launch"; ticks: number }
  | { kind: "float" }
  | { kind: "trapped"; enemyId: number; enemyKind: EnemyKind; ticks: number; angryOnEscape: boolean };

export type Bubble = {
  id: number;
  owner: 0 | 1;
  x: number;
  y: number;
  vx: number;
  vy: number;
  state: BubbleState;
  age: number;
  rides: number;
  /** Ticks a player has stood on this bubble; it pops at BUBBLE_RIDE_TICKS. */
  rideTicks: number;
  /** Counts down while someone is aboard, so lift can account for the load. */
  ridden: number;
  wobblePhase: number;
};

export type EnemyPhase =
  | { kind: "normal" }
  | { kind: "trapped"; bubbleId: number }
  | { kind: "dying"; ticks: number; targetX: number; targetY: number; chain: number; toBoss: boolean };

export type Enemy = {
  id: number;
  kind: EnemyKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: Facing;
  grounded: boolean;
  angry: boolean;
  phase: EnemyPhase;
  hp: number; // frenzy-weapon chip damage; bubbles trap regardless
  stateTimer: number; // per-archetype behavior clock
  mode: number; // per-archetype sub-state
  homeY: number; // floaters remember a cruising line
  flying: boolean;
  shielded: boolean;
  hitFlash: number;
  /** >0 while sent flying by a Fishin' Line hit: tumbling, harmless, bowls over kin */
  flung: number;
  flungBy: 0 | 1;
  /** Shrine guardians stay inside this box (center + half-extent). */
  leash: { x: number; y: number; r: number } | null;
};

export type ProjectileKind =
  | "book" // orbit
  | "twangring"
  | "jug"
  | "firepool"
  | "pellet"
  | "boinger"
  | "washarc"
  | "chicken"
  | "egg"
  | "spit"
  | "bolt"
  | "note" // boss fiddle notes (hostile) + duel returns (friendly)
  | "enemyshot"; // shooter archetype projectiles

export type Projectile = {
  id: number;
  kind: ProjectileKind;
  hostile: boolean;
  owner: 0 | 1;
  x: number;
  y: number;
  vx: number;
  vy: number;
  ticks: number;
  data: number; // kind-specific: orbit angle, bounce count, pool width...
  power: number;
};

export type PetKind = "possum" | "cousin" | "hound" | "granny";

export type Pet = {
  id: number;
  kind: PetKind;
  owner: 0 | 1;
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: Facing;
  grounded: boolean;
  ticks: number;
  /** possum: 1 = playing dead. kin: 2 = bonked (stunned against a wall) */
  mode: number;
  power: number;
  /** kin (cousin/granny): run speed, set at spawn from the weapon level */
  speed?: number;
  /** kin: ticks left on the commitment lock; facing can't change while >0 */
  lock?: number;
  /** kin: ticks left before another hop is allowed */
  hopCd?: number;
  /** kin: ticks left before another lunge is allowed */
  lungeCd?: number;
  /** kin: ticks left on the current headbutt lunge (double speed) */
  lunge?: number;
  /** kin: ticks left stunned after bonking a wall */
  bonk?: number;
};

export type ItemKind =
  | "food"
  | "jar"
  | "letter" // YEEHAW letter
  | "life"; // rare extra-life moon jug

export type Item = {
  id: number;
  kind: ItemKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  grounded: boolean;
  ttl: number;
  /** food: tier 0..6; jar: weapon id index into player arsenal; letter: 0..5 */
  data: number;
  /** jar: which player's arsenal indexed (jars are per-player-colored) */
  forPlayer: 0 | 1;
  /** jar: grabbable by either player (Second Pour single-jar mode) */
  shared?: boolean;
  /** food: score value */
  value: number;
  /** arc-to-target phase after a pop */
  arcTicks: number;
  fromX: number;
  fromY: number;
  targetX: number;
  targetY: number;
};

export type SpecialKind = "moonshine" | "lightnin" | "skunk" | "hog" | "prayer";

export type SpecialBubble = {
  id: number;
  kind: SpecialKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
};

export type ZoneKind = "fire" | "skunk";

/** Lingering area effects (moonshine cascades, skunk clouds). */
export type Zone = {
  id: number;
  kind: ZoneKind;
  x: number;
  y: number;
  w: number;
  h: number;
  ticks: number;
  /** moonshine flood: spreads downhill for its first ~40 ticks */
  spreading: boolean;
};

export type HogEntity = {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  facing: Facing;
  ticks: number;
};

export type BossState = {
  id: string;
  name: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  maxHp: number;
  phase: number;
  phaseTimer: number;
  mode: number;
  modeTimer: number;
  facing: Facing;
  hitFlash: number;
  invuln: number;
  dead: boolean;
  deathTicks: number;
  /** Scratch duel: notes to return */
  duel: { beat: number; notesReturned: number } | null;
};

export type FxEvent =
  | { t: "sfx"; name: string; pitch?: number; pan?: number }
  | { t: "burst"; text: string; x: number; y: number; big?: boolean; palette?: string }
  /** `text`+`at` = a non-player speaker (the caged cousin, player slot 9) with a
   *  fixed world anchor; otherwise the named player barks `trigger` */
  | { t: "balloon"; player: number; trigger: string; text?: string; at?: { x: number; y: number } }
  | { t: "shake"; power: number }
  | { t: "belch"; player: number }
  | { t: "flash"; color: number }
  /** a rescue cage popped; the host marks the cousin rescued in the save */
  | { t: "rescue"; cast: string; player: number };

export type SimStatus = "intro" | "play" | "cleared" | "allDead" | "bossDead";

export type RelicId = "hootenanny" | "forbiddenstill";

/** What a weapon shrine pedestal holds. */
export type ShrineGift =
  | { kind: "weapon"; weaponId: string }
  | { kind: "relic"; relicId: RelicId };

export type ShrineState = {
  x: number; // feet of the pedestal row
  y: number;
  gifts: ShrineGift[]; // 1-2 pedestals, left to right
  taken: number; // -1 until claimed, else the pedestal index
  takenBy: 0 | 1;
  guardianIds: number[];
  /** "claim yer prize" reminder already shown */
  nagged: boolean;
};

export type RevenuerState = {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
};

/** Second Pour: designated levels refill after wave 1 dies.
 *  armed -> (last wave-1 enemy pops) -> beat (quiet, `ticks` counts down) ->
 *  pouring (jars drop, queue streams in angry) -> done (normal clear rules). */
export type PourState = {
  phase: "armed" | "beat" | "pouring" | "done";
  ticks: number;
  /** wave-2 entries: telegraphed, then spawned angry at tick `at` */
  queue: { kind: EnemyKind; x: number; y: number; at: number }[];
  /** next tick the still re-pours a jar for a frenzyless player */
  jarRetry: number;
};

export type Sim = {
  tick: number;
  rng: Rng;
  level: ParsedLevel;
  world: WorldDef;
  levelIndex: number; // 1..99
  isBoss: boolean;
  status: SimStatus;
  statusTicks: number;
  players: PlayerState[];
  bubbles: Bubble[];
  enemies: Enemy[];
  projectiles: Projectile[];
  pets: Pet[];
  items: Item[];
  specials: SpecialBubble[];
  zones: Zone[];
  hog: HogEntity;
  boss: BossState | null;
  revenuer: RevenuerState;
  /** tick the revenuer (re)arrives; pushed back when the Second Pour hits */
  hurryTick: number;
  /** Second Pour state, null on undesignated levels */
  pour: PourState | null;
  nextId: number;
  nextJarTick: number;
  nextSpecialTick: number;
  /** per-player chain state */
  chains: { count: number; lastTick: number }[];
  fx: FxEvent[];
  /** score deltas + letters etc. drained by the run layer */
  scored: { player: 0 | 1; amount: number }[];
  lettersFound: { player: 0 | 1; letter: number }[];
  livesFound: { player: 0 | 1 }[];
  /** set when player death consumed a life this level */
  deaths: number[];
  secretDoorOpen: boolean;
  secretEntered: boolean;
  /** weapon shrine (level 5 of each world), null elsewhere */
  shrine: ShrineState | null;
  /** set when a pedestal is claimed; the host shows the reveal and clears it */
  shrineTaken: { player: 0 | 1; gift: ShrineGift } | null;
  /** rescue cage (one per rescue level, see cast.ts), null elsewhere */
  cage: CageState | null;
  /** this level's Holler Hazard (sim/hazards.ts), null on a straight level */
  hazard: HazardId | null;
  /** next tick the live hazard fires an event (hogs, hens, bolts, gas) */
  hazardTick: number;
};

/** A caged cousin. Always present on their level, even once rescued: the
 *  sim stays save-independent so lockstep peers with different saves agree.
 *  The host decides whether the pop is a first rescue or a repeat. */
export type CageState = {
  castId: string;
  /** feet anchor of the cage */
  x: number;
  y: number;
  /** padlock hits landed / needed */
  hits: number;
  hitsNeeded: number;
  /** ticks until the lock takes another hit (so one touch is one hit) */
  hitCooldown: number;
  /** renderer: rattle countdown after a hit */
  rattle: number;
  /** tick the lock popped, -1 while shut */
  openedTick: number;
  /** caged hollers so far (indexes the cousin's cagedLines) */
  hollers: number;
  /** next tick the caged cousin calls out */
  nextHollerTick: number;
};

/** InputCommand per player, indexed by PlayerState.index. Length 2 today;
 *  kept open-ended so a 4-player mode only widens the array. */
export type SimInputs = number[];
