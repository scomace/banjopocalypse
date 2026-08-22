// Promote level drafts into the authored w{N}.ts files.
//
//   npx tsx scripts/level-promote.mts w4-07          one draft
//   npx tsx scripts/level-promote.mts all            every draft on disk
//   flags: --dry    show what would change, write nothing
//          --keep   leave the draft file in place after promoting
//          --force  promote even if the authored grid moved since the draft began
//
// Afterwards: npm run typecheck && npx tsx scripts/level-audit.mts N

import { draftId } from "../src/game/levels/drafts";
import { readDraftsDir } from "./level-drafts-node";
import { promoteDraft, PromoteConflictError } from "./level-promote-lib";

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const targets = args.filter((a) => !a.startsWith("--"));
const opts = { dry: flags.has("--dry"), keep: flags.has("--keep"), force: flags.has("--force") };

if (targets.length === 0) {
  console.log("usage: level-promote <w4-07 | all> [--dry] [--keep] [--force]");
  process.exit(2);
}

let ids = targets;
if (targets.includes("all")) {
  const { drafts, problems } = await readDraftsDir();
  for (const p of problems) console.log(`skipping ${p}`);
  ids = drafts.map((d) => draftId(d.world, d.level));
  if (!ids.length) console.log("no drafts on disk");
}

let failed = 0;
for (const id of ids) {
  try {
    const r = await promoteDraft(id, opts);
    console.log(
      `${opts.dry ? "[dry] " : ""}${r.id} -> ${r.file}: ${r.changedRows} row(s) changed` +
        (r.draftDeleted ? ", draft removed" : opts.keep || opts.dry ? "" : " (draft was already gone)"),
    );
  } catch (err) {
    failed++;
    const msg = err instanceof PromoteConflictError ? `CONFLICT: ${err.message}` : String(err instanceof Error ? err.message : err);
    console.log(`${id}: ${msg}`);
  }
}
if (!opts.dry && ids.length && failed < ids.length) {
  console.log("\nnext: npm run typecheck && npx tsx scripts/level-audit.mts");
}
process.exit(failed ? 1 : 0);
