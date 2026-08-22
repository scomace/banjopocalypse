// Every SFX name the engine knows, grouped for the mixer (/admin/sfx). This is
// the registry the soundboard iterates; the per-sound loudness trims live in
// sfx-trim.json (written by the mixer, read by the engine). A sound missing
// here still plays; it just won't show up on the board.
//
// `pitch` is the pitch the board auditions the sound at by default, for
// sounds the sim always emits pitched away from 1. `pitches` lists a few
// extra values worth checking when the sim rolls a range.

export type SfxGroup =
  | "menu"
  | "player"
  | "pickups"
  | "jingles"
  | "weapons"
  | "enemies"
  | "boss"
  | "alerts";

export type SfxDef = {
  name: string;
  group: SfxGroup;
  note: string;
  pitch?: number;
  pitches?: number[];
};

export const SFX_GROUPS: { id: SfxGroup; title: string; blurb: string }[] = [
  { id: "menu", title: "Menu", blurb: "shell cursor and letter entry" },
  { id: "player", title: "Player", blurb: "blowing, jumping, wind, dying" },
  { id: "pickups", title: "Pickups", blurb: "food, jars, frenzy" },
  { id: "jingles", title: "Jingles", blurb: "stingers and fanfares (long, keep these under the rest)" },
  { id: "weapons", title: "Weapons & specials", blurb: "per-cousin weapons, specials, air specials, fishin' line" },
  { id: "enemies", title: "Enemies", blurb: "varmint voices and hits" },
  { id: "boss", title: "Boss", blurb: "boss attacks, phases, defeat" },
  { id: "alerts", title: "Alerts", blurb: "timers and level flow" },
];

export const SFX_CATALOG: SfxDef[] = [
  // menu
  { name: "menu:move", group: "menu", note: "cursor move (banjo pluck)" },
  { name: "menu:tick", group: "menu", note: "value tick" },
  { name: "menu:accept", group: "menu", note: "confirm" },
  { name: "menu:back", group: "menu", note: "back out" },
  { name: "menu:nope", group: "menu", note: "rejected" },
  { name: "letter", group: "menu", note: "initials entry", pitches: [1, 1.3, 1.6] },

  // player
  { name: "hic", group: "player", note: "bubble blow: synth blip + sampled burp", pitches: [0.8, 1, 1.3] },
  { name: "megaBelch", group: "player", note: "Mega-Belch (also ducks the music)" },
  { name: "pop", group: "player", note: "bubble pops a varmint (pentatonic walk-up)", pitches: [1, 1.25, 1.5, 2] },
  { name: "popEmpty", group: "player", note: "empty bubble pops" },
  { name: "trap", group: "player", note: "varmint trapped in a bubble" },
  { name: "escape", group: "player", note: "varmint wriggles free", pitches: [0.8, 1, 1.1] },
  { name: "jump", group: "player", note: "jump", pitches: [1, 1.2] },
  { name: "bounce", group: "player", note: "bounce off a bubble" },
  { name: "boingSmall", group: "player", note: "flutter / air-special hop", pitch: 1.5 },
  { name: "possum", group: "player", note: "possum glide start", pitch: 1.3 },
  { name: "windStrain", group: "player", note: "last pips of wind (sample)", pitches: [1, 1.2, 1.5] },
  { name: "windFail", group: "player", note: "gassed out (sample)" },
  { name: "playerDie", group: "player", note: "death bend" },
  { name: "revive", group: "player", note: "revive chord" },

  // pickups
  { name: "food", group: "pickups", note: "food pickup (banjo note per food)", pitches: [1, 1.25, 1.5] },
  { name: "jarSpawn", group: "pickups", note: "jar appears" },
  { name: "jarGrab", group: "pickups", note: "jar grabbed: clink, swig, burpette" },
  { name: "frenzyStart", group: "pickups", note: "frenzy begins" },
  { name: "frenzyEnd", group: "pickups", note: "frenzy fades" },
  { name: "hogfat", group: "pickups", note: "hogfat / slow pickup" },

  // jingles
  { name: "extraLife", group: "jingles", note: "1-up" },
  { name: "yeehawComplete", group: "jingles", note: "YEEHAW letters complete" },
  { name: "levelClear", group: "jingles", note: "level clear tag" },
  { name: "weaponAcquired", group: "jingles", note: "shrine reveal: gospel swell + roll" },
  { name: "gospel", group: "jingles", note: "prayer / cage rescue chord" },
  { name: "bossDefeat", group: "jingles", note: "boss defeated" },
  { name: "bossDown", group: "jingles", note: "boss down (same as defeat)" },
  { name: "devilFiddle", group: "jingles", note: "devil's fiddle sting" },
  { name: "duelNote", group: "jingles", note: "fiddle duel: devil's note" },
  { name: "noteReturn", group: "jingles", note: "fiddle duel: banjo answer", pitches: [1, 1.3] },
  { name: "noteHit", group: "jingles", note: "fiddle duel: hit" },

  // weapons & specials
  { name: "twang", group: "weapons", note: "banjo twang shot", pitches: [0.9, 1.1] },
  { name: "jugThrow", group: "weapons", note: "jug lob" },
  { name: "jugSmash", group: "weapons", note: "jug shatters" },
  { name: "scattergun", group: "weapons", note: "scattergun blast" },
  { name: "scrub", group: "weapons", note: "scrub brush swipe", pitches: [0.9, 1.2] },
  { name: "cluck", group: "weapons", note: "chicken", pitches: [0.85, 1.25] },
  { name: "eggPop", group: "weapons", note: "egg bursts" },
  { name: "spit", group: "weapons", note: "tobacco spit" },
  { name: "boltHit", group: "weapons", note: "lightning bolt lands" },
  { name: "boing", group: "weapons", note: "jaw-harp boing" },
  { name: "howl", group: "weapons", note: "hound howl special" },
  { name: "cousinYell", group: "weapons", note: "cousin yell", pitches: [1, 1.25] },
  { name: "cousinBonk", group: "weapons", note: "cousin hits the wall" },
  { name: "moonshineFlood", group: "weapons", note: "special: moonshine flood" },
  { name: "lightninJar", group: "weapons", note: "special: lightnin' jar" },
  { name: "skunk", group: "weapons", note: "special: skunk rip" },
  { name: "hogSqueal", group: "weapons", note: "special: hog stampede (sample)" },
  { name: "fart", group: "weapons", note: "Granny Mae air special (sample)" },
  { name: "wetfart", group: "weapons", note: "Granny Mae gassed out (sample)" },
  { name: "boom", group: "weapons", note: "explosion (air special / boss)", pitches: [1, 1.35] },
  { name: "castLine", group: "weapons", note: "fishin' line cast" },
  { name: "lineTaut", group: "weapons", note: "line snaps tight" },
  { name: "lineSlack", group: "weapons", note: "line goes slack" },
  { name: "hookBite", group: "weapons", note: "hook bites a varmint" },
  { name: "fling", group: "weapons", note: "varmint flung", pitches: [1, 1.15] },
  { name: "wallSlam", group: "weapons", note: "flung varmint hits wall (also boss)" },

  // enemies
  { name: "thwack", group: "enemies", note: "varmint hit", pitches: [0.7, 1] },
  { name: "weaponKill", group: "enemies", note: "varmint killed by a weapon" },
  { name: "charge", group: "enemies", note: "varmint charges" },
  { name: "enemyShoot", group: "enemies", note: "varmint shoots" },
  { name: "houndBark", group: "enemies", note: "hound bark" },

  // boss
  { name: "bossHit", group: "boss", note: "boss takes a hit" },
  { name: "bossPhase", group: "boss", note: "boss phase change" },
  { name: "minionSpawn", group: "boss", note: "boss spawns minion" },
  { name: "splash", group: "boss", note: "boss splash" },
  { name: "teleport", group: "boss", note: "boss teleports" },
  { name: "kernelBounce", group: "boss", note: "popcorn kernel bounce" },
  { name: "vineWhip", group: "boss", note: "vine whip" },
  { name: "meltdown", group: "boss", note: "meltdown rumble" },
  { name: "cowFling", group: "boss", note: "cow fling" },

  // alerts
  { name: "hurryUp", group: "alerts", note: "hurry up knock" },
  { name: "secondPour", group: "alerts", note: "still alarm (second pour)" },
];

export const SFX_NAMES: string[] = SFX_CATALOG.map((d) => d.name);
