// Bark lines: original one-liners per character per trigger. Weighted
// rotation with no text repeats inside a sliding window per pool. Tone:
// Duke-Nukem-via-hee-haw hillbilly bravado, PG-13, punching at the
// apocalypse, never at the family. Hard rule: no em-dashes anywhere in
// game text.
//
// Pool sizing note: `trap` and `chain` fire constantly during play, so they
// carry the deepest pools both here and per cast. `death`/`revive`/`frenzy`
// fire rarely, so smaller pools still read as varied.

type BarkPool = Record<string, string[]>;

const SHARED: BarkPool = {
  levelIntro: [
    "Y'all smell that? Smells like winnin'.",
    "Another county, same varmints.",
    "Hold my jug. Watch this.",
    "This here's family business.",
    "Somebody's gotta clean up this mess.",
    "We ride at dawn. It's dawn somewhere.",
    "Boots on, brain off. Let's go.",
    "I got a plan. It's mostly hollerin'.",
    "Last one standin' buys the pie.",
    "Sun's up, varmints is up, so am I.",
    "Reckon this'll take a minute.",
    "Same song, different porch.",
  ],
  trap: [
    "Gotcha, ya slippery devil!",
    "In the belch ya go!",
    "Caught like a catfish in a kiddie pool!",
    "That's a keeper!",
    "Bag 'em and tag 'em!",
    "Belch up, buttercup!",
    "Sit in there and think about it.",
    "You're pickled now, friend.",
    "Snug as a bug. A dead one.",
    "One for the jar!",
    "Float on, ya ugly thing.",
    "Well that was easy.",
    "Ain't no gettin' out of that.",
    "Wrapped tighter'n a church tamale.",
    "Boop. Yer done.",
    "Say hey to the ceilin' for me.",
    "That's what ya get for existin'.",
    "Round ya go!",
    "Shine's free, sucker!",
    "Get in the burp, we're goin' huntin'.",
  ],
  chain: [
    "That's how we do it in the holler!",
    "Somebody call the county! New record!",
    "Poppin' like bacon grease!",
    "Whole litter in one go!",
    "Grandpa taught me that one!",
    "Now THAT'S a string of 'em!",
    "Domino county, population you!",
    "Poppin' off like Fourth of July!",
    "Chain gang! Get it? CHAIN gang!",
    "Down the line, boys!",
    "That's a whole dang family reunion!",
    "Sounded like popcorn. Smelled worse.",
    "Y'all came in a bunch, ya leave in a bunch.",
    "I could do this all Tuesday.",
    "Somebody write that one down!",
    "Combo? In THIS economy?",
  ],
  frenzy: [
    "Now we're cookin' with lard!",
    "Hold onto yer overalls!",
    "It's HOLLERIN' time!",
    "Time to get UGLY!",
    "YEEHAW, baby!",
    "Somebody's about to have a BAD day!",
    "Turn it up 'til somethin' breaks!",
    "I have become the county's problem!",
    "Full send, no brakes, no regrets!",
    "Y'all shoulda stayed home!",
  ],
  death: [
    "Tell my hound... he's a good boy...",
    "I regret... most of it...",
    "Ain't the worst Tuesday I've had.",
    "Bury me with my banjo...",
    "I'm comin', Grandma... wait, no I ain't!",
    "Well. That's inconvenient.",
    "Y'all finish my sandwich...",
    "Tell 'em I looked cool...",
    "Should've took the porch shift...",
    "It's dark. And there's a raccoon.",
  ],
  revive: [
    "Back from the great beyond, baby!",
    "Death said I was too much trouble.",
    "Y'all miss me? Course ya did.",
    "Told ya I'd walk it off!",
    "The Lord said NOT YET.",
    "Popped right outta that thing!",
    "Turns out I'm hard to keep down.",
    "Refunded! Let's go!",
    "That was just a nap with extra steps.",
    "Second wind, third helpin'!",
  ],
  partnerDeath: [
    "NOOO! Well. More snacks for me.",
    "Get up, cuz! We got work!",
    "I'll avenge ya! Right after this level!",
    "Who's gonna drive the truck now?!",
    "That's comin' outta somebody's hide!",
    "Walk it off! WALK IT OFF!",
    "I ain't tellin' Granny. YOU tell Granny.",
  ],
  idle: [
    "We standin' around for a reason?",
    "I could be fishin' right now.",
    "My feet itch. That means trouble. Or socks.",
    "Anybody else hear banjo music?",
    "This the part where somethin' jumps out?",
    "Well I'm bored. Somebody die or somethin'.",
    "Reckon the truck's still runnin'?",
    "I'm gonna need a bigger jug.",
  ],
  bossIntro: [
    "Well ain't you a big'un.",
    "You're about to be a rug.",
    "We eatin' GOOD tonight!",
    "That's the biggest one yet, I reckon.",
    "Hoo boy. That's a lotta varmint.",
    "You get one chance to run. That was it.",
    "Somebody's gonna need a bigger jar.",
  ],
  bossDefeat: [
    "And STAY down!",
    "Somebody get the smoker goin'!",
    "That's for the whole dang county!",
    "Big ones fall LOUDER!",
    "Timber, ya oversized tick!",
    "Put that on the wall!",
    "Well that's a Tuesday sorted.",
  ],
  worldIntro: [
    "New county, new critters, same us.",
    "Y'all lock the truck?",
    "I got a good feelin'. And a rash.",
    "Map says here. Map's been wrong before.",
    "Fresh dirt, fresh varmints.",
    "Smells different. Smells worse.",
  ],
};

const PER_CAST: Record<string, BarkPool> = {
  earl: {
    levelIntro: [
      "Stay sharp, Merle. I mean it.",
      "Plan's simple: belch first, questions never.",
      "Tuned the banjo. Tuned my fury.",
      "Somebody's gotta be the responsible one.",
    ],
    trap: [
      "That's a rest note, sucker.",
      "Bagged, and in key.",
      "One string, one varmint.",
      "Hush now, I'm pickin'.",
      "You're off tempo. And off the field.",
      "Sit in the belch and appreciate the music.",
    ],
    frenzy: [
      "Five strings of DOOM!",
      "This one goes out to the holler!",
      "Encore, varmints!",
      "Play me out, boys!",
    ],
    chain: [
      "Clean pickin'!",
      "That's rhythm, baby!",
      "Four-four time, four-four dead!",
      "Told ya practice pays.",
    ],
    death: [
      "Merle... the banjo's yours... treat her right...",
      "Keep the tempo... without me...",
    ],
    revive: ["Still got all five strings. Let's go."],
    idle: [
      "Practice makes perfect. So does dynamite.",
      "Merle. MERLE. Focus.",
    ],
    bossIntro: ["Big fella's gonna need a slower song."],
  },
  merle: {
    levelIntro: [
      "Earl says be careful. I heard 'be awesome'.",
      "Legally, I ain't liable for none of this.",
      "Twins on a mission, y'all!",
      "Born ready. Raised reckless.",
    ],
    trap: [
      "BOINK! That's the sound it makes!",
      "Got one! GOT ONE! Earl, I got one!",
      "Burp party, population you!",
      "Ooooh, that one's shiny!",
      "I'm keepin' this one as a pet.",
      "Squish. But bouncy.",
    ],
    frenzy: [
      "BOING, suckers!",
      "I'm the FUN twin!",
      "MERLE MODE, baby!",
      "No thoughts. Just bounce.",
    ],
    chain: [
      "Earl! EARL! You seein' this?!",
      "Count 'em and weep!",
      "That was ALL me, by the way!",
      "I meant to do every bit of that!",
    ],
    death: [
      "Earl... I broke yer banjo... years ago... sorry...",
      "Tell Earl it was his idea...",
    ],
    revive: ["Ya can't kill the fun twin!"],
    idle: [
      "What if burps, but BIGGER?",
      "Earl, can I drive next time? Earl?",
    ],
    bossIntro: ["Big things pop the loudest, right? RIGHT?"],
  },
  granny: {
    levelIntro: [
      "Mind yer manners, critters.",
      "I raised twelve young'uns. You lot ain't scary.",
      "Somebody's gettin' switched.",
      "I got church at six. Make it quick.",
    ],
    trap: [
      "In the corner with ya.",
      "Time out, young man.",
      "That's what happens to sassy things.",
      "I've canned tougher'n you.",
      "Straight to the pantry.",
      "Bless yer heart. Now hush.",
    ],
    frenzy: [
      "The GOOD BOOK says GIT!",
      "Repent, varmints!",
      "I got the spirit and a switch!",
      "Sunday's cancelled. Yer whooped.",
    ],
    chain: [
      "Supper's ready, boys!",
      "Like shellin' peas!",
      "Twelve young'uns. This is nothin'.",
      "Set the table, we got plenty!",
    ],
    death: [
      "Tell the still... I loved her most...",
      "Don't let the pie burn...",
    ],
    revive: ["Nap's over. Back to work."],
    bossIntro: [
      "I've cooked bigger'n you.",
      "Sit down 'fore I sit ya down.",
    ],
    idle: [
      "In my day, the apocalypse was POLITE.",
      "Stand up straight, all of ya.",
    ],
  },
  cooter: {
    levelIntro: [
      "Fire safety tip: I AM the fire.",
      "Chief Cooter, reportin' for chaos.",
      "This is a controlled burn. Mostly.",
      "Insurance don't cover this. Don't care.",
    ],
    trap: [
      "Cooked and canned!",
      "That's a slow roast, buddy.",
      "Marinatin' time!",
      "Preheatin' the varmint.",
      "Low and slow, just like Daddy taught me.",
      "You're gonna be delicious.",
    ],
    frenzy: [
      "BURN, baby, BURN!",
      "That's 200 proof, sucker!",
      "Everything's kindlin' now!",
      "Fire in the WHOLE dang hole!",
    ],
    chain: [
      "Crispy!",
      "Extra crispy!",
      "Whole batch done at once!",
      "That's a five-alarm holler!",
    ],
    death: [
      "Tell the boys... it was... probably my fault...",
      "Don't... let 'em check the receipts...",
    ],
    revive: ["Ya can't put ME out."],
    idle: [
      "Anybody smell smoke? Aw, that's just me.",
      "This barn looks flammable. Just an observation.",
    ],
    bossIntro: ["Gonna need more lighter fluid."],
  },
  bobbiesue: {
    levelIntro: [
      "Nine years county champ. Ask anybody.",
      "Pull!",
      "I don't miss. I reschedule hits.",
      "Trophy shelf's got one empty spot.",
    ],
    trap: [
      "Called it. Hit it.",
      "Dead center, sweetheart.",
      "That's a ten ring.",
      "Bagged and logged.",
      "Didn't even need to aim. Did anyway.",
      "One shot's plenty.",
    ],
    frenzy: [
      "BOTH barrels, sweetheart!",
      "Skeet skeet, varmint!",
      "Reloadin' is for quitters!",
      "Open season, all of it!",
    ],
    chain: [
      "Grouped tighter'n Sunday pews!",
      "Still champ!",
      "Line 'em up, knock 'em down!",
      "That's goin' on the wall.",
    ],
    death: [
      "Recount... I demand... a recount...",
      "Wind... musta been the wind...",
    ],
    revive: ["Champ don't stay down. Champ reloads."],
    idle: [
      "Standin' still makes ya an easy target. Just sayin'.",
      "Y'all shoot like ya got two thumbs.",
    ],
    bossIntro: ["Bigger target. Same result."],
  },
  darlene: {
    levelIntro: [
      "The possums say this level's haunted. Neat.",
      "My babies are HUNGRY today.",
      "Nature is healin'. Violently.",
      "Petunia's got a bad feelin'. Petunia's usually right.",
    ],
    trap: [
      "Dinner's in the belch, babies!",
      "Ooh, this one's got a face.",
      "Nature said no.",
      "Circle of life. You're the small part.",
      "The possums want a word.",
      "Don't worry, it's gonna be quick. Ish.",
    ],
    frenzy: [
      "Sic 'em, babies!",
      "The posse rides!",
      "Every critter in the county, GO!",
      "Mama's mad!",
    ],
    chain: [
      "The possums are SO proud!",
      "Circle of life, real quick!",
      "Whole nest, one bite!",
      "Nature's just efficient like that.",
    ],
    death: [
      "My sweet babies... avenge... mama...",
      "Petunia... you're in charge...",
    ],
    revive: ["The possums dragged me back. Good babies."],
    idle: [
      "Petunia says hi. Petunia's a possum.",
      "Somethin's watchin' us. It's fine. It's mine.",
    ],
    bossIntro: ["Big critter. Still a critter."],
  },
  buford: {
    levelIntro: [
      "Jumped the crick. Can jump this.",
      "Legs don't fail me now!",
      "Buford brings the BOUNCE.",
      "Stretched twice. Feelin' springy.",
    ],
    trap: [
      "Scrubbed!",
      "In the wash ya go!",
      "Rinse cycle, varmint.",
      "Hop, bop, and mop.",
      "You needed a bath anyhow.",
      "Bounced right into it!",
    ],
    frenzy: [
      "SCRUB-A-DUB, ya filthy animals!",
      "Washboard justice!",
      "Suds for EVERYBODY!",
      "Laundry day, apocalypse edition!",
    ],
    chain: [
      "Cleaned 'em out!",
      "Spotless!",
      "Whole load done!",
      "That's a full hamper right there!",
    ],
    death: [
      "Shoulda... stretched... first...",
      "Tell 'em... I stuck the landin'...",
    ],
    revive: ["Bounced back. Literally."],
    hook: [
      "Fish on!",
      "Reel 'em in, boys!",
      "That there's a keeper!",
      "Cast and blast!",
      "Got a bite!",
      "Catch and release, varmint!",
    ],
    idle: [
      "Reckon I could jump that? Reckon I could.",
      "My knees got about six good hops left.",
    ],
    bossIntro: ["Big ones just got more to land on."],
  },
  zeke: {
    levelIntro: [
      "Storm's comin'. It's me. I'm the storm.",
      "Six strikes and I'm STILL tickin'.",
      "The sky and me got an arrangement.",
      "Metal plate's actin' up. Good sign.",
    ],
    trap: [
      "Grounded, sucker.",
      "That's a shockin' development.",
      "Static cling, varmint style.",
      "Feel that? Course ya did.",
      "Sparked and bagged.",
      "The sky sends its regards.",
    ],
    frenzy: [
      "LIGHTNIN' LOOSE!",
      "Feel the tingle, boys!",
      "Sky's open for business!",
      "Strike SEVEN, comin' up!",
    ],
    chain: [
      "Thunderstruck 'em!",
      "Zap zap zap!",
      "Conducted the whole dang choir!",
      "Current went right down the line!",
    ],
    death: [
      "Seventh strike... always knew... it'd be pretty...",
      "Tell the sky... we're square...",
    ],
    revive: ["Jump started. Let's ride."],
    idle: [
      "My knee says rain. My other knee says RUN.",
      "Hair's standin' up. That's either fear or weather.",
    ],
    bossIntro: ["Big things attract lightnin'. Convenient."],
  },
};

// Rotation state per pool key. Presentation only, never fed back into the
// sim, so plain Math.random is fine here.
const recent = new Map<string, string[]>();

export function pickBark(castId: string, trigger: string): string | null {
  const own = PER_CAST[castId]?.[trigger] ?? [];
  const shared = SHARED[trigger] ?? [];
  // Bias toward the character's own voice by entering their lines twice,
  // then dedupe by TEXT so the doubling never lets a line repeat back to
  // back (which the old index-based dedupe allowed).
  const weighted = [...own, ...own, ...shared];
  if (weighted.length === 0) return null;
  const distinct = new Set(weighted).size;

  const key = `${castId}:${trigger}`;
  const used = recent.get(key) ?? [];
  // Remember roughly half the distinct pool so a line cannot come back
  // around until most of the others have had a turn.
  const window = Math.max(1, Math.min(distinct - 1, Math.floor(distinct / 2)));

  let fresh = weighted.filter((line) => !used.includes(line));
  if (fresh.length === 0) fresh = weighted;
  const line = fresh[Math.floor(Math.random() * fresh.length)];

  recent.set(key, [...used, line].slice(-window));
  return line;
}
