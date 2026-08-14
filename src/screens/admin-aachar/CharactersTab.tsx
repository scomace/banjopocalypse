"use client";

// AA characters tab — Phase 5 of docs/aachar-plan.md.
//
// Where the model becomes people. No drawing happens here: a character is a
// pick per slot plus a per-bone proportion DELTA over the model's base build
// (D12). Two characters can therefore share every sprite and still read as
// different builds — raise `BodySet` and `HeadSet` and you get a taller,
// longer-legged version of the same guy for free.

import { useCallback, useMemo, useState, type ReactNode } from "react";

import {
  NAME_RE,
  allPartTags,
  applyOutfit,
  channelsOf,
  createBlankCharacter,
  danglingPicks,
  effectiveProportions,
  findPart,
  isIdentityPlacement,
  outfitFromCharacter,
  partsInSlot,
  removeOutfit,
  upsertCharacter,
  upsertOutfit,
  wearsOutfit,
} from "@/lib/aachar/character";
import { gazeGapFor } from "@/lib/aachar/gaze";
import { HAT_HAIR_MODE_LABEL } from "@/lib/aachar/hatHair";
import { suggestCharacterName, suggestOutfitName } from "@/lib/aachar/names";
import { SHADE_STYLE_LABEL } from "@/lib/aachar/shade";
import { CULTIST_THEME, RAIDER_THEME, ROBOT_THEME, SKELETON_THEME, ZOMBIE_THEME, randomizeCharacter, randomizeThemed } from "@/lib/aachar/random";
import {
  channelRamp,
  isIdentityAppearance,
  normalizeHex,
} from "@/lib/aachar/recolor";
import {
  PROPORTION_BONES,
  pxToUnits,
  stockProportions,
  unitsToPx,
} from "@/lib/aachar/skeleton";
import {
  AA_GAZE_DIRECTIONS,
  AA_GROUND_SHADOWS,
  AA_HAT_HAIR_MODES,
  AA_SHADE_STYLES,
  AA_SLOTS,
  SLOT_LABEL,
  type AaAppearance,
  type AaCharacter,
  type AaColorChannel,
  type AaGazeDirection,
  type AaGazePair,
  type AaGazeSide,
  type AaGroundShadow,
  type AaHatHairMode,
  type AaEyeNudge,
  type AaOutfit,
  type AaPlacement,
  type AaProject,
  type AaRestingEyeState,
  type AaShadeStyle,
  type AaSlot,
} from "@/lib/aachar/types";
import type { Skeleton } from "@/lib/spum/types";

import { ItemPickerModal } from "./ItemPickerModal";

// Resting-gaze presets — the crazy-eyes menu. Sides are viewer-relative
// (left = the eye on the left of the screen), an unset side stays as drawn,
// and every direction resolves to "furthest the whites allow", so the same
// preset reads bigger on big eyes and subtler on small ones.
const GAZE_PRESETS: {
  label: string;
  left?: AaGazeDirection;
  right?: AaGazeDirection;
}[] = [
  { label: "cross-eyed", left: "right", right: "left" },
  { label: "cross-eyed up", left: "up-right", right: "up-left" },
  { label: "cross-eyed down", left: "down-right", right: "down-left" },
  { label: "wall-eyed (opposite out)", left: "left", right: "right" },
  { label: "wall-eyed up", left: "up-left", right: "up-right" },
  { label: "wall-eyed down", left: "down-left", right: "down-right" },
  { label: "derp — left up, right down", left: "up", right: "down" },
  { label: "derp — left down, right up", left: "down", right: "up" },
  { label: "derp — diagonal ↖ ↘", left: "up-left", right: "down-right" },
  { label: "derp — diagonal ↙ ↗", left: "down-left", right: "up-right" },
  { label: "lazy left eye (drifts down-out)", left: "down-left" },
  { label: "lazy right eye (drifts down-out)", right: "down-right" },
  { label: "left eye rolls up", left: "up" },
  { label: "right eye rolls up", right: "up" },
  { label: "left eye wanders out", left: "left" },
  { label: "right eye wanders out", right: "right" },
  { label: "left eye stares at nose", left: "right" },
  { label: "right eye stares at nose", right: "left" },
  { label: "one up, one out", left: "up", right: "right" },
  { label: "one down, one in", left: "down", right: "left" },
];

const gazePairKey = (left?: AaGazeDirection, right?: AaGazeDirection) =>
  `${left ?? "-"}|${right ?? "-"}`;

// Ranges chosen so the ends are useful rather than symmetrical: 0 saturation is
// greyscale and 2× is as far as a sprite palette survives, while brightness and
// contrast past 2 flatten everything to white.
const APPEARANCE_FIELDS: {
  key: keyof AaAppearance;
  identity: number;
  min: number;
  max: number;
  step: number;
}[] = [
  { key: "hue", identity: 0, min: -180, max: 180, step: 1 },
  { key: "saturation", identity: 1, min: 0, max: 2, step: 0.01 },
  { key: "brightness", identity: 1, min: 0.2, max: 2, step: 0.01 },
  { key: "contrast", identity: 1, min: 0.2, max: 2, step: 0.01 },
];

// localStorage key for which theme tags Randomize may draw from (the INCLUDED
// set — see the state comment below for why it isn't the excluded one).
const RANDOM_INCLUDED_TAGS_KEY = "aachar-random-included-tags";

type Props = {
  project: AaProject;
  onProjectChange: (next: AaProject) => void;
  selected: string | null;
  onSelect: (name: string | null) => void;
  baseSkeleton: Skeleton | null;
  // The shared rig preview (AaCharAdmin owns it and its state); rendered as a
  // panel in this tab's column flow rather than as a separate right column.
  preview?: ReactNode;
};

export function CharactersTab({
  project,
  onProjectChange,
  selected,
  onSelect,
  baseSkeleton,
  preview,
}: Props) {
  const [message, setMessage] = useState<string | null>(null);
  // Which slot the thumbnail item-picker modal is open for (item R / item L).
  const [pickerSlot, setPickerSlot] = useState<AaSlot | null>(null);
  // Per-slot lock set — the Randomize button skips any slot in here, keeping
  // its part, colours, and appearance. Mirrors the SPUM harness's
  // `IsSpriteFixed` locks. Session-local by design: which slots are pinned is
  // an editing gesture, not character data.
  const [lockedSlots, setLockedSlots] = useState<Set<AaSlot>>(new Set());
  // Tags the user has invited back into Randomize's pool. Stored as the
  // INCLUDED set, not the excluded one, so a tag that appears later (a new
  // "boss" theme authored next month) defaults to excluded without any
  // migration — the filter's whole promise is that themed parts stay out of
  // random villagers until someone opts them in. Persisted in localStorage:
  // it's an editing preference like the locks, but one worth keeping across
  // sessions because unchecking "zombie" every morning would get old.
  const [includedTags, setIncludedTags] = useState<Set<string>>(() => {
    try {
      const raw = window.localStorage.getItem(RANDOM_INCLUDED_TAGS_KEY);
      return new Set(raw ? (JSON.parse(raw) as string[]) : []);
    } catch {
      return new Set();
    }
  });
  const { model, characters } = project;
  const libraryTags = useMemo(() => allPartTags(model), [model]);

  const toggleTagIncluded = useCallback((tag: string) => {
    setIncludedTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      try {
        window.localStorage.setItem(RANDOM_INCLUDED_TAGS_KEY, JSON.stringify(Array.from(next)));
      } catch {
        // Storage full/blocked — the toggle still works for this session.
      }
      return next;
    });
  }, []);

  const flash = useCallback((text: string) => {
    setMessage(text);
    window.setTimeout(() => setMessage(null), 3000);
  }, []);

  const character = useMemo(
    () => characters.find((c) => c.name === selected) ?? null,
    [characters, selected],
  );

  const update = useCallback(
    (next: AaCharacter) => onProjectChange(upsertCharacter(project, next)),
    [project, onProjectChange],
  );

  const handleAdd = useCallback(() => {
    // The default is a real suggestion, not a fixed string — unused, valid,
    // and one Enter away, so keyboard-mash names stop being the easy path.
    const suggestion = suggestCharacterName(characters.map((c) => c.name));
    const name = window.prompt("Character name (letters/digits):", suggestion);
    if (!name) return;
    if (!NAME_RE.test(name)) {
      flash("Name must be letters/digits, starting with a letter");
      return;
    }
    if (characters.some((c) => c.name === name)) {
      flash(`"${name}" already exists`);
      return;
    }
    // Seeded with one of each available part, so a new character renders
    // immediately instead of as an invisible rig.
    const picks: Partial<Record<AaSlot, string>> = {};
    for (const slot of AA_SLOTS) {
      const first = partsInSlot(model, slot)[0];
      if (first) picks[slot] = first.name;
    }
    onProjectChange(upsertCharacter(project, { ...createBlankCharacter(name), picks }));
    onSelect(name);
  }, [characters, model, project, onProjectChange, onSelect, flash]);

  const handleRandomize = useCallback(() => {
    if (!character) return;
    const excludeTags = new Set(libraryTags.filter((t) => !includedTags.has(t)));
    update(randomizeCharacter(model, character, lockedSlots, Math.random, excludeTags));
  }, [character, model, lockedSlots, libraryTags, includedTags, update]);

  // The theme generators: the tag filter inverted. Slots roll from their
  // theme-tagged pool where one exists (eyes, mouths, torn/patched cloths)
  // and fall back to untagged parts where the theme has no art; skin and
  // channel colours come from the theme's curated palettes.
  const handleZombify = useCallback(() => {
    if (!character) return;
    update(randomizeThemed(model, character, ZOMBIE_THEME, lockedSlots));
  }, [character, model, lockedSlots, update]);

  const handleRaiderize = useCallback(() => {
    if (!character) return;
    update(randomizeThemed(model, character, RAIDER_THEME, lockedSlots));
  }, [character, model, lockedSlots, update]);

  const handleRobotize = useCallback(() => {
    if (!character) return;
    update(randomizeThemed(model, character, ROBOT_THEME, lockedSlots));
  }, [character, model, lockedSlots, update]);

  const handleSkeletonize = useCallback(() => {
    if (!character) return;
    update(randomizeThemed(model, character, SKELETON_THEME, lockedSlots));
  }, [character, model, lockedSlots, update]);

  const handleCultify = useCallback(() => {
    if (!character) return;
    update(randomizeThemed(model, character, CULTIST_THEME, lockedSlots));
  }, [character, model, lockedSlots, update]);

  const handleSaveOutfit = useCallback(() => {
    if (!character) return;
    const existing = (project.outfits ?? []).map((o) => o.name);
    const name = window.prompt(
      "Outfit name (letters/digits):",
      suggestOutfitName(character.picks.cloth, existing),
    );
    if (!name) return;
    if (!NAME_RE.test(name)) {
      flash("Name must be letters/digits, starting with a letter");
      return;
    }
    if (
      existing.includes(name) &&
      !window.confirm(`Replace outfit "${name}" with this look?`)
    ) {
      return;
    }
    onProjectChange(upsertOutfit(project, outfitFromCharacter(name, character)));
    flash(`Saved outfit "${name}"`);
  }, [character, project, onProjectChange, flash]);

  const handleWearOutfit = useCallback(
    (outfit: AaOutfit) => {
      if (!character) return;
      update(applyOutfit(character, outfit));
      flash(`${character.name} is wearing "${outfit.name}"`);
    },
    [character, update, flash],
  );

  const handleDeleteOutfit = useCallback(
    (name: string) => {
      if (!window.confirm(`Delete outfit "${name}"? Characters keep what they're wearing.`)) {
        return;
      }
      onProjectChange(removeOutfit(project, name));
    },
    [project, onProjectChange],
  );

  const toggleLock = useCallback((slot: AaSlot) => {
    setLockedSlots((prev) => {
      const next = new Set(prev);
      if (next.has(slot)) next.delete(slot);
      else next.add(slot);
      return next;
    });
  }, []);

  const handleDelete = useCallback(() => {
    if (!character) return;
    if (!window.confirm(`Delete character "${character.name}"? No art is removed.`)) return;
    onProjectChange({
      ...project,
      characters: characters.filter((c) => c.name !== character.name),
    });
    onSelect(null);
  }, [character, characters, project, onProjectChange, onSelect]);

  const setPick = useCallback(
    (slot: AaSlot, name: string) => {
      if (!character) return;
      const picks = { ...character.picks };
      if (name) picks[slot] = name;
      else delete picks[slot];
      update({ ...character, picks });
    },
    [character, update],
  );

  // "open" is deleted rather than stored, same identity rule as placement —
  // an untouched character carries no eyeState at all (Phase 11).
  const setEyeState = useCallback(
    (state: AaRestingEyeState) => {
      if (!character) return;
      const next = { ...character };
      if (state === "open") delete next.eyeState;
      else next.eyeState = state;
      update(next);
    },
    [character, update],
  );

  // Whether the picked eye part actually has half-closed art — the swap
  // refuses to show a blank band, so the control says why instead of doing
  // nothing.
  const eyeHasHalf = useMemo(() => {
    const name = character?.picks.eye;
    if (!name) return false;
    return findPart(model, "eye", name)?.eyeBands?.half === true;
  }, [model, character]);

  // Whether the picked eye part carries eye marks (Phase 12) — per-eye nudge
  // needs to know which pixels belong to which eye.
  const eyeHasMarks = useMemo(() => {
    const name = character?.picks.eye;
    if (!name) return false;
    return findPart(model, "eye", name)?.eyes !== undefined;
  }, [model, character]);

  // Per-eye nudge (Phase 12), same identity rule as placement: a value that
  // says nothing is deleted, all the way up to the whole block.
  const setEyeNudge = useCallback(
    (side: "left" | "right", axis: "dx" | "dy", value: number) => {
      if (!character || !Number.isFinite(value)) return;
      const clamped = Math.max(-32, Math.min(32, Math.round(value)));
      const block = { ...(character.eyeNudge ?? {}) };
      const entry: AaEyeNudge = { ...(block[side] ?? {}), [axis]: clamped };
      if ((entry.dx ?? 0) === 0) delete entry.dx;
      if ((entry.dy ?? 0) === 0) delete entry.dy;
      if (Object.keys(entry).length > 0) block[side] = entry;
      else delete block[side];
      const next = { ...character };
      if (Object.keys(block).length > 0) next.eyeNudge = block;
      else delete next.eyeNudge;
      update(next);
    },
    [character, update],
  );

  const resetEyeNudge = useCallback(
    (side: "left" | "right") => {
      if (!character) return;
      const block = { ...(character.eyeNudge ?? {}) };
      delete block[side];
      const next = { ...character };
      if (Object.keys(block).length > 0) next.eyeNudge = block;
      else delete next.eyeNudge;
      update(next);
    },
    [character, update],
  );

  // Resting gaze as a per-eye pair plus per-eye gaps, whatever form is
  // stored. Same identity rule as everywhere: both sides centered is deleted
  // rather than stored (a gap alone moves nothing, so it goes with them), a
  // uniform gap-less pair collapses back to the single-direction form (what
  // clips and scene actions speak), and equal per-side gaps collapse to the
  // number form.
  const gazePair = useMemo(() => {
    const g = character?.gaze;
    const pair: AaGazePair = !g ? {} : typeof g === "string" ? { left: g, right: g } : g;
    return {
      left: pair.left,
      right: pair.right,
      gapLeft: gazeGapFor(g, "left"),
      gapRight: gazeGapFor(g, "right"),
    };
  }, [character]);

  const setGazePair = useCallback(
    (
      left: AaGazeSide | undefined,
      right: AaGazeSide | undefined,
      gapLeft: number,
      gapRight: number,
    ) => {
      if (!character) return;
      const clampPx = (n: number | undefined) =>
        Math.max(-32, Math.min(32, Math.round(n ?? 0)));
      // A manual offset that says nothing collapses to unset, and zero
      // components are dropped — same identity rule as the eye nudge.
      const normSide = (s: AaGazeSide | undefined): AaGazeSide | undefined => {
        if (!s || typeof s === "string") return s || undefined;
        const dx = clampPx(s.dx);
        const dy = clampPx(s.dy);
        if (dx === 0 && dy === 0) return undefined;
        return { ...(dx !== 0 ? { dx } : {}), ...(dy !== 0 ? { dy } : {}) };
      };
      const l = normSide(left);
      const r = normSide(right);
      // Gaps only ride direction sides — a manual offset owns its exact
      // spot, and a gap on a centered side moves nothing. Dropped either
      // way, so the stored form never carries dead weight.
      const gl = typeof l === "string" ? Math.max(0, gapLeft) : 0;
      const gr = typeof r === "string" ? Math.max(0, gapRight) : 0;
      const next = { ...character };
      if (!l && !r) delete next.gaze;
      else if (typeof l === "string" && l === r && gl === 0 && gr === 0) {
        next.gaze = l;
      } else {
        const gap =
          gl === gr
            ? gl > 0
              ? gl
              : undefined
            : { ...(gl ? { left: gl } : {}), ...(gr ? { right: gr } : {}) };
        next.gaze = {
          ...(l ? { left: l } : {}),
          ...(r ? { right: r } : {}),
          ...(gap !== undefined ? { gap } : {}),
        };
      }
      update(next);
    },
    [character, update],
  );

  // "none" is deleted rather than stored, same identity rule as placement.
  const setHatHair = useCallback(
    (mode: AaHatHairMode) => {
      if (!character) return;
      const next = { ...character };
      if (mode === "none") delete next.hatHair;
      else next.hatHair = mode;
      update(next);
    },
    [character, update],
  );

  // Lighting (Phase 13) — the shading style and ground shadow persist on the
  // character; the light DIRECTION is the preview picker above the rig and is
  // deliberately not saved. Identity rule as everywhere: "none" is deleted.
  const setShading = useCallback(
    (style: AaShadeStyle) => {
      if (!character) return;
      const next = { ...character };
      if (style === "none") delete next.shading;
      else next.shading = style;
      update(next);
    },
    [character, update],
  );

  const setGroundShadow = useCallback(
    (kind: AaGroundShadow) => {
      if (!character) return;
      const next = { ...character };
      if (kind === "none") delete next.groundShadow;
      else next.groundShadow = kind;
      update(next);
    },
    [character, update],
  );

  // Which recolourable channels this character's picks actually expose. A slot
  // whose part declares none simply doesn't appear — the panel is a list of
  // what CAN be changed, not a grid of every slot with most cells empty.
  const colorRows = useMemo(() => {
    if (!character) return [] as { slot: AaSlot; part: string; channels: AaColorChannel[] }[];
    const rows: { slot: AaSlot; part: string; channels: AaColorChannel[] }[] = [];
    for (const slot of AA_SLOTS) {
      const name = character.picks[slot];
      if (!name) continue;
      const channels = channelsOf(findPart(model, slot, name));
      if (channels.length > 0) rows.push({ slot, part: name, channels });
    }
    return rows;
  }, [model, character]);

  const setColor = useCallback(
    (slot: AaSlot, id: string, hex: string) => {
      if (!character) return;
      const colors = { ...(character.colors ?? {}) };
      colors[slot] = { ...(colors[slot] ?? {}), [id]: normalizeHex(hex) };
      update({ ...character, colors });
    },
    [character, update],
  );

  // Deleting the entry rather than writing the authored colour back: "no pick"
  // has to stay distinguishable from "picked the same colour", or retagging the
  // part later would leave the character pinned to a stale shade.
  const clearColor = useCallback(
    (slot: AaSlot, id: string) => {
      if (!character) return;
      const bySlot = { ...(character.colors?.[slot] ?? {}) };
      delete bySlot[id];
      const colors = { ...(character.colors ?? {}) };
      if (Object.keys(bySlot).length > 0) colors[slot] = bySlot;
      else delete colors[slot];
      update({ ...character, colors });
    },
    [character, update],
  );

  // Appearance applies to whatever the character wears, channels or not — so
  // this list is every slot with a pick, unlike the colour rows.
  const wornSlots = useMemo(
    () => (character ? AA_SLOTS.filter((s) => character.picks[s]) : []),
    [character],
  );
  const [lookSlot, setLookSlot] = useState<AaSlot>("hair");
  const activeLookSlot = wornSlots.includes(lookSlot) ? lookSlot : wornSlots[0];

  const setAppearance = useCallback(
    (slot: AaSlot, field: keyof AaAppearance, value: number) => {
      if (!character) return;
      const appearance = { ...(character.appearance ?? {}) };
      const next = { ...(appearance[slot] ?? {}), [field]: value };
      // An identity look is deleted rather than stored, so "adjusted" stays a
      // meaningful mark and an untouched character carries no appearance block.
      if (isIdentityAppearance(next)) delete appearance[slot];
      else appearance[slot] = next;
      update({ ...character, appearance });
    },
    [character, update],
  );

  // Same identity rule as appearance: an all-defaults placement is deleted
  // rather than stored, so an untouched character carries no placement block.
  const setPlacement = useCallback(
    (slot: AaSlot, field: keyof AaPlacement, value: number | boolean) => {
      if (!character) return;
      if (typeof value === "number" && !Number.isFinite(value)) return;
      const placement = { ...(character.placement ?? {}) };
      const next = { ...(placement[slot] ?? {}), [field]: value };
      if (isIdentityPlacement(next)) delete placement[slot];
      else placement[slot] = next;
      update({ ...character, placement });
    },
    [character, update],
  );

  const resetPlacement = useCallback(
    (slot: AaSlot) => {
      if (!character) return;
      const placement = { ...(character.placement ?? {}) };
      delete placement[slot];
      update({ ...character, placement });
    },
    [character, update],
  );

  const resetAppearance = useCallback(
    (slot: AaSlot) => {
      if (!character) return;
      const appearance = { ...(character.appearance ?? {}) };
      delete appearance[slot];
      update({ ...character, appearance });
    },
    [character, update],
  );

  const stock = useMemo(
    () => (baseSkeleton ? stockProportions(baseSkeleton) : {}),
    [baseSkeleton],
  );
  const effective = useMemo(
    () => (character ? effectiveProportions(model, character) : model.skeleton),
    [model, character],
  );

  const setDelta = useCallback(
    (path: string, axis: "x" | "y", raw: string) => {
      if (!character) return;
      const px = Number(raw);
      if (!Number.isFinite(px)) return;
      const current = effective[path] ?? stock[path] ?? { x: 0, y: 0 };
      update({
        ...character,
        skeleton: { ...character.skeleton, [path]: { ...current, [axis]: pxToUnits(px) } },
      });
    },
    [character, effective, stock, update],
  );

  const clearDelta = useCallback(
    (path: string) => {
      if (!character) return;
      const skeleton = { ...character.skeleton };
      delete skeleton[path];
      update({ ...character, skeleton });
    },
    [character, update],
  );

  const dangling = useMemo(
    () => (character ? danglingPicks(model, character) : []),
    [model, character],
  );

  const previewSection = preview ? (
    <section className="mb-3 break-inside-avoid rounded border border-slate-300 bg-white p-3">
      <h2 className="mb-2 text-sm font-semibold">Preview</h2>
      {preview}
    </section>
  ) : null;

  return (
    // Multi-column so the panels fill the width beside the preview instead of
    // stacking into one long scroll — as many ~340px columns as fit.
    <div className="min-w-[360px] flex-1 columns-[340px] gap-3">
      <section className="mb-3 break-inside-avoid rounded border border-slate-300 bg-white p-3">
        <h2 className="mb-2 text-sm font-semibold">Characters</h2>
        <div className="mb-2 flex flex-wrap gap-1">
          <button
            onClick={() => onSelect(null)}
            className={`rounded px-2 py-1 text-xs ${
              selected === null
                ? "bg-slate-900 text-white"
                : "border border-slate-300 hover:bg-slate-50"
            }`}
          >
            model preview
          </button>
          {characters.map((c) => (
            <button
              key={c.name}
              onClick={() => onSelect(c.name)}
              className={`rounded px-2 py-1 text-xs ${
                selected === c.name
                  ? "bg-slate-900 text-white"
                  : "border border-slate-300 hover:bg-slate-50"
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleAdd}
            className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
          >
            + Add character
          </button>
          {character ? (
            <button
              onClick={handleRandomize}
              className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
              title="Reroll parts and colours (locked slots keep their selection)"
            >
              🎲 Randomize
            </button>
          ) : null}
          {character ? (
            <button
              onClick={handleZombify}
              className="rounded border border-emerald-700 px-2 py-1 text-xs text-emerald-800 hover:bg-emerald-50"
              title="Reroll as a zombie: zombie-tagged parts where they exist, zombie skin and grave-cloth colours (locked slots keep their selection)"
            >
              🧟 Zombie
            </button>
          ) : null}
          {character ? (
            <button
              onClick={handleRaiderize}
              className="rounded border border-amber-700 px-2 py-1 text-xs text-amber-800 hover:bg-amber-50"
              title="Reroll as a raider: raider-tagged parts where they exist, rust-and-leather colours, human skin (locked slots keep their selection)"
            >
              🪓 Raider
            </button>
          ) : null}
          {character ? (
            <button
              onClick={handleRobotize}
              className="rounded border border-sky-700 px-2 py-1 text-xs text-sky-800 hover:bg-sky-50"
              title="Reroll as a robot: robot chassis + LED faces, metal finishes on the skin channel, mostly bare of clothes (locked slots keep their selection)"
            >
              🤖 Robot
            </button>
          ) : null}
          {character ? (
            <button
              onClick={handleSkeletonize}
              className="rounded border border-stone-500 px-2 py-1 text-xs text-stone-700 hover:bg-stone-50"
              title="Reroll as a skeleton: bone chassis + sockets, ivory bone tones, mostly bare with the odd torn outfit (locked slots keep their selection)"
            >
              💀 Skeleton
            </button>
          ) : null}
          {character ? (
            <button
              onClick={handleCultify}
              className="rounded border border-violet-700 px-2 py-1 text-xs text-violet-800 hover:bg-violet-50"
              title="Reroll as a Cultist of the Ledger: robes + hood, vestment darks with gold sigils, pale skin, entranced eyes (locked slots keep their selection)"
            >
              🕯️ Cultist
            </button>
          ) : null}
          {character ? (
            <button
              onClick={handleDelete}
              className="rounded border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50"
            >
              Delete {character.name}
            </button>
          ) : null}
        </div>
        {character && libraryTags.length > 0 ? (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <span
              className="text-slate-600"
              title="Checked tags are EXCLUDED from Randomize — themed parts stay out of random characters unless you invite them back. Tag parts on the Slots tab."
            >
              🎲 excludes:
            </span>
            {libraryTags.map((tag) => (
              <label key={tag} className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={!includedTags.has(tag)}
                  onChange={() => toggleTagIncluded(tag)}
                />
                <span className={includedTags.has(tag) ? "text-slate-500" : "text-violet-800"}>
                  {tag}
                </span>
              </label>
            ))}
          </div>
        ) : null}
        {message ? (
          <p className="mt-2 rounded bg-amber-100 px-2 py-1 text-xs text-amber-900">{message}</p>
        ) : null}
        {!character ? (
          <p className="mt-2 text-xs text-slate-500">
            The model preview wears the first part in each slot. Add a character
            to choose parts and tune proportions.
          </p>
        ) : null}
      </section>

      {!character ? previewSection : null}

      {character ? (
        <>
          <section className="mb-3 break-inside-avoid rounded border border-slate-300 bg-white p-3">
            <h2 className="mb-2 text-sm font-semibold">Wearing</h2>
            <table className="w-full text-xs">
              <tbody>
                {AA_SLOTS.map((slot) => {
                  const options = partsInSlot(model, slot);
                  const locked = lockedSlots.has(slot);
                  return (
                    <tr key={slot}>
                      <td className="py-1 text-slate-600">{SLOT_LABEL[slot]}</td>
                      <td className="py-1">
                        {options.length === 0 ? (
                          <span className="text-slate-400">no parts drawn</span>
                        ) : (
                          <select
                            value={character.picks[slot] ?? ""}
                            onChange={(e) => setPick(slot, e.target.value)}
                            className="w-full rounded border border-slate-300 px-1 py-0.5"
                          >
                            <option value="">— none —</option>
                            {options.map((p) => (
                              <option key={p.name} value={p.name}>
                                {p.name}
                              </option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td className="py-1 pl-1">
                        <div className="flex gap-1">
                        {(slot === "weapon" || slot === "weapon2") && options.length > 0 ? (
                          <button
                            onClick={() => setPickerSlot(slot)}
                            className="flex h-5 w-5 items-center justify-center rounded border border-slate-300 bg-white text-[11px] hover:bg-slate-50"
                            title={`Browse ${SLOT_LABEL[slot]} items with thumbnails`}
                            aria-label={`Browse ${SLOT_LABEL[slot]} items`}
                          >
                            🔍
                          </button>
                        ) : null}
                        {options.length > 0 ? (
                          <button
                            onClick={() => toggleLock(slot)}
                            className={`flex h-5 w-5 items-center justify-center rounded border text-[11px] font-semibold ${
                              locked
                                ? "border-amber-400 bg-amber-100 text-amber-800"
                                : "border-slate-300 bg-white text-slate-400 hover:bg-slate-50"
                            }`}
                            title={
                              locked
                                ? `Unlock ${SLOT_LABEL[slot]} (Randomize may change it)`
                                : `Lock ${SLOT_LABEL[slot]} (Randomize keeps current selection)`
                            }
                            aria-label={
                              locked ? `Unlock ${SLOT_LABEL[slot]}` : `Lock ${SLOT_LABEL[slot]}`
                            }
                            aria-pressed={locked}
                          >
                            {locked ? "🔒" : "L"}
                          </button>
                        ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {pickerSlot ? (
              <ItemPickerModal
                model={model}
                slot={pickerSlot}
                current={character.picks[pickerSlot]}
                onPick={(name) => setPick(pickerSlot, name)}
                onClose={() => setPickerSlot(null)}
              />
            ) : null}
            {character.picks.helmet && character.picks.hair ? (
              <div className="mt-2 border-t border-slate-200 pt-2">
                <label className="flex items-center gap-2 text-xs">
                  <span className="shrink-0 text-slate-600">hat hair</span>
                  <select
                    value={character.hatHair ?? "none"}
                    onChange={(e) => setHatHair(e.target.value as AaHatHairMode)}
                    className="w-full rounded border border-slate-300 px-1 py-0.5"
                    title="What this character's hair does under the hat — baked into the hair pixels, saved on the character"
                  >
                    {AA_HAT_HAIR_MODES.map((m) => (
                      <option key={m} value={m}>
                        {HAT_HAIR_MODE_LABEL[m]}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="mt-1 text-xs text-slate-400">
                  Every mode stretches hair up to meet a raised hat. Tucked
                  cuts at the hat&apos;s underside; the spills re-grow a puff
                  beside the hat (tall/wild/sloped vary its height); squash
                  compresses instead of cutting.
                </p>
              </div>
            ) : null}
            {character.picks.eye ? (
              <div className="mt-2 border-t border-slate-200 pt-2">
                <label className="flex items-center gap-2 text-xs">
                  <span className="shrink-0 text-slate-600">eyes</span>
                  <select
                    value={character.eyeState ?? "open"}
                    onChange={(e) => setEyeState(e.target.value as AaRestingEyeState)}
                    className="w-full rounded border border-slate-300 px-1 py-0.5"
                    title="Resting eye state — a personality trait saved on the character, rendered as a band swap"
                  >
                    <option value="open">open</option>
                    <option value="half" disabled={!eyeHasHalf}>
                      half-closed (sleepy)
                      {eyeHasHalf ? "" : " — no half band drawn on this eye part"}
                    </option>
                  </select>
                </label>
                {!eyeHasHalf ? (
                  <p className="mt-1 text-xs text-slate-400">
                    Draw the middle band of the eye part on the Slots tab (and
                    save) to unlock the sleepy look.
                  </p>
                ) : null}
                {eyeHasMarks ? (
                  <div className="mt-2">
                    <span className="text-xs text-slate-600">
                      eye nudge <span className="text-slate-400">(px; + is right / up)</span>
                    </span>
                    {(["left", "right"] as const).map((side) => (
                      <label key={side} className="mt-1 flex items-center gap-1 text-xs">
                        <span className="w-8 capitalize text-slate-600">{side}</span>
                        {(["dx", "dy"] as const).map((axis) => (
                          <input
                            key={axis}
                            type="number"
                            min={-32}
                            max={32}
                            step={1}
                            value={character.eyeNudge?.[side]?.[axis] ?? 0}
                            onChange={(e) => setEyeNudge(side, axis, Number(e.target.value))}
                            className="w-14 rounded border border-slate-300 px-1 py-0.5"
                            title={`${side} eye ${axis === "dx" ? "horizontal" : "vertical"} nudge`}
                          />
                        ))}
                        {character.eyeNudge?.[side] ? (
                          <button
                            onClick={() => resetEyeNudge(side)}
                            className="rounded border border-slate-300 px-1 text-xs hover:bg-slate-50"
                            title="Reset this eye"
                          >
                            ⟲
                          </button>
                        ) : null}
                      </label>
                    ))}
                  </div>
                ) : (
                  <p className="mt-1 text-xs text-slate-400">
                    Mark the eyes on the Slots tab (Eyes &amp; pupils) to
                    unlock per-eye nudging and resting gaze.
                  </p>
                )}
                <div className="mt-2">
                  <span className="text-xs text-slate-600">
                    resting gaze{" "}
                    <span className="text-slate-400">
                      (default pupils; clips &amp; scenes override)
                    </span>
                  </span>
                  <select
                    value={(() => {
                      const { left, right } = gazePair;
                      if (!left && !right) return "";
                      if (typeof left === "object" || typeof right === "object") {
                        return "manual";
                      }
                      return gazePairKey(left, right);
                    })()}
                    onChange={(e) => {
                      if (e.target.value === "") {
                        setGazePair(undefined, undefined, 0, 0);
                      } else {
                        const [l, r] = e.target.value.split("|");
                        setGazePair(
                          l === "-" ? undefined : (l as AaGazeDirection),
                          r === "-" ? undefined : (r as AaGazeDirection),
                          gazePair.gapLeft,
                          gazePair.gapRight,
                        );
                      }
                    }}
                    disabled={!eyeHasMarks}
                    className="mt-1 w-full rounded border border-slate-300 px-1 py-0.5 disabled:bg-slate-100 disabled:text-slate-400"
                    title={
                      eyeHasMarks
                        ? "Preset gazes — or dial each eye separately below. Every direction goes as far as the whites allow."
                        : "Needs eye marks: open this eye part on the Slots tab and mark Eyes & pupils, then save."
                    }
                  >
                    <option value="">
                      {eyeHasMarks
                        ? "as drawn (centered)"
                        : "no eye marks on this eye part"}
                    </option>
                    <optgroup label="both eyes">
                      {AA_GAZE_DIRECTIONS.map((d) => (
                        <option key={d} value={gazePairKey(d, d)}>
                          look {d}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="crazy eyes">
                      {GAZE_PRESETS.map((p) => (
                        <option key={p.label} value={gazePairKey(p.left, p.right)}>
                          {p.label}
                        </option>
                      ))}
                    </optgroup>
                    {(() => {
                      // A pair no listed option covers still needs a home so
                      // the select can display it: "custom", non-pickable.
                      const { left, right } = gazePair;
                      if (!left && !right) return null;
                      if (typeof left === "object" || typeof right === "object") {
                        return (
                          <option value="manual" disabled>
                            manual offset (set below)
                          </option>
                        );
                      }
                      if (left && left === right) return null;
                      const key = gazePairKey(left, right);
                      if (GAZE_PRESETS.some((p) => gazePairKey(p.left, p.right) === key)) {
                        return null;
                      }
                      return (
                        <option value={key} disabled>
                          custom (set below)
                        </option>
                      );
                    })()}
                  </select>
                  {(["left", "right"] as const).map((side) => {
                    const sideVal = gazePair[side];
                    const offset = typeof sideVal === "object" ? sideVal : undefined;
                    const setSide = (v: AaGazeSide | undefined) =>
                      setGazePair(
                        side === "left" ? v : gazePair.left,
                        side === "right" ? v : gazePair.right,
                        gazePair.gapLeft,
                        gazePair.gapRight,
                      );
                    return (
                      <div key={side} className="mt-1">
                        <label className="flex items-center gap-2 text-xs">
                          <span className="w-16 shrink-0 capitalize text-slate-600">
                            {side} eye
                          </span>
                          <select
                            value={typeof sideVal === "object" ? "manual" : sideVal ?? ""}
                            onChange={(e) =>
                              setSide(
                                e.target.value
                                  ? (e.target.value as AaGazeDirection)
                                  : undefined,
                              )
                            }
                            disabled={!eyeHasMarks}
                            className="w-full rounded border border-slate-300 px-1 py-0.5 disabled:bg-slate-100 disabled:text-slate-400"
                            title={`Where the ${side} (viewer's ${side}) pupil rests`}
                          >
                            <option value="">centered (as drawn)</option>
                            {AA_GAZE_DIRECTIONS.map((d) => (
                              <option key={d} value={d}>
                                {d}
                              </option>
                            ))}
                            {offset ? (
                              <option value="manual" disabled>
                                manual (x/y below)
                              </option>
                            ) : null}
                          </select>
                          <span
                            className="flex shrink-0 items-center gap-1 text-slate-600"
                            title="Back this pupil off one pixel from the furthest edge, so a sliver of whites stays between it and the eye's outline. Direction mode only — a manual offset owns its exact spot."
                          >
                            <input
                              type="checkbox"
                              checked={
                                (side === "left" ? gazePair.gapLeft : gazePair.gapRight) > 0
                              }
                              onChange={(e) => {
                                const g = e.target.checked ? 1 : 0;
                                setGazePair(
                                  gazePair.left,
                                  gazePair.right,
                                  side === "left" ? g : gazePair.gapLeft,
                                  side === "right" ? g : gazePair.gapRight,
                                );
                              }}
                              disabled={!eyeHasMarks || typeof sideVal !== "string"}
                            />
                            1px gap
                          </span>
                        </label>
                        <label className="mt-0.5 flex items-center gap-1 text-xs">
                          <span
                            className="w-16 shrink-0 text-slate-400"
                            title="Exact pupil offset in pixels (+ is right / up) — overrides the direction; still clamped to the whites"
                          >
                            pupil x/y
                          </span>
                          {(["dx", "dy"] as const).map((axis) => (
                            <input
                              key={axis}
                              type="number"
                              min={-32}
                              max={32}
                              step={1}
                              value={offset?.[axis] ?? 0}
                              onChange={(e) => {
                                const n = Number(e.target.value);
                                if (!Number.isFinite(n)) return;
                                setSide({ ...(offset ?? {}), [axis]: n });
                              }}
                              disabled={!eyeHasMarks}
                              className="w-14 rounded border border-slate-300 px-1 py-0.5 disabled:bg-slate-100 disabled:text-slate-400"
                              title={`${side} pupil ${axis === "dx" ? "horizontal" : "vertical"} offset (+ is ${axis === "dx" ? "right" : "up"})`}
                            />
                          ))}
                          {offset ? (
                            <button
                              onClick={() => setSide(undefined)}
                              className="rounded border border-slate-300 px-1 text-xs hover:bg-slate-50"
                              title="Clear the manual offset (back to centered)"
                            >
                              ⟲
                            </button>
                          ) : null}
                        </label>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
            {dangling.length > 0 ? (
              <p className="mt-2 rounded bg-red-50 p-2 text-xs text-red-800">
                Picks with no matching part:{" "}
                {dangling.map((d) => `${SLOT_LABEL[d.slot]}/${d.name}`).join(", ")}
              </p>
            ) : null}
          </section>

          <section className="mb-3 break-inside-avoid rounded border border-slate-300 bg-white p-3">
            <h2 className="mb-2 text-sm font-semibold">Lighting</h2>
            <label className="flex items-center gap-2 text-xs">
              <span className="w-24 shrink-0 text-slate-600">shading</span>
              <select
                value={character.shading ?? "none"}
                onChange={(e) => setShading(e.target.value as AaShadeStyle)}
                className="w-full rounded border border-slate-300 px-1 py-0.5"
                title="Auto-generated rim shading, baked into every worn slot except the eyes. Draw parts flat — volume is the engine's job."
              >
                {AA_SHADE_STYLES.map((s) => (
                  <option key={s} value={s}>
                    {SHADE_STYLE_LABEL[s]}
                  </option>
                ))}
              </select>
            </label>
            <label className="mt-2 flex items-center gap-2 text-xs">
              <span className="w-24 shrink-0 text-slate-600">ground shadow</span>
              <select
                value={character.groundShadow ?? "none"}
                onChange={(e) => setGroundShadow(e.target.value as AaGroundShadow)}
                className="w-full rounded border border-slate-300 px-1 py-0.5"
                title="Shadow cast at the feet — composited under the rig, never baked into pixels"
              >
                {AA_GROUND_SHADOWS.map((g) => (
                  <option key={g} value={g}>
                    {g === "silhouette" ? "silhouette (follows the pose)" : g}
                  </option>
                ))}
              </select>
            </label>
            <p className="mt-2 text-xs text-slate-400">
              Shades step down the part&apos;s own colour ramps, so they follow a
              recolour; outlines are protected. The light DIRECTION is the 💡
              picker above the rig — it isn&apos;t saved on the character, because
              scenes will supply it.
            </p>
          </section>

          <section className="mb-3 break-inside-avoid rounded border border-slate-300 bg-white p-3">
            <h2 className="mb-1 text-sm font-semibold">Outfits</h2>
            <p className="mb-2 text-xs text-slate-500">
              A saved look — parts, colours, appearance, placement — any
              character can wear. Proportions stay the character&apos;s own.
            </p>
            {(project.outfits ?? []).length > 0 ? (
              <div className="mb-2 space-y-1">
                {(project.outfits ?? []).map((o) => {
                  const worn = wearsOutfit(character, o);
                  return (
                    <div key={o.name} className="flex items-center gap-2">
                      <button
                        onClick={() => handleWearOutfit(o)}
                        className={`rounded px-2 py-1 text-xs ${
                          worn
                            ? "bg-slate-900 text-white"
                            : "border border-slate-300 hover:bg-slate-50"
                        }`}
                        title={`Dress ${character.name} in "${o.name}"`}
                      >
                        {o.name}
                      </button>
                      {worn ? (
                        <span className="text-xs text-sky-600">wearing</span>
                      ) : null}
                      <button
                        onClick={() => handleDeleteOutfit(o.name)}
                        className="ml-auto text-xs text-slate-400 hover:text-red-600"
                        title={`Delete outfit "${o.name}" (characters keep what they're wearing)`}
                      >
                        ×
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="mb-2 text-xs text-slate-400">No outfits saved yet.</p>
            )}
            <button
              onClick={handleSaveOutfit}
              className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
            >
              Save current look as outfit…
            </button>
          </section>

          {previewSection}

          <section className="mb-3 break-inside-avoid rounded border border-slate-300 bg-white p-3">
            <h2 className="mb-1 text-sm font-semibold">Placement</h2>
            {wornSlots.length === 0 ? (
              <p className="text-xs text-slate-500">
                Nothing picked yet — choose parts above.
              </p>
            ) : (
              <>
                <p className="mb-2 text-xs text-slate-500">
                  Per worn part: nudge in source px (+x right, +y up), rotate
                  about its anchor (+ clockwise), or mirror it. Saved on the
                  character; the part&apos;s pixels are untouched.
                </p>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-slate-400">
                      <th className="py-0.5 text-left font-normal" />
                      <th className="py-0.5 text-left font-normal">x</th>
                      <th className="py-0.5 text-left font-normal">y</th>
                      <th className="py-0.5 text-left font-normal">rot°</th>
                      <th className="py-0.5 text-left font-normal">flip</th>
                      <th className="py-0.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {wornSlots.map((slot) => {
                      const p = character.placement?.[slot];
                      const own = !isIdentityPlacement(p);
                      return (
                        <tr key={slot}>
                          <td className="py-0.5 text-slate-600">
                            {SLOT_LABEL[slot]}
                            {own ? <span className="ml-1 text-sky-600">•</span> : null}
                          </td>
                          {(["dx", "dy"] as const).map((axis) => (
                            <td key={axis} className="py-0.5 pr-1">
                              <input
                                type="number"
                                step={0.5}
                                value={p?.[axis] ?? 0}
                                onChange={(e) =>
                                  setPlacement(slot, axis, Number(e.target.value))
                                }
                                className="w-14 rounded border border-slate-300 px-1 py-0.5"
                              />
                            </td>
                          ))}
                          <td className="py-0.5 pr-1">
                            <input
                              type="number"
                              step={1}
                              min={-180}
                              max={180}
                              value={p?.rot ?? 0}
                              onChange={(e) =>
                                setPlacement(slot, "rot", Number(e.target.value))
                              }
                              className="w-14 rounded border border-slate-300 px-1 py-0.5"
                            />
                          </td>
                          <td className="py-0.5">
                            <input
                              type="checkbox"
                              checked={p?.flipX ?? false}
                              onChange={(e) =>
                                setPlacement(slot, "flipX", e.target.checked)
                              }
                              title={`Mirror ${SLOT_LABEL[slot]} horizontally`}
                            />
                          </td>
                          <td className="py-0.5 text-right">
                            {own ? (
                              <button
                                onClick={() => resetPlacement(slot)}
                                className="text-slate-400 hover:text-slate-700"
                                title="Back to where the part was drawn"
                              >
                                reset
                              </button>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </>
            )}
          </section>

          <section className="mb-3 break-inside-avoid rounded border border-slate-300 bg-white p-3">
            <h2 className="mb-1 text-sm font-semibold">Colours</h2>
            {colorRows.length === 0 ? (
              <p className="text-xs text-slate-500">
                Nothing this character wears has recolourable channels. Tag some
                on the Slots tab (Colour channels) and they appear here.
              </p>
            ) : (
              <>
                <p className="mb-2 text-xs text-slate-500">
                  Only the tagged shades change; outlines and everything untagged
                  stay as drawn. A channel left alone keeps the authored colour.
                </p>
                {colorRows.map((row) => (
                  <div key={row.slot} className="mb-2">
                    <p className="text-xs text-slate-600">
                      {SLOT_LABEL[row.slot]}{" "}
                      <span className="text-slate-400">/ {row.part}</span>
                    </p>
                    {row.channels.map((channel) => {
                      const picked = character.colors?.[row.slot]?.[channel.id];
                      const value = picked ?? normalizeHex(channel.base);
                      return (
                        <div key={channel.id} className="mt-1 flex items-center gap-1">
                          <input
                            type="color"
                            value={value}
                            onChange={(e) => setColor(row.slot, channel.id, e.target.value)}
                            className="h-6 w-9 rounded border border-slate-300"
                          />
                          <span className="text-xs text-slate-600">
                            {channel.label ?? channel.id}
                            {picked ? <span className="ml-1 text-sky-600">•</span> : null}
                          </span>
                          <span className="ml-1 flex gap-0.5">
                            {channelRamp(channel, value).map((hex, i) => (
                              <span
                                key={`${hex}-${i}`}
                                style={{ background: hex }}
                                className="h-4 w-4 rounded-sm border border-slate-300"
                                title={hex}
                              />
                            ))}
                          </span>
                          {picked ? (
                            <button
                              onClick={() => clearColor(row.slot, channel.id)}
                              className="ml-auto text-xs text-slate-400 hover:text-slate-700"
                              title="Back to the colour the part was drawn in"
                            >
                              reset
                            </button>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </>
            )}
          </section>

          <section className="mb-3 break-inside-avoid rounded border border-slate-300 bg-white p-3">
            <h2 className="mb-1 text-sm font-semibold">Appearance</h2>
            {!activeLookSlot ? (
              <p className="text-xs text-slate-500">
                Nothing picked yet — choose parts above.
              </p>
            ) : (
              <>
                <p className="mb-2 text-xs text-slate-500">
                  Per part, and skipping each part&apos;s protected outline.
                  Applied to the pixels rather than as a CSS filter, which is the
                  only way to spare the outline.
                </p>
                <div className="mb-2 flex flex-wrap gap-1">
                  {wornSlots.map((s) => {
                    const adjusted = !isIdentityAppearance(character.appearance?.[s]);
                    return (
                      <button
                        key={s}
                        onClick={() => setLookSlot(s)}
                        className={`rounded px-2 py-1 text-xs ${
                          activeLookSlot === s
                            ? "bg-slate-900 text-white"
                            : "border border-slate-300 hover:bg-slate-50"
                        }`}
                      >
                        {SLOT_LABEL[s]}
                        {adjusted ? <span className="ml-1 text-sky-400">•</span> : null}
                      </button>
                    );
                  })}
                </div>
                {APPEARANCE_FIELDS.map((f) => {
                  const look = character.appearance?.[activeLookSlot] ?? {};
                  const value = look[f.key] ?? f.identity;
                  return (
                    <label
                      key={f.key}
                      className="mb-1 flex items-center gap-2 text-xs text-slate-600"
                    >
                      <span className="w-16 shrink-0 capitalize">{f.key}</span>
                      <input
                        type="range"
                        min={f.min}
                        max={f.max}
                        step={f.step}
                        value={value}
                        onChange={(e) =>
                          setAppearance(activeLookSlot, f.key, Number(e.target.value))
                        }
                        className="flex-1"
                      />
                      <code className="w-10 shrink-0 text-right tabular-nums">
                        {f.key === "hue" ? `${Math.round(value)}°` : value.toFixed(2)}
                      </code>
                    </label>
                  );
                })}
                <button
                  onClick={() => resetAppearance(activeLookSlot)}
                  disabled={isIdentityAppearance(character.appearance?.[activeLookSlot])}
                  className="mt-1 rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50 disabled:opacity-40"
                >
                  Reset {activeLookSlot}
                </button>
              </>
            )}
          </section>

          <section className="mb-3 break-inside-avoid rounded border border-slate-300 bg-white p-3">
            <h2 className="mb-1 text-sm font-semibold">Proportions</h2>
            <p className="mb-2 text-xs text-slate-500">
              Deltas over the model&apos;s base build, in source px. Values with{" "}
              <span className="text-sky-600">•</span> are this character&apos;s;
              the rest are inherited, so tuning the base build on the Body tab
              moves them.
            </p>
            <table className="w-full text-xs">
              <tbody>
                {PROPORTION_BONES.map((b) => {
                  const value = effective[b.path] ?? stock[b.path];
                  const own = character.skeleton[b.path] !== undefined;
                  return (
                    <tr key={b.path} title={b.hint}>
                      <td className="py-0.5 text-slate-600">
                        {b.label}
                        {own ? <span className="ml-1 text-sky-600">•</span> : null}
                      </td>
                      {(["x", "y"] as const).map((axis) => (
                        <td key={axis} className="py-0.5">
                          {b.axes.includes(axis) && value ? (
                            <input
                              type="number"
                              step={0.5}
                              value={Number(unitsToPx(value[axis]).toFixed(3))}
                              onChange={(e) => setDelta(b.path, axis, e.target.value)}
                              className="w-16 rounded border border-slate-300 px-1 py-0.5"
                            />
                          ) : null}
                        </td>
                      ))}
                      <td className="py-0.5 text-right">
                        {own ? (
                          <button
                            onClick={() => clearDelta(b.path)}
                            className="text-slate-400 hover:text-slate-700"
                            title="Back to the model's base build"
                          >
                            reset
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <button
              onClick={() => update({ ...character, skeleton: {} })}
              className="mt-2 rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
            >
              Reset all to base build
            </button>
          </section>
        </>
      ) : null}
    </div>
  );
}
