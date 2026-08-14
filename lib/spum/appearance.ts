// Per-character appearance dial (E1c). Six CSS filter functions adjustable
// at two scopes: globally (one filter on the SpumCharacter root div) and
// per-slot (composed onto each slice's existing colour-tint filter).
//
// Channels are independent; missing entry = identity for that channel,
// which we render by simply omitting the corresponding CSS filter function
// — keeping the rendered DOM byte-identical to today when no appearance is
// set on a character.
//
// Effective per-slice filter chain when both colours and appearance are set:
//   filter: url(#tint-...) brightness(...) contrast(...) saturate(...)
//           sepia(...) hue-rotate(...deg) blur(...px)
// Then the global appearance filter applies to the composited character on
// the SpumCharacter root div.

import type { SpumSlot } from "./catalog";

export type AppearanceFields = {
  hue?: number;        // degrees, 0..360 (identity 0)
  saturation?: number; // 0..2 (identity 1; >1 oversaturates, <1 desaturates)
  brightness?: number; // 0..2 (identity 1)
  contrast?: number;   // 0..2 (identity 1)
  sepia?: number;      // 0..1 (identity 0; 1 = full sepia)
  blur?: number;       // px, 0..10 (identity 0)
};

// `appearancePerSlot` keys mirror the SpumSlot union — no `eyeIris` here.
// Per-slot filter functions like hue-rotate or blur on the white sclera are
// either visually neutral or intentional (a uniform shift across all eye
// slices reads correctly), so we don't replicate the `ignoreColorPart: [Back]`
// logic from colour tinting.
export type AppearancePerSlot = Partial<Record<SpumSlot, AppearanceFields>>;

const IDENTITY: Record<keyof AppearanceFields, number> = {
  hue: 0,
  saturation: 1,
  brightness: 1,
  contrast: 1,
  sepia: 0,
  blur: 0,
};

const CHANNEL_KEYS = Object.keys(IDENTITY) as (keyof AppearanceFields)[];

export function isAppearanceIdentity(a: AppearanceFields | undefined): boolean {
  if (!a) return true;
  for (const k of CHANNEL_KEYS) {
    const v = a[k];
    if (v !== undefined && v !== IDENTITY[k]) return false;
  }
  return true;
}

// Emit the CSS `filter` value for the given appearance, omitting any channel
// at its identity value. Returns undefined when input is undefined or every
// channel is identity, so the caller can skip setting `style.filter` entirely
// (avoids creating a new stacking context on slices/root for nothing).
//
// Order matches a sensible visual pipeline: brightness/contrast/saturate
// shape tone first, sepia recolours, hue-rotate then shifts, and blur is
// applied last so the soft halo respects the prior colour treatment.
export function cssFilterFromAppearance(
  a: AppearanceFields | undefined,
): string | undefined {
  if (!a) return undefined;
  const parts: string[] = [];
  if (a.brightness !== undefined && a.brightness !== IDENTITY.brightness) {
    parts.push(`brightness(${a.brightness})`);
  }
  if (a.contrast !== undefined && a.contrast !== IDENTITY.contrast) {
    parts.push(`contrast(${a.contrast})`);
  }
  if (a.saturation !== undefined && a.saturation !== IDENTITY.saturation) {
    parts.push(`saturate(${a.saturation})`);
  }
  if (a.sepia !== undefined && a.sepia !== IDENTITY.sepia) {
    parts.push(`sepia(${a.sepia})`);
  }
  if (a.hue !== undefined && a.hue !== IDENTITY.hue) {
    parts.push(`hue-rotate(${a.hue}deg)`);
  }
  if (a.blur !== undefined && a.blur !== IDENTITY.blur) {
    parts.push(`blur(${a.blur}px)`);
  }
  return parts.length > 0 ? parts.join(" ") : undefined;
}

export const APPEARANCE_CHANNELS: {
  key: keyof AppearanceFields;
  label: string;
  min: number;
  max: number;
  step: number;
  identity: number;
}[] = [
  { key: "hue",        label: "hue",        min: 0, max: 360, step: 1,    identity: 0 },
  { key: "saturation", label: "saturate",   min: 0, max: 2,   step: 0.05, identity: 1 },
  { key: "brightness", label: "brightness", min: 0, max: 2,   step: 0.05, identity: 1 },
  { key: "contrast",   label: "contrast",   min: 0, max: 2,   step: 0.05, identity: 1 },
  { key: "sepia",      label: "sepia",      min: 0, max: 1,   step: 0.05, identity: 0 },
  { key: "blur",       label: "blur",       min: 0, max: 10,  step: 0.1,  identity: 0 },
];

export type AppearancePreset = {
  name: string;
  // Empty fields means "Reset" — applyPreset clears everything when name is
  // "Reset". Otherwise these are the channels the preset writes; channels
  // it doesn't touch are preserved on the existing value.
  fields: AppearanceFields;
};

// Preset buttons write directly into the underlying channels — there is no
// separate preset state. See Decisions Log entry "Preset buttons write
// underlying channels (no separate state)" in
// docs/spum-engine-completeness.md.
export const APPEARANCE_PRESETS: AppearancePreset[] = [
  { name: "Reset",        fields: {} },
  { name: "Sick",         fields: { brightness: 0.92, contrast: 0.85, saturation: 0.55 } },
  { name: "Energised",    fields: { brightness: 1.05, contrast: 1.25, saturation: 1.3 } },
  { name: "Flashback",    fields: { sepia: 0.85, saturation: 0.5 } },
  { name: "Out of focus", fields: { blur: 2.5, brightness: 0.9 } },
  { name: "Spotlight",    fields: { brightness: 1.15, contrast: 1.15 } },
];

// Apply a preset to the current value. "Reset" clears everything. Otherwise
// clobber the channels the preset writes; channels it doesn't touch stay
// as-is. Returns undefined when the result is identity so callers can prune
// the field off the config.
export function applyPreset(
  current: AppearanceFields | undefined,
  preset: AppearancePreset,
): AppearanceFields | undefined {
  if (preset.name === "Reset") return undefined;
  const next: AppearanceFields = { ...(current ?? {}) };
  for (const k of CHANNEL_KEYS) {
    const v = preset.fields[k];
    if (v !== undefined) next[k] = v;
  }
  return isAppearanceIdentity(next) ? undefined : next;
}

// Set a single channel on appearance fields. Identity values prune the
// channel; passing undefined also prunes. Returns undefined when the result
// is identity so callers can drop the field.
export function setAppearanceChannel(
  current: AppearanceFields | undefined,
  key: keyof AppearanceFields,
  value: number | undefined,
): AppearanceFields | undefined {
  const next: AppearanceFields = { ...(current ?? {}) };
  if (value === undefined || value === IDENTITY[key]) {
    delete next[key];
  } else {
    next[key] = value;
  }
  return isAppearanceIdentity(next) ? undefined : next;
}
