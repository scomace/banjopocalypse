/**
 * scripts/vite-sfx-trim-plugin.ts — dev-server endpoint behind the SFX mixer
 * (/admin/sfx).
 *
 * GET  /__sfx/trims          → { ok, trims, file }
 * POST /__sfx/trims/save     { trims: Record<string, number> }
 *                            → writes src/game/audio/sfx-trim.json
 *
 * The trim table IS in the module graph (engine.ts imports it so the built
 * game ships the balance), so a save triggers Vite's HMR for that module.
 * The mixer keeps its unsaved edits live in the engine either way, and the
 * written file is the truth it reloads from. Dev-serve only.
 */

import fs from "node:fs/promises";
import path from "node:path";
import type { Plugin } from "vite";

export const SFX_TRIM_FILE = "src/game/audio/sfx-trim.json";

type Res = NodeJS.WritableStream & {
  statusCode: number;
  setHeader: (k: string, v: string) => void;
};

function send(res: Res, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

function readBody(req: NodeJS.ReadableStream): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

/** Accept only a flat { name: finite non-negative number } table. */
export function validateTrims(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("trims must be an object");
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!/^[A-Za-z0-9:_-]{1,64}$/.test(k)) throw new Error(`bad sfx name ${JSON.stringify(k)}`);
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 16) {
      throw new Error(`bad trim for ${k}: ${String(v)}`);
    }
    out[k] = Math.round(v * 10000) / 10000;
  }
  return out;
}

export async function writeTrims(trims: Record<string, number>, root = process.cwd()): Promise<string> {
  const clean = validateTrims(trims);
  await fs.writeFile(path.join(root, SFX_TRIM_FILE), JSON.stringify(clean, null, 2) + "\n", "utf8");
  return SFX_TRIM_FILE;
}

export async function readTrims(root = process.cwd()): Promise<Record<string, number>> {
  return validateTrims(JSON.parse(await fs.readFile(path.join(root, SFX_TRIM_FILE), "utf8")));
}

export function sfxTrimPlugin(): Plugin {
  return {
    name: "sfx-trims",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/__sfx/trims", (req, res, next) => {
        const url = (req.url ?? "/").split("?")[0];
        const r = res as unknown as Res;
        void (async () => {
          try {
            if (req.method === "GET" && (url === "/" || url === "")) {
              send(r, 200, { ok: true, trims: await readTrims(), file: SFX_TRIM_FILE });
              return;
            }
            if (req.method === "POST" && url === "/save") {
              const body = (await readBody(req as unknown as NodeJS.ReadableStream)) as { trims?: unknown };
              const file = await writeTrims(validateTrims(body.trims));
              send(r, 200, { ok: true, file });
              return;
            }
            next();
          } catch (err) {
            send(r, 400, { ok: false, error: err instanceof Error ? err.message : String(err) });
          }
        })();
      });
    },
  };
}
