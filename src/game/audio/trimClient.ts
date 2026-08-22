// Browser side of the SFX trim table: talks to the Vite dev-server endpoint
// in scripts/vite-sfx-trim-plugin.ts. Resolves to null / throws a plain
// message when there is no dev server (production build, Electron, static
// preview): the static host answers these URLs with index.html, never JSON.

const BASE = "/__sfx/trims";

async function asJson(res: Response): Promise<Record<string, unknown> | null> {
  if (!res.headers.get("content-type")?.includes("application/json")) return null;
  try {
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** The table as it sits on disk, or null when there is no dev server. */
export async function fetchSavedTrims(): Promise<Record<string, number> | null> {
  try {
    const res = await fetch(BASE, { cache: "no-store" });
    const body = await asJson(res);
    if (!body || body.ok !== true || !body.trims || typeof body.trims !== "object") return null;
    return body.trims as Record<string, number>;
  } catch {
    return null;
  }
}

/** Writes src/game/audio/sfx-trim.json. Returns the file path written. */
export async function saveTrimsToServer(trims: Record<string, number>): Promise<string> {
  const res = await fetch(`${BASE}/save`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ trims }),
  });
  const body = await asJson(res);
  if (!body) throw new Error("no dev server (saving trims needs `npm run dev`)");
  if (body.ok !== true) throw new Error(String(body.error ?? `HTTP ${res.status}`));
  return String(body.file);
}
