// AA clip library — the registry. See docs/aachar-plan.md § Phase 6.
//
// Content lives in TypeScript here for the same reason the course does
// (CLAUDE.md): it deploys with the app, it typechecks, and a duplicate name is
// a build error rather than a runtime surprise.
//
// The engine ships 38 clips; content references 24 of them, and the
// distribution is steep — `idle` and `move` alone are 56% of all references.
// As of 2026-07-30 the authored set covers EVERY engine clip name (the two
// banned ones excepted) — the "stay unwritten until something plays them"
// tail was closed deliberately, to remove the last SPUM motion an AA
// character could ever play.
//
// The SPUM fall-through in `clipLibrary.ts` still exists as a mechanism, but
// no engine name reaches it anymore — `clipCoverage` would report any
// regression.

import type { AaClip } from "../clip";
import { checkClip } from "../clip";

import {
  attack_melee,
  axe_attack,
  damaged,
  debuff_stun,
  long_spear_attack,
  short_sword_attack,
  skill_melee,
  stab,
  throwClip,
  uppercut,
  yay,
} from "./action";
import { attack_bow, buff, concentrate, skill_bow, skill_magic } from "./cast";
import {
  death_sit,
  death_sleep,
  die,
  fall_forward,
  getup,
  sit,
  sit_idle,
  sleep,
  sleep_idle,
} from "./floor";
import {
  idle,
  jump,
  jump2,
  long_spear_idle,
  long_spear_walk,
  move,
  move_1handcarryup_loop,
  move_2handcarry_loop,
  move_2handcarryup_loop,
  move_carry_loop,
  run,
  run2,
  zombie_walk,
} from "./locomotion";
import { give, givereceive, greeting1, greeting2, greeting3, receive } from "./social";

// Clip names an AA character must NEVER play, in any form — not authored here,
// not a model override, not the SPUM fall-through. The editor hides them from
// its pickers, `clipCoverage` never suggests authoring them, and resolution
// (`clipLibrary.ts`) substitutes `idle` for anything that still asks. Removing
// a name from this set is the only way to re-enable it.
// `move_carry` means only the exact name — the carry family around it
// (`move_carry_loop` and the AA-original `move_*carry*_loop` variants) stays.
export const BANNED_CLIPS: ReadonlySet<string> = new Set(["attack_magic", "move_carry"]);

export * from "./action";
export * from "./cast";
export * from "./floor";
export * from "./locomotion";
export * from "./social";

// Frame counts of the engine's own clips, at 60fps. LOCKED: scene content is
// timed against these durations, so an AA clip that replaces one must be the
// same length or every scene that plays it drifts. Verified against
// `public/spum/anims/*.json` by test.
export const LOCKED_FRAMES: Record<string, number> = {
  attack_bow: 50,
  attack_magic: 25,
  attack_melee: 25,
  axe_attack: 43,
  buff: 30,
  concentrate: 30,
  damaged: 20,
  death_sit: 60,
  death_sleep: 60,
  debuff_stun: 30,
  die: 40,
  getup: 60,
  give: 26,
  givereceive: 52,
  greeting1: 40,
  greeting2: 40,
  greeting3: 50,
  idle: 20,
  jump: 30,
  jump2: 30,
  long_spear_attack: 30,
  long_spear_idle: 26,
  long_spear_walk: 40,
  move: 40,
  move_carry: 40,
  move_carry_loop: 40,
  receive: 26,
  run: 20,
  run2: 20,
  short_sword_attack: 25,
  sit: 60,
  sit_idle: 30,
  skill_bow: 40,
  skill_magic: 40,
  skill_melee: 30,
  sleep: 60,
  sleep_idle: 30,
  throw: 21,
};

// How often each clip is referenced across `content/` — measured, and the
// reason the authored set is the set it is. Shown in the editor so the next
// clip to author is never a guess.
export const CLIP_USAGE: Record<string, number> = {
  idle: 93,
  move: 72,
  givereceive: 34,
  throw: 14,
  move_carry_loop: 11,
  greeting1: 7,
  run: 7,
  greeting2: 6,
  attack_magic: 5,
  greeting3: 5,
  long_spear_walk: 5,
  move_carry: 5,
  death_sleep: 4,
  getup: 4,
  skill_magic: 4,
  sleep_idle: 4,
  attack_melee: 3,
  concentrate: 3,
  damaged: 3,
  long_spear_idle: 3,
  attack_bow: 2,
  buff: 1,
  sit_idle: 1,
};

const AUTHORED: AaClip[] = [
  idle,
  move,
  run,
  move_carry_loop,
  greeting1,
  greeting2,
  receive,
  give,
  givereceive,
  throwClip,
  damaged,
  attack_melee,
  // AA-ORIGINAL clips — names with no SPUM counterpart. Nothing falls through
  // to them, no duration is locked against them, and the originality gate
  // skips them (there is nothing to trace). They only play where an AA
  // character resolves clips through this library.
  //
  // Lineage worth knowing: `stab` is throw v1 (read as a poke), `uppercut` is
  // throw v2 (read as a rising punch), `yay` is uppercut's symmetric variant
  // (both arms up = a cheer). Playtest named all three — bad throws, good
  // clips.
  stab,
  uppercut,
  yay,
  // Carry variants — duplicates of `move_carry_loop` awaiting their own poses.
  move_2handcarryup_loop,
  move_1handcarryup_loop,
  move_2handcarry_loop,
  // The walk with dead arms — held at stance so they never move (AA-original).
  zombie_walk,
  // The tail (2026-07-29): every remaining clip content references. Casting,
  // archery and self-effort…
  skill_magic,
  attack_bow,
  buff,
  concentrate,
  // …the floor set (death_sleep is a backward faint with a post-contact head
  // bounce, matching the reference's structure; getup derives from it,
  // sleep_idle breathes over its end pose; `fall_forward` is the AA-original
  // face-down flop the first death_sleep was)…
  death_sleep,
  getup,
  sleep_idle,
  fall_forward,
  sit_idle,
  // …and the formal bow + the spear pair (walk derived from `move`).
  greeting3,
  long_spear_walk,
  long_spear_idle,
  // The unreferenced tail (2026-07-30): the 13 engine clips nothing in
  // `content/` plays yet, authored anyway so NO engine name resolves to
  // SPUM's motion anymore. Same method as the rest — budgets + grammar,
  // interior beats off SPUM's keys, gated. `jump2` derives from `jump`,
  // `die` shares FACEPLANT_POSE with `fall_forward`, `sit`/`sleep` end
  // exactly on the poses `sit_idle`/`sleep_idle` rest over.
  run2,
  jump,
  jump2,
  short_sword_attack,
  axe_attack,
  skill_melee,
  long_spear_attack,
  skill_bow,
  sit,
  sleep,
  death_sit,
  die,
  debuff_stun,
];

// Duplicate names and structural errors fail at MODULE LOAD, not in the
// browser — the same bargain the content registry makes (CLAUDE.md).
export const AA_CLIPS: Record<string, AaClip> = (() => {
  const out: Record<string, AaClip> = {};
  for (const clip of AUTHORED) {
    if (out[clip.name]) throw new Error(`duplicate AA clip "${clip.name}"`);
    if (BANNED_CLIPS.has(clip.name)) {
      throw new Error(`AA clip "${clip.name}" is banned — see BANNED_CLIPS`);
    }
    const locked = LOCKED_FRAMES[clip.name];
    if (locked !== undefined && clip.frames !== locked) {
      throw new Error(
        `AA clip "${clip.name}" is ${clip.frames}f but the engine's is ${locked}f — ` +
          `scene timings are authored against the engine's duration`,
      );
    }
    const errors = checkClip(clip).filter((p) => p.level === "error");
    if (errors.length > 0) {
      throw new Error(`AA clip "${clip.name}": ${errors.map((e) => e.message).join("; ")}`);
    }
    out[clip.name] = clip;
  }
  return out;
})();

export const AA_CLIP_NAMES: string[] = Object.keys(AA_CLIPS).sort();

export type ClipCoverage = {
  authored: { name: string; uses: number }[];
  missing: { name: string; uses: number }[];
  /** Share of all clip references in `content/` that an authored clip covers. */
  referenceShare: number;
};

/** What the authored set covers, by weight of actual use. Banned names are
 *  out of scope entirely — never counted, never listed as worth authoring. */
export function clipCoverage(): ClipCoverage {
  const total = Object.entries(CLIP_USAGE)
    .filter(([name]) => !BANNED_CLIPS.has(name))
    .reduce((a, [, b]) => a + b, 0);
  const authored: ClipCoverage["authored"] = [];
  const missing: ClipCoverage["missing"] = [];
  let covered = 0;
  for (const name of Object.keys(LOCKED_FRAMES)) {
    if (BANNED_CLIPS.has(name)) continue;
    const uses = CLIP_USAGE[name] ?? 0;
    if (AA_CLIPS[name]) {
      authored.push({ name, uses });
      covered += uses;
    } else if (uses > 0) {
      missing.push({ name, uses });
    }
  }
  authored.sort((a, b) => b.uses - a.uses);
  missing.sort((a, b) => b.uses - a.uses);
  return { authored, missing, referenceShare: total === 0 ? 1 : covered / total };
}
