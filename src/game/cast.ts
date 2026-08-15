// The eight playable kinfolk. `aachar` names the base character inside
// public/aachar/manifest.json (Scott's originals, confirmed 2026-08-14);
// everything else is game data. Signature weapons start at level 2 and are
// always in the arsenal. Stats are 1..5 pips.

export type CastMember = {
  id: string;
  displayName: string;
  aachar: string;
  bio: string;
  signatureWeapon: string;
  speed: number;
  puff: number;
  jump: number;
  luck: number;
  /** Extra seconds of frenzy duration (Cooter's perk). */
  frenzyBonus?: number;
  /** Cleared-world count required before this character unlocks. */
  unlockWorlds: number;
};

export const CAST: CastMember[] = [
  {
    id: "earl",
    displayName: "Earl",
    aachar: "Adventurer",
    bio: "The responsible twin. Plays a mean five-string.",
    signatureWeapon: "twang",
    speed: 3, puff: 3, jump: 3, luck: 3,
    unlockWorlds: 0,
  },
  {
    id: "merle",
    displayName: "Merle",
    aachar: "Adventurer2",
    bio: "The other twin. Legally distinct from Earl.",
    signatureWeapon: "jawharp",
    speed: 4, puff: 3, jump: 3, luck: 2,
    unlockWorlds: 0,
  },
  {
    id: "granny",
    displayName: "Granny Mae",
    aachar: "Ida",
    bio: "Owns the still. Owns everyone in checkers.",
    signatureWeapon: "goodbook",
    speed: 2, puff: 3, jump: 2, luck: 5,
    unlockWorlds: 0,
  },
  {
    id: "cooter",
    displayName: "Cooter",
    // The manifest spells this character "Louu" (double u) — Scott's "Lou".
    aachar: "Louu",
    bio: "Volunteer fire chief. Started most of the fires.",
    signatureWeapon: "jug",
    speed: 3, puff: 2, jump: 3, luck: 3,
    frenzyBonus: 2,
    unlockWorlds: 0,
  },
  {
    id: "bobbiesue",
    displayName: "Bobbie Sue",
    aachar: "Adventurer3",
    bio: "County skeet champ, 9 years runnin'.",
    signatureWeapon: "scattergun",
    speed: 4, puff: 4, jump: 2, luck: 2,
    unlockWorlds: 2,
  },
  {
    id: "darlene",
    displayName: "Darlene",
    aachar: "afsdf",
    bio: "Talks to possums. They talk back.",
    signatureWeapon: "possum",
    speed: 3, puff: 3, jump: 3, luck: 4,
    unlockWorlds: 4,
  },
  {
    id: "buford",
    displayName: "Buford",
    aachar: "Zed2",
    bio: "Once jumped the crick. The wide part.",
    signatureWeapon: "washboard",
    speed: 2, puff: 2, jump: 5, luck: 3,
    unlockWorlds: 6,
  },
  {
    id: "zeke",
    displayName: "Grandpappy Zeke",
    aachar: "Zeddington",
    bio: "Struck by lightning 6 times. Likes it.",
    signatureWeapon: "lightnin",
    speed: 2, puff: 5, jump: 2, luck: 3,
    unlockWorlds: 8,
  },
];

/**
 * Jump-impulse multiplier for a character's `jump` pips. Deliberately narrow:
 * levels are built so the *weakest* jumper clears the 3-tile tier grid, and
 * extra pips buy headroom rather than a whole extra tier. scripts/level-audit
 * validates every layout against the weakest value this returns.
 */
export function castJumpMult(jumpPips: number): number {
  return 0.94 + jumpPips * 0.022;
}

export function castById(id: string): CastMember {
  const m = CAST.find((c) => c.id === id);
  if (!m) throw new Error(`unknown cast member: ${id}`);
  return m;
}
