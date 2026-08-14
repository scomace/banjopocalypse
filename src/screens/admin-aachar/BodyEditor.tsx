"use client";

// AA body editor — the Body tab of /admin/aachar. Phase 3 of
// docs/aachar-plan.md.
//
// What makes this different from Part Studio's canvas: the region rects are
// EDITABLE. Part Studio copies the stock template's atlas verbatim and only
// records resizable geometry for single-region parts, so `body` (6 regions)
// can never be resized there. Here the four measurements drive a re-packed
// sheet, and existing pixels are migrated pivot-aligned so exploring the
// proportions doesn't mean redrawing (docs/aachar-plan.md I3).
//
// The canvas itself lives in `PartCanvas` — everything below is the geometry
// controls and the SPUM onion picker.

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  PART_TAG_RE,
  effectiveZOrder,
  findPart,
  partsInSlot,
  removePart,
  suggestPartName,
  upsertPart,
} from "@/lib/aachar/character";
import { STOCK_GEOMETRY, packBodySheet } from "@/lib/aachar/geometry";
import { loadOnionSource, type OnionSource } from "@/lib/aachar/onion";
import {
  AA_DEFAULT_Z,
  LAYER_BONES,
  PROPORTION_BONES,
  composeSkeleton,
  headBodySeamPx,
  pxToUnits,
  stockProportions,
  unitsToPx,
} from "@/lib/aachar/skeleton";
import type { AaGeometry, AaModel } from "@/lib/aachar/types";
import { SPUM_PART_LIST, atlasPath, type BodyPart } from "@/lib/spum/catalog";
import type { Skeleton, SpriteAtlas } from "@/lib/spum/types";

import { PartCanvas } from "./PartCanvas";

const GEOMETRY_KEYS = ["head", "body", "arm", "foot"] as const;
type GeometryKey = (typeof GEOMETRY_KEYS)[number];

// Sentinel for "editing a new, unsaved part" — same trick as SlotEditor's:
// part names are letters/digits, so this can never collide with a real one.
const NEW_PART = " new";

type Props = {
  model: AaModel;
  onModelChange: (next: AaModel) => void;
  onPreview: (atlas: SpriteAtlas | null) => void;
  /** SPUM's skeleton, unmodified — the baseline the proportion knobs read from. */
  baseSkeleton: Skeleton | null;
};

export function BodyEditor({ model, onModelChange, onPreview, baseSkeleton }: Props) {
  const [geometry, setGeometry] = useState<AaGeometry>(model.geometry);
  const [onionPart, setOnionPart] = useState<BodyPart>("Human_3");
  const [onion, setOnion] = useState<OnionSource | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const sheet = useMemo(() => packBodySheet(geometry), [geometry]);
  // Which body part is being edited. `null` = whichever is first (the original
  // torso); NEW_PART = a new, blank one. Without this the tab could only ever
  // reach the FIRST body part, so a second head would be unreachable.
  const [editing, setEditing] = useState<string | null>(null);
  const [tagDraft, setTagDraft] = useState("");
  const bodyParts = useMemo(() => partsInSlot(model, "body"), [model]);
  const activeName =
    editing === NEW_PART ? null : (editing ?? bodyParts[0]?.name ?? null);
  const savedPart = useMemo(
    () => (activeName ? findPart(model, "body", activeName) : undefined),
    [model, activeName],
  );
  const newName = useMemo(() => suggestPartName(model, "body", "torso"), [model]);

  // Onion reference — a stock SPUM body. Regions pair by name here (both are
  // body sheets), so no mapping is needed; sizes differ, which is exactly what
  // pivot-to-pivot compositing handles.
  useEffect(() => {
    let cancelled = false;
    loadOnionSource(atlasPath("body", onionPart))
      .then((src) => !cancelled && setOnion(src))
      .catch(() => !cancelled && setOnion(null));
    return () => {
      cancelled = true;
    };
  }, [onionPart]);

  const setSize = useCallback(
    (key: GeometryKey, axis: "width" | "height", raw: string) => {
      const n = Math.max(1, Math.min(64, Math.round(Number(raw) || 1)));
      setGeometry((g) => ({ ...g, [key]: { ...g[key], [axis]: n } }));
    },
    [],
  );

  // Geometry is staged here and committed explicitly: syncing on every
  // keystroke would mark every saved part stale mid-typing.
  const commitGeometry = useCallback(() => {
    onModelChange({ ...model, geometry });
    setNote("Geometry committed to model");
    window.setTimeout(() => setNote(null), 3000);
  }, [model, geometry, onModelChange]);

  const dirty = useMemo(
    () => JSON.stringify(geometry) !== JSON.stringify(model.geometry),
    [geometry, model.geometry],
  );

  // Proportions: the model's BASE build. Stock values come from SPUM's
  // skeleton; an override shadows one bone without disturbing the rest.
  const stock = useMemo(
    () => (baseSkeleton ? stockProportions(baseSkeleton) : {}),
    [baseSkeleton],
  );
  const setProportion = useCallback(
    (path: string, axis: "x" | "y", raw: string) => {
      const px = Number(raw);
      if (!Number.isFinite(px)) return;
      const current = model.skeleton[path] ?? stock[path] ?? { x: 0, y: 0 };
      onModelChange({
        ...model,
        skeleton: {
          ...model.skeleton,
          [path]: { ...current, [axis]: pxToUnits(px) },
        },
      });
    },
    [model, stock, onModelChange],
  );

  // Head/body seam, measured against the geometry being edited (not the
  // committed one) so the readout tracks what's on screen.
  const seam = useMemo(() => {
    if (!baseSkeleton) return null;
    const { skeleton } = composeSkeleton(baseSkeleton, model.skeleton);
    return headBodySeamPx(skeleton, geometry);
  }, [baseSkeleton, model.skeleton, geometry]);

  // Draw order writes straight to the model — unlike geometry there's no
  // half-typed state that could mark parts stale, and seeing the layer change
  // on the rig immediately is the whole point of the control.
  const zOrder = useMemo(() => effectiveZOrder(model), [model]);
  const setZ = useCallback(
    (path: string, raw: string) => {
      const n = Math.round(Number(raw));
      if (!Number.isFinite(n)) return;
      onModelChange({ ...model, zOrder: { ...zOrder, [path]: n } });
    },
    [model, zOrder, onModelChange],
  );

  // Theme tags ("zombie") — same metadata-only writes as SlotEditor's panel:
  // `upsertPart` swaps the record, the pixels and atlas are untouched.
  const addTag = () => {
    if (!savedPart) return;
    const tag = tagDraft.trim().toLowerCase();
    if (!tag) return;
    if (!PART_TAG_RE.test(tag)) return;
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
  const handleDelete = () => {
    if (!savedPart) return;
    if (!window.confirm(`Delete "${savedPart.name}"? The PNG stays on disk.`)) return;
    onModelChange(removePart(model, "body", savedPart.name));
    setEditing(null);
  };

  return (
    <PartCanvas
      // Remount per PART: the working buffer, undo stack and hydration guard
      // are all per-part, so carrying them across a switch would paint one
      // head's pixels onto another's canvas.
      key={`body:${activeName ?? NEW_PART}`}
      slot="body"
      sheet={sheet}
      model={model}
      onModelChange={onModelChange}
      onPreview={onPreview}
      savedPart={savedPart}
      authoredFor={geometry}
      onion={onion}
      onionLabel="SPUM reference, aligned pivot-to-pivot per region — it lines up even though the sizes differ. Reference only; the pixels are yours."
      defaultName={savedPart?.name ?? newName}
      onSaved={setEditing}
    >
      <section className="rounded border border-slate-300 bg-white p-3">
        <h2 className="mb-2 text-sm font-semibold">Bodies</h2>
        <div className="mb-2 flex flex-wrap gap-1">
          {bodyParts.map((p) => (
            <button
              key={p.name}
              onClick={() => setEditing(p.name)}
              className={`rounded px-2 py-1 text-xs ${
                activeName === p.name
                  ? "bg-slate-900 text-white"
                  : "border border-slate-300 hover:bg-slate-50"
              }`}
            >
              {p.name}
            </button>
          ))}
          <button
            onClick={() => setEditing(NEW_PART)}
            className={`rounded px-2 py-1 text-xs ${
              activeName === null
                ? "bg-emerald-700 text-white"
                : "border border-dashed border-slate-400 hover:bg-slate-50"
            }`}
          >
            + New
          </button>
        </div>
        {savedPart ? (
          <div className="mb-2 flex flex-wrap items-center gap-1 text-xs">
            <span
              className="text-slate-600"
              title="Theme tags. Tagged bodies are excluded from 🎲 Randomize by default; a themed roll (zombies) draws from them instead."
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
        {savedPart && bodyParts.length > 1 ? (
          <button
            onClick={handleDelete}
            className="mb-2 rounded border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50"
          >
            Delete {savedPart.name}
          </button>
        ) : null}
        <p className="text-xs text-slate-500">
          Same sheet, different head/body art — every body shares the one
          geometry, so cloth and animations fit them all. Selecting one loads
          it; Save overwrites it. Rename before saving to branch a copy.
        </p>
      </section>
      <section className="rounded border border-slate-300 bg-white p-3">
        <h2 className="mb-2 text-sm font-semibold">Geometry</h2>
        <table className="w-full text-xs">
          <tbody>
            {GEOMETRY_KEYS.map((k) => (
              <tr key={k}>
                <td className="py-1 capitalize text-slate-600">{k}</td>
                <td className="py-1">
                  <input
                    type="number"
                    min={1}
                    max={64}
                    value={geometry[k].width}
                    onChange={(e) => setSize(k, "width", e.target.value)}
                    className="w-14 rounded border border-slate-300 px-1 py-0.5"
                  />
                </td>
                <td className="py-1 text-center text-slate-400">×</td>
                <td className="py-1">
                  <input
                    type="number"
                    min={1}
                    max={64}
                    value={geometry[k].height}
                    onChange={(e) => setSize(k, "height", e.target.value)}
                    className="w-14 rounded border border-slate-300 px-1 py-0.5"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-2 flex gap-2">
          <button
            onClick={commitGeometry}
            disabled={!dirty}
            className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50 disabled:opacity-40"
          >
            Commit to model
          </button>
          <button
            onClick={() => setGeometry(STOCK_GEOMETRY)}
            className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
          >
            SPUM stock
          </button>
        </div>
        {dirty ? (
          <p className="mt-1 text-xs text-amber-700">
            Uncommitted — the model still has the old geometry, so cloth and the
            stale check are using the old numbers.
          </p>
        ) : null}
        {note ? <p className="mt-1 text-xs text-emerald-700">{note}</p> : null}
        <label className="mt-2 block text-xs text-slate-600">Onion body</label>
        <select
          value={onionPart}
          onChange={(e) => setOnionPart(e.target.value as BodyPart)}
          className="w-full rounded border border-slate-300 px-1 py-0.5 text-xs"
        >
          {SPUM_PART_LIST.body.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <p className="mt-2 text-xs text-amber-700">
          No <code>pant</code> slot: <code>Foot_L</code>/<code>Foot_R</code> are
          always visible, so draw finished legs/shoes there.
        </p>
      </section>

      <section className="rounded border border-slate-300 bg-white p-3">
        <h2 className="mb-1 text-sm font-semibold">Proportions</h2>
        <p className="mb-2 text-xs text-slate-500">
          The model&apos;s base build, in source px. These move bones, not art —
          nothing needs redrawing.
        </p>
        {seam !== null ? (
          <p
            className={`mb-2 rounded px-2 py-1 text-xs ${
              seam > 0 ? "bg-red-50 text-red-800" : "bg-emerald-50 text-emerald-800"
            }`}
          >
            Head/body:{" "}
            <strong>
              {seam > 0
                ? `${seam.toFixed(1)}px gap`
                : `${(-seam).toFixed(1)}px overlap`}
            </strong>
            {seam > 0 ? " — lower Head attach to close it." : ""}
            <br />
            <span className="opacity-70">
              SPUM stock overlaps by 2px; a shorter head turns that into a gap.
            </span>
          </p>
        ) : null}
        <table className="w-full text-xs">
          <tbody>
            {PROPORTION_BONES.map((b) => {
              const value = model.skeleton[b.path] ?? stock[b.path];
              const overridden = model.skeleton[b.path] !== undefined;
              return (
                <tr key={b.path} title={b.hint}>
                  <td className="py-0.5 text-slate-600">
                    {b.label}
                    {overridden ? <span className="ml-1 text-sky-600">•</span> : null}
                  </td>
                  {(["x", "y"] as const).map((axis) => (
                    <td key={axis} className="py-0.5">
                      {b.axes.includes(axis) && value ? (
                        <input
                          type="number"
                          step={0.5}
                          value={Number(unitsToPx(value[axis]).toFixed(3))}
                          onChange={(e) => setProportion(b.path, axis, e.target.value)}
                          className="w-16 rounded border border-slate-300 px-1 py-0.5"
                        />
                      ) : null}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
        <button
          onClick={() => onModelChange({ ...model, skeleton: {} })}
          className="mt-2 rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
        >
          Reset proportions
        </button>
      </section>

      <section className="rounded border border-slate-300 bg-white p-3">
        <h2 className="mb-1 text-sm font-semibold">Layering</h2>
        <p className="mb-2 text-xs text-slate-500">
          Draw order. Above the body (0) paints in front, below paints behind.
        </p>
        <table className="w-full text-xs">
          <tbody>
            {LAYER_BONES.map((b) => {
              const value = zOrder[b.path] ?? b.stock;
              const isBody = b.label === "Body";
              return (
                <tr key={b.path}>
                  <td className="py-0.5 text-slate-600">{b.label}</td>
                  <td className="py-0.5">
                    <input
                      type="number"
                      value={value}
                      disabled={isBody}
                      onChange={(e) => setZ(b.path, e.target.value)}
                      className="w-16 rounded border border-slate-300 px-1 py-0.5 disabled:bg-slate-100"
                    />
                  </td>
                  <td className="py-0.5 text-right text-slate-400">
                    {isBody ? "reference" : value > 0 ? "front" : "behind"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <button
          onClick={() => onModelChange({ ...model, zOrder: { ...AA_DEFAULT_Z } })}
          className="mt-2 rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
        >
          Reset layering
        </button>
        <p className="mt-2 text-xs text-slate-500">
          SPUM puts both feet behind the body while the left arm is in front —
          fine on their small chibi torso, wrong on a wide one, so the left foot
          defaults to the front here.
        </p>
      </section>
    </PartCanvas>
  );
}
