// Promote a level draft into its authored w{N}.ts file. Pure text surgery on
// the Nth `grid: [` block: the 17 row strings, the `enemies:` line and the
// optional `hurryTicks:` / `secondPour:` lines are rewritten in place and
// everything else in the file (the header essay, the per-level comments) is
// left exactly as it was. Shared by the CLI (level-promote.mts) and the
// dev-server endpoint (vite-level-drafts-plugin.ts, off unless
// BANJO_ALLOW_PROMOTE=1).

import fs from "node:fs/promises";
import path from "node:path";
import { GRID_H } from "../src/game/sim/constants";
import {
  draftId,
  enemiesToTs,
  gridHash,
  parseDraftId,
  type LevelDraft,
} from "../src/game/levels/drafts";
import { deleteDraft, draftPath } from "./level-drafts-node";

export class PromoteConflictError extends Error {
  readonly conflict = true;
  constructor(readonly authoredHash: string, readonly basedOn: string) {
    super(
      `the authored level changed since this draft was started (now ${authoredHash}, draft based on ${basedOn}); re-open it in the editor or promote with force`,
    );
  }
}

export type PromoteTextResult = {
  text: string;
  /** rows the file held before the rewrite */
  authoredGrid: string[];
  changedRows: number;
};

/** Rewrite level `level` (1..11) of a w{N}.ts source text with the draft. */
export function promoteIntoText(
  source: string,
  level: number,
  draft: LevelDraft,
  opts: { force?: boolean } = {},
): PromoteTextResult {
  const eol = source.includes("\r\n") ? "\r\n" : "\n";
  const lines = source.split(/\r?\n/);

  const gridStarts: { idx: number; indent: string }[] = [];
  lines.forEach((ln, i) => {
    const m = /^(\s*)grid: \[\s*$/.exec(ln);
    if (m) gridStarts.push({ idx: i, indent: m[1] });
  });
  if (gridStarts.length < level) {
    throw new Error(`file has ${gridStarts.length} grid blocks, wanted level ${level}`);
  }
  const { idx: gi, indent } = gridStarts[level - 1];
  const objIndent = indent.slice(0, Math.max(0, indent.length - 2));
  const rowIndent = indent + "  ";

  // the row strings run until the closing bracket of the array
  let close = gi + 1;
  const authoredGrid: string[] = [];
  while (close < lines.length && !/^\s*\],?\s*$/.test(lines[close])) {
    const m = /^\s*"((?:[^"\\]|\\.)*)",?\s*$/.exec(lines[close]);
    if (!m) throw new Error(`grid block for level ${level}: unexpected line ${close + 1}: ${lines[close]}`);
    authoredGrid.push(JSON.parse(`"${m[1]}"`) as string);
    close++;
  }
  if (close >= lines.length) throw new Error(`grid block for level ${level} never closes`);
  if (authoredGrid.length !== GRID_H) {
    throw new Error(`grid block for level ${level} has ${authoredGrid.length} rows, expected ${GRID_H}`);
  }

  // the level object ends at the first `},` back at the object's indentation
  const objEndRe = new RegExp(`^${objIndent}\\},?\\s*$`);
  let objEnd = close + 1;
  while (objEnd < lines.length && !objEndRe.test(lines[objEnd])) objEnd++;
  if (objEnd >= lines.length) throw new Error(`level ${level} object never closes`);

  if (draft.basedOn && !opts.force) {
    const authoredHash = gridHash(authoredGrid);
    if (authoredHash !== draft.basedOn) throw new PromoteConflictError(authoredHash, draft.basedOn);
  }

  // fields between the grid and the object end; enemies is always present
  // in the authored files, hurryTicks/secondPour usually are not
  const tail = lines.slice(close + 1, objEnd);
  const enemiesAt = tail.findIndex((ln) => /^\s*enemies:/.test(ln));
  if (enemiesAt < 0) throw new Error(`level ${level} has no enemies: line`);
  if (!/\},?\s*$/.test(tail[enemiesAt])) {
    throw new Error(`level ${level}: enemies: spans several lines; promote by hand`);
  }
  const fields = [`${indent}enemies: ${enemiesToTs(draft.enemies)},`];
  if (draft.hurryTicks !== undefined) fields.push(`${indent}hurryTicks: ${draft.hurryTicks},`);
  if (draft.secondPour !== undefined) fields.push(`${indent}secondPour: ${draft.secondPour},`);
  // the fields go where enemies sat; comment lines around them stay put
  const notOverride = (ln: string) => !/^\s*(hurryTicks|secondPour):/.test(ln);
  const before = tail.slice(0, enemiesAt).filter(notOverride);
  const after = tail.slice(enemiesAt + 1).filter(notOverride);

  const rows = draft.grid.map((r) => `${rowIndent}${JSON.stringify(r)},`);
  const out = [
    ...lines.slice(0, gi + 1),
    ...rows,
    lines[close],
    ...before,
    ...fields,
    ...after,
    ...lines.slice(objEnd),
  ];
  let changedRows = 0;
  for (let i = 0; i < GRID_H; i++) if (authoredGrid[i] !== draft.grid[i]) changedRows++;
  return { text: out.join(eol), authoredGrid, changedRows };
}

export type PromoteResult = {
  id: string;
  file: string;
  changedRows: number;
  draftDeleted: boolean;
};

/** Read the draft, rewrite the world file, delete the draft (unless keep). */
export async function promoteDraft(
  id: string,
  opts: { root?: string; force?: boolean; keep?: boolean; dry?: boolean } = {},
): Promise<PromoteResult> {
  const root = opts.root ?? process.cwd();
  const slot = parseDraftId(id);
  if (!slot) throw new Error(`bad draft id ${JSON.stringify(id)}`);
  const raw = await fs.readFile(draftPath(root, id), "utf8");
  const draft = JSON.parse(raw) as LevelDraft;
  if (draftId(draft.world, draft.level) !== id) {
    throw new Error(`draft file ${id} says it is ${draftId(draft.world, draft.level)}`);
  }
  const rel = `src/game/levels/w${slot.world}.ts`;
  const file = path.join(root, rel);
  const source = await fs.readFile(file, "utf8");
  const { text, changedRows } = promoteIntoText(source, slot.level, draft, { force: opts.force });
  if (!opts.dry) {
    await fs.writeFile(file, text, "utf8");
  }
  const draftDeleted = !opts.dry && !opts.keep ? await deleteDraft(id, root) : false;
  return { id, file: rel, changedRows, draftDeleted };
}
