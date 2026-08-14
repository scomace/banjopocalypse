/**
 * scripts/vite-aachar-plugin.ts — dev-server endpoints behind the AA character
 * editor (/admin/aachar). See docs/aachar-plan.md.
 *
 * POST /__aachar/save-part
 *   { slot: "body", name: "torso", pngBase64, atlas }
 *   → writes public/aachar/parts/<slot>/AA_<name>.png + .atlas.json
 *
 * POST /__aachar/save-project
 *   { project: <AaProject> }
 *   → writes public/aachar/manifest.json (model + characters)
 *
 * Parts are filed by SLOT, not by character (docs/aachar-plan.md D10): the art
 * belongs to the base model and is shared by every character that picks it.
 * Scoping the directory by character name would mean copying PNGs sideways the
 * moment a second character existed.
 *
 * WHY THIS EXISTS SEPARATELY FROM vite-part-studio-plugin: that plugin also
 * rewrites `lib/spum/catalog.ts` to register the part. catalog.ts is in the
 * module graph, so every save triggers a full Vite reload and the editor has
 * to reconstruct its draft from localStorage afterwards — the reason saving
 * "doesn't work very well" today. This plugin writes to `public/` ONLY, so
 * nothing invalidates a module and no reload fires. Parts are discovered at
 * runtime through the manifest instead of at build time through a catalog.
 *
 * Dev-serve only (`apply: "serve"`), same as its siblings.
 */

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { Plugin } from "vite";

const AACHAR_ROOT = "public/aachar";
const MANIFEST_REL = `${AACHAR_ROOT}/manifest.json`;
// One rolling backup, overwritten each time a write would shrink the library.
// Deliberately not timestamped: a hundred dated files is a worse recovery story
// than one file that is always "the manifest before the last shrink".
const BACKUP_REL = `${AACHAR_ROOT}/manifest.prev.json`;

// Mirrors AA_SLOTS in lib/aachar/types.ts. Duplicated rather than imported
// because this file runs in the Vite config's Node context, which does not
// resolve the `@/` alias.
//
// `"horse"` is a PLUGIN-ONLY slot (docs/aachar-horse-plan.md H4): it routes
// AA horse sheets to `public/aachar/parts/horse/` but is deliberately NOT in
// the lib's `AA_SLOTS` — horse parts live under `model.horse.parts`, never in
// the character wardrobe.
export const AA_SLOTS = [
  "body",
  "cloth",
  "hair",
  "eye",
  "faceHair",
  "helmet",
  "weapon",
  "weapon2",
  "horse",
] as const;
export type AaPluginSlot = (typeof AA_SLOTS)[number];

const NAME_RE = /^[A-Za-z][A-Za-z0-9]*$/;
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

export type AtlasJson = {
  image: string;
  width: number;
  height: number;
  // Hi-res parts (Phase 8): native px per logical px + smooth-scaling flag.
  // Optional; absent on every pixel-authored part.
  pixelDensity?: number;
  smooth?: boolean;
  regions: Record<
    string,
    { x: number; y: number; width: number; height: number; pivot: { x: number; y: number } }
  >;
};

export type SavePartRequest = {
  slot: AaPluginSlot;
  name: string;
  pngBase64: string;
  atlas: AtlasJson;
};

// Throwing validator. Pure (no fs) so it's unit-testable.
export function validatePartRequest(body: unknown): {
  slot: AaPluginSlot;
  partKey: string;
  png: Buffer;
  atlas: AtlasJson;
} {
  const req = body as Partial<SavePartRequest>;
  if (!req || typeof req !== "object") throw new Error("body must be an object");
  if (!AA_SLOTS.includes(req.slot as AaPluginSlot)) {
    throw new Error(`slot must be one of: ${AA_SLOTS.join(", ")}`);
  }
  const slot = req.slot as AaPluginSlot;
  if (typeof req.name !== "string" || !NAME_RE.test(req.name)) {
    throw new Error(
      `name must be letters/digits starting with a letter, got ${JSON.stringify(req.name)}`,
    );
  }
  // AA_ prefix, never Custom_ — the two pipelines must not be able to collide
  // in any listing or filename (docs/aachar-plan.md D8).
  const partKey = `AA_${req.name}`;

  if (typeof req.pngBase64 !== "string" || req.pngBase64.length === 0) {
    throw new Error("pngBase64 is required");
  }
  const png = Buffer.from(req.pngBase64, "base64");
  if (png.length < 8 || !png.subarray(0, 4).equals(PNG_MAGIC)) {
    throw new Error("pngBase64 does not decode to a PNG");
  }

  const atlas = req.atlas;
  if (
    !atlas ||
    !Number.isInteger(atlas.width) ||
    !Number.isInteger(atlas.height) ||
    atlas.width < 1 ||
    atlas.height < 1 ||
    atlas.width > 512 ||
    atlas.height > 512
  ) {
    throw new Error("atlas.width/height must be integers 1..512");
  }
  if (atlas.pixelDensity !== undefined) {
    const d = atlas.pixelDensity;
    if (typeof d !== "number" || !Number.isFinite(d) || d <= 0 || d > 64) {
      throw new Error("atlas.pixelDensity must be a finite number in (0, 64]");
    }
  }
  if (atlas.smooth !== undefined && typeof atlas.smooth !== "boolean") {
    throw new Error("atlas.smooth must be a boolean");
  }
  const regions = atlas.regions;
  if (!regions || typeof regions !== "object" || Object.keys(regions).length === 0) {
    throw new Error("atlas.regions must be a non-empty object");
  }
  for (const [regionName, r] of Object.entries(regions)) {
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(regionName)) {
      throw new Error(`bad region name ${JSON.stringify(regionName)}`);
    }
    const intIn = (v: unknown, lo: number, hi: number) =>
      typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi;
    if (
      !r ||
      !intIn(r.x, 0, atlas.width - 1) ||
      !intIn(r.y, 0, atlas.height - 1) ||
      !intIn(r.width, 1, atlas.width) ||
      !intIn(r.height, 1, atlas.height) ||
      r.x + r.width > atlas.width ||
      r.y + r.height > atlas.height
    ) {
      throw new Error(`region "${regionName}" rect is outside the atlas canvas`);
    }
    const pivotOk = (v: unknown) =>
      typeof v === "number" && Number.isFinite(v) && v >= -4 && v <= 4;
    if (!r.pivot || !pivotOk(r.pivot.x) || !pivotOk(r.pivot.y)) {
      throw new Error(`region "${regionName}" pivot must be finite numbers`);
    }
  }

  return {
    slot,
    partKey,
    png,
    atlas: {
      image: `/aachar/parts/${slot}/${partKey}.png`,
      width: atlas.width,
      height: atlas.height,
      // Rebuilt field-by-field (not spread) so unknown request fields can't
      // ride into the written .atlas.json — which means new fields must be
      // named here explicitly to survive.
      ...(atlas.pixelDensity !== undefined ? { pixelDensity: atlas.pixelDensity } : {}),
      ...(atlas.smooth !== undefined ? { smooth: atlas.smooth } : {}),
      regions,
    },
  };
}

export async function savePart(
  body: unknown,
  root = process.cwd(),
): Promise<{ partKey: string; files: string[] }> {
  const { slot, partKey, png, atlas } = validatePartRequest(body);

  const relDir = `${AACHAR_ROOT}/parts/${slot}`;
  await fs.mkdir(path.join(root, relDir), { recursive: true });
  const pngRel = `${relDir}/${partKey}.png`;
  const atlasRel = `${relDir}/${partKey}.atlas.json`;
  await fs.writeFile(path.join(root, pngRel), png);
  await fs.writeFile(
    path.join(root, atlasRel),
    JSON.stringify(atlas, null, 2) + "\n",
  );
  return { partKey, files: [pngRel, atlasRel] };
}

export function manifestHash(text: string): string {
  return crypto.createHash("sha256").update(text).digest("hex");
}

// A save whose `baseHash` no longer matches the manifest on disk — someone
// (a script, a hand edit, an agent) changed the file since the editor last
// synced. The editor catches the 409, merges the disk changes into its
// draft (lib/aachar/projectMerge.ts) and retries; nothing is overwritten.
export class ManifestConflictError extends Error {
  readonly conflict = true;
  constructor(readonly currentHash: string) {
    super(
      "manifest changed on disk since the editor last synced — merging and retrying",
    );
  }
}

// Shape-checks only what the write depends on. Deep validation lives in
// `lib/aachar/character.ts` and runs in the editor before this is ever called;
// duplicating it here would mean two copies drifting apart.
export function validateProjectRequest(body: unknown): {
  project: { version: number; model: unknown; characters: unknown[] };
  baseHash?: string;
} {
  const req = body as { project?: unknown; baseHash?: unknown };
  if (req?.baseHash !== undefined && typeof req.baseHash !== "string") {
    throw new Error("baseHash must be a string when present");
  }
  const project = req?.project as
    | { version?: unknown; model?: unknown; characters?: unknown }
    | undefined;
  if (!project || typeof project !== "object") {
    throw new Error("project must be an object");
  }
  if (project.version !== 1) {
    throw new Error(`unsupported project version: ${String(project.version)}`);
  }
  if (!project.model || typeof project.model !== "object") {
    throw new Error("project.model must be an object");
  }
  if (!Array.isArray(project.characters)) {
    throw new Error("project.characters must be an array");
  }
  for (const c of project.characters) {
    const name = (c as { name?: unknown })?.name;
    if (typeof name !== "string" || !NAME_RE.test(name)) {
      throw new Error(
        `character name must be letters/digits starting with a letter, got ${JSON.stringify(name)}`,
      );
    }
  }
  return {
    project: project as { version: number; model: unknown; characters: unknown[] },
    ...(typeof req?.baseHash === "string" ? { baseHash: req.baseHash } : {}),
  };
}

// Rewrites the whole manifest. At this scale (one model, a handful of
// characters) that's cheaper than a merge and avoids partial-write states.
//
// TWO GUARDS, and they are here rather than in the editor on purpose: this is
// the last point before real art stops being reachable, and no client bug can
// route around it. The manifest was destroyed once by a UI that wrote a blank
// project over a full one (docs/aachar-plan.md I11), and "the editor won't do
// that any more" is a weaker promise than "the endpoint won't accept it".
//
//   1. An empty parts library NEVER replaces a populated manifest — rejected.
//   2. Any write that SHRINKS the library copies the old manifest aside first.
//   3. A save carrying `baseHash` (the hash of the manifest text the editor
//      last synced with) is REJECTED with 409 when the disk manifest has
//      changed since — scripts and agents edit the manifest directly, and a
//      whole-project overwrite from a stale editor draft used to erase their
//      work silently (the "manifest clobber"). The editor merges + retries.
//      A save WITHOUT baseHash (legacy caller) still lands, but the old
//      manifest is always copied aside first.
export async function saveProject(
  body: unknown,
  root = process.cwd(),
): Promise<{ characters: number; parts: number; backedUp: boolean; hash: string }> {
  const { project, baseHash } = validateProjectRequest(body);
  const file = path.join(root, MANIFEST_REL);
  await fs.mkdir(path.join(root, AACHAR_ROOT), { recursive: true });

  let existing: string | null = null;
  let existingParts = 0;
  try {
    existing = await fs.readFile(file, "utf8");
    const parsed = JSON.parse(existing) as { model?: { parts?: unknown[] } };
    existingParts = parsed?.model?.parts?.length ?? 0;
  } catch {
    // No manifest yet, or an unreadable one — nothing to protect.
    existing = null;
  }

  if (existing !== null && baseHash !== undefined) {
    const currentHash = manifestHash(existing);
    if (currentHash !== baseHash) throw new ManifestConflictError(currentHash);
  }

  const parts = (project.model as { parts?: unknown[] })?.parts?.length ?? 0;
  if (existingParts > 0 && parts === 0) {
    throw new Error(
      `refusing to replace a manifest holding ${existingParts} parts with an empty one`,
    );
  }

  const backedUp =
    existing !== null && (parts < existingParts || baseHash === undefined);
  if (backedUp) {
    await fs.writeFile(path.join(root, BACKUP_REL), existing as string, "utf8");
  }

  const text = JSON.stringify(project, null, 2) + "\n";
  await fs.writeFile(file, text, "utf8");
  return {
    characters: project.characters.length,
    parts,
    backedUp,
    hash: manifestHash(text),
  };
}

function jsonPost(
  handler: (body: unknown) => Promise<unknown>,
): (
  req: { method?: string },
  res: NodeJS.WritableStream & { statusCode: number; setHeader: (k: string, v: string) => void },
) => void {
  return (req, res) => {
    if (req.method !== "POST") {
      res.statusCode = 405;
      res.end("POST only");
      return;
    }
    let body = "";
    (req as unknown as NodeJS.ReadableStream).on("data", (chunk) => {
      body += chunk;
    });
    (req as unknown as NodeJS.ReadableStream).on("end", async () => {
      res.setHeader("Content-Type", "application/json");
      try {
        const result = await handler(JSON.parse(body));
        res.end(JSON.stringify({ ok: true, ...(result as object) }));
      } catch (err) {
        const conflict = err instanceof ManifestConflictError;
        res.statusCode = conflict ? 409 : 400;
        res.end(
          JSON.stringify({
            ok: false,
            error: err instanceof Error ? err.message : String(err),
            ...(conflict
              ? { conflict: true, currentHash: err.currentHash }
              : {}),
          }),
        );
      }
    });
  };
}

export function aacharPlugin(): Plugin {
  return {
    name: "aachar-save",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/__aachar/save-part", jsonPost((b) => savePart(b)));
      server.middlewares.use("/__aachar/save-project", jsonPost((b) => saveProject(b)));
    },
  };
}
