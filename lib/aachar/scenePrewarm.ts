// AA character pipeline — pre-warming baked looks for a lesson.
//
// The scene renderer's first paint reads the baked-look cache synchronously
// (sceneCast.ts, `peekAaSceneLook`); a look that is already in the cache
// renders in its real colours on frame one, and one that isn't makes its
// actor hold for a first bake. This module fills the cache AHEAD of the
// challenge screens: the quiz calls `prewarmAaLooks` with every AA look its
// lesson will render — scene casts, MATCHING tile scenes, SHAREOSELECT
// investor busts, SORTABLE2 zone characters, CONVO speakers — the moment the
// lesson mounts, so by the time a challenge appears its characters' bakes
// are cache hits.
//
// Fire-and-forget by contract: every failure here degrades to the per-mount
// bake path (the hold), never to a broken lesson. Bakes run SEQUENTIALLY on
// purpose — each is ms-scale, and awaiting between them spreads the canvas
// work out instead of stacking it into one long main-thread task while the
// lesson intro is animating.

import type { SceneGaze, SceneScript } from "@/lib/spum/types";

import { rigGazeFor } from "./AaSceneCharacter";
import {
  aaSceneLookKey,
  cachedAaHorseAtlas,
  cachedAaSceneLook,
  effectiveLightDirection,
  loadAaSceneBundle,
  resolveAaSceneActor,
  resolveAaSceneHorse,
} from "./sceneCast";
import type { AaLightDirection } from "./types";

export type AaLookTarget = {
  ref: { name: string; hide?: string[]; mouth?: string };
  facingRight: boolean;
  light: AaLightDirection;
  gaze?: SceneGaze;
};

function targetsFromScene(script: SceneScript, out: AaLookTarget[]): void {
  for (const actor of script.cast) {
    if (!actor.aachar) continue;
    out.push({
      ref: actor.aachar,
      facingRight: actor.facing === "right",
      light: script.light ?? "left",
      gaze: actor.aachar.gaze,
    });
  }
}

// BANJOPOCALYPSE port note: the lesson-specific collectors that walked
// accountingsurvivor's Challenge content were dropped here; the game builds
// its AaLookTarget lists directly (cast screens, baker). `targetsFromScene`
// stays for SceneScript-shaped casts.
export function collectSceneLookTargets(script: SceneScript): AaLookTarget[] {
  const out: AaLookTarget[] = [];
  targetsFromScene(script, out);
  return out;
}

export async function prewarmAaLooks(
  targets: readonly AaLookTarget[],
  horseNames: readonly string[] = [],
): Promise<void> {
  if (targets.length === 0 && horseNames.length === 0) return;
  const bundle = await loadAaSceneBundle();
  if (!bundle) return;
  const seen = new Set<string>();
  for (const t of targets) {
    const direction = effectiveLightDirection(t.light, t.facingRight);
    const gaze = rigGazeFor(t.gaze, t.facingRight);
    const key = aaSceneLookKey(t.ref, direction, gaze);
    if (seen.has(key)) continue;
    seen.add(key);
    const resolved = resolveAaSceneActor(
      bundle,
      t.ref.name,
      t.ref.hide,
      t.ref.mouth,
    );
    if (!resolved) continue;
    await cachedAaSceneLook(resolved, direction, gaze, key).catch(() => {});
  }
  for (const name of horseNames) {
    const part = resolveAaSceneHorse(bundle, name);
    if (!part) continue;
    await cachedAaHorseAtlas(bundle, part).catch(() => {});
  }
}
