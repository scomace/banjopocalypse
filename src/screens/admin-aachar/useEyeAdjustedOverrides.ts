"use client";

// AA editor — baking the character's per-eye nudge and the active gaze into
// the eye atlas (Phase 12). Same shape as useRecoloredOverrides: the bake
// needs a canvas decode, so it can't happen in the synchronous override
// memo; this hook layers the adjusted atlas on top once it resolves, holding
// the previous result meanwhile so a drag doesn't flash the unadjusted art.
//
// Runs AFTER recolour + hat-hair (it adjusts whatever eye atlas those
// produced — including the editor's live canvas) and BEFORE the eye-state
// band swap (it rewrites pixels; the swap repoints rects). One caveat while
// the eye canvas is being drawn in: the marks come from the SAVED part, so
// they can lag unsaved art until the next save — the same staleness rule the
// colour channels already live with.

import { useEffect, useMemo, useState } from "react";

import { findPart } from "@/lib/aachar/character";
import { eyeAdjustedAtlas } from "@/lib/aachar/gazeAtlas";
import { isIdentityEyeNudge, isIdentityGaze } from "@/lib/aachar/gaze";
import type { AaCharacter, AaGaze, AaModel } from "@/lib/aachar/types";
import type { SpumSlot } from "@/lib/spum/catalog";
import type { SpriteAtlas } from "@/lib/spum/types";

type Overrides = Partial<Record<SpumSlot, SpriteAtlas>>;

export function useEyeAdjustedOverrides(
  model: AaModel,
  character: AaCharacter,
  overrides: Overrides,
  gaze: AaGaze | undefined,
): Overrides {
  const atlas = overrides.eye;
  const eyes = useMemo(() => {
    const name = character.picks.eye;
    return name ? findPart(model, "eye", name)?.eyes : undefined;
  }, [model, character.picks.eye]);
  const nudge = character.eyeNudge;

  const idle =
    !atlas || !eyes || (isIdentityEyeNudge(nudge) && isIdentityGaze(gaze));
  const signature = idle
    ? ""
    : [
        atlas.image,
        JSON.stringify(eyes),
        JSON.stringify(nudge ?? {}),
        JSON.stringify(gaze ?? "-"),
      ].join("|");

  const [resolved, setResolved] = useState<SpriteAtlas | null>(null);

  useEffect(() => {
    if (idle || !atlas) {
      setResolved((prev) => (prev === null ? prev : null));
      return;
    }
    let cancelled = false;
    eyeAdjustedAtlas(atlas, eyes, nudge, gaze)
      .then((adjusted) => {
        if (cancelled) return;
        setResolved(adjusted === atlas ? null : adjusted);
      })
      .catch(() => {
        if (!cancelled) setResolved(null);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  return useMemo(() => {
    if (idle || resolved === null) return overrides;
    return { ...overrides, eye: resolved };
  }, [overrides, resolved, idle]);
}
