"use client";

// AA animation tab — Phase 6 of docs/aachar-plan.md.
//
// The clips are the last fully SPUM-derived thing about an AA character, so
// this is where they get re-authored. Three sub-views, each answering a
// different question:
//
//   edit       what does MY clip look like, and what are its beats?
//   reference  what does the engine's clip of this name actually contain?
//   variants   which of eleven in-grammar variations reads best?
//
// The reference view deliberately shows POSE KEYS rather than frames. `idle` is
// 20 frames but only 3 authored poses; the other 17 are linear interpolation
// and carry no authored information, because `lib/spum/curve.ts` discards the
// stored tangents. A frame strip would imply seventeen decisions nobody made.

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  AA_CHANNELS,
  type AaBeat,
  type AaChannel,
  type AaClip,
  type AaPose,
  CHANNEL_LABELS,
  NEUTRAL_STANCE,
  channelAt,
  checkClip,
  clipAmplitude,
  compileClip,
  fittedStance,
  posesEqual,
} from "@/lib/aachar/clip";
import { analyzeClip, describeAnalysis } from "@/lib/aachar/clipAnalysis";
import {
  clipSource,
  clipToSource,
  modelStance,
  resolveAaClip,
  revertModelClip,
  upsertModelClip,
} from "@/lib/aachar/clipLibrary";
import { AA_CLIP_NAMES, BANNED_CLIPS, CLIP_USAGE, LOCKED_FRAMES, clipCoverage } from "@/lib/aachar/clips";
import { DEFAULT_VARIANT_GRID, applyVariant, describeVariant } from "@/lib/aachar/clipVariants";
import { fitSize } from "@/lib/aachar/preview";
import { AA_RENDER_CONFIG } from "@/lib/aachar/render";
import {
  AA_EYE_STATES,
  AA_GAZE_DIRECTIONS,
  type AaEyeState,
  type AaGazeDirection,
  type AaModel,
} from "@/lib/aachar/types";
import { SpumCharacter } from "@/lib/spum/SpumCharacter";
import type { PartNudge } from "@/lib/spum/partAdjustments";
import type { Clip, Skeleton, SpriteAtlas } from "@/lib/spum/types";
import type { SpumSlot } from "@/lib/spum/catalog";

type View = "edit" | "reference" | "variants";
/** Phase 6B's three-position toggle for the reference view. */
type Overlay = "silhouette" | "keys" | "numbers";

type Props = {
  model: AaModel;
  onModelChange: (next: AaModel) => void;
  skeleton: Skeleton | null;
  atlasOverrides: Partial<Record<SpumSlot, SpriteAtlas>>;
  /** Per-slot nudge/rotate/flip from the previewed character's placement. */
  slotAdjustments?: Partial<Record<SpumSlot, PartNudge>>;
  animation: string;
  onAnimationChange: (name: string) => void;
};

// Everything playable: the engine's clip names plus AA-original names (clips
// authored under names SPUM never had, e.g. `stab` — nothing falls through
// for those, they exist only in the AA library).
const CLIP_NAMES = Array.from(
  new Set([...Object.keys(LOCKED_FRAMES), ...AA_CLIP_NAMES]),
)
  .filter((n) => !BANNED_CLIPS.has(n))
  .sort((a, b) => (CLIP_USAGE[b] ?? 0) - (CLIP_USAGE[a] ?? 0) || a.localeCompare(b));

// Peak-to-peak rotation across all 38 engine clips, per channel. Shown beside
// each clip's own amplitude so "is this too big?" has an answer on screen.
const AMPLITUDE_BUDGET: Record<AaChannel, number> = {
  root: 77,
  body: 101,
  head: 64,
  larm: 305,
  rarm: 191,
  lfoot: 90,
  rfoot: 94,
};

function Rig({
  skeleton,
  atlasOverrides,
  slotAdjustments,
  animation,
  clip,
  size,
  paused,
  time,
  dim,
}: {
  skeleton: Skeleton;
  atlasOverrides: Partial<Record<SpumSlot, SpriteAtlas>>;
  slotAdjustments?: Partial<Record<SpumSlot, PartNudge>>;
  animation: string;
  clip?: Clip;
  size: number;
  paused?: boolean;
  time?: number;
  dim?: boolean;
}) {
  return (
    // SpumCharacter renders UP from a zero-size root, so it needs an explicit
    // anchor near the bottom rather than flex centring (Phase 3c).
    <div className="absolute" style={{ left: "50%", top: "88%", opacity: dim ? 0.45 : 1 }}>
      <SpumCharacter
        config={AA_RENDER_CONFIG}
        animation={animation as never}
        size={size}
        atlasOverrides={atlasOverrides}
        slotAdjustments={slotAdjustments}
        skeletonOverride={skeleton}
        {...(clip ? { clipOverride: clip } : {})}
        paused={paused}
        time={time}
      />
    </div>
  );
}

export function AnimationTab({
  model,
  onModelChange,
  skeleton,
  atlasOverrides,
  slotAdjustments,
  animation,
  onAnimationChange,
}: Props) {
  const [view, setView] = useState<View>("edit");
  const [overlay, setOverlay] = useState<Overlay>("keys");
  const [playing, setPlaying] = useState(true);
  const [frame, setFrame] = useState(0);
  // Zoom around a fitted size, not an absolute multiplier — see
  // lib/aachar/preview. Locomotion at full stride is wider than the standing
  // extent `fitSize` measures, hence the deliberate headroom in its `fill`.
  const [zoom, setZoom] = useState(1);
  const [selectedBeat, setSelectedBeat] = useState(0);
  const [spumClip, setSpumClip] = useState<Clip | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const flash = useCallback((text: string) => {
    setMessage(text);
    window.setTimeout(() => setMessage(null), 3000);
  }, []);

  const clip = useMemo(() => resolveAaClip(model, animation), [model, animation]);
  const source = clipSource(model, animation);
  const stance = useMemo(() => modelStance(model), [model]);
  const compiled = useMemo(
    () => (clip ? compileClip(clip, stance) : null),
    [clip, stance],
  );
  const frames = clip?.frames ?? LOCKED_FRAMES[animation] ?? 60;

  // The engine's clip of the same name — the reference, and the A/B partner.
  // Read-only; nothing here ever writes to `public/spum/`.
  useEffect(() => {
    let cancelled = false;
    setSpumClip(null);
    fetch(`/spum/anims/${animation}.json`)
      .then((r) => (r.ok ? (r.json() as Promise<Clip>) : null))
      .then((c) => {
        if (!cancelled) setSpumClip(c);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [animation]);

  useEffect(() => {
    setSelectedBeat(0);
    setFrame(0);
  }, [animation]);

  const problems = useMemo(() => (clip ? checkClip(clip) : []), [clip]);
  const amplitude = useMemo(() => (clip ? clipAmplitude(clip) : {}), [clip]);
  const analysis = useMemo(() => (compiled ? analyzeClip(compiled) : null), [compiled]);
  const spumAnalysis = useMemo(() => (spumClip ? analyzeClip(spumClip) : null), [spumClip]);
  const coverage = useMemo(() => clipCoverage(), []);

  // Main preview panes are ~500×300; variant tiles are 150×170.
  const size = useMemo(() => fitSize(model.geometry, 500, 300) * zoom, [model.geometry, zoom]);
  const tileSize = useMemo(() => fitSize(model.geometry, 150, 170), [model.geometry]);

  const updateClip = useCallback(
    (next: AaClip) => onModelChange(upsertModelClip(model, next)),
    [model, onModelChange],
  );

  const setStance = useCallback(
    (next: AaPose | undefined) => onModelChange({ ...model, stance: next }),
    [model, onModelChange],
  );

  const editStance = useCallback(
    (ch: AaChannel, key: "rot" | "x" | "y", value: number) => {
      const current = channelAt(stance, ch);
      setStance({ ...stance, [ch]: { ...current, [key]: value } });
    },
    [stance, setStance],
  );

  // Where the head sprite's bottom edge falls relative to the body sprite's
  // top, in source px — positive is a visible gap. The head and body are
  // adjacent on the SHEET but placed by separate BONES, so sheet adjacency says
  // nothing about whether they meet; this is the number that does.
  //
  // Only the head-vs-body chain matters, and `P_Body` is an ancestor of both,
  // so it cancels. What remains is the two proportion bones (`HeadSet`, the
  // neck, and the body sprite's own offset) plus the `head` channel's stance —
  // which is exactly why an invented stance can open a seam a hand-tuned
  // character had closed.
  const neckSeam = useMemo(() => {
    if (!skeleton) return null;
    const boneY = (p: string) =>
      (skeleton.bones.find((b) => b.path === p)?.defaultPos.y ?? 0) * 32;
    const centreToCentre =
      boneY("Root/BodySet/P_Body/HeadSet") +
      channelAt(stance, "head").y +
      boneY("Root/BodySet/P_Body/HeadSet/P_Head/P_Head") -
      boneY("Root/BodySet/P_Body/Body");
    return centreToCentre - model.geometry.head.height / 2 - model.geometry.body.height / 2;
  }, [skeleton, stance, model.geometry]);

  const editBeat = useCallback(
    (index: number, ch: AaChannel, key: "rot" | "x" | "y", value: number) => {
      if (!clip) return;
      const beats = clip.beats.map((b, i) => {
        if (i !== index) return b;
        const current = channelAt(b.pose, ch);
        return { ...b, pose: { ...b.pose, [ch]: { ...current, [key]: value } } };
      });
      // A looping clip's endpoints are the SAME pose. Editing one without the
      // other silently breaks the loop, so they move together.
      const last = beats.length - 1;
      if (clip.loop && (index === 0 || index === last)) {
        const mirrorIdx = index === 0 ? last : 0;
        beats[mirrorIdx] = { ...beats[mirrorIdx], pose: beats[index].pose };
      }
      updateClip({ ...clip, beats });
    },
    [clip, updateClip],
  );

  const handleCopySource = useCallback(() => {
    if (!clip) return;
    void navigator.clipboard
      .writeText(clipToSource(clip))
      .then(() => flash("Beat sheet copied — paste into lib/aachar/clips/"))
      .catch(() => flash("Clipboard blocked"));
  }, [clip, flash]);

  const beatFrames = clip?.beats.map((b) => b.frame) ?? [];
  const scrubTime = frame / 60;
  const paused = !playing;

  return (
    <div className="min-w-[720px] max-w-[1150px] flex-1 space-y-3">
      <header className="flex flex-wrap items-center gap-2 rounded border border-slate-300 bg-white p-3">
        <select
          value={animation}
          onChange={(e) => onAnimationChange(e.target.value)}
          className="rounded border border-slate-300 px-2 py-1 text-sm"
        >
          {CLIP_NAMES.map((n) => (
            <option key={n} value={n}>
              {clipSource(model, n) === "spum" ? "○" : "●"} {n}
              {CLIP_USAGE[n] ? ` (${CLIP_USAGE[n]}×)` : ""}
            </option>
          ))}
        </select>
        <span
          className={`rounded px-2 py-1 text-xs ${
            source === "spum"
              ? "bg-amber-100 text-amber-900"
              : source === "override"
                ? "bg-sky-100 text-sky-900"
                : "bg-emerald-100 text-emerald-900"
          }`}
        >
          {source === "spum"
            ? "not authored — playing SPUM's clip"
            : source === "override"
              ? "project override"
              : "AA library"}
        </span>
        <span className="text-xs text-slate-500">{frames}f</span>
        {clip ? (
          <label
            className="flex items-center gap-1 text-xs text-slate-600"
            title="Whole-clip eye state (Phase 11) — a render-time band swap, never a track. Blank leaves the character's own resting state alone."
          >
            eyes
            <select
              value={clip.eyeState ?? ""}
              onChange={(e) => {
                const next = { ...clip };
                if (e.target.value) next.eyeState = e.target.value as AaEyeState;
                else delete next.eyeState;
                updateClip(next);
              }}
              className="rounded border border-slate-300 px-1 py-0.5"
            >
              <option value="">character&apos;s</option>
              {AA_EYE_STATES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {clip ? (
          <label
            className="flex items-center gap-1 text-xs text-slate-600"
            title="Whole-clip gaze (Phase 12) — where the pupils point, furthest the whites allow. Needs eye marks on the worn eye part; only shows while the open band renders."
          >
            gaze
            <select
              value={clip.gaze ?? ""}
              onChange={(e) => {
                const next = { ...clip };
                if (e.target.value) next.gaze = e.target.value as AaGazeDirection;
                else delete next.gaze;
                updateClip(next);
              }}
              className="rounded border border-slate-300 px-1 py-0.5"
            >
              <option value="">centred</option>
              {AA_GAZE_DIRECTIONS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {(["edit", "reference", "variants"] as View[]).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`rounded px-2 py-1 text-xs capitalize ${
              view === v ? "bg-slate-900 text-white" : "border border-slate-300 hover:bg-slate-50"
            }`}
          >
            {v}
          </button>
        ))}
        {message ? (
          <span className="ml-auto rounded bg-amber-100 px-2 py-1 text-xs text-amber-900">
            {message}
          </span>
        ) : null}
      </header>

      {!skeleton ? (
        <p className="rounded border border-slate-300 bg-white p-3 text-sm text-slate-500">
          Loading skeleton…
        </p>
      ) : view === "variants" ? (
        <section className="rounded border border-slate-300 bg-white p-3">
          <h2 className="mb-1 text-sm font-semibold">Variant grid</h2>
          <p className="mb-3 text-xs text-slate-500">
            One knob at a time, so a tile that reads wrong tells you WHICH knob did
            it. Every variant keeps the duration, the beat count and the loop
            closure — only the values, the timing ratios and the posture move.
          </p>
          {!clip ? (
            <p className="text-xs text-slate-500">
              Nothing authored for <code>{animation}</code> yet — author it first,
              then vary it.
            </p>
          ) : (
            <div className="flex flex-wrap gap-3">
              {DEFAULT_VARIANT_GRID.map(({ label, spec }) => {
                const variant = applyVariant(clip, spec);
                return (
                  <div key={label} className="w-[150px]">
                    <div className="relative h-[170px] overflow-hidden rounded bg-slate-200">
                      <Rig
                        skeleton={skeleton}
                        atlasOverrides={atlasOverrides}
                        slotAdjustments={slotAdjustments}
                                        animation={animation}
                        clip={compileClip(variant, stance)}
                        size={tileSize}
                      />
                    </div>
                    <div className="mt-1 text-xs font-medium">{label}</div>
                    <div className="text-[10px] leading-tight text-slate-500">
                      {describeVariant(spec)}
                    </div>
                    <button
                      onClick={() => {
                        updateClip({ ...variant, name: animation });
                        flash(`Adopted "${label}" — saved as a project override`);
                      }}
                      className="mt-1 w-full rounded border border-slate-300 px-2 py-0.5 text-xs hover:bg-slate-50"
                    >
                      Use
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      ) : (
        <>
          <section className="rounded border border-slate-300 bg-white p-3">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <button
                onClick={() => setPlaying((p) => !p)}
                className="rounded border border-slate-300 px-2 py-1 text-sm hover:bg-slate-50"
              >
                {playing ? "Pause" : "Play"}
              </button>
              {view === "reference" ? (
                <div className="flex gap-1">
                  {(["silhouette", "keys", "numbers"] as Overlay[]).map((o) => (
                    <button
                      key={o}
                      onClick={() => setOverlay(o)}
                      className={`rounded px-2 py-1 text-xs ${
                        overlay === o
                          ? "bg-slate-900 text-white"
                          : "border border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      {o}
                    </button>
                  ))}
                </div>
              ) : null}
              <label className="ml-auto text-xs text-slate-600">zoom {zoom.toFixed(2)}×</label>
              <input
                type="range"
                min={0.25}
                max={4}
                step={0.05}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="w-32"
              />
            </div>

            <div className="flex gap-3">
              <div className="relative h-[300px] flex-1 overflow-hidden rounded bg-slate-200">
                <span className="absolute left-2 top-2 z-10 rounded bg-white/80 px-1 text-[10px] text-slate-600">
                  {compiled ? "AA" : "SPUM (nothing authored)"}
                </span>
                {/* Falls through to SPUM's clip when nothing is authored, rather
                    than showing an empty box: seeing the motion you are about
                    to replace is the point of standing here. */}
                <Rig
                  skeleton={skeleton}
                  atlasOverrides={atlasOverrides}
                  slotAdjustments={slotAdjustments}
                            animation={animation}
                  {...(compiled ? { clip: compiled } : {})}
                  size={size}
                  paused={paused}
                  time={scrubTime}
                />
              </div>
              {view === "reference" && overlay !== "numbers" ? (
                <div className="relative h-[300px] flex-1 overflow-hidden rounded bg-slate-200">
                  <span className="absolute left-2 top-2 z-10 rounded bg-white/80 px-1 text-[10px] text-slate-600">
                    SPUM reference
                  </span>
                  {/* Feed the already-fetched clip rather than letting the rig
                      fetch by name — an AA-original name (`stab`) has no
                      /spum/anims/ file, and a 404 would just error the pane. */}
                  {spumClip ? (
                    <Rig
                      skeleton={skeleton}
                      atlasOverrides={atlasOverrides}
                      slotAdjustments={slotAdjustments}
                                    animation={animation}
                      clip={spumClip}
                      size={size}
                      paused={paused}
                      time={scrubTime}
                      dim={overlay === "silhouette"}
                    />
                  ) : (
                    <span className="absolute inset-0 flex items-center justify-center px-4 text-center text-xs text-slate-500">
                      No SPUM clip named “{animation}” — this is an AA-original.
                    </span>
                  )}
                </div>
              ) : null}
            </div>

            {/* The scrubber is POSE-KEY aware: the ticks are the authored
                decisions, and the slider between them is interpolation. */}
            <div className="mt-2">
              <input
                type="range"
                min={0}
                max={frames}
                value={frame}
                onChange={(e) => {
                  setFrame(Number(e.target.value));
                  setPlaying(false);
                }}
                className="w-full"
              />
              <div className="flex flex-wrap items-center gap-1 text-xs">
                <span className="text-slate-500">f{frame}</span>
                {beatFrames.map((f, i) => (
                  <button
                    key={f}
                    onClick={() => {
                      setFrame(f);
                      setSelectedBeat(i);
                      setPlaying(false);
                    }}
                    className={`rounded px-1.5 py-0.5 tabular-nums ${
                      frame === f
                        ? "bg-slate-900 text-white"
                        : "border border-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    {f}
                    <span className="ml-1 text-[10px] opacity-70">
                      {clip?.beats[i].role}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </section>

          {view === "reference" ? (
            <section className="rounded border border-slate-300 bg-white p-3">
              <h2 className="mb-1 text-sm font-semibold">
                What the engine&apos;s <code>{animation}</code> actually contains
              </h2>
              <p className="mb-2 text-xs text-slate-500">
                Shown as pose keys, not frames. Everything between two keys is
                linear interpolation — the engine throws the stored tangents away
                — so the keys are the whole authored content of the clip.
              </p>
              {spumAnalysis ? (
                <>
                  <p className="mb-2 text-xs text-slate-700">{describeAnalysis(spumAnalysis)}</p>
                  <div className="mb-3 flex flex-wrap gap-1">
                    {spumAnalysis.poseKeys.map((f) => (
                      <button
                        key={f}
                        onClick={() => {
                          setFrame(Math.round(f));
                          setPlaying(false);
                        }}
                        className={`rounded px-2 py-0.5 text-xs tabular-nums ${
                          Number.isInteger(f)
                            ? "border border-slate-300 hover:bg-slate-50"
                            : "border border-red-300 bg-red-50 text-red-800"
                        }`}
                        title={Number.isInteger(f) ? "" : "off the 60fps grid — a hand-editing artefact"}
                      >
                        f{f}
                      </button>
                    ))}
                  </div>
                  <div className="max-h-72 overflow-auto">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-white text-left text-slate-500">
                        <tr>
                          <th className="py-1">bone</th>
                          <th>kind</th>
                          <th className="text-right">keys</th>
                          <th className="text-right">rot°</th>
                          <th className="text-right">x px</th>
                          <th className="text-right">y px</th>
                          <th className="text-right">closes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {spumAnalysis.channels.map((c, i) => (
                          <tr key={`${c.path}-${c.kind}-${i}`} className="border-t border-slate-100">
                            <td className="py-0.5 pr-2 font-mono text-[10px] text-slate-600">
                              {c.path.split("/").pop()}
                            </td>
                            <td className="text-slate-500">{c.kind}</td>
                            <td className="text-right tabular-nums">{c.keys}</td>
                            <td className="text-right tabular-nums">{c.rangeRot.toFixed(1)}</td>
                            <td className="text-right tabular-nums">{c.rangeX.toFixed(1)}</td>
                            <td className="text-right tabular-nums">{c.rangeY.toFixed(1)}</td>
                            <td className="text-right">{c.closes ? "✓" : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <p className="text-xs text-slate-500">Loading reference clip…</p>
              )}
            </section>
          ) : (
            <section className="rounded border border-slate-300 bg-white p-3">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-semibold">Beat sheet</h2>
                {clip ? (
                  <>
                    <span className="text-xs text-slate-500">
                      {clip.beats.length} poses · {clip.loop ? "loops" : "one-shot"}
                    </span>
                    <button
                      onClick={handleCopySource}
                      className="rounded border border-slate-300 px-2 py-0.5 text-xs hover:bg-slate-50"
                    >
                      Copy TS
                    </button>
                    {source === "override" ? (
                      <button
                        onClick={() => {
                          onModelChange(revertModelClip(model, animation));
                          flash("Reverted to the AA library version");
                        }}
                        className="rounded border border-slate-300 px-2 py-0.5 text-xs hover:bg-slate-50"
                      >
                        Revert to library
                      </button>
                    ) : null}
                  </>
                ) : null}
              </div>

              {!clip ? (
                <p className="text-xs text-slate-500">
                  <code>{animation}</code> has no AA beat sheet. It is{" "}
                  {CLIP_USAGE[animation] ?? 0}× in content — the coverage panel
                  below lists what is worth authoring next.
                </p>
              ) : (
                <>
                  {clip.note ? (
                    <p className="mb-2 text-xs italic text-slate-600">{clip.note}</p>
                  ) : null}
                  <div className="mb-2 flex flex-wrap gap-1">
                    {clip.beats.map((b, i) => (
                      <button
                        key={b.frame}
                        onClick={() => {
                          setSelectedBeat(i);
                          setFrame(b.frame);
                          setPlaying(false);
                        }}
                        className={`rounded px-2 py-1 text-xs ${
                          selectedBeat === i
                            ? "bg-slate-900 text-white"
                            : "border border-slate-300 hover:bg-slate-50"
                        }`}
                      >
                        f{b.frame} · {b.role}
                      </button>
                    ))}
                  </div>
                  <BeatEditor
                    beat={clip.beats[selectedBeat]}
                    onEdit={(ch, key, value) => editBeat(selectedBeat, ch, key, value)}
                  />
                  {clip.loop && (selectedBeat === 0 || selectedBeat === clip.beats.length - 1) ? (
                    <p className="mt-2 rounded bg-slate-50 p-2 text-xs text-slate-600">
                      This is a loop endpoint — edits here are applied to the other
                      end too, or the clip would snap every cycle.
                    </p>
                  ) : null}
                </>
              )}

              {problems.length > 0 ? (
                <ul className="mt-2 space-y-1 text-xs">
                  {problems.map((p, i) => (
                    <li
                      key={i}
                      className={`rounded p-1.5 ${
                        p.level === "error" ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-900"
                      }`}
                    >
                      {p.message}
                    </li>
                  ))}
                </ul>
              ) : null}

              {analysis ? (
                <p className="mt-2 text-xs text-slate-500">{describeAnalysis(analysis)}</p>
              ) : null}

              {clip ? (
                <table className="mt-2 w-full text-xs">
                  <thead className="text-left text-slate-500">
                    <tr>
                      <th className="py-1">channel</th>
                      <th className="text-right">swing°</th>
                      <th className="text-right">budget°</th>
                      <th className="text-right">x px</th>
                      <th className="text-right">y px</th>
                    </tr>
                  </thead>
                  <tbody>
                    {AA_CHANNELS.filter((ch) => amplitude[ch]).map((ch) => {
                      const a = amplitude[ch];
                      const over = a.rot > AMPLITUDE_BUDGET[ch];
                      return (
                        <tr key={ch} className="border-t border-slate-100">
                          <td className="py-0.5 text-slate-600">{CHANNEL_LABELS[ch]}</td>
                          <td
                            className={`text-right tabular-nums ${over ? "font-semibold text-amber-700" : ""}`}
                          >
                            {a.rot.toFixed(1)}
                          </td>
                          <td className="text-right tabular-nums text-slate-400">
                            {AMPLITUDE_BUDGET[ch]}
                          </td>
                          <td className="text-right tabular-nums">{a.x.toFixed(1)}</td>
                          <td className="text-right tabular-nums">{a.y.toFixed(1)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : null}
            </section>
          )}

          <section className="rounded border border-slate-300 bg-white p-3">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold">Stance</h2>
              <span className="text-xs text-slate-500">
                the neutral pose every clip is a delta from — model-wide
              </span>
              {posesEqual(stance, NEUTRAL_STANCE) ? (
                <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                  rig neutral
                </span>
              ) : (
                <span className="rounded bg-sky-100 px-2 py-0.5 text-xs text-sky-900">
                  customised
                </span>
              )}
              <button
                onClick={() => {
                  setStance(undefined);
                  flash("Stance reset to the rig's neutral pose");
                }}
                className="rounded border border-slate-300 px-2 py-0.5 text-xs hover:bg-slate-50"
              >
                Reset to rig neutral
              </button>
              <button
                onClick={() => {
                  setStance(fittedStance(model.geometry));
                  flash("Foot spacing fitted to the torso — this MOVES the character");
                }}
                className="rounded border border-slate-300 px-2 py-0.5 text-xs hover:bg-slate-50"
                title="Widen the stance to match the torso width. Changes how the character stands."
              >
                Fit feet to geometry
              </button>
              {neckSeam !== null ? (
                <span
                  className={`ml-auto rounded px-2 py-0.5 text-xs tabular-nums ${
                    Math.abs(neckSeam) < 0.25
                      ? "bg-emerald-100 text-emerald-900"
                      : neckSeam > 0
                        ? "bg-amber-100 text-amber-900"
                        : "bg-slate-100 text-slate-600"
                  }`}
                  title="Head sprite's bottom edge vs the body sprite's top. Positive is a gap at the neck; negative is an overlap."
                >
                  neck seam {neckSeam > 0 ? "+" : ""}
                  {neckSeam.toFixed(2)}px{" "}
                  {Math.abs(neckSeam) < 0.25 ? "flush" : neckSeam > 0 ? "GAP" : "overlap"}
                </span>
              ) : null}
            </div>
            <p className="mb-2 text-xs text-slate-500">
              Defaults to each bone&apos;s own <code>defaultPos</code> — the pose
              the proportion controls were tuned against. Changing it restyles
              every clip at once, and moves an already-dialled-in character, so
              nudge rather than rewrite.
            </p>
            <BeatEditor
              beat={{ frame: 0, role: "rest", pose: stance }}
              onEdit={editStance}
            />
          </section>

          <section className="rounded border border-slate-300 bg-white p-3">
            <h2 className="mb-1 text-sm font-semibold">
              Coverage
              <span className="ml-2 text-xs font-normal text-slate-500">
                {(coverage.referenceShare * 100).toFixed(0)}% of clip references in{" "}
                <code>content/</code>
              </span>
            </h2>
            <p className="text-xs text-slate-600">
              <span className="font-medium">Authored:</span>{" "}
              {coverage.authored.map((c) => `${c.name}${c.uses ? ` ${c.uses}×` : ""}`).join(", ")}
            </p>
            {coverage.missing.length > 0 ? (
              <p className="mt-1 text-xs text-amber-800">
                <span className="font-medium">Still SPUM&apos;s motion:</span>{" "}
                {coverage.missing.map((c) => `${c.name} ${c.uses}×`).join(", ")}
              </p>
            ) : null}
          </section>
        </>
      )}
    </div>
  );
}

// Numeric pose editing for one beat. Deltas over stance+rest — an empty row is
// "this channel is at rest for this beat", which is the format's default and
// why the fields read 0 rather than the absolute pose.
function BeatEditor({
  beat,
  onEdit,
}: {
  beat: AaBeat;
  onEdit: (ch: AaChannel, key: "rot" | "x" | "y", value: number) => void;
}) {
  if (!beat) return null;
  return (
    <div>
      {beat.note ? <p className="mb-1 text-xs italic text-slate-500">{beat.note}</p> : null}
      <table className="w-full text-xs">
        <thead className="text-left text-slate-500">
          <tr>
            <th className="py-1">channel</th>
            <th className="text-right">rot°</th>
            <th className="text-right">x px</th>
            <th className="text-right">y px</th>
          </tr>
        </thead>
        <tbody>
          {AA_CHANNELS.map((ch) => {
            const v = channelAt(beat.pose, ch);
            return (
              <tr key={ch} className="border-t border-slate-100">
                <td className="py-0.5 text-slate-600">{CHANNEL_LABELS[ch]}</td>
                {(["rot", "x", "y"] as const).map((k) => (
                  <td key={k} className="py-0.5 text-right">
                    <input
                      type="number"
                      step={k === "rot" ? 1 : 0.1}
                      value={Number(v[k].toFixed(2))}
                      onChange={(e) => onEdit(ch, k, Number(e.target.value))}
                      className="w-16 rounded border border-slate-300 px-1 py-0.5 text-right tabular-nums"
                    />
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
