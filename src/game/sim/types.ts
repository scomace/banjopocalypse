// Simulation entity types. The sim is pure data + pure functions over it —
// no Phaser objects, no DOM, no Date.now(). The renderer mirrors this state;
// the audio/fx layers drain `fx` events.

import type { Rng } from "../core/rng";
import type { EnemyKind, ParsedLevel, WorldDef } from "../levels/types";

export type Facing = -1 | 1;

export type WeaponSlot = { id: string; level: number };

export type Loadout = {
  weapons: WeaponSlot[];
  tonics: string[];
  evolved: string[]; // weapon ids currently in evolved form
};

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
  prayer: number; // invincibility glow ticks (special bubble)
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
  mode: number;
  power: number;
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
  | { t: "balloon"; player: number; trigger: string }
  | { t: "shake"; power: number }
  | { t: "belch"; player: number }
  | { t: "flash"; color: number };

export type SimStatus = "intro" | "play" | "cleared" | "allDead" | "bossDead";

export type RevenuerState = {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
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
};

export type SimInputs = [number, number]; // InputCommand per player
