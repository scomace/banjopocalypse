// Original code-authored pixel art: pickups, special-bubble icons,
// projectiles, and misc items. Same conventions as pixelart.ts: chunky INK
// outline, base + shade + highlight tones, '.' transparent, frames share a
// palette. All designs original, tuned to read at 2x on dark backgrounds.

import { PixelSprite, INK, SPR_MOONPIE, SPR_JAR } from "./pixelart";

// ------------------------------------------------------------------- food
// Keys match FOOD_TIERS names in sim/items.ts.

// Crinkly golden rinds spilling from a torn red bag.
const SPR_PORKRINDS: PixelSprite = {
  palette: {
    k: INK,
    r: "#e8b467", // rind base
    s: "#c9863a", // rind shade
    w: "#fff6d8",
    b: "#c2483a", // bag red
    m: "#7e2b21", // bag shade
  },
  frames: [
    [
      "............",
      "...kk..kk...",
      "..krrkkrsk..",
      ".krwrrsrrrk.",
      ".krsrrrswrk.",
      "kbkrkrrkrkbk",
      "kbwbbbbbbmbk",
      "kbbbkkbbbmbk",
      "kbbbbbbbmmbk",
      ".kbbbbbmmbk.",
      "..kkkkkkkk..",
      "............",
    ],
  ],
};

// Corndog on a stick, mustard squiggle wandering down the batter.
const SPR_CORNDOG: PixelSprite = {
  palette: {
    k: INK,
    c: "#d9913c", // batter
    d: "#a5652a", // batter shade
    m: "#f7d21c", // mustard
    t: "#b08a55", // stick
    w: "#fff6d8",
  },
  frames: [
    [
      "....kkkk....",
      "...kcwcck...",
      "..kcwcccdk..",
      "..kmccccdk..",
      "..kcmcccdk..",
      "..kccmccdk..",
      "..kcccmcdk..",
      "..kccccddk..",
      "...kccddk...",
      "....kkkk....",
      ".....ktk....",
      ".....ktk....",
    ],
  ],
};

// Twisted jerky strip, pinched in the middle, suspicious fluffy tail tip.
const SPR_JERKY: PixelSprite = {
  palette: {
    k: INK,
    j: "#a05f2e", // jerky base
    d: "#6e3c1c", // jerky shade
    h: "#cf9a55", // dried edge highlight
    f: "#8f8168", // tail fluff, best not to ask
  },
  frames: [
    [
      "........kk..",
      ".......kffk.",
      "......kfffk.",
      "......kffk..",
      "..kk.kjjk...",
      ".kjjkkjdk...",
      ".kjhjjjdk...",
      "..kjhjjdk...",
      "..kjjhjjk...",
      ".kjjkkjjk...",
      ".kkk..kkk...",
      "............",
    ],
  ],
};

// Pie tin, crimped crust, and one unmistakable pink tail over the edge.
const SPR_POSSUMPIE: PixelSprite = {
  palette: {
    k: INK,
    c: "#d9a15a", // crust
    d: "#a56f32", // crust shade
    z: "#c8ccd4", // tin
    s: "#8a8e99", // tin shade
    p: "#e8b4c8", // possum tail
    w: "#fff6d8",
  },
  frames: [
    [
      "............",
      "............",
      "...kkkkkk...",
      "..kcccccck..",
      ".kcwccccdck.",
      ".kcdcdcdcdk.",
      "kzzzzzzzzzzk",
      ".kzzzzzsszk.",
      "..kkkkkkpk..",
      "........kpk.",
      ".......kppk.",
      "........kk..",
    ],
  ],
};

// A block of butter, battered and fried, on a stick. Peak cuisine. Steam.
const SPR_FRIEDBUTTER: PixelSprite = {
  palette: {
    k: INK,
    g: "#e8a83a", // fried crust
    d: "#b5762a", // crust shade
    w: "#fff6d8",
    v: "#cfe0da", // steam wisp
    t: "#b08a55", // stick
  },
  frames: [
    [
      "...v....v...",
      "..v....v....",
      "...v....v...",
      "..kkkkkkkk..",
      ".kgwggggggk.",
      ".kggwggggdk.",
      ".kgggggggdk.",
      ".kggggggddk.",
      "..kkkkkkkk..",
      ".....ktk....",
      ".....ktk....",
      "............",
    ],
  ],
};

// The tiny golden banjo. Ten thousand points of pure twang.
const SPR_GOLDENBANJO: PixelSprite = {
  palette: {
    k: INK,
    g: "#f2c11e", // gold
    d: "#c08a12", // gold shade
    h: "#f7ecc8", // drum head
    w: "#ffffff", // sparkle
  },
  frames: [
    [
      ".....kkk....",
      "....kgggk.w.",
      "....kkgkk...",
      ".....kgk....",
      ".w...kgk....",
      "....kkgkk...",
      "...kghhhgk..",
      "..kghhhhhgk.",
      "..kghhkhhgk.",
      "..kgdhhhdgk.",
      "...kgdddgk..",
      "....kkkkk...",
    ],
  ],
};

export const FOOD_SPRITES: Record<string, PixelSprite> = {
  porkrinds: SPR_PORKRINDS,
  corndog: SPR_CORNDOG,
  moonpie: SPR_MOONPIE,
  jerky: SPR_JERKY,
  possumpie: SPR_POSSUMPIE,
  friedbutter: SPR_FRIEDBUTTER,
  goldenbanjo: SPR_GOLDENBANJO,
};

// --------------------------------------------------------- special bubbles
// Icons drawn INSIDE drifting special bubbles; the bubble circle itself is
// procedural. Keys match SpecialKind in sim/types.ts. Bright, chunky, small.

// Ceramic jug stamped XXX. The good batch.
const SPR_SPECIAL_MOONSHINE: PixelSprite = {
  palette: {
    k: INK,
    j: "#dcbd8f", // ceramic
    d: "#a5885a", // ceramic shade
    x: "#a32c1e", // XXX stamp
    w: "#fff6d8",
  },
  frames: [
    [
      "....kkkk....",
      "....kjdk....",
      "...kkjjkk...",
      "..kjjjjjjk..",
      ".kjwjjjjjdk.",
      "kjxjxxjxxjxk",
      "kjjxjjxjjxjk",
      "kjxjxxjxxjxk",
      "kjjjjjjjjddk",
      ".kjjjjjjddk.",
      "..kkkkkkkk..",
      "............",
    ],
  ],
};

// Lightning in a jar. Do not shake. Definitely shake.
const SPR_SPECIAL_LIGHTNIN: PixelSprite = {
  palette: {
    k: INK,
    z: "#b8b09a", // zinc lid
    g: "#cfe8dd", // glass
    y: "#ffe93a", // bolt
    d: "#9ab8ac", // glass shade
    w: "#ffffff",
  },
  frames: [
    [
      "............",
      "..kzzzzzzk..",
      "..kzzzzzzk..",
      ".kgggyygggk.",
      ".kggyywgggk.",
      ".kgyyyygggk.",
      ".kggyygggdk.",
      ".kgyyggggdk.",
      ".kggggggddk.",
      "..kkkkkkkk..",
      "............",
      "............",
    ],
  ],
};

// Skunk face, white stripe, green opinion lines.
const SPR_SPECIAL_SKUNK: PixelSprite = {
  palette: {
    k: INK,
    s: "#464650", // fur
    w: "#f8f8f0", // stripe and eye shine
    p: "#e8889a", // nose
    v: "#a8d84a", // stink lines
  },
  frames: [
    [
      ".v...vv...v.",
      "..kk.ww.kk..",
      ".kskkwwkksk.",
      ".ksskwwkssk.",
      "kssskwwksssk",
      "kswskwwkswsk",
      "ksssswwssssk",
      "kssswwwwsssk",
      ".kswwppwwsk.",
      "..kswwwwsk..",
      "...kkkkkk...",
      ".v........v.",
    ],
  ],
};

// Hog face, red eyes, tusks out, zero patience.
const SPR_SPECIAL_HOG: PixelSprite = {
  palette: {
    k: INK,
    h: "#d8897a", // hide
    d: "#a85a4e", // hide shade
    n: "#efab99", // snout
    e: "#ff3a2a", // angry eyes
    w: "#ffffff", // tusks
  },
  frames: [
    [
      "............",
      ".kk......kk.",
      "kdhk....khdk",
      "khhkkkkkkhhk",
      "khhhhhhhhhhk",
      "khkehhhhekhk",
      "khhehhhhehhk",
      "khhhddddhhhk",
      "kwhknnnnkhwk",
      ".khnknnknhk.",
      "..khnnnnhk..",
      "...kkkkkk...",
    ],
  ],
};

// Glowing praying hands. Somebody up yonder likes you.
const SPR_SPECIAL_PRAYER: PixelSprite = {
  palette: {
    k: INK,
    h: "#f5d9a8", // hands
    d: "#cba36a", // hand shade
    y: "#ffe93a", // holy glow
    w: "#ffffff",
  },
  frames: [
    [
      ".....yy.....",
      "..y..kk..y..",
      "....khhk....",
      "...khhhhk...",
      "...khwhhk...",
      "..khhhhhhk..",
      "..khhkkhhk..",
      ".khhhkkhhhk.",
      ".khhdkkdhhk.",
      "..khhkkhhk..",
      ".y.kkkkkk.y.",
      "............",
    ],
  ],
};

export const SPECIAL_SPRITES: Record<string, PixelSprite> = {
  moonshine: SPR_SPECIAL_MOONSHINE,
  lightnin: SPR_SPECIAL_LIGHTNIN,
  skunk: SPR_SPECIAL_SKUNK,
  hog: SPR_SPECIAL_HOG,
  prayer: SPR_SPECIAL_PRAYER,
};

// ------------------------------------------------------------- projectiles
// Keys match ProjectileKind in sim/types.ts (art for the kinds that need
// sprites; pools and rings are procedural).

// Little flying bible, gold cross on the cover, pages flap like wings.
const SPR_PROJ_BOOK: PixelSprite = {
  palette: {
    k: INK,
    r: "#a83a2a", // cover
    p: "#f5ead0", // page wings
    g: "#f2c11e", // gold cross
  },
  frames: [
    [
      "..........",
      ".kp....pk.",
      ".kppkkppk.",
      "..kprrpk..",
      "..krgrrk..",
      "..kgggrk..",
      "..krgrrk..",
      "..krrrrk..",
      "...kkkk...",
      "..........",
    ],
    [
      "..........",
      "..........",
      "kpp....ppk",
      "kppkrrkppk",
      ".kkrgrrkk.",
      "..kgggrk..",
      "..krgrrk..",
      "..krrrrk..",
      "...kkkk...",
      "..........",
    ],
  ],
};

// Thrown jug, tumbling end over end.
const SPR_PROJ_JUG: PixelSprite = {
  palette: {
    k: INK,
    j: "#d9b98a", // ceramic
    d: "#a5885a", // shade
    x: "#a32c1e", // X stamp
    w: "#fff6d8",
  },
  frames: [
    [
      "..........",
      "....kkk...",
      "....kjk...",
      "...kkjkk..",
      "..kjjjjjk.",
      ".kjwjjjjdk",
      ".kjjxjjjdk",
      ".kjjjjjddk",
      "..kkkkkkk.",
      "..........",
    ],
    [
      "..........",
      "......kk..",
      ".....kjjk.",
      "..kkkjjk..",
      ".kjjjjjk..",
      ".kjwjjjdk.",
      ".kjxjjddk.",
      "..kjjjdk..",
      "...kkkk...",
      "..........",
    ],
  ],
};

// One hot ball of buckshot.
const SPR_PROJ_PELLET: PixelSprite = {
  palette: {
    k: INK,
    o: "#ff8a2a",
    y: "#ffe93a",
    w: "#ffffff",
  },
  frames: [
    [
      ".kk.",
      "kywk",
      "koyk",
      ".kk.",
    ],
  ],
};

// Jaw-harp shaped bouncer, gold tongue wagging, squiggle of pure boing.
const SPR_PROJ_BOINGER: PixelSprite = {
  palette: {
    k: INK,
    m: "#c2d0dd", // frame metal
    s: "#7a8a9a", // metal shade
    t: "#f2c11e", // tongue
    v: "#9bc318", // motion squiggle
  },
  frames: [
    [
      "...kkkk...",
      "..kmmmmk..",
      ".kmskksmk.",
      ".kmk..kmk.",
      ".kmkttkmk.",
      ".kskttksk.",
      "...kttk...",
      "....kk....",
      "..v..v..v.",
      "..........",
    ],
    [
      "..........",
      "...kkkk...",
      "..kmmmmk..",
      ".kmskksmk.",
      ".kmkttkmk.",
      ".kskttksk.",
      "..kttk....",
      "..kk......",
      ".v..v..v..",
      "..........",
    ],
  ],
};

// Attack hen, fully airborne, faces LEFT. Frame 1 wing up, frame 2 wing down.
const SPR_PROJ_CHICKEN: PixelSprite = {
  palette: {
    k: INK,
    w: "#f8f4e8", // feathers
    s: "#cfc0a0", // feather shade
    r: "#e84a3a", // comb and wattle
    o: "#f2a01e", // beak and feet
  },
  frames: [
    [
      "...rr.........",
      "..krrk.kkkk...",
      ".kwwwk.kwwwwk.",
      "okwkwk.kwwwwk.",
      "rkwwwkkwwwwwkk",
      ".kwwwwwwwwwskk",
      "..kwwwwwwwsskk",
      "...kwwwwwwssk.",
      "....kkkkkkkk..",
      "......ko..ko..",
      "..............",
      "..............",
    ],
    [
      "...rr.........",
      "..krrk........",
      ".kwwwk........",
      "okwkwk.kkkkk..",
      "rkwwwkkwwwwwkk",
      ".kwwwwwwwwwskk",
      "..kwksssskwskk",
      "...kwkssskwsk.",
      "....kkkkkkkk..",
      ".....ko..ko...",
      "..............",
      "..............",
    ],
  ],
};

// The egg. It is an egg.
const SPR_PROJ_EGG: PixelSprite = {
  palette: {
    k: INK,
    e: "#f5ead0", // shell
    d: "#cbb88a", // shell shade
    w: "#ffffff",
  },
  frames: [
    [
      "........",
      "...kk...",
      "..kwek..",
      ".keweek.",
      ".keeedk.",
      ".keeddk.",
      "..kddk..",
      "...kk...",
    ],
  ],
};

// Brown glob, glistening, wobbling. Best not to think about it.
const SPR_PROJ_SPIT: PixelSprite = {
  palette: {
    k: INK,
    b: "#8a5a2a", // glob
    d: "#5e3a18", // glob shade
    w: "#fff6d8", // shine
  },
  frames: [
    [
      "........",
      "..kkk...",
      ".kbwbk..",
      "kbwbbbk.",
      "kbbbddk.",
      ".kbddk..",
      "..kkk...",
      "........",
    ],
    [
      "........",
      "........",
      "..kkkk..",
      ".kbwbbk.",
      "kbbbbddk",
      ".kbdddk.",
      "..kkkk..",
      "........",
    ],
  ],
};

// Eighth note off a haunted fiddle, rimmed in devil-red glow.
const SPR_PROJ_NOTE: PixelSprite = {
  palette: {
    k: INK,
    n: "#ffe3c0", // note body
    w: "#ffffff",
    r: "#ff2f1f", // devil glow
  },
  frames: [
    [
      ".....kkkk.",
      "....rknnkr",
      ".....knkr.",
      "....rkkr..",
      ".....kr...",
      "...r.k....",
      "..kkkk....",
      ".kwnnnk...",
      "kwnnnnnk.r",
      "knnnnnnkr.",
      ".knnnnkr..",
      "..kkkkr...",
    ],
  ],
};

// Angry spark ball flung by shooter varmints. Flickers.
const SPR_PROJ_ENEMYSHOT: PixelSprite = {
  palette: {
    k: INK,
    o: "#ff8a2a",
    y: "#ffe93a",
    r: "#ff3a2a",
  },
  frames: [
    [
      "r.kk.r",
      ".koyk.",
      "koyyok",
      "koyyok",
      ".koyk.",
      "r.kk.r",
    ],
    [
      "..kk..",
      ".kyok.",
      "koyyok",
      "koyyok",
      ".koyk.",
      "..kk..",
    ],
  ],
};

// Vertical scrub-wave crescent off the washboard. Sudsy justice.
const SPR_PROJ_WASHARC: PixelSprite = {
  palette: {
    k: INK,
    b: "#7ac8e8", // wave
    u: "#3a8ab8", // deep water
    w: "#ffffff", // suds
  },
  frames: [
    [
      "...kk...",
      "..kbbk..",
      ".kbwbk..",
      ".kbwubk.",
      "kbwbuk..",
      "kbwuk...",
      "kbwuk.w.",
      "kbwuk...",
      "kbwbuk..",
      ".kbwubk.",
      ".kbwbk..",
      "..kbbk..",
      "...kk...",
      "........",
    ],
    [
      "........",
      "...kk...",
      "..kbbk..",
      ".kbwbk.w",
      ".kbwubk.",
      "kbwbuk..",
      "kbwuk...",
      "kbwuk...",
      "kbwuk.w.",
      "kbwbuk..",
      ".kbwubk.",
      ".kbwbk..",
      "..kbbk..",
      "...kk...",
    ],
  ],
};

// One segment of a lightning strike, jagged and mean. Flickers.
const SPR_PROJ_BOLT: PixelSprite = {
  palette: {
    k: INK,
    y: "#ffe93a",
    w: "#ffffff",
    o: "#ff8a2a", // hot tip
  },
  frames: [
    [
      "..kyyk..",
      "..kywk..",
      ".kyyk...",
      ".kywk...",
      "kyyk....",
      "kywyk...",
      ".kyyk...",
      ".kywk...",
      "..kyyk..",
      "..kywk..",
      "...kyyk.",
      "..kyyk..",
      "..kywk..",
      ".kyyk...",
      ".kyk....",
      ".ko.....",
    ],
    [
      "..kyyk..",
      "..kwyk..",
      "...kyyk.",
      "...kywk.",
      "....kyyk",
      "...kywyk",
      "...kyyk.",
      "..kywk..",
      "..kyyk..",
      ".kywk...",
      ".kyyk...",
      "..kyyk..",
      "..kywk..",
      "...kyyk.",
      "....kyk.",
      ".....ko.",
    ],
  ],
};

export const PROJECTILE_SPRITES: Record<string, PixelSprite> = {
  book: SPR_PROJ_BOOK,
  jug: SPR_PROJ_JUG,
  pellet: SPR_PROJ_PELLET,
  boinger: SPR_PROJ_BOINGER,
  chicken: SPR_PROJ_CHICKEN,
  egg: SPR_PROJ_EGG,
  spit: SPR_PROJ_SPIT,
  note: SPR_PROJ_NOTE,
  enemyshot: SPR_PROJ_ENEMYSHOT,
  washarc: SPR_PROJ_WASHARC,
  bolt: SPR_PROJ_BOLT,
};

// -------------------------------------------------------------- misc items

// Extra-life jug: ceramic XXX vessel with a heart that beats for you.
// Frame 1 small heart, frame 2 swollen heart. That is the pulse.
const SPR_LIFEJUG: PixelSprite = {
  palette: {
    k: INK,
    j: "#dcbd8f", // ceramic
    d: "#a5885a", // ceramic shade
    r: "#ff4a6a", // heart
    p: "#ff9ab0", // heart shine
    w: "#fff6d8",
  },
  frames: [
    [
      "....kkkk....",
      "....kjdk....",
      "...kkjjkk...",
      "..kjjjjjjk..",
      ".kjwjjjjjdk.",
      "kjjrrjrrjjdk",
      "kjjrrrrrjjdk",
      "kjjjrrrjjjdk",
      "kjjjjrjjjddk",
      ".kjjjjjjddk.",
      "..kkkkkkkk..",
      "............",
    ],
    [
      "....kkkk....",
      "....kjdk....",
      "...kkjjkk...",
      "..kjjjjjjk..",
      ".kjrrjrrjdk.",
      "kjrprrrrrjdk",
      "kjrrrrrrrjdk",
      "kjjrrrrrjjdk",
      "kjjjrrrjjddk",
      ".kjjjrjjddk.",
      "..kkkkkkkk..",
      "............",
    ],
  ],
};

// Empty drifting bubble for YEEHAW letters; renderer draws the letter on top.
const SPR_LETTERBUBBLE: PixelSprite = {
  palette: {
    c: "#8adce8", // bubble rim
    d: "#4a9ab0", // rim shade
    w: "#ffffff", // sheen
  },
  frames: [
    [
      "....cccccc....",
      "..cc......cc..",
      ".c..ww......c.",
      ".c.w........c.",
      "c.w..........c",
      "c............c",
      "c............c",
      "c............c",
      "c............c",
      "c...........dc",
      ".c..........d.",
      ".c..........d.",
      "..cc......dd..",
      "....ccdddd....",
    ],
  ],
};

// Rickety cellar door, horseshoe nailed on for luck, ajar with something
// glowing down there. Frame 2: the glow leans on the door a little harder.
const SPR_SECRETDOOR: PixelSprite = {
  palette: {
    k: INK,
    b: "#8a6a3e", // wood
    d: "#5e4426", // wood shade
    l: "#a8845a", // wood light edge
    z: "#c2c8d0", // horseshoe
    s: "#7a8290", // horseshoe shade
    y: "#ffe93a", // leaking glow
    o: "#ffb52a", // warm glow on door edge
    w: "#fff6d8", // glow core (frame 2)
  },
  frames: [
    [
      "kkkkkkkkkkkkkkkkkkkk",
      "kddddddddddddddyykkk",
      "klbbbdbbbbdbbboyykkk",
      "klbbbdbbbbdbbboykkkk",
      "kzzbbdbbbbdbbboykkkk",
      "klbbbdbbbbdbbboykkkk",
      "klbbzzbbbbzzbboykkkk",
      "klbbzsbbbbszbboykkkk",
      "klbbzzbbbbzzbboykkkk",
      "klbbzsbbbbszbboykkkk",
      "klbbbzzzzzzbbboykkkk",
      "klbbbdbbbbdbbboykkkk",
      "klbbbdbbbbdbbboykkkk",
      "klbbbdbbbbdbbboykkkk",
      "kdddddddddddddoykkkk",
      "klbbbdbbbbdbbboykkkk",
      "klbbbdbbbbdbbboykkkk",
      "klbbbdbbbbdbbboykkkk",
      "kzzbbdbbbbdbbboykkkk",
      "klbbbdbbbbdbbboykkkk",
      "klbbbdbbbbdbbboykkkk",
      "klbbbdbbbbdbbboyykkk",
      "kddddddddddddddyyykk",
      "kkkkkkkkkkkkkkkkkkkk",
    ],
    [
      "kkkkkkkkkkkkkkkkkkkk",
      "kddddddddddddddyyyyk",
      "klbbbdbbbbdbbbowyyyk",
      "klbbbdbbbbdbbbowyykk",
      "kzzbbdbbbbdbbbowyykk",
      "klbbbdbbbbdbbbowyykk",
      "klbbzzbbbbzzbbowyykk",
      "klbbzsbbbbszbbowyykk",
      "klbbzzbbbbzzbbowyykk",
      "klbbzsbbbbszbbowyykk",
      "klbbbzzzzzzbbbowyykk",
      "klbbbdbbbbdbbbowyykk",
      "klbbbdbbbbdbbbowyykk",
      "klbbbdbbbbdbbbowyykk",
      "kdddddddddddddowyykk",
      "klbbbdbbbbdbbbowyykk",
      "klbbbdbbbbdbbbowyykk",
      "klbbbdbbbbdbbbowyykk",
      "kzzbbdbbbbdbbbowyykk",
      "klbbbdbbbbdbbbowyykk",
      "klbbbdbbbbdbbbowyykk",
      "klbbbdbbbbdbbbowyyyk",
      "kddddddddddddddwyyyk",
      "kkkkkkkkkkkkkkkkkkkk",
    ],
  ],
};

// Warp sparkle: frame 1 bursts on the cross, frame 2 on the diagonals.
const SPR_WARPGLOW: PixelSprite = {
  palette: {
    y: "#ffe93a",
    w: "#ffffff",
    c: "#7ae8e8",
    m: "#e87ae8",
  },
  frames: [
    [
      ".....ww.....",
      ".....yy.....",
      ".c...yy...c.",
      ".....yy.....",
      "....wyyw....",
      "wyyyywwyyyyw",
      "wyyyywwyyyyw",
      "....wyyw....",
      ".....yy.....",
      ".m...yy...m.",
      ".....yy.....",
      ".....ww.....",
    ],
    [
      "w..........w",
      ".y........y.",
      "..y..mm..y..",
      "...y....y...",
      "....y..y....",
      ".....ww.....",
      ".....ww.....",
      "....y..y....",
      "...y....y...",
      "..y..cc..y..",
      ".y........y.",
      "w..........w",
    ],
  ],
};

export const MISC_ITEM_SPRITES: Record<string, PixelSprite> = {
  lifejug: SPR_LIFEJUG,
  letterbubble: SPR_LETTERBUBBLE,
  secretdoor: SPR_SECRETDOOR,
  warpglow: SPR_WARPGLOW,
  jar: SPR_JAR,
};

// ------------------------------------------------------- dev sanity checks
// Ragged rows or stray palette chars render as holes; warn loudly in dev.

if (import.meta.env.DEV) {
  const groups: Record<string, Record<string, PixelSprite>> = {
    FOOD_SPRITES,
    SPECIAL_SPRITES,
    PROJECTILE_SPRITES,
    MISC_ITEM_SPRITES,
  };
  for (const [groupName, group] of Object.entries(groups)) {
    for (const [name, spr] of Object.entries(group)) {
      const h = spr.frames[0].length;
      const w = spr.frames[0][0].length;
      for (let f = 0; f < spr.frames.length; f++) {
        const frame = spr.frames[f];
        if (frame.length !== h) {
          console.warn(
            `[sprites-items] ${groupName}.${name} frame ${f}: height ${frame.length}, expected ${h}`,
          );
        }
        for (let y = 0; y < frame.length; y++) {
          const row = frame[y];
          if (row.length !== w) {
            console.warn(
              `[sprites-items] ${groupName}.${name} frame ${f} row ${y}: width ${row.length}, expected ${w}`,
            );
          }
          for (const ch of row) {
            if (ch !== "." && ch !== " " && !spr.palette[ch]) {
              console.warn(
                `[sprites-items] ${groupName}.${name} frame ${f} row ${y}: unknown char "${ch}"`,
              );
            }
          }
        }
      }
    }
  }
}
