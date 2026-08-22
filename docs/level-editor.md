# Level editor (/admin/levels)

A dev tool for tuning the 99 authored layouts without hand-editing ASCII. Opens
at `http://localhost:5199/#/admin/levels` under `npm run dev` (it ships in the
static build too, minus saving).

## What it does

- Pick a world and level; the grid renders with that world's tile skins
  (Canvas2D port of `render/textures.ts`), or any other world's via the skin
  dropdown.
- Paint tiles (`=` platform, `#` solid, `^` spikes), wind (`~ < >`), markers
  (`1 2 a-d J S W R`), erase, and a floor-hole tool that only touches row 16.
  Hotkeys are the grid symbols themselves; right-drag erases with any tool.
- Select tool (`v`): click a platform run to select it, drag its body to move,
  drag its ends to resize, arrow keys nudge, Delete removes. The jump envelope
  overlay shows how far the weakest jumper can reach from the selected surface.
- Inspector: enemy legend (a-d with world defaults shown), hurry-up seconds,
  Second Pour override, a free-text note.
- Lint (live): the reachability audit from `game/levels/audit.ts` (the same
  model `scripts/level-audit.mts` runs), tier-grid rows, floating markers,
  spawn rows, undeclared letters, enemy counts, shrine placement.
- Export: paste-ready TS snippet, the draft JSON, or a diff summary vs authored.
- "Edit as text" opens the raw 17-line grid in a textarea.
- Undo/redo (ctrl+z / ctrl+y), working copy autosaved to localStorage per slot.

## Drafts, not saves

The authored `src/game/levels/w{N}.ts` files are never written by the editor.
"Save draft to disk" posts to the dev server
(`scripts/vite-level-drafts-plugin.ts`) which writes
`src/game/levels/drafts/w4-07.json`. The folder is versioned but not imported
by anything, so a save never reloads the page.

In dev the game applies drafts automatically: `main.tsx` calls
`loadDevDrafts()` before first render, and `getLevelDef()` in
`game/levels/index.ts` returns the draft when one is registered. The editor
also registers a draft the moment it is saved, so a game tab already open
picks it up on its next level build. The "game uses drafts" checkbox (stored
in localStorage) lets you A/B the authored layout without deleting the draft.

"Play this level" opens a quickstart tab with the draft in the URL
(`?draft=<json>`); `registerDraftFromUrl` in `drafts.ts` pins it on for that
tab. That works with or without the dev server, and in production builds.

## Promotion

- `npm run levels:promote w4-07` rewrites the 7th `grid: [` block of `w4.ts`
  (rows, `enemies:`, optional `hurryTicks:`/`secondPour:`), leaves every
  comment alone, and deletes the draft. `--dry` previews, `--keep` keeps the
  draft, `--force` ignores a `basedOn` mismatch (the authored grid changed
  since the draft started).
- `npm run levels:promote all` does every draft on disk.
- The editor's Promote button exists but is hidden unless the dev server runs
  with `BANJO_ALLOW_PROMOTE=1`; the endpoint returns 403 otherwise.
- Or just ask Claude to promote a draft: the JSON on disk is the hand-off.

## Checks

- `npm run levels:check` validates every draft and runs the audit on each.
- `npm run levels:audit -- --drafts` audits all 99 levels with drafts applied.
- `npm run typecheck` after a promotion.

## Files

| file | role |
|---|---|
| `src/game/levels/drafts.ts` | draft type, validation, override registry, TS export (browser + Node) |
| `src/game/levels/draftsClient.ts` | browser calls to the dev endpoints |
| `src/game/levels/audit.ts` | reachability model (extracted from the audit script) |
| `src/screens/admin-levels/*` | the editor: `LevelEditor.tsx` page, `GridCanvas.tsx`, `model.ts` grid ops/tools, `lint.ts`, `tileArt.ts` |
| `scripts/vite-level-drafts-plugin.ts` | dev endpoints: list / save / delete / promote |
| `scripts/level-drafts-node.ts` | disk I/O for drafts |
| `scripts/level-promote-lib.ts`, `scripts/level-promote.mts` | promotion text surgery + CLI |
| `scripts/level-drafts-check.mts` | draft lint CLI |
