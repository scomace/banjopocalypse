// Node side of level drafts: read/write src/game/levels/drafts/*.json. Shared
// by the Vite plugin (scripts/vite-level-drafts-plugin.ts) and the CLIs
// (level-audit --drafts, level-drafts-check, level-promote). Browser code
// never imports this; it talks to the plugin's endpoints instead.

import fs from "node:fs/promises";
import path from "node:path";
import {
  draftId,
  parseDraftId,
  registerDraft,
  validateDraft,
  type LevelDraft,
} from "../src/game/levels/drafts";

export const DRAFTS_DIR = "src/game/levels/drafts";

export function draftPath(root: string, id: string): string {
  return path.join(root, DRAFTS_DIR, `${id}.json`);
}

/** Every valid draft on disk, plus one problem line per file that isn't one. */
export async function readDraftsDir(
  root = process.cwd(),
): Promise<{ drafts: LevelDraft[]; problems: string[] }> {
  const dir = path.join(root, DRAFTS_DIR);
  const drafts: LevelDraft[] = [];
  const problems: string[] = [];
  let names: string[] = [];
  try {
    names = (await fs.readdir(dir)).filter((n) => n.endsWith(".json")).sort();
  } catch {
    return { drafts, problems };
  }
  for (const name of names) {
    const id = name.slice(0, -".json".length);
    try {
      const slot = parseDraftId(id);
      if (!slot) throw new Error("filename must look like w4-07.json");
      const draft = validateDraft(JSON.parse(await fs.readFile(path.join(dir, name), "utf8")));
      if (draft.world !== slot.world || draft.level !== slot.level) {
        throw new Error(`file says ${draftId(draft.world, draft.level)} inside`);
      }
      drafts.push(draft);
    } catch (err) {
      problems.push(`${name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return { drafts, problems };
}

export async function writeDraft(draft: LevelDraft, root = process.cwd()): Promise<string> {
  const clean = validateDraft(draft);
  const rel = `${DRAFTS_DIR}/${draftId(clean.world, clean.level)}.json`;
  await fs.mkdir(path.join(root, DRAFTS_DIR), { recursive: true });
  await fs.writeFile(path.join(root, rel), JSON.stringify(clean, null, 2) + "\n", "utf8");
  return rel;
}

export async function deleteDraft(id: string, root = process.cwd()): Promise<boolean> {
  if (!parseDraftId(id)) throw new Error(`bad draft id ${JSON.stringify(id)}`);
  try {
    await fs.unlink(draftPath(root, id));
    return true;
  } catch {
    return false;
  }
}

/** Register every draft on disk so getLevelDef() serves them (scripts). */
export async function loadDraftsFromDisk(
  root = process.cwd(),
): Promise<{ loaded: string[]; problems: string[] }> {
  const { drafts, problems } = await readDraftsDir(root);
  for (const d of drafts) registerDraft(d);
  return { loaded: drafts.map((d) => draftId(d.world, d.level)), problems };
}
