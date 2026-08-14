// AA character pipeline — palette-keyed recolouring.
//
// THE PROBLEM. A character wants its hair interior, or one or two colours of
// its shirt, changed per character while everything else — the outline, the
// trim, the skin showing through — stays exactly as drawn.
//
// WHY NOT THE OBVIOUS ANSWERS.
//   - SPUM's per-slot tint (`config.colors` → `feColorMatrix` in
//     SpumCharacter) is a MULTIPLY over the whole slice. It darkens the outline
//     along with the target area, and it structurally cannot give two
//     independent colours inside one sprite.
//   - Painting the recolourable area flat white and tinting it loses the ramp:
//     a hairstyle drawn in three browns comes back as one flat tone.
//
// WHAT THIS DOES INSTEAD. The art is drawn in its real colours; the author then
// TAGS which palette entries belong to which channel. Recolouring maps each
// tagged colour to the same position in a new ramp built around the target
// colour, so the shading survives. An untagged colour is never touched, which
// is what keeps outlines put.
//
// EXACT MATCHING IS THE RIGHT CALL HERE. The editor's tools write hard palette
// entries with no anti-aliasing, so a tagged hex either is or isn't a given
// pixel. The one hazard is IMPORTED art, which arrives with near-duplicates
// from downsampling — `nearbyColors` exists so the tagging UI can offer
// "everything within ε of this" rather than making the author click eleven
// browns.
//
// Pure and browser-free. The canvas glue lives in `recolorAtlas.ts`.

import type { PackedRegion } from "./geometry";
import type { AaAppearance, AaColorChannel, AaProtect } from "./types";

export const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export function isHex(value: unknown): value is string {
  return typeof value === "string" && HEX_RE.test(value);
}

// `#ABC` → `#aabbcc`. Everything downstream compares hexes as strings, so a
// single canonical form is what makes a tag match the pixel it was taken from.
export function normalizeHex(hex: string): string {
  const h = hex.replace("#", "");
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h;
  return `#${full.toLowerCase()}`;
}

// --- OKLab -------------------------------------------------------------
//
// Recolouring in raw RGB gets the lightness wrong in a way that shows: the same
// numeric step is a big jump in blue and barely visible in green, so a brown
// ramp remapped to blue comes out muddy at one end and blown out at the other.
// OKLab is perceptually uniform, so "keep this shade's distance from the base"
// means the same thing at every hue.

export type Oklab = { L: number; a: number; b: number };

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function linearToSrgb(c: number): number {
  return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

function clampByte(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}

export function rgbToOklab(r: number, g: number, b: number): Oklab {
  const lr = srgbToLinear(r / 255);
  const lg = srgbToLinear(g / 255);
  const lb = srgbToLinear(b / 255);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

export function oklabToRgb({ L, a, b }: Oklab): [number, number, number] {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;
  // Out-of-gamut results are simply clamped. A proper gamut mapping would
  // preserve hue better at the extremes, but the inputs here are hand-picked
  // sprite colours, not arbitrary Lab coordinates — clamping is invisible in
  // practice and keeps this dependency-free.
  return [
    clampByte(linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s) * 255),
    clampByte(linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s) * 255),
    clampByte(linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s) * 255),
  ];
}

function labOf(hex: string): Oklab {
  const h = normalizeHex(hex).slice(1);
  return rgbToOklab(
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  );
}

function hexOf([r, g, b]: [number, number, number]): string {
  const p = (n: number) => n.toString(16).padStart(2, "0");
  return `#${p(r)}${p(g)}${p(b)}`;
}

// Perceptual lightness, 0 (black) … 1 (white). Exposed because it's what the
// outline-protection threshold is measured in, and the editor prints it.
export function lightnessOf(hex: string): number {
  return labOf(hex).L;
}

// Perceptual distance between two hexes. Used for "tag everything within ε",
// where ε is in the same units — roughly 0.02 is "the same colour to the eye",
// 0.1 is "a neighbouring shade".
export function colorDistance(a: string, b: string): number {
  const x = labOf(a);
  const y = labOf(b);
  return Math.hypot(x.L - y.L, x.a - y.a, x.b - y.b);
}

// Chroma below this is treated as achromatic: hue is meaningless there, and
// reading one produces wild swings from rounding noise in a near-grey.
const GREY = 1e-4;

// --- the mapping -------------------------------------------------------

// Map one tagged colour onto a new base. `src` keeps its position in the ramp
// relative to `base`; `target` is where the base moves to.
//
//   lightness  absolute offset preserved — a highlight stays as far above the
//              base as it was drawn, so the ramp's contrast doesn't collapse on
//              a dark target or blow out on a light one
//   chroma     RATIO preserved — pixel-art ramps usually saturate as they
//              darken, and a ratio carries that over where an offset wouldn't
//   hue        the ramp's own hue SHIFT preserved (shadows swung toward blue,
//              highlights toward yellow). That shift is the hand-drawn part;
//              flattening every entry onto one hue is what makes a recolour
//              read as machine-made.
export function shiftColor(src: string, base: string, target: string): string {
  const S = labOf(src);
  const B = labOf(base);
  const T = labOf(target);

  const Cs = Math.hypot(S.a, S.b);
  const Cb = Math.hypot(B.a, B.b);
  const Ct = Math.hypot(T.a, T.b);

  const L = Math.max(0, Math.min(1, T.L + (S.L - B.L)));
  // A GREY base has no chroma to take a ratio of, so every entry simply takes
  // the target's chroma and differs only in lightness — which is exactly right
  // for a ramp drawn in greys as a recolour placeholder.
  const C = Cb > GREY ? Ct * (Cs / Cb) : Ct;

  let hue = Math.atan2(T.b, T.a);
  if (Cs > GREY && Cb > GREY) {
    let delta = Math.atan2(S.b, S.a) - Math.atan2(B.b, B.a);
    // Wrap to (-π, π] so a shift across the red seam is small, not a full turn.
    while (delta > Math.PI) delta -= 2 * Math.PI;
    while (delta < -Math.PI) delta += 2 * Math.PI;
    hue += delta;
  }

  return hexOf(oklabToRgb({ L, a: C * Math.cos(hue), b: C * Math.sin(hue) }));
}

// --- appearance --------------------------------------------------------

// Contrast pivots here rather than at 0.5, because OKLab's lightness for sRGB
// mid-grey (#808080) is 0.5998. Pivoting at 0.5 would make `contrast > 1`
// visibly DARKEN the midtones, which is not what anyone means by the word or
// what CSS's `contrast()` does.
const CONTRAST_PIVOT = 0.5998;

export const IDENTITY_APPEARANCE: Required<AaAppearance> = {
  hue: 0,
  saturation: 1,
  brightness: 1,
  contrast: 1,
};

export function isIdentityAppearance(a: AaAppearance | undefined): boolean {
  if (!a) return true;
  return (
    (a.hue ?? 0) === 0 &&
    (a.saturation ?? 1) === 1 &&
    (a.brightness ?? 1) === 1 &&
    (a.contrast ?? 1) === 1
  );
}

// Hue / saturation / brightness / contrast on one colour, in OKLCh.
//
// SPUM does this as a CSS `filter` chain over the whole slice, which is cheaper
// but cannot spare anything — the outline gets hue-rotated along with the fill.
// Doing it per colour is what makes protection possible at all, and it costs
// one pass over a sprite that is a couple of thousand pixels.
//
// Order is brightness → contrast → saturation → hue, matching how the same
// four read as a CSS filter list.
export function adjustColor(hex: string, appearance: AaAppearance): string {
  const { L, a, b } = labOf(hex);
  let l = L * (appearance.brightness ?? 1);
  l = (l - CONTRAST_PIVOT) * (appearance.contrast ?? 1) + CONTRAST_PIVOT;
  l = Math.max(0, Math.min(1, l));
  const chroma = Math.max(0, Math.hypot(a, b) * (appearance.saturation ?? 1));
  const hue = Math.atan2(b, a) + ((appearance.hue ?? 0) * Math.PI) / 180;
  return hexOf(
    oklabToRgb({ L: l, a: chroma * Math.cos(hue), b: chroma * Math.sin(hue) }),
  );
}

// --- protection --------------------------------------------------------

// Tight on purpose: #1a1c2c (the palette's outline black) sits at 0.234, while
// #333c57 and a dark brown #5c3a1a are 0.36 and 0.38. So the default catches a
// near-black outline and leaves every shade that's doing artistic work alone.
export const DEFAULT_PROTECT_LIGHTNESS = 0.3;

export function protectLightness(protect: AaProtect | undefined): number {
  return protect?.maxLightness ?? DEFAULT_PROTECT_LIGHTNESS;
}

// Whether one colour is off-limits. Measured on the AUTHORED colour, not the
// recoloured one — protection is a statement about the art, so a shade that
// happens to become dark after a hue shift is not retroactively spared.
export function isProtected(hex: string, protect: AaProtect | undefined): boolean {
  const h = normalizeHex(hex);
  if (protect?.colors?.some((c) => normalizeHex(c) === h)) return true;
  return lightnessOf(h) <= protectLightness(protect);
}

// --- the whole transform -----------------------------------------------

// Everything a character does to one part's pixels. Both halves skip the same
// protected colours, so an outline survives a recolour and a hue rotation
// alike.
export type PartTransform = {
  channels?: readonly AaColorChannel[];
  picks?: ColorPicks;
  appearance?: AaAppearance;
  protect?: AaProtect;
};

export function isIdentityTransform(t: PartTransform): boolean {
  return (
    buildColorMap(t.channels, t.picks).size === 0 &&
    isIdentityAppearance(t.appearance)
  );
}

// One pass over the buffer. Distinct colours are memoised, so the per-colour
// OKLab maths runs about a dozen times for a sprite of a couple of thousand
// pixels rather than once per pixel.
export function applyPartTransform(
  buf: Uint8ClampedArray,
  t: PartTransform,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(buf);
  const map = buildColorMap(t.channels, t.picks);
  const flat = isIdentityAppearance(t.appearance);
  if (map.size === 0 && flat) return out;

  const maxL = protectLightness(t.protect);
  const explicit = new Set((t.protect?.colors ?? []).map(packHex));
  const memo = new Map<number, number>();

  for (let i = 0; i < out.length; i += 4) {
    if (out[i + 3] === 0) continue;
    const from = packRgb(out[i], out[i + 1], out[i + 2]);
    let to = memo.get(from);
    if (to === undefined) {
      const hex = unpackHex(from);
      if (explicit.has(from) || lightnessOf(hex) <= maxL) {
        to = from;
      } else {
        const recoloured = map.get(from) ?? from;
        to = flat
          ? recoloured
          : packHex(adjustColor(unpackHex(recoloured), t.appearance as AaAppearance));
      }
      memo.set(from, to);
    }
    if (to === from) continue;
    out[i] = (to >> 16) & 0xff;
    out[i + 1] = (to >> 8) & 0xff;
    out[i + 2] = to & 0xff;
  }
  return out;
}

// The whole ramp under a target colour — what the tagging UI shows next to the
// authored one, and what makes a bad base pick obvious before anything is saved.
export function channelRamp(channel: AaColorChannel, target: string): string[] {
  return channel.ramp.map((hex) => shiftColor(hex, channel.base, target));
}

// --- applying to pixels ------------------------------------------------

export function packRgb(r: number, g: number, b: number): number {
  return (r << 16) | (g << 8) | b;
}

export function packHex(hex: string): number {
  return parseInt(normalizeHex(hex).slice(1), 16);
}

export function unpackHex(packed: number): string {
  return `#${packed.toString(16).padStart(6, "0")}`;
}

/** Slot → channel id → target hex. Absent means "keep the authored colour". */
export type ColorPicks = Record<string, string>;

// Source packed RGB → replacement packed RGB, for every channel that has a
// pick. A pick equal to the channel's base produces identity entries, which are
// dropped — an empty map is the signal that no work is needed at all, and that
// shortcut is what keeps an untinted character from paying for a canvas pass.
export function buildColorMap(
  channels: readonly AaColorChannel[] | undefined,
  picks: ColorPicks | undefined,
): Map<number, number> {
  const map = new Map<number, number>();
  if (!channels || !picks) return map;
  for (const channel of channels) {
    const target = picks[channel.id];
    if (!target || !isHex(target)) continue;
    for (const src of channel.ramp) {
      const out = shiftColor(src, channel.base, target);
      const from = packHex(src);
      const to = packHex(out);
      if (from === to) continue;
      // First channel to claim a colour wins. Two channels sharing a hex is an
      // authoring mistake (`channelConflicts` surfaces it); resolving it here
      // deterministically beats letting the result depend on iteration order.
      if (!map.has(from)) map.set(from, to);
    }
  }
  return map;
}

// Apply a colour map to a copy of the buffer. Fully transparent pixels are left
// alone regardless of their RGB — cleared pixels can carry stale channels, and
// recolouring them would be invisible work that dirties the PNG.
export function applyColorMap(
  buf: Uint8ClampedArray,
  map: Map<number, number>,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(buf);
  if (map.size === 0) return out;
  for (let i = 0; i < out.length; i += 4) {
    if (out[i + 3] === 0) continue;
    const to = map.get(packRgb(out[i], out[i + 1], out[i + 2]));
    if (to === undefined) continue;
    out[i] = (to >> 16) & 0xff;
    out[i + 1] = (to >> 8) & 0xff;
    out[i + 2] = to & 0xff;
  }
  return out;
}

export function recolorBuffer(
  buf: Uint8ClampedArray,
  channels: readonly AaColorChannel[] | undefined,
  picks: ColorPicks | undefined,
): Uint8ClampedArray {
  return applyColorMap(buf, buildColorMap(channels, picks));
}

// --- authoring helpers -------------------------------------------------

export type PaletteEntry = { hex: string; count: number };

// Every distinct colour in the sheet (or in one region), most-used first. This
// is the tagging UI's main surface: you see the five browns the hair is
// actually made of and click the three that are its interior.
export function paletteOf(
  buf: Uint8ClampedArray,
  width: number,
  region?: PackedRegion,
): PaletteEntry[] {
  const counts = new Map<number, number>();
  const x0 = region ? region.x : 0;
  const y0 = region ? region.y : 0;
  const x1 = region ? region.x + region.width : width;
  const y1 = region ? region.y + region.height : buf.length / 4 / width;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * width + x) * 4;
      if (buf[i + 3] === 0) continue;
      const key = packRgb(buf[i], buf[i + 1], buf[i + 2]);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .map(([packed, count]) => ({ hex: unpackHex(packed), count }))
    .sort((a, b) => b.count - a.count || a.hex.localeCompare(b.hex));
}

// How many pixels a ramp actually covers. Zero is the failure mode worth
// showing: re-shade a part after tagging it and the tags point at colours that
// are no longer in the art, so the channel silently stops working.
export function countRampPixels(
  buf: Uint8ClampedArray,
  ramp: readonly string[],
): number {
  if (ramp.length === 0) return 0;
  const wanted = new Set(ramp.map(packHex));
  let n = 0;
  for (let i = 0; i < buf.length; i += 4) {
    if (buf[i + 3] === 0) continue;
    if (wanted.has(packRgb(buf[i], buf[i + 1], buf[i + 2]))) n++;
  }
  return n;
}

// Colours in the palette within `epsilon` of `hex`. Imported art arrives with
// near-duplicates that a downsample invented; tagging them one at a time is
// both tedious and easy to leave half-done, which shows up as speckle in the
// recoloured sprite.
export function nearbyColors(
  palette: readonly PaletteEntry[],
  hex: string,
  epsilon: number,
): string[] {
  return palette
    .filter((e) => colorDistance(e.hex, hex) <= epsilon)
    .map((e) => e.hex);
}

// Hexes claimed by more than one channel. Two channels that overlap can't both
// win, so this is reported rather than resolved silently.
export function channelConflicts(
  channels: readonly AaColorChannel[],
): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const c of channels) {
    for (const hex of c.ramp) {
      const h = normalizeHex(hex);
      if (seen.has(h)) dupes.add(h);
      seen.add(h);
    }
  }
  return Array.from(dupes).sort();
}

// Add or remove one colour from a channel's ramp. Returns null when that
// emptied it, which the caller reads as "delete this channel" — a channel with
// no colours would validate but do nothing, and a picker for it in the
// Characters tab would be a control that quietly has no effect.
//
// Removing the BASE promotes the next entry rather than leaving the channel
// anchored to a colour it no longer contains.
//
// Adding to a channel whose base is NOT in its ramp makes the new colour the
// base. A dangling base — the freshly-created channel's placeholder black, or
// tags orphaned by a re-shade — anchors every recolour to a colour the art
// doesn't contain, which shifts the whole ramp by the gap (a white shirt with
// a black base turns any pick into its palest tint).
export function toggleRampColor(
  channel: AaColorChannel,
  hex: string,
): AaColorChannel | null {
  const h = normalizeHex(hex);
  const ramp = channel.ramp.map(normalizeHex);
  const base = normalizeHex(channel.base);
  if (!ramp.includes(h)) {
    return { ...channel, base: ramp.includes(base) ? base : h, ramp: [...ramp, h] };
  }
  const next = ramp.filter((c) => c !== h);
  if (next.length === 0) return null;
  return { ...channel, base: h === base ? next[0] : base, ramp: next };
}

export function setChannelBase(
  channel: AaColorChannel,
  hex: string,
): AaColorChannel {
  const h = normalizeHex(hex);
  const ramp = channel.ramp.map(normalizeHex);
  return { ...channel, base: h, ramp: ramp.includes(h) ? ramp : [h, ...ramp] };
}

// A channel with no base in its own ramp can't be recoloured coherently — the
// base is the anchor every other entry is measured from. The editor keeps them
// in sync; this is the guard for an imported bundle.
export function normalizeChannel(channel: AaColorChannel): AaColorChannel {
  const ramp = Array.from(new Set(channel.ramp.map(normalizeHex)));
  const base = normalizeHex(channel.base);
  if (!ramp.includes(base)) ramp.unshift(base);
  return { ...channel, base, ramp };
}
