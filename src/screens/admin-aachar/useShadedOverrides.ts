"use client";

// AA editor — applying the previewed character's auto-shading (Phase 13) by
// rewriting every worn atlas (lib/aachar/shadeAtlas.ts).
//
// Sits LAST in the override chain — after recolour, hat-hair, and the eye
// bakes — because shading must see the FINAL pixel colours: a recoloured
// shirt shades down its recoloured ramp, and hat-haired hair shades its baked
// pixels. Same shape as useRecoloredOverrides: the bake needs a canvas
// decode, so it resolves asynchronously and layers on top, holding the last
// result meanwhile so nothing flashes flat art.
//
// The EYE slot is deliberately never shaded: at sprite scale a dark rim on
// the whites reads as dirt, not volume, and the gaze/eye-state bakes downstream
// of the pixels would carry it into every band.

import { useEffect, useMemo, useState } from "react";

import { colorPicksFor, findPart } from "@/lib/aachar/character";
import { effectiveRamps } from "@/lib/aachar/shade";
import { shadeCacheKey, shadedAtlas } from "@/lib/aachar/shadeAtlas";
import {
  AA_SLOTS,
  type AaCharacter,
  type AaLightDirection,
  type AaModel,
  type AaProtect,
  type AaSlot,
} from "@/lib/aachar/types";
import type { SpumSlot } from "@/lib/spum/catalog";
import type { SpriteAtlas } from "@/lib/spum/types";

type Overrides = Partial<Record<SpumSlot, SpriteAtlas>>;

type Job = {
  slot: AaSlot;
  atlas: SpriteAtlas;
  ramps: string[][];
  protect: AaProtect | undefined;
};

const SHADED_SLOTS: readonly AaSlot[] = AA_SLOTS.filter((s) => s !== "eye");

export function useShadedOverrides(
  model: AaModel,
  character: AaCharacter,
  overrides: Overrides,
  direction: AaLightDirection,
): Overrides {
  const style = character.shading ?? "none";

  const jobs = useMemo<Job[]>(() => {
    if (style === "none") return [];
    const out: Job[] = [];
    for (const slot of SHADED_SLOTS) {
      // Whatever atlas the chain produced is what gets shaded — a recoloured
      // data URL, a live editor canvas, the placeholder mannequin. Unlike the
      // recolour hook there is no own-atlas guard: shading is geometric, so
      // it can't mis-apply stale tags to in-progress art.
      const atlas = overrides[slot as SpumSlot];
      if (!atlas) continue;
      // The part informs the RAMPS (so the shade stays on-palette) and the
      // outline protection; a missing part (placeholder body, borrowed
      // weapon) just falls back to synthesised steps + default protection.
      const part = findPart(model, slot, character.picks[slot] ?? "");
      const ramps = part
        ? effectiveRamps(
            part.colorChannels,
            colorPicksFor(model, character, slot),
            character.appearance?.[slot],
            part.protect,
          )
        : [];
      out.push({ slot, atlas, ramps, protect: part?.protect });
    }
    return out;
  }, [style, model, character, overrides]);

  // Jobs are objects, so the effect keys off what they RESOLVE to instead —
  // otherwise every render of the parent would re-run the decode.
  const signature = jobs
    .map((j) => `${j.slot}@${shadeCacheKey(j.atlas, style, direction, j.ramps, j.protect)}`)
    .join("|");

  const [resolved, setResolved] = useState<Overrides>({});

  useEffect(() => {
    if (jobs.length === 0) {
      setResolved((prev) => (Object.keys(prev).length === 0 ? prev : {}));
      return;
    }
    let cancelled = false;
    Promise.all(
      jobs.map((j) =>
        shadedAtlas(j.atlas, style, direction, j.ramps, j.protect)
          .then((atlas) => (atlas === j.atlas ? null : ([j.slot, atlas] as const)))
          .catch(() => null),
      ),
    ).then((pairs) => {
      if (cancelled) return;
      // Replaced wholesale rather than merged, so a slot that stopped being
      // shaded drops its stale atlas instead of sticking.
      setResolved(Object.fromEntries(pairs.filter((p) => p !== null)) as Overrides);
    });
    return () => {
      cancelled = true;
    };
    // The signature captures everything the OUTPUT depends on; keying the
    // effect off the inputs themselves would re-run it on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  return useMemo(() => ({ ...overrides, ...resolved }), [overrides, resolved]);
}
