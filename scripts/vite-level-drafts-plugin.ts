/**
 * scripts/vite-level-drafts-plugin.ts — dev-server endpoints behind the level
 * editor (/admin/levels). See docs/level-editor.md.
 *
 * GET  /__levels/drafts            → { ok, drafts: LevelDraft[], promoteEnabled }
 * POST /__levels/drafts/save       { draft }        → writes src/game/levels/drafts/<id>.json
 * POST /__levels/drafts/delete     { id }           → removes it
 * POST /__levels/drafts/promote    { id, force? }   → rewrites w{N}.ts (403 unless
 *                                                     BANJO_ALLOW_PROMOTE=1 on the server)
 *
 * Drafts live under src/ so they're versioned with the levels, but the folder
 * is NOT in the module graph: nothing imports it, so a save never invalidates
 * a module or reloads the editor. The game learns about drafts through
 * loadDevDrafts() at boot and through the editor poking the registry after
 * each save. Dev-serve only (`apply: "serve"`), like its siblings.
 */

import type { Plugin } from "vite";
import { validateDraft } from "../src/game/levels/drafts";
import { deleteDraft, readDraftsDir, writeDraft } from "./level-drafts-node";
import { promoteDraft, PromoteConflictError } from "./level-promote-lib";

const promoteEnabled = () => process.env.BANJO_ALLOW_PROMOTE === "1";

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

export function levelDraftsPlugin(): Plugin {
  return {
    name: "level-drafts",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/__levels/drafts", (req, res, next) => {
        const url = (req.url ?? "/").split("?")[0];
        const r = res as unknown as Res;
        void (async () => {
          try {
            if (req.method === "GET" && (url === "/" || url === "")) {
              const { drafts, problems } = await readDraftsDir();
              send(r, 200, { ok: true, drafts, problems, promoteEnabled: promoteEnabled() });
              return;
            }
            if (req.method !== "POST") {
              send(r, 405, { ok: false, error: "POST only" });
              return;
            }
            const body = (await readBody(req as unknown as NodeJS.ReadableStream)) as {
              draft?: unknown;
              id?: unknown;
              force?: unknown;
            };
            if (url === "/save") {
              const draft = validateDraft(body.draft);
              draft.savedAt = new Date().toISOString();
              const file = await writeDraft(draft);
              send(r, 200, { ok: true, draft, file });
              return;
            }
            if (url === "/delete") {
              if (typeof body.id !== "string") throw new Error("id required");
              const removed = await deleteDraft(body.id);
              send(r, 200, { ok: true, removed });
              return;
            }
            if (url === "/promote") {
              if (!promoteEnabled()) {
                send(r, 403, {
                  ok: false,
                  error: "promotion from the editor is off; start the dev server with BANJO_ALLOW_PROMOTE=1 or run npm run levels:promote",
                });
                return;
              }
              if (typeof body.id !== "string") throw new Error("id required");
              const result = await promoteDraft(body.id, { force: body.force === true });
              send(r, 200, { ok: true, ...result });
              return;
            }
            next();
          } catch (err) {
            const conflict = err instanceof PromoteConflictError;
            send(r, conflict ? 409 : 400, {
              ok: false,
              error: err instanceof Error ? err.message : String(err),
              ...(conflict ? { conflict: true } : {}),
            });
          }
        })();
      });
    },
  };
}
