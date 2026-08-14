// AA character pipeline — automatic form shading (Phase 13).
//
// THE PROBLEM. Hand-shading every part is the slowest, least fun step of
// authoring, and consistency across forty parts is exactly what hand work is
// bad at. So parts are drawn FLAT (base colours + outline) and volume is
// generated: a rim of darker pixels along the edges facing away from the
// light, the same one- or two-step edge shade a pixel artist would draw.
//
// WHY THIS IS SAFE TO GENERATE. The rule really is geometric: for a light
// from the top-left, the shade line hugs the right/bottom silhouette, one
// ramp step darker. Applying it uniformly across every part of every
// character produces the consistency a hand pass can't.
//
// TWO RULES CARRY THE WHOLE FEATURE:
//   1. Shade IN RAMP SPACE when possible. A pixel whose colour sits in one of
//      the part's tagged channel ramps steps to the ramp's next darker entry,
//      so the shadow stays on-palette and moves with a recolour. Only a
//      colour with no darker neighbour synthesises a shade (OKLab: lightness
//      down, chroma slightly up — pixel-art ramps saturate as they darken).
//   2. Protected colours are BACKGROUND. The outline is never darkened, and
//      the fill pixel inside it is the one that takes the shade line — which
//      is where a hand-shader puts it. Interior outlines (a hem, a chin) get
//      shade on their away side too, for the same reason.
//
// Runs on the FINAL pixels — after recolour, appearance, and hat-hair — so
// the hook chain order matters (`useShadedOverrides` sits last). Pure and
// browser-free; the canvas glue lives in `shadeAtlas.ts`.

import {
  adjustColor,
  channelRamp,
  isIdentityAppearance,
  isProtected,
  normalizeHex,
  oklabToRgb,
  packRgb,
  rgbToOklab,
  unpackHex,
  type ColorPicks,
} from "./recolor";
import type {
  AaAppearance,
  AaColorChannel,
  AaLightDirection,
  AaProtect,
  AaShadeStyle,
} from "./types";

export const SHADE_STYLE_LABEL: Record<AaShadeStyle, string> = {
  none: "none",
  soft: "soft — 1px dithered rim",
  cel: "cel — 1px solid rim",
  hard: "deep — 2px rim + highlight",
};

export const LIGHT_DIRECTION_LABEL: Record<AaLightDirection, string> = {
  left: "top-left",
  top: "top",
  right: "top-right",
  below: "below (campfire)",
};

// The away-side neighbour offsets per light direction, +y down (buffer
// order). A pixel whose neighbour at one of these offsets is background takes
// the shade; the lit side is the same set negated. `below` is the underlight:
// tops go dark, bottoms catch the glow — nothing special-cased, just an
// inverted offset.
const AWAY: Record<AaLightDirection, ReadonlyArray<readonly [number, number]>> = {
  left: [
    [1, 0],
    [0, 1],
  ],
  top: [[0, 1]],
  right: [
    [-1, 0],
    [0, 1],
  ],
  below: [[0, -1]],
};

type StyleSpec = { depth: number; dither: boolean; highlight: boolean };

const STYLE_SPEC: Record<Exclude<AaShadeStyle, "none">, StyleSpec> = {
  soft: { depth: 1, dither: true, highlight: false },
  cel: { depth: 1, dither: false, highlight: false },
  hard: { depth: 2, dither: false, highlight: true },
};

// Synthesised steps, used when a colour has no ramp (or is the ramp's darkest
// entry). Sized to read as one ramp step: typical hand-drawn ramps step
// 0.06–0.12 in OKLab lightness. Chroma rises on the way down and falls on the
// way up — matching how ramps are actually drawn keeps a synthesised step
// from reading as "greyed out".
const SHADE_L_DROP = 0.09;
const SHADE_CHROMA = 1.15;
const HIGHLIGHT_L_RAISE = 0.07;
const HIGHLIGHT_CHROMA = 0.92;

function labOf(hex: string) {
  const h = normalizeHex(hex).slice(1);
  return rgbToOklab(
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  );
}

function hexOf(rgb: [number, number, number]): string {
  const p = (n: number) => n.toString(16).padStart(2, "0");
  return `#${p(rgb[0])}${p(rgb[1])}${p(rgb[2])}`;
}

function stepped(hex: string, dL: number, chromaScale: number): string {
  const { L, a, b } = labOf(hex);
  const chroma = Math.hypot(a, b) * chromaScale;
  const hue = Math.atan2(b, a);
  const l = Math.max(0, Math.min(1, L + dL));
  return hexOf(oklabToRgb({ L: l, a: chroma * Math.cos(hue), b: chroma * Math.sin(hue) }));
}

export function synthShade(hex: string): string {
  return stepped(hex, -SHADE_L_DROP, SHADE_CHROMA);
}

export function synthHighlight(hex: string): string {
  return stepped(hex, HIGHLIGHT_L_RAISE, HIGHLIGHT_CHROMA);
}

// The ramp's next entry in the wanted direction, or null when the colour
// isn't in any ramp / is already at the end. Ramps are searched as sets — the
// authored order isn't trusted to be sorted.
function rampStep(
  hex: string,
  ramps: readonly (readonly string[])[],
  darker: boolean,
): string | null {
  const h = normalizeHex(hex);
  const L = labOf(h).L;
  for (const ramp of ramps) {
    if (!ramp.some((c) => normalizeHex(c) === h)) continue;
    let best: string | null = null;
    let bestL = darker ? -Infinity : Infinity;
    for (const c of ramp) {
      const cl = labOf(c).L;
      if (darker ? cl < L && cl > bestL : cl > L && cl < bestL) {
        best = normalizeHex(c);
        bestL = cl;
      }
    }
    return best;
  }
  return null;
}

export function shadeOf(hex: string, ramps: readonly (readonly string[])[]): string {
  return rampStep(hex, ramps, true) ?? synthShade(hex);
}

export function highlightOf(hex: string, ramps: readonly (readonly string[])[]): string {
  return rampStep(hex, ramps, false) ?? synthHighlight(hex);
}

// The ramps as they exist ON SCREEN for one slot — the shade pass runs on
// recoloured pixels, so matching them means replaying what the recolour pass
// did to each tagged entry: protected entries stay put, everything else takes
// the channel shift (when the character picked a colour) and then the slot's
// appearance. Mirrors `applyPartTransform`'s per-colour path exactly.
export function effectiveRamps(
  channels: readonly AaColorChannel[] | undefined,
  picks: ColorPicks | undefined,
  appearance: AaAppearance | undefined,
  protect: AaProtect | undefined,
): string[][] {
  if (!channels) return [];
  const flat = isIdentityAppearance(appearance);
  return channels.map((channel) => {
    const target = picks?.[channel.id];
    return channel.ramp.map((authored) => {
      if (isProtected(authored, protect)) return normalizeHex(authored);
      const shifted = target
        ? channelRamp(channel, target)[channel.ramp.indexOf(authored)]
        : authored;
      return normalizeHex(
        flat ? shifted : adjustColor(shifted, appearance as AaAppearance),
      );
    });
  });
}

// Whether the rendered art is mirrored (a scene actor facing the other way).
// A baked left-lit sprite flips into a right-lit one, so the bake direction
// swaps with it; top/below are symmetric and don't care.
export function effectiveLightDirection(
  direction: AaLightDirection,
  mirrored: boolean,
): AaLightDirection {
  if (!mirrored) return direction;
  if (direction === "left") return "right";
  if (direction === "right") return "left";
  return direction;
}

export type ShadeOptions = {
  style: AaShadeStyle;
  /** Default `"left"` — the genre's implied top-left light. */
  direction?: AaLightDirection;
  /** The atlas's `pixelDensity`: a hi-res part's "1px" rim is this many
   *  buffer pixels thick, and the dither checker is this many wide, so the
   *  shade reads the same at every density. Default 1. */
  density?: number;
  /** Effective on-screen ramps (`effectiveRamps`) — shading steps down these
   *  when a pixel's colour is found in one. */
  ramps?: readonly (readonly string[])[];
  protect?: AaProtect;
};

// Shade one buffer in place. Returns whether any pixel changed — false is the
// caller's signal to keep the original atlas object (identity contract shared
// with the recolour and hat-hair bakes).
export function applyShading(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  opts: ShadeOptions,
): boolean {
  if (opts.style === "none") return false;
  const spec = STYLE_SPEC[opts.style];
  const direction = opts.direction ?? "left";
  const density = Math.max(1, Math.round(opts.density ?? 1));
  const away = AWAY[direction];
  const size = width * height;

  // Per-colour verdicts are memoised — a sprite has a dozen distinct colours,
  // not a thousand (same trick as `applyPartTransform`).
  const protectedMemo = new Map<number, boolean>();
  const isBackground = (x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x >= width || y >= height) return true;
    const i = (y * width + x) * 4;
    if (pixels[i + 3] === 0) return true;
    const packed = packRgb(pixels[i], pixels[i + 1], pixels[i + 2]);
    let hit = protectedMemo.get(packed);
    if (hit === undefined) {
      hit = isProtected(unpackHex(packed), opts.protect);
      protectedMemo.set(packed, hit);
    }
    return hit;
  };

  // Erode inward from the away edges, one 1px layer at a time, `depth ×
  // density` layers total. Marked pixels count as background for the next
  // layer, which is what grows the band inward.
  const mask = new Uint8Array(size);
  const depthPx = spec.depth * density;
  for (let layer = 0; layer < depthPx; layer++) {
    const pending: number[] = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const at = y * width + x;
        if (mask[at] || isBackground(x, y)) continue;
        for (const [dx, dy] of away) {
          const nx = x + dx;
          const ny = y + dy;
          if (isBackground(nx, ny) || mask[ny * width + nx]) {
            pending.push(at);
            break;
          }
        }
      }
    }
    for (const at of pending) mask[at] = 1;
  }

  // The lit rim (hard style only): one band on the opposite edges, skipping
  // anything the shade already claimed — on a sliver both sides qualify and
  // the shadow wins.
  const lit = new Uint8Array(spec.highlight ? size : 0);
  if (spec.highlight) {
    for (let layer = 0; layer < density; layer++) {
      const pending: number[] = [];
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const at = y * width + x;
          if (lit[at] || mask[at] || isBackground(x, y)) continue;
          for (const [dx, dy] of away) {
            const nx = x - dx;
            const ny = y - dy;
            // `isBackground` already returns true out of bounds, so the lit
            // lookup only runs on a real in-bounds neighbour.
            if (isBackground(nx, ny) || lit[ny * width + nx] === 1) {
              pending.push(at);
              break;
            }
          }
        }
      }
      for (const at of pending) lit[at] = 1;
    }
  }

  const ramps = opts.ramps ?? [];
  const shadeMemo = new Map<number, number>();
  const highlightMemo = new Map<number, number>();
  const derive = (packed: number, memo: Map<number, number>, darker: boolean): number => {
    let out = memo.get(packed);
    if (out === undefined) {
      const hex = unpackHex(packed);
      out = parseInt(
        (darker ? shadeOf(hex, ramps) : highlightOf(hex, ramps)).slice(1),
        16,
      );
      memo.set(packed, out);
    }
    return out;
  };

  let changed = false;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const at = y * width + x;
      const shaded = mask[at] === 1;
      const litHere = !shaded && spec.highlight && lit[at] === 1;
      if (!shaded && !litHere) continue;
      // The dither checker skips alternate density-sized cells.
      if (
        shaded &&
        spec.dither &&
        (Math.floor(x / density) + Math.floor(y / density)) % 2 === 1
      ) {
        continue;
      }
      const i = at * 4;
      const from = packRgb(pixels[i], pixels[i + 1], pixels[i + 2]);
      const to = shaded
        ? derive(from, shadeMemo, true)
        : derive(from, highlightMemo, false);
      if (to === from) continue;
      pixels[i] = (to >> 16) & 0xff;
      pixels[i + 1] = (to >> 8) & 0xff;
      pixels[i + 2] = to & 0xff;
      changed = true;
    }
  }
  return changed;
}
