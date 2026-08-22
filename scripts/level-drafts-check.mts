// Lint every level draft on disk: shape, symbols, and the same geometry audit
// the authored levels get. Exit 1 on any problem, so a half-saved draft can't
// sit in the repo unnoticed.
//
//   npx tsx scripts/level-drafts-check.mts

import { auditLevelDef } from "../src/game/levels/audit";
import { absoluteLevelIndex, draftId, draftToLevelDef, gridHash } from "../src/game/levels/drafts";
import { getAuthoredLevelDef } from "../src/game/levels";
import { levelWithWorldDefaults } from "../src/game/levels/parse";
import { worldForLevel } from "../src/game/levels/worlds";
import { readDraftsDir } from "./level-drafts-node";

const { drafts, problems } = await readDraftsDir();
let bad = problems.length;
for (const p of problems) console.log(`  ${p}`);

for (const d of drafts) {
  const id = draftId(d.world, d.level);
  const idx = absoluteLevelIndex(d.world, d.level);
  const world = worldForLevel(idx);
  const def = levelWithWorldDefaults(draftToLevelDef(d), world.defaultEnemies);
  const r = auditLevelDef(idx, def);
  const notes: string[] = [];
  if (r.orphanRuns.length) {
    notes.push(
      `${r.orphanRuns.length}/${r.totalRuns} unreachable surfaces [${r.orphanRuns
        .map((o) => `r${o.row}c${o.c0}-${o.c1}`)
        .join(" ")}]`,
    );
  }
  if (r.strandedEnemies.length) notes.push(`${r.strandedEnemies.length} stranded enemies`);
  notes.push(...r.contentErrors);
  const authoredHash = gridHash(getAuthoredLevelDef(idx).grid);
  const stale = d.basedOn !== undefined && d.basedOn !== authoredHash;
  if (stale) notes.push("authored level changed since this draft began (promote will need --force)");
  const changed = d.grid.filter((row, i) => row !== getAuthoredLevelDef(idx).grid[i]).length;
  const head = `${id.padEnd(6)} ${changed} row(s) differ from authored${d.note ? ` | ${d.note}` : ""}`;
  if (notes.length) {
    bad++;
    console.log(`  ${head}\n      ${notes.join("\n      ")}`);
  } else {
    console.log(`  ${head}: ok`);
  }
}

console.log(
  bad === 0
    ? `\nLEVEL DRAFTS: ${drafts.length} draft(s), all clean`
    : `\nLEVEL DRAFTS: ${bad} problem(s) across ${drafts.length + problems.length} file(s)`,
);
process.exit(bad ? 1 : 0);
