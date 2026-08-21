// Original code-authored pixel art. Every non-character sprite in the game
// is defined here as a character grid + palette, the same spirit as the
// aachar itemsL/itemsR parts: hand-placed pixels, chunky outlines, 2-3 tone
// shading. Rendered to canvases at boot, registered as Phaser textures.
//
// Format: palette maps a grid char to a hex color; '.' and ' ' are
// transparent. Frames share one palette. Grids are small (10-20px) and the
// game draws them at 2x; bosses at 3-4x.

export type PixelSprite = {
  palette: Record<string, string>;
  frames: string[][];
  /** draw scale in game (default 2) */
  scale?: number;
};

export function renderPixelSprite(
  sprite: PixelSprite,
  frame: number,
): HTMLCanvasElement {
  const rows = sprite.frames[Math.min(frame, sprite.frames.length - 1)];
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  for (let y = 0; y < h; y++) {
    const row = rows[y];
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === "." || ch === " ") continue;
      const color = sprite.palette[ch];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  return canvas;
}

/** Mirror a frame horizontally (walkers face left in art; game flips). */
export function flipFrame(rows: string[]): string[] {
  const w = Math.max(...rows.map((r) => r.length));
  return rows.map((r) => r.padEnd(w, ".").split("").reverse().join(""));
}

// Shared outline + tone conventions (keep art consistent):
export const INK = "#1d1409"; // outline everywhere
export const HI = "#fff6d8"; // highlight dot color

// ---------------------------------------------------------------- exemplars
// These two set the quality bar for the whole set: readable silhouette,
// dark ink outline, base + shade + highlight tones, personality in 16px.

export const SPR_RADPOSSUM: PixelSprite = {
  palette: {
    k: INK,
    g: "#8d9683", // fur base
    d: "#646b5c", // fur shade
    p: "#e8b4c8", // nose/tail pink
    e: "#9bc318", // radioactive eye glow
    w: "#fff6d8",
  },
  frames: [
    [
      "................",
      ".....kkkk.......",
      "...kkggggkk.....",
      "..kggggggggk....",
      ".kgggeggegggk...",
      ".kggkekkekggk...",
      "kggggggggggggkk.",
      "kgdggggggggddgpk",
      "kgdgggggggggdgk.",
      ".kddgggggggddk..",
      "..kkddddddddk...",
      "...kdkkkkkdk....",
      "...kdk...kdk....",
      "..kkk...kkk.....",
      "................",
      "................",
    ],
    [
      "................",
      ".....kkkk.......",
      "...kkggggkk.....",
      "..kggggggggk....",
      ".kgggeggegggk...",
      ".kggkekkekggk...",
      "kggggggggggggkk.",
      "kgdggggggggddgpk",
      "kgdgggggggggdgk.",
      ".kddgggggggddk..",
      "..kkddddddddk...",
      "...kdk..kkdk....",
      "..kdk....kdk....",
      "..kk....kkk.....",
      "................",
      "................",
    ],
  ],
};

export const SPR_JACKALOPE: PixelSprite = {
  palette: {
    k: INK,
    b: "#c49a6c", // fur
    d: "#96703f", // shade
    a: "#7a5a30", // antler
    w: "#fff6d8",
    e: "#2a1c10",
  },
  frames: [
    [
      "...a........a...",
      "..kak......kak..",
      "..kak..kk..kak..",
      "..kaakkbbkkaak..",
      "...kbbbbbbbbk...",
      "...kbwebbwebk...",
      "...kbeebbeebk...",
      "..kbbbbbbbbbbk..",
      "..kbdbbbbbbdbk..",
      "..kbdbbbbbbdbk..",
      "...kddbbbbddk...",
      "....kkddddkk....",
      "....kdk..kdk....",
      "...kkk....kkk...",
      "................",
      "................",
    ],
    [
      "...a........a...",
      "..kak......kak..",
      "..kak..kk..kak..",
      "..kaakkbbkkaak..",
      "...kbbbbbbbbk...",
      "...kbwebbwebk...",
      "...kbeebbeebk...",
      "..kbbbbbbbbbbk..",
      "..kbdbbbbbbdbk..",
      "..kbdbbbbbbdbk..",
      "...kddbbbbddk...",
      "....kkddddkk....",
      "...kdk....kdk...",
      "..kkk......kkk..",
      "................",
      "................",
    ],
  ],
};

// Food exemplar — the humble moon pie.
export const SPR_MOONPIE: PixelSprite = {
  palette: {
    k: INK,
    c: "#6b4226", // chocolate
    d: "#4a2c18",
    m: "#f5ead0", // marshmallow
    w: "#fff6d8",
  },
  frames: [
    [
      "............",
      "...kkkkkk...",
      "..kcccccck..",
      ".kccwccccck.",
      ".kcmmmmmmck.",
      ".kmmmmmmmmk.",
      ".kcmmmmmmck.",
      ".kccccccdck.",
      "..kcddddck..",
      "...kkkkkk...",
      "............",
      "............",
    ],
  ],
};

// The mason jar. No longer the in-level frenzy pickup (that's now the weapon
// icon inside a player-tinted belch-bubble, see PlayScene items); kept for
// the sprite atlas / shell art.
export const SPR_JAR: PixelSprite = {
  palette: {
    k: INK,
    z: "#b8b09a", // zinc lid
    g: "#cfe8dd", // glass
    s: "#e8dcae", // shine liquid
    d: "#c8b878",
    w: "#ffffff",
  },
  frames: [
    [
      "............",
      "..kzzzzzzk..",
      "..kzzzzzzk..",
      ".kggggggggk.",
      ".kgwggggggk.",
      ".kgwgssssgk.",
      ".kggssssssk.",
      ".kgssssssdk.",
      ".kgssssssdk.",
      ".kgsssssddk.",
      "..kkkkkkkk..",
      "............",
    ],
    [
      "............",
      "..kzzzzzzk..",
      "..kzzzzzzk..",
      ".kggggggggk.",
      ".kgwggggggk.",
      ".kgwggssssk.",
      ".kggssssssk.",
      ".kgssssssdk.",
      ".kgssssssdk.",
      ".kgsssssddk.",
      "..kkkkkkkk..",
      "............",
    ],
  ],
};
