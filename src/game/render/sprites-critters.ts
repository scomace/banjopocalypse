// Original critter, boss, and misc pixel art: hand-placed grids in the
// itemsL/itemsR spirit. Chunky ink outlines, 2-3 tones + a bright accent,
// readable silhouettes, personality first. All designs original to
// BANJOPOCALYPSE. Enemies face LEFT; the renderer flips for rightward.

import { INK, SPR_JACKALOPE, SPR_RADPOSSUM, type PixelSprite } from "./pixelart";

// -------------------------------------------------------------- enemies

const cartgator: PixelSprite = {
  palette: {
    k: INK,
    g: "#5e9e4a", // gator hide
    d: "#3f7032", // hide shade
    w: "#f5f0dc", // teeth/eyes
    m: "#9aa4ae", // cart metal
    e: "#20303c", // cart shade
    r: "#3c3c46", // wheels
  },
  frames: [
    [
      "................",
      "..kkkk..........",
      ".kggggk.kkk.....",
      "kgwgwggkgggk....",
      "kggggggggggkk...",
      "kwkwkwgggggggk..",
      ".kkkkkgggddggk..",
      ".kmmmmmmmmmmmk..",
      ".kmemmemmemmek..",
      ".kmmmmmmmmmmmk..",
      "..kmmmmmmmmmk...",
      "...krk....krk...",
      "..krrrk..krrrk..",
      "...krk....krk...",
      "................",
      "................",
    ],
    [
      "................",
      "................",
      "..kkkk..........",
      ".kggggk.kkk.....",
      "kgwgwggkgggk....",
      "kgggggggggggkk..",
      "kwkwkwggggddgk..",
      ".kmmmmmmmmmmmk..",
      ".kmemmemmemmek..",
      ".kmmmmmmmmmmmk..",
      "..kmmmmmmmmmk...",
      "...kkrk..krk....",
      "..krrrk.krrrk...",
      "...krk...krk....",
      "................",
      "................",
    ],
  ],
};

const fanbat: PixelSprite = {
  palette: {
    k: INK,
    b: "#7a5a8e", // bat body
    d: "#54406a", // shade
    m: "#b8bcc2", // fan blade metal
    e: "#ffd84a", // eyes
    w: "#f5f0dc",
  },
  frames: [
    [
      "................",
      "kmmmmk....kmmmmk",
      ".kmmmmk..kmmmmk.",
      "..kmmmmkkmmmmk..",
      "....kkkbbkkk....",
      "....kbbbbbbk....",
      "...kbebbbbebk...",
      "...kbkbbbbkbk...",
      "...kbbwkkwbbk...",
      "....kbbbbbbk....",
      ".....kbddbk.....",
      "......kkkk......",
      "................",
      "................",
      "................",
      "................",
    ],
    [
      "................",
      "..kmmk....kmmk..",
      ".kmmmmk..kmmmmk.",
      "kmmmmmmkkmmmmmmk",
      "....kkkbbkkk....",
      "....kbbbbbbk....",
      "...kbebbbbebk...",
      "...kbkbbbbkbk...",
      "...kbbwkkwbbk...",
      "....kbbbbbbk....",
      ".....kbddbk.....",
      "......kkkk......",
      "................",
      "................",
      "................",
      "................",
    ],
  ],
};

const tweekergecko: PixelSprite = {
  palette: {
    k: INK,
    g: "#8ee83a", // jittery green
    d: "#5aa81e",
    w: "#ffffff",
    e: "#20140a",
    t: "#c8f88a", // belly
  },
  frames: [
    [
      "................",
      "...kkkk.........",
      "..kggggk........",
      ".kgwwgwwk.......",
      ".kgwewewk.......",
      ".kggggggkkkk....",
      ".kgtttggggggk...",
      ".kgttgggggggkk..",
      "..kggggggggggdk.",
      "...kdggggggdk.k.",
      "....kdkkkkdk....",
      "....kgk..kgk....",
      "...kkk..kkk.....",
      "................",
      "................",
      "................",
    ],
    [
      "................",
      "..kkkk..........",
      ".kggggk.........",
      "kgwwgwwk........",
      "kgwewewk........",
      "kggggggkkkk.....",
      "kgtttggggggk....",
      "kgttgggggggkk.k.",
      ".kggggggggggdkk.",
      "..kdggggggdk....",
      "...kdkkkkdk.....",
      "..kgk...kgk.....",
      ".kkk...kkk......",
      "................",
      "................",
      "................",
    ],
  ],
};

const gaswisp: PixelSprite = {
  palette: {
    k: INK,
    v: "#b8e8c8", // vapor
    f: "#8ad8a8", // vapor shade
    s: "#ffd84a", // spark core
    o: "#ff8a30", // spark hot
  },
  frames: [
    [
      "................",
      ".....kkkkk......",
      "...kkvvvvvkk....",
      "..kvvvvvvvvvk...",
      ".kvvfkvvvkfvvk..",
      ".kvvkvvvvvkvvk..",
      "kvvvvvsssvvvvk..",
      "kvvvvssossvvvk..",
      "kvvvvsoosvvvvk..",
      ".kvvvvsssvvvk...",
      ".kfvvvvvvvfk....",
      "..kfvvvvvfk.....",
      "...kkfffkk......",
      ".....kkk........",
      "................",
      "................",
    ],
    [
      "................",
      "....kkkkk.......",
      "..kkvvvvvkk.....",
      ".kvvvvvvvvvk....",
      "kvvfkvvvkfvvk...",
      "kvvkvvvvvkvvk...",
      "kvvvvsssvvvvkk..",
      "kvvvssossvvvvk..",
      "kvvvvsoosvvvvk..",
      ".kvvvssssvvvk...",
      "..kfvvvvvvfk....",
      ".kfvvvvvfk......",
      "..kkfffkk.......",
      "....kkk.........",
      "................",
      "................",
    ],
  ],
};

const corndoghound: PixelSprite = {
  palette: {
    k: INK,
    b: "#d9a24a", // batter
    d: "#a8742e", // batter shade
    m: "#e8c83a", // mustard squiggle
    w: "#f5f0dc",
    e: "#2a1c10",
    n: "#6b4226", // snout/stick
  },
  frames: [
    [
      "................",
      ".kkk............",
      "knnbkkkkkkkkkk..",
      "kbwebbmbbmbbbbk.",
      "kbbbbbbmbbmbbbk.",
      ".kbbbbmbbmbbbdk.",
      "..kddbbbbbbbdk..",
      "...kbk.kbk.kbk..",
      "...knk.knk.knk..",
      "..kkk..kkk.kkk..",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
    ],
    [
      "................",
      ".kkk............",
      "knnbkkkkkkkkkk..",
      "kbwebbmbbmbbbbk.",
      "kbbbbbbmbbmbbbk.",
      ".kbbbbmbbmbbbdk.",
      "..kddbbbbbbbdk..",
      "..kbk..kbk..kbk.",
      "..knk..knk..knk.",
      ".kkk....kkk..kkk",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
    ],
  ],
};

const balloonclown: PixelSprite = {
  palette: {
    k: INK,
    r: "#e85a5a", // balloon red
    d: "#b03838",
    w: "#f5f0dc", // face paint
    b: "#4a90d8", // sad tear
    n: "#ff8a30", // nose
    s: "#c8c8c8", // string
  },
  frames: [
    [
      "................",
      "....kkkkkk......",
      "..kkrrrrrrkk....",
      ".krrwwrrwwrrk...",
      ".krwkwrrwkwrk...",
      "krrwwrrrrwwrrk..",
      "krrrrknnkrrrrk..",
      "krrbrknnkrrrrk..",
      "krrrrrrrrrrrdk..",
      ".krrkwwwwkrrdk..",
      ".krrrkkkkrrdk...",
      "..kkrrrrrrkk....",
      "....kkkkkk......",
      "......ks........",
      ".....ks.........",
      "......ks........",
    ],
    [
      "................",
      "....kkkkkk......",
      "..kkrrrrrrkk....",
      ".krrwwrrwwrrk...",
      ".krwkwrrwkwrk...",
      "krrwwrrrrwwrrk..",
      "krrrrknnkrrrrk..",
      "krrbrknnkrrrrk..",
      "krrrrrrrrrrrdk..",
      ".krrkwwwwkrrdk..",
      ".krrrkkkkrrdk...",
      "..kkrrrrrrkk....",
      "....kkkkkk......",
      "......ks........",
      ".......ks.......",
      "......ks........",
    ],
  ],
};

const skeeter: PixelSprite = {
  palette: {
    k: INK,
    b: "#8a8a5a", // body
    d: "#62623e",
    w: "#d8e8f0", // wings
    e: "#e85a5a", // bloodthirsty eye
    n: "#3a3a2a", // proboscis
  },
  frames: [
    [
      "................",
      "....kwwwwk......",
      "...kwwwwwwk.....",
      "....kwwwwk......",
      "..kkkbbbbkkk....",
      "nnkbebbbbbbk....",
      "..kbbbbbbddk....",
      "...kbbbbbdk.....",
      "....kkkkkk......",
      "....k.k.k.......",
      "...k..k..k......",
      "................",
      "................",
      "................",
      "................",
      "................",
    ],
    [
      "................",
      "................",
      "....kwwwwk......",
      "..kkkbbbbkkkw...",
      "nnkbebbbbbbkw...",
      "..kbbbbbbddk....",
      "...kbbbbbdk.....",
      "....kkkkkk......",
      "...k..k..k......",
      "..k...k...k.....",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
    ],
  ],
};

const snapturtle: PixelSprite = {
  palette: {
    k: INK,
    s: "#8a8a92", // hubcap shell
    h: "#b8bcc2", // hubcap shine
    g: "#6a9a4a", // turtle skin
    d: "#4a7032",
    e: "#ffd84a",
    w: "#f5f0dc",
  },
  frames: [
    [
      "................",
      ".....kkkkkkk....",
      "....khhhhhhsk...",
      "...khshshshssk..",
      "..khhshhhshhssk.",
      "..kshhshshhsssk.",
      "kkksshhhhhsssk..",
      "kgekssssssssk...",
      "kggwkkkkkkkk....",
      "kgggk...........",
      ".kgdgk..kgk.kgk.",
      "..kkgggggdgggdk.",
      "....kkkkkkkkkk..",
      "................",
      "................",
      "................",
    ],
    [
      "................",
      ".....kkkkkkk....",
      "....khhhhhhsk...",
      "...khshshshssk..",
      "..khhshhhshhssk.",
      "..kshhshshhsssk.",
      "kkksshhhhhsssk..",
      "kgekssssssssk...",
      "kggwkkkkkkkk....",
      "kgggk...........",
      ".kgdgk.kgk..kgk.",
      "..kkggggdggggdk.",
      "...kkkkkkkkkkk..",
      "................",
      "................",
      "................",
    ],
  ],
};

const tirefireimp: PixelSprite = {
  palette: {
    k: INK,
    t: "#3a3a42", // tire rubber
    d: "#26262e",
    f: "#ff8a30", // flame
    y: "#ffd84a", // flame hot
    e: "#ffd84a",
  },
  frames: [
    [
      "................",
      "....f..y..f.....",
      "...yf.fyf.fy....",
      "...kfyfffyfk....",
      "..kkttttttkk....",
      ".kttdttttdttk...",
      ".kttkeektettk...",
      "kttdkeekttdttk..",
      "kttttkkttttttk..",
      "kdtttttttttdtk..",
      ".kttkkkkkkttk...",
      "..kkt....tkk....",
      "...kk....kk.....",
      "................",
      "................",
      "................",
    ],
    [
      "................",
      "...y..f..y......",
      "..fy.yfy.yf.....",
      "...kfyfffyfk....",
      "..kkttttttkk....",
      ".kttdttttdttk...",
      ".kttkeektettk...",
      "kttdkeekttdttk..",
      "kttttkkttttttk..",
      "kdtttttttttdtk..",
      ".kttkkkkkkttk...",
      "..kk t...tkk....",
      "..kk......kk....",
      "................",
      "................",
      "................",
    ],
  ],
};

const mufflersnake: PixelSprite = {
  palette: {
    k: INK,
    m: "#9aa4ae", // pipe metal
    d: "#5c6670", // rust shade
    r: "#b06a3a", // rust
    e: "#ffd84a",
    w: "#f5f0dc",
    t: "#e85a5a", // forked tongue
  },
  frames: [
    [
      "................",
      "..kkkk..........",
      ".kmmmmk.........",
      "kmemwemk........",
      "kmmmmmmk........",
      "tkmkkmmkkkkkk...",
      "t.kmmmmmmmmmmk..",
      "...kdmmrmmdmmk..",
      "....kkkkkmmmmk..",
      "..kkmmrmmmmdk...",
      ".kmmmmmmmmkk....",
      ".kdmmrmmdk......",
      "..kkkkkkk.......",
      "................",
      "................",
      "................",
    ],
    [
      "................",
      "..kkkk..........",
      ".kmmmmk.........",
      "kmemwemk........",
      "kmmmmmmk........",
      ".kmkkmmkkkkkk...",
      "t..kmmmmmmmmmk..",
      "t..kdmmrmmdmmk..",
      "....kkkkkmmmmk..",
      "...kkmmrmmmdk...",
      "..kmmmmmmmkk....",
      "..kdmmrmdk......",
      "...kkkkkk.......",
      "................",
      "................",
    ],
  ],
};

const glowslime: PixelSprite = {
  palette: {
    k: INK,
    g: "#5ad88a", // slime
    d: "#38a860",
    n: "#c8ff50", // nucleus
    w: "#eafff0",
  },
  frames: [
    [
      "................",
      "................",
      "....kkkkkkk.....",
      "..kkgggggggkk...",
      ".kgggwggggggkk..",
      ".kggwgggnnggggk.",
      "kgggggnnnnnnggk.",
      "kggggnnnnnnnggk.",
      "kgggggnnnnngggk.",
      "kddgggnnnggggdk.",
      ".kddgggggggddk..",
      "..kkdddddddkk...",
      "....kkkkkkk.....",
      "................",
      "................",
      "................",
    ],
    [
      "................",
      "................",
      "................",
      "...kkkkkkkkk....",
      ".kkgggggggggkk..",
      "kggwggggnnggggk.",
      "kggggnnnnnnnggk.",
      "kgggnnnnnnnnngk.",
      "kggggnnnnnnggdk.",
      "kddggggnnggggdk.",
      "kkddgggggggddkk.",
      ".kkdddddddddkk..",
      "..kkkkkkkkkkk...",
      "................",
      "................",
      "................",
    ],
  ],
};

const glowslime_mini: PixelSprite = {
  palette: {
    k: INK,
    g: "#5ad88a",
    d: "#38a860",
    n: "#c8ff50",
  },
  frames: [
    [
      "..........",
      "...kkkk...",
      ".kkggggkk.",
      "kggnnnggk.",
      "kgnnnnngk.",
      "kggnnnggk.",
      "kdgggggdk.",
      ".kkddddk..",
      "..kkkkk...",
      "..........",
    ],
    [
      "..........",
      "..........",
      "..kkkkkk..",
      "kkggggggkk",
      "kgnnnnnngk",
      "kgnnnnnngk",
      "kdggggggdk",
      "kkddddddkk",
      ".kkkkkkkk.",
      "..........",
    ],
  ],
};

const guvdrone: PixelSprite = {
  palette: {
    k: INK,
    m: "#8a929e", // hull
    d: "#5c6470",
    r: "#e85a5a", // camera eye
    w: "#f5f0dc",
    a: "#3a4a5a", // antenna
    p: "#b8bcc2", // rotor
  },
  frames: [
    [
      "................",
      ".......ka.......",
      ".......ka.......",
      "..ppppkkkkpppp..",
      "....kmmmmmmk....",
      "...kmmmmmmmmk...",
      "..kmmkkkkkmmmk..",
      "..kmkwrrwkmmdk..",
      "..kmkrrrrkmmdk..",
      "..kmmkkkkmmmdk..",
      "...kmmmmmmmdk...",
      "....kkmmmmkk....",
      ".....k....k.....",
      "................",
      "................",
      "................",
    ],
    [
      "................",
      ".......ka.......",
      ".......ka.......",
      "..k..pkkkkp..k..",
      "....kmmmmmmk....",
      "...kmmmmmmmmk...",
      "..kmmkkkkkmmmk..",
      "..kmkwrrwkmmdk..",
      "..kmkrrrrkmmdk..",
      "..kmmkkkkmmmdk..",
      "...kmmmmmmmdk...",
      "....kkmmmmkk....",
      ".....k....k.....",
      "................",
      "................",
      "................",
    ],
  ],
};

const cyclonechick: PixelSprite = {
  palette: {
    k: INK,
    y: "#ffd84a", // chick
    o: "#ff8a30", // beak
    w: "#f5f0dc", // wind swirl
    g: "#c8d8e0", // swirl shade
    e: "#2a1c10",
  },
  frames: [
    [
      "................",
      "..wwww..........",
      ".wggggww........",
      "w..kkkk.gw......",
      "g.kyyyyk.w......",
      "wkyeyyeyk.g.....",
      "wkyyyyyykw......",
      "okyyyyyyk.w.....",
      ".kyyyyyyg.......",
      "w.kyyyykw.......",
      ".g.kkkk.g.......",
      "..wgwgww........",
      "................",
      "................",
      "................",
      "................",
    ],
    [
      "................",
      "...wwww.........",
      "..gggwww........",
      ".g.kkkk..w......",
      "w.kyyyyk.g......",
      ".kyeyyeykw......",
      "gkyyyyyyk.......",
      "okyyyyyykg......",
      ".kyyyyyy.w......",
      ".gkyyyyk........",
      "w..kkkk.w.......",
      "..wwgwgg........",
      "................",
      "................",
      "................",
      "................",
    ],
  ],
};

const flyincow: PixelSprite = {
  palette: {
    k: INK,
    w: "#f5f0dc", // hide
    b: "#3a3a42", // patches
    p: "#e8b4c8", // udder/nose
    e: "#2a1c10",
    f: "#d8e8f0", // wings
  },
  frames: [
    [
      "................",
      "..kff.....ffk...",
      ".kfffk...kfffk..",
      "..kkkkkkkkkkk...",
      ".kkwwwbbwwwwkk..",
      "kwewwwbbwwbbwwk.",
      "kwwwwwwwwwbbwwk.",
      "kpwpwwwwwwwwwdk.",
      "kppppwwbbwwwwdk.",
      ".kkkwwwbbwwwdk..",
      "...kwwwwwwwdk...",
      "....kpppkkkk....",
      "....kkkk........",
      "................",
      "................",
      "................",
    ],
    [
      "................",
      "..kfffk.kfffk...",
      "...kfk...kfk....",
      "..kkkkkkkkkkk...",
      ".kkwwwbbwwwwkk..",
      "kwewwwbbwwbbwwk.",
      "kwwwwwwwwwbbwwk.",
      "kpwpwwwwwwwwwdk.",
      "kppppwwbbwwwwdk.",
      ".kkkwwwbbwwwdk..",
      "...kwwwwwwwdk...",
      "....kpppkkkk....",
      "....kkkk........",
      "................",
      "................",
      "................",
    ],
  ],
};

const impfiddler: PixelSprite = {
  palette: {
    k: INK,
    r: "#d84a3a", // imp skin
    d: "#a83028",
    h: "#6b1e14", // horns
    f: "#8a5a32", // fiddle
    s: "#e8c83a", // strings/bow
    e: "#ffd84a",
    w: "#f5f0dc",
  },
  frames: [
    [
      "................",
      ".kh......hk.....",
      "..khkkkkhk......",
      "..krrrrrrk......",
      ".krerkkrerk.....",
      ".krrrrrrrrk.....",
      "..krwwwwrk......",
      "...krrrrkkkk....",
      "..krrrrkffffk...",
      ".krdrrkfsfsfk...",
      ".krrrrkffffsk...",
      "..kdrrkfsfsfk...",
      "...kkkkffffk....",
      "....krk.kkk.....",
      "...kkk.kkk......",
      "................",
    ],
    [
      "................",
      ".kh......hk.....",
      "..khkkkkhk......",
      "..krrrrrrk......",
      ".krerkkrerk.....",
      ".krrrrrrrrk.....",
      "..krwwwwrk..s...",
      "...krrrrkkks....",
      "..krrrrkffsfk...",
      ".krdrrkfssfsk...",
      ".krrrrkfsffsk...",
      "..kdrrkssfsfk...",
      "...kkkkffffk....",
      "...krk..kkk.....",
      "..kkk..kkk......",
      "................",
    ],
  ],
};

const hellhound: PixelSprite = {
  palette: {
    k: INK,
    b: "#2e2228", // dark hide
    d: "#1c1418",
    f: "#ff8a30", // flame mane
    y: "#ffd84a",
    e: "#ff5030", // burning eyes
    w: "#f5f0dc", // fangs
  },
  frames: [
    [
      "................",
      "....fy..f.......",
      "...kfykfyk......",
      "..kkbbbbbkk.....",
      ".kbebbbbebfk....",
      ".kbbbbbbbbyfk...",
      "kbwkwbbbbbbfk...",
      "kbbbbbbbbbbdk...",
      ".kkbbbbbbbbbdk..",
      "...kbbk..kbbk...",
      "...kbk....kbk...",
      "..kkk....kkk....",
      "................",
      "................",
      "................",
      "................",
    ],
    [
      "................",
      "...f..yf........",
      "..kyfkfyk.......",
      "..kkbbbbbkk.....",
      ".kbebbbbebfk....",
      ".kbbbbbbbbyfk...",
      "kbwkwbbbbbbfk...",
      "kbbbbbbbbbbdk...",
      ".kkbbbbbbbbbdk..",
      "..kbbk...kbbk...",
      "..kbk...kbk.....",
      ".kkk...kkk......",
      "................",
      "................",
      "................",
      "................",
    ],
  ],
};

export const CRITTER_SPRITES: Record<string, PixelSprite> = {
  radpossum: SPR_RADPOSSUM,
  jackalope: SPR_JACKALOPE,
  cartgator,
  fanbat,
  tweekergecko,
  gaswisp,
  corndoghound,
  balloonclown,
  skeeter,
  snapturtle,
  tirefireimp,
  mufflersnake,
  glowslime,
  glowslime_mini,
  guvdrone,
  cyclonechick,
  flyincow,
  impfiddler,
  hellhound,
};

// ---------------------------------------------------------------- bosses

const bertha: PixelSprite = {
  scale: 4,
  palette: {
    k: INK,
    p: "#e8a0b4", // sow pink
    d: "#c07890", // shade
    s: "#f8c8d4", // snout
    c: "#8ad0e8", // curlers
    e: "#2a1c10",
    w: "#f5f0dc",
    r: "#e85a5a", // angry brow
  },
  frames: [
    [
      "........kcck....kcck........",
      ".......kcccck..kcccck.......",
      "....kkkccccckkkccccckkk.....",
      "...kpppkcckpppkcckpppppk....",
      "..kpppppppppppppppppppppk...",
      ".kpppkkeppppppppekkpppppdk..",
      ".kppkrekppppppkerkpppppddk..",
      "kpppppppppsssspppppppppddk..",
      "kppppppksssssssskpppppppdk..",
      "kpppppksskssskssskpppppddk..",
      "kdppppksssssssssskppppppdk..",
      "kdpppppkssssssskpppppppddk..",
      "kddpppppkkkkkkkpppppppdddk..",
      ".kddpppwwkppppppwwkppdddk...",
      ".kkddppwwkppppppwwkpdddkk...",
      "..kkddddddddddddddddddkk....",
      "....kkppk..kppk..kppkk......",
      "....kppk....kppk..kppk......",
      "...kkkk....kkkk..kkkk.......",
      "............................",
    ],
    [
      "........kcck....kcck........",
      ".......kcccck..kcccck.......",
      "....kkkccccckkkccccckkk.....",
      "...kpppkcckpppkcckpppppk....",
      "..kpppppppppppppppppppppk...",
      ".kpppkkeppppppppekkpppppdk..",
      ".kppkrekppppppkerkpppppddk..",
      "kpppppppppsssspppppppppddk..",
      "kppppppksssssssskpppppppdk..",
      "kpppppkssksssksssskppppddk..",
      "kdppppksssssssssskppppppdk..",
      "kdpppppkssssssskpppppppddk..",
      "kddpppppkkkkkkkpppppppdddk..",
      ".kddpppwwkppppppwwkppdddk...",
      ".kkddppwwkppppppwwkpdddkk...",
      "..kkddddddddddddddddddkk....",
      "....kppk....kppk..kppk......",
      "....kkppk..kppk..kppkk......",
      "....kkkk...kkkk...kkkk......",
      "............................",
    ],
  ],
};

const catfish: PixelSprite = {
  scale: 4,
  palette: {
    k: INK,
    g: "#6a8a9a", // catfish grey-blue
    d: "#48626e",
    b: "#c8d8e0", // belly
    e: "#ffd84a",
    w: "#f5f0dc",
    t: "#2e2228", // string tie
    s: "#8a929e", // whiskers
  },
  frames: [
    [
      "............................",
      "sss...kkkkkkkkkk......sss...",
      "...ss.kggggggggkk..ss.......",
      "..kkkggggggggggggkkk........",
      ".kgggekggggggggkegggk.......",
      "kggggkkggggggggkkgggdk......",
      "kgggggggggggggggggggdk......",
      "kgbbbbbbbbbbbbbbbbbddk......",
      "kgbkkkkkkkkkkkkkkbbddk......",
      "kgbwwwwwwwwwwwwwkbdddk......",
      ".kbbbbbbbbbbbbbbbdddk.......",
      "..kktkkkkkkkkkktkkk.........",
      "....kttk....kttk............",
      ".....kttkkkkttk.............",
      "......kkttttkk..............",
      "........kkkk................",
      "............................",
      "............................",
    ],
    [
      "............................",
      "..sss.kkkkkkkkkk...sss......",
      "ss....kggggggggkk.....ss....",
      "..kkkggggggggggggkkk........",
      ".kgggekggggggggkegggk.......",
      "kggggkkggggggggkkgggdk......",
      "kgggggggggggggggggggdk......",
      "kgbbbbbbbbbbbbbbbbbddk......",
      "kgbkkkkkkkkkkkkkkbbddk......",
      "kgbwwwwwwwwwwwwwkbdddk......",
      ".kbbbbbbbbbbbbbbbdddk.......",
      "..kktkkkkkkkkkktkkk.........",
      "....kttk....kttk............",
      ".....kttkkkkttk.............",
      "......kkttttkk..............",
      "........kkkk................",
      "............................",
      "............................",
    ],
  ],
};

const chemist: PixelSprite = {
  scale: 4,
  palette: {
    k: INK,
    g: "#8a8a92", // raccoon grey
    d: "#5c5c66",
    b: "#2e2228", // mask/bands
    l: "#a8e83a", // goggle lenses
    w: "#f5f0dc", // lab coat
    c: "#d8d8d8", // coat shade
    n: "#3a4a3a", // filter
  },
  frames: [
    [
      "............................",
      ".....kkkk......kkkk.........",
      "....kggggk....kggggk........",
      "....kgbbgkkkkkkgbbgk........",
      ".....kgggggggggggk..........",
      "....kgbbkgggggkbbgk.........",
      "...kgbllbkgggkbllbgk........",
      "...kgbllbkgggkbllbgk........",
      "....kgbbkgggggkbbgk.........",
      ".....kggknnnnkggdk..........",
      "......kgknnnnkgdk...........",
      ".....kkkknnnnkkkk...........",
      "....kwwwkkkkkkwwwk..........",
      "...kwwwwwwwwwwwwwwk.........",
      "..kwwkwwwwwwwwwwkwwk........",
      "..kwwkwwwccwwwwwkwwk........",
      "..kwwkwwwccwwwwwkwwk........",
      "..kcckwwwwwwwwwwkcck........",
      "...kkkccwwwwwwcckkk.........",
      ".....kkkkkkkkkkkk...........",
      "............................",
    ],
    [
      "............................",
      ".....kkkk......kkkk.........",
      "....kggggk....kggggk........",
      "....kgbbgkkkkkkgbbgk........",
      ".....kgggggggggggk..........",
      "....kgbbkgggggkbbgk.........",
      "...kgbllbkgggkbllbgk........",
      "...kgbllbkgggkbllbgk........",
      "....kgbbkgggggkbbgk.........",
      ".....kggknnnnkggdk..........",
      "......kgknnnnkgdk...........",
      ".....kkkknnnnkkkk...........",
      "....kwwwkkkkkkwwwk..........",
      "...kwwwwwwwwwwwwwwk.........",
      "..kwwkwwwwwwwwwwkwwk........",
      "..kwwkwwccwwwwwwkwwk........",
      "..kwwkwwccwwwwwwkwwk........",
      "..kcckwwwwwwwwwwkcck........",
      "...kkkccwwwwwwcckkk.........",
      ".....kkkkkkkkkkkk...........",
      "............................",
    ],
  ],
};

const kernel: PixelSprite = {
  scale: 4,
  palette: {
    k: INK,
    y: "#f0d040", // kernel gold
    d: "#c8a020",
    w: "#fff8e0", // popped fluff
    c: "#f8f0d8",
    e: "#2a1c10",
    r: "#e85a5a", // grin
  },
  frames: [
    [
      "............................",
      "........kkkkkkkk............",
      "......kkwwwwwwwwkk..........",
      ".....kwwcwwwwwwcwwk.........",
      "....kwwwwwwccwwwwwwk........",
      "....kwcwwwwccwwwwcwk........",
      ".....kkwwwwwwwwwwkk.........",
      ".....kkkyyyyyyykkk..........",
      "....kyyyyyyyyyyyyk..........",
      "...kyyekyyyyyykeyyk.........",
      "..kyyykkyyyyyykkyyyk........",
      "..kyyyyyyyyyyyyyyydk........",
      "..kyyrrrrrrrrrrryydk........",
      "..kyyrkwkwkwkwkryddk........",
      "...kyyrrrrrrrrryyddk........",
      "...kdyyyyyyyyyyyddk.........",
      "....kddyyyyyyyddk...........",
      ".....kkddddddkkk............",
      ".......kkkkkkk..............",
      "............................",
    ],
    [
      "............................",
      "........kkkkkkkk............",
      "......kkwwwwwwwwkk..........",
      ".....kwwcwwwwwwcwwk.........",
      "....kwwwwccwwwwwwwwk........",
      "....kwcwwwccwwwwwcwk........",
      ".....kkwwwwwwwwwwkk.........",
      ".....kkkyyyyyyykkk..........",
      "....kyyyyyyyyyyyyk..........",
      "...kyyekyyyyyykeyyk.........",
      "..kyyykkyyyyyykkyyyk........",
      "..kyyyyyyyyyyyyyyydk........",
      "..kyyrrrrrrrrrrryydk........",
      "..kyyrwkwkwkwkwryddk........",
      "...kyyrrrrrrrrryyddk........",
      "...kdyyyyyyyyyyyddk.........",
      "....kddyyyyyyyddk...........",
      ".....kkddddddkkk............",
      ".......kkkkkkk..............",
      "............................",
    ],
  ],
};

const swampthang: PixelSprite = {
  scale: 4,
  palette: {
    k: INK,
    g: "#4a7032", // vine mass
    d: "#324e20",
    m: "#6a9a4a", // moss highlight
    e: "#ffd84a", // glowing eyes
    v: "#38581e", // hanging vines
  },
  frames: [
    [
      "............................",
      ".....kkk....kkkk............",
      "...kkgggkkkggggmkk..........",
      "..kgggmgggggggggggk.........",
      ".kggmgggggggggmggggk........",
      "kgggggekkgggggkkeggdk.......",
      "kggmggekkgggggkkegggk.......",
      "kgggggggggggggggggddk.......",
      ".kgggkkkkkkkkkkkggdk........",
      "kggggkgdgdgdgdgkgggdk.......",
      "kgmggkkkkkkkkkkkggddk.......",
      "kggggggggggggggggdddk.......",
      ".kvkggvkggggkvggkvdk........",
      ".kv.kgv.kggk.kv.kvk.........",
      ".kv..kv..kk...v..v..........",
      "..v...v.......v..v..........",
      "............................",
      "............................",
    ],
    [
      "............................",
      ".....kkk....kkkk............",
      "...kkgggkkkggggmkk..........",
      "..kgggmgggggggggggk.........",
      ".kggmgggggggggmggggk........",
      "kgggggekkgggggkkeggdk.......",
      "kggmggekkgggggkkegggk.......",
      "kgggggggggggggggggddk.......",
      ".kgggkkkkkkkkkkkggdk........",
      "kggggkgdgdgdgdgkgggdk.......",
      "kgmggkkkkkkkkkkkggddk.......",
      "kggggggggggggggggdddk.......",
      ".kvkggvkggggkvggkvdk........",
      "..kv.kgv.kggk.kv.kv.........",
      "...v..kv..kk...v.kv.........",
      "...v...v.......v..v.........",
      "............................",
      "............................",
    ],
  ],
};

const bigrig: PixelSprite = {
  scale: 4,
  palette: {
    k: INK,
    r: "#8a3028", // cab red (rusted)
    d: "#5e1e18",
    m: "#9aa4ae", // grille/bumper
    g: "#b8e8f0", // ghost glass
    f: "#8ad0e8", // ghost flame
    w: "#3a3a42", // tires
    e: "#f5f0dc",
  },
  frames: [
    [
      "............................",
      "..f..f......................",
      ".kfkkfk.....................",
      "kkrrrrkkkkkkkkkkkkk.........",
      "krrrrrrrrrrrrrrrrrdk........",
      "krkggggkrrrrrrrrrrrdk.......",
      "krkggggkrrrrrrrrrrrdk.......",
      "krkggggkrrrrrdrrrrrdk.......",
      "krrkkkkrrrrrrrrrrrddk.......",
      "kmmmmmmmmmmmmmmmmmmdk.......",
      "kmkekekekekekekekmmdk.......",
      "kmmmmmmmmmmmmmmmmmddk.......",
      ".kwwk..kwwk...kwwkkk........",
      "kwwwwkkwwwwk.kwwwwk.........",
      "kwkwwkkwkwwk.kwkwwk.........",
      ".kwwk..kwwk...kwwk..........",
      "..kk....kk.....kk...........",
      "............................",
    ],
    [
      "............................",
      "...f..f.....................",
      "..kfkkfk....................",
      "kkrrrrkkkkkkkkkkkkk.........",
      "krrrrrrrrrrrrrrrrrdk........",
      "krkggggkrrrrrrrrrrrdk.......",
      "krkggggkrrrrrrrrrrrdk.......",
      "krkggggkrrrrrdrrrrrdk.......",
      "krrkkkkrrrrrrrrrrrddk.......",
      "kmmmmmmmmmmmmmmmmmmdk.......",
      "kmkekekekekekekekmmdk.......",
      "kmmmmmmmmmmmmmmmmmddk.......",
      ".kwwk..kwwk...kwwkkk........",
      "kwwwwkkwwwwk.kwwwwk.........",
      "kwwkwkkwwkwk.kwwkwk.........",
      ".kwwk..kwwk...kwwk..........",
      "..kk....kk.....kk...........",
      "............................",
    ],
  ],
};

const meltdownmel: PixelSprite = {
  scale: 4,
  palette: {
    k: INK,
    c: "#8a929e", // concrete
    d: "#5c6470",
    b: "#40c8ff", // cherenkov core
    w: "#d8f4ff",
    e: "#40c8ff",
    s: "#b8bcc2", // steam
  },
  frames: [
    [
      "..........ss......ss........",
      ".........s..s....s..s.......",
      "....kkkkkkkkkkkkkkkkk.......",
      "...kccccccccccccccccck......",
      "...kccccccccccccccccdk......",
      "..kccekkcccccccckkecc dk.....",
      "..kccekkcccccccckkeccdk.....",
      "..kccccccccccccccccccdk.....",
      "..kcccckkkkkkkkkkcccddk.....",
      ".kccccckbbbbbbbbkccccddk....",
      ".kcccckbbwwbbbbbbkcccddk....",
      ".kcccckbbbbbbwwbbkcccddk....",
      ".kcccckbbbbbbbbbbkccdddk....",
      ".kccccckbbbbbbbbkcccdddk....",
      ".kcccccckkkkkkkkccccdddk....",
      ".kccccccccccccccccccdddk....",
      "..kcckkcccccccccckkcddk.....",
      "..kcck.kccccccccdk.kcdk.....",
      "..kkkk..kkkkkkkkkk..kkk.....",
      "............................",
    ],
    [
      "........ss......ss..........",
      ".......s..s....s..s.........",
      "....kkkkkkkkkkkkkkkkk.......",
      "...kccccccccccccccccck......",
      "...kccccccccccccccccdk......",
      "..kccekkcccccccckkeccdk.....",
      "..kccekkcccccccckkeccdk.....",
      "..kccccccccccccccccccdk.....",
      "..kcccckkkkkkkkkkcccddk.....",
      ".kccccckbbbbbbbbkccccddk....",
      ".kcccckbbbbwwbbbbkcccddk....",
      ".kcccckbwwbbbbbbbkcccddk....",
      ".kcccckbbbbbbbbbbkccdddk....",
      ".kccccckbbbbbbbbkcccdddk....",
      ".kcccccckkkkkkkkccccdddk....",
      ".kccccccccccccccccccdddk....",
      "..kcckkcccccccccckkcddk.....",
      "..kcck.kccccccccdk.kcdk.....",
      "..kkkk..kkkkkkkkkk..kkk.....",
      "............................",
    ],
  ],
};

const beefnado: PixelSprite = {
  scale: 4,
  palette: {
    k: INK,
    t: "#8a9a8a", // funnel
    d: "#62705e",
    w: "#f5f0dc", // cow bits
    b: "#3a3a42",
    p: "#e8b4c8",
    f: "#6b4226", // fence post
    e: "#2a1c10",
  },
  frames: [
    [
      "............................",
      "kkkkkkkkkkkkkkkkkkkkkk......",
      "ktttttttttttttttttttdk......",
      ".kttkwwkttttttkfkttdk.......",
      "..kttkbwkttttkfkttdk........",
      "...kttttttttttttddk.........",
      "....kdtttttttttdk...........",
      "...kttkwbkttttttdk..........",
      "..kttttkwkttkpwkttk.........",
      "...kdtttttttkwkttdk.........",
      "....kttttttttttdk...........",
      ".....kdttkwkttdk............",
      "......kttttttk..............",
      ".......kdttdk...............",
      "........kttk................",
      ".........kdk................",
      "..........kk................",
      "............................",
    ],
    [
      "............................",
      ".kkkkkkkkkkkkkkkkkkkkk......",
      ".kttttttttttttttttttdk......",
      "..ktkfkttttttkwwkttdk.......",
      ".kttkfkttttttkbwkttdk.......",
      "...kttttttttttttddk.........",
      "....kdtttttttttdk...........",
      "...kttttkpwkttttdk..........",
      "..kttkwbkwkkttttttk.........",
      "...kdttkwkttttttdk..........",
      "....kttttttttttdk...........",
      ".....kdttttttdk.............",
      "......ktkwkttk..............",
      ".......kdttdk...............",
      "........kttk................",
      ".........kdk................",
      "..........kk................",
      "............................",
    ],
  ],
};

const olscratch: PixelSprite = {
  scale: 4,
  palette: {
    k: INK,
    r: "#b03028", // devil red
    d: "#801e18",
    h: "#2e1410", // horns
    s: "#2e2228", // suit
    w: "#f5f0dc", // shirt/grin
    e: "#ffd84a", // eyes
    f: "#8a5a32", // fiddle
    g: "#e8c83a", // fiddle strings/tie pin
  },
  frames: [
    [
      "............................",
      "...kh.........hk............",
      "..khhk.......khhk...........",
      "..khhkkkkkkkkkhhk...........",
      "...kkrrrrrrrrrkk............",
      "...krrrrrrrrrrrk............",
      "..krrekrrrrrkerdk...........",
      "..krrkkrrrrrkkrdk...........",
      "..krrrrrrrrrrrddk...........",
      "...krwwwwwwwwrdk............",
      "....krkwwwwkrdk.............",
      ".....kkkkkkkkk..............",
      "....kssskkssssk.............",
      "...kssswwwwsssdk............",
      "..kssskwgwkssssdk...........",
      "..kssskwwwkssssdk.....kf....",
      "..ksssskkkssssddk....kff....",
      "..ksssssssssssddk...kffg....",
      "..kssk.ksssk.kddk..kffg.....",
      "..kssk..kssk..kk..kffg......",
      ".kkkk...kkkk......kkk.......",
      "............................",
    ],
    [
      "............................",
      "...kh.........hk............",
      "..khhk.......khhk...........",
      "..khhkkkkkkkkkhhk...........",
      "...kkrrrrrrrrrkk............",
      "...krrrrrrrrrrrk............",
      "..krrekrrrrrkerdk...........",
      "..krrkkrrrrrkkrdk...........",
      "..krrrrrrrrrrrddk...........",
      "...krwwwwwwwwrdk............",
      "....krkwwwwkrdk.............",
      ".....kkkkkkkkk..............",
      "....kssskkssssk......kf.....",
      "...kssswwwwsssdk....kff.....",
      "..kssskwgwkssssdk..kffg.....",
      "..kssskwwwkssssdk.kffg......",
      "..ksssskkkssssddkkffg.......",
      "..ksssssssssssddkkfg........",
      "..kssk.ksssk.kddk.kk........",
      "..kssk..kssk..kk............",
      ".kkkk...kkkk................",
      "............................",
    ],
  ],
};

export const BOSS_SPRITES: Record<string, PixelSprite> = {
  bertha,
  catfish,
  chemist,
  kernel,
  swampthang,
  bigrig,
  meltdownmel,
  beefnado,
  olscratch,
};

// ---------------------------------------------------------- misc critters

const revenuer: PixelSprite = {
  scale: 2,
  palette: {
    k: "#3a3a4a", // spectral ink (softer than INK)
    g: "#c8c8e0", // ghost body
    p: "#e8e8f8", // pale face
    h: "#2e2838", // bowler hat
    b: "#6a5a4a", // buzzard body
    d: "#4a3e32",
    n: "#e8b4c8", // buzzard head
    e: "#ff5030",
    w: "#f5f0dc", // paper (the BILL)
  },
  frames: [
    [
      "......khhhhk........",
      "......khhhhk........",
      ".....khhhhhhk.......",
      "......kppppk........",
      "......kpepek........",
      "......kppppk........",
      ".....kggggggk.......",
      "....kggggggggkww....",
      "....kggggggggkww....",
      ".....kggggggk.......",
      "..kkkkggggggkkk.....",
      ".kbbbbbbbbbbbbbk....",
      "kbnbbbbbbbbbbbdbk...",
      "knekbbbbbbbbbddbk...",
      "knnk.kbbbbbbdk......",
      "......kbbddk........",
      ".......kkkk.........",
      "........k.k.........",
      "................. ..",
      "....................",
    ],
    [
      "......khhhhk........",
      "......khhhhk........",
      ".....khhhhhhk.......",
      "......kppppk........",
      "......kpepek........",
      "......kppppk........",
      ".....kggggggk.......",
      "....kggggggggkww....",
      "....kggggggggkww....",
      ".....kggggggk.......",
      ".kkkkggggggkkkk.....",
      "kbbbbbbbbbbbbbbk....",
      "kbnbbbbbbbbbbdbbk...",
      "knekbbbbbbbbddbk....",
      "knnk.kbbbbbdk.......",
      "......kbbddk........",
      ".......kkkk.........",
      "......k.k...........",
      "....................",
      "....................",
    ],
  ],
};

const hog: PixelSprite = {
  scale: 3,
  palette: {
    k: INK,
    p: "#c88a6a", // wild hog brown-pink
    d: "#9a6248",
    s: "#e8b498", // snout
    e: "#ff5030", // rampage eyes
    w: "#f5f0dc", // tusks
  },
  frames: [
    [
      "....................",
      "..kkkk....kkkkkkk...",
      ".kppppkkkkpppppppk..",
      "kpepppppppppppppdpk.",
      "kpkppppppppppppppdk.",
      "kssppppppppppppppdk.",
      "kssppppppppppppddk..",
      ".kwkpppppppppppdk...",
      ".kwkppk..kppk.kpk...",
      "..kppk...kpk..kpk...",
      "..kkk....kk...kk....",
      "....................",
      "....................",
      "....................",
    ],
    [
      "....................",
      "..kkkk....kkkkkkk...",
      ".kppppkkkkpppppppk..",
      "kpepppppppppppppdpk.",
      "kpkppppppppppppppdk.",
      "kssppppppppppppppdk.",
      "kssppppppppppppddk..",
      ".kwkpppppppppppdk...",
      ".kwkpk..kppk..kppk..",
      "...kpk..kpk....kpk..",
      "...kk...kk......kk..",
      "....................",
      "....................",
      "....................",
    ],
  ],
};

const possum: PixelSprite = {
  palette: {
    k: INK,
    g: "#b8b8a8", // friendly possum (lighter than the rad one)
    d: "#8a8a7a",
    p: "#e8b4c8",
    e: "#2a1c10",
    w: "#fff6d8",
  },
  frames: [
    [
      "............",
      "..kkk.......",
      ".kgggkkkkk..",
      "kgegggggggkp",
      "kgkgggggggk.",
      ".kwkggggddk.",
      "..kggk.kgk..",
      "..kk...kk...",
      "............",
      "............",
    ],
    [
      "............",
      "..kkk.......",
      ".kgggkkkkk..",
      "kgegggggggkp",
      "kgkgggggggk.",
      ".kwkggggddk.",
      "..kgk..kgk..",
      "..kk..kk....",
      "............",
      "............",
    ],
  ],
};

const cousin: PixelSprite = {
  palette: {
    k: INK,
    s: "#e8b498", // skin
    h: "#c88a3a", // hair
    o: "#4a6a9a", // overalls
    d: "#35507a",
    w: "#f5f0dc",
    e: "#2a1c10",
  },
  frames: [
    [
      "..............",
      "...khhhk......",
      "..khhhhhk.....",
      "..ksssssk.....",
      "..ksesesk.....",
      "..kssssk......",
      "...ksskkk.....",
      "..koooook.....",
      ".kskoodoosk...",
      ".kskoooodsk...",
      "..kkoododk....",
      "...kok.kok....",
      "...ksk..ksk...",
      "..kkk..kkk....",
    ],
    [
      "..............",
      "...khhhk......",
      "..khhhhhk.....",
      "..ksssssk.....",
      "..ksesesk.....",
      "..kssssk......",
      "...ksskkk.....",
      "..koooook.....",
      ".kskoodoosk...",
      ".kskoooodsk...",
      "..kkoododk....",
      "..kok..kok....",
      ".ksk....ksk...",
      ".kk....kkk....",
    ],
  ],
};

const granny_pet: PixelSprite = {
  palette: {
    k: INK,
    s: "#e8c8a8", // skin
    h: "#d8d8e0", // grey bun
    f: "#7a5aa8", // floral dress
    d: "#5a4086",
    r: "#c88a3a", // rolling pin
    e: "#2a1c10",
    g: "#f5f0dc", // spectacles glint
  },
  frames: [
    [
      "....kr........",
      "....kr........",
      "..khhhk.kr....",
      ".khhhhhkkr....",
      ".kssgsgsk.....",
      ".ksesessk.....",
      "..ksssk.......",
      ".kfffffk......",
      "kfkffffdk.....",
      "kfkffffdk.....",
      ".kffffddk.....",
      "..kfk.kfk.....",
      "..ksk..ksk....",
      ".kkk..kkk.....",
    ],
    [
      "..............",
      "..kr..........",
      "..khhhk.......",
      ".khhhhhkkr....",
      ".kssgsgskr....",
      ".ksesessk.....",
      "..ksssk.......",
      ".kfffffk......",
      "kfkffffdk.....",
      "kfkffffdk.....",
      ".kffffddk.....",
      "..kfk.kfk.....",
      ".ksk....ksk...",
      ".kk....kkk....",
    ],
  ],
};

const hound: PixelSprite = {
  palette: {
    k: INK,
    b: "#a8743e", // coonhound brown
    d: "#7a5228",
    f: "#3a2a1a", // ears
    w: "#f5f0dc",
    e: "#2a1c10",
    n: "#1d1409",
  },
  frames: [
    [
      "................",
      ".kff............",
      "kfbbkkkkkkkk....",
      "knebbbbbbbbbk...",
      "kbbbbbbbbbbddk..",
      ".kwkbbbbbbbdk...",
      "..kbbk..kbk.kbk.",
      "..kbk...kbk.kdk.",
      ".kkk....kk..kk..",
      "................",
      "................",
      "................",
    ],
    [
      "................",
      ".kff............",
      "kfbbkkkkkkkk....",
      "knebbbbbbbbbk...",
      "kbbbbbbbbbbddk..",
      ".kwkbbbbbbbdk...",
      "..kbk...kbbk.kk.",
      "..kbk..kbk..kdk.",
      "..kk..kkk...kk..",
      "................",
      "................",
      "................",
    ],
  ],
};

export const MISC_CRITTERS: Record<string, PixelSprite> = {
  revenuer,
  hog,
  possum,
  cousin,
  granny_pet,
  hound,
};
