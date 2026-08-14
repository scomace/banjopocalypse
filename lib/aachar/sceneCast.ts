// AA character pipeline — Phase 7: named AA characters as scene actors.
//
// A scene names a character (`SceneActor.aachar: { name }`) and this module
// turns that name into everything `SpumCharacter` needs: the project's art as
// `atlasOverrides` (with the character's full look baked in), the composed
// skeleton, per-slot placement adjustments, and AA clips via `clipOverride`.
//
// Two layers, mirroring how the editor renders:
//
//   resolveAaSceneActor  — SYNC. Manifest + skeleton → raw overrides,
//                          composed skeleton, slot adjustments. Enough to
//                          render the character immediately, unshaded.
//   bakeAaSceneLook      — ASYNC (canvas decodes). The editor's whole bake
//                          chain in its exact order: recolour → hat-hair →
//                          eye nudge → eye-state band swap → auto-shading.
//                          Every step is served by the lib/aachar caches, so
//                          two actors wearing the same look share the work.
//
// The bundle (manifest + SPUM base skeleton) is fetched ONCE per session and
// cached as a promise — every scene on a page shares one fetch. The manifest
// lives in `public/aachar/` and deploys with the app like any static asset;
// nothing here touches the module graph (docs/aachar-plan.md D5).

import type { CharacterConfig, SpumSlot } from "@/lib/spum/catalog";
import type { PartNudge } from "@/lib/spum/partAdjustments";
import type { SceneAaRef, Skeleton, SpriteAtlas } from "@/lib/spum/types";

import {
  colorPicksFor,
  effectiveProportions,
  effectiveZOrder,
  findPart,
  validateProject,
} from "./character";
import { isIdentityEyeNudge, isIdentityGaze } from "./gaze";
import { eyeAdjustedAtlas } from "./gazeAtlas";
import { applyHorseFace } from "./horse/face";
import { findHorsePart, horseModelOf, type AaHorsePart } from "./horse/model";
import { HELMET_REGION } from "./hatHair";
import { hatHairedAtlas } from "./hatHairAtlas";
import { measureBottomProfile } from "./imageIo";
import { isIdentityTransform } from "./recolor";
import { recoloredAtlas } from "./recolorAtlas";
import { applyEyeState, toAtlasOverrides, toSlotAdjustments } from "./render";
import { effectiveRamps } from "./shade";
import { shadedAtlas } from "./shadeAtlas";
import { composeSkeleton } from "./skeleton";
import {
  AA_SLOTS,
  type AaCharacter,
  type AaGaze,
  type AaLightDirection,
  type AaModel,
  type AaProject,
  type AaSlot,
} from "./types";

export const AA_MANIFEST_URL = "/aachar/manifest.json";
const SKELETON_URL = "/spum/skeleton.json";

export type AaSceneBundle = {
  project: AaProject;
  baseSkeleton: Skeleton;
};

export type AaLookOverrides = Partial<Record<SpumSlot, SpriteAtlas>>;
type Overrides = AaLookOverrides;

// One fetch per session. A failed load resolves to null (and logs) rather
// than rejecting: a scene with an AA actor should degrade to "that actor is
// absent", not take the whole lesson down with an unhandled rejection.
let bundlePromise: Promise<AaSceneBundle | null> | null = null;

export function loadAaSceneBundle(): Promise<AaSceneBundle | null> {
  if (!bundlePromise) {
    bundlePromise = (async () => {
      try {
        const [manifestRes, skeletonRes] = await Promise.all([
          fetch(AA_MANIFEST_URL),
          fetch(SKELETON_URL),
        ]);
        if (!manifestRes.ok || !skeletonRes.ok) {
          throw new Error(
            `manifest ${manifestRes.status} / skeleton ${skeletonRes.status}`,
          );
        }
        const result = validateProject(await manifestRes.json());
        if (!result.ok) throw new Error(`invalid manifest: ${result.error}`);
        const baseSkeleton = (await skeletonRes.json()) as Skeleton;
        return { project: result.value, baseSkeleton };
      } catch (err) {
        console.error("[aachar] could not load the scene bundle:", err);
        return null;
      }
    })();
  }
  return bundlePromise;
}

/** Test seam — reset the session cache. */
export function clearAaSceneBundleCache(): void {
  bundlePromise = null;
}

export type ResolvedAaActor = {
  model: AaModel;
  /** The named character with any scene-hidden slots already removed from its
   *  picks — every downstream consumer (bakes, adjustments) sees one truth. */
  character: AaCharacter;
  /** SPUM base + model proportions + character deltas + AA draw order. */
  skeleton: Skeleton;
  /** Raw (unbaked) art. The bake chain starts from this; the renderer only
   *  ever paints it as the failure floor (a look bake that REJECTED) — a
   *  first mount holds instead, so unadjusted colours never flash before the
   *  baked look lands (see AaSceneCharacter's first-paint policy). */
  rawOverrides: Overrides;
  slotAdjustments: Partial<Record<SpumSlot, PartNudge>> | undefined;
};

// Sync half: name → renderable character. Returns null (and logs in dev) for
// a name the manifest doesn't know — the build-time check in
// scripts/validate-content.ts should make that unreachable for shipped
// content, so this is the safety net for ad-hoc scenes.
export function resolveAaSceneActor(
  bundle: AaSceneBundle,
  name: string,
  hide?: readonly string[],
  mouth?: string,
): ResolvedAaActor | null {
  const source = bundle.project.characters.find((c) => c.name === name);
  if (!source) {
    console.error(
      `[aachar] scene actor names unknown character "${name}". ` +
        `Known: ${bundle.project.characters.map((c) => c.name).join(", ")}`,
    );
    return null;
  }
  let character = source;
  if ((hide && hide.length > 0) || mouth) {
    const picks = { ...source.picks };
    for (const slot of hide ?? []) delete picks[slot as AaSlot];
    // Mouth override (SceneAaRef.mouth): swap the faceHair pick for another
    // manifest part. Unknown names keep the character's own mouth — a typo
    // should degrade to "resting face", not to a missing atlas.
    if (mouth) {
      if (findPart(bundle.project.model, "faceHair", mouth)) {
        picks.faceHair = mouth;
      } else {
        console.warn(
          `[aachar] mouth override "${mouth}" is not a faceHair part in the ` +
            `manifest — keeping ${name}'s default mouth.`,
        );
      }
    }
    character = { ...source, picks };
  }
  const model = bundle.project.model;
  const { skeleton } = composeSkeleton(
    bundle.baseSkeleton,
    effectiveProportions(model, character),
    effectiveZOrder(model),
  );
  return {
    model,
    character,
    skeleton,
    rawOverrides: toAtlasOverrides(model, character),
    slotAdjustments: toSlotAdjustments(character),
  };
}

const SHADED_SLOTS: readonly AaSlot[] = AA_SLOTS.filter((s) => s !== "eye");

// Async half: the editor's bake chain (AaCharAdmin.tsx), in its exact order —
// recolour first (spill samples recoloured hair), hat-hair against the RAW
// helmet (the cut is about alpha), eye pixel bakes before the band-rect swap,
// shading dead last so the rim reads the final colours. Per-clip eye state
// is still deferred (the character's RESTING eye state applies); `gaze`
// (RIG-space — the caller has already unmirrored screen-space for facing)
// bakes a pupil offset via the same Phase-12 pass the editor uses. It only
// moves pupils on eye parts with authored `eyes` marks. No caller gaze falls
// back to the character's resting `gaze` — already rig-space, so it rides the
// facing mirror untouched, like the rest of the face.
export async function bakeAaSceneLook(
  resolved: ResolvedAaActor,
  light: AaLightDirection,
  gaze?: AaGaze,
): Promise<Overrides> {
  const { model, character, skeleton } = resolved;
  const out: Overrides = { ...resolved.rawOverrides };

  // 1 — per-character colours + appearance (per-pixel, outline-protected).
  for (const slot of AA_SLOTS) {
    const name = character.picks[slot];
    const atlas = out[slot as SpumSlot];
    if (!name || !atlas) continue;
    const part = findPart(model, slot, name);
    if (!part) continue;
    const picks = colorPicksFor(model, character, slot);
    const appearance = character.appearance?.[slot];
    if (
      isIdentityTransform({
        channels: part.colorChannels,
        picks,
        appearance,
        protect: part.protect,
      })
    ) {
      continue;
    }
    out[slot as SpumSlot] = await recoloredAtlas(part, picks, appearance);
  }

  // 2 — hat-hair, baked into the recoloured hair against the raw helmet.
  const mode = character.hatHair ?? "none";
  const rawHelmet = resolved.rawOverrides.helmet;
  if (mode !== "none" && out.hair && rawHelmet) {
    const helmetPart = findPart(model, "helmet", character.picks.helmet ?? "");
    const profile =
      helmetPart?.contentBottomProfile?.[HELMET_REGION] ??
      (await measureBottomProfile(rawHelmet, HELMET_REGION));
    out.hair = await hatHairedAtlas(mode, out.hair, rawHelmet, profile, skeleton, {
      hair: character.placement?.hair,
      helmet: character.placement?.helmet,
    });
  }

  // 3 — per-eye nudge + gaze (pixels), then the resting eye state (a rect
  // repoint).
  const eyePart = findPart(model, "eye", character.picks.eye ?? "");
  const effectiveGaze = gaze ?? character.gaze;
  if (
    out.eye &&
    eyePart?.eyes &&
    (!isIdentityEyeNudge(character.eyeNudge) || !isIdentityGaze(effectiveGaze))
  ) {
    out.eye = await eyeAdjustedAtlas(
      out.eye,
      eyePart.eyes,
      character.eyeNudge,
      effectiveGaze,
    );
  }
  if (out.eye) {
    out.eye = applyEyeState(
      out.eye,
      character.eyeState ?? "open",
      eyePart?.eyeBands,
    );
  }

  // 4 — auto-shading (never the eye slot).
  const style = character.shading ?? "none";
  if (style !== "none") {
    for (const slot of SHADED_SLOTS) {
      const atlas = out[slot as SpumSlot];
      if (!atlas) continue;
      const part = findPart(model, slot, character.picks[slot] ?? "");
      const ramps = part
        ? effectiveRamps(
            part.colorChannels,
            colorPicksFor(model, character, slot),
            character.appearance?.[slot],
            part.protect,
          )
        : [];
      out[slot as SpumSlot] = await shadedAtlas(
        atlas,
        style,
        light,
        ramps,
        part?.protect,
      );
    }
  }

  return out;
}

// ── Baked-look cache ────────────────────────────────────────────────────
//
// `bakeAaSceneLook` is cheap (the per-step caches do the real work) but it is
// still ASYNC — even a fully warm bake resolves a promise tick after mount,
// which used to paint one frame of raw art before the baked colours snapped
// in. These two maps close that gap: `cachedAaSceneLook` shares in-flight
// bakes and records finished looks, and `peekAaSceneLook` hands a finished
// look back SYNCHRONOUSLY so a warm mount's first paint is already correct.
// `prewarmAaLooks` (scenePrewarm.ts) fills the cache when a lesson loads.

const lookJobs = new Map<string, Promise<Overrides>>();
const lookDone = new Map<string, Overrides>();

// A gaze direction is its own name; a pair has to serialize, because two
// pairs differing only in `gap` are two different bakes. Key order is fixed
// by construction (`rigGazeFor` always builds left/right/gap in that order),
// so the serialized form is stable across renders.
function gazeKeyPart(gaze: AaGaze | undefined): string {
  if (!gaze) return "-";
  return typeof gaze === "string" ? gaze : JSON.stringify(gaze);
}

// Everything a baked look's OUTPUT depends on. The character NAME stands in
// for its whole recipe (colours, appearance, placement): the scene bundle is
// fetched once per session, so a character's manifest entry cannot change
// under a live key.
export function aaSceneLookKey(
  ref: Pick<SceneAaRef, "name" | "hide" | "mouth">,
  direction: AaLightDirection,
  gaze: AaGaze | undefined,
): string {
  return [
    ref.name,
    (ref.hide ?? []).join(","),
    ref.mouth ?? "-",
    direction,
    gazeKeyPart(gaze),
  ].join("|");
}

/** A finished look for this key, synchronously — or undefined if it has not
 *  baked yet this session. */
export function peekAaSceneLook(key: string): Overrides | undefined {
  return lookDone.get(key);
}

export function cachedAaSceneLook(
  resolved: ResolvedAaActor,
  light: AaLightDirection,
  gaze: AaGaze | undefined,
  key: string,
): Promise<Overrides> {
  const hit = lookJobs.get(key);
  if (hit) return hit;
  const job = bakeAaSceneLook(resolved, light, gaze).then((look) => {
    lookDone.set(key, look);
    return look;
  });
  lookJobs.set(key, job);
  // A failed bake (a PNG not served yet) should retry on the next mount, not
  // stay poisoned for the session.
  job.catch(() => lookJobs.delete(key));
  return job;
}

/** Test seam — reset the baked-look cache. */
export function clearAaLookCache(): void {
  lookJobs.clear();
  lookDone.clear();
}

// ── AA horse mounts (H8 follow-up, docs/aachar-horse-plan.md) ───────────
//
// A scene mount naming an AA horse (`SceneMount.aaHorse`) renders the part's
// sheet through SpumHorse's `atlasOverride` seam — but the part's face picks
// (eyes/mouth) composite into the Head region at render time, and that
// composite is ASYNC (canvas decode). Same first-paint bargain as character
// looks: a cache with a sync peek, prewarmed per lesson, so a warm mount's
// first frame is the faced horse and a cold one holds for the few ms the
// composite takes instead of flashing the faceless sheet.

/** The named AA horse part, or null (with a dev log) for an unknown name —
 *  same safety-net contract as `resolveAaSceneActor`. */
export function resolveAaSceneHorse(
  bundle: AaSceneBundle,
  name: string,
): AaHorsePart | null {
  const horse = horseModelOf(bundle.project.model);
  const part = findHorsePart(horse, name);
  if (!part) {
    console.error(
      `[aachar] scene mount names unknown AA horse "${name}". ` +
        `Known: ${horse.parts.map((p) => p.name).join(", ") || "(none)"}`,
    );
    return null;
  }
  return part;
}

const horseAtlasJobs = new Map<string, Promise<SpriteAtlas>>();
const horseAtlasDone = new Map<string, SpriteAtlas>();

/** The faced atlas for this horse name, synchronously — or undefined if it
 *  has not composited yet this session. The part NAME is the whole key: the
 *  bundle is fetched once per session, so a part's face picks cannot change
 *  under a live key. */
export function peekAaHorseAtlas(name: string): SpriteAtlas | undefined {
  return horseAtlasDone.get(name);
}

export function cachedAaHorseAtlas(
  bundle: AaSceneBundle,
  part: AaHorsePart,
): Promise<SpriteAtlas> {
  const hit = horseAtlasJobs.get(part.name);
  if (hit) return hit;
  const custom = horseModelOf(bundle.project.model).faces;
  const job = applyHorseFace(part.atlas, part.face, custom).then((atlas) => {
    horseAtlasDone.set(part.name, atlas);
    return atlas;
  });
  horseAtlasJobs.set(part.name, job);
  // A failed composite (the PNG not served yet) retries on the next mount.
  job.catch(() => horseAtlasJobs.delete(part.name));
  return job;
}

/** Test seam — reset the faced-horse-atlas cache. */
export function clearAaHorseAtlasCache(): void {
  horseAtlasJobs.clear();
  horseAtlasDone.clear();
}

// Re-exported so the scene layer has a single import site.
export { AA_RENDER_CONFIG } from "./render";
export { compiledAaClip } from "./clipLibrary";
export { effectiveLightDirection } from "./shade";
export { compiledHorseClip } from "./horse/model";
export { compiledRiderClip } from "./horse/rider";
export type { CharacterConfig };
