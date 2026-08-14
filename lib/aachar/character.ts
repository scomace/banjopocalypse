// AA character pipeline — construction and validation of project documents.

import type { SpriteAtlas } from "@/lib/spum/types";

import { AA_CHANNELS, type AaChannelPose, type AaPose, checkClip } from "./clip";
import { STOCK_GEOMETRY, geometryEquals } from "./geometry";
import { horseModelError } from "./horse/model";
import { isHex } from "./recolor";
import { AA_DEFAULT_Z } from "./skeleton";
import {
  AA_GAZE_DIRECTIONS,
  AA_HAT_HAIR_MODES,
  AA_SHADE_STYLES,
  AA_SLOTS,
  DERIVED_GEOMETRY_SLOTS,
  type AaCharacter,
  type AaColorChannel,
  type AaGeometry,
  type AaModel,
  type AaOutfit,
  type AaPart,
  type AaPlacement,
  type AaProject,
  type AaSkeletonOverrides,
  type AaSlot,
} from "./types";

const SLOT_SET = new Set<string>(AA_SLOTS);
const DERIVED_SET = new Set<string>(DERIVED_GEOMETRY_SLOTS);

export const NAME_RE = /^[A-Za-z][A-Za-z0-9]*$/;

// A new model starts at SPUM's stock proportions rather than at something
// arbitrary — it gives the onion skin something to line up against on the
// first stroke, and every subsequent change is a deliberate departure from a
// known baseline instead of a guess.
export function createBlankModel(): AaModel {
  return {
    geometry: { ...STOCK_GEOMETRY },
    parts: [],
    skeleton: {},
    zOrder: { ...AA_DEFAULT_Z },
  };
}

// Effective draw order: AA's starting stack, then the model's own overrides.
// The fallback means a model saved before `zOrder` existed still picks up the
// AA defaults rather than silently reverting to SPUM's chibi stacking.
export function effectiveZOrder(model: AaModel): Record<string, number> {
  return { ...AA_DEFAULT_Z, ...(model.zOrder ?? {}) };
}

// A character's proportions are a per-bone DELTA over the model's base build,
// so tuning the base moves every character that hasn't explicitly overridden
// that bone. Merged by bone path, not deep-merged by axis: a character that
// overrides a bone owns both of its axes.
export function effectiveProportions(
  model: AaModel,
  character: AaCharacter,
): AaSkeletonOverrides {
  return { ...model.skeleton, ...character.skeleton };
}

export function createBlankCharacter(name: string): AaCharacter {
  // `shading: "cel"` is the house style — every shipped character wears it,
  // so new characters start with it rather than unshaded (2026-08-01).
  return { name, picks: {}, skeleton: {}, shading: "cel" };
}

export function createBlankProject(): AaProject {
  return { version: 1, model: createBlankModel(), characters: [] };
}

// --- lookups -----------------------------------------------------------

export function findPart(
  model: AaModel,
  slot: AaSlot,
  name: string,
): AaPart | undefined {
  return (
    model.parts.find((p) => p.slot === slot && p.name === name) ??
    // weapon2 (item L) borrows weapon's library — same art, other hand,
    // mirroring how the SPUM catalog shares weapon's keys for weapon2.
    (slot === "weapon2"
      ? model.parts.find((p) => p.slot === "weapon" && p.name === name)
      : undefined)
  );
}

export function partsInSlot(model: AaModel, slot: AaSlot): AaPart[] {
  const own = model.parts.filter((p) => p.slot === slot);
  if (slot !== "weapon2") return own;
  const names = new Set(own.map((p) => p.name));
  return [
    ...own,
    ...model.parts.filter((p) => p.slot === "weapon" && !names.has(p.name)),
  ];
}

// --- theme tags --------------------------------------------------------

// Lowercase slugs, deliberately narrower than NAME_RE: tags are shared
// vocabulary across parts ("zombie", "boss"), and case-variant near-twins
// ("Zombie" vs "zombie") would silently split one theme into two filters.
export const PART_TAG_RE = /^[a-z][a-z0-9-]*$/;

/** Every tag any part declares, sorted — the Randomize filter's checklist. */
export function allPartTags(model: AaModel): string[] {
  const tags = new Set<string>();
  for (const part of model.parts) for (const tag of part.tags ?? []) tags.add(tag);
  return Array.from(tags).sort();
}

// --- colour channels ---------------------------------------------------

export const CHANNEL_ID_RE = /^[A-Za-z][A-Za-z0-9]*$/;

export function channelsOf(part: AaPart | undefined): AaColorChannel[] {
  return part?.colorChannels ?? [];
}

// A character's colour picks for one slot, filtered to channels the picked part
// actually declares. Retagging a part — or picking a different one — leaves
// stale ids behind in the character; dropping them here means a stale id is
// inert rather than a recolour of something that no longer exists.
export function colorPicksFor(
  model: AaModel,
  character: AaCharacter,
  slot: AaSlot,
): Record<string, string> {
  const name = character.picks[slot];
  if (!name) return {};
  const declared = new Set(channelsOf(findPart(model, slot, name)).map((c) => c.id));
  const picks = character.colors?.[slot] ?? {};
  const out: Record<string, string> = {};
  for (const [id, hex] of Object.entries(picks)) {
    if (declared.has(id) && isHex(hex)) out[id] = hex;
  }
  return out;
}

// An unused channel id, derived from `base` — "primary", then "primary2".
export function suggestChannelId(
  channels: readonly AaColorChannel[],
  base: string,
): string {
  const taken = new Set(channels.map((c) => c.id));
  if (!taken.has(base)) return base;
  for (let n = 2; n < 100; n++) {
    if (!taken.has(`${base}${n}`)) return `${base}${n}`;
  }
  return base;
}

// Identity placements are deleted rather than stored (same rule as
// appearance), so "adjusted" stays a meaningful mark on the character.
export function isIdentityPlacement(p: AaPlacement | undefined): boolean {
  if (!p) return true;
  return !p.dx && !p.dy && !p.rot && !p.flipX;
}

// A part is stale when it was drawn against a geometry the model has since
// moved away from: its pixels sit in rects that are no longer those sizes, so
// it will render misaligned. Expected to happen often while the look is being
// explored — the point is that it's visible, not that it's prevented.
export function isPartStale(model: AaModel, part: AaPart): boolean {
  if (!DERIVED_SET.has(part.slot)) return false;
  if (!part.authoredFor) return false;
  return !geometryEquals(part.authoredFor, model.geometry);
}

export function stalePartsOf(model: AaModel): AaPart[] {
  return model.parts.filter((p) => isPartStale(model, p));
}

// Picks that name a part which isn't in the library (deleted, renamed, or an
// imported character pointing at art this project doesn't have).
export function danglingPicks(
  model: AaModel,
  character: AaCharacter,
): { slot: AaSlot; name: string }[] {
  const out: { slot: AaSlot; name: string }[] = [];
  for (const [slot, name] of Object.entries(character.picks)) {
    if (!name) continue;
    if (!findPart(model, slot as AaSlot, name)) {
      out.push({ slot: slot as AaSlot, name });
    }
  }
  return out;
}

// --- validation --------------------------------------------------------

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function isSize(v: unknown): boolean {
  if (typeof v !== "object" || v === null) return false;
  const s = v as Record<string, unknown>;
  return (
    isFiniteNumber(s.width) &&
    isFiniteNumber(s.height) &&
    s.width > 0 &&
    s.height > 0
  );
}

function isGeometry(v: unknown): v is AaGeometry {
  if (typeof v !== "object" || v === null) return false;
  const g = v as Record<string, unknown>;
  return isSize(g.head) && isSize(g.body) && isSize(g.arm) && isSize(g.foot);
}

function isAtlas(v: unknown): v is SpriteAtlas {
  if (typeof v !== "object" || v === null) return false;
  const a = v as Record<string, unknown>;
  if (typeof a.image !== "string") return false;
  if (!isFiniteNumber(a.width) || !isFiniteNumber(a.height)) return false;
  // Hi-res atlas fields (Phase 8). Optional; when present they must be sane —
  // a zero/negative density would render the part at infinite size.
  if (a.pixelDensity !== undefined && (!isFiniteNumber(a.pixelDensity) || a.pixelDensity <= 0)) {
    return false;
  }
  if (a.smooth !== undefined && typeof a.smooth !== "boolean") return false;
  if (typeof a.regions !== "object" || a.regions === null) return false;
  return Object.values(a.regions as Record<string, unknown>).every((r) => {
    if (typeof r !== "object" || r === null) return false;
    const reg = r as Record<string, unknown>;
    const pivot = reg.pivot as Record<string, unknown> | undefined;
    return (
      isFiniteNumber(reg.x) &&
      isFiniteNumber(reg.y) &&
      isFiniteNumber(reg.width) &&
      isFiniteNumber(reg.height) &&
      !!pivot &&
      isFiniteNumber(pivot.x) &&
      isFiniteNumber(pivot.y)
    );
  });
}

// A colour channel is only meaningful if its base is one of the entries it
// remaps — every other entry's new colour is derived from where the base moves
// to, so a base outside the ramp anchors the maths to a shade the sprite
// doesn't contain.
//
// A dangling base is REPAIRED (re-anchored to the first ramp entry, the same
// rule `toggleRampColor` applies) rather than rejected. The editor could
// historically save this state — a fresh channel's placeholder black base
// survived tagging — and rejecting it failed every load path at once: the
// localStorage draft, the manifest, AND the blank-boot recovery fetch, which
// reads as total data loss over one hex field nothing downstream chokes on.
function colorChannelError(raw: unknown): string | null {
  if (typeof raw !== "object" || raw === null) return "channel is not an object";
  const c = raw as Record<string, unknown>;
  if (typeof c.id !== "string" || !CHANNEL_ID_RE.test(c.id)) {
    return `channel has an invalid id: ${JSON.stringify(c.id)}`;
  }
  if (c.label !== undefined && typeof c.label !== "string") {
    return `channel "${c.id}" has a non-string label`;
  }
  if (!isHex(c.base)) return `channel "${c.id}" has an invalid base colour`;
  const base = c.base.toLowerCase();
  if (!Array.isArray(c.ramp) || c.ramp.length === 0) {
    return `channel "${c.id}" has an empty ramp`;
  }
  if (!c.ramp.every(isHex)) return `channel "${c.id}" has a non-hex ramp entry`;
  if (!c.ramp.some((hex: string) => hex.toLowerCase() === base)) {
    c.base = c.ramp[0];
  }
  // A malformed palette would silently fall back to unconstrained tints —
  // rejected at the door for the same reason as eyeBands.
  if (c.randomPalette !== undefined) {
    if (!Array.isArray(c.randomPalette) || c.randomPalette.length === 0) {
      return `channel "${c.id}" has an empty randomPalette`;
    }
    if (!c.randomPalette.every(isHex)) {
      return `channel "${c.id}" has a non-hex randomPalette entry`;
    }
  }
  return null;
}

// The outline guard. A malformed one would silently stop protecting, so it's
// rejected rather than coerced.
function protectError(raw: unknown): string | null {
  if (typeof raw !== "object" || raw === null) return "protect is not an object";
  const p = raw as Record<string, unknown>;
  if (p.maxLightness !== undefined) {
    if (!isFiniteNumber(p.maxLightness) || p.maxLightness < 0 || p.maxLightness > 1) {
      return "protect.maxLightness must be between 0 and 1";
    }
  }
  if (p.colors !== undefined) {
    if (!Array.isArray(p.colors)) return "protect.colors must be an array";
    if (!p.colors.every(isHex)) return "protect.colors has a non-hex entry";
  }
  return null;
}

// Appearance multipliers are bounded so an imported bundle can't ask for a
// transform that renders as a flat block. Hue wraps, so it's the one field with
// a signed range.
function appearanceError(raw: unknown): string | null {
  if (typeof raw !== "object" || raw === null) return "appearance is not an object";
  const a = raw as Record<string, unknown>;
  if (a.hue !== undefined && (!isFiniteNumber(a.hue) || Math.abs(a.hue) > 360)) {
    return "appearance.hue must be within ±360";
  }
  for (const k of ["saturation", "brightness", "contrast"] as const) {
    const v = a[k];
    if (v === undefined) continue;
    if (!isFiniteNumber(v) || v < 0 || v > 4) return `appearance.${k} must be between 0 and 4`;
  }
  return null;
}

// Placement offsets are bounded to keep an imported bundle from parking a
// part off-rig; the ends are far past anything a fit needs (the whole
// character is ~40 source px tall).
function placementError(raw: unknown): string | null {
  if (typeof raw !== "object" || raw === null) return "placement is not an object";
  const p = raw as Record<string, unknown>;
  for (const k of ["dx", "dy"] as const) {
    const v = p[k];
    if (v === undefined) continue;
    if (!isFiniteNumber(v) || Math.abs(v) > 200) return `placement.${k} must be within ±200`;
  }
  if (p.rot !== undefined && (!isFiniteNumber(p.rot) || Math.abs(p.rot) > 360)) {
    return "placement.rot must be within ±360";
  }
  if (p.flipX !== undefined && typeof p.flipX !== "boolean") {
    return "placement.flipX must be a boolean";
  }
  return null;
}

// The eye boxes + pupil marks (Phase 12). Band-relative, so bounds against
// the band itself can't be checked here (the atlas isn't decoded during
// validation) — but shape, integer-ness and pupil-inside-box can, and those
// are the mistakes an imported bundle could actually carry.
function partEyesError(raw: unknown): string | null {
  if (typeof raw !== "object" || raw === null) return "eyes is not an object";
  const eyes = raw as Record<string, unknown>;
  for (const side of ["left", "right"] as const) {
    const spec = eyes[side] as Record<string, unknown> | null | undefined;
    if (!spec || typeof spec !== "object") return `eyes.${side} is missing`;
    const box = spec.box as Record<string, unknown> | null | undefined;
    const pupil = spec.pupil as Record<string, unknown> | null | undefined;
    if (!box || typeof box !== "object") return `eyes.${side}.box is missing`;
    if (!pupil || typeof pupil !== "object") return `eyes.${side}.pupil is missing`;
    for (const k of ["x", "y", "width", "height"] as const) {
      const v = box[k];
      if (!isFiniteNumber(v) || !Number.isInteger(v)) return `eyes.${side}.box.${k} is invalid`;
    }
    if ((box.width as number) < 1 || (box.height as number) < 1) {
      return `eyes.${side}.box has no area`;
    }
    for (const k of ["x", "y"] as const) {
      const v = pupil[k];
      if (!isFiniteNumber(v) || !Number.isInteger(v)) return `eyes.${side}.pupil.${k} is invalid`;
    }
    const px = pupil.x as number;
    const py = pupil.y as number;
    if (
      px < (box.x as number) ||
      px >= (box.x as number) + (box.width as number) ||
      py < (box.y as number) ||
      py >= (box.y as number) + (box.height as number)
    ) {
      return `eyes.${side}.pupil sits outside its box`;
    }
  }
  return null;
}

// Per-eye nudge (Phase 12). Bounded like placement, tighter — an eye that
// leaves its band is gone, and the band is at most 160px.
function eyeNudgeError(raw: unknown): string | null {
  if (typeof raw !== "object" || raw === null) return "eyeNudge is not an object";
  const nudge = raw as Record<string, unknown>;
  for (const side of ["left", "right"] as const) {
    const n = nudge[side];
    if (n === undefined) continue;
    if (typeof n !== "object" || n === null) return `eyeNudge.${side} is invalid`;
    for (const k of ["dx", "dy"] as const) {
      const v = (n as Record<string, unknown>)[k];
      if (v === undefined) continue;
      if (!isFiniteNumber(v) || Math.abs(v) > 32) {
        return `eyeNudge.${side}.${k} must be within ±32`;
      }
    }
  }
  return null;
}

const CHANNEL_SET = new Set<string>(AA_CHANNELS);

// A pose is a sparse map of channel → up to three numbers. Rejecting an
// unknown channel matters more than it looks: the compiler silently ignores
// one, so a typo'd `lfoot`/`leftfoot` in an imported bundle would produce a
// clip that plays but never moves that limb.
function isPose(v: unknown): v is AaPose {
  if (typeof v !== "object" || v === null) return false;
  return Object.entries(v as Record<string, unknown>).every(([ch, raw]) => {
    if (!CHANNEL_SET.has(ch)) return false;
    if (typeof raw !== "object" || raw === null) return false;
    const p = raw as Record<string, unknown>;
    return (["rot", "x", "y"] as (keyof AaChannelPose)[]).every(
      (k) => p[k] === undefined || isFiniteNumber(p[k]),
    );
  });
}

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

function fail<T>(error: string): ValidationResult<T> {
  return { ok: false, error };
}

export function validateModel(value: unknown): ValidationResult<AaModel> {
  if (typeof value !== "object" || value === null) return fail("model is not an object");
  const m = value as Record<string, unknown>;
  if (!isGeometry(m.geometry)) return fail("model has invalid or missing geometry");
  if (!Array.isArray(m.parts)) return fail("model.parts must be an array");
  if (typeof m.skeleton !== "object" || m.skeleton === null) {
    return fail("model.skeleton must be an object");
  }
  if (m.zOrder !== undefined) {
    if (typeof m.zOrder !== "object" || m.zOrder === null) {
      return fail("model.zOrder must be an object");
    }
    for (const [path, z] of Object.entries(m.zOrder as Record<string, unknown>)) {
      if (!isFiniteNumber(z)) return fail(`model has an invalid draw order for "${path}"`);
    }
  }
  for (const [path, pos] of Object.entries(m.skeleton as Record<string, unknown>)) {
    const p = pos as Record<string, unknown> | null;
    if (!p || !isFiniteNumber(p.x) || !isFiniteNumber(p.y)) {
      return fail(`model has an invalid base proportion for "${path}"`);
    }
  }
  if (m.stance !== undefined && !isPose(m.stance)) return fail("model.stance is not a valid pose");
  if (m.clips !== undefined) {
    if (typeof m.clips !== "object" || m.clips === null) {
      return fail("model.clips must be an object");
    }
    for (const [key, raw] of Object.entries(m.clips as Record<string, unknown>)) {
      if (typeof raw !== "object" || raw === null) return fail(`clip "${key}" is not an object`);
      const c = raw as Record<string, unknown>;
      if (c.name !== key) return fail(`clip "${key}" is keyed under a different name`);
      if (!isFiniteNumber(c.frames) || typeof c.loop !== "boolean") {
        return fail(`clip "${key}" is missing frames or loop`);
      }
      if (c.rest !== undefined && !isPose(c.rest)) return fail(`clip "${key}" has an invalid rest pose`);
      if (!Array.isArray(c.beats)) return fail(`clip "${key}" has no beats`);
      for (const b of c.beats) {
        const beat = b as Record<string, unknown> | null;
        if (!beat || !isFiniteNumber(beat.frame) || typeof beat.role !== "string") {
          return fail(`clip "${key}" has a malformed beat`);
        }
        if (!isPose(beat.pose)) return fail(`clip "${key}" has a beat with an invalid pose`);
      }
      // Shape is sound — now the structural rules (grid, endpoints, loop
      // closure). Deferred until here because `checkClip` assumes the shape.
      const errors = checkClip(raw as Parameters<typeof checkClip>[0]).filter(
        (p) => p.level === "error",
      );
      if (errors.length > 0) return fail(`clip "${key}": ${errors[0].message}`);
    }
  }
  // The AA horse block (docs/aachar-horse-plan.md). Validated by the horse
  // module so all horse shape knowledge lives in one place.
  if (m.horse !== undefined) {
    const horseErr = horseModelError(m.horse);
    if (horseErr) return fail(horseErr);
  }

  const seen = new Set<string>();
  for (const raw of m.parts) {
    if (typeof raw !== "object" || raw === null) return fail("part is not an object");
    const p = raw as Record<string, unknown>;
    if (typeof p.name !== "string" || !NAME_RE.test(p.name)) {
      return fail(`part has an invalid name: ${JSON.stringify(p.name)}`);
    }
    if (!SLOT_SET.has(p.slot as string)) {
      return fail(`part "${p.name}" has unknown slot: ${JSON.stringify(p.slot)}`);
    }
    if (!isAtlas(p.atlas)) return fail(`part "${p.name}" has an invalid atlas`);
    if (p.source !== undefined && typeof p.source !== "string") {
      return fail(`part "${p.name}" has a non-string source`);
    }
    if (p.authoredFor !== undefined && !isGeometry(p.authoredFor)) {
      return fail(`part "${p.name}" has an invalid authoredFor geometry`);
    }
    if (p.colorChannels !== undefined) {
      if (!Array.isArray(p.colorChannels)) {
        return fail(`part "${p.name}" has a non-array colorChannels`);
      }
      const ids = new Set<string>();
      for (const raw of p.colorChannels) {
        const err = colorChannelError(raw);
        if (err) return fail(`part "${p.name}": ${err}`);
        const id = (raw as AaColorChannel).id;
        // Picks are keyed by id, so a duplicate would make a colour resolve
        // against whichever channel happened to come first.
        if (ids.has(id)) return fail(`part "${p.name}" has duplicate channel "${id}"`);
        ids.add(id);
      }
    }
    if (p.protect !== undefined) {
      const err = protectError(p.protect);
      if (err) return fail(`part "${p.name}": ${err}`);
    }
    // Eye band flags (Phase 11). A malformed block would silently gate the
    // state swap, so it's rejected rather than coerced.
    if (p.eyeBands !== undefined) {
      const b = p.eyeBands as Record<string, unknown> | null;
      if (
        typeof b !== "object" ||
        b === null ||
        (b.half !== undefined && typeof b.half !== "boolean") ||
        (b.close !== undefined && typeof b.close !== "boolean")
      ) {
        return fail(`part "${p.name}" has invalid eyeBands`);
      }
    }
    // Eye boxes + pupil marks (Phase 12). The pupil must sit inside its box
    // — a mark outside it can never flood a pupil and would make nudge/gaze
    // silently dead, which is exactly the failure worth rejecting at the
    // door.
    if (p.eyes !== undefined) {
      const err = partEyesError(p.eyes);
      if (err) return fail(`part "${p.name}": ${err}`);
    }
    // Theme tags. Duplicates rejected because the Randomize filter counts a
    // part excluded if ANY tag matches — a doubled tag is always author error.
    if (p.tags !== undefined) {
      if (!Array.isArray(p.tags) || p.tags.length === 0) {
        return fail(`part "${p.name}" has empty tags (omit the field instead)`);
      }
      const tagSeen = new Set<string>();
      for (const tag of p.tags) {
        if (typeof tag !== "string" || !PART_TAG_RE.test(tag)) {
          return fail(`part "${p.name}" has an invalid tag: ${JSON.stringify(tag)}`);
        }
        if (tagSeen.has(tag)) return fail(`part "${p.name}" has duplicate tag "${tag}"`);
        tagSeen.add(tag);
      }
    }
    // Slot+name is the identity picks resolve against; a duplicate would make
    // resolution order-dependent.
    const key = `${String(p.slot)}/${p.name}`;
    if (seen.has(key)) return fail(`duplicate part: ${key}`);
    seen.add(key);
  }
  return { ok: true, value: value as AaModel };
}

// Picks have the same shape on a character and an outfit; `who` prefixes the
// error so it names whichever kind failed. Assumes the caller already checked
// `picks` is an object.
function picksError(picks: object, who: string): string | null {
  for (const [slot, name] of Object.entries(picks as Record<string, unknown>)) {
    if (!SLOT_SET.has(slot)) return `${who} picks unknown slot: "${slot}"`;
    if (name !== undefined && typeof name !== "string") {
      return `${who} has a non-string pick for "${slot}"`;
    }
  }
  return null;
}

// Colours, appearance and placement — the LOOK half of a character — validate
// identically on characters and outfits, so both call this.
function lookBlockError(source: Record<string, unknown>, who: string): string | null {
  if (source.colors !== undefined) {
    if (typeof source.colors !== "object" || source.colors === null) {
      return `${who} has invalid colours`;
    }
    for (const [slot, byChannel] of Object.entries(source.colors as Record<string, unknown>)) {
      if (!SLOT_SET.has(slot)) {
        return `${who} colours an unknown slot: "${slot}"`;
      }
      if (typeof byChannel !== "object" || byChannel === null) {
        return `${who} has invalid colours for "${slot}"`;
      }
      // Channel ids are NOT checked against the picked part here: a character
      // may legitimately be validated before the part it names exists (an
      // imported bundle applies the model and characters together), and a stale
      // id is filtered at read time by `colorPicksFor` rather than rejected.
      for (const [id, hex] of Object.entries(byChannel as Record<string, unknown>)) {
        if (!isHex(hex)) {
          return `${who} has an invalid colour for ${slot}/${id}`;
        }
      }
    }
  }
  if (source.appearance !== undefined) {
    if (typeof source.appearance !== "object" || source.appearance === null) {
      return `${who} has an invalid appearance`;
    }
    for (const [slot, raw] of Object.entries(source.appearance as Record<string, unknown>)) {
      if (!SLOT_SET.has(slot)) {
        return `${who} has an appearance for unknown slot: "${slot}"`;
      }
      const err = appearanceError(raw);
      if (err) return `${who} ${slot}: ${err}`;
    }
  }
  if (source.placement !== undefined) {
    if (typeof source.placement !== "object" || source.placement === null) {
      return `${who} has an invalid placement`;
    }
    for (const [slot, raw] of Object.entries(source.placement as Record<string, unknown>)) {
      if (!SLOT_SET.has(slot)) {
        return `${who} has a placement for unknown slot: "${slot}"`;
      }
      const err = placementError(raw);
      if (err) return `${who} ${slot}: ${err}`;
    }
  }
  if (
    source.hatHair !== undefined &&
    !AA_HAT_HAIR_MODES.includes(source.hatHair as (typeof AA_HAT_HAIR_MODES)[number])
  ) {
    return `${who} has an unknown hat-hair mode: ${JSON.stringify(source.hatHair)}`;
  }
  return null;
}

export function validateCharacter(value: unknown): ValidationResult<AaCharacter> {
  if (typeof value !== "object" || value === null) return fail("character is not an object");
  const c = value as Record<string, unknown>;
  if (typeof c.name !== "string" || !NAME_RE.test(c.name)) {
    return fail(`character has an invalid name: ${JSON.stringify(c.name)}`);
  }
  const who = `character "${c.name}"`;
  if (typeof c.picks !== "object" || c.picks === null) return fail("character.picks must be an object");
  const pickErr = picksError(c.picks, who);
  if (pickErr) return fail(pickErr);
  if (typeof c.skeleton !== "object" || c.skeleton === null) {
    return fail(`${who} has invalid skeleton overrides`);
  }
  for (const [path, pos] of Object.entries(c.skeleton as Record<string, unknown>)) {
    const p = pos as Record<string, unknown> | null;
    if (!p || !isFiniteNumber(p.x) || !isFiniteNumber(p.y)) {
      return fail(`${who} has an invalid override for "${path}"`);
    }
  }
  const lookErr = lookBlockError(c, who);
  if (lookErr) return fail(lookErr);
  // Resting eye state (Phase 11): open or half only — `closed` is clip/scene
  // territory, and persisting it on a character would be a mistake worth
  // rejecting at the door.
  if (c.eyeState !== undefined && c.eyeState !== "open" && c.eyeState !== "half") {
    return fail(`${who} has an invalid eyeState: ${JSON.stringify(c.eyeState)}`);
  }
  if (c.eyeNudge !== undefined) {
    const err = eyeNudgeError(c.eyeNudge);
    if (err) return fail(`${who}: ${err}`);
  }
  // Resting gaze (Phase 12 follow-up): one of the eight directions for both
  // eyes, or a per-eye pair (crazy eyes) whose set sides are directions.
  // Like eye marks, a character may validate before the eye part it names
  // exists — no resolution against the part library here.
  if (c.gaze !== undefined) {
    const isDir = (v: unknown) =>
      AA_GAZE_DIRECTIONS.includes(v as (typeof AA_GAZE_DIRECTIONS)[number]);
    const g = c.gaze;
    const gap = typeof g === "object" && g !== null ? (g as Record<string, unknown>).gap : undefined;
    // The gap is a whites sliver, not a throw distance — a handful of pixels
    // is the whole useful range. A number speaks for both eyes; the object
    // form sets each side.
    const gapValueOk = (v: unknown) =>
      isFiniteNumber(v) && Number.isInteger(v) && v >= 0 && v <= 8;
    const gapOk =
      gap === undefined ||
      gapValueOk(gap) ||
      (typeof gap === "object" &&
        gap !== null &&
        (["left", "right"] as const).every((side) => {
          const v = (gap as Record<string, unknown>)[side];
          return v === undefined || gapValueOk(v);
        }));
    // A side may also be a manual pupil offset — bounded like the eye nudge,
    // it can never push a pupil off the whites anyway (the bake clamps).
    const offsetOk = (v: unknown) => {
      if (typeof v !== "object" || v === null) return false;
      return (["dx", "dy"] as const).every((k) => {
        const n = (v as Record<string, unknown>)[k];
        return (
          n === undefined ||
          (isFiniteNumber(n) && Number.isInteger(n) && Math.abs(n) <= 32)
        );
      });
    };
    const pairOk =
      typeof g === "object" &&
      g !== null &&
      (["left", "right"] as const).every((side) => {
        const v = (g as Record<string, unknown>)[side];
        return v === undefined || isDir(v) || offsetOk(v);
      }) &&
      gapOk;
    if (!isDir(g) && !pairOk) {
      return fail(`${who} has an invalid gaze: ${JSON.stringify(c.gaze)}`);
    }
  }
  // Lighting (Phase 13). A stored "none" is tolerated (the editor deletes it,
  // but hat-hair set the precedent that a hand-edited bundle carrying the
  // identity value shouldn't be rejected).
  if (
    c.shading !== undefined &&
    !AA_SHADE_STYLES.includes(c.shading as (typeof AA_SHADE_STYLES)[number])
  ) {
    return fail(`${who} has an invalid shading style: ${JSON.stringify(c.shading)}`);
  }
  if (
    c.groundShadow !== undefined &&
    c.groundShadow !== "ellipse" &&
    c.groundShadow !== "silhouette"
  ) {
    return fail(`${who} has an invalid ground shadow: ${JSON.stringify(c.groundShadow)}`);
  }
  return { ok: true, value: value as AaCharacter };
}

// An outfit is the look half of a character and validates the same way, minus
// the skeleton it deliberately doesn't have. Picks are not resolved against
// the part library, same rule as characters — a bundle validates before its
// parts exist, and a dangling pick surfaces at wear time via `danglingPicks`.
export function validateOutfit(value: unknown): ValidationResult<AaOutfit> {
  if (typeof value !== "object" || value === null) return fail("outfit is not an object");
  const o = value as Record<string, unknown>;
  if (typeof o.name !== "string" || !NAME_RE.test(o.name)) {
    return fail(`outfit has an invalid name: ${JSON.stringify(o.name)}`);
  }
  const who = `outfit "${o.name}"`;
  if (typeof o.picks !== "object" || o.picks === null) {
    return fail(`${who} has no picks`);
  }
  const pickErr = picksError(o.picks, who);
  if (pickErr) return fail(pickErr);
  const lookErr = lookBlockError(o, who);
  if (lookErr) return fail(lookErr);
  return { ok: true, value: value as AaOutfit };
}

// Validate an untrusted project — an imported bundle or the on-disk manifest.
// Returns a reason rather than throwing so the editor can show it; a
// half-valid project is never partially applied.
export function validateProject(value: unknown): ValidationResult<AaProject> {
  if (typeof value !== "object" || value === null) return fail("Not an object");
  const p = value as Record<string, unknown>;
  if (p.version !== 1) return fail(`Unsupported version: ${String(p.version)}`);

  const model = validateModel(p.model);
  if (!model.ok) return fail(model.error);

  if (!Array.isArray(p.characters)) return fail("characters must be an array");
  const names = new Set<string>();
  for (const raw of p.characters) {
    const c = validateCharacter(raw);
    if (!c.ok) return fail(c.error);
    if (names.has(c.value.name)) return fail(`duplicate character: ${c.value.name}`);
    names.add(c.value.name);
  }
  if (p.outfits !== undefined) {
    if (!Array.isArray(p.outfits)) return fail("outfits must be an array");
    const outfitNames = new Set<string>();
    for (const raw of p.outfits) {
      const o = validateOutfit(raw);
      if (!o.ok) return fail(o.error);
      if (outfitNames.has(o.value.name)) return fail(`duplicate outfit: ${o.value.name}`);
      outfitNames.add(o.value.name);
    }
  }
  return { ok: true, value: value as AaProject };
}

// --- mutation helpers --------------------------------------------------

// Upsert by slot+name, returning a new model (never mutating the input —
// React state).
export function upsertPart(model: AaModel, part: AaPart): AaModel {
  const idx = model.parts.findIndex(
    (p) => p.slot === part.slot && p.name === part.name,
  );
  const parts = [...model.parts];
  if (idx >= 0) parts[idx] = part;
  else parts.push(part);
  return { ...model, parts };
}

// An unused name in this slot, derived from `base` — "hair", then "hair2",
// "hair3". Used when starting a new part so the Save button never silently
// overwrites the one you were just looking at.
export function suggestPartName(model: AaModel, slot: AaSlot, base: string): string {
  if (!findPart(model, slot, base)) return base;
  for (let n = 2; n < 1000; n++) {
    const candidate = `${base}${n}`;
    if (!findPart(model, slot, candidate)) return candidate;
  }
  return base;
}

export function removePart(model: AaModel, slot: AaSlot, name: string): AaModel {
  return {
    ...model,
    parts: model.parts.filter((p) => !(p.slot === slot && p.name === name)),
  };
}

export function upsertCharacter(
  project: AaProject,
  character: AaCharacter,
): AaProject {
  const idx = project.characters.findIndex((c) => c.name === character.name);
  const characters = [...project.characters];
  if (idx >= 0) characters[idx] = character;
  else characters.push(character);
  return { ...project, characters };
}

// --- outfits -----------------------------------------------------------

// A slot-keyed map of objects, copied one level deep — enough that editing the
// character afterwards can't reach into a captured outfit (or vice versa),
// since the leaves are all primitives.
function cloneSlotMap<T extends object>(
  map: Partial<Record<AaSlot, T>>,
): Partial<Record<AaSlot, T>> {
  const out: Partial<Record<AaSlot, T>> = {};
  for (const [slot, value] of Object.entries(map)) {
    if (value) out[slot as AaSlot] = { ...(value as T) };
  }
  return out;
}

function hasEntries(map: object | undefined): map is object {
  return !!map && Object.keys(map).length > 0;
}

// Capture what a character is WEARING — picks, colours, appearance, placement
// — as a named preset. Deliberately NOT the skeleton: an outfit is clothes,
// and putting the ninja suit on a tall character shouldn't shorten him. Same
// build/outfit line the Randomize button draws (lib/aachar/random.ts).
export function outfitFromCharacter(name: string, character: AaCharacter): AaOutfit {
  const outfit: AaOutfit = { name, picks: { ...character.picks } };
  const { colors, appearance, placement } = character;
  if (hasEntries(colors)) outfit.colors = cloneSlotMap(colors);
  if (hasEntries(appearance)) outfit.appearance = cloneSlotMap(appearance);
  if (hasEntries(placement)) outfit.placement = cloneSlotMap(placement);
  if (character.hatHair) outfit.hatHair = character.hatHair;
  return outfit;
}

// Dress a character in an outfit: the look is replaced WHOLESALE (wearing an
// outfit means wearing that outfit, not layering it over the last one), the
// name and skeleton stay. A slot the outfit says nothing about is emptied,
// same as clearing its pick by hand.
export function applyOutfit(character: AaCharacter, outfit: AaOutfit): AaCharacter {
  const next: AaCharacter = { ...character, picks: { ...outfit.picks } };
  if (hasEntries(outfit.colors)) next.colors = cloneSlotMap(outfit.colors);
  else delete next.colors;
  if (hasEntries(outfit.appearance)) next.appearance = cloneSlotMap(outfit.appearance);
  else delete next.appearance;
  if (hasEntries(outfit.placement)) next.placement = cloneSlotMap(outfit.placement);
  else delete next.placement;
  if (outfit.hatHair) next.hatHair = outfit.hatHair;
  else delete next.hatHair;
  return next;
}

// Stable serialization so key insertion order can't make identical looks read
// as different — a character whose picks were set hair-then-cloth still wears
// the outfit captured cloth-then-hair.
function sortedJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(sortedJson).join(",")}]`;
  if (typeof v === "object" && v !== null) {
    return `{${Object.entries(v as Record<string, unknown>)
      .filter(([, value]) => value !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([k, value]) => `${JSON.stringify(k)}:${sortedJson(value)}`)
      .join(",")}}`;
  }
  return JSON.stringify(v);
}

function lookKey(
  o: Pick<AaCharacter, "picks" | "colors" | "appearance" | "placement" | "hatHair">,
): string {
  // Empty blocks normalize to absent, so `colors: {}` and no colours compare
  // equal — the tab deletes empties but older data may still carry them.
  return sortedJson({
    picks: o.picks,
    colors: hasEntries(o.colors) ? o.colors : undefined,
    appearance: hasEntries(o.appearance) ? o.appearance : undefined,
    placement: hasEntries(o.placement) ? o.placement : undefined,
    hatHair: o.hatHair,
  });
}

// Whether the character's current look IS this outfit — drives the "wearing"
// marker in the Characters tab.
export function wearsOutfit(character: AaCharacter, outfit: AaOutfit): boolean {
  return lookKey(character) === lookKey(outfit);
}

export function upsertOutfit(project: AaProject, outfit: AaOutfit): AaProject {
  const outfits = [...(project.outfits ?? [])];
  const idx = outfits.findIndex((o) => o.name === outfit.name);
  if (idx >= 0) outfits[idx] = outfit;
  else outfits.push(outfit);
  return { ...project, outfits };
}

// The last outfit's removal deletes the field rather than leaving `[]`, so a
// project that never used outfits and one that stopped serialize identically.
export function removeOutfit(project: AaProject, name: string): AaProject {
  const outfits = (project.outfits ?? []).filter((o) => o.name !== name);
  const next = { ...project };
  if (outfits.length > 0) next.outfits = outfits;
  else delete next.outfits;
  return next;
}
