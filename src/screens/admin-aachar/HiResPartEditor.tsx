"use client";

// AA hi-res part editor — the transform panel for "as-is" imported parts.
// Phase 8 of docs/aachar-plan.md.
//
// Replaces PartCanvas in the Slots tab whenever the active part is hi-res.
// Placement is numbers-only: display size, offset from the anchor, smooth vs
// crisp. Because display size is just the atlas's `pixelDensity`, resizing is
// lossless and can be redone forever.
//
// Pixel editing DOES exist here, but at NATIVE resolution: pencil / eraser /
// eyedropper strokes write the imported original's own pixels (a 32px armory
// item edits its 32 native px, never a resampled copy), so touch-ups keep the
// lossless-resize property. Rotation is a live transform re-rendered from the
// unrotated pixels on every scrub (supersampled up to the atlas cap so pixel
// art stays crisp) and bakes only on stroke or save. What stays out by design
// is PartCanvas's sprite-grid machinery — regions, palette channels, onion —
// which only makes sense at logical resolution.
//
// NOTHING here writes back to what was imported: the draft is a pixel COPY,
// and Save creates/overwrites a part in the OPEN slot only (fresh drafts get
// a collision-free suggested name). Making a hat from an armory item never
// touches the item.
//
// The preview canvas shows the art against the model's own reference sprite
// (the head for head-worn slots, the torso for cloth), aligned the same way
// the pixel editors' onion is — including the head-offset correction that
// Phase 5d established (the slot's bone is NOT where the head sprite is).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { findPart, suggestPartName, upsertPart } from "@/lib/aachar/character";
import {
  MAX_HIRES_DIM,
  MAX_LOGICAL_HEIGHT,
  MIN_LOGICAL_HEIGHT,
  buildHiResAtlas,
  clampLogicalHeight,
  defaultLogicalHeight,
  hiResRegionName,
  readHiResAtlas,
  type HiResPlacement,
} from "@/lib/aachar/hires";
import type { HiResArt } from "@/lib/aachar/hiresImport";
import { loadImage } from "@/lib/aachar/imageIo";
import { regionBottomProfile } from "@/lib/aachar/pixels";
import { clearHatHairCache } from "@/lib/aachar/hatHairAtlas";
import { clearRecolorCache } from "@/lib/aachar/recolorAtlas";
import { clearShadeCache } from "@/lib/aachar/shadeAtlas";
import { headOffsetFromSlotAnchorPx } from "@/lib/aachar/slots";
import { hiResExtraRegionNames, stampArtOntoPart } from "@/lib/aachar/textMerge";
import { SLOT_LABEL, type AaModel, type AaPart, type AaSlot } from "@/lib/aachar/types";
import type { Skeleton, SpriteAtlas } from "@/lib/spum/types";

export type HiResDraft = {
  art: HiResArt;
  label: string;
  source: string;
  suggestedName: string;
  /** Explicit smooth default. When absent, the size heuristic below decides
   *  (small art is probably pixel art). Text drafts set it: system fonts are
   *  anti-aliased and want smooth; pixel fonts want crisp regardless of how
   *  many native px their canvas happens to span. */
  smooth?: boolean;
};

type Props = {
  slot: AaSlot;
  model: AaModel;
  onModelChange: (next: AaModel) => void;
  onPreview: (atlas: SpriteAtlas | null) => void;
  skeleton: Skeleton | null;
  /** Editing an already-saved hi-res part. Exactly one of this / `draft`. */
  savedPart?: AaPart;
  /** A fresh library import that hasn't been saved yet. */
  draft?: HiResDraft;
  /** The part that was active when the draft was created. When set, the
   *  draft can be STAMPED ONTO it (baked over its art, keeping its name and
   *  every region — the shirt stays) instead of becoming its own part. */
  mergeTarget?: AaPart | null;
  onSaved?: (name: string) => void;
  /** Fresh-draft cancel (a saved part just switches away instead). */
  onCancel?: () => void;
  /** The parts-picker panel, rendered above the controls. */
  children?: React.ReactNode;
};

// Which region of the model's own body sheet is the alignment reference.
const REFERENCE_REGION: Partial<Record<AaSlot, string>> = {
  hair: "Head",
  faceHair: "Head",
  helmet: "Head",
  cloth: "Body",
};

const CANVAS = 280;

// Native-pixel editing tools. "move" is the original drag-to-place; the rest
// stroke the work canvas directly.
type EditTool = "move" | "pencil" | "eraser" | "picker";
const MAX_UNDO = 40;

function cloneCanvas(src: HTMLCanvasElement): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = src.width;
  c.height = src.height;
  c.getContext("2d")?.drawImage(src, 0, 0);
  return c;
}

/** Axis-aligned bounding box of a w×h rect rotated by `deg`, same units. */
function rotatedBBox(w: number, h: number, deg: number): { bw: number; bh: number } {
  const rad = (deg * Math.PI) / 180;
  const c = Math.abs(Math.cos(rad));
  const s = Math.abs(Math.sin(rad));
  return { bw: w * c + h * s, bh: w * s + h * c };
}

export function HiResPartEditor({
  slot,
  model,
  onModelChange,
  onPreview,
  skeleton,
  savedPart,
  draft,
  mergeTarget,
  onSaved,
  onCancel,
  children,
}: Props) {
  const saved = savedPart ? readHiResAtlas(savedPart.atlas, slot) : null;
  // A merged part (text baked over a pixel sheet) is hi-res AND multi-region
  // — the single-region rebuild this panel's Save does would drop its extra
  // regions (a cloth's sleeves), so placement editing is locked for it.
  const multiRegion =
    !draft && savedPart !== undefined && hiResExtraRegionNames(savedPart.atlas, slot).length > 0;

  const [placement, setPlacement] = useState<HiResPlacement>(() =>
    saved
      ? { logicalHeight: saved.logicalHeight, dx: saved.dx, dy: saved.dy, smooth: saved.smooth }
      : {
          logicalHeight: defaultLogicalHeight(slot, model.geometry),
          dx: 0,
          dy: 0,
          // Small art is almost always pixel art — crisp by default; big art
          // is painterly and wants smooth scaling. A draft that knows better
          // (hi-res text) says so explicitly.
          smooth: draft?.smooth ?? (draft?.art.height ?? 0) > 64,
        },
  );
  const [name, setName] = useState(() =>
    savedPart ? savedPart.name : suggestPartName(model, slot, draft?.suggestedName ?? slot),
  );
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // The native PNG as a data URL — the preview and the save both need it. A
  // fresh draft arrives with one; a saved part fetches its canonical PNG once.
  const [art, setArt] = useState<HiResArt | null>(draft?.art ?? null);
  useEffect(() => {
    if (draft || !savedPart || !saved) return;
    let cancelled = false;
    fetch(savedPart.atlas.image)
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(`${r.status}`))))
      .then(
        (blob) =>
          new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = () => reject(new Error("read failed"));
            reader.readAsDataURL(blob);
          }),
      )
      .then((dataUrl) => {
        if (cancelled) return;
        setArt({ dataUrl, width: saved.nativeWidth, height: saved.nativeHeight });
      })
      .catch(() => !cancelled && setMessage("Could not load the part's PNG"));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedPart?.atlas.image, draft]);

  const flash = useCallback((text: string) => {
    setMessage(text);
    window.setTimeout(() => setMessage(null), 3000);
  }, []);

  const density = art ? art.height / placement.logicalHeight : 1;
  const logicalWidth = art ? art.width / density : 0;

  // Live rig preview — placement changes reach the animated character
  // immediately, before any save. `onPreview` rides a ref because the parent
  // passes an inline arrow: keying the unmount cleanup on its identity would
  // blank the preview on every render.
  const onPreviewRef = useRef(onPreview);
  onPreviewRef.current = onPreview;
  const previewAtlas = useMemo(() => {
    // A locked multi-region part previews as exactly what's on disk —
    // rebuilding it single-region here would blank its sleeves on the rig.
    if (multiRegion && savedPart) return savedPart.atlas;
    if (!art) return null;
    return buildHiResAtlas(slot, art.dataUrl, art.width, art.height, placement);
  }, [art, slot, placement, multiRegion, savedPart]);
  useEffect(() => {
    onPreviewRef.current(previewAtlas);
  }, [previewAtlas]);
  useEffect(() => () => onPreviewRef.current(null), []);

  // --- alignment canvas -------------------------------------------------

  const bodyPart = useMemo(
    () => model.parts.find((p) => p.slot === "body"),
    [model.parts],
  );
  const [refImg, setRefImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    const refName = REFERENCE_REGION[slot];
    if (!refName || !bodyPart) {
      setRefImg(null);
      return;
    }
    let cancelled = false;
    loadImage(bodyPart.atlas.image)
      .then((img) => !cancelled && setRefImg(img))
      .catch(() => !cancelled && setRefImg(null));
    return () => {
      cancelled = true;
    };
  }, [bodyPart, slot]);

  const [artImg, setArtImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!art) return;
    let cancelled = false;
    loadImage(art.dataUrl)
      .then((img) => !cancelled && setArtImg(img))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [art]);

  // --- native-pixel editing ---------------------------------------------

  const [tool, setTool] = useState<EditTool>("move");
  const [color, setColor] = useState("#1a1c2c");
  const [brush, setBrush] = useState(1);
  // The editable surface, holding the art's NATIVE pixels. Strokes mutate it
  // per mousemove; a state copy per frame would be pure waste, so repaints go
  // through `editTick` instead.
  const workRef = useRef<HTMLCanvasElement | null>(null);
  // The dataUrl the work canvas was last seeded from or committed to. Guards
  // the seeding effect below: our own commits change `art` too, and reseeding
  // on them would wipe the undo stack mid-session.
  const committedRef = useRef<string | null>(null);
  const undoRef = useRef<ImageData[]>([]);
  const redoRef = useRef<ImageData[]>([]);
  const paintingRef = useRef(false);
  const lastPtRef = useRef<{ nx: number; ny: number } | null>(null);
  const [editTick, setEditTick] = useState(0);
  // Rotation is a live TRANSFORM, not an edit: every angle re-renders from the
  // pre-rotation pixels (`rotBaseRef`), so scrubbing the slider never
  // compounds resampling and 0° restores the base exactly. It bakes — becomes
  // the new base — only when a stroke lands on it or the part is saved.
  const [angle, setAngle] = useState(0);
  const rotBaseRef = useRef<HTMLCanvasElement | null>(null);
  // The display height the BASE was shown at — rotation grows the bounding
  // box, and scaling logicalHeight by the same ratio keeps the art's on-rig
  // size constant while the numbers stay honest.
  const baseLogicalHRef = useRef<number | null>(null);
  const rotAppliedRef = useRef(false);
  // Set when a bake snaps the slider back to 0 — tells the rotation effect
  // that the work canvas already IS the new base, so it must not re-render.
  const bakingRef = useRef(false);
  const commitTimerRef = useRef<number | null>(null);

  // Seed the work canvas whenever new art arrives from OUTSIDE — a fresh
  // draft, or a saved part's PNG fetch. `artImg` is the decode of exactly
  // `art.dataUrl`, so drawing it captures the pixels 1:1.
  useEffect(() => {
    if (!art || !artImg || committedRef.current === art.dataUrl) return;
    const c = document.createElement("canvas");
    c.width = art.width;
    c.height = art.height;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(artImg, 0, 0);
    workRef.current = c;
    committedRef.current = art.dataUrl;
    undoRef.current = [];
    redoRef.current = [];
    rotBaseRef.current = cloneCanvas(c);
    baseLogicalHRef.current = null;
    rotAppliedRef.current = false;
    setAngle(0);
    setEditTick((t) => t + 1);
  }, [art, artImg]);

  // A finished stroke (or undo/redo) becomes the part's art: the save path and
  // the live rig preview both read `art.dataUrl`, so committing here is what
  // makes edits real everywhere at once.
  const commitEdit = useCallback(() => {
    const c = workRef.current;
    if (!c) return;
    const dataUrl = c.toDataURL("image/png");
    committedRef.current = dataUrl;
    // Dims come from the canvas — rotation changes them, strokes don't.
    setArt((a) => (a ? { dataUrl, width: c.width, height: c.height } : a));
  }, []);

  // Apply the rotation transform: render the base into a fresh work canvas.
  // Supersampled up to the atlas cap (`MAX_HIRES_DIM`) so a rotated pixel-art
  // item keeps crisp square pixels instead of being chewed through its own
  // 32px grid; smooth (painterly) art rotates with interpolation instead.
  // Commits on a short debounce so slider scrubbing doesn't re-encode a PNG
  // per tick — saves don't depend on the debounce, they read the work canvas.
  useEffect(() => {
    if (bakingRef.current) {
      bakingRef.current = false;
      return;
    }
    const base = rotBaseRef.current;
    if (!base || multiRegion) return;
    if (angle === 0) {
      if (!rotAppliedRef.current) return;
      rotAppliedRef.current = false;
      workRef.current = cloneCanvas(base);
      if (baseLogicalHRef.current != null) {
        const h = clampLogicalHeight(baseLogicalHRef.current);
        setPlacement((p) => ({ ...p, logicalHeight: h }));
      }
    } else {
      if (baseLogicalHRef.current == null) baseLogicalHRef.current = placement.logicalHeight;
      const { bw, bh } = rotatedBBox(base.width, base.height, angle);
      const ss = Math.max(1, Math.min(4, Math.floor(MAX_HIRES_DIM / Math.max(bw, bh))));
      const out = document.createElement("canvas");
      out.width = Math.max(1, Math.round(bw * ss));
      out.height = Math.max(1, Math.round(bh * ss));
      const ctx = out.getContext("2d");
      if (!ctx) return;
      ctx.imageSmoothingEnabled = placement.smooth;
      if (placement.smooth) ctx.imageSmoothingQuality = "high";
      ctx.translate(out.width / 2, out.height / 2);
      ctx.rotate((angle * Math.PI) / 180);
      ctx.scale(ss, ss);
      ctx.drawImage(base, -base.width / 2, -base.height / 2);
      // Strokes reuse this context after a bake — leave it untransformed.
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      workRef.current = out;
      rotAppliedRef.current = true;
      const h = clampLogicalHeight((baseLogicalHRef.current * bh) / base.height);
      setPlacement((p) => ({ ...p, logicalHeight: h }));
      // Stroke snapshots were taken at other dims/orientations — restoring
      // one under a live rotation would desync the base. Scrub to 0° to
      // un-rotate instead.
      undoRef.current = [];
      redoRef.current = [];
    }
    setEditTick((t) => t + 1);
    if (commitTimerRef.current != null) window.clearTimeout(commitTimerRef.current);
    commitTimerRef.current = window.setTimeout(commitEdit, 250);
    // placement.logicalHeight is deliberately not a dep — this effect WRITES
    // it; re-running on its own write would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [angle, placement.smooth, multiRegion, commitEdit]);

  useEffect(
    () => () => {
      if (commitTimerRef.current != null) window.clearTimeout(commitTimerRef.current);
    },
    [],
  );

  const pushUndo = useCallback(() => {
    const ctx = workRef.current?.getContext("2d");
    if (!workRef.current || !ctx) return;
    undoRef.current.push(ctx.getImageData(0, 0, workRef.current.width, workRef.current.height));
    if (undoRef.current.length > MAX_UNDO) undoRef.current.shift();
    redoRef.current = [];
  }, []);

  // Restores resize the canvas to the snapshot's dims — a bake changes the
  // work canvas size, and an ImageData knows its own.
  const restoreSnapshot = useCallback(
    (snap: ImageData) => {
      const c = workRef.current;
      if (!c) return;
      if (c.width !== snap.width || c.height !== snap.height) {
        c.width = snap.width;
        c.height = snap.height;
      }
      c.getContext("2d")?.putImageData(snap, 0, 0);
      // The stacks are cleared on rotation, so restores only ever run at 0° —
      // the restored pixels ARE the new rotation base.
      rotBaseRef.current = cloneCanvas(c);
      baseLogicalHRef.current = null;
      setEditTick((t) => t + 1);
      commitEdit();
    },
    [commitEdit],
  );

  const undoEdit = useCallback(() => {
    const c = workRef.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx || undoRef.current.length === 0) return;
    redoRef.current.push(ctx.getImageData(0, 0, c.width, c.height));
    restoreSnapshot(undoRef.current.pop()!);
  }, [restoreSnapshot]);

  const redoEdit = useCallback(() => {
    const c = workRef.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx || redoRef.current.length === 0) return;
    undoRef.current.push(ctx.getImageData(0, 0, c.width, c.height));
    restoreSnapshot(redoRef.current.pop()!);
  }, [restoreSnapshot]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "z") return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      e.preventDefault();
      if (e.shiftKey) redoEdit();
      else undoEdit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undoEdit, redoEdit]);

  // The stamp target's image, drawn as a ghost under the draft so the words
  // are placed against the actual shirt/hat rather than empty air.
  const [mergeImg, setMergeImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!draft || !mergeTarget) {
      setMergeImg(null);
      return;
    }
    let cancelled = false;
    loadImage(mergeTarget.atlas.image)
      .then((img) => !cancelled && setMergeImg(img))
      .catch(() => !cancelled && setMergeImg(null));
    return () => {
      cancelled = true;
    };
  }, [draft, mergeTarget]);

  // Zoom fits the art plus some room around the reference.
  const zoom = useMemo(() => {
    const extent = Math.max(
      placement.logicalHeight,
      logicalWidth,
      model.geometry.head.height + 16,
      Math.abs(placement.dy) * 2 + placement.logicalHeight,
      Math.abs(placement.dx) * 2 + logicalWidth,
    );
    return Math.max(2, Math.min(12, Math.floor((CANVAS - 20) / Math.max(1, extent))));
  }, [placement, logicalWidth, model.geometry.head.height]);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragRef = useRef<{ fromX: number; fromY: number; dx: number; dy: number } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, CANVAS, CANVAS);
    const c = 8;
    for (let y = 0; y < CANVAS; y += c) {
      for (let x = 0; x < CANVAS; x += c) {
        ctx.fillStyle = ((x / c + y / c) & 1) === 0 ? "#ffffff" : "#e2e8f0";
        ctx.fillRect(x, y, c, c);
      }
    }
    const ax = CANVAS / 2;
    const ay = CANVAS / 2;

    // Reference sprite, pivot-aligned to the anchor with the head-offset
    // correction (the head sprite does NOT sit at the slot's own bone).
    const refName = REFERENCE_REGION[slot];
    const region = refName && bodyPart ? bodyPart.atlas.regions[refName] : undefined;
    if (refImg && region) {
      const off =
        refName === "Head" ? headOffsetFromSlotAnchorPx(skeleton, slot) : { dx: 0, dy: 0 };
      const px = region.pivot?.x ?? 0.5;
      const py = region.pivot?.y ?? 0.5;
      const x = ax + off.dx * zoom - px * region.width * zoom;
      const y = ay + off.dy * zoom - (1 - py) * region.height * zoom;
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(
        refImg,
        region.x,
        region.y,
        region.width,
        region.height,
        x,
        y,
        region.width * zoom,
        region.height * zoom,
      );
      ctx.restore();
    }

    // The stamp target — the shirt/hat the draft will bake onto — at its own
    // saved placement (its routed region's pivot pins it to the anchor).
    if (mergeImg && mergeTarget) {
      const r = mergeTarget.atlas.regions[hiResRegionName(slot)];
      if (r) {
        const d = mergeTarget.atlas.pixelDensity ?? 1;
        const lw = (r.width / d) * zoom;
        const lh = (r.height / d) * zoom;
        const x = ax - r.pivot.x * lw;
        const y = ay - (1 - r.pivot.y) * lh;
        ctx.save();
        ctx.globalAlpha = 0.85;
        ctx.imageSmoothingEnabled = mergeTarget.atlas.smooth === true;
        ctx.drawImage(mergeImg, r.x, r.y, r.width, r.height, x, y, lw, lh);
        ctx.restore();
      }
    }

    // The art, centred at anchor + (dx, dy). Drawn from the WORK canvas when
    // one exists so in-flight strokes are visible; `artImg` covers the moment
    // before seeding. A locked multi-region part's whole-sheet PNG doesn't fit
    // this single-rect draw — its placement is locked anyway, so it simply
    // isn't drawn here.
    const artSrc: CanvasImageSource | null = workRef.current ?? artImg;
    if (artSrc && art && !multiRegion) {
      // Aspect from the work canvas when it exists — a live rotation resizes
      // it ahead of the debounced `art` commit.
      const dims = workRef.current ?? art;
      const h = placement.logicalHeight * zoom;
      const w = (dims.width / dims.height) * h;
      const x = ax + placement.dx * zoom - w / 2;
      const y = ay + placement.dy * zoom - h / 2;
      ctx.imageSmoothingEnabled = placement.smooth;
      if (placement.smooth) ctx.imageSmoothingQuality = "high";
      ctx.drawImage(artSrc, x, y, w, h);
      ctx.setLineDash([5, 3]);
      ctx.strokeStyle = "#f59e0b";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x, y, w, h);
      ctx.setLineDash([]);
    }

    // The anchor cross — where the bone is.
    ctx.strokeStyle = "#dc2626";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(ax - 5, ay);
    ctx.lineTo(ax + 5, ay);
    ctx.moveTo(ax, ay - 5);
    ctx.lineTo(ax, ay + 5);
    ctx.stroke();
  }, [
    refImg, artImg, art, placement, zoom, slot, bodyPart, skeleton, logicalWidth,
    mergeImg, mergeTarget, multiRegion, editTick,
  ]);

  // Mouse position → the art's own native pixel grid. The art is drawn at
  // logical size × zoom, centred at anchor + (dx, dy) — invert exactly that.
  // Dims come from the WORK canvas (a live rotation resizes it before the
  // debounced commit updates `art`).
  const toNativePx = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const dims = workRef.current ?? art;
    if (!canvas || !dims) return null;
    const r = canvas.getBoundingClientRect();
    const mx = ((e.clientX - r.left) / r.width) * CANVAS;
    const my = ((e.clientY - r.top) / r.height) * CANVAS;
    const h = placement.logicalHeight * zoom;
    const w = (dims.width / dims.height) * h;
    const x = CANVAS / 2 + placement.dx * zoom - w / 2;
    const y = CANVAS / 2 + placement.dy * zoom - h / 2;
    return {
      nx: Math.floor(((mx - x) / w) * dims.width),
      ny: Math.floor(((my - y) / h) * dims.height),
    };
  };

  const paintAt = (nx: number, ny: number) => {
    const ctx = workRef.current?.getContext("2d");
    if (!ctx) return;
    const half = Math.floor(brush / 2);
    if (tool === "eraser") ctx.clearRect(nx - half, ny - half, brush, brush);
    else {
      ctx.fillStyle = color;
      // Clear first so painting over semi-transparent pixels REPLACES them —
      // source-over on top of partial alpha would blend and leave halos.
      ctx.clearRect(nx - half, ny - half, brush, brush);
      ctx.fillRect(nx - half, ny - half, brush, brush);
    }
  };

  // Step from the last stroke point so fast mouse moves leave a line, not dots.
  const strokeTo = (nx: number, ny: number) => {
    const last = lastPtRef.current;
    if (!last) paintAt(nx, ny);
    else {
      const steps = Math.max(Math.abs(nx - last.nx), Math.abs(ny - last.ny), 1);
      for (let i = 1; i <= steps; i++) {
        paintAt(
          Math.round(last.nx + ((nx - last.nx) * i) / steps),
          Math.round(last.ny + ((ny - last.ny) * i) / steps),
        );
      }
    }
    lastPtRef.current = { nx, ny };
    setEditTick((t) => t + 1);
  };

  const pickColorAt = (nx: number, ny: number) => {
    const c = workRef.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx || nx < 0 || ny < 0 || nx >= c.width || ny >= c.height) return;
    const d = ctx.getImageData(nx, ny, 1, 1).data;
    if (d[3] === 0) return;
    setColor(`#${[d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, "0")).join("")}`);
    setTool("pencil");
  };

  const editing = tool !== "move" && !multiRegion && workRef.current !== null;

  const onCanvasDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (editing) {
      const p = toNativePx(e);
      if (!p) return;
      if (tool === "picker") {
        pickColorAt(p.nx, p.ny);
        return;
      }
      if (angle !== 0 && workRef.current) {
        // Bake the rotation: strokes edit what you SEE, and later rotations
        // start from the edited pixels. The slider snaps to 0 — the art is no
        // longer rotated relative to its (new) base.
        rotBaseRef.current = cloneCanvas(workRef.current);
        baseLogicalHRef.current = null;
        rotAppliedRef.current = false;
        bakingRef.current = true;
        setAngle(0);
      }
      pushUndo();
      paintingRef.current = true;
      lastPtRef.current = null;
      strokeTo(p.nx, p.ny);
      return;
    }
    dragRef.current = {
      fromX: e.clientX,
      fromY: e.clientY,
      dx: placement.dx,
      dy: placement.dy,
    };
  };
  const onCanvasMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (paintingRef.current) {
      const p = toNativePx(e);
      if (p) strokeTo(p.nx, p.ny);
      return;
    }
    const g = dragRef.current;
    if (!g) return;
    setPlacement((p) => ({
      ...p,
      dx: g.dx + Math.round((e.clientX - g.fromX) / zoom),
      dy: g.dy + Math.round((e.clientY - g.fromY) / zoom),
    }));
  };
  const onCanvasUp = () => {
    dragRef.current = null;
    if (paintingRef.current) {
      paintingRef.current = false;
      lastPtRef.current = null;
      commitEdit();
      // The edited pixels are the new rotation base — without this, a later
      // rotation would render from the pre-stroke art and lose the stroke.
      if (workRef.current) {
        rotBaseRef.current = cloneCanvas(workRef.current);
        baseLogicalHRef.current = null;
      }
    }
  };

  // --- save -------------------------------------------------------------

  const handleSave = useCallback(async () => {
    if (!art) return;
    if (!/^[A-Za-z][A-Za-z0-9]*$/.test(name)) {
      flash("Name must be letters/digits, starting with a letter");
      return;
    }
    setBusy(true);
    try {
      // Read straight from the work canvas when it exists: a rotation's
      // debounced commit may not have fired yet, and the canvas is always the
      // truth the user is looking at.
      const wc = workRef.current;
      const src = wc
        ? { dataUrl: wc.toDataURL("image/png"), width: wc.width, height: wc.height }
        : art;
      const atlas = buildHiResAtlas(slot, src.dataUrl, src.width, src.height, placement);
      const res = await fetch("/__aachar/save-part", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slot,
          name,
          pngBase64: src.dataUrl.split(",")[1],
          atlas,
        }),
      });
      const json = (await res.json()) as { ok: boolean; error?: string; partKey?: string };
      if (!json.ok) {
        flash(`Save failed: ${json.error}`);
        return;
      }
      // The helmet's underside per native column — the edge hair is masked
      // against (hatHair.ts converts by density). Measured from the art itself so
      // an imported hat masks exactly like a drawn one.
      let bottomProfile: Record<string, number[]> | undefined;
      if (slot === "helmet") {
        const c = wc ?? document.createElement("canvas");
        if (!wc && artImg) {
          c.width = src.width;
          c.height = src.height;
          const cctx = c.getContext("2d");
          if (cctx) {
            cctx.imageSmoothingEnabled = false;
            cctx.drawImage(artImg, 0, 0);
          }
        }
        const buf = c.getContext("2d")?.getImageData(0, 0, src.width, src.height).data;
        if (buf) {
          bottomProfile = {
            [hiResRegionName(slot)]: regionBottomProfile(buf, src.width, {
              x: 0,
              y: 0,
              width: src.width,
              height: src.height,
            }),
          };
        }
      }
      const source = draft?.source ?? savedPart?.source;
      const part: AaPart = {
        name,
        slot,
        atlas: { ...atlas, image: `/aachar/parts/${slot}/${json.partKey}.png` },
        ...(source ? { source } : {}),
        ...(bottomProfile ? { contentBottomProfile: bottomProfile } : {}),
      };
      // An overwrite keeps the same canonical URL, so recoloured/decoded
      // copies cached against it would be of the OLD pixels.
      clearRecolorCache();
      clearHatHairCache();
      clearShadeCache();
      onModelChange(upsertPart(model, part));
      onSaved?.(part.name);
      // Saving bakes any live rotation into the stored PNG — the slider
      // resets so the numbers match what's on disk.
      if (wc && angle !== 0) {
        rotBaseRef.current = cloneCanvas(wc);
        baseLogicalHRef.current = null;
        rotAppliedRef.current = false;
        bakingRef.current = true;
        setAngle(0);
        undoRef.current = [];
        redoRef.current = [];
      }
      committedRef.current = src.dataUrl;
      setArt(src);
      flash(`Saved ${json.partKey}`);
    } catch (err) {
      flash(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }, [art, artImg, name, slot, placement, angle, draft, savedPart, model, onModelChange, onSaved, flash]);

  // Bake the draft OVER the merge target: the target's art stays, the draft
  // lands on top (clipped to the routed region), and the part keeps its name
  // and every other field — channels, protection, provenance.
  const handleStampOnto = useCallback(async () => {
    if (!art || !draft || !mergeTarget) return;
    setBusy(true);
    try {
      // Same work-canvas read as Save — edits and live rotation stamp as seen.
      const wc = workRef.current;
      const src = wc
        ? { dataUrl: wc.toDataURL("image/png"), width: wc.width, height: wc.height }
        : art;
      const merged = await stampArtOntoPart(mergeTarget, slot, src, placement);
      const res = await fetch("/__aachar/save-part", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slot,
          name: mergeTarget.name,
          pngBase64: merged.dataUrl.split(",")[1],
          atlas: merged.atlas,
        }),
      });
      const json = (await res.json()) as { ok: boolean; error?: string; partKey?: string };
      if (!json.ok) {
        flash(`Save failed: ${json.error}`);
        return;
      }
      // Helmet underside re-measured from the MERGED pixels — the stamp may
      // hang below the old brim, and hair masks against this edge.
      let bottomProfile: Record<string, number[]> | undefined;
      if (slot === "helmet") {
        const img = await loadImage(merged.dataUrl);
        const c = document.createElement("canvas");
        c.width = merged.width;
        c.height = merged.height;
        const ctx = c.getContext("2d");
        const region = merged.atlas.regions[hiResRegionName(slot)];
        if (ctx && region) {
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(img, 0, 0);
          const buf = ctx.getImageData(0, 0, merged.width, merged.height).data;
          bottomProfile = {
            [hiResRegionName(slot)]: regionBottomProfile(buf, merged.width, region),
          };
        }
      }
      const part: AaPart = {
        ...mergeTarget,
        atlas: { ...merged.atlas, image: `/aachar/parts/${slot}/${json.partKey}.png` },
        ...(bottomProfile ? { contentBottomProfile: bottomProfile } : {}),
      };
      clearRecolorCache();
      clearHatHairCache();
      clearShadeCache();
      onModelChange(upsertPart(model, part));
      onSaved?.(part.name);
      flash(`Stamped onto ${json.partKey}`);
    } catch (err) {
      flash(err instanceof Error ? err.message : "Stamp failed");
    } finally {
      setBusy(false);
    }
  }, [art, draft, mergeTarget, slot, placement, model, onModelChange, onSaved, flash]);

  const overwriting = !savedPart && findPart(model, slot, name) !== undefined;

  return (
    <div className="flex flex-wrap gap-4">
      <div className="w-72 shrink-0 space-y-3">
        {children}

        <section className="rounded border border-emerald-300 bg-white p-3">
          <h2 className="mb-1 text-sm font-semibold">
            {draft ? "Import as-is" : "Hi-res part"}
            <span className="ml-2 rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-normal text-emerald-800">
              original pixels
            </span>
          </h2>
          <p className="mb-2 text-xs text-slate-500">
            {draft ? (
              <>
                <strong>{draft.label}</strong> — {draft.art.width}×{draft.art.height}px native.
              </>
            ) : (
              <>
                {savedPart?.source ? <code>{savedPart.source}</code> : "imported art"} —{" "}
                {saved?.nativeWidth}×{saved?.nativeHeight}px native.
              </>
            )}{" "}
            Resizing only changes a number — nothing is ever resampled.
          </p>

          <label className="block text-xs text-slate-600">
            Display height <strong>{placement.logicalHeight}px</strong>
            {art ? (
              <span className="text-slate-400">
                {" "}
                ({logicalWidth.toFixed(1)}px wide · {density.toFixed(2)}× density)
              </span>
            ) : null}
          </label>
          <input
            type="range"
            min={MIN_LOGICAL_HEIGHT}
            max={MAX_LOGICAL_HEIGHT}
            value={placement.logicalHeight}
            disabled={multiRegion}
            onChange={(e) => {
              const v = clampLogicalHeight(Number(e.target.value));
              // A manual height change under a live rotation re-anchors the
              // base height, so scrubbing the angle afterwards keeps THIS
              // size instead of snapping back to the pre-rotation one.
              if (angle !== 0 && rotBaseRef.current) {
                const b = rotBaseRef.current;
                const { bh } = rotatedBBox(b.width, b.height, angle);
                baseLogicalHRef.current = (v * b.height) / bh;
              }
              setPlacement((p) => ({ ...p, logicalHeight: v }));
            }}
            className="w-full"
          />
          {multiRegion ? (
            <p className="mt-1 rounded bg-amber-100 px-2 py-1 text-xs text-amber-900">
              This part has art stamped over a multi-region sheet (sleeves
              stay with it), so placement editing and Save are locked here —
              re-saving would drop those regions. To change it, re-stamp onto
              it or redraw from the pixel part it came from.
            </p>
          ) : null}

          <div className="mt-1 flex items-center gap-1 text-xs text-slate-600">
            Offset
            <input
              type="number"
              value={placement.dx}
              disabled={multiRegion}
              onChange={(e) => setPlacement((p) => ({ ...p, dx: Math.round(Number(e.target.value) || 0) }))}
              className="w-14 rounded border border-slate-300 px-1 py-0.5"
            />
            <input
              type="number"
              value={placement.dy}
              disabled={multiRegion}
              onChange={(e) => setPlacement((p) => ({ ...p, dy: Math.round(Number(e.target.value) || 0) }))}
              className="w-14 rounded border border-slate-300 px-1 py-0.5"
            />
            <span className="text-slate-400">px (+x right, +y down)</span>
          </div>

          <label className="mt-2 block text-xs text-slate-600">
            Rotate <strong>{angle}°</strong>
            {angle !== 0 ? (
              <span className="text-slate-400"> — live; re-rendered from the unrotated pixels</span>
            ) : null}
          </label>
          <div className="flex items-center gap-1">
            <input
              type="range"
              min={-180}
              max={180}
              value={angle}
              disabled={multiRegion}
              onChange={(e) => setAngle(Math.round(Number(e.target.value)))}
              className="w-full"
            />
            <input
              type="number"
              value={angle}
              disabled={multiRegion}
              onChange={(e) =>
                setAngle(Math.max(-180, Math.min(180, Math.round(Number(e.target.value) || 0))))
              }
              className="w-14 rounded border border-slate-300 px-1 py-0.5 text-xs"
            />
            <button
              onClick={() => setAngle(0)}
              disabled={multiRegion || angle === 0}
              className="rounded border border-slate-300 px-2 py-0.5 text-xs hover:bg-slate-50 disabled:opacity-40"
            >
              0°
            </button>
          </div>
          <p className="mt-0.5 text-xs text-slate-400">
            Scrub freely — nothing compounds, and 0° restores the original
            exactly. The rotation bakes into the pixels only when you draw on
            it or Save.
          </p>

          <label className="mt-2 flex items-center gap-2 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={placement.smooth}
              disabled={multiRegion}
              onChange={(e) => setPlacement((p) => ({ ...p, smooth: e.target.checked }))}
            />
            Smooth scaling (off = crisp pixels)
          </label>

          {draft && mergeTarget ? (
            <div className="mt-2 rounded border border-amber-300 bg-amber-50 p-2">
              <button
                onClick={handleStampOnto}
                disabled={!art || busy}
                className="rounded bg-amber-600 px-2 py-1 text-sm text-white hover:bg-amber-700 disabled:opacity-40"
              >
                {busy ? "Saving…" : `Stamp onto ${mergeTarget.name}`}
              </button>
              <p className="mt-1 text-xs text-amber-900">
                Bakes this over <code>{mergeTarget.name}</code> at high
                resolution — the existing art stays underneath (the ghost in
                the canvas), clipped to its {hiResRegionName(slot)} region.
                Or save it as its own part below.
              </p>
            </div>
          ) : null}

          <div className="mt-2 flex items-center gap-1">
            <span className="text-xs text-slate-500">AA_</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-28 rounded border border-slate-300 px-1 py-0.5 text-sm"
            />
            <button
              onClick={handleSave}
              disabled={!art || busy || multiRegion}
              className="rounded bg-emerald-700 px-2 py-1 text-sm text-white hover:bg-emerald-800 disabled:opacity-40"
            >
              {busy ? "Saving…" : "Save"}
            </button>
            {draft && onCancel ? (
              <button
                onClick={onCancel}
                className="rounded border border-slate-300 px-2 py-1 text-sm hover:bg-slate-50"
              >
                Cancel
              </button>
            ) : null}
          </div>
          {draft ? (
            <p className="mt-1 text-xs text-emerald-700">
              Save creates a part of its own in this slot — the library art
              you picked is a copy and is never modified.
            </p>
          ) : null}
          {overwriting ? (
            <p className="mt-1 text-xs text-amber-700">
              A part named <code>{name}</code> already exists in this slot — Save overwrites it.
            </p>
          ) : null}
          {slot === "cloth" ? (
            <p className="mt-2 text-xs text-slate-500">
              A hi-res clothing part covers the <strong>torso only</strong> —
              the sleeve regions stay empty. Use the pixel canvas for cloth
              with sleeves.
            </p>
          ) : null}
          <p className="mt-2 text-xs text-slate-500">
            Draw / Erase edit the imported PNG&apos;s own pixels at native
            resolution — Save writes the edited art. Characters can still
            adjust hue / saturation / brightness / contrast per slot; palette
            channel tagging is pixel-art-only.
          </p>
          {message ? (
            <p className="mt-2 rounded bg-amber-100 px-2 py-1 text-xs text-amber-900">{message}</p>
          ) : null}
        </section>
      </div>

      <div className="flex-1">
        {!multiRegion ? (
          <div className="mb-2 flex flex-wrap items-center gap-1">
            {(
              [
                ["move", "✋ Move"],
                ["pencil", "✏️ Draw"],
                ["eraser", "🧹 Erase"],
                ["picker", "💉 Pick"],
              ] as const
            ).map(([t, label]) => (
              <button
                key={t}
                onClick={() => setTool(t)}
                disabled={t !== "move" && !workRef.current}
                className={`rounded px-2 py-1 text-xs ${
                  tool === t ? "bg-slate-900 text-white" : "bg-slate-100 hover:bg-slate-200"
                } disabled:opacity-40`}
              >
                {label}
              </button>
            ))}
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              title="Draw colour"
              className="h-7 w-9 cursor-pointer rounded border border-slate-300"
            />
            <label className="ml-1 flex items-center gap-1 text-xs text-slate-600">
              brush {brush}px
              <input
                type="range"
                min={1}
                max={art ? Math.max(4, Math.min(32, Math.round(art.width / 8))) : 4}
                value={brush}
                onChange={(e) => setBrush(Math.max(1, Math.round(Number(e.target.value))))}
                className="w-20"
              />
            </label>
            <button
              onClick={undoEdit}
              className="rounded bg-slate-100 px-2 py-1 text-xs hover:bg-slate-200"
              title="Undo (Ctrl+Z)"
            >
              ↩ Undo
            </button>
            <button
              onClick={redoEdit}
              className="rounded bg-slate-100 px-2 py-1 text-xs hover:bg-slate-200"
              title="Redo (Ctrl+Shift+Z)"
            >
              ↪
            </button>
          </div>
        ) : null}
        <div className="inline-block rounded border border-slate-300 bg-white p-3">
          <canvas
            ref={canvasRef}
            width={CANVAS}
            height={CANVAS}
            onMouseDown={onCanvasDown}
            onMouseMove={onCanvasMove}
            onMouseUp={onCanvasUp}
            onMouseLeave={onCanvasUp}
            className={editing ? "cursor-crosshair" : "cursor-move"}
          />
        </div>
        <p className="mt-2 max-w-md text-xs text-slate-500">
          {editing
            ? "Drawing on the ORIGINAL pixels at native resolution — strokes land on the art itself, and the rig preview updates when you release."
            : "Drag the art to place it."}{" "}
          The red cross is the anchor (where the bone
          is); the ghost is your own {REFERENCE_REGION[slot] === "Body" ? "torso" : "head"}
          {REFERENCE_REGION[slot] ? ", aligned exactly as the rig will align it" : ""}.
          The rig preview on the right plays every change live.
        </p>
      </div>
    </div>
  );
}
