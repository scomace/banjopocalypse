// AA character pipeline — self-contained `.aachar.json` export/import.
//
// The export is a BACKUP AND TRANSPORT format, deliberately independent of the
// dev server: every PNG is inlined as a data URL, so a bundle restores a whole
// project on a machine that has never seen `public/aachar/`. That is the point
// of having it — the Part Studio's only durable path is a dev-server write,
// which makes drafts hostage to a running Vite.
//
// The unit of export is the PROJECT (model + characters), not a character. A
// character is only its picks and proportions; without the model's art it
// restores to nothing.

import { validateProject } from "./character";
import type { AaProject } from "./types";

export const BUNDLE_EXTENSION = ".aachar.json";

// Fetch a PNG and re-encode it as a data URL. Already-inlined images pass
// through untouched, which is the common case while editing (the canvas hands
// the renderer a data URL directly).
async function inlineImage(url: string): Promise<string> {
  if (url.startsWith("data:")) return url;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not read part image: ${url}`);
  const blob = await res.blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(`Could not encode image: ${url}`));
    reader.readAsDataURL(blob);
  });
}

// Serialize a project with every image inlined. Throws if an image can't be
// read — a bundle that silently drops art would be worse than no bundle.
export async function exportProject(project: AaProject): Promise<string> {
  const parts = await Promise.all(
    project.model.parts.map(async (part) => ({
      ...part,
      atlas: { ...part.atlas, image: await inlineImage(part.atlas.image) },
    })),
  );
  return JSON.stringify(
    { ...project, model: { ...project.model, parts } },
    null,
    2,
  );
}

export type ImportResult =
  | { ok: true; project: AaProject }
  | { ok: false; error: string };

export function importProject(text: string): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: "Not valid JSON" };
  }
  const result = validateProject(parsed);
  return result.ok
    ? { ok: true, project: result.value }
    : { ok: false, error: result.error };
}

// Trigger a browser download. Kept here so the editor doesn't grow DOM
// plumbing for what is conceptually part of the export.
export function downloadBundle(filename: string, text: string): void {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(BUNDLE_EXTENSION)
    ? filename
    : `${filename}${BUNDLE_EXTENSION}`;
  a.click();
  URL.revokeObjectURL(url);
}
