// AA character pipeline — resolving a clip for a model (Phase 6).
//
// Three layers, in precedence order:
//
//   1. the model's own `clips` override   — the editor's working copy
//   2. the built-in library               — `lib/aachar/clips/`, deploys with
//                                           the app, typechecked, build-failing
//   3. nothing                            — the caller falls back to the SPUM
//                                           clip of the same name
//
// Layer 3 is what made an incomplete library safe while it was incomplete:
// an unauthored name kept playing rather than rendering a T-pose. Since
// 2026-07-30 the library authors every engine clip name (banned ones
// excepted), so no engine name reaches layer 3 anymore — it survives as the
// safety net for a name added to the engine later, and `clipSource` still
// reports which layer answered.
//
// One exception sits above all three layers: `BANNED_CLIPS`. A banned name
// resolves to the model's `idle` instead — never its own motion, never the
// SPUM fall-through — so an AA character asked to play one stands neutrally.

import type { Clip } from "@/lib/spum/types";

import { NEUTRAL_STANCE, type AaClip, type AaStance, compileClip } from "./clip";
import { AA_CLIPS, BANNED_CLIPS } from "./clips";
import type { AaModel } from "./types";

export type ClipSource = "override" | "library" | "spum";

/** The stance a model's clips are authored against.
 *
 *  Defaults to the RIG'S NEUTRAL, not to anything derived — proportion controls
 *  are tuned against the skeleton's own `defaultPos`, so a different default
 *  would move a character that was already dialled in. `fittedStance` is the
 *  opt-in alternative. */
export function modelStance(model: AaModel): AaStance {
  return model.stance ?? NEUTRAL_STANCE;
}

export function resolveAaClip(model: AaModel, name: string): AaClip | null {
  const key = BANNED_CLIPS.has(name) ? "idle" : name;
  return model.clips?.[key] ?? AA_CLIPS[key] ?? null;
}

export function clipSource(model: AaModel, name: string): ClipSource {
  const key = BANNED_CLIPS.has(name) ? "idle" : name;
  if (model.clips?.[key]) return "override";
  if (AA_CLIPS[key]) return "library";
  return "spum";
}

/**
 * The `Clip` to hand `SpumCharacter`'s `clipOverride`, or null to let the
 * renderer fetch SPUM's by name.
 *
 * Compiling on demand rather than caching: a beat sheet is a handful of poses
 * and the compile is a few dozen object allocations, which is nothing next to
 * the render it feeds. Memoise at the component boundary if it ever matters.
 */
export function compiledAaClip(model: AaModel, name: string): Clip | null {
  const clip = resolveAaClip(model, name);
  return clip ? compileClip(clip, modelStance(model)) : null;
}

/** Store an edited beat sheet on the model. */
export function upsertModelClip(model: AaModel, clip: AaClip): AaModel {
  return { ...model, clips: { ...(model.clips ?? {}), [clip.name]: clip } };
}

/** Drop an override, falling back to the built-in library entry. */
export function revertModelClip(model: AaModel, name: string): AaModel {
  if (!model.clips?.[name]) return model;
  const clips = { ...model.clips };
  delete clips[name];
  return { ...model, clips };
}

/** A beat sheet as a pasteable TypeScript literal — how an edited clip gets
 *  promoted out of the manifest and into `lib/aachar/clips/`, the same way the
 *  SPUM scene editor's "Copy scene" works. */
export function clipToSource(clip: AaClip): string {
  const num = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, "").replace(/\.$/, ""));
  const pose = (p: AaClip["beats"][number]["pose"]) => {
    const entries = Object.entries(p).map(([ch, v]) => {
      const parts: string[] = [];
      if (v.rot) parts.push(`rot: ${num(v.rot)}`);
      if (v.x) parts.push(`x: ${num(v.x)}`);
      if (v.y) parts.push(`y: ${num(v.y)}`);
      return `        ${ch}: { ${parts.join(", ")} },`;
    });
    return entries.length ? `{\n${entries.join("\n")}\n      }` : "{}";
  };
  const beats = clip.beats
    .map(
      (b) =>
        `    {\n      frame: ${b.frame},\n      role: "${b.role}",\n      pose: ${pose(b.pose)},` +
        (b.note ? `\n      note: ${JSON.stringify(b.note)},` : "") +
        `\n    },`,
    )
    .join("\n");
  return (
    `export const ${clip.name.replace(/[^A-Za-z0-9_]/g, "_")}: AaClip = {\n` +
    `  name: ${JSON.stringify(clip.name)},\n` +
    `  frames: ${clip.frames},\n` +
    `  loop: ${clip.loop},\n` +
    (clip.eyeState ? `  eyeState: ${JSON.stringify(clip.eyeState)},\n` : "") +
    (clip.gaze ? `  gaze: ${JSON.stringify(clip.gaze)},\n` : "") +
    (clip.rest && Object.keys(clip.rest).length ? `  rest: ${pose(clip.rest)},\n` : "") +
    (clip.note ? `  note: ${JSON.stringify(clip.note)},\n` : "") +
    `  beats: [\n${beats}\n  ],\n};\n`
  );
}
