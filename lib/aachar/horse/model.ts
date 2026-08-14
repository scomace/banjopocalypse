// AA horse pipeline — the manifest block (`model.horse`) and its helpers.
//
// Horse data hangs off `AaModel` (H3): `projectMerge.ts` rebuilds the
// project's top level, so a top-level key would be erased by a conflict
// merge, but every non-`parts` model field survives via `restOf()`. The
// block merges as one entity with the other model settings — acceptable at
// this scale, same trade the character clips already make.
//
// A horse part is NOT an `AaPart` (H4): it never enters the character
// wardrobe, has no slot in `AA_SLOTS`, and carries none of the character
// part extras (eye bands, bottom profiles). Name + atlas + optional tags.

import type { SpriteAtlas } from "@/lib/spum/types";

import {
  type AaHorseClip,
  type AaHorseStance,
  HORSE_CHANNELS,
  HORSE_NEUTRAL_STANCE,
  checkHorseClip,
  compileHorseClip,
} from "./clip";
import { AA_HORSE_CLIPS } from "./clips";
import {
  FACE_PALETTE,
  HORSE_EYE_STYLES,
  HORSE_MOUTH_STYLES,
  type AaHorseFaces,
  type HorseFacePick,
  type HorseFaceStamp,
} from "./face";
import { hatPickError, type HorseHatPick } from "./hat";
import { riderError, type AaHorseRider } from "./rider";
import { HORSE_REGION_SIZES } from "./sheet";
import type { Clip } from "@/lib/spum/types";

// Same rule as lib/aachar/character.ts's NAME_RE. Duplicated (not imported)
// because character.ts imports THIS module for validation — an import back
// would create a cycle.
const NAME_RE = /^[A-Za-z][A-Za-z0-9]*$/;

export type AaHorsePart = {
  name: string;
  /** Canonical atlas — `image` is `/aachar/parts/horse/AA_<name>.png`. */
  atlas: SpriteAtlas;
  /** Picked eye/mouth styles, composited into the Head region at render
   *  time (`./face.ts`) — locked to the head bone by construction. Absent
   *  means the drawn art is shown untouched. */
  face?: HorseFacePick;
  /** A character helmet part worn on the crown, composited into the atlas
   *  as a `Hat` region at render time (`./hat.ts`) — locked to the head
   *  bone by construction. Absent means bare-headed. */
  hat?: HorseHatPick;
  tags?: string[];
};

export type AaHorseModel = {
  parts: AaHorsePart[];
  /** Working-copy clip overrides, same precedence as `model.clips`:
   *  override → `AA_HORSE_CLIPS` library. */
  clips?: Record<string, AaHorseClip>;
  /** Optional stance override; defaults to the rig's own neutral. */
  stance?: AaHorseStance;
  /** Custom eye/mouth stamps drawn in the Face editor — they join the
   *  built-in styles in the pickers and are shared by every horse. */
  faces?: AaHorseFaces;
  /** The riding pose + mount offsets for AA characters on this horse rig
   *  (`./rider.ts`). Model-level: one straddle fits the whole cast. */
  rider?: AaHorseRider;
};

/** The horse block, never undefined at the call site. */
export function horseModelOf(model: { horse?: AaHorseModel }): AaHorseModel {
  return model.horse ?? { parts: [] };
}

export function findHorsePart(
  horse: AaHorseModel,
  name: string,
): AaHorsePart | undefined {
  return horse.parts.find((p) => p.name === name);
}

export function upsertHorsePart(horse: AaHorseModel, part: AaHorsePart): AaHorseModel {
  const exists = horse.parts.some((p) => p.name === part.name);
  return {
    ...horse,
    parts: exists
      ? horse.parts.map((p) => (p.name === part.name ? part : p))
      : [...horse.parts, part],
  };
}

export function removeHorsePart(horse: AaHorseModel, name: string): AaHorseModel {
  return { ...horse, parts: horse.parts.filter((p) => p.name !== name) };
}

export function suggestHorsePartName(horse: AaHorseModel, base = "horse"): string {
  if (!findHorsePart(horse, base)) return base;
  for (let i = 2; ; i++) {
    const name = `${base}${i}`;
    if (!findHorsePart(horse, name)) return name;
  }
}

// ---------------------------------------------------------------------------
// Custom face stamps
// ---------------------------------------------------------------------------

const PICK_KEY = { eyes: "eyes", mouths: "mouth" } as const;

/** Add or replace a custom stamp. `replaceName` handles a rename: the old
 *  entry is dropped and every part picking it follows to the new name. */
export function upsertFaceStamp(
  horse: AaHorseModel,
  kind: "eyes" | "mouths",
  stamp: HorseFaceStamp,
  replaceName?: string,
): AaHorseModel {
  const oldName = replaceName ?? stamp.name;
  const list = (horse.faces?.[kind] ?? []).filter(
    (s) => s.name !== oldName && s.name !== stamp.name,
  );
  const faces: AaHorseFaces = { ...(horse.faces ?? {}), [kind]: [...list, stamp] };
  let next: AaHorseModel = { ...horse, faces };
  if (replaceName && replaceName !== stamp.name) {
    const pickKey = PICK_KEY[kind];
    next = {
      ...next,
      parts: next.parts.map((p) =>
        p.face?.[pickKey] === replaceName
          ? { ...p, face: { ...p.face, [pickKey]: stamp.name } }
          : p,
      ),
    };
  }
  return next;
}

/** Drop a custom stamp and clear any picks that referenced it (a dangling
 *  pick is harmless — it stamps nothing — but tidy beats harmless). */
export function removeFaceStamp(
  horse: AaHorseModel,
  kind: "eyes" | "mouths",
  name: string,
): AaHorseModel {
  const list = (horse.faces?.[kind] ?? []).filter((s) => s.name !== name);
  const faces: AaHorseFaces = { ...(horse.faces ?? {}) };
  if (list.length > 0) faces[kind] = list;
  else delete faces[kind];
  const pickKey = PICK_KEY[kind];
  const parts = horse.parts.map((p) => {
    if (p.face?.[pickKey] !== name) return p;
    const face = { ...p.face };
    delete face[pickKey];
    const out = { ...p };
    if (face.eyes || face.mouth) out.face = face;
    else delete out.face;
    return out;
  });
  const next: AaHorseModel = { ...horse, parts };
  if (faces.eyes || faces.mouths) next.faces = faces;
  else delete next.faces;
  return next;
}

// ---------------------------------------------------------------------------
// Clip resolution — override → library (no SPUM fall-through: the caller
// simply omits `clipOverride` and lets `SpumHorse` fetch SPUM's by name).
// ---------------------------------------------------------------------------

export type HorseClipSource = "override" | "library" | "spum";

export function horseStance(horse: AaHorseModel): AaHorseStance {
  return horse.stance ?? HORSE_NEUTRAL_STANCE;
}

export function resolveHorseClip(horse: AaHorseModel, name: string): AaHorseClip | null {
  return horse.clips?.[name] ?? AA_HORSE_CLIPS[name] ?? null;
}

export function horseClipSource(horse: AaHorseModel, name: string): HorseClipSource {
  if (horse.clips?.[name]) return "override";
  if (AA_HORSE_CLIPS[name]) return "library";
  return "spum";
}

export function compiledHorseClip(horse: AaHorseModel, name: string): Clip | null {
  const clip = resolveHorseClip(horse, name);
  return clip ? compileHorseClip(clip, horseStance(horse)) : null;
}

export function upsertHorseClip(horse: AaHorseModel, clip: AaHorseClip): AaHorseModel {
  return { ...horse, clips: { ...(horse.clips ?? {}), [clip.name]: clip } };
}

export function revertHorseClip(horse: AaHorseModel, name: string): AaHorseModel {
  if (!horse.clips?.[name]) return horse;
  const clips = { ...horse.clips };
  delete clips[name];
  if (Object.keys(clips).length === 0) {
    const { clips: _clips, ...rest } = horse;
    return rest;
  }
  return { ...horse, clips };
}

// ---------------------------------------------------------------------------
// Validation — called from `validateModel` so a malformed horse block is
// rejected at the door rather than misbehaving in the editor.
// ---------------------------------------------------------------------------

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function isHorsePose(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  for (const [ch, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!(HORSE_CHANNELS as readonly string[]).includes(ch)) return false;
    const p = raw as Record<string, unknown> | null;
    if (typeof p !== "object" || p === null) return false;
    for (const k of ["rot", "x", "y"]) {
      const v = (p as Record<string, unknown>)[k];
      if (v !== undefined && !isFiniteNumber(v)) return false;
    }
  }
  return true;
}

function isAtlasLike(value: unknown): boolean {
  const a = value as Record<string, unknown> | null;
  if (typeof a !== "object" || a === null) return false;
  if (typeof a.image !== "string") return false;
  if (!isFiniteNumber(a.width) || !isFiniteNumber(a.height)) return false;
  if (typeof a.regions !== "object" || a.regions === null) return false;
  return true;
}

/** null when valid, else a message. Kept here (not in character.ts) so all
 *  horse shape knowledge lives in the horse module. */
export function horseModelError(value: unknown): string | null {
  if (typeof value !== "object" || value === null) return "model.horse is not an object";
  const h = value as Record<string, unknown>;
  if (!Array.isArray(h.parts)) return "model.horse.parts must be an array";
  const seen = new Set<string>();
  for (const raw of h.parts) {
    const p = raw as Record<string, unknown> | null;
    if (typeof p !== "object" || p === null) return "horse part is not an object";
    if (typeof p.name !== "string" || !NAME_RE.test(p.name)) {
      return `horse part has an invalid name: ${JSON.stringify(p.name)}`;
    }
    if (!isAtlasLike(p.atlas)) return `horse part "${p.name}" has an invalid atlas`;
    // Picks are SHAPE-checked only — a name whose custom style was deleted
    // must not invalidate the whole model (character precedent: stale
    // colour-channel ids are filtered at read time, never rejected). An
    // unknown name simply stamps nothing.
    if (p.face !== undefined) {
      const f = p.face as Record<string, unknown> | null;
      if (typeof f !== "object" || f === null) return `horse part "${p.name}" has an invalid face`;
      for (const kind of ["eyes", "mouth"] as const) {
        const v = f[kind];
        if (v !== undefined && typeof v !== "string") {
          return `horse part "${p.name}" has a non-string ${kind} pick`;
        }
      }
    }
    // Like face picks, the hat's NAME is lenient (a deleted helmet part
    // renders no hat) but the pick's shape is checked.
    if (p.hat !== undefined) {
      const err = hatPickError(p.hat);
      if (err) return `horse part "${p.name}": ${err}`;
    }
    if (p.tags !== undefined) {
      if (!Array.isArray(p.tags) || p.tags.some((t) => typeof t !== "string")) {
        return `horse part "${p.name}" has invalid tags`;
      }
    }
    if (seen.has(p.name)) return `duplicate horse part: ${p.name}`;
    seen.add(p.name);
  }
  if (h.stance !== undefined && !isHorsePose(h.stance)) {
    return "model.horse.stance is not a valid horse pose";
  }
  if (h.clips !== undefined) {
    if (typeof h.clips !== "object" || h.clips === null) {
      return "model.horse.clips must be an object";
    }
    for (const [key, raw] of Object.entries(h.clips as Record<string, unknown>)) {
      const c = raw as Record<string, unknown> | null;
      if (typeof c !== "object" || c === null) return `horse clip "${key}" is not an object`;
      if (c.name !== key) return `horse clip "${key}" is keyed under a different name`;
      if (!isFiniteNumber(c.frames) || typeof c.loop !== "boolean") {
        return `horse clip "${key}" is missing frames or loop`;
      }
      if (c.rest !== undefined && !isHorsePose(c.rest)) {
        return `horse clip "${key}" has an invalid rest pose`;
      }
      if (!Array.isArray(c.beats)) return `horse clip "${key}" has no beats`;
      for (const b of c.beats) {
        const beat = b as Record<string, unknown> | null;
        if (!beat || !isFiniteNumber(beat.frame) || typeof beat.role !== "string") {
          return `horse clip "${key}" has a malformed beat`;
        }
        if (!isHorsePose(beat.pose)) return `horse clip "${key}" has a beat with an invalid pose`;
      }
      const errors = checkHorseClip(c as unknown as AaHorseClip).filter(
        (p) => p.level === "error",
      );
      if (errors.length > 0) return `horse clip "${key}": ${errors[0].message}`;
    }
  }
  // Custom face stamps ARE validated strictly (unlike picks): a malformed
  // stamp would draw garbage on every horse that picks it.
  if (h.faces !== undefined) {
    const faces = h.faces as Record<string, unknown> | null;
    if (typeof faces !== "object" || faces === null) return "model.horse.faces is not an object";
    for (const [kindKey, builtIns] of [
      ["eyes", HORSE_EYE_STYLES],
      ["mouths", HORSE_MOUTH_STYLES],
    ] as const) {
      const list = faces[kindKey];
      if (list === undefined) continue;
      if (!Array.isArray(list)) return `model.horse.faces.${kindKey} must be an array`;
      const seenNames = new Set<string>();
      const reserved = new Set(builtIns.map((s) => s.name));
      for (const raw of list) {
        const err = faceStampError(raw, kindKey, seenNames, reserved);
        if (err) return err;
      }
    }
  }
  if (h.rider !== undefined) {
    const err = riderError(h.rider);
    if (err) return err;
  }
  return null;
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

function faceStampError(
  raw: unknown,
  kind: string,
  seen: Set<string>,
  reserved: ReadonlySet<string>,
): string | null {
  const s = raw as Partial<HorseFaceStamp> | null;
  if (typeof s !== "object" || s === null) return `a custom ${kind} stamp is not an object`;
  if (typeof s.name !== "string" || !NAME_RE.test(s.name)) {
    return `custom ${kind} stamp has an invalid name: ${JSON.stringify(s.name)}`;
  }
  if (reserved.has(s.name)) return `custom ${kind} stamp "${s.name}" shadows a built-in style`;
  if (seen.has(s.name)) return `duplicate custom ${kind} stamp: ${s.name}`;
  seen.add(s.name);
  if (typeof s.label !== "string" || s.label.length === 0 || s.label.length > 24) {
    return `custom ${kind} stamp "${s.name}" needs a short label`;
  }
  if (!Number.isInteger(s.x) || !Number.isInteger(s.y) || (s.x as number) < 0 || (s.y as number) < 0) {
    return `custom ${kind} stamp "${s.name}" has an invalid position`;
  }
  if (!Array.isArray(s.rows) || s.rows.length === 0 || s.rows.some((r) => typeof r !== "string" || r.length === 0)) {
    return `custom ${kind} stamp "${s.name}" has invalid rows`;
  }
  if (s.palette !== undefined) {
    if (typeof s.palette !== "object" || s.palette === null) {
      return `custom ${kind} stamp "${s.name}" has an invalid palette`;
    }
    for (const [ch, hex] of Object.entries(s.palette)) {
      if (ch.length !== 1 || ch === "." || typeof hex !== "string" || !HEX_RE.test(hex)) {
        return `custom ${kind} stamp "${s.name}" has a bad palette entry ${JSON.stringify(ch)}`;
      }
    }
  }
  const palette = (s.palette as Record<string, string> | undefined) ?? FACE_PALETTE;
  const width = Math.max(...s.rows.map((r) => r.length));
  for (const row of s.rows) {
    for (const ch of row) {
      if (ch !== "." && !(ch in palette)) {
        return `custom ${kind} stamp "${s.name}" uses unknown colour char ${JSON.stringify(ch)}`;
      }
    }
  }
  // Must sit inside the Head region — the only place a face can render.
  const head = HORSE_REGION_SIZES.Head;
  if ((s.x as number) + width > head.width || (s.y as number) + s.rows.length > head.height) {
    return `custom ${kind} stamp "${s.name}" falls outside the ${head.width}×${head.height} head region`;
  }
  return null;
}
