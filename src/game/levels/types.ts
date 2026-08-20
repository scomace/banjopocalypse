// Level data format. Every one of the 99 levels is an authored ASCII grid,
// 30 columns × 17 rows, checked into src/game/levels/w{1-9}/. Symbols:
//
//   #  solid tile
//   =  one-way platform (jump up through, never drop through)
//   ^  spikes (pop empty bubbles, hurt players standing on them)
//   .  empty (space also accepted)
//   1  player 1 spawn      2  player 2 spawn
//   a-d enemy spawn slots — the level's `enemies` map says what each letter is
//   ~  updraft wind column (strong lift)
//   <  leftward wind       >  rightward wind
//   J  preferred mason-jar spawn point
//   S  secret warp-cellar door location (only appears on deathless runs)
//   W  weapon shrine (level 5 of every world): two pedestals + leashed guardians
//
// Wind: bubbles in a plain column drift gently up and toward the top center;
// wind tiles overwrite that with their own vector for their whole column/row
// cell. The authored currents are most of a layout's personality.

export type EnemyKind =
  | "radpossum"
  | "jackalope"
  | "cartgator"
  | "fanbat"
  | "tweekergecko"
  | "gaswisp"
  | "corndoghound"
  | "balloonclown"
  | "skeeter"
  | "snapturtle"
  | "tirefireimp"
  | "mufflersnake"
  | "glowslime"
  | "guvdrone"
  | "cyclonechick"
  | "flyincow"
  | "impfiddler"
  | "hellhound"
  | "glowslime_mini";

export type LevelDef = {
  /** 17 rows of 30 chars. */
  grid: string[];
  /** What each spawn letter means in this level. */
  enemies: Partial<Record<"a" | "b" | "c" | "d", EnemyKind>>;
  /** Optional per-level hurry-up override (ticks). */
  hurryTicks?: number;
  /** Second Pour level: clearing wave 1 drops jars and pours in an angry
   *  wave 2. Defaults on for levels 3/7/10 of each world (see getLevelDef);
   *  set explicitly to force it on or off for this def. */
  secondPour?: boolean;
};

export type WorldDef = {
  index: number; // 1..9
  name: string;
  subtitle: string;
  /** Tile palette (renderer): solid fill, solid edge, platform, backdrop top/bottom. */
  palette: {
    solid: number;
    solidEdge: number;
    platform: number;
    bgTop: number;
    bgBottom: number;
    glow: number;
  };
  /** Music seed parameters. */
  music: { key: number; bpm: number; minor: boolean };
  /** Default enemy letter meanings (levels may override). */
  defaultEnemies: Partial<Record<"a" | "b" | "c" | "d", EnemyKind>>;
  bossId: string;
  bossName: string;
};

export type ParsedLevel = {
  /** collision[y][x]: 0 empty, 1 solid, 2 platform, 3 spikes */
  collision: Uint8Array[];
  /** wind[y][x]: 0 none, 1 up, 2 left, 3 right */
  wind: Uint8Array[];
  spawns: { p1: { x: number; y: number }; p2: { x: number; y: number } };
  enemySpawns: { kind: EnemyKind; x: number; y: number }[];
  jarPoints: { x: number; y: number }[];
  secretDoor: { x: number; y: number } | null;
  /** weapon shrine anchor (feet of the pedestal row), if authored */
  shrine: { x: number; y: number } | null;
};

export const T_EMPTY = 0;
export const T_SOLID = 1;
export const T_PLATFORM = 2;
export const T_SPIKES = 3;

export const W_NONE = 0;
export const W_UP = 1;
export const W_LEFT = 2;
export const W_RIGHT = 3;
