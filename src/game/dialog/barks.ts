// Bark lines: original one-liners per character per trigger. Seeded-ish
// rotation with no repeats within 3 uses per pool. Tone: Duke-Nukem-via-
// hee-haw hillbilly bravado, PG-13, punching at the apocalypse, never at
// the family. Hard rule: no em-dashes anywhere in game text.

type BarkPool = Record<string, string[]>;

const SHARED: BarkPool = {
  levelIntro: [
    "Y'all smell that? Smells like winnin'.",
    "Another county, same varmints.",
    "Hold my jug. Watch this.",
    "This here's family business.",
    "Somebody's gotta clean up this mess.",
    "We ride at dawn. It's dawn somewhere.",
  ],
  trap: [
    "Gotcha, ya slippery devil!",
    "In the bubble ya go!",
    "Caught like a catfish in a kiddie pool!",
    "That's a keeper!",
    "Bag 'em and tag 'em!",
  ],
  chain: [
    "That's how we do it in the holler!",
    "Somebody call the county! New record!",
    "Poppin' like bacon grease!",
    "Whole litter in one go!",
    "Grandpa taught me that one!",
  ],
  frenzy: [
    "Now we're cookin' with lard!",
    "Hold onto yer overalls!",
    "It's HOLLERIN' time!",
    "Time to get UGLY!",
    "YEEHAW, baby!",
  ],
  death: [
    "Tell my hound... he's a good boy...",
    "I regret... most of it...",
    "Ain't the worst Tuesday I've had.",
    "Bury me with my banjo...",
    "I'm comin', Grandma... wait, no I ain't!",
  ],
  revive: [
    "Back from the great beyond, baby!",
    "Death said I was too much trouble.",
    "Y'all miss me? Course ya did.",
    "Told ya I'd walk it off!",
    "The Lord said NOT YET.",
  ],
  partnerDeath: [
    "NOOO! Well. More snacks for me.",
    "Get up, cuz! We got work!",
    "I'll avenge ya! Right after this level!",
    "Who's gonna drive the truck now?!",
  ],
  idle: [
    "We standin' around for a reason?",
    "I could be fishin' right now.",
    "My feet itch. That means trouble. Or socks.",
    "Anybody else hear banjo music?",
  ],
  bossIntro: [
    "Well ain't you a big'un.",
    "You're about to be a rug.",
    "We eatin' GOOD tonight!",
    "That's the biggest one yet, I reckon.",
  ],
  bossDefeat: [
    "And STAY down!",
    "Somebody get the smoker goin'!",
    "That's for the whole dang county!",
    "Big ones fall LOUDER!",
  ],
  worldIntro: [
    "New county, new critters, same us.",
    "Y'all lock the truck?",
    "I got a good feelin'. And a rash.",
  ],
};

const PER_CAST: Record<string, BarkPool> = {
  earl: {
    levelIntro: [
      "Stay sharp, Merle. I mean it.",
      "Plan's simple: bubble first, questions never.",
      "Tuned the banjo. Tuned my fury.",
    ],
    frenzy: ["Five strings of DOOM!", "This one goes out to the holler!"],
    chain: ["Clean pickin'!", "That's rhythm, baby!"],
    death: ["Merle... the banjo's yours... treat her right..."],
    idle: ["Practice makes perfect. So does dynamite."],
  },
  merle: {
    levelIntro: [
      "Earl says be careful. I heard 'be awesome'.",
      "Legally, I ain't liable for none of this.",
      "Twins on a mission, y'all!",
    ],
    frenzy: ["BOING, suckers!", "I'm the FUN twin!"],
    chain: ["Earl! EARL! You seein' this?!", "Count 'em and weep!"],
    death: ["Earl... I broke yer banjo... years ago... sorry..."],
    idle: ["What if bubbles, but BIGGER?"],
  },
  granny: {
    levelIntro: [
      "Mind yer manners, critters.",
      "I raised twelve young'uns. You lot ain't scary.",
      "Somebody's gettin' switched.",
    ],
    frenzy: ["The GOOD BOOK says GIT!", "Repent, varmints!"],
    chain: ["Supper's ready, boys!", "Like shellin' peas!"],
    death: ["Tell the still... I loved her most..."],
    bossIntro: ["I've cooked bigger'n you."],
    idle: ["In my day, the apocalypse was POLITE."],
  },
  cooter: {
    levelIntro: [
      "Fire safety tip: I AM the fire.",
      "Chief Cooter, reportin' for chaos.",
      "This is a controlled burn. Mostly.",
    ],
    frenzy: ["BURN, baby, BURN!", "That's 200 proof, sucker!"],
    chain: ["Crispy!", "Extra crispy!"],
    death: ["Tell the boys... it was... probably my fault..."],
    idle: ["Anybody smell smoke? Aw, that's just me."],
  },
  bobbiesue: {
    levelIntro: [
      "Nine years county champ. Ask anybody.",
      "Pull!",
      "I don't miss. I reschedule hits.",
    ],
    frenzy: ["BOTH barrels, sweetheart!", "Skeet skeet, varmint!"],
    chain: ["Grouped tighter'n Sunday pews!", "Still champ!"],
    death: ["Recount... I demand... a recount..."],
    idle: ["Standin' still makes ya an easy target. Just sayin'."],
  },
  darlene: {
    levelIntro: [
      "The possums say this level's haunted. Neat.",
      "My babies are HUNGRY today.",
      "Nature is healin'. Violently.",
    ],
    frenzy: ["Sic 'em, babies!", "The posse rides!"],
    chain: ["The possums are SO proud!", "Circle of life, real quick!"],
    death: ["My sweet babies... avenge... mama..."],
    idle: ["Petunia says hi. Petunia's a possum."],
  },
  buford: {
    levelIntro: [
      "Jumped the crick. Can jump this.",
      "Legs don't fail me now!",
      "Buford brings the BOUNCE.",
    ],
    frenzy: ["SCRUB-A-DUB, ya filthy animals!", "Washboard justice!"],
    chain: ["Cleaned 'em out!", "Spotless!"],
    death: ["Shoulda... stretched... first..."],
    idle: ["Reckon I could jump that? Reckon I could."],
  },
  zeke: {
    levelIntro: [
      "Storm's comin'. It's me. I'm the storm.",
      "Six strikes and I'm STILL tickin'.",
      "The sky and me got an arrangement.",
    ],
    frenzy: ["LIGHTNIN' LOOSE!", "Feel the tingle, boys!"],
    chain: ["Thunderstruck 'em!", "Zap zap zap!"],
    death: ["Seventh strike... always knew... it'd be pretty..."],
    idle: ["My knee says rain. My other knee says RUN."],
  },
};

// rotation state per pool key (not sim-deterministic; presentation only)
const recent = new Map<string, number[]>();
let counter = 1;

export function pickBark(castId: string, trigger: string): string | null {
  const own = PER_CAST[castId]?.[trigger] ?? [];
  const shared = SHARED[trigger] ?? [];
  const pool = [...own, ...own, ...shared]; // bias to character voice
  if (pool.length === 0) return null;
  const key = `${castId}:${trigger}`;
  const used = recent.get(key) ?? [];
  counter = (counter * 1103515245 + 12345) & 0x7fffffff;
  let idx = counter % pool.length;
  for (let tries = 0; tries < pool.length; tries++) {
    const candidate = (idx + tries) % pool.length;
    if (!used.includes(candidate)) {
      idx = candidate;
      break;
    }
  }
  recent.set(key, [...used.slice(-2), idx]);
  return pool[idx];
}
