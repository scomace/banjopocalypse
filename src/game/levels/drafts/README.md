# Level drafts

One JSON file per level slot (`w4-07.json` = world 4, level 7), written by the
level editor at `/admin/levels` through the dev server. Nothing imports this
folder: the game picks drafts up at boot in dev (`main.tsx` -> `loadDevDrafts`)
and `getLevelDef()` serves the draft instead of the authored grid.

- `npm run levels:check` lints every draft (shape + reachability audit)
- `npm run levels:audit -- --drafts` runs the full audit with drafts applied
- `npm run levels:promote w4-07` writes the draft into `src/game/levels/w4.ts`
  and deletes the file (`--dry`, `--keep`, `--force` available)

See `docs/level-editor.md`.
