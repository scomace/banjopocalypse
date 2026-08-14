"use client";

// AA editor — resolving a character's colour picks and appearance into
// adjusted atlases.
//
// Both need a canvas decode, so neither can happen inside the synchronous
// `useMemo` that builds `atlasOverrides`. This hook layers the adjusted atlases
// on top once they resolve, holding the previous result meanwhile so dragging a
// slider doesn't flash the authored art on every tick.

import { useEffect, useMemo, useState } from "react";

import { colorPicksFor, findPart } from "@/lib/aachar/character";
import { isIdentityTransform, type ColorPicks } from "@/lib/aachar/recolor";
import { recolorCacheKey, recoloredAtlas } from "@/lib/aachar/recolorAtlas";
import {
  AA_SLOTS,
  type AaAppearance,
  type AaCharacter,
  type AaModel,
  type AaPart,
  type AaSlot,
} from "@/lib/aachar/types";
import type { SpumSlot } from "@/lib/spum/catalog";
import type { SpriteAtlas } from "@/lib/spum/types";

type Overrides = Partial<Record<SpumSlot, SpriteAtlas>>;

type Job = {
  slot: AaSlot;
  part: AaPart;
  picks: ColorPicks;
  appearance: AaAppearance | undefined;
};

export function useRecoloredOverrides(
  model: AaModel,
  character: AaCharacter,
  overrides: Overrides,
): Overrides {
  const jobs = useMemo<Job[]>(() => {
    const out: Job[] = [];
    for (const slot of AA_SLOTS) {
      const name = character.picks[slot];
      if (!name) continue;
      const part = findPart(model, slot, name);
      if (!part) continue;
      // Only the part's OWN saved atlas is adjusted. While an editor tab is
      // open its working canvas shadows the slot with a fresh data URL on every
      // stroke; adjusting that would mean a PNG decode per stroke to apply tags
      // that may not even match the art being drawn.
      if (overrides[slot as SpumSlot] !== part.atlas) continue;
      const picks = colorPicksFor(model, character, slot);
      const appearance = character.appearance?.[slot];
      const transform = {
        channels: part.colorChannels,
        picks,
        appearance,
        protect: part.protect,
      };
      // Appearance alone is enough — a part with no channels can still be
      // tinted wholesale.
      if (isIdentityTransform(transform)) continue;
      out.push({ slot, part, picks, appearance });
    }
    return out;
  }, [model, character, overrides]);

  // Jobs are objects, so the effect keys off what they RESOLVE to instead —
  // otherwise every render of the parent would re-run the decode.
  const signature = jobs
    .map((j) => `${j.slot}@${recolorCacheKey(j.part, j.picks, j.appearance)}`)
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
        recoloredAtlas(j.part, j.picks, j.appearance)
          .then((atlas) => [j.slot, atlas] as const)
          .catch(() => null),
      ),
    ).then((pairs) => {
      if (cancelled) return;
      // Replaced wholesale rather than merged, so a slot that stopped being
      // adjusted drops its stale atlas instead of sticking.
      setResolved(Object.fromEntries(pairs.filter((p) => p !== null)) as Overrides);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  return useMemo(() => ({ ...overrides, ...resolved }), [overrides, resolved]);
}
