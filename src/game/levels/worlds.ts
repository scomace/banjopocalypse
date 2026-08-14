// The nine counties of the BANJOPOCALYPSE. Palettes are Phaser hex numbers;
// music params feed the jug-band director (key = semitones from C, bpm,
// minor). All names, enemies, and bosses are original to this game.

import type { WorldDef } from "./types";

export const WORLDS: WorldDef[] = [
  {
    index: 1,
    name: "The Holler",
    subtitle: "home sweet doomed home",
    palette: {
      solid: 0x4a6b32,
      solidEdge: 0x76a24a,
      platform: 0x8a5a32,
      bgTop: 0x1a2416,
      bgBottom: 0x2c3a20,
      glow: 0x9bc318,
    },
    music: { key: 7, bpm: 100, minor: false }, // G major, easy porch tempo
    defaultEnemies: { a: "radpossum", b: "jackalope" },
    bossId: "bertha",
    bossName: "BIG BERTHA",
  },
  {
    index: 2,
    name: "The Flooded Mega-Mart",
    subtitle: "cleanup on every aisle",
    palette: {
      solid: 0x2e5560,
      solidEdge: 0x4a8a99,
      platform: 0x7a8894,
      bgTop: 0x0d1a20,
      bgBottom: 0x14343e,
      glow: 0x5adbe8,
    },
    music: { key: 5, bpm: 108, minor: false }, // F, fluorescent hum
    defaultEnemies: { a: "cartgator", b: "fanbat" },
    bossId: "catfish",
    bossName: "COLONEL CATFISH",
  },
  {
    index: 3,
    name: "Meth Lab Caverns",
    subtitle: "do NOT lick the walls",
    palette: {
      solid: 0x3d4a2e,
      solidEdge: 0x6d8a3a,
      platform: 0x5a6b4a,
      bgTop: 0x101408,
      bgBottom: 0x25301a,
      glow: 0xa8e83a,
    },
    music: { key: 2, bpm: 116, minor: true }, // D minor, jittery
    defaultEnemies: { a: "tweekergecko", b: "gaswisp" },
    bossId: "chemist",
    bossName: "THE CHEMIST",
  },
  {
    index: 4,
    name: "Radioactive County Fair",
    subtitle: "ride at your own risk",
    palette: {
      solid: 0x5a3a5e,
      solidEdge: 0x9c5aa8,
      platform: 0xb8862e,
      bgTop: 0x14081a,
      bgBottom: 0x2e1436,
      glow: 0xffb830,
    },
    music: { key: 9, bpm: 124, minor: false }, // A, calliope banjo
    defaultEnemies: { a: "corndoghound", b: "balloonclown" },
    bossId: "kernel",
    bossName: "KERNEL PANIC",
  },
  {
    index: 5,
    name: "Gator Bayou",
    subtitle: "somethin' moved out there",
    palette: {
      solid: 0x3a3050,
      solidEdge: 0x5e4a86,
      platform: 0x4a6b46,
      bgTop: 0x0c0a16,
      bgBottom: 0x201a38,
      glow: 0x8ae86a,
    },
    music: { key: 4, bpm: 96, minor: true }, // E minor, swampy drag
    defaultEnemies: { a: "skeeter", b: "snapturtle" },
    bossId: "swampthang",
    bossName: "SWAMP THANG",
  },
  {
    index: 6,
    name: "The Interstate Graveyard",
    subtitle: "last exit forever",
    palette: {
      solid: 0x5e4030,
      solidEdge: 0x9c6a3a,
      platform: 0x6b6b6b,
      bgTop: 0x180e08,
      bgBottom: 0x362014,
      glow: 0xff7a30,
    },
    music: { key: 0, bpm: 120, minor: false }, // C, road-house shuffle
    defaultEnemies: { a: "tirefireimp", b: "mufflersnake" },
    bossId: "bigrig",
    bossName: "BIG RIG",
  },
  {
    index: 7,
    name: "The Nuke Plant",
    subtitle: "three eyes are better'n two",
    palette: {
      solid: 0x3e4a52,
      solidEdge: 0x647a88,
      platform: 0x8a8a3a,
      bgTop: 0x06121c,
      bgBottom: 0x10262e,
      glow: 0x40c8ff,
    },
    music: { key: 10, bpm: 128, minor: true }, // Bb minor, geiger tick
    defaultEnemies: { a: "glowslime", b: "guvdrone" },
    bossId: "meltdownmel",
    bossName: "MELTDOWN MEL",
  },
  {
    index: 8,
    name: "Tornado Alley",
    subtitle: "cows at eye level",
    palette: {
      solid: 0x3a4640,
      solidEdge: 0x5e7a6a,
      platform: 0x7a7060,
      bgTop: 0x0e1410,
      bgBottom: 0x22302a,
      glow: 0xd8ff50,
    },
    music: { key: 7, bpm: 140, minor: true }, // G minor, storm reel
    defaultEnemies: { a: "cyclonechick", b: "flyincow" },
    bossId: "beefnado",
    bossName: "THE BEEFNADO",
  },
  {
    index: 9,
    name: "Scratch's Front Porch",
    subtitle: "he's been expectin' y'all",
    palette: {
      solid: 0x4a1a14,
      solidEdge: 0x8a2e1e,
      platform: 0x2e1a1a,
      bgTop: 0x0e0404,
      bgBottom: 0x300a08,
      glow: 0xff4020,
    },
    music: { key: 4, bpm: 150, minor: true }, // E minor, devil fiddle
    defaultEnemies: { a: "impfiddler", b: "hellhound" },
    bossId: "olscratch",
    bossName: "OL' SCRATCH",
  },
];

export function worldForLevel(levelIndex1: number): WorldDef {
  // levels 1..99; world = ceil(level/11)
  const w = Math.min(9, Math.ceil(levelIndex1 / 11));
  return WORLDS[w - 1];
}

export function isBossLevel(levelIndex1: number): boolean {
  return levelIndex1 % 11 === 0;
}

export function levelInWorld(levelIndex1: number): number {
  return ((levelIndex1 - 1) % 11) + 1; // 1..11
}
