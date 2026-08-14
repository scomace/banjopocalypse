// AA character pipeline — name suggestions for the Characters tab.
//
// The add-character prompt used to default to a fixed string, and the live
// manifest shows where that leads: seven characters named "afsdf", "dfg",
// "gsdfgsdfgdsf". A suggested default that is already valid (NAME_RE), unused,
// and worth keeping makes Enter the path of least resistance.

import { NAME_RE } from "./character";
import type { Rng } from "./random";

// Short, pixel-RPG-flavoured, and heavy on the money puns this app runs on.
// Every entry satisfies NAME_RE (pinned by test). "Bram" is deliberately
// absent — that name belongs to the story's own character (docs/story.md),
// and a random villager shouldn't collide with him.
export const CHARACTER_NAMES: readonly string[] = [
  "Penny", "Ledger", "Cash", "Buck", "Sterling", "Goldie", "Nickel", "Bill",
  "Audra", "Marge", "Ernest", "Flo", "Otto", "Greta", "Milo", "Ivy",
  "Rex", "Wren", "Cleo", "Basil", "Hazel", "Rufus", "Olive", "Pip",
  "Ezra", "Mabel", "Cyrus", "Dot", "Gus", "Nora", "Felix", "June",
  "Amos", "Vera", "Silas", "Tilly", "Bruno", "Ollie", "Ida", "Cedric",
  "Poppy", "Hank", "Elsie", "Maude", "Clark", "Sadie", "Angus", "Fern",
];

export function suggestCharacterName(
  taken: Iterable<string>,
  rng: Rng = Math.random,
): string {
  const used = new Set(taken);
  const free = CHARACTER_NAMES.filter((n) => !used.has(n));
  if (free.length > 0) {
    return free[Math.min(free.length - 1, Math.floor(rng() * free.length))];
  }
  // Pool exhausted: number a pool name, the convention suggestPartName set
  // ("Penny" → "Penny2").
  const base =
    CHARACTER_NAMES[
      Math.min(CHARACTER_NAMES.length - 1, Math.floor(rng() * CHARACTER_NAMES.length))
    ];
  for (let n = 2; n < 1000; n++) {
    if (!used.has(`${base}${n}`)) return `${base}${n}`;
  }
  return base;
}

// Default name for "save this look". The clothing pick usually IS the look's
// identity, and the batch-authored cloths share a "shirtpants" prefix that
// says nothing about them ("shirtpantsninja" → "ninja"). Falls back to
// "outfit" when there's no cloth (or nothing left after the strip), and
// numbers itself past collisions.
export function suggestOutfitName(
  clothPick: string | undefined,
  taken: Iterable<string>,
): string {
  const used = new Set(taken);
  const stripped = (clothPick ?? "").replace(/^shirtpants/i, "");
  const base = NAME_RE.test(stripped) ? stripped : "outfit";
  if (!used.has(base)) return base;
  for (let n = 2; n < 1000; n++) {
    if (!used.has(`${base}${n}`)) return `${base}${n}`;
  }
  return base;
}
