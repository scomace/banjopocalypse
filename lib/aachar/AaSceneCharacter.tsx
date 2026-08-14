"use client";

// AA character pipeline — Phase 7: the scene-side rig.
//
// `SpumScene` renders this instead of a bare `<SpumCharacter>` whenever a
// cast entry carries `aachar: { name }`. It loads the session-cached AA
// bundle (manifest + SPUM base skeleton), resolves the named character, and
// renders `SpumCharacter` through the Phase 1 seams:
//
//   atlasOverrides   — the character's art, with the full editor look baked
//                      in (recolour → hat-hair → eye nudge/state → shading)
//   skeletonOverride — SPUM base + model proportions + character deltas
//   slotAdjustments  — the character's per-slot placement nudges
//   clipOverride     — the AA clip for the CURRENT animation, recompiled on
//                      every animation change; an unknown name returns null
//                      and the renderer falls back to fetching SPUM's clip
//
// First paint is the BAKED look, never the raw art: a warm cache (a look
// prewarmed by scenePrewarm.ts or baked earlier this session) is read
// synchronously so the character's real colours are on its very first frame,
// and a stone-cold mount holds the actor for the few ms its first bake takes
// instead of flashing unadjusted colours that then snap. Raw art is only the
// floor under a bake that FAILS. The bakes are cached inside lib/aachar, so
// a facing flip (which swaps the shade's light direction) costs one bake per
// direction, ever.
//
// All other SpumCharacter props (clock binding, bone-transform export, pose
// overrides, facing, size, speed…) pass straight through, so props, bubbles,
// particles and the camera anchor to an AA actor exactly as they do to a
// SPUM one — the bone paths are the same skeleton's (docs/aachar-plan.md D2).

import { useEffect, useMemo, useState } from "react";

import { SpumCharacter, type SpumCharacterProps } from "@/lib/spum/SpumCharacter";
import type {
  SceneAaRef,
  SceneGaze,
  SceneGazeDirection,
  SceneGazePair,
  SceneGazeSide,
} from "@/lib/spum/types";

import {
  AA_RENDER_CONFIG,
  aaSceneLookKey,
  cachedAaSceneLook,
  compiledAaClip,
  compiledRiderClip,
  effectiveLightDirection,
  loadAaSceneBundle,
  peekAaSceneLook,
  resolveAaSceneActor,
  type AaLookOverrides,
  type AaSceneBundle,
  type ResolvedAaActor,
} from "./sceneCast";
import { horseModelOf } from "./horse/model";
import type {
  AaGaze,
  AaGazeDirection,
  AaGazePair,
  AaGazeSide,
  AaLightDirection,
} from "./types";

// Scene gaze is SCREEN-space; the base art faces screen-left and a
// right-facing actor renders mirrored, so the horizontal component flips —
// the same reasoning as `effectiveLightDirection`.
const MIRRORED_GAZE: Record<SceneGazeDirection, AaGazeDirection> = {
  up: "up",
  down: "down",
  left: "right",
  right: "left",
  "up-left": "up-right",
  "up-right": "up-left",
  "down-left": "down-right",
  "down-right": "down-left",
};

// Mirroring the PAIR form takes two swaps, not one. Facing right renders the
// whole rig mirrored, so (a) each side's direction flips horizontally, and
// (b) the side labels themselves swap — the leftmost eye box on the base art
// is the rightmost eye on screen. Miss (b) and a per-eye gaze silently lands
// on the wrong eye for every right-facing actor. `gap` is per-side too, so it
// swaps with them; a plain number applies to both and needs no swap.
function mirrorSide(side: SceneGazeSide): AaGazeSide {
  return typeof side === "string"
    ? MIRRORED_GAZE[side]
    : { dx: side.dx === undefined ? undefined : -side.dx, dy: side.dy };
}

function mirrorGap(gap: SceneGazePair["gap"]): AaGazePair["gap"] {
  if (gap === undefined || typeof gap === "number") return gap;
  return { left: gap.right, right: gap.left };
}

export function rigGazeFor(
  gaze: SceneGaze | undefined,
  facingRight: boolean,
): AaGaze | undefined {
  if (!gaze) return undefined;
  if (typeof gaze === "string") return facingRight ? MIRRORED_GAZE[gaze] : gaze;
  if (!facingRight) return gaze as AaGazePair;
  return {
    left: gaze.right === undefined ? undefined : mirrorSide(gaze.right),
    right: gaze.left === undefined ? undefined : mirrorSide(gaze.left),
    gap: mirrorGap(gaze.gap),
  };
}

type Overrides = AaLookOverrides;

export type AaSceneCharacterProps = Omit<
  SpumCharacterProps,
  "config" | "atlasOverrides" | "skeletonOverride" | "clipOverride" | "slotAdjustments" | "resolvePart"
> & {
  aachar: SceneAaRef;
  /** Scene-level appearance-action overrides still ride the config seam;
   *  omitted = the empty AA config. */
  config?: SpumCharacterProps["config"];
  /** The scene's light direction (`SceneScript.light`), default "left".
   *  Flipping `facing` mirrors the art, so the bake direction swaps with it. */
  light?: AaLightDirection;
  /** Current pupil gaze (SCREEN-space; undefined = the character's resting
   *  pupils). The scene runtime resolves this from `aachar.gaze` + any
   *  `gaze` actions. Each distinct gaze is one cached bake — a direction is
   *  one key, a pair is keyed on its serialized shape. */
  gaze?: SceneGaze;
  /** H8 follow-up — the character is riding: every clip plays with the held
   *  channels (default: both legs) frozen to the model-level straddle pose
   *  (`model.horse.rider`, see lib/aachar/horse/rider.ts). The mount
   *  composite in SpumScene sets this on both rider copies. */
  mounted?: boolean;
};

export function AaSceneCharacter({
  aachar,
  config,
  light,
  gaze,
  mounted,
  ...rest
}: AaSceneCharacterProps) {
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

  const resolved: ResolvedAaActor | null = useMemo(
    () =>
      bundle
        ? resolveAaSceneActor(bundle, aachar.name, aachar.hide, aachar.mouth)
        : null,
    [bundle, aachar],
  );

  // The base art faces screen-left; `facing: "right"` renders mirrored, so a
  // left-lit bake would flip into a right-lit sprite without this swap.
  const direction = effectiveLightDirection(light ?? "left", rest.facing === "right");
  const rigGaze = rigGazeFor(gaze, rest.facing === "right");

  const [baked, setBaked] = useState<{ key: string; look: Overrides } | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const bakeKey = resolved ? aaSceneLookKey(aachar, direction, rigGaze) : "";
  useEffect(() => {
    if (!resolved) return;
    let cancelled = false;
    // Even on a cache hit this still lands in `baked` state — that's what a
    // LATER key change (facing flip, gaze beat) serves as its stale fallback.
    cachedAaSceneLook(resolved, direction, rigGaze, bakeKey)
      .then((look) => {
        if (!cancelled) setBaked({ key: bakeKey, look });
      })
      .catch((err) => {
        console.error("[aachar] look bake failed:", err);
        if (!cancelled) setFailedKey(bakeKey);
      });
    return () => {
      cancelled = true;
    };
    // bakeKey names everything the OUTPUT depends on (the manifest is
    // immutable within a session); `resolved` identity churns with it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bakeKey]);

  // Mounted riders resolve the SAME clip, then freeze the held channels to
  // the riding straddle (`compiledRiderClip` is `resolveAaClip` +
  // `holdChannels`); an unknown name is null either way and falls through to
  // SpumCharacter fetching SPUM's clip.
  const clip = useMemo(
    () =>
      resolved
        ? mounted
          ? compiledRiderClip(
              resolved.model,
              rest.animation,
              horseModelOf(resolved.model).rider,
            )
          : compiledAaClip(resolved.model, rest.animation)
        : null,
    [resolved, rest.animation, mounted],
  );

  if (!resolved) return null;

  // First-paint policy, in order:
  //   1. A finished bake for THIS key — from state, or synchronously from the
  //      look cache (prewarmed, or baked earlier this session), so a warm
  //      mount's very first frame has the character's real colours.
  //   2. Otherwise the last look we showed (stale direction/gaze): wrong-side
  //      shading for a frame beats flashing flat art on a facing flip.
  //   3. Otherwise nothing — a stone-cold first mount holds for the few ms
  //      its first bake takes rather than flashing raw colours that then
  //      snap. Raw art is only the floor under a bake that FAILED (a PNG not
  //      served yet): degraded colours beat an actor that never appears.
  const look =
    (baked?.key === bakeKey ? baked.look : undefined) ??
    peekAaSceneLook(bakeKey) ??
    baked?.look ??
    (failedKey === bakeKey ? resolved.rawOverrides : null);

  if (!look) return null;

  return (
    <SpumCharacter
      {...rest}
      config={config ?? AA_RENDER_CONFIG}
      atlasOverrides={look}
      skeletonOverride={resolved.skeleton}
      slotAdjustments={resolved.slotAdjustments}
      {...(clip ? { clipOverride: clip } : {})}
    />
  );
}
