// AA character pipeline — feeding a model + character to the SPUM renderer.
//
// The renderer takes art from two places: atlases it fetches for the slots
// named in `config`, and `atlasOverrides`, a per-slot map that shadows them.
// An AA project already holds its atlases in memory (they arrive with the
// manifest), so it uses the override path exclusively and leaves `config`
// empty — no fetch is issued for a slot that isn't named in `config`.
//
// Keeping `config` empty also disables three pieces of SPUM catalog-coupled
// behaviour the AA path doesn't want (docs/aachar-plan.md I5): the hair mask
// (`resolveHideHair` reads `config.helmet`), shield bone routing
// (`isShieldPart` reads `config.weapon`), and the automatic `Eye_Close.png`
// sibling fetch (gated on `config.eye !== undefined`). All three degrade to
// "off", which is exactly what an original character wants.

import type { CharacterConfig, SpumSlot } from "@/lib/spum/catalog";
import { FREE_EYE_CLOSE_REGION, FREE_EYE_REGION } from "@/lib/spum/freeEye";
import type { PartNudge } from "@/lib/spum/partAdjustments";
import type { SpriteAtlas } from "@/lib/spum/types";

import { findPart, isIdentityPlacement } from "./character";
import { FREE_EYE_HALF_REGION } from "./slots";
import type { AaCharacter, AaEyeState, AaModel, AaPart, AaSlot } from "./types";

// `CharacterConfig` requires `body` and `pant`, both of which are typed
// against the SPUM catalog's part keys. The AA path names no parts at all, so
// the cast is load-bearing rather than lazy: an empty config is precisely what
// routes every slot through `atlasOverrides`.
export const AA_RENDER_CONFIG = {} as CharacterConfig;

// Resolve a character's picks against the model's library into the renderer's
// override map. Slots with no pick, or a pick naming a part that isn't in the
// library, are simply absent — the renderer skips them, so a half-built
// character renders as far as it has been built. Use `danglingPicks` to
// surface the second case in the UI rather than leaving it invisible.
export function toAtlasOverrides(
  model: AaModel,
  character: AaCharacter,
): Partial<Record<SpumSlot, SpriteAtlas>> {
  const out: Partial<Record<SpumSlot, SpriteAtlas>> = {};
  for (const [slot, name] of Object.entries(character.picks)) {
    if (!name) continue;
    const part = findPart(model, slot as AaSlot, name);
    if (part) out[slot as SpumSlot] = part.atlas;
  }
  return out;
}

// A character's per-slot placements (nudge/rotate/flip, Characters tab) as
// the renderer's `slotAdjustments` map. Identity entries are dropped so a
// character that says nothing renders byte-identically to before placements
// existed. Slot-keyed on purpose: the per-PART adjustment map folds weapon2
// into weapon, which would make "item L" and "item R" share one placement.
export function toSlotAdjustments(
  character: AaCharacter,
): Partial<Record<SpumSlot, PartNudge>> | undefined {
  const placement = character.placement;
  if (!placement) return undefined;
  const out: Partial<Record<SpumSlot, PartNudge>> = {};
  let any = false;
  for (const [slot, p] of Object.entries(placement)) {
    if (isIdentityPlacement(p)) continue;
    out[slot as SpumSlot] = p;
    any = true;
  }
  return any ? out : undefined;
}

// Phase 11 — the eye-state region swap.
//
// The renderer draws whatever the atlas's `Free` region rect points at, and it
// skips regions it doesn't recognise on the open-eye bone — so "half-closed
// eyes" is just an atlas clone whose `Free` rect points at the `FreeHalf`
// band. No renderer change, no bones, no tracks; pivots are identical across
// bands (all centred, same size — pinned by slots.test.ts), so the swap is a
// pure rect repoint. The FreeClose-on-blink-bone mechanism that SPUM
// fall-through clips flip via visibility tracks is untouched underneath.
//
// `bands` gates the swap: a band with no real art (or a pre-Phase-11 part
// with no flags at all) refuses to swap and renders open — eyes that stay
// visibly open beat eyes that silently vanish. Pass `FORCE_EYE_BANDS` to
// bypass the gate for the editor's own live canvas, where the artist needs to
// see a band they haven't saved yet.
export const FORCE_EYE_BANDS: NonNullable<AaPart["eyeBands"]> = {
  half: true,
  close: true,
};

export function applyEyeState(
  atlas: SpriteAtlas,
  state: AaEyeState,
  bands: AaPart["eyeBands"] | undefined,
): SpriteAtlas {
  if (state === "open") return atlas;
  const allowed = state === "half" ? bands?.half : bands?.close;
  if (!allowed) return atlas;
  const target =
    atlas.regions[state === "half" ? FREE_EYE_HALF_REGION : FREE_EYE_CLOSE_REGION];
  if (!target || !atlas.regions[FREE_EYE_REGION]) return atlas;
  return {
    ...atlas,
    regions: { ...atlas.regions, [FREE_EYE_REGION]: { ...target } },
  };
}

/** The state the preview should render: the playing clip's whole-clip state
 *  wins, then the character's resting state, then open. */
export function effectiveEyeState(
  clipState: AaEyeState | undefined,
  character: Pick<AaCharacter, "eyeState">,
): AaEyeState {
  return clipState ?? character.eyeState ?? "open";
}

// Preview a single part in isolation — what the Body and Slots tabs render
// while you're drawing, before the part belongs to any character.
export function previewOverrides(
  slot: AaSlot,
  atlas: SpriteAtlas,
): Partial<Record<SpumSlot, SpriteAtlas>> {
  return { [slot as SpumSlot]: atlas };
}
