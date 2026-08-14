"use client";

// AA slot editor — the Slots tab of /admin/aachar. Phase 4 of
// docs/aachar-plan.md.
//
// Everything the body isn't: cloth, hair, eye, faceHair, helmet, weapon. Same
// canvas as the Body tab (`PartCanvas`); what differs is how the sheet is
// shaped and what the onion reads from.
//
// The onion here is YOUR OWN BODY, not a SPUM part — you're drawing things
// that sit on the character you already made. Region names never coincide
// across slots (cloth's `Left` is the body's `Arm_L`; an eye sheet has nothing
// in common with `Head`), so every pairing is an explicit mapping.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  PART_TAG_RE,
  findPart,
  partsInSlot,
  removePart,
  suggestPartName,
  upsertPart,
} from "@/lib/aachar/character";
import { HI_RES_SLOTS, isHiResPart } from "@/lib/aachar/hires";
import { prepareHiResArt } from "@/lib/aachar/hiresImport";
import { HIRES_FONTS, renderTextArtCanvas, type TextArtSpec } from "@/lib/aachar/textArt";
import { loadImage } from "@/lib/aachar/imageIo";
import { makeOnionSource, type OnionSource } from "@/lib/aachar/onion";
import {
  DEFAULT_HEADROOM,
  DEFAULT_SINGLE_SIZE,
  SLOT_SHAPE,
  buildSlotSheet,
  clampHeadroom,
  headroomFromPivot,
  onionMappingFor,
  roomyCanvas,
  slotPivots,
} from "@/lib/aachar/slots";
import {
  AA_EYE_STATES,
  SLOT_LABEL,
  type AaEyeState,
  type AaGazeDirection,
  type AaModel,
  type AaSlot,
  type Size,
} from "@/lib/aachar/types";
import { FREE_EYE_PRESETS, FREE_EYE_REGION } from "@/lib/spum/freeEye";
import type { Skeleton, SpriteAtlas } from "@/lib/spum/types";

import { HiResPartEditor, type HiResDraft } from "./HiResPartEditor";
import { LibraryBrowser, type ImportMode, type LibraryPick } from "./LibraryBrowser";
import { PartCanvas } from "./PartCanvas";

// `body` is authored on its own tab; the rest live here.
const SLOTS: AaSlot[] = ["cloth", "hair", "eye", "faceHair", "helmet", "weapon", "weapon2"];

// Sentinel for "editing a new, unsaved part". Part names are validated as
// letters/digits, so this can never collide with a real one.
const NEW_PART = " new";

const DEFAULT_NAME: Record<string, string> = {
  cloth: "shirt",
  hair: "hair",
  eye: "eyes",
  faceHair: "mouth",
  helmet: "hat",
  weapon: "ledger",
  weapon2: "coin",
};

type Props = {
  model: AaModel;
  onModelChange: (next: AaModel) => void;
  onPreview: (slot: AaSlot, atlas: SpriteAtlas | null) => void;
  /** Composed skeleton — the free-eye onion offset is derived from it. */
  skeleton: Skeleton | null;
  /** Eye-state the rig preview shows while authoring the eye bands
   *  (Phase 11). Owned by AaCharAdmin, which applies it to the live atlas and
   *  bypasses the saved-flags gate — the artist needs to see a band before
   *  it's saved. `null` = the character's own state. */
  eyePreview: AaEyeState | null;
  onEyePreviewChange: (state: AaEyeState | null) => void;
  /** Gaze the rig preview shows (Phase 12) — same authoring-lens contract.
   *  Reads the SAVED part's eye marks, so it comes alive after a save. */
  gazePreview: AaGazeDirection | null;
  onGazePreviewChange: (gaze: AaGazeDirection | null) => void;
};

export function SlotEditor({
  model,
  onModelChange,
  onPreview,
  skeleton,
  eyePreview,
  onEyePreviewChange,
  gazePreview,
  onGazePreviewChange,
}: Props) {
  const [slot, setSlot] = useState<AaSlot>("eye");
  const [sizes, setSizes] = useState<Partial<Record<AaSlot, Size>>>({});
  // How far this slot's anchor sits below its canvas centre, in source px.
  // Positive drops the head reference and frees rows above it — see
  // `headroomPivot`. Zero is the stock centre pivot every earlier part carries.
  const [headrooms, setHeadrooms] = useState<Partial<Record<AaSlot, number>>>({});
  const [onion, setOnion] = useState<OnionSource | null>(null);
  // Which part of the current slot is being edited. `null` = a new, blank one.
  // Without this the editor could only ever reach the FIRST part in a slot, so
  // a second hair would be unreachable — and saving over its name from a blank
  // canvas would have wiped it.
  const [editing, setEditing] = useState<string | null>(null);
  // Library browser (Phase 8): open state, an in-flight as-is import, and the
  // hand-off token for the Pixelate path.
  const [browsing, setBrowsing] = useState(false);
  const [hiResDraft, setHiResDraft] = useState<HiResDraft | null>(null);
  const [externalFile, setExternalFile] = useState<{ file: File; token: number } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const externalSeqRef = useRef(0);
  // Hi-res text (smooth, real fonts — docs/pixel-text.md §5): the panel's
  // open state and the spec it renders from. Distinct from the pixel canvas's
  // Text tool, which quantises into the sprite grid by design.
  const [textOpen, setTextOpen] = useState(false);
  const [textSpec, setTextSpec] = useState<TextArtSpec>({
    text: "",
    fontId: "impact",
    color: "#f4f4f4",
    outline: true,
    outlineColor: "#1a1c2c",
    bold: false,
    italic: false,
  });
  const textSeqRef = useRef(0);
  // Draft text for the saved part's theme-tag input ("zombie"). Metadata-only:
  // adding or removing a tag rewrites the part record, never its pixels.
  const [tagDraft, setTagDraft] = useState("");

  const bodyPart = useMemo(() => partsInSlot(model, "body")[0], [model]);

  // The eye-state and gaze previews are authoring lenses for the eye slot;
  // leaving one on while drawing another slot would silently rewrite the
  // SAVED eye part under the rig, so both drop the moment the slot changes.
  useEffect(() => {
    if (slot !== "eye") {
      onEyePreviewChange(null);
      onGazePreviewChange(null);
    }
  }, [slot, onEyePreviewChange, onGazePreviewChange]);

  // Onion source is the character's own body sheet.
  useEffect(() => {
    if (!bodyPart) {
      setOnion(null);
      return;
    }
    let cancelled = false;
    makeOnionSource(bodyPart.atlas)
      .then((src) => !cancelled && setOnion(src))
      .catch(() => !cancelled && setOnion(null));
    return () => {
      cancelled = true;
    };
  }, [bodyPart]);

  const shape = SLOT_SHAPE[slot];
  const size = useMemo<Size>(() => {
    if (sizes[slot]) return sizes[slot] as Size;
    if (slot === "eye") {
      const p = FREE_EYE_PRESETS[1]; // "Big" — room to overhang a small head
      return { width: p.width, height: p.band };
    }
    return DEFAULT_SINGLE_SIZE[slot] ?? { width: 16, height: 16 };
  }, [sizes, slot]);

  const headroom = useMemo(
    () => clampHeadroom(headrooms[slot] ?? DEFAULT_HEADROOM[slot] ?? 0, size.height),
    [headrooms, slot, size.height],
  );

  const sheet = useMemo(
    () => buildSlotSheet(slot, model.geometry, size),
    [slot, model.geometry, size],
  );
  const pivots = useMemo(
    () => slotPivots(slot, size, headroom),
    [slot, size, headroom],
  );
  const mapping = useMemo(() => onionMappingFor(slot, skeleton), [slot, skeleton]);
  const slotParts = useMemo(() => partsInSlot(model, slot), [model, slot]);
  // Default to the first part when switching slots; `editing` takes over once
  // the user picks one explicitly (or starts a new one).
  const activeName =
    editing === NEW_PART ? null : (editing ?? slotParts[0]?.name ?? null);
  const savedPart = useMemo(
    () => (activeName ? findPart(model, slot, activeName) : undefined),
    [model, slot, activeName],
  );
  const newName = useMemo(
    () => suggestPartName(model, slot, DEFAULT_NAME[slot] ?? slot),
    [model, slot],
  );

  // Selecting a saved part adopts ITS canvas size and headroom. Without this,
  // opening a part drawn at 48x36 while the slot control still said 32x22 would
  // migrate it down and quietly shrink the art on the next save — and a part
  // drawn with headroom would snap back to a centred anchor, moving it on the
  // head.
  useEffect(() => {
    if (!savedPart || shape === "derived") return;
    // A hi-res part's regions are NATIVE px (possibly 512) — adopting them as
    // the slot's canvas size would wreck the next pixel part. It never renders
    // in the pixel canvas anyway.
    if (isHiResPart(savedPart)) return;
    const region =
      savedPart.atlas.regions[FREE_EYE_REGION] ??
      Object.values(savedPart.atlas.regions)[0];
    if (!region) return;
    setSizes((prev) => {
      const cur = prev[slot];
      if (cur && cur.width === region.width && cur.height === region.height) return prev;
      return { ...prev, [slot]: { width: region.width, height: region.height } };
    });
    if (shape !== "single") return;
    const saved = headroomFromPivot(region.pivot?.y ?? 0.5, region.height);
    setHeadrooms((prev) => (prev[slot] === saved ? prev : { ...prev, [slot]: saved }));
  }, [savedPart, slot, shape]);

  const handleDelete = () => {
    if (!savedPart) return;
    if (!window.confirm(`Delete "${savedPart.name}"? The PNG stays on disk.`)) return;
    onModelChange(removePart(model, slot, savedPart.name));
    setEditing(null);
  };

  const flash = useCallback((text: string) => {
    setNotice(text);
    window.setTimeout(() => setNotice(null), 4000);
  }, []);

  // A library pick in Pixelate mode becomes a File for the pixel canvas's
  // floating-draft flow — sprite frames get cropped out of their sheet first.
  const pickToFile = useCallback(async (pick: LibraryPick): Promise<File> => {
    if (pick.frame) {
      const img = await loadImage(pick.url);
      const c = document.createElement("canvas");
      c.width = pick.frame.width;
      c.height = pick.frame.height;
      const ctx = c.getContext("2d");
      if (!ctx) throw new Error("2D canvas unavailable");
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(
        img,
        pick.frame.x,
        pick.frame.y,
        pick.frame.width,
        pick.frame.height,
        0,
        0,
        pick.frame.width,
        pick.frame.height,
      );
      const blob = await new Promise<Blob>((resolve, reject) =>
        c.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG encode failed"))), "image/png"),
      );
      return new File([blob], `${pick.suggestedName}.png`, { type: "image/png" });
    }
    const res = await fetch(pick.url);
    if (!res.ok) throw new Error(`Could not fetch ${pick.url}`);
    return new File([await res.blob()], `${pick.suggestedName}.png`, { type: "image/png" });
  }, []);

  const handleLibraryPick = useCallback(
    async (pick: LibraryPick, mode: ImportMode) => {
      setBrowsing(false);
      try {
        if (mode === "asis") {
          const art = await prepareHiResArt(pick.url, pick.frame);
          setHiResDraft({
            art,
            label: pick.label,
            source: pick.source,
            suggestedName: pick.suggestedName,
          });
        } else {
          setExternalFile({ file: await pickToFile(pick), token: ++externalSeqRef.current });
          setHiResDraft(null);
        }
      } catch (err) {
        flash(err instanceof Error ? err.message : "Import failed");
      }
    },
    [pickToFile, flash],
  );

  // Render the text spec at native resolution and land it as a hi-res draft —
  // identical standing to an as-is library import, so the transform panel's
  // lossless resize / drag / smooth toggle / Save apply unchanged.
  const handleCreateText = useCallback(async () => {
    try {
      const canvas = renderTextArtCanvas(textSpec);
      if (!canvas) {
        flash("Type some text first");
        return;
      }
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG encode failed"))), "image/png"),
      );
      const art = await prepareHiResArt(blob);
      // The seq keeps the draft key unique, so re-creating with edited text
      // remounts the transform panel (it seeds its art from the draft once).
      setHiResDraft({
        art,
        label: `text "${textSpec.text.slice(0, 24)}"`,
        source: `text:${textSpec.fontId}#${++textSeqRef.current}`,
        suggestedName: "text",
        smooth: !textSpec.fontId.startsWith("px-"),
      });
    } catch (err) {
      flash(err instanceof Error ? err.message : "Text render failed");
    }
  }, [textSpec, flash]);

  const setSize = (axis: "width" | "height", raw: string) => {
    const n = Math.max(1, Math.min(160, Math.round(Number(raw) || 1)));
    setSizes((prev) => ({ ...prev, [slot]: { ...size, [axis]: n } }));
  };

  const setHeadroom = (raw: number) => {
    setHeadrooms((prev) => ({ ...prev, [slot]: clampHeadroom(raw, size.height) }));
  };

  // The one-button version of "I need way more space above the head". A canvas
  // grows symmetrically about its centre, so height alone puts half the new
  // rows under the chin; dropping the anchor by half the growth cancels that
  // and every new row lands above. Flip the sign and they all land below.
  //
  //   room above = height / 2 + headroom      (anchor's distance from the top)
  //   Δheight = g, Δheadroom = ±g/2  →  the other side is untouched.
  const addRoom = (px: number, above: boolean) => {
    const height = Math.max(1, Math.min(160, size.height + px));
    const grew = height - size.height;
    if (grew === 0) return;
    setSizes((prev) => ({ ...prev, [slot]: { ...size, height } }));
    setHeadrooms((prev) => ({
      ...prev,
      [slot]: clampHeadroom(headroom + (above ? grew / 2 : -grew / 2), height),
    }));
  };

  // One click to a canvas a tall hairstyle or a helmet crown actually fits in:
  // 20px of room over the head, 4px under it, and wide enough to overhang.
  // Re-derived from the model's head so it stays right as the geometry moves.
  const makeRoomy = () => {
    const head = model.geometry.head;
    const { height, headroom: hr } = roomyCanvas(head.height, 20, 4);
    setSizes((prev) => ({
      ...prev,
      [slot]: { width: Math.max(size.width, head.width + 10), height },
    }));
    setHeadrooms((prev) => ({ ...prev, [slot]: hr }));
  };

  // Slots that pin to the head bone, so the head is the thing the canvas has
  // room above (weapon pins to a hand — headroom still moves its anchor, but
  // there's no head to measure against).
  const headWorn = slot === "hair" || slot === "faceHair" || slot === "helmet";

  const onionLabel = !bodyPart
    ? "No body part yet — draw one on the Body tab and it becomes the reference here."
    : slot === "weapon" || slot === "weapon2"
      ? "No useful body reference for a held object; the onion is off for this slot."
      : "Your own body, aligned pivot-to-pivot. Reference only.";

  const canBrowse = (HI_RES_SLOTS as readonly string[]).includes(slot);
  const activeIsHiRes = !hiResDraft && savedPart !== undefined && isHiResPart(savedPart);

  // Theme tags (docs/aachar-plan.md — Randomize filter). Metadata-only writes:
  // `upsertPart` swaps the record, the pixels and atlas are untouched, and the
  // manifest autosave carries it like any other project change.
  const addTag = () => {
    if (!savedPart) return;
    const tag = tagDraft.trim().toLowerCase();
    if (!tag) return;
    if (!PART_TAG_RE.test(tag)) {
      flash("Tags are lowercase slugs (letters/digits/dashes, starting with a letter)");
      return;
    }
    if (!(savedPart.tags ?? []).includes(tag)) {
      onModelChange(upsertPart(model, { ...savedPart, tags: [...(savedPart.tags ?? []), tag] }));
    }
    setTagDraft("");
  };
  const removeTag = (tag: string) => {
    if (!savedPart) return;
    const tags = (savedPart.tags ?? []).filter((t) => t !== tag);
    const next = { ...savedPart };
    if (tags.length > 0) next.tags = tags;
    else delete next.tags;
    onModelChange(upsertPart(model, next));
  };

  // Shared between the pixel canvas and the hi-res editor — the part picker is
  // how you move between the two kinds of part in a slot.
  const partsPanel = (
    <section className="rounded border border-slate-300 bg-white p-3">
      <h2 className="mb-2 text-sm font-semibold">Parts in {SLOT_LABEL[slot]}</h2>
      <div className="mb-2 flex flex-wrap gap-1">
        {slotParts.map((p) => (
          <button
            key={p.name}
            onClick={() => {
              setHiResDraft(null);
              setEditing(p.name);
            }}
            title={isHiResPart(p) ? "hi-res (imported as-is)" : undefined}
            className={`rounded px-2 py-1 text-xs ${
              !hiResDraft && activeName === p.name
                ? "bg-slate-900 text-white"
                : "border border-slate-300 hover:bg-slate-50"
            }`}
          >
            {p.name}
            {isHiResPart(p) ? <span className="ml-1 text-emerald-500">✦</span> : null}
          </button>
        ))}
        <button
          onClick={() => {
            setHiResDraft(null);
            setEditing(NEW_PART);
          }}
          className={`rounded px-2 py-1 text-xs ${
            !hiResDraft && activeName === null
              ? "bg-emerald-700 text-white"
              : "border border-dashed border-slate-400 hover:bg-slate-50"
          }`}
        >
          + New
        </button>
        {canBrowse ? (
          <button
            onClick={() => setBrowsing(true)}
            className="rounded border border-emerald-600 px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-50"
            title="Import a prop, sprite frame or modern-pack item as this slot's art"
          >
            Browse library…
          </button>
        ) : null}
        {canBrowse ? (
          <button
            onClick={() => setTextOpen((o) => !o)}
            className={`rounded px-2 py-1 text-xs ${
              textOpen
                ? "bg-emerald-700 text-white"
                : "border border-emerald-600 text-emerald-700 hover:bg-emerald-50"
            }`}
            title="Smooth text with real fonts — becomes a hi-res part: resize losslessly, never pixelised"
          >
            Text…
          </button>
        ) : null}
      </div>
      {textOpen && canBrowse ? (
        <div className="mb-2 rounded border border-emerald-300 bg-emerald-50 p-2">
          <p className="text-xs font-semibold text-emerald-900">
            Hi-res text — smooth, freely resizable, never pixelised
          </p>
          <textarea
            value={textSpec.text}
            onChange={(e) => setTextSpec((s) => ({ ...s, text: e.target.value }))}
            placeholder="Type here…"
            rows={2}
            autoFocus
            className="mt-1 w-full rounded border border-emerald-300 px-1 py-0.5 text-sm"
          />
          <div className="mt-1 flex items-center gap-2 text-xs text-emerald-900">
            Font
            <select
              value={textSpec.fontId}
              onChange={(e) => setTextSpec((s) => ({ ...s, fontId: e.target.value }))}
              className="rounded border border-emerald-300 px-1 py-0.5"
            >
              <optgroup label="Real fonts">
                {HIRES_FONTS.filter((f) => f.kind === "system").map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Pixel fonts (as-is, not re-pixelised)">
                {HIRES_FONTS.filter((f) => f.kind === "pixel").map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </optgroup>
            </select>
            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={textSpec.bold}
                onChange={(e) => setTextSpec((s) => ({ ...s, bold: e.target.checked }))}
              />
              Bold
            </label>
            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={textSpec.italic}
                onChange={(e) => setTextSpec((s) => ({ ...s, italic: e.target.checked }))}
              />
              Italic
            </label>
          </div>
          <div className="mt-1 flex items-center gap-3 text-xs text-emerald-900">
            <label className="flex items-center gap-1">
              Colour
              <input
                type="color"
                value={textSpec.color}
                onChange={(e) => setTextSpec((s) => ({ ...s, color: e.target.value }))}
                className="h-6 w-8 rounded border border-emerald-300"
              />
            </label>
            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={textSpec.outline}
                onChange={(e) => setTextSpec((s) => ({ ...s, outline: e.target.checked }))}
              />
              Outline
            </label>
            {textSpec.outline ? (
              <input
                type="color"
                value={textSpec.outlineColor}
                onChange={(e) => setTextSpec((s) => ({ ...s, outlineColor: e.target.value }))}
                className="h-6 w-8 rounded border border-emerald-300"
              />
            ) : null}
            <button
              onClick={handleCreateText}
              className="rounded bg-emerald-700 px-2 py-1 text-xs text-white hover:bg-emerald-800"
            >
              {hiResDraft?.source.startsWith("text:") ? "Re-create" : "Create"}
            </button>
          </div>
          <p className="mt-1 text-xs text-emerald-800">
            Creates a hi-res draft: drag it into place and resize it
            losslessly with the display-height slider. Then either{" "}
            <strong>Stamp onto</strong> the selected part (the shirt stays,
            the words bake over it) or Save it as its own part. To change the
            words or font afterwards, edit here and re-create (placement
            resets). For text snapped to the sprite&apos;s pixel grid, use
            the pixel canvas&apos;s Text tool instead.
          </p>
        </div>
      ) : null}
      {savedPart && !hiResDraft ? (
        <div className="mb-2 flex flex-wrap items-center gap-1 text-xs">
          <span
            className="text-slate-600"
            title="Theme tags. Tagged parts are excluded from 🎲 Randomize by default (invite them back with the filter on the Characters tab). Tags never hide a part from the Wearing pickers."
          >
            Tags
          </span>
          {(savedPart.tags ?? []).map((tag) => (
            <button
              key={tag}
              onClick={() => removeTag(tag)}
              className="rounded-full border border-violet-300 bg-violet-50 px-2 py-0.5 text-violet-800 hover:bg-violet-100"
              title={`Remove tag "${tag}"`}
            >
              {tag} ×
            </button>
          ))}
          <input
            value={tagDraft}
            onChange={(e) => setTagDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") addTag();
            }}
            placeholder="zombie"
            className="w-20 rounded border border-slate-300 px-1 py-0.5"
          />
          <button
            onClick={addTag}
            className="rounded border border-slate-300 px-2 py-0.5 hover:bg-slate-50"
          >
            + tag
          </button>
        </div>
      ) : null}
      {savedPart && !hiResDraft ? (
        <button
          onClick={handleDelete}
          className="mb-2 rounded border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50"
        >
          Delete {savedPart.name}
        </button>
      ) : null}
      {!savedPart && !hiResDraft ? (
        <p className="mb-2 text-xs text-emerald-700">
          New part — saves as <code>{newName}</code> unless you rename it.
        </p>
      ) : null}
      <p className="mb-2 text-xs text-slate-500">
        Selecting a part loads it here; Save overwrites it. Rename before
        saving to branch a copy instead.
      </p>
      {notice ? (
        <p className="mb-2 rounded bg-amber-100 px-2 py-1 text-xs text-amber-900">{notice}</p>
      ) : null}
    </section>
  );

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-1">
        {SLOTS.map((s) => (
          <button
            key={s}
            onClick={() => {
              setSlot(s);
              setEditing(null);
              setHiResDraft(null);
            }}
            className={`rounded px-2 py-1 text-xs ${
              slot === s ? "bg-slate-900 text-white" : "border border-slate-300 hover:bg-slate-50"
            }`}
          >
            {SLOT_LABEL[s]}
            {partsInSlot(model, s).length > 0 ? (
              <span className="ml-1 text-emerald-400">●</span>
            ) : null}
          </button>
        ))}
      </div>

      {browsing ? (
        <LibraryBrowser onPick={handleLibraryPick} onClose={() => setBrowsing(false)} />
      ) : null}

      {hiResDraft ? (
        <HiResPartEditor
          key={`draft:${hiResDraft.source}`}
          slot={slot}
          model={model}
          onModelChange={onModelChange}
          onPreview={(atlas) => onPreview(slot, atlas)}
          skeleton={skeleton}
          draft={hiResDraft}
          mergeTarget={savedPart ?? null}
          onSaved={(name) => {
            setHiResDraft(null);
            setEditing(name);
          }}
          onCancel={() => setHiResDraft(null)}
        >
          {partsPanel}
        </HiResPartEditor>
      ) : activeIsHiRes && savedPart ? (
        <HiResPartEditor
          key={`${slot}:${savedPart.name}:hires`}
          slot={slot}
          model={model}
          onModelChange={onModelChange}
          onPreview={(atlas) => onPreview(slot, atlas)}
          skeleton={skeleton}
          savedPart={savedPart}
          onSaved={setEditing}
        >
          {partsPanel}
        </HiResPartEditor>
      ) : (
      <PartCanvas
        // Remount per PART, not just per slot: the working buffer, undo stack
        // and hydration guard are all per-part, so carrying them across a
        // switch would paint one part's pixels onto another's canvas.
        key={`${slot}:${activeName ?? NEW_PART}`}
        slot={slot}
        sheet={sheet}
        pivots={pivots}
        model={model}
        onModelChange={onModelChange}
        onPreview={(atlas) => onPreview(slot, atlas)}
        savedPart={savedPart}
        authoredFor={shape === "derived" ? model.geometry : undefined}
        onion={onion}
        onionMapping={mapping}
        onionLabel={onionLabel}
        defaultName={savedPart?.name ?? newName}
        onSaved={setEditing}
        externalFile={externalFile}
      >
        {partsPanel}
        <section className="rounded border border-slate-300 bg-white p-3">
          <h2 className="mb-2 text-sm font-semibold capitalize">{SLOT_LABEL[slot]}</h2>

          {shape === "derived" ? (
            <p className="text-xs text-slate-500">
              Sized from the model geometry ({model.geometry.body.width}×
              {model.geometry.body.height} torso, {model.geometry.arm.width}×
              {model.geometry.arm.height} sleeves) so it can&apos;t drift from the
              body. Change it on the Body tab.
            </p>
          ) : (
            <>
              <div className="flex items-center gap-1 text-xs">
                <input
                  type="number"
                  min={1}
                  max={160}
                  value={size.width}
                  onChange={(e) => setSize("width", e.target.value)}
                  className="w-16 rounded border border-slate-300 px-1 py-0.5"
                />
                <span className="text-slate-400">×</span>
                <input
                  type="number"
                  min={1}
                  max={160}
                  value={size.height}
                  onChange={(e) => setSize("height", e.target.value)}
                  className="w-16 rounded border border-slate-300 px-1 py-0.5"
                />
                {slot === "eye" ? (
                  <span className="text-slate-500">per band</span>
                ) : null}
              </div>
              {slot === "eye" ? (
                <div className="mt-2 rounded bg-slate-50 p-2">
                  <span className="text-xs text-slate-600">Rig preview shows</span>
                  <div className="mt-1 flex gap-1">
                    {AA_EYE_STATES.map((s) => (
                      <button
                        key={s}
                        onClick={() => onEyePreviewChange(s === "open" ? null : s)}
                        className={`rounded px-2 py-0.5 text-xs capitalize ${
                          (eyePreview ?? "open") === s
                            ? "bg-slate-900 text-white"
                            : "border border-slate-300 bg-white hover:bg-slate-50"
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    Which band the rig renders while you draw — including
                    unsaved art. Preview only; a character&apos;s resting state
                    is set on the Characters tab.
                  </p>
                  <div className="mt-2 border-t border-slate-200 pt-2">
                    <span className="text-xs text-slate-600">Gaze preview</span>
                    <div className="mt-1 grid w-fit grid-cols-3 gap-0.5">
                      {(
                        [
                          "up-left", "up", "up-right",
                          "left", null, "right",
                          "down-left", "down", "down-right",
                        ] as (AaGazeDirection | null)[]
                      ).map((dir, i) => (
                        <button
                          key={i}
                          onClick={() => onGazePreviewChange(dir === gazePreview ? null : dir)}
                          className={`h-6 w-6 rounded text-xs ${
                            gazePreview === dir && dir !== null
                              ? "bg-slate-900 text-white"
                              : dir === null && gazePreview === null
                                ? "bg-slate-300"
                                : "border border-slate-300 bg-white hover:bg-slate-50"
                          }`}
                          title={dir ?? "centred"}
                        >
                          {dir === null
                            ? "•"
                            : { up: "↑", down: "↓", left: "←", right: "→", "up-left": "↖", "up-right": "↗", "down-left": "↙", "down-right": "↘" }[dir]}
                        </button>
                      ))}
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {savedPart?.eyes
                        ? "Moves the pupils inside the whites — furthest the art allows. Uses the SAVED marks, so save after changing them."
                        : "Needs saved eye marks — use Eyes & pupils below, then Save."}
                    </p>
                  </div>
                </div>
              ) : null}
              {shape === "single" ? (
                <div className="mt-2 rounded bg-slate-50 p-2">
                  <label className="flex items-center gap-1 text-xs text-slate-600">
                    Headroom
                    <input
                      type="number"
                      step={1}
                      min={-Math.floor(size.height / 2)}
                      max={Math.floor(size.height / 2)}
                      value={headroom}
                      onChange={(e) => setHeadroom(Number(e.target.value) || 0)}
                      className="w-14 rounded border border-slate-300 px-1 py-0.5"
                    />
                    <span className="text-slate-400">px below centre</span>
                  </label>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {headWorn ? (
                      <button
                        onClick={makeRoomy}
                        className="rounded border border-emerald-600 bg-emerald-600 px-2 py-0.5 text-xs text-white hover:bg-emerald-700"
                      >
                        Room for tall hair
                      </button>
                    ) : null}
                    <button
                      onClick={() => addRoom(8, true)}
                      className="rounded border border-slate-300 bg-white px-2 py-0.5 text-xs hover:bg-slate-50"
                    >
                      +8 above
                    </button>
                    <button
                      onClick={() => addRoom(8, false)}
                      className="rounded border border-slate-300 bg-white px-2 py-0.5 text-xs hover:bg-slate-50"
                    >
                      +8 below
                    </button>
                    <button
                      onClick={() => setHeadroom(0)}
                      className="rounded border border-slate-300 bg-white px-2 py-0.5 text-xs hover:bg-slate-50"
                    >
                      Centre
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {headWorn ? (
                      <>
                        <strong>
                          {(size.height / 2 + headroom - model.geometry.head.height / 2).toFixed(0)}
                          px
                        </strong>{" "}
                        of canvas above the head, {""}
                        {(size.height / 2 - headroom - model.geometry.head.height / 2).toFixed(0)}px
                        below it.{" "}
                      </>
                    ) : null}
                    Drops the anchor down its own canvas, so added height lands
                    above the head instead of under the chin. Saved with the part.
                  </p>
                </div>
              ) : null}
              {slot === "eye" ? (
                <div className="mt-2 flex flex-wrap gap-1">
                  {FREE_EYE_PRESETS.map((p) => (
                    <button
                      key={p.key}
                      onClick={() =>
                        setSizes((prev) => ({
                          ...prev,
                          eye: { width: p.width, height: p.band },
                        }))
                      }
                      className="rounded border border-slate-300 px-2 py-0.5 text-xs hover:bg-slate-50"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </>
          )}

          {slot === "eye" ? (
            <p className="mt-2 text-xs text-slate-500">
              Free eye layer: <strong>both</strong> eyes go on the top band,
              placed by hand — SPUM&apos;s stock rig stamps a 1px sliver twice at
              a fixed 5px spacing, which is useless on an original head. The{" "}
              <code>FreeClose</code> band underneath is the blink pose; leave it
              empty and the rig falls back to the stock eyelash. Nothing clips a
              slice to the skull, so eyes may overhang the head.
            </p>
          ) : null}
          {slot === "helmet" || slot === "hair" ? (
            <p className="mt-2 text-xs text-slate-500">
              Drawn over the head, and free to overhang it.
            </p>
          ) : null}
        </section>
      </PartCanvas>
      )}
    </div>
  );
}
