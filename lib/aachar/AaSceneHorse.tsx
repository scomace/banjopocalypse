"use client";

// AA horse pipeline — the scene-side horse rig (H8 follow-up,
// docs/aachar-horse-plan.md).
//
// `SpumScene`'s mounted-actor composite renders this instead of a bare
// `<SpumHorse>` whenever a mount carries `aaHorse: "<name>"`. It loads the
// session-cached AA bundle, resolves the named part from
// `model.horse.parts`, and renders `SpumHorse` through the H1 seams:
//
//   atlasOverride — the part's sheet with its face picks (eyes/mouth)
//                   composited into the Head region (`applyHorseFace`)
//   clipOverride  — the AA-rebuilt horse clip for the current animation
//                   (`model.horse.clips` override → AA_HORSE_CLIPS library);
//                   all 12 HorseAnimation names resolve, so SPUM's clips are
//                   only the fall-through for a name the registry loses
//
// First paint is the FACED sheet, never the faceless one: the composite is
// async (a canvas decode), so a warm cache (prewarmed by scenePrewarm.ts or
// composited earlier this session) is read synchronously and a stone-cold
// mount holds for the few ms the composite takes — the same first-paint
// policy AaSceneCharacter has. The raw sheet is only the floor under a
// composite that FAILS (the PNG not served yet).
//
// Everything else (clock binding, bone-transform export for the saddle,
// facing, size, tint, appearance) passes straight through to SpumHorse, so
// the rider composite and mountPlay actions work identically to a SPUM
// mount.

import { useEffect, useMemo, useState } from "react";

import { SpumHorse, type SpumHorseProps } from "@/lib/spum/SpumHorse";
import type { SpriteAtlas } from "@/lib/spum/types";

import {
  cachedAaHorseAtlas,
  compiledHorseClip,
  loadAaSceneBundle,
  peekAaHorseAtlas,
  resolveAaSceneHorse,
  type AaSceneBundle,
} from "./sceneCast";
import { horseModelOf } from "./horse/model";

export type AaSceneHorseProps = Omit<
  SpumHorseProps,
  "horse" | "atlasOverride" | "clipOverride"
> & {
  /** An AA horse part name from `model.horse.parts` (e.g. "biscuit"). */
  aaHorse: string;
};

export function AaSceneHorse({ aaHorse, ...rest }: AaSceneHorseProps) {
  const [bundle, setBundle] = useState<AaSceneBundle | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadAaSceneBundle().then((b) => {
      if (!cancelled) setBundle(b);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const part = useMemo(
    () => (bundle ? resolveAaSceneHorse(bundle, aaHorse) : null),
    [bundle, aaHorse],
  );

  const [faced, setFaced] = useState<{ name: string; atlas: SpriteAtlas } | null>(
    null,
  );
  const [failedName, setFailedName] = useState<string | null>(null);
  useEffect(() => {
    if (!bundle || !part) return;
    let cancelled = false;
    cachedAaHorseAtlas(bundle, part)
      .then((atlas) => {
        if (!cancelled) setFaced({ name: part.name, atlas });
      })
      .catch((err) => {
        console.error("[aachar] horse face composite failed:", err);
        if (!cancelled) setFailedName(part.name);
      });
    return () => {
      cancelled = true;
    };
  }, [bundle, part]);

  const clip = useMemo(
    () =>
      bundle
        ? compiledHorseClip(horseModelOf(bundle.project.model), rest.animation)
        : null,
    [bundle, rest.animation],
  );

  if (!part) return null;

  const atlas =
    (faced?.name === part.name ? faced.atlas : undefined) ??
    peekAaHorseAtlas(part.name) ??
    (failedName === part.name ? part.atlas : null);

  if (!atlas) return null;

  return (
    <SpumHorse
      {...rest}
      // Never fetched — `atlasOverride` is always set and every animation
      // name resolves an AA clip; the catalog part is just the required prop.
      horse="Horse1"
      atlasOverride={atlas}
      {...(clip ? { clipOverride: clip } : {})}
    />
  );
}
