"use client";

// AA editor — applying the previewed character's hat-hair mode by rewriting
// the hair atlas (lib/aachar/hatHairAtlas.ts).
//
// Sits AFTER the recolour hook in the override chain: the spill modes sample
// "the colour of the chosen hair", which is only true of the recoloured
// pixels. Same shape as useRecoloredOverrides — the bake needs a canvas
// decode, so it resolves asynchronously and layers on top, holding the last
// result meanwhile so a slider drag doesn't flash the unmasked hair.
//
// The helmet contributes only ALPHA (its measured bottom profile plus region
// geometry), so the RAW helmet atlas is the right input — a helmet recolour
// never re-bakes the hair.

import { useEffect, useMemo, useState } from "react";

import { hatHairCacheKey, hatHairedAtlas } from "@/lib/aachar/hatHairAtlas";
import type { AaCharacter } from "@/lib/aachar/types";
import type { SpumSlot } from "@/lib/spum/catalog";
import type { Skeleton, SpriteAtlas } from "@/lib/spum/types";

type Overrides = Partial<Record<SpumSlot, SpriteAtlas>>;

export function useHatHairedOverrides(
  character: AaCharacter,
  overrides: Overrides,
  rawHelmet: SpriteAtlas | undefined,
  bottomProfile: number[] | null,
  skeleton: Skeleton | null,
): Overrides {
  const mode = character.hatHair ?? "none";
  const hair = overrides.hair;
  const placement = useMemo(
    () => ({ hair: character.placement?.hair, helmet: character.placement?.helmet }),
    [character.placement],
  );

  const active = mode !== "none" && !!hair && !!rawHelmet && !!bottomProfile;
  const signature = active
    ? hatHairCacheKey(mode, hair, rawHelmet, bottomProfile, skeleton, placement)
    : "";

  const [resolved, setResolved] = useState<SpriteAtlas | null>(null);

  useEffect(() => {
    if (!active) {
      setResolved((prev) => (prev === null ? prev : null));
      return;
    }
    let cancelled = false;
    hatHairedAtlas(mode, hair, rawHelmet, bottomProfile, skeleton, placement)
      .then((atlas) => {
        if (cancelled) return;
        // Identity result means "nothing to bake" — drop any stale layer.
        setResolved(atlas === hair ? null : atlas);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // The signature captures everything the OUTPUT depends on; keying the
    // effect off the inputs themselves would re-run it on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, active]);

  return useMemo(
    () => (resolved ? { ...overrides, hair: resolved } : overrides),
    [overrides, resolved],
  );
}
