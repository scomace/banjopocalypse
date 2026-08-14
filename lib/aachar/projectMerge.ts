// AA character pipeline — 3-way project merge (the manifest-clobber fix).
//
// The editor keeps its whole project in localStorage and autosaves it over
// `public/aachar/manifest.json`, which means any manifest edit made OUTSIDE
// the editor (a registration script, a hand edit, an agent authoring `eyes`
// marks) used to be silently erased by the next editor save — the editor
// never re-read the disk. This module is the reconciliation half of the fix:
// given the last manifest text the editor synced with (BASE), the editor's
// current draft (OURS) and the manifest now on disk (THEIRS), produce one
// project containing both sides' work.
//
// Granularity is the ENTITY, not the field: a part (keyed slot/name), a
// character (name), an outfit (name), and "the rest of the model" (geometry,
// skeleton, zOrder, stance, clips — one blob). Per entity:
//
//   unchanged vs base on one side → take the side that changed;
//   changed on both sides        → OURS wins (the human is in the editor),
//                                  and the entity is reported as a conflict;
//   deleted on one side          → deletion sticks unless the other side
//                                  changed it (then the change survives and
//                                  the entity is reported);
//   no base (first sync)         → THEIRS wins conflicts — disk is the
//                                  durable copy and the draft may be stale.
//
// Pure module — no fs, no fetch — so it is unit-testable and shared by the
// mount-time reconcile and the save-conflict retry in AaCharAdmin.tsx.

import type { AaModel, AaProject } from "./types";

export type ProjectMergeResult = {
  merged: AaProject;
  /** Entities BOTH sides changed since base (one side's version won — see
   *  module comment for which). Labels like `part cloth/shirtpants`. */
  conflicts: string[];
  /** Entities adopted or dropped because of the disk side (informational —
   *  "part eye/sleepyeyes (disk)", "character Bram (deleted on disk)"). */
  fromDisk: string[];
};

const stringify = (v: unknown) => JSON.stringify(v);
const eq = (a: unknown, b: unknown) => stringify(a) === stringify(b);

type Keyed<T> = { key: (item: T) => string; describe: (key: string) => string };

function mergeEntityList<T>(
  { key, describe }: Keyed<T>,
  base: readonly T[],
  ours: readonly T[],
  theirs: readonly T[],
  preferTheirsOnConflict: boolean,
  conflicts: string[],
  fromDisk: string[],
): T[] {
  const baseBy = new Map(base.map((e) => [key(e), e]));
  const oursBy = new Map(ours.map((e) => [key(e), e]));
  const theirsBy = new Map(theirs.map((e) => [key(e), e]));

  const out: T[] = [];
  const seen = new Set<string>();

  // Disk order first (it is the durable copy), then ours-only entities in
  // draft order — stable, and a no-op merge reproduces the disk manifest.
  for (const t of theirs) {
    const k = key(t);
    seen.add(k);
    const o = oursBy.get(k);
    const b = baseBy.get(k);
    if (o === undefined) {
      // Not in the draft. New on disk → adopt. Known at base → the draft
      // deleted it: honour the deletion unless disk changed it since base.
      if (b === undefined) {
        out.push(t);
        fromDisk.push(`${describe(k)} (disk)`);
      } else if (eq(b, t)) {
        // deleted in ours, untouched on disk → stays deleted
      } else {
        conflicts.push(`${describe(k)} (deleted in editor, changed on disk)`);
        if (preferTheirsOnConflict) {
          out.push(t);
          fromDisk.push(`${describe(k)} (disk)`);
        }
      }
      continue;
    }
    if (eq(o, t)) {
      out.push(o);
      continue;
    }
    if (b !== undefined && eq(b, o)) {
      // Draft never touched it; disk did → take disk.
      out.push(t);
      fromDisk.push(`${describe(k)} (disk)`);
    } else if (b !== undefined && eq(b, t)) {
      // Disk never touched it; draft did → take the draft.
      out.push(o);
    } else {
      conflicts.push(describe(k));
      if (preferTheirsOnConflict) {
        out.push(t);
        fromDisk.push(`${describe(k)} (disk)`);
      } else {
        out.push(o);
      }
    }
  }

  for (const o of ours) {
    const k = key(o);
    if (seen.has(k)) continue;
    const b = baseBy.get(k);
    if (b === undefined) {
      // Brand new in the draft → keep.
      out.push(o);
    } else if (eq(b, o)) {
      // Untouched in the draft, deleted on disk → deletion sticks.
      fromDisk.push(`${describe(k)} (deleted on disk)`);
    } else {
      // Draft changed it, disk deleted it → the change survives.
      conflicts.push(`${describe(k)} (changed in editor, deleted on disk)`);
      if (!preferTheirsOnConflict) out.push(o);
      else fromDisk.push(`${describe(k)} (deleted on disk)`);
    }
  }

  return out;
}

const PART_KEY: Keyed<AaModel["parts"][number]> = {
  key: (p) => `${p.slot}/${p.name}`,
  describe: (k) => `part ${k}`,
};
const NAME_KEY = <T extends { name: string }>(kind: string): Keyed<T> => ({
  key: (e) => e.name,
  describe: (k) => `${kind} ${k}`,
});

/**
 * Merge the on-disk manifest (`theirs`) into the editor draft (`ours`)
 * against the last-synced manifest (`base`, null on first sync — see module
 * comment for the null-base conflict rule).
 */
export function mergeProjects(
  base: AaProject | null,
  ours: AaProject,
  theirs: AaProject,
): ProjectMergeResult {
  const conflicts: string[] = [];
  const fromDisk: string[] = [];
  const preferTheirs = base === null;

  const emptyProject: AaProject = {
    version: 1,
    model: { ...theirs.model, parts: [] },
    characters: [],
  };
  const b = base ?? emptyProject;

  const parts = mergeEntityList(
    PART_KEY,
    b.model.parts,
    ours.model.parts,
    theirs.model.parts,
    preferTheirs,
    conflicts,
    fromDisk,
  );
  const characters = mergeEntityList(
    NAME_KEY("character"),
    b.characters,
    ours.characters,
    theirs.characters,
    preferTheirs,
    conflicts,
    fromDisk,
  );
  const outfits = mergeEntityList(
    NAME_KEY("outfit"),
    b.outfits ?? [],
    ours.outfits ?? [],
    theirs.outfits ?? [],
    preferTheirs,
    conflicts,
    fromDisk,
  );

  // Everything on the model except `parts` merges as ONE entity — geometry,
  // skeleton, zOrder, stance, clips move together or not at all. Field-level
  // merging inside e.g. `clips` isn't worth the ambiguity at this scale.
  const restOf = (m: AaModel): Omit<AaModel, "parts"> => {
    const { parts: _parts, ...rest } = m;
    return rest;
  };
  const bRest = base ? restOf(base.model) : undefined;
  const oRest = restOf(ours.model);
  const tRest = restOf(theirs.model);
  let modelRest = oRest;
  if (!eq(oRest, tRest)) {
    if (bRest !== undefined && eq(bRest, oRest)) {
      modelRest = tRest;
      fromDisk.push("model settings (disk)");
    } else if (bRest !== undefined && eq(bRest, tRest)) {
      modelRest = oRest;
    } else {
      conflicts.push("model settings");
      if (preferTheirs) {
        modelRest = tRest;
        fromDisk.push("model settings (disk)");
      }
    }
  }

  const merged: AaProject = {
    version: 1,
    model: { ...modelRest, parts },
    characters,
    ...(outfits.length > 0 ? { outfits } : {}),
  };
  return { merged, conflicts, fromDisk };
}
