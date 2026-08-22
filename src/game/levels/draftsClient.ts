// Browser side of level drafts: talks to the Vite dev-server endpoints in
// scripts/vite-level-drafts-plugin.ts. Every call resolves to null / false
// when there is no dev server (production build, Electron, static preview):
// the static host answers these URLs with index.html or a 404, never JSON.

import {
  clearDrafts,
  draftId,
  registerDraft,
  unregisterDraft,
  validateDraft,
  type LevelDraft,
} from "./drafts";

const BASE = "/__levels/drafts";

export type DraftListing = {
  drafts: LevelDraft[];
  problems: string[];
  promoteEnabled: boolean;
};

async function asJson(res: Response): Promise<Record<string, unknown> | null> {
  if (!res.headers.get("content-type")?.includes("application/json")) return null;
  try {
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** null = no dev server (or it said something that wasn't JSON). */
export async function fetchDraftListing(): Promise<DraftListing | null> {
  try {
    const res = await fetch(BASE, { cache: "no-store" });
    const body = await asJson(res);
    if (!body || body.ok !== true || !Array.isArray(body.drafts)) return null;
    const drafts: LevelDraft[] = [];
    for (const d of body.drafts as unknown[]) {
      try {
        drafts.push(validateDraft(d));
      } catch {
        // the server already reports unreadable files in `problems`
      }
    }
    return {
      drafts,
      problems: Array.isArray(body.problems) ? (body.problems as string[]) : [],
      promoteEnabled: body.promoteEnabled === true,
    };
  } catch {
    return null;
  }
}

async function post(path: string, payload: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await asJson(res);
  if (!body) throw new Error("no dev server (drafts need `npm run dev`)");
  if (body.ok !== true) throw new Error(String(body.error ?? `HTTP ${res.status}`));
  return body;
}

/** Writes the file and registers it so the game tab serves it immediately. */
export async function saveDraftToServer(draft: LevelDraft): Promise<LevelDraft> {
  const body = await post("/save", { draft });
  const saved = validateDraft(body.draft);
  registerDraft(saved);
  return saved;
}

export async function deleteDraftOnServer(world: number, level: number): Promise<boolean> {
  const body = await post("/delete", { id: draftId(world, level) });
  unregisterDraft(world, level);
  return body.removed === true;
}

export async function promoteDraftOnServer(
  world: number,
  level: number,
  force = false,
): Promise<{ file: string; changedRows: number }> {
  const body = await post("/promote", { id: draftId(world, level), force });
  unregisterDraft(world, level);
  return { file: String(body.file), changedRows: Number(body.changedRows) };
}

/** Dev boot: pull every draft into the registry. Returns how many, or -1
 *  when there is no dev server to ask. */
export async function loadDevDrafts(): Promise<number> {
  const listing = await fetchDraftListing();
  if (!listing) return -1;
  clearDrafts();
  for (const d of listing.drafts) registerDraft(d);
  return listing.drafts.length;
}
