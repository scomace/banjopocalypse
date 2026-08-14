"use client";

// AA character editor — /admin/aachar. See docs/aachar-plan.md.
//
// Phase 2 scope: the shell. Project document lifecycle (new / import / export /
// save), a live rig preview driven by the AA seams on SpumCharacter
// (`atlasOverrides` + `skeletonOverride`), and a placeholder mannequin so the
// rig shows something before any pixels exist. The Body, Slots and Characters
// tabs are Phases 3–5.
//
// A project is ONE model (canonical geometry + the parts library) and MANY
// characters (part picks + bone proportions). The Model tab authors the former;
// the Characters tab assembles the latter.
//
// ISOLATION RULE: nothing here imports from `src/screens/admin-spum/`. The
// only SPUM dependencies are the renderer, the skeleton JSON, and the clip
// JSONs — all read-only.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  createBlankCharacter,
  createBlankProject,
  danglingPicks,
  effectiveProportions,
  effectiveZOrder,
  findPart,
  isPartStale,
  partsInSlot,
  upsertCharacter,
  validateProject,
} from "@/lib/aachar/character";
import { clipSource, compiledAaClip, resolveAaClip } from "@/lib/aachar/clipLibrary";
import { BANNED_CLIPS } from "@/lib/aachar/clips";
import { downloadBundle, exportProject, importProject } from "@/lib/aachar/export";
import { HAT_HAIR_MODE_LABEL, HELMET_REGION } from "@/lib/aachar/hatHair";
import { measureBottomProfile } from "@/lib/aachar/imageIo";
import { buildPlaceholderBody } from "@/lib/aachar/placeholder";
import { characterExtentPx, fitSize } from "@/lib/aachar/preview";
import { mergeProjects, type ProjectMergeResult } from "@/lib/aachar/projectMerge";
import { LIGHT_DIRECTION_LABEL, SHADE_STYLE_LABEL } from "@/lib/aachar/shade";
import {
  AA_RENDER_CONFIG,
  FORCE_EYE_BANDS,
  applyEyeState,
  effectiveEyeState,
  toAtlasOverrides,
  toSlotAdjustments,
} from "@/lib/aachar/render";
import { PROPORTION_BONES, composeSkeleton, unitsToPx } from "@/lib/aachar/skeleton";
import {
  AA_LIGHT_DIRECTIONS,
  AA_SLOTS,
  SLOT_LABEL,
  type AaCharacter,
  type AaEyeState,
  type AaGazeDirection,
  type AaLightDirection,
  type AaModel,
  type AaProject,
  type AaSlot,
} from "@/lib/aachar/types";
import { SPUM_ANIMATIONS, type SpumAnimation } from "@/lib/spum/catalog";
import { BASE_SPRITE_SCALE, SpumCharacter } from "@/lib/spum/SpumCharacter";
import type { Skeleton, SpriteAtlas } from "@/lib/spum/types";

import { AnimationTab } from "./AnimationTab";
import { BodyEditor } from "./BodyEditor";
import { CharactersTab } from "./CharactersTab";
import { HorseTab } from "./HorseTab";
import { SlotEditor } from "./SlotEditor";
import { useEyeAdjustedOverrides } from "./useEyeAdjustedOverrides";
import { useHatHairedOverrides } from "./useHatHairedOverrides";
import { useRecoloredOverrides } from "./useRecoloredOverrides";
import { useShadedOverrides } from "./useShadedOverrides";

const LS_KEY = "aachar-project-v2";
// The draft that was about to be replaced by a SMALLER one. See the autosave
// effect — this exists because losing a session's work to one bad boot is not
// something a warning can undo.
const LS_BACKUP_KEY = "aachar-project-v2-prev";
// The manifest text (and its sha-256) this browser last SYNCED with the disk
// — the 3-way merge base. Written after every successful save-project and
// after every mount-time reconcile; the hash rides along on save-project so
// the endpoint can 409 a stale overwrite (the manifest-clobber fix).
const LS_SYNC_KEY = "aachar-manifest-sync-v1";
const MANIFEST_URL = "/aachar/manifest.json";
const PROJECT_FILENAME = "aachar";

// EXACTLY the text saveProject writes to disk — hashes only line up if the
// two stay byte-identical.
const projectText = (p: AaProject) => JSON.stringify(p, null, 2) + "\n";

async function sha256Hex(text: string): Promise<string> {
  const digest = await window.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

type ManifestSync = { hash: string; text?: string };

function readSync(): ManifestSync | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LS_SYNC_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ManifestSync;
    return typeof parsed?.hash === "string" ? parsed : null;
  } catch {
    return null;
  }
}

function writeSync(hash: string, text: string): void {
  try {
    window.localStorage.setItem(LS_SYNC_KEY, JSON.stringify({ hash, text }));
  } catch {
    // Quota — keep the hash alone so the stale-save guard still works; the
    // next merge just runs base-less (disk wins conflicts).
    try {
      window.localStorage.setItem(LS_SYNC_KEY, JSON.stringify({ hash }));
    } catch {
      /* the guard degrades to the legacy behaviour */
    }
  }
}

function syncBaseProject(sync: ManifestSync | null): AaProject | null {
  if (!sync?.text) return null;
  try {
    const result = validateProject(JSON.parse(sync.text));
    return result.ok ? result.value : null;
  } catch {
    return null;
  }
}

function describeMerge({ conflicts, fromDisk }: ProjectMergeResult): string | null {
  if (conflicts.length === 0 && fromDisk.length === 0) return null;
  const bits: string[] = [];
  if (fromDisk.length > 0) {
    bits.push(`merged from disk: ${fromDisk.slice(0, 4).join(", ")}${fromDisk.length > 4 ? ` +${fromDisk.length - 4} more` : ""}`);
  }
  if (conflicts.length > 0) {
    bits.push(`edited in BOTH places (check these): ${conflicts.join(", ")}`);
  }
  return bits.join(" — ");
}

type Tab = "model" | "body" | "slots" | "characters" | "animation" | "horse";

function readProject(key: string): AaProject | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const result = validateProject(JSON.parse(raw));
    return result.ok ? result.value : null;
  } catch {
    return null;
  }
}

const loadDraft = () => readProject(LS_KEY);

export function AaCharAdmin() {
  const [tab, setTab] = useState<Tab>("model");
  // Read the draft exactly once, and remember WHETHER there was one. Booting
  // blank is not the same as booting from an empty project, and the difference
  // decides both whether to adopt the manifest and whether autosave is allowed
  // to overwrite.
  const [boot] = useState(() => {
    const draft = loadDraft();
    return { project: draft ?? createBlankProject(), fromDraft: draft !== null };
  });
  const [project, setProject] = useState<AaProject>(boot.project);
  const [backup, setBackup] = useState<AaProject | null>(() =>
    readProject(LS_BACKUP_KEY),
  );
  const [autosave, setAutosave] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const [selectedCharacter, setSelectedCharacter] = useState<string | null>(null);
  const [baseSkeleton, setBaseSkeleton] = useState<Skeleton | null>(null);
  const [animation, setAnimation] = useState<SpumAnimation>("idle");
  // A zoom AROUND the fitted size, not an absolute multiplier. `size` on
  // SpumCharacter is 6.875 CSS px per source pixel times this number, so a
  // fixed default is only ever right for one geometry — see lib/aachar/preview.
  const [zoom, setZoom] = useState(1);
  const [message, setMessage] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // In-progress art from an editor tab, shown on the rig before it's saved.
  const [livePreview, setLivePreview] = useState<Partial<Record<AaSlot, SpriteAtlas>>>({});
  // Slots-tab-only eye state preview (Phase 11): lets the artist see the half
  // or blink band on the rig BEFORE saving, so it bypasses the has-art gate.
  // Applied only while the Slots tab is up — it's an authoring lens, not
  // character data.
  const [eyePreview, setEyePreview] = useState<AaEyeState | null>(null);
  // Slots-tab-only gaze preview (Phase 12) — same authoring-lens contract as
  // `eyePreview`, for the direction pad next to the Eyes tool.
  const [gazePreview, setGazePreview] = useState<AaGazeDirection | null>(null);
  // Preview light direction (Phase 13). A LENS, not character data: the
  // character stores its shading STYLE; where the light sits belongs to
  // whatever composes the character — this picker now, a scene's `light`
  // field later. Default matches every baked asset's implied top-left.
  const [lightDir, setLightDir] = useState<AaLightDirection>("left");
  // View-only toggles on the preview — unchecking "hat" while drawing hair
  // takes the hat off the rig without touching the character's picks. Not
  // persisted; a reload shows everything again.
  const [hiddenSlots, setHiddenSlots] = useState<Set<AaSlot>>(new Set());

  const flash = useCallback((text: string) => {
    setMessage(text);
    window.setTimeout(() => setMessage(null), 3500);
  }, []);

  // Draft autosave. The whole point of the AA save path is that nothing is
  // hostage to the dev server (docs/aachar-plan.md D5/D6) — localStorage keeps
  // in-progress work across reloads, the manifest is the durable copy, and the
  // bundle export is the portable one.
  //
  // ⚠️ THIS EFFECT USED TO DESTROY A SESSION'S WORK. It ran unconditionally on
  // the first render, so ANY reason `loadDraft()` came back null — a corrupt
  // entry, a validation failure, a cleared origin, a browser wiping storage —
  // meant the blank starting project was written straight over the real draft
  // before the user could see anything was wrong. Now a write that would SHRINK
  // the stored project stashes the old one under `LS_BACKUP_KEY` first, and the
  // Project panel offers to put it back.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(LS_KEY);
      if (raw) {
        let prevParts = 0;
        try {
          prevParts =
            (JSON.parse(raw) as AaProject | null)?.model?.parts?.length ?? 0;
        } catch {
          prevParts = 0;
        }
        if (prevParts > project.model.parts.length) {
          window.localStorage.setItem(LS_BACKUP_KEY, raw);
          setBackup(readProject(LS_BACKUP_KEY));
        }
      }
      window.localStorage.setItem(LS_KEY, JSON.stringify(project));
    } catch {
      /* quota — the export button is the fallback */
    }
  }, [project]);

  // MOUNT-TIME DISK RECONCILE (the manifest-clobber fix, reader half).
  //
  // This replaced the old "adopt the manifest only when the draft has no
  // parts" recovery: the draft lives in localStorage and used to be the ONLY
  // source the editor ever rendered, so any manifest edit made outside the
  // editor (registration scripts, hand edits, agents authoring `eyes` marks)
  // was invisible here and erased by the next autosave. Now every mount
  // fetches the disk manifest and, when its hash differs from what this
  // browser last synced (LS_SYNC_KEY), 3-way-merges it into the draft —
  // entity-level, draft wins where both sides changed the same thing (a
  // flash message names those). The old no-parts recovery is a degenerate
  // case of the merge (everything is "new on disk") and still works.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(MANIFEST_URL, { cache: "no-store" });
        if (!res.ok) return; // no manifest yet — a new project is correct
        const diskText = await res.text();
        const diskHash = await sha256Hex(diskText);
        const sync = readSync();
        if (sync?.hash === diskHash) return; // already in sync
        const result = validateProject(JSON.parse(diskText));
        if (!result.ok || cancelled) return;
        const base = syncBaseProject(sync);
        let report: ProjectMergeResult | null = null;
        setProject((current) => {
          const r = mergeProjects(base, current, result.value);
          report = r;
          return r.merged;
        });
        writeSync(diskHash, diskText);
        // setProject's updater runs synchronously for an active mount, so the
        // report is populated here; guard anyway.
        const summary = report ? describeMerge(report) : null;
        if (summary) flash(summary);
      } catch {
        /* unreadable manifest — the draft stands, autosave stays guarded */
      }
    })();
    return () => {
      cancelled = true;
    };
    // Mount-only: the reconcile compares against LS_SYNC_KEY, not props/state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The base skeleton is SPUM's, read-only. Proportion overrides compose on top
  // of it client-side rather than shipping a second skeleton file (D2/D3).
  useEffect(() => {
    let cancelled = false;
    fetch("/spum/skeleton.json")
      .then((r) => r.json() as Promise<Skeleton>)
      .then((s) => {
        if (!cancelled) setBaseSkeleton(s);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const { model, characters } = project;

  // What the preview renders: the selected character, or — when none is
  // selected — an implicit "one of each" character built from the first part in
  // every slot, so the Model tab shows the art without needing a character.
  const previewCharacter: AaCharacter = useMemo(() => {
    const selected = characters.find((c) => c.name === selectedCharacter);
    if (selected) return selected;
    const picks: Partial<Record<AaSlot, string>> = {};
    for (const slot of AA_SLOTS) {
      const first = partsInSlot(model, slot)[0];
      if (first) picks[slot] = first.name;
    }
    return { name: "(model preview)", picks, skeleton: {} };
  }, [characters, selectedCharacter, model]);

  // Base build + this character's deltas, then applied to SPUM's skeleton.
  const proportions = useMemo(
    () => effectiveProportions(model, previewCharacter),
    [model, previewCharacter],
  );

  const composed = useMemo(
    () =>
      baseSkeleton
        ? composeSkeleton(baseSkeleton, proportions, effectiveZOrder(model))
        : null,
    [baseSkeleton, proportions, model],
  );

  // Placeholder mannequin, regenerated whenever geometry changes. Only used
  // while the body slot has no authored art — an empty rig would be
  // indistinguishable from broken plumbing.
  const hasBodyArt = partsInSlot(model, "body").length > 0;
  const placeholderBody = useMemo(() => {
    if (hasBodyArt) return null;
    try {
      return buildPlaceholderBody(model.geometry);
    } catch {
      return null;
    }
  }, [model.geometry, hasBodyArt]);

  // Precedence: unsaved editor art > the character's saved picks > placeholder.
  // The live layer only applies on the tab that owns it — the editor stays
  // mounted while hidden, so without this its working canvas would shadow
  // whatever part a character actually picks on the other tabs.
  const rawOverrides = useMemo(() => {
    const overrides = toAtlasOverrides(model, previewCharacter);
    if (!overrides.body && placeholderBody) overrides.body = placeholderBody.atlas;
    // Hidden slots drop out BEFORE the live layer merges, so unchecking a slot
    // never hides the art you're actively drawing — only the saved pick. It
    // also means a hidden helmet stops masking hair, because the mask reads
    // rawOverrides.helmet downstream of this.
    hiddenSlots.forEach((slot) => delete overrides[slot]);
    const editing = tab === "body" || tab === "slots";
    return editing ? { ...overrides, ...livePreview } : overrides;
  }, [model, previewCharacter, placeholderBody, livePreview, tab, hiddenSlots]);

  // Per-character colour picks, applied by remapping the tagged palette entries
  // in each part's own PNG (lib/aachar/recolor.ts). It reaches the renderer as
  // an atlas whose `image` is a recoloured data URL, so nothing downstream —
  // pivots, the gutter, the hair mask — knows it happened.
  const atlasOverrides = useRecoloredOverrides(model, previewCharacter, rawOverrides);

  // Per-slot nudge/rotate/flip the character applies to what it wears —
  // rendered through the renderer's `slotAdjustments` seam, exactly like
  // colours ride in through `atlasOverrides`.
  const slotAdjustments = useMemo(
    () => toSlotAdjustments(previewCharacter),
    [previewCharacter],
  );

  const setSlotPreview = useCallback((slot: AaSlot, atlas: SpriteAtlas | null) => {
    setLivePreview((prev) => {
      if (!atlas) {
        if (!(slot in prev)) return prev;
        const next = { ...prev };
        delete next[slot];
        return next;
      }
      return { ...prev, [slot]: atlas };
    });
  }, []);

  const toggleSlotVisible = useCallback((slot: AaSlot) => {
    setHiddenSlots((prev) => {
      const next = new Set(prev);
      if (next.has(slot)) next.delete(slot);
      else next.add(slot);
      return next;
    });
  }, []);

  // Stable identity — the editor uses this as an effect dependency, so an
  // inline arrow here would re-run its publish/hydrate effects every render.
  const setBodyPreview = useCallback(
    (atlas: SpriteAtlas | null) => setSlotPreview("body", atlas),
    [setSlotPreview],
  );

  const handleModelChange = useCallback((next: AaModel) => {
    setProject((prev) => ({ ...prev, model: next }));
  }, []);

  // Phase 6 — the preview plays the AA clip when one exists for this animation,
  // and falls through to SPUM's when it doesn't. 13 of the engine's 38 clips are
  // authored (84% of the references in `content/`), so the fall-through is the
  // normal case for the tail, not an error state. `clipBadge` says which.
  const aaClip = useMemo(() => compiledAaClip(model, animation), [model, animation]);
  const clipBadge = clipSource(model, animation);

  // The preview box is 336×420 inside its padded 360px column.
  const previewSize = useMemo(
    () => fitSize(model.geometry, 336, 420) * zoom,
    [model.geometry, zoom],
  );

  // The hat-hair modes (lib/aachar/hatHair.ts) cut against the helmet's bottom
  // edge, so they need its bottom profile.
  //
  // A helmet saved before parts recorded `contentBottomProfile` carries none,
  // and the bake would have no edge to work from. Measuring the PNG covers
  // that without making the user re-save.
  // Measured from the helmet art ON SCREEN, not from the saved part: while the
  // Slots tab is open its working canvas shadows the part, and a cut built
  // from the saved pixels would fight what you're drawing.
  //
  // Measured from the RAW atlas, not the recoloured one: the profile is a
  // statement about alpha, which a recolour never touches, and keying it on the
  // recoloured data URL would re-decode the helmet every time a colour moved.
  const [measuredHelmet, setMeasuredHelmet] = useState<number[] | null>(null);
  const helmetAtlas = rawOverrides.helmet;
  useEffect(() => {
    if (!helmetAtlas) {
      setMeasuredHelmet(null);
      return;
    }
    let cancelled = false;
    measureBottomProfile(helmetAtlas, HELMET_REGION)
      .then((profile) => !cancelled && setMeasuredHelmet(profile))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [helmetAtlas]);

  // The character's hat-hair mode, baked into the (already recoloured) hair
  // atlas. `finalOverrides` is what every rig below renders.
  const finalOverrides = useHatHairedOverrides(
    previewCharacter,
    atlasOverrides,
    helmetAtlas,
    measuredHelmet,
    composed?.skeleton ?? null,
  );

  // The eye pipeline (Phases 11 + 12), in order: (1) bake the character's
  // per-eye nudge and the active gaze into the atlas's PIXELS (async hook —
  // needs a decode), then (2) the eye-state band swap repoints the `Free`
  // RECT. Both run last, on whatever survived recolour and hat-hair, so
  // those caches stay warm. State precedence: the Slots tab's transient
  // preview (bypasses the has-art gate — the artist needs to see a band
  // before it's saved) → the playing clip's whole-clip state → the
  // character's resting state. Gaze precedence mirrors it (Slots pad → clip
  // → the character's resting gaze) and is only computed while the OPEN band
  // will actually show — the other bands' pupils are unmarked.
  const clipEyeMeta = useMemo(() => resolveAaClip(model, animation), [model, animation]);
  const effectiveState = useMemo(() => {
    const previewing = tab === "slots" ? eyePreview : null;
    return previewing ?? effectiveEyeState(clipEyeMeta?.eyeState, previewCharacter);
  }, [tab, eyePreview, clipEyeMeta, previewCharacter]);
  const activeGaze =
    effectiveState === "open"
      ? ((tab === "slots" ? gazePreview : null) ??
        clipEyeMeta?.gaze ??
        previewCharacter.gaze)
      : undefined;
  const eyeAdjustedOverrides = useEyeAdjustedOverrides(
    model,
    previewCharacter,
    finalOverrides,
    activeGaze ?? undefined,
  );
  const eyeStatedOverrides = useMemo(() => {
    const eyeAtlas = eyeAdjustedOverrides.eye;
    if (!eyeAtlas || effectiveState === "open") return eyeAdjustedOverrides;
    const bands =
      tab === "slots" && eyePreview
        ? FORCE_EYE_BANDS
        : findPart(model, "eye", previewCharacter.picks.eye ?? "")?.eyeBands;
    const swapped = applyEyeState(eyeAtlas, effectiveState, bands);
    return swapped === eyeAtlas
      ? eyeAdjustedOverrides
      : { ...eyeAdjustedOverrides, eye: swapped };
  }, [eyeAdjustedOverrides, effectiveState, tab, eyePreview, model, previewCharacter]);

  // Auto-shading (Phase 13) — LAST in the chain, because the generated rim
  // must be computed from the final pixel colours (recoloured ramps, baked
  // hat-hair, nudged eyes). The eye slot is excluded inside the hook.
  const shadedOverrides = useShadedOverrides(
    model,
    previewCharacter,
    eyeStatedOverrides,
    lightDir,
  );

  const staleParts = useMemo(
    () => model.parts.filter((p) => isPartStale(model, p)),
    [model],
  );
  const dangling = useMemo(
    () => danglingPicks(model, previewCharacter),
    [model, previewCharacter],
  );

  const handleNewProject = useCallback(() => {
    if (!window.confirm("Discard the current project and start a blank one?")) return;
    setProject(createBlankProject());
    setSelectedCharacter(null);
    flash("New project");
  }, [flash]);

  // Pull the on-disk manifest in on demand. The parts library is rebuilt from
  // it wholesale; this is the button to reach for when the editor comes up
  // emptier than it should be.
  const handleLoadManifest = useCallback(async () => {
    try {
      // no-store: this button is how script-registered parts (the theme
      // generators) enter a running session — a cached manifest here would
      // silently load pre-script state.
      const res = await fetch(MANIFEST_URL, { cache: "no-store" });
      if (!res.ok) {
        flash("No manifest on disk yet — press Save first");
        return;
      }
      const result = validateProject(await res.json());
      if (!result.ok) {
        flash(`Manifest is invalid: ${result.error}`);
        return;
      }
      if (
        project.model.parts.length > 0 &&
        !window.confirm(
          `Replace the current project (${project.model.parts.length} parts) with the manifest (${result.value.model.parts.length} parts)?`,
        )
      ) {
        return;
      }
      setProject(result.value);
      setSelectedCharacter(null);
      flash(`Loaded ${result.value.model.parts.length} parts from the manifest`);
    } catch (err) {
      flash(err instanceof Error ? err.message : "Could not read the manifest");
    }
  }, [project, flash]);

  const handleRestoreBackup = useCallback(() => {
    if (!backup) return;
    setProject(backup);
    setSelectedCharacter(null);
    flash(`Restored ${backup.model.parts.length} parts from the previous draft`);
  }, [backup, flash]);

  const handleNewCharacter = useCallback(() => {
    const name = window.prompt("Character name (letters/digits):", "Bram");
    if (!name) return;
    if (!/^[A-Za-z][A-Za-z0-9]*$/.test(name)) {
      flash("Name must be letters/digits, starting with a letter");
      return;
    }
    setProject((prev) => upsertCharacter(prev, createBlankCharacter(name)));
    setSelectedCharacter(name);
    flash(`Added character "${name}"`);
  }, [flash]);

  const handleExport = useCallback(async () => {
    try {
      downloadBundle(PROJECT_FILENAME, await exportProject(project));
      flash("Exported bundle");
    } catch (err) {
      flash(err instanceof Error ? err.message : "Export failed");
    }
  }, [project, flash]);

  const handleImport = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      const result = importProject(await file.text());
      if (!result.ok) {
        flash(`Import failed: ${result.error}`);
        return;
      }
      setProject(result.project);
      setSelectedCharacter(null);
      flash(`Imported ${result.project.model.parts.length} parts`);
    },
    [flash],
  );

  // Writes public/aachar/manifest.json via the dev plugin. No module-graph
  // write, so this must NOT reload the page — if it ever does, something has
  // started writing outside public/.
  //
  // GUARDED (the manifest-clobber fix, writer half): every save carries the
  // hash of the manifest text this browser last synced with. When the disk
  // moved since (a script, a hand edit, an agent), the endpoint answers 409
  // instead of overwriting; we fetch the disk manifest, 3-way-merge it into
  // the draft (lib/aachar/projectMerge.ts) and retry once. The merged
  // project comes back to the caller so the UI can adopt it.
  const saveProject = useCallback(
    async (
      next: AaProject,
    ): Promise<{
      ok: boolean;
      error?: string;
      merged?: AaProject;
      mergeSummary?: string | null;
    }> => {
      const post = async (proj: AaProject, baseHash?: string) => {
        const res = await fetch("/__aachar/save-project", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            project: proj,
            ...(baseHash !== undefined ? { baseHash } : {}),
          }),
        });
        return (await res.json()) as {
          ok: boolean;
          error?: string;
          conflict?: boolean;
          hash?: string;
        };
      };

      const sync = readSync();
      const first = await post(next, sync?.hash);
      if (first.ok) {
        if (first.hash) writeSync(first.hash, projectText(next));
        return { ok: true };
      }
      if (!first.conflict) return first;

      // Disk changed under this browser — merge and retry once.
      const diskRes = await fetch(MANIFEST_URL, { cache: "no-store" });
      if (!diskRes.ok) return { ok: false, error: "manifest unreadable during merge" };
      const diskText = await diskRes.text();
      let disk: AaProject;
      try {
        const parsed = validateProject(JSON.parse(diskText));
        if (!parsed.ok) return { ok: false, error: `disk manifest invalid: ${parsed.error}` };
        disk = parsed.value;
      } catch {
        return { ok: false, error: "disk manifest is not JSON" };
      }
      const result = mergeProjects(syncBaseProject(sync), next, disk);
      const retry = await post(result.merged, await sha256Hex(diskText));
      if (!retry.ok) return retry;
      if (retry.hash) writeSync(retry.hash, projectText(result.merged));
      return {
        ok: true,
        merged: result.merged,
        mergeSummary: describeMerge(result),
      };
    },
    [],
  );

  const handleSave = useCallback(async () => {
    try {
      const json = await saveProject(project);
      if (json.merged) setProject(json.merged);
      if (json.ok) {
        flash(json.mergeSummary ? `Saved — ${json.mergeSummary}` : "Saved to manifest");
      } else {
        flash(`Save failed: ${json.error}`);
      }
    } catch (err) {
      flash(err instanceof Error ? err.message : "Save failed");
    }
  }, [project, saveProject, flash]);

  // MANIFEST AUTOSAVE. Until now the manifest only moved when this button was
  // pressed, so a long authoring session left the durable copy stale — that is
  // how a project with 16 parts on disk ended up with 3 in its manifest, and
  // why losing the localStorage draft looked like losing the work (I11).
  //
  // Debounced because proportion inputs and the appearance sliders fire per
  // keystroke and per tick, and skipped entirely while the library is empty:
  // a blank project must never be the thing that gets persisted. (The endpoint
  // refuses that too — this is the polite half of the same rule.)
  const autosaveSkipRef = useRef(true);
  const autosaveSeqRef = useRef(0);
  useEffect(() => {
    if (autosaveSkipRef.current) {
      autosaveSkipRef.current = false;
      return;
    }
    if (project.model.parts.length === 0) return;
    const seq = ++autosaveSeqRef.current;
    const timer = window.setTimeout(() => {
      setAutosave("saving");
      saveProject(project)
        .then((json) => {
          // An older reply landing after a newer one would report a stale
          // outcome; only the latest write may set the badge.
          if (seq !== autosaveSeqRef.current) return;
          setAutosave(json.ok ? "saved" : "error");
          if (!json.ok) {
            flash(`Autosave failed: ${json.error}`);
            return;
          }
          // A conflict-merge happened mid-autosave: adopt the merged project
          // (it is what's now on disk) and tell the author what moved.
          if (json.merged) setProject(json.merged);
          if (json.mergeSummary) flash(`Autosave ${json.mergeSummary}`);
        })
        .catch(() => {
          if (seq === autosaveSeqRef.current) setAutosave("error");
        });
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [project, saveProject, flash]);

  const ignored = composed?.ignored ?? [];

  // Ground shadow geometry (Phase 13) — composited under the rig, never baked
  // into pixels. Sized from the rig's real on-screen width so it tracks zoom
  // and proportions, offset AWAY from the preview light. An underlight casts
  // up, not onto the floor, so `below` degrades both kinds to a small contact
  // ellipse at the feet.
  const rigCssWidth =
    characterExtentPx(model.geometry).width * BASE_SPRITE_SCALE * previewSize;
  const contactOnly = lightDir === "below";
  const ellipseW = rigCssWidth * (contactOnly ? 0.45 : 0.62);
  const ellipseDx =
    lightDir === "left" ? ellipseW * 0.16 : lightDir === "right" ? -ellipseW * 0.16 : 0;
  const silhouetteTransform =
    lightDir === "top"
      ? "scaleY(-0.3)"
      : lightDir === "right"
        ? "scaleY(-0.45) skewX(32deg)"
        : "scaleY(-0.45) skewX(-32deg)";

  // The rig preview's content. Where it renders depends on the tab: inline in
  // the Characters tab's column flow (before Placement, via the `preview`
  // prop), a sticky right-hand column on model/body/slots, and not at all on
  // Animation, which brings its own A/B previews.
  const previewPanel = (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label className="text-sm text-slate-600">Animation</label>
        <select
          value={animation}
          onChange={(e) => setAnimation(e.target.value as SpumAnimation)}
          className="rounded border border-slate-300 px-2 py-1 text-sm"
        >
          {SPUM_ANIMATIONS.filter((a) => !BANNED_CLIPS.has(a)).map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <span className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-600">
          {previewCharacter.name}
        </span>
        <span
          className={`rounded px-2 py-1 text-xs ${
            clipBadge === "spum"
              ? "bg-amber-100 text-amber-900"
              : "bg-emerald-100 text-emerald-900"
          }`}
          title="Which clip data the rig is playing"
        >
          {clipBadge === "spum" ? "SPUM clip" : "AA clip"}
        </span>
        {placeholderBody ? (
          <span className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-600">
            placeholder mannequin — no body art yet
          </span>
        ) : null}
        {previewCharacter.hatHair && previewCharacter.hatHair !== "none" ? (
          <span
            className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-600"
            title="This character's hat-hair mode (Characters tab), baked into the hair pixels"
          >
            hat hair: {HAT_HAIR_MODE_LABEL[previewCharacter.hatHair]}
          </span>
        ) : null}
        <label
          className="flex items-center gap-1 text-xs text-slate-600"
          title="Preview light direction — drives the shading rim and the ground shadow. Not saved on the character: scenes will supply it."
        >
          💡
          <select
            value={lightDir}
            onChange={(e) => setLightDir(e.target.value as AaLightDirection)}
            className="rounded border border-slate-300 px-1 py-0.5 text-xs"
          >
            {AA_LIGHT_DIRECTIONS.map((d) => (
              <option key={d} value={d}>
                {LIGHT_DIRECTION_LABEL[d]}
              </option>
            ))}
          </select>
        </label>
        {previewCharacter.shading && previewCharacter.shading !== "none" ? (
          <span
            className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-600"
            title="This character's auto-shading style (Characters tab), baked into every worn slot except the eyes"
          >
            shading: {SHADE_STYLE_LABEL[previewCharacter.shading]}
          </span>
        ) : null}
      </div>
      <div className="mb-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600">
        {AA_SLOTS.map((slot) => (
          <label key={slot} className="flex cursor-pointer items-center gap-1">
            <input
              type="checkbox"
              checked={!hiddenSlots.has(slot)}
              onChange={() => toggleSlotVisible(slot)}
            />
            {SLOT_LABEL[slot]}
          </label>
        ))}
      </div>
      <div className="relative h-[420px] overflow-hidden rounded bg-slate-200">
        {composed && previewCharacter.groundShadow === "silhouette" && !contactOnly ? (
          // The same rig again, flattened onto the floor: blackened, flipped
          // about the feet anchor, skewed away from the light. The transform
          // makes it a stacking context at z 0, under the rig's z 1.
          <div className="absolute" style={{ left: "50%", top: "88%", zIndex: 0 }}>
            <div
              style={{
                transform: silhouetteTransform,
                transformOrigin: "0 0",
                filter: "brightness(0)",
                opacity: 0.22,
              }}
            >
              <SpumCharacter
                config={AA_RENDER_CONFIG}
                animation={animation}
                size={previewSize}
                atlasOverrides={shadedOverrides}
                slotAdjustments={slotAdjustments}
                skeletonOverride={composed.skeleton}
                {...(aaClip ? { clipOverride: aaClip } : {})}
              />
            </div>
          </div>
        ) : null}
        {composed &&
        previewCharacter.groundShadow &&
        (previewCharacter.groundShadow === "ellipse" || contactOnly) ? (
          <div
            className="absolute"
            style={{
              left: "50%",
              top: "88%",
              width: ellipseW,
              height: Math.max(6, ellipseW * 0.28),
              transform: `translate(calc(-50% + ${ellipseDx}px), -50%)`,
              background:
                "radial-gradient(closest-side, rgba(15,23,42,0.35), rgba(15,23,42,0))",
            }}
          />
        ) : null}
        {composed ? (
          // SpumCharacter renders UP from a zero-size root, so it needs an
          // explicit anchor near the bottom — the same pattern the Part
          // Studio preview uses. Centring it in a flex box instead puts the
          // feet mid-container and the rig off the top.
          <div className="absolute" style={{ left: "50%", top: "88%", zIndex: 1 }}>
            <SpumCharacter
              config={AA_RENDER_CONFIG}
              animation={animation}
              size={previewSize}
              atlasOverrides={shadedOverrides}
              slotAdjustments={slotAdjustments}
              skeletonOverride={composed.skeleton}
              {...(aaClip ? { clipOverride: aaClip } : {})}
            />
          </div>
        ) : (
          <span className="absolute inset-0 flex items-center justify-center text-sm text-slate-500">
            Loading skeleton…
          </span>
        )}
      </div>
      <label className="mt-2 block text-xs text-slate-600">
        Zoom {zoom.toFixed(2)}× <span className="text-slate-400">(1 = fits the box)</span>
      </label>
      <input
        type="range"
        min={0.25}
        max={4}
        step={0.05}
        value={zoom}
        onChange={(e) => setZoom(Number(e.target.value))}
        className="w-full"
      />
      <p className="mt-2 text-xs text-slate-500">
        Rendered through the SPUM rig via the <code>atlasOverrides</code> +{" "}
        <code>skeletonOverride</code> seams. No part is registered in{" "}
        <code>lib/spum/catalog.ts</code>.
      </p>
    </>
  );

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="flex flex-wrap items-center gap-2 border-b border-slate-300 bg-white px-4 py-2">
        <span className="mr-2 font-semibold">
          AA character
          <span className="ml-2 text-xs font-normal text-slate-500">/admin/aachar</span>
        </span>
        {(["model", "body", "slots", "characters", "animation", "horse"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded px-3 py-1 text-sm capitalize ${
              tab === t
                ? "bg-slate-900 text-white"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            {t}
          </button>
        ))}
        {message ? (
          <span className="ml-auto rounded bg-amber-100 px-2 py-1 text-xs text-amber-900">
            {message}
          </span>
        ) : null}
        {/* Always visible, on every tab — the point of the badge is that the
            durable copy's freshness stops being something you have to remember
            to check. */}
        <span
          className={`${message ? "" : "ml-auto"} rounded px-2 py-1 text-xs ${
            autosave === "error"
              ? "bg-red-100 text-red-800"
              : autosave === "saving"
                ? "bg-slate-100 text-slate-600"
                : "bg-emerald-50 text-emerald-800"
          }`}
          title="public/aachar/manifest.json — written automatically ~1s after any change"
        >
          {autosave === "saving"
            ? "saving…"
            : autosave === "error"
              ? "manifest NOT saved"
              : autosave === "saved"
                ? "manifest saved"
                : "manifest up to date"}
        </span>
      </header>

      <div className="flex flex-wrap gap-4 p-4">
        {tab === "model" ? (
        <div className="w-80 shrink-0 space-y-4">
          <section className="rounded border border-slate-300 bg-white p-3">
            <h2 className="mb-2 text-sm font-semibold">Project</h2>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={handleSave}
                className="rounded border border-slate-300 px-2 py-1 text-sm hover:bg-slate-50"
              >
                Save
              </button>
              <button
                onClick={handleExport}
                className="rounded border border-slate-300 px-2 py-1 text-sm hover:bg-slate-50"
              >
                Export JSON
              </button>
              <button
                onClick={() => fileRef.current?.click()}
                className="rounded border border-slate-300 px-2 py-1 text-sm hover:bg-slate-50"
              >
                Import…
              </button>
              <button
                onClick={handleLoadManifest}
                className="rounded border border-slate-300 px-2 py-1 text-sm hover:bg-slate-50"
                title="Rebuild the parts library from public/aachar/manifest.json"
              >
                Load from disk
              </button>
              <button
                onClick={handleNewProject}
                className="rounded border border-slate-300 px-2 py-1 text-sm hover:bg-slate-50"
              >
                New…
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".json"
                className="hidden"
                onChange={handleImport}
              />
            </div>
            {backup && backup.model.parts.length > model.parts.length ? (
              <div className="mt-2 rounded bg-amber-50 p-2 text-xs text-amber-900">
                A previous draft with <strong>{backup.model.parts.length} parts</strong> and{" "}
                <strong>{backup.characters.length} characters</strong> was replaced by
                this smaller one.
                <button
                  onClick={handleRestoreBackup}
                  className="ml-2 rounded border border-amber-500 bg-white px-2 py-0.5 hover:bg-amber-100"
                >
                  Restore it
                </button>
              </div>
            ) : null}
            <p className="mt-2 text-xs text-slate-500">
              <code>public/aachar/manifest.json</code> is written{" "}
              <strong>automatically</strong> about a second after any change —
              parts, characters, proportions, colours. Save forces it now. No
              module is touched either way, so the page does not reload. Export
              bundles the model, every PNG inline, and all characters; it is the
              only copy that survives losing this folder.
            </p>
          </section>

          <section className="rounded border border-slate-300 bg-white p-3">
            <h2 className="mb-2 text-sm font-semibold">
              Model geometry
              <span className="ml-2 text-xs font-normal text-slate-500">
                one per project
              </span>
            </h2>
            <table className="w-full text-xs">
              <tbody>
                {(["head", "body", "arm", "foot"] as const).map((k) => (
                  <tr key={k}>
                    <td className="py-0.5 capitalize text-slate-600">{k}</td>
                    <td className="py-0.5 text-right tabular-nums">
                      {model.geometry[k].width}×{model.geometry[k].height}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {staleParts.length > 0 ? (
              <p className="mt-2 rounded bg-amber-50 p-2 text-xs text-amber-900">
                Stale — drawn against older geometry, will render misaligned:{" "}
                {staleParts.map((p) => `${SLOT_LABEL[p.slot]}/${p.name}`).join(", ")}
              </p>
            ) : null}
            <p className="mt-2 text-xs text-slate-500">Editable in Phase 3 (Body tab).</p>
          </section>

          <section className="rounded border border-slate-300 bg-white p-3">
            <h2 className="mb-2 text-sm font-semibold">Parts library</h2>
            {model.parts.length === 0 ? (
              <p className="text-xs text-slate-500">
                Empty — the preview is showing a placeholder mannequin generated
                from the geometry above.
              </p>
            ) : (
              <ul className="space-y-0.5 text-xs">
                {AA_SLOTS.map((slot) => {
                  const parts = partsInSlot(model, slot);
                  if (parts.length === 0) return null;
                  return (
                    <li key={slot} className="flex justify-between gap-2">
                      <span className="text-slate-600">{SLOT_LABEL[slot]}</span>
                      <span className="text-slate-500">
                        {parts.map((p) => p.name).join(", ")}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="rounded border border-slate-300 bg-white p-3">
            <h2 className="mb-2 text-sm font-semibold">Characters</h2>
            <div className="mb-2 flex flex-wrap gap-1">
              <button
                onClick={() => setSelectedCharacter(null)}
                className={`rounded px-2 py-1 text-xs ${
                  selectedCharacter === null
                    ? "bg-slate-900 text-white"
                    : "border border-slate-300 hover:bg-slate-50"
                }`}
              >
                model preview
              </button>
              {characters.map((c) => (
                <button
                  key={c.name}
                  onClick={() => setSelectedCharacter(c.name)}
                  className={`rounded px-2 py-1 text-xs ${
                    selectedCharacter === c.name
                      ? "bg-slate-900 text-white"
                      : "border border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  {c.name}
                </button>
              ))}
            </div>
            <button
              onClick={handleNewCharacter}
              className="rounded border border-slate-300 px-2 py-1 text-sm hover:bg-slate-50"
            >
              Add character…
            </button>
            {dangling.length > 0 ? (
              <p className="mt-2 rounded bg-red-50 p-2 text-xs text-red-800">
                Picks with no matching part:{" "}
                {dangling.map((d) => `${SLOT_LABEL[d.slot]}/${d.name}`).join(", ")}
              </p>
            ) : null}
            <p className="mt-2 text-xs text-slate-500">Editable in Phase 5.</p>
          </section>

          <section className="rounded border border-slate-300 bg-white p-3">
            <h2 className="mb-2 text-sm font-semibold">Proportions</h2>
            <ul className="space-y-1 text-xs">
              {PROPORTION_BONES.map((b) => {
                const value = proportions[b.path];
                // Marks a bone the CHARACTER moved, as opposed to one inherited
                // from the model's base build.
                const overridden = previewCharacter.skeleton[b.path] !== undefined;
                return (
                  <li key={b.path} className="flex justify-between gap-2">
                    <span className="text-slate-600">
                      {b.label}
                      {overridden ? <span className="ml-1 text-sky-600">•</span> : null}
                    </span>
                    <span className="tabular-nums text-slate-500">
                      {value
                        ? `${unitsToPx(value.x).toFixed(1)}, ${unitsToPx(value.y).toFixed(1)}px`
                        : "stock"}
                    </span>
                  </li>
                );
              })}
            </ul>
            {ignored.length > 0 ? (
              <p className="mt-2 rounded bg-red-50 p-2 text-xs text-red-800">
                Ignored (a clip positions these bones, so an override does
                nothing): {ignored.map((i) => i.path).join(", ")}
              </p>
            ) : null}
            <p className="mt-2 text-xs text-slate-500">
              Model base build, plus per-character deltas (<span className="text-sky-600">•</span>).
              Editable in Phase 5.
            </p>
          </section>
        </div>
        ) : null}

        {/* Kept MOUNTED and hidden rather than unmounted on tab switch. The
            working pixel buffer lives in the editor's ref, so unmounting threw
            away unsaved drawing — switching to Slots and back looked like the
            art had vanished. Hiding costs nothing and the canvas survives. */}
        <div className={tab === "body" ? "min-w-[600px] flex-1" : "hidden"}>
          <BodyEditor
            model={model}
            onModelChange={handleModelChange}
            onPreview={setBodyPreview}
            baseSkeleton={baseSkeleton}
          />
        </div>

        <div className={tab === "slots" ? "min-w-[600px] flex-1" : "hidden"}>
          <SlotEditor
            model={model}
            onModelChange={handleModelChange}
            onPreview={setSlotPreview}
            skeleton={composed?.skeleton ?? null}
            eyePreview={eyePreview}
            onEyePreviewChange={setEyePreview}
            gazePreview={gazePreview}
            onGazePreviewChange={setGazePreview}
          />
        </div>

        {tab === "characters" ? (
          <CharactersTab
            project={project}
            onProjectChange={setProject}
            selected={selectedCharacter}
            onSelect={setSelectedCharacter}
            baseSkeleton={baseSkeleton}
            preview={previewPanel}
          />
        ) : null}

        {/* Same kept-mounted-and-hidden rule as Body/Slots: the horse tab
            hosts a PartCanvas whose working pixel buffer lives in a ref, so
            unmounting would discard unsaved drawing. The horse tab renders
            its own preview column and never touches livePreview/rawOverrides,
            so the character creator can't see it (docs/aachar-horse-plan.md H1). */}
        <div className={tab === "horse" ? "min-w-[600px] flex-1" : "hidden"}>
          <HorseTab
            model={model}
            onModelChange={handleModelChange}
            characters={characters}
            baseSkeleton={baseSkeleton}
          />
        </div>

        {tab === "animation" ? (
          <AnimationTab
            model={model}
            onModelChange={handleModelChange}
            skeleton={composed?.skeleton ?? null}
            atlasOverrides={shadedOverrides}
            slotAdjustments={slotAdjustments}
            animation={animation}
            onAnimationChange={(name) => setAnimation(name as SpumAnimation)}
          />
        ) : null}

        {/* Omitted on the Animation tab, which brings its own A/B previews —
            two rigs playing the same clip a foot apart is just noise. On the
            Characters tab the panel rides along in the tab's own column flow
            (the `preview` prop above), so this column only exists for
            model/body/slots. The Horse tab brings its own horse preview —
            the character rig is irrelevant there. */}
        {tab === "animation" || tab === "characters" || tab === "horse" ? null : (
          <div className="sticky top-4 w-[360px] shrink-0 self-start rounded border border-slate-300 bg-white p-3">
            {previewPanel}
          </div>
        )}
      </div>


    </div>
  );
}
