// The eight playable kinfolk. `aachar` names the base character inside
// public/aachar/manifest.json (Scott's originals, confirmed 2026-08-14);
// everything else is game data. Signature weapons start at level 1 and are
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
  /**
   * What a second JUMP press does in the air. Absent = the honest standard
   * double jump (Earl, the baseline everyone learns on).
   *  - "hook":     Buford casts the Fishin' Line (hold to swing, release to fly)
   *  - "flutter":  Merle's legally distinct double jump — panic-speed leg
   *                scramble that keeps his momentum and boosts it
   *  - "fart":     Granny Mae's bean-powered sideways scoot
   *  - "jugblast": Cooter belches lit moonshine downward: rocket up, singe below
   *  - "sputter":  Bobbie Sue putt-putts the scattergun downward, one putt
   *                per JUMP press — mash to hover and drift on a rain of
   *                pellets; unlimited presses, finite wind
   *  - "glide":    Darlene's possum stretches into a chute; hold JUMP to drift
   *  - "wildride": Grandpappy Zeke asks the sky; the sky picks the direction,
   *                power and dignity level. Hostile-proof till he lands.
   */
  airSpecial?: "hook" | "flutter" | "fart" | "jugblast" | "sputter" | "glide" | "wildride";
  /** Short perk label for the select screen. */
  perkLabel?: string;
  /**
   * Where this cousin is caged. Absent = a starter (Earl and Merle, the
   * twins, so a fresh save can still field two players). Rescued cousins
   * unlock for good; clearing their world unlocks them anyway so nobody
   * gets soft-locked out of a cousin by walking past the cage.
   */
  rescue?: RescueSpot;
};

export type RescueSpot = {
  /** world 1..9 */
  world: number;
  /** level in world 1..10 (never the boss level 11 or shrine level 5) */
  level: number;
  /** one line of where/how they're stuck (select screen + design) */
  where: string;
  /** what they holler when the lock pops */
  line: string;
  /** what they call out from the cage, rotating, every few seconds */
  cagedLines: string[];
  /** baked clip while caged; default idle (goof = sat down / slumped) */
  pose?: "idle" | "goof";
};

/**
 * Dev switch: when true every cousin is pickable regardless of save progress.
 * Flip to false to play the rescue-cage unlocks for real.
 */
export const UNLOCK_ALL_CAST = true;

/** Is this cousin pickable given the player's save? */
export function castUnlocked(
  member: CastMember,
  save: { worldsCleared: number; castRescued: string[] },
): boolean {
  if (UNLOCK_ALL_CAST || !member.rescue) return true;
  return save.castRescued.includes(member.id) || save.worldsCleared >= member.rescue.world;
}

/** The cousin caged on this absolute level (1..99), if any. */
export function rescueForLevel(levelIndex1: number): CastMember | null {
  const world = Math.floor((levelIndex1 - 1) / 11) + 1;
  const inWorld = ((levelIndex1 - 1) % 11) + 1;
  return CAST.find((m) => m.rescue && m.rescue.world === world && m.rescue.level === inWorld) ?? null;
}

export const CAST: CastMember[] = [
  {
    id: "earl",
    displayName: "Earl",
    aachar: "Adventurer",
    bio: "The responsible twin. Plays a mean five-string.",
    signatureWeapon: "twang",
    speed: 3, puff: 3, jump: 3, luck: 3,
    perkLabel: "HONEST DOUBLE JUMP",
  },
  {
    id: "merle",
    displayName: "Merle",
    aachar: "Adventurer2",
    bio: "The other twin. Legally distinct from Earl.",
    signatureWeapon: "jawharp",
    speed: 4, puff: 3, jump: 3, luck: 2,
    airSpecial: "flutter",
    perkLabel: "LEGALLY DISTINCT FLUTTER",
  },
  {
    id: "granny",
    displayName: "Granny Mae",
    aachar: "Ida",
    bio: "Owns the still. Owns everyone in checkers.",
    signatureWeapon: "goodbook",
    speed: 2, puff: 3, jump: 2, luck: 5,
    airSpecial: "fart",
    perkLabel: "BEAN POWER",
    rescue: {
      world: 1,
      level: 4,
      where: "the root cellar under the homestead, door wedged shut since the still blew",
      line: "Took y'all long enough. Who's been in my checkers?",
      cagedLines: [
        "Over here! Mind the preserves.",
        "Y'all gonna stand there or open this?",
        "I can hear ya breathin'.",
      ],
    },
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
    airSpecial: "jugblast",
    perkLabel: "LONG FRENZY · JUG BLAST",
    rescue: {
      world: 3,
      level: 8,
      where: "chained to a glowin' propane tank by the Chemist's cultists",
      line: "I was INVESTIGATIN'. Officially.",
      cagedLines: [
        "Don't spark nothin'. Tank's full.",
        "Lil help? Chains itch.",
        "Hic. Anybody got a light? KIDDIN'.",
      ],
      pose: "goof",
    },
  },
  {
    id: "bobbiesue",
    displayName: "Bobbie Sue",
    aachar: "Adventurer3",
    bio: "County skeet champ, 9 years runnin'.",
    signatureWeapon: "scattergun",
    speed: 4, puff: 4, jump: 2, luck: 2,
    airSpecial: "sputter",
    perkLabel: "SCATTERGUN SPUTTER",
    rescue: {
      world: 2,
      level: 6,
      where: "the sporting-goods lockup, snipin' catfish through the mesh",
      line: "Nine years runnin'. Ten, now.",
      cagedLines: [
        "Psst. Lockup. Shells are gettin' low.",
        "Somebody pop this cage!",
        "Nine years champ and I'm stuck in here.",
      ],
    },
  },
  {
    id: "darlene",
    displayName: "Darlene",
    aachar: "afsdf",
    bio: "Talks to possums. They talk back.",
    signatureWeapon: "possum",
    speed: 3, puff: 3, jump: 3, luck: 4,
    airSpecial: "glide",
    perkLabel: "POSSUM CHUTE",
    rescue: {
      world: 4,
      level: 6,
      where: "the sideshow tent: THE POSSUM WHISPERER, 25 cents a look",
      line: "Y'all took yer time. The possums was gettin' ideas.",
      cagedLines: [
        "Twenty-five cents to look. Free to free me.",
        "Possums say: over here.",
        "Quit gawkin' and whack the lock!",
      ],
    },
  },
  {
    id: "buford",
    displayName: "Buford",
    aachar: "Zed2",
    bio: "Once jumped the crick. The wide part.",
    signatureWeapon: "washboard",
    speed: 2, puff: 2, jump: 5, luck: 3,
    airSpecial: "hook",
    perkLabel: "FISHIN' LINE",
    rescue: {
      world: 5,
      level: 8,
      where: "a gator-hunter's bait cage swingin' off a cypress limb, own line tangled round it",
      line: "I'd have made it. Wind shifted.",
      cagedLines: [
        "Up here! The wide part got me.",
        "Line's tangled. Hit the lock!",
        "Gators is circlin'. No rush. SOME rush.",
      ],
    },
  },
  {
    id: "zeke",
    displayName: "Grandpappy Zeke",
    aachar: "Zeddington",
    bio: "Struck by lightning 6 times. Likes it.",
    signatureWeapon: "lightnin",
    speed: 2, puff: 5, jump: 2, luck: 3,
    airSpecial: "wildride",
    perkLabel: "ACT OF GOD",
    rescue: {
      world: 8,
      level: 9,
      where: "strapped to a storm-chaser's weather tower, waitin' on strike seven",
      line: "Seven! Told y'all seven was the good one.",
      cagedLines: [
        "Six down. Cut me loose for seven!",
        "Storm's comin'. I'm countin' on it.",
        "Up top! Mind the rod!",
      ],
    },
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
