// Original code-authored pixel art: one 16×16 icon per frenzy weapon, two
// shrine relics, and the shrine pedestal. Used on the in-level pedestals and
// blown up 8× on the WEAPON ACQUIRED card. Same conventions as
// sprites-items.ts: ink outline, base + shade + one highlight dot.

import { HI, INK, type PixelSprite } from "./pixelart";

// Granny's Good Book: leather cover, gilt cross, a sliver of pages.
const ICON_GOODBOOK: PixelSprite = {
  palette: { k: INK, b: "#7a3b1e", d: "#4e2410", g: "#f0c040", p: "#f4ead0", w: HI },
  frames: [
    [
      "................",
      "....kkkkkkkkk...",
      "...kbbbbbbbbbk..",
      "..kbbbbgbbbbbdk.",
      "..kbbbbgbbbbbdk.",
      "..kbbgggggbbbdk.",
      "..kbbbbgbbbbbdk.",
      "..kbbbbgbbbbbdk.",
      "..kbbbbbbbbbbdk.",
      "..kbwbbbbbbbbdk.",
      "..kbbbbbbbbbbdk.",
      "..kkkkkkkkkkkkk.",
      "..kpppppppppppk.",
      "..kdkkkkkkkkkdk.",
      "...kkkkkkkkkkk..",
      "................",
    ],
  ],
};

// Twang Wave: a five-string banjo, neck up and to the right.
const ICON_TWANG: PixelSprite = {
  palette: { k: INK, n: "#8a5a2b", d: "#5a381a", s: "#f4e6c0", r: "#c9a24a", w: HI },
  frames: [
    [
      "............kkk.",
      "...........kndk.",
      "..........kndk..",
      ".........kndk...",
      "........kndk....",
      ".......kndk.....",
      "....kkkkndk.....",
      "..kkrrrrrrkk....",
      ".krrssssssrrk...",
      ".krsswsssssrk...",
      ".krssskksssrk...",
      ".krsssskkssrk...",
      ".krsssssssrrk...",
      "..kkrrrrrrkk....",
      "....kkkkkk......",
      "................",
    ],
  ],
};

// Moonshine Jug: XXX on ceramic, corked.
const ICON_JUG: PixelSprite = {
  palette: { k: INK, j: "#dcbd8f", d: "#a5885a", x: "#6b3a1e", c: "#8a6a3a", w: HI },
  frames: [
    [
      "......kkkk......",
      "......kcck......",
      ".....kkjjkk.....",
      "....kjjjjjjk....",
      "...kjjjjjjjdk...",
      "..kjjwjjjjjjdk..",
      "..kjjjjjjjjjdk..",
      "..kjxjxjxjxjdk..",
      "..kjjxjxjxjjdk..",
      "..kjxjxjxjxjdk..",
      "..kjjjjjjjjjdk..",
      "..kjjjjjjjjddk..",
      "..kjjjjjjjdddk..",
      "...kjjjjjdddk...",
      "....kkkkkkkk....",
      "................",
    ],
  ],
};

// Ol' Scattergun: side-by-side barrels over a walnut stock.
const ICON_SCATTERGUN: PixelSprite = {
  palette: { k: INK, m: "#6a6a72", s: "#9a9aa4", b: "#7a3b1e", d: "#4e2410", w: HI },
  frames: [
    [
      "................",
      "................",
      "................",
      "..kkkkkkkkkkkkk.",
      ".kssssssssssssmk",
      ".kmmmmmmmmmmmmmk",
      ".kssssssssssssmk",
      "..kkkkkkkkkkkkk.",
      "..kbbkk.........",
      ".kbbbbk.........",
      ".kbbbddk........",
      "kbbbdddk........",
      "kbbddddk........",
      "kdddddk.........",
      ".kkkkk..........",
      "................",
    ],
  ],
};

// Possum Posse: a possum mug, pink ears, beady eyes.
const ICON_POSSUM: PixelSprite = {
  palette: { k: INK, g: "#9a9a96", l: "#c8c8c2", p: "#f0a0a8", w: HI },
  frames: [
    [
      "................",
      "..kk........kk..",
      ".kppk......kppk.",
      ".kpggk....kggpk.",
      "..kgglkkkklggk..",
      ".kgllllllllllgk.",
      ".kgllllllllllgk.",
      ".kglkkllllkklgk.",
      ".kglkwkllkwklgk.",
      ".kgllllllllllgk.",
      ".kglllllkllllgk.",
      "..kglllkpkllgk..",
      "..kkgllkkkllgkk.",
      "....kkgllllgkk..",
      "......kkkkkk....",
      "................",
    ],
  ],
};

// Jaw Harp Boinger: brass frame, steel tongue.
const ICON_JAWHARP: PixelSprite = {
  palette: { k: INK, b: "#c9a24a", d: "#8a6a2a", s: "#d8d8e0", w: HI },
  frames: [
    [
      "................",
      "......kkkk......",
      "....kkbbbbkk....",
      "...kbbddddbbk...",
      "..kbbk....kbbk..",
      "..kbk..kk..kbk..",
      ".kbbk..ks..kbbk.",
      ".kbk...ks...kbk.",
      ".kbk...ks...kbk.",
      ".kbk...ks...kbk.",
      ".kdk...ks...kdk.",
      ".kdk...ks...kdk.",
      ".kdk...kk...kdk.",
      "..kk...ks....kk.",
      ".......ks.......",
      ".......kk.......",
    ],
  ],
};

// Washboard Scrub: pine frame, corrugated tin.
const ICON_WASHBOARD: PixelSprite = {
  palette: { k: INK, b: "#8a5a2b", d: "#5a381a", m: "#a8b0b8", s: "#d8e0e8", w: HI },
  frames: [
    [
      "..kkkkkkkkkkkk..",
      ".kbbbbbbbbbbbbk.",
      ".kbkkkkkkkkkkbk.",
      ".kbkssssssssdbk.",
      ".kbkmmmmmmmmdbk.",
      ".kbkssssssssdbk.",
      ".kbkmmmmmmmmdbk.",
      ".kbkssssssssdbk.",
      ".kbkmmmmmmmmdbk.",
      ".kbkssssssssdbk.",
      ".kbkmmmmmmmmdbk.",
      ".kbkkkkkkkkkkbk.",
      ".kbbbbbbbbbbddk.",
      ".kbbbbbbbbbdddk.",
      ".kkkkkkkkkkkkkk.",
      "................",
    ],
  ],
};

// Chicken Coop: one hen, mid-strut.
const ICON_CHICKEN: PixelSprite = {
  palette: { k: INK, f: "#f4f0e0", s: "#c8c0a8", r: "#e03030", y: "#f0b030", w: HI },
  frames: [
    [
      "................",
      "......krk.......",
      ".....krrk.......",
      "....kkffkk......",
      "...kffwffkk.....",
      "...kffkffkyk....",
      "...kfffffkk.....",
      "..kkrkffffkkk...",
      ".kffffffffffk...",
      "kfffffffffffsk..",
      "kfffffffffffsk..",
      ".kffffffffffsk..",
      "..kkfffffffsk...",
      "....kkkkkkk.....",
      "......kyky......",
      ".....kykyk......",
    ],
  ],
};

// Spittoon Special: brass cuspidor, a ring of chaw at the lip.
const ICON_SPITTOON: PixelSprite = {
  palette: { k: INK, b: "#c9a24a", d: "#8a6a2a", h: "#f0dc90", g: "#6a7a3a", w: HI },
  frames: [
    [
      "................",
      "...kkkkkkkkkk...",
      "..kbbbbbbbbbbk..",
      ".kbhbbbbbbbbbdk.",
      ".kkkkggggggkkkk.",
      "....kbbbbbbdk...",
      "....kbhbbbbdk...",
      "....kbbbbbbdk...",
      "...kbbbbbbbbdk..",
      "..kbbhbbbbbbddk.",
      ".kbbbbbbbbbbdddk",
      ".kbbbbbbbbbbdddk",
      ".kbbbbbbbbbbdddk",
      "..kbbbbbbbbdddk.",
      "...kkkkkkkkkkk..",
      "................",
    ],
  ],
};

// Lightnin' Rod: the bolt itself.
const ICON_LIGHTNIN: PixelSprite = {
  palette: { k: INK, y: "#fff060", o: "#f0a020", w: HI },
  frames: [
    [
      "........kkkk....",
      ".......kyyyyk...",
      "......kyyyyok...",
      ".....kyyyyok....",
      "....kyyyyok.....",
      "...kyyyyokkkk...",
      "..kyyyyyyyyyok..",
      "..kkkkkyyyyok...",
      "......kyyyok....",
      ".....kyyyok.....",
      "....kyyyok......",
      "...kyyyok.......",
      "..kyyyok........",
      "..kyyok.........",
      "..kyok..........",
      "..kk............",
    ],
  ],
};

// Cousin Eddie: trucker cap, three-day stubble, the grin.
const ICON_COUSIN: PixelSprite = {
  palette: { k: INK, c: "#d83030", n: "#f4f0e0", s: "#e8b890", d: "#c08860", t: "#3a2a1a", w: HI },
  frames: [
    [
      "....kkkkkkkk....",
      "...kccccccccck..",
      "..kcccnnnnnnckk.",
      "..kccnnnnnnnnckk",
      "..kkkkkkkkkkkkkk",
      "...ksssssssssk..",
      "...kskssssksdk..",
      "...kskwsskwsdk..",
      "...ksssssssssk..",
      "...kssskksssdk..",
      "...kssssssssdk..",
      "...kstkkkkktdk..",
      "...ksttkkkttdk..",
      "....ktttttttk...",
      ".....kkkkkkk....",
      "................",
    ],
  ],
};

// Hound Dawg: floppy ears, wet nose, tongue out.
const ICON_HOUND: PixelSprite = {
  palette: { k: INK, b: "#a86a3a", d: "#7a4a24", l: "#d8a878", r: "#e06060", w: HI },
  frames: [
    [
      "................",
      "..kkk......kkk..",
      ".kbbbkkkkkkbbbk.",
      ".kbbbbbbbbbbbbk.",
      ".kbdbbbbbbbbdbk.",
      ".kbdbkbbbbkbdbk.",
      ".kbdbkwbbkwbdbk.",
      ".kbdbbbbbbbbdbk.",
      ".kbdbbllllbbdbk.",
      ".kbdbllkkllbdbk.",
      ".kkdbllkkllbdkk.",
      "...kblllllllbk..",
      "...kkllllllkk...",
      ".....kkrrkk.....",
      "......krrk......",
      ".......kk.......",
    ],
  ],
};

// The Hootenanny: a gold star on a banner. Every weapon up a level.
const ICON_HOOTENANNY: PixelSprite = {
  palette: { k: INK, g: "#f0c040", d: "#b08020", h: "#fff4b0", w: HI },
  frames: [
    [
      "................",
      ".......kk.......",
      "......kggk......",
      "......kghk......",
      ".....kgggdk.....",
      "kkkkkkgggdkkkkkk",
      "kggggggggggggggk",
      ".kdgggggggggggk.",
      "..kdggggggggdk..",
      "...kdggggggdk...",
      "...kgggkkgggk...",
      "..kggggk.kgggdk.",
      "..kggk...kkggdk.",
      ".kgdk......kgdk.",
      ".kkk........kkk.",
      "................",
    ],
  ],
};

// The Forbidden Still: copper pot, cap, condenser arm, fire under it.
const ICON_FORBIDDENSTILL: PixelSprite = {
  palette: { k: INK, c: "#c87a3a", d: "#8a4a1e", h: "#f0b070", m: "#6a6a72", f: "#f0a020", w: HI },
  frames: [
    [
      "......kkkk......",
      ".....kchhck.....",
      "....kkcccckk....",
      "....kcccccckkkk.",
      "....kccccckmmmk.",
      "...kkccccckkkmk.",
      "..kchccccccdkmk.",
      ".kchcccccccdkkk.",
      ".kcccccccccddk..",
      ".kcccccccccddk..",
      ".kccccccccdddk..",
      "..kcccccccddk...",
      "...kkkkkkkkk....",
      "..kfkffkfkffk...",
      "...kffkfffkk....",
      "....kkkkkk......",
    ],
  ],
};

// Shrine pedestal: a stone plinth with a gilt cap.
export const SPR_PEDESTAL: PixelSprite = {
  palette: { k: INK, s: "#9a9a8a", d: "#6a6a5e", h: "#c8c8b8", g: "#f0c040" },
  frames: [
    [
      "..kkkkkkkkkkkk..",
      ".kghhhhhhhhhhgk.",
      ".kkkkkkkkkkkkkk.",
      "...kssssssssk...",
      "...kshssssdsk...",
      "...kssssssdsk...",
      "...kssssssdsk...",
      "...kshssssdsk...",
      "...kssssssdsk...",
      "..kssssssssddk..",
      ".kgsssssssssdgk.",
      ".kkkkkkkkkkkkkk.",
    ],
  ],
};

export const WEAPON_ICONS: Record<string, PixelSprite> = {
  goodbook: ICON_GOODBOOK,
  twang: ICON_TWANG,
  jug: ICON_JUG,
  scattergun: ICON_SCATTERGUN,
  possum: ICON_POSSUM,
  jawharp: ICON_JAWHARP,
  washboard: ICON_WASHBOARD,
  chicken: ICON_CHICKEN,
  spittoon: ICON_SPITTOON,
  lightnin: ICON_LIGHTNIN,
  cousin: ICON_COUSIN,
  hound: ICON_HOUND,
};

export const RELIC_ICONS: Record<string, PixelSprite> = {
  hootenanny: ICON_HOOTENANNY,
  forbiddenstill: ICON_FORBIDDENSTILL,
};

/** Texture key + sprite for a shrine gift (pedestal + reveal card share it). */
export function giftIcon(gift: { kind: "weapon"; weaponId: string } | { kind: "relic"; relicId: string }): {
  key: string;
  sprite: PixelSprite;
} {
  if (gift.kind === "weapon") {
    return { key: `wi:${gift.weaponId}`, sprite: WEAPON_ICONS[gift.weaponId] ?? ICON_TWANG };
  }
  return { key: `ri:${gift.relicId}`, sprite: RELIC_ICONS[gift.relicId] ?? ICON_HOOTENANNY };
}

// ------------------------------------------------------- dev sanity checks
if (import.meta.env.DEV) {
  const all: Record<string, PixelSprite> = { ...WEAPON_ICONS, ...RELIC_ICONS, pedestal: SPR_PEDESTAL };
  for (const [name, spr] of Object.entries(all)) {
    const w = spr.frames[0][0].length;
    spr.frames[0].forEach((row, y) => {
      if (row.length !== w) {
        console.warn(`[sprites-weapons] ${name} row ${y}: width ${row.length}, expected ${w}`);
      }
      for (const ch of row) {
        if (ch !== "." && ch !== " " && !spr.palette[ch]) {
          console.warn(`[sprites-weapons] ${name} row ${y}: unknown char "${ch}"`);
        }
      }
    });
  }
}
