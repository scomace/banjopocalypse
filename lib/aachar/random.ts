// AA character pipeline — the Characters tab's Randomize button.
//
// Mirrors the SPUM harness's Random button (SpumDebugHarness.tsx): each slot
// rolls independently with a per-slot presence weight, and a LOCKED slot keeps
// its part, its colour picks, and its appearance through a reroll — the same
// contract as SPUM's `IsSpriteFixed`. The weights follow this pipeline's slot
// USAGE (`SLOT_LABEL`), not SPUM's slot names — `faceHair` is a mouth here,
// not a beard, so it always rolls; SPUM's 50% beard chance would leave half
// the characters mouthless.
//
// Colour variety comes from the part's own colour channels: every channel the
// rolled outfit declares gets a fresh tint (the aachar analogue of SPUM's
// random eye-iris seed). Untagged parts render as drawn — randomness can't
// touch what the author didn't mark recolourable.

import { channelsOf, findPart, partsInSlot } from "./character";
import {
  AA_SLOTS,
  type AaCharacter,
  type AaColorChannel,
  type AaModel,
  type AaPart,
  type AaSlot,
} from "./types";

/** Injectable randomness source, `Math.random`-shaped: returns [0, 1). */
export type Rng = () => number;

// Chance the slot gets a part at all (1 = always). Body, clothing, eyes and
// mouth are what makes a character read as one; hair is near-universal; hats
// and held items are accessories.
export const RANDOM_SLOT_PRESENCE: Record<AaSlot, number> = {
  body: 1,
  cloth: 1,
  eye: 1,
  faceHair: 1,
  hair: 0.85,
  helmet: 0.5,
  weapon: 0.33,
  weapon2: 0.15,
};

// Chance a rerolled character rests with half-closed eyes (Phase 11) — a
// "sleepy/chill" personality trait, rolled ONLY when the picked eye part has
// real art in its half band (`eyeBands.half`, stamped at save time). A part
// without the band can't be asked to show it, so most rolls stay wide awake.
export const RANDOM_HALF_EYES = 0.25;

// Saturation/lightness stay in the middle band so the recolour ramp survives:
// a near-black or near-white target collapses the ramp's lightness offsets
// into one flat tone (see channelRamp in recolor.ts). Hue is unrestricted.
export function randomTint(rng: Rng): string {
  const h = rng() * 360;
  const s = 0.45 + rng() * 0.4;
  const l = 0.35 + rng() * 0.3;
  return hslToHex(h, s, l);
}

// A channel with a curated `randomPalette` rolls from it; anything else gets
// the unconstrained tint. The palette exists for channels where "any hue" is
// wrong out of the box — skin — without ever limiting a deliberate pick in
// the Characters tab.
function randomChannelColor(channel: AaColorChannel, rng: Rng): string {
  const palette = channel.randomPalette;
  if (palette && palette.length > 0) {
    return palette[Math.min(palette.length - 1, Math.floor(rng() * palette.length))];
  }
  return randomTint(rng);
}

function hslToHex(h: number, s: number, l: number): string {
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(c * 255)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

// Reroll a character in place: same name, same proportion deltas (build is
// identity, not outfit — SPUM's Random doesn't reroll bone lengths either),
// new picks/colours/appearance everywhere that isn't locked. Unlocked slots
// get their appearance CLEARED rather than randomised — random HSB sliders
// produce mud, and "as drawn plus a channel tint" is already varied.
export function randomizeCharacter(
  model: AaModel,
  character: AaCharacter,
  locked: ReadonlySet<AaSlot> = new Set(),
  rng: Rng = Math.random,
  excludeTags: ReadonlySet<string> = new Set(),
): AaCharacter {
  return rollCharacter(model, character, locked, rng, {
    // Themed parts stay out of the pool unless their tag was invited back.
    pool: (all) => all.filter((p) => !(p.tags ?? []).some((t: string) => excludeTags.has(t))),
    channelColor: randomChannelColor,
    presence: RANDOM_SLOT_PRESENCE,
    halfEyeChance: RANDOM_HALF_EYES,
  });
}

// --- themed rolls (the zombie & raider generators) ----------------------

// A theme inverts the exclude filter: each slot rolls from its TAGGED pool
// where one exists (zombies always get a rotted head — the tagged bodies),
// and falls back to UNTAGGED parts where the theme has no art (there's no
// zombie hair — any hair over green skin reads fine). Other themes' parts
// never leak in through the fallback.
export type RandomTheme = {
  tag: string;
  /** Per-slot presence overrides; unnamed slots use RANDOM_SLOT_PRESENCE. */
  presence?: Partial<Record<AaSlot, number>>;
  /** Channel id → curated palette (e.g. skin → zombie greens). An EMPTY
   *  list defers to the channel's own colour behaviour (its `randomPalette`
   *  or a free tint) — how a theme keeps skin human while `defaultPalette`
   *  repaints every other channel. */
  palettes?: Record<string, readonly string[]>;
  /** Palette for every channel not named above (cloth trims, hair dyes). */
  defaultPalette?: readonly string[];
  /** Chance of resting half-lidded eyes when the rolled part has the band. */
  halfEyeChance?: number;
};

// Rot-adjacent greens and greys, all mid-lightness so the recolour ramp
// survives (same rule as randomTint's clamps).
export const ZOMBIE_SKIN_PALETTE: readonly string[] = [
  "#9cb87b", "#93a874", "#7d9a62", "#a4b57e", "#86927a", "#9aa86b", "#b0c290", "#8fa98a",
];

// Grave dirt, mould and rotted fabric for everything that isn't skin.
export const ZOMBIE_CLOTH_PALETTE: readonly string[] = [
  "#7f6f4e", "#5d5643", "#3f4436", "#6b5a44", "#4a4a52", "#59493b", "#6e7257", "#54604a",
];

export const ZOMBIE_THEME: RandomTheme = {
  tag: "zombie",
  // Zombies mostly lose their hats and rarely hold on to anything; hair
  // survives death better than headwear does.
  presence: { hair: 0.8, helmet: 0.2, weapon: 0.25, weapon2: 0.1 },
  palettes: { skin: ZOMBIE_SKIN_PALETTE },
  defaultPalette: ZOMBIE_CLOTH_PALETTE,
  halfEyeChance: 0.4,
};

// Rust, road leather and engine grime for everything that isn't skin — same
// mid-lightness rule so the recolour ramp survives.
export const RAIDER_CLOTH_PALETTE: readonly string[] = [
  "#a25b32", "#8a4034", "#7a5636", "#6d7050", "#a08a5a", "#5c646e", "#8f7f52", "#4a4a50",
];

export const RAIDER_THEME: RandomTheme = {
  tag: "raider",
  // Raiders keep their gear: armed nearly always, spiky headwear common —
  // and alert, so half-lidded resting eyes are rarer than the stock roll.
  presence: { hair: 0.75, helmet: 0.6, weapon: 0.85, weapon2: 0.35 },
  // Skin stays on the channel's own human palette (empty = defer): raiders
  // are alive, just badly behaved.
  palettes: { skin: [] },
  defaultPalette: RAIDER_CLOTH_PALETTE,
  halfEyeChance: 0.15,
};

// Chassis finishes — chrome, steel, gunmetal, copper, brass, oxidised
// bronze — mid-lightness so the recolour ramp survives. Painted onto the
// robot bodies' `skin` channel (the chassis is drawn in the standard body
// two-colour scheme precisely so this palette is what makes it metal).
export const ROBOT_METAL_PALETTE: readonly string[] = [
  "#9aa7b5", "#7d8a99", "#646e7d", "#a3785a", "#a88f4a", "#8a7a70", "#5f7d6e", "#8f6a5a",
];

// Hazard amber, warning red and industrial greys for whatever a robot ends
// up wearing (a rusty android in a hawaiian shirt is the feature working).
export const ROBOT_ACCENT_PALETTE: readonly string[] = [
  "#b8862e", "#6f7278", "#4a8a8f", "#8a4034", "#5c646e", "#7a5636",
];

export const ROBOT_THEME: RandomTheme = {
  tag: "robot",
  // A bare chassis reads as a robot, so clothes/hair/hats are the rare
  // comedic accident rather than the default; items are common (they were
  // built to hold tools).
  presence: { hair: 0.15, cloth: 0.3, helmet: 0.35, weapon: 0.6, weapon2: 0.25 },
  palettes: { skin: ROBOT_METAL_PALETTE },
  defaultPalette: ROBOT_ACCENT_PALETTE,
  // Half-lidded resting eyes are the LED parts' low-power band.
  halfEyeChance: 0.25,
};

// Weathered ivories and grave greys — mid-lightness on purpose: true
// bone-white would collapse the recolour ramp (see randomTint's clamps).
export const SKELETON_BONE_PALETTE: readonly string[] = [
  "#cfc3a4", "#c2b89e", "#d0c9b6", "#b3a88c", "#bfb098", "#a89d84", "#c7b9a2", "#9a9186",
];

export const SKELETON_THEME: RandomTheme = {
  tag: "skeleton",
  // Bare bones by default; the wardrobe it does roll is the torn set,
  // dual-tagged `zombie` + `skeleton` (grave clothes serve both).
  presence: { hair: 0.1, cloth: 0.35, helmet: 0.3, weapon: 0.5, weapon2: 0.2 },
  palettes: { skin: SKELETON_BONE_PALETTE },
  // Grave dirt is grave dirt — shared with the zombie on purpose.
  defaultPalette: ZOMBIE_CLOTH_PALETTE,
  halfEyeChance: 0.2,
};

// Vestment darks — crimson, plum, midnight — kept mid-lightness enough for
// the recolour ramp.
export const CULTIST_ROBE_PALETTE: readonly string[] = [
  "#7a3a4a", "#6a3a6a", "#4a4a7a", "#5a2f3f", "#3f5a54", "#5a5a6a", "#6b2f2f", "#443a5f",
];

// Ledger golds for the `sigil` channel — its own channel id precisely so
// the theme can gild trim while defaultPalette darkens every `primary`.
export const CULTIST_SIGIL_PALETTE: readonly string[] = [
  "#a88f4a", "#c9a94a", "#b8862e", "#8a6f2e",
];

// Too long in the vault: pale but human.
export const CULTIST_SKIN_PALETTE: readonly string[] = [
  "#f2d3b3", "#ead8c4", "#dcc4ae", "#e8c9b0", "#cdb69c",
];

export const CULTIST_THEME: RandomTheme = {
  tag: "cultist",
  // Always robed (cloth stays at presence 1); nearly always hooded; a
  // ledger or candle in hand more often than not. Hair mostly hidden.
  presence: { hair: 0.25, helmet: 0.9, weapon: 0.6, weapon2: 0.3 },
  palettes: { skin: CULTIST_SKIN_PALETTE, sigil: CULTIST_SIGIL_PALETTE },
  defaultPalette: CULTIST_ROBE_PALETTE,
  // Entranced.
  halfEyeChance: 0.35,
};

export function randomizeThemed(
  model: AaModel,
  character: AaCharacter,
  theme: RandomTheme,
  locked: ReadonlySet<AaSlot> = new Set(),
  rng: Rng = Math.random,
): AaCharacter {
  return rollCharacter(model, character, locked, rng, {
    pool: (all) => {
      const themed = all.filter((p) => (p.tags ?? []).includes(theme.tag));
      if (themed.length > 0) return themed;
      return all.filter((p) => !p.tags?.length);
    },
    channelColor: (channel, r) => {
      const palette = theme.palettes?.[channel.id] ?? theme.defaultPalette;
      if (palette && palette.length > 0) {
        return palette[Math.min(palette.length - 1, Math.floor(r() * palette.length))];
      }
      return randomChannelColor(channel, r);
    },
    presence: { ...RANDOM_SLOT_PRESENCE, ...theme.presence },
    halfEyeChance: theme.halfEyeChance ?? RANDOM_HALF_EYES,
  });
}

// --- the shared roll core -----------------------------------------------

type RollOpts = {
  /** Narrow a slot's full part list to what this roll may pick from. */
  pool: (all: AaPart[]) => AaPart[];
  channelColor: (channel: AaColorChannel, rng: Rng) => string;
  presence: Record<AaSlot, number>;
  halfEyeChance: number;
};

function rollCharacter(
  model: AaModel,
  character: AaCharacter,
  locked: ReadonlySet<AaSlot>,
  rng: Rng,
  opts: RollOpts,
): AaCharacter {
  const picks: AaCharacter["picks"] = {};
  const colors: NonNullable<AaCharacter["colors"]> = {};
  const appearance: NonNullable<AaCharacter["appearance"]> = {};
  // Slots whose pool came back empty — they kept their selection, so
  // downstream rolls (resting eye state) must treat them as locked too.
  const keptByFilter = new Set<AaSlot>();

  for (const slot of AA_SLOTS) {
    if (locked.has(slot)) {
      const keptPick = character.picks[slot];
      if (keptPick) picks[slot] = keptPick;
      const keptColors = character.colors?.[slot];
      if (keptColors && Object.keys(keptColors).length > 0) {
        colors[slot] = { ...keptColors };
      }
      const keptLook = character.appearance?.[slot];
      if (keptLook) appearance[slot] = { ...keptLook };
      continue;
    }

    const all = partsInSlot(model, slot);
    if (all.length === 0) continue;
    // If the pool rule empties a slot that HAS parts, the slot behaves as
    // locked (keeps its current selection) rather than stripping the
    // character — a reroll must never undress a slot it can't redress.
    const options = opts.pool(all);
    if (options.length === 0) {
      keptByFilter.add(slot);
      const keptPick = character.picks[slot];
      if (keptPick) picks[slot] = keptPick;
      const keptColors = character.colors?.[slot];
      if (keptColors && Object.keys(keptColors).length > 0) {
        colors[slot] = { ...keptColors };
      }
      continue;
    }
    if (rng() >= opts.presence[slot]) continue;

    const part = options[Math.min(options.length - 1, Math.floor(rng() * options.length))];
    picks[slot] = part.name;

    const channels = channelsOf(part);
    if (channels.length > 0) {
      const bySlot: Record<string, string> = {};
      for (const channel of channels) bySlot[channel.id] = opts.channelColor(channel, rng);
      colors[slot] = bySlot;
    }
  }

  const next: AaCharacter = { ...character, picks };
  if (Object.keys(colors).length > 0) next.colors = colors;
  else delete next.colors;
  if (Object.keys(appearance).length > 0) next.appearance = appearance;
  else delete next.appearance;

  // Resting eye state rides the eye slot's lock: pinning the eyes pins the
  // whole look of them. Rerolled, it lands on "half" only when the rolled
  // part can actually show it; "open" is deleted rather than stored, same
  // identity rule the editor applies.
  if (!locked.has("eye") && !keptByFilter.has("eye")) {
    const eyePart = next.picks.eye ? findPart(model, "eye", next.picks.eye) : undefined;
    if (eyePart?.eyeBands?.half === true && rng() < opts.halfEyeChance) {
      next.eyeState = "half";
    } else {
      delete next.eyeState;
    }
  }
  return next;
}
