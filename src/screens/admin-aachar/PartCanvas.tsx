"use client";

// AA part canvas — the pixel editor shared by the Body and Slots tabs.
//
// Everything here is slot-agnostic: the working buffer, undo/redo, the tools,
// re-pack migration, hydration from a saved part, onion compositing, and the
// save round-trip. What differs per slot (how the sheet is shaped, what the
// onion reads from, geometry controls) is passed in.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { upsertPart } from "@/lib/aachar/character";
import { sheetToAtlas, type PackedSheet } from "@/lib/aachar/geometry";
import {
  atlasPivots,
  atlasToSheet,
  bufferToCanvas,
  bufferToDataUrl,
  imageToBuffer,
  loadImage,
} from "@/lib/aachar/imageIo";
import {
  compositeOnion,
  type OnionMapping,
  type OnionSource,
} from "@/lib/aachar/onion";
import {
  blitRect,
  centredRect,
  clearRect,
  copyRect,
  createBuffer,
  floodFill,
  getPixel,
  hexToRgba,
  intersectRect,
  isRegionEmpty,
  migratePixels,
  pivotAnchor,
  rectContains,
  rectFromDrag,
  regionAt,
  regionBottomProfile,
  rgbaToHex,
  rotateBuffer,
  setPixel,
  type PivotMap,
  type Rgba,
} from "@/lib/aachar/pixels";
import type { PackedRegion } from "@/lib/aachar/geometry";
import {
  DEFAULT_IMPORT_OPTIONS,
  isSvgFile,
  prepareArt,
  type ImportOptions,
  type PreparedArt,
} from "@/lib/aachar/importArt";
import { normalizeHex, paletteOf, toggleRampColor } from "@/lib/aachar/recolor";
import { fontById, PIXEL_FONTS, renderText } from "@/lib/pixeltext";
import { clearHatHairCache } from "@/lib/aachar/hatHairAtlas";
import { clearRecolorCache } from "@/lib/aachar/recolorAtlas";
import { clearShadeCache } from "@/lib/aachar/shadeAtlas";
import { detectEyeBoxes } from "@/lib/aachar/gaze";
import { clearGazeCache } from "@/lib/aachar/gazeAtlas";
import { isShapeTool, shapeToolPixels, type ShapeDrag, type ShapeTool } from "@/lib/aachar/shapes";
import { FREE_EYE_HALF_REGION } from "@/lib/aachar/slots";
import { FREE_EYE_CLOSE_REGION, FREE_EYE_REGION } from "@/lib/spum/freeEye";
import {
  SLOT_LABEL,
  type AaColorChannel,
  type AaEyeBox,
  type AaGeometry,
  type AaModel,
  type AaPart,
  type AaPartEyes,
  type AaProtect,
  type AaSlot,
} from "@/lib/aachar/types";
import type { SpriteAtlas } from "@/lib/spum/types";

import { ColorChannels } from "./ColorChannels";

const PALETTE = [
  "#1a1c2c", "#5d275d", "#b13e53", "#ef7d57", "#ffcd75", "#a7f070",
  "#38b764", "#257179", "#29366f", "#3b5dc9", "#41a6f6", "#73eff7",
  "#f4f4f4", "#94b0c2", "#566c86", "#333c57", "#e8c39e", "#c9976d",
];

const MAX_UNDO = 60;

type Tool = "pencil" | "eraser" | "fill" | "pick" | "select" | "tag" | ShapeTool;
const TOOLS: Tool[] = [
  "pencil", "eraser", "fill", "pick", "select", "tag", "rect", "ellipse", "circle",
];

// A live selection. `region` is the region it was made in — a selection can't
// be dragged out of its own sprite, same rule fill and shapes follow.
type Selection = PackedRegion & { region: string };

// State while a selection is being dragged. `base` is the buffer with the
// selection lifted out and `floating` is what was lifted, so every mousemove
// recomposites from a clean base — dragging back and forth is exact, not a
// pile of accumulated blits.
type SelectionDrag = {
  base: Uint8ClampedArray;
  floating: Uint8ClampedArray;
  origin: Selection;
  fromX: number;
  fromY: number;
  /** The rotation session's centre when the move began, so it can follow. */
  rotFrom: { cx: number; cy: number } | null;
};

// The rotation handle, in SCREEN pixels: how far past the selection's right
// edge it sits, and how big a target it is.
const HANDLE_GAP = 16;
const HANDLE_R = 7;
// Shift snaps to this many degrees — 90° turns and the diagonals are what a
// rotation is usually reaching for, and a 21px-wide sprite can't express much
// finer than 15° anyway.
const SNAP_DEG = 15;

// The source a rotation turns. Held for as long as a selection survives
// untouched, so a second drag re-rotates the ORIGINAL pixels by a cumulative
// angle rather than re-rotating the previous result — nearest-neighbour
// resampling is lossy, and chaining it eats a small sprite alive.
//
// `cx`/`cy` are the centre in sheet coordinates (fractional, never rounded),
// which is what keeps repeated rotations from walking the art off its own
// centre. A move carries them along; anything else drops the source.
type RotateSource = {
  pixels: Uint8ClampedArray;
  width: number;
  height: number;
  region: string;
  cx: number;
  cy: number;
  angle: number;
};

// A rotation drag in flight. `base` is the buffer with the current stamp
// lifted out, same trick the move drag uses. `pointerFrom` is the pointer's
// angle at mousedown, so grabbing the handle never snaps the art to the
// cursor — only the delta counts.
type SelectionRotate = {
  base: Uint8ClampedArray;
  source: RotateSource;
  pointerFrom: number;
  angle: number;
  /** Handle distance from the centre, in sheet px, frozen at mousedown. */
  radius: number;
  /** Which way the handle rests — 0 for right, π for a flip to the left. */
  baseAngle: number;
};

// `region` is captured at mousedown so a shape is clipped to where it STARTED —
// dragging past a boundary trims it rather than bleeding into a neighbour.
type ShapeState = ShapeDrag & { region: string };

// An import that has landed but not been committed. It floats over the canvas
// until "Place", so it can be scaled and dragged first — a sprite is 20-odd
// pixels tall, and "letterboxed into the region" is only ever the right answer
// for art drawn to that exact box. Everything else needs to be smaller than the
// region and sat somewhere specific in it.
//
// `scale` is relative to the region: 1 fits it (what a plain import did), 0.5 is
// half of it, 2 overflows and gets clipped. The art is RE-RENDERED from the
// decoded original at every scale — never resampled from a previous render — so
// scrubbing the slider costs nothing in quality.
//
// A TEXT draft rides the same machinery (same drag / nudge / Place / Esc), but
// its pixels come from `renderText` over a live spec instead of a decoded file
// — editing the text or the font re-renders the floating art in place. See
// docs/pixel-text.md.
type ImportDraft =
  | { kind: "file"; file: File; region: string; scale: number }
  | { kind: "text"; region: string };
type DraftArt = { pixels: Uint8ClampedArray; width: number; height: number };

// The live spec a text draft renders from. `scale` here is an INTEGER pixel
// multiplier (bitmap fonts only scale losslessly by whole numbers), unlike the
// region-relative scale a file draft uses.
type TextSpec = {
  text: string;
  fontId: string;
  scale: number;
  color: string;
  outline: boolean;
  outlineColor: string;
  slant: boolean;
  letterSpacing: number;
};

const DEFAULT_TEXT_SPEC: TextSpec = {
  text: "",
  fontId: "micro",
  scale: 1,
  color: "#f4f4f4",
  outline: false,
  outlineColor: "#1a1c2c",
  slant: false,
  letterSpacing: 1,
};

/** What the canvas actually reads off a saved part — a structural subset of
 *  `AaPart` so non-wardrobe art (the AA horse's `AaHorsePart`) can hydrate
 *  the same editor without pretending to have a wardrobe slot. */
export type PartCanvasSavedArt = Pick<
  AaPart,
  "name" | "atlas" | "colorChannels" | "protect" | "eyes"
>;

type Props = {
  /** `"horse"` is the plugin-only slot (docs/aachar-horse-plan.md H4): the
   *  save endpoint accepts it and files PNGs under `parts/horse/`, but the
   *  part record goes through `onPersist`, never into `model.parts`. */
  slot: AaSlot | "horse";
  sheet: PackedSheet;
  pivots?: PivotMap;
  model: AaModel;
  onModelChange: (next: AaModel) => void;
  onPreview: (atlas: SpriteAtlas | null) => void;
  /** Saved part for this slot, if any — hydrates the canvas. */
  savedPart?: PartCanvasSavedArt;
  /** When present, a successful save is handed to the PARENT to register
   *  (the AA horse tab upserts into `model.horse.parts`) instead of the
   *  default `upsertPart` into the character wardrobe. The PNG/atlas write
   *  to disk happens either way. */
  onPersist?: (saved: { name: string; atlas: SpriteAtlas }) => void;
  /** Initial pixel zoom. The 14× default suits the small character sheets;
   *  a wide sheet (the 77px horse) wants less or the canvas wraps offscreen. */
  defaultZoom?: number;
  /** Stamped on save so the part can later be detected as stale (I3). */
  authoredFor?: AaGeometry;
  onion: OnionSource | null;
  onionMapping?: OnionMapping;
  onionLabel: string;
  defaultName: string;
  /** Fired after a successful save so the parent can select the saved part. */
  onSaved?: (name: string) => void;
  /** A file handed in from outside (the library browser's Pixelate mode) —
   *  lands as a floating draft exactly as if picked via "Import into…".
   *  `token` marks each hand-off so the same file can be re-imported. */
  externalFile?: { file: File; token: number } | null;
  /** Slot-specific controls (geometry, sizes) rendered above the tools. */
  children?: React.ReactNode;
};

export function PartCanvas({
  slot,
  sheet,
  pivots,
  model,
  onModelChange,
  onPreview,
  savedPart,
  onPersist,
  defaultZoom,
  authoredFor,
  onion,
  onionMapping,
  onionLabel,
  defaultName,
  onSaved,
  externalFile,
  children,
}: Props) {
  const [tool, setTool] = useState<Tool>("pencil");
  const [color, setColor] = useState("#1a1c2c");
  const [zoom, setZoom] = useState(defaultZoom ?? 14);
  const [onionOn, setOnionOn] = useState(true);
  const [onionOpacity, setOnionOpacity] = useState(0.35);
  const [selectedRegion, setSelectedRegion] = useState<string>(
    () => Object.keys(sheet.regions)[0] ?? "",
  );
  const [partName, setPartName] = useState(defaultName);
  const [message, setMessage] = useState<string | null>(null);
  const [filled, setFilled] = useState(false);
  const [shape, setShape] = useState<ShapeState | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [marquee, setMarquee] = useState<ShapeState | null>(null);
  const [, forceRender] = useState(0);
  const selDragRef = useRef<SelectionDrag | null>(null);
  const rotSourceRef = useRef<RotateSource | null>(null);
  const rotDragRef = useRef<SelectionRotate | null>(null);
  // Mirrored into state purely so the panel can show the angle; the drag itself
  // reads the ref.
  const [rotAngle, setRotAngle] = useState(0);
  // Recolourable palette groups (see ColorChannels). Held here rather than in
  // the panel because they're saved with the part and the `tag` tool writes to
  // them from the canvas.
  const [channels, setChannels] = useState<AaColorChannel[]>(
    () => savedPart?.colorChannels ?? [],
  );
  const [protect, setProtect] = useState<AaProtect | undefined>(
    () => savedPart?.protect,
  );
  const [armed, setArmed] = useState<string | null>(null);
  const [testColor, setTestColor] = useState("#3b5dc9");
  const [importOpts, setImportOpts] = useState<ImportOptions>(DEFAULT_IMPORT_OPTIONS);
  const importRef = useRef<HTMLInputElement | null>(null);
  const [draft, setDraft] = useState<ImportDraft | null>(null);
  const [textSpec, setTextSpec] = useState<TextSpec>(DEFAULT_TEXT_SPEC);
  // Offset is separate state from the draft so dragging it doesn't re-render
  // the art — position is free, resampling is not.
  const [draftOffset, setDraftOffset] = useState({ dx: 0, dy: 0 });
  const [draftArt, setDraftArt] = useState<DraftArt | null>(null);
  const [replaceRegion, setReplaceRegion] = useState(true);
  const preparedRef = useRef<PreparedArt | null>(null);
  const [prepared, setPrepared] = useState(0);
  const draftDragRef = useRef<{ fromX: number; fromY: number; dx: number; dy: number } | null>(null);

  // Pixels live in a ref: a stroke mutates them every mousemove, and copying
  // the buffer into React state per frame would be pure waste.
  const pixelsRef = useRef<Uint8ClampedArray>(createBuffer(sheet.width, sheet.height));
  const sheetRef = useRef<PackedSheet>(sheet);
  // Pivots are tracked alongside the sheet because the headroom control moves
  // one without resizing anything, and the migration has to know where the
  // anchor WAS to keep the art pinned to it.
  const pivotsRef = useRef<PivotMap>(pivots ?? {});
  const undoRef = useRef<Uint8ClampedArray[]>([]);
  const redoRef = useRef<Uint8ClampedArray[]>([]);
  const drawingRef = useRef(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const flash = useCallback((text: string) => {
    setMessage(text);
    window.setTimeout(() => setMessage(null), 3000);
  }, []);

  const repaint = useCallback(() => forceRender((n) => n + 1), []);
  const isBlank = useCallback(() => !pixelsRef.current.some((v) => v !== 0), []);

  const pushUndo = useCallback(() => {
    undoRef.current.push(new Uint8ClampedArray(pixelsRef.current));
    if (undoRef.current.length > MAX_UNDO) undoRef.current.shift();
    redoRef.current = [];
  }, []);

  // Sheet or pivot change → migrate pixels anchor-aligned. This is why
  // proportions, canvas sizes and headroom can be explored without redrawing.
  useEffect(() => {
    const prev = sheetRef.current;
    const prevPivots = pivotsRef.current;
    const next = pivots ?? {};
    const same =
      prev.width === sheet.width &&
      prev.height === sheet.height &&
      Object.keys(sheet.regions).every((n) => {
        const a = prev.regions[n];
        const b = sheet.regions[n];
        return a && b && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
      }) &&
      JSON.stringify(prevPivots) === JSON.stringify(next);
    if (same) return;
    undoRef.current.push(new Uint8ClampedArray(pixelsRef.current));
    if (undoRef.current.length > MAX_UNDO) undoRef.current.shift();
    redoRef.current = [];
    pixelsRef.current = migratePixels(pixelsRef.current, prev, sheet, prevPivots, next);
    sheetRef.current = sheet;
    pivotsRef.current = next;
    if (!sheet.regions[selectedRegion]) {
      setSelectedRegion(Object.keys(sheet.regions)[0] ?? "");
    }
    repaint();
    publishPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheet, pivots, repaint, selectedRegion]);

  const publishPreview = useCallback(() => {
    const url = bufferToDataUrl(pixelsRef.current, sheet.width, sheet.height);
    onPreview(sheetToAtlas(sheet, url, pivots));
  }, [sheet, pivots, onPreview]);

  useEffect(() => {
    publishPreview();
    return () => onPreview(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheet]);

  // Hydrate from the saved part so the canvas survives tab switches and page
  // reloads. Goes through `migratePixels`, so reopening a part authored against
  // older geometry realigns it — the repair path for a stale part (I3).
  // Only ever fills a BLANK canvas, so unsaved work is never clobbered.
  const hydratedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!savedPart) return;
    const token = `${savedPart.name}|${savedPart.atlas.image}`;
    if (hydratedRef.current === token || !isBlank()) return;
    let cancelled = false;
    loadImage(savedPart.atlas.image)
      .then((img) => {
        if (cancelled || !isBlank()) return;
        // Claimed on SUCCESS, not before the load: StrictMode runs effects
        // twice in dev, so claiming up front meant run #1 took the token then
        // got cancelled and run #2 bailed — the canvas never hydrated.
        hydratedRef.current = token;
        const from = atlasToSheet(savedPart.atlas);
        pixelsRef.current = migratePixels(
          imageToBuffer(img, from.width, from.height),
          from,
          sheetRef.current,
          // The part's OWN pivots on the way in, the canvas's on the way out —
          // a part drawn with headroom lands anchor-on-anchor even if the slot
          // control hasn't adopted its headroom yet.
          atlasPivots(savedPart.atlas),
          pivotsRef.current,
        );
        setPartName(savedPart.name);
        repaint();
        publishPreview();
        flash(`Loaded "${savedPart.name}"`);
      })
      .catch(() => {
        if (!cancelled) flash(`Could not load "${savedPart.name}"`);
      });
    return () => {
      cancelled = true;
    };
  }, [savedPart, isBlank, repaint, publishPreview, flash]);

  // Colour channels hydrate on their own rather than riding the effect above:
  // that one only ever fills a BLANK canvas (so unsaved work is never
  // clobbered), which would leave a part opened with art already on screen
  // showing no tags. Keyed on the part NAME, so re-saving the same part — which
  // hands back a new object carrying the channels we just wrote — doesn't
  // bounce them back.
  const channelsFromRef = useRef<string | null>(savedPart?.name ?? null);
  useEffect(() => {
    if (!savedPart || channelsFromRef.current === savedPart.name) return;
    channelsFromRef.current = savedPart.name;
    setChannels(savedPart.colorChannels ?? []);
    setProtect(savedPart.protect);
    setArmed(null);
  }, [savedPart]);

  // Toggle a colour into (or out of) the armed channel. Shared by the `tag`
  // tool and the palette swatches so the two can't disagree about what tagging
  // means.
  const tagColor = useCallback(
    (hex: string) => {
      const h = normalizeHex(hex);
      setChannels((prev) => {
        const channel = prev.find((c) => c.id === armed);
        if (!channel) return prev;
        const next = toggleRampColor(channel, h);
        return next
          ? prev.map((c) => (c.id === channel.id ? next : c))
          : prev.filter((c) => c.id !== channel.id);
      });
    },
    [armed],
  );

  // A selection is meaningless once the tool or the sheet layout changes.
  useEffect(() => {
    setSelection(null);
    setMarquee(null);
    selDragRef.current = null;
    rotDragRef.current = null;
    rotSourceRef.current = null;
    setRotAngle(0);
  }, [tool, sheet]);

  const onionCanvas = useMemo(
    () => (onion ? compositeOnion(sheet, onion, pivots, onionMapping) : null),
    [sheet, onion, pivots, onionMapping],
  );

  // --- import -----------------------------------------------------------

  // Import a PNG or SVG into the SELECTED region. Scoped to one region rather
  // than the whole sheet because that's the unit that maps to a sprite — an
  // imported hat belongs on Helmet, not spread across the canvas. The file
  // lands as a floating draft; `placeImport` is what writes pixels.
  const handleImport = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      if (!sheetRef.current.regions[selectedRegion]) {
        flash("Pick a region to import into first");
        return;
      }
      setDraft({ kind: "file", file, region: selectedRegion, scale: 1 });
      setDraftOffset({ dx: 0, dy: 0 });
      setDraftArt(null);
      flash(
        `${file.name} — scale and drag it, then Place` +
          (isSvgFile(file) ? " (rendered from vector)" : ""),
      );
    },
    [selectedRegion, flash],
  );

  // Start a text stamp: a floating draft whose pixels come from `renderText`
  // over the live spec, so the text, font and colours stay editable while it
  // floats. Same landing rules as an image import.
  const beginTextStamp = useCallback(() => {
    if (!sheetRef.current.regions[selectedRegion]) {
      flash("Pick a region to stamp into first");
      return;
    }
    preparedRef.current?.dispose();
    preparedRef.current = null;
    setDraft({ kind: "text", region: selectedRegion });
    setDraftOffset({ dx: 0, dy: 0 });
    setDraftArt(null);
  }, [selectedRegion, flash]);

  // Library-browser hand-off (Pixelate mode): same floating-draft flow as a
  // picked file, targeting the selected region (or the sheet's first).
  const externalTokenRef = useRef(0);
  useEffect(() => {
    if (!externalFile || externalFile.token === externalTokenRef.current) return;
    externalTokenRef.current = externalFile.token;
    const region = sheetRef.current.regions[selectedRegion]
      ? selectedRegion
      : Object.keys(sheetRef.current.regions)[0];
    if (!region) return;
    setDraft({ kind: "file", file: externalFile.file, region, scale: 1 });
    setDraftOffset({ dx: 0, dy: 0 });
    setDraftArt(null);
    flash(`${externalFile.file.name} — scale and drag it, then Place`);
  }, [externalFile, selectedRegion, flash]);

  const cancelImport = useCallback(() => {
    preparedRef.current?.dispose();
    preparedRef.current = null;
    draftDragRef.current = null;
    setDraft(null);
    setDraftArt(null);
    setDraftOffset({ dx: 0, dy: 0 });
  }, []);

  // Decode once per file. Re-runs on `keepMatte` because matte removal (and the
  // trim that follows it) is what defines the content box, so it belongs to the
  // decode rather than to the render. Text drafts have no file — they never
  // enter this path.
  const draftFile = draft?.kind === "file" ? draft.file : null;
  useEffect(() => {
    if (!draftFile) return;
    let cancelled = false;
    preparedRef.current?.dispose();
    preparedRef.current = null;
    prepareArt(draftFile, importOpts)
      .then((art) => {
        if (cancelled) {
          art.dispose();
          return;
        }
        preparedRef.current = art;
        setPrepared((n) => n + 1);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        flash(err instanceof Error ? err.message : "Import failed");
        cancelImport();
      });
    return () => {
      cancelled = true;
    };
    // Deliberately NOT on the whole `importOpts` object: sampling, threshold and
    // palette cap are render-time and must not re-decode the file.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftFile, importOpts.keepMatte]);

  // Dispose on unmount — the vector path holds an object URL.
  useEffect(() => () => preparedRef.current?.dispose(), []);

  // Re-render the draft whenever anything it's fitted to changes: the scale,
  // the render options, or the region's size (the slot's canvas control).
  useEffect(() => {
    const art = preparedRef.current;
    if (draft?.kind !== "file" || !art) return;
    const bounds = sheetRef.current.regions[draft.region];
    if (!bounds) {
      cancelImport();
      return;
    }
    const w = Math.max(1, Math.round(bounds.width * draft.scale));
    const h = Math.max(1, Math.round(bounds.height * draft.scale));
    try {
      setDraftArt({ pixels: art.render(w, h, importOpts), width: w, height: h });
    } catch (err) {
      flash(err instanceof Error ? err.message : "Import failed");
      cancelImport();
    }
  }, [prepared, draft, importOpts, sheet, cancelImport, flash]);

  // Re-render a TEXT draft whenever its spec changes. renderText is pure
  // buffer math over a handful of glyphs — cheap enough to run per keystroke,
  // which is what makes the stamp feel live.
  useEffect(() => {
    if (draft?.kind !== "text") return;
    if (!sheetRef.current.regions[draft.region]) {
      cancelImport();
      return;
    }
    const font = fontById(textSpec.fontId);
    if (!font) {
      setDraftArt(null);
      return;
    }
    const rendered = renderText(textSpec.text, {
      font,
      color: textSpec.color,
      outline: textSpec.outline ? textSpec.outlineColor : undefined,
      scale: textSpec.scale,
      letterSpacing: textSpec.letterSpacing,
      slant: textSpec.slant,
    });
    setDraftArt(
      rendered.width > 0
        ? { pixels: rendered.pixels, width: rendered.width, height: rendered.height }
        : null,
    );
  }, [draft, textSpec, sheet, cancelImport]);

  // Where the draft currently sits, in sheet pixels: centred on the region's
  // ANCHOR, then moved by the drag offset.
  //
  // The anchor, not the region's middle. They're the same thing on a centred
  // pivot, but headroom slides the anchor down its canvas — and the anchor is
  // where the bone is, so it's where the head under the art is. Centring on the
  // rect instead drops an imported hat ten pixels above the head it's meant to
  // sit on, which is exactly how one got saved floating.
  const draftRect = useMemo(() => {
    if (!draft || !draftArt) return null;
    const bounds = sheet.regions[draft.region];
    if (!bounds) return null;
    const anchor = pivotAnchor(bounds, pivots?.[draft.region] ?? { x: 0.5, y: 0.5 });
    const rect = centredRect(anchor.x, anchor.y, draftArt.width, draftArt.height);
    return {
      ...rect,
      x: rect.x + draftOffset.dx,
      y: rect.y + draftOffset.dy,
      bounds,
    };
  }, [draft, draftArt, draftOffset, sheet, pivots]);

  const draftCanvas = useMemo(
    () => (draftArt ? bufferToCanvas(draftArt.pixels, draftArt.width, draftArt.height) : null),
    [draftArt],
  );

  // What the palette cap actually produced. Shown as swatches because "4
  // colours" is not the useful fact — WHICH four is, and a cap that spent three
  // slots on shades of one brown is only obvious when you can see them.
  const draftPalette = useMemo(() => {
    if (!draftArt) return [];
    const seen = new Map<string, number>();
    const px = draftArt.pixels;
    for (let i = 0; i < draftArt.width * draftArt.height; i++) {
      if (px[i * 4 + 3] === 0) continue;
      const hex = rgbaToHex([px[i * 4], px[i * 4 + 1], px[i * 4 + 2], 255]);
      seen.set(hex, (seen.get(hex) ?? 0) + 1);
    }
    return Array.from(seen.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 32);
  }, [draftArt]);

  const placeImport = useCallback(() => {
    if (!draft || !draftArt || !draftRect) return;
    pushUndo();
    const width = sheetRef.current.width;
    // Replacing is the old behaviour and stays the default — an import usually
    // means "this region is now that picture", and leftovers underneath would
    // show through its transparent areas. Unticked it composites instead, which
    // is what you want when the import is one element of a bigger drawing.
    // Text ALWAYS composites: words go ON the shirt, never instead of it.
    if (draft.kind === "file" && replaceRegion) {
      clearRect(pixelsRef.current, width, draftRect.bounds);
    }
    blitRect(
      pixelsRef.current,
      width,
      draftArt.pixels,
      draftArt.width,
      draftArt.height,
      draftRect.x,
      draftRect.y,
      draftRect.bounds,
    );
    const name = draft.kind === "file" ? draft.file.name : "text";
    const region = draft.region;
    cancelImport();
    repaint();
    publishPreview();
    flash(`Placed ${name} in ${region}`);
  }, [
    draft, draftArt, draftRect, replaceRegion, pushUndo, cancelImport, repaint,
    publishPreview, flash,
  ]);

  // --- eyes & pupils (Phase 12) -----------------------------------------

  // The two eye boxes + pupil marks, band-relative to the OPEN band. Held as
  // a draft that may be half-built (a box without its pupil yet); only a
  // COMPLETE pair is written on save, and an incomplete draft carries the
  // saved marks forward untouched — so poking at the tool can't strip a part
  // of working gaze. Seeded from the saved part; the component remounts per
  // part, so an initializer is enough.
  type EyeSide = { box?: AaEyeBox; pupil?: { x: number; y: number } };
  const [eyesDraft, setEyesDraft] = useState<{ left: EyeSide; right: EyeSide }>(() => ({
    left: savedPart?.eyes ? { ...savedPart.eyes.left } : {},
    right: savedPart?.eyes ? { ...savedPart.eyes.right } : {},
  }));
  // Explicit erase — without it, "clear then save" would resurrect the saved
  // marks through the carry-forward rule above.
  const [eyesCleared, setEyesCleared] = useState(false);
  // Which pupil the next canvas click sets. Same armed-click pattern as the
  // tag tool.
  const [pupilArm, setPupilArm] = useState<"left" | "right" | null>(null);

  const completeEyes = useCallback((): AaPartEyes | undefined => {
    const { left, right } = eyesDraft;
    return left.box && left.pupil && right.box && right.pupil
      ? {
          left: { box: left.box, pupil: left.pupil },
          right: { box: right.box, pupil: right.pupil },
        }
      : undefined;
  }, [eyesDraft]);

  const openBand = slot === "eye" ? sheet.regions[FREE_EYE_REGION] : undefined;

  // Auto-detect: connected components over the open band usually find exactly
  // the two eyes (the gap between them is real art). Suggested boxes only —
  // pupils still need their clicks. A pupil that survives inside its new box
  // is kept.
  const handleDetectEyes = useCallback(() => {
    if (!openBand) return;
    const boxes = detectEyeBoxes(pixelsRef.current, sheetRef.current.width, openBand);
    if (!boxes) {
      flash("Couldn't split the band into two eyes — marquee each eye and use Selection → box");
      return;
    }
    const keep = (side: EyeSide, box: AaEyeBox): EyeSide => {
      const p = side.pupil;
      const inside =
        p && p.x >= box.x && p.x < box.x + box.width && p.y >= box.y && p.y < box.y + box.height;
      return inside ? { box, pupil: p } : { box };
    };
    setEyesCleared(false);
    setEyesDraft((d) => ({ left: keep(d.left, boxes.left), right: keep(d.right, boxes.right) }));
    flash("Eye boxes set — now click each pupil (Set left/right pupil)");
  }, [openBand, flash]);

  // Manual route for art auto-detect can't split (glasses, a cyclops): the
  // current marquee selection becomes the box, clipped to the open band.
  const handleSelectionToBox = useCallback(
    (side: "left" | "right") => {
      if (!openBand || !selection) return;
      const inter = intersectRect(selection, openBand);
      if (!inter || inter.width < 1 || inter.height < 1) {
        flash("Make a selection inside the top (open) band first");
        return;
      }
      const box: AaEyeBox = {
        x: inter.x - openBand.x,
        y: inter.y - openBand.y,
        width: inter.width,
        height: inter.height,
      };
      setEyesCleared(false);
      setEyesDraft((d) => ({ ...d, [side]: { box } }));
    },
    [openBand, selection, flash],
  );

  // The armed click, called from handleDown before any tool runs.
  const placePupil = useCallback(
    (side: "left" | "right", sx: number, sy: number): void => {
      if (!openBand) return;
      const box = eyesDraft[side].box;
      if (!box) {
        flash("Set that eye's box first (Auto-detect or Selection → box)");
        return;
      }
      const bx = sx - openBand.x;
      const by = sy - openBand.y;
      if (bx < box.x || bx >= box.x + box.width || by < box.y || by >= box.y + box.height) {
        flash("Click inside that eye's box");
        return;
      }
      if (getPixel(pixelsRef.current, sheetRef.current.width, sx, sy)[3] === 0) {
        flash("Click the pupil itself — that pixel is transparent");
        return;
      }
      setEyesCleared(false);
      setEyesDraft((d) => ({ ...d, [side]: { box, pupil: { x: bx, y: by } } }));
      setPupilArm(null);
      flash(`${side === "left" ? "Left" : "Right"} pupil set`);
    },
    [openBand, eyesDraft, flash],
  );

  // --- painting ---------------------------------------------------------

  const paintAt = useCallback(
    (sx: number, sy: number) => {
      const s = sheetRef.current;
      if (sx < 0 || sy < 0 || sx >= s.width || sy >= s.height) return;
      const name = regionAt(s, sx, sy);
      // Outside every region is dead sheet space — painting there would be
      // invisible on the rig.
      if (!name) return;

      if (tool === "pick") {
        const px = getPixel(pixelsRef.current, s.width, sx, sy);
        if (px[3] !== 0) setColor(rgbaToHex(px));
        return;
      }
      // Tagging writes to the channel list, never to the pixels — no undo step,
      // because nothing about the art changed.
      if (tool === "tag") {
        const px = getPixel(pixelsRef.current, s.width, sx, sy);
        if (px[3] === 0) {
          flash("Nothing drawn there — tag a colour, not a hole");
          return;
        }
        if (!armed) {
          flash("Arm a colour channel first (Colour channels → tag into)");
          return;
        }
        tagColor(rgbaToHex(px));
        return;
      }
      if (tool === "fill") {
        floodFill(pixelsRef.current, s.width, sx, sy, hexToRgba(color), s.regions[name]);
      } else {
        const rgba: Rgba = tool === "eraser" ? [0, 0, 0, 0] : hexToRgba(color);
        setPixel(pixelsRef.current, s.width, sx, sy, rgba);
      }
      repaint();
    },
    [tool, color, repaint, armed, tagColor, flash],
  );

  // Fractional sheet coordinates. Painting wants whole pixels, but a rotation
  // angle taken from floored coordinates jitters — the handle is a sub-pixel
  // target at any sane zoom.
  const eventToPoint = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>): [number, number] => {
      const rect = e.currentTarget.getBoundingClientRect();
      return [(e.clientX - rect.left) / zoom, (e.clientY - rect.top) / zoom];
    },
    [zoom],
  );

  const eventToSheet = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>): [number, number] => {
      const [px, py] = eventToPoint(e);
      return [Math.floor(px), Math.floor(py)];
    },
    [eventToPoint],
  );

  // Move the current selection by (dx, dy) from wherever the drag started.
  // Recomposites from the lifted base each time, so the move is absolute
  // rather than incremental and dragging back is pixel-exact.
  const moveSelection = useCallback(
    (dx: number, dy: number) => {
      const d = selDragRef.current;
      if (!d) return;
      const bounds = sheetRef.current.regions[d.origin.region];
      if (!bounds) return;
      const next = new Uint8ClampedArray(d.base);
      blitRect(
        next,
        sheetRef.current.width,
        d.floating,
        d.origin.width,
        d.origin.height,
        d.origin.x + dx,
        d.origin.y + dy,
        bounds,
      );
      pixelsRef.current = next;
      // A rotation session survives a move — its centre just travels with the
      // art, so rotating again still turns the pristine source.
      if (rotSourceRef.current && d.rotFrom) {
        rotSourceRef.current.cx = d.rotFrom.cx + dx;
        rotSourceRef.current.cy = d.rotFrom.cy + dy;
      }
      setSelection({ ...d.origin, x: d.origin.x + dx, y: d.origin.y + dy });
      repaint();
    },
    [repaint],
  );

  const beginSelectionDrag = useCallback(
    (sel: Selection, fromX: number, fromY: number) => {
      pushUndo();
      const width = sheetRef.current.width;
      const base = new Uint8ClampedArray(pixelsRef.current);
      const floating = copyRect(pixelsRef.current, width, sel);
      clearRect(base, width, sel, sheetRef.current.regions[sel.region]);
      const r = rotSourceRef.current;
      selDragRef.current = {
        base,
        floating,
        origin: sel,
        fromX,
        fromY,
        rotFrom: r ? { cx: r.cx, cy: r.cy } : null,
      };
    },
    [pushUndo],
  );

  // --- rotation ---------------------------------------------------------

  // Where the rotation handle sits, in sheet coordinates. At rest it's off the
  // selection's right edge; mid-drag it orbits the centre with the pointer at
  // the radius it started with, so it doesn't crawl outward as the rotated
  // bounding box grows.
  const rotateHandle = useCallback(
    (sel: Selection) => {
      const cx = sel.x + sel.width / 2;
      const cy = sel.y + sel.height / 2;
      const live = rotDragRef.current;
      const radius = live ? live.radius : sel.width / 2 + HANDLE_GAP / zoom;
      // A selection against the right edge of the SHEET would push the handle
      // off-canvas, where it can't be drawn or clicked — flip it to the left
      // unless that's off-canvas too.
      const margin = (HANDLE_R + 2) / zoom;
      const base = live
        ? live.baseAngle
        : cx + radius + margin > sheetRef.current.width && cx - radius - margin >= 0
          ? Math.PI
          : 0;
      const turn = live ? live.angle - live.source.angle : 0;
      return {
        cx,
        cy,
        radius,
        base,
        hx: cx + Math.cos(base + turn) * radius,
        hy: cy + Math.sin(base + turn) * radius,
      };
    },
    [zoom],
  );

  const dropRotateSource = useCallback(() => {
    rotDragRef.current = null;
    rotSourceRef.current = null;
    setRotAngle(0);
  }, []);

  const beginRotate = useCallback(
    (sel: Selection, px: number, py: number) => {
      const s = sheetRef.current;
      const bounds = s.regions[sel.region];
      if (!bounds) return;
      const rest = rotateHandle(sel);
      pushUndo();
      // What gets lifted is the selection clipped to its region — the rect can
      // hang over the edge after a turn, and the pixels out there belong to the
      // neighbouring sprite.
      const lift = intersectRect(sel, bounds) ?? sel;
      const cx = lift.x + lift.width / 2;
      const cy = lift.y + lift.height / 2;
      let source = rotSourceRef.current;
      // Reuse the session's source only if it still describes THIS selection —
      // a fresh marquee drops it, and this is the belt to those braces.
      if (
        !source ||
        source.region !== sel.region ||
        Math.abs(source.cx - cx) > 0.51 ||
        Math.abs(source.cy - cy) > 0.51
      ) {
        source = {
          pixels: copyRect(pixelsRef.current, s.width, lift),
          width: lift.width,
          height: lift.height,
          region: sel.region,
          cx,
          cy,
          angle: 0,
        };
        rotSourceRef.current = source;
      }
      const base = new Uint8ClampedArray(pixelsRef.current);
      clearRect(base, s.width, sel, s.regions[sel.region]);
      rotDragRef.current = {
        base,
        source,
        // Measured against the SOURCE centre, which a reused source owns — the
        // two agree to within half a pixel, and half a pixel of angle is a
        // visible jump on a 20px sprite.
        pointerFrom: Math.atan2(py - source.cy, px - source.cx),
        angle: source.angle,
        radius: rest.radius,
        baseAngle: rest.base,
      };
    },
    [pushUndo, rotateHandle],
  );

  // Turn to the angle the pointer is at. Absolute, like the move drag: the
  // source is re-rotated from scratch every frame, so swinging back to 0°
  // restores the original pixels exactly.
  const rotateTo = useCallback(
    (px: number, py: number, snap: boolean) => {
      const d = rotDragRef.current;
      if (!d) return;
      const s = sheetRef.current;
      const bounds = s.regions[d.source.region];
      if (!bounds) return;
      let angle =
        d.source.angle + (Math.atan2(py - d.source.cy, px - d.source.cx) - d.pointerFrom);
      if (snap) {
        const step = (SNAP_DEG * Math.PI) / 180;
        angle = Math.round(angle / step) * step;
      }
      const rot = rotateBuffer(d.source.pixels, d.source.width, d.source.height, angle);
      const rect = centredRect(d.source.cx, d.source.cy, rot.width, rot.height);
      const next = new Uint8ClampedArray(d.base);
      blitRect(next, s.width, rot.pixels, rot.width, rot.height, rect.x, rect.y, bounds);
      pixelsRef.current = next;
      d.angle = angle;
      setSelection({ ...rect, region: d.source.region });
      setRotAngle(angle);
      repaint();
    },
    [repaint],
  );

  // Keyboard rotation, driven through the same drag machinery with a synthetic
  // grab — one code path for the turn itself means the two can't disagree.
  const rotateBy = useCallback(
    (delta: number) => {
      if (!selection) return;
      const cx = selection.x + selection.width / 2;
      const cy = selection.y + selection.height / 2;
      beginRotate(selection, cx + 1, cy);
      const d = rotDragRef.current;
      if (!d) return;
      // Aim from the SOURCE's centre — clipping may have moved it off the
      // selection's — and zero the grab so the step is exactly `delta`.
      d.pointerFrom = 0;
      rotateTo(d.source.cx + Math.cos(delta), d.source.cy + Math.sin(delta), false);
      d.source.angle = d.angle;
      rotDragRef.current = null;
      publishPreview();
    },
    [selection, beginRotate, rotateTo, publishPreview],
  );

  // Arrow keys nudge by one pixel — the whole point of the tool is fine
  // positioning, and a 1px drag at 14× zoom is fiddly.
  const nudgeSelection = useCallback(
    (dx: number, dy: number) => {
      if (!selection) return;
      beginSelectionDrag(selection, 0, 0);
      moveSelection(dx, dy);
      selDragRef.current = null;
      publishPreview();
    },
    [selection, beginSelectionDrag, moveSelection, publishPreview],
  );

  const handleDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const [sx, sy] = eventToSheet(e);
      const name = regionAt(sheetRef.current, sx, sy);

      // An armed pupil takes the click outright — it's a mark, not a stroke,
      // so no tool runs and no undo step is earned (pixels never change).
      if (pupilArm) {
        placePupil(pupilArm, sx, sy);
        return;
      }

      // The rotation handle is tested BEFORE anything else, including the
      // region switch: it sits outside its selection's box and can therefore
      // hang over a neighbour, and grabbing it must neither retarget the region
      // nor start a marquee there.
      if (tool === "select" && selection && !draftRect) {
        const h = rotateHandle(selection);
        const [px, py] = eventToPoint(e);
        if (Math.hypot(px - h.hx, py - h.hy) * zoom <= HANDLE_R + 4) {
          beginRotate(selection, px, py);
          return;
        }
      }
      if (name) setSelectedRegion(name);

      // A floating import takes the click when you grab it, and otherwise gets
      // out of the way — so the tools still work while one is in flight.
      if (draftRect && rectContains(draftRect, sx, sy)) {
        draftDragRef.current = { fromX: sx, fromY: sy, dx: draftOffset.dx, dy: draftOffset.dy };
        return;
      }

      if (tool === "select") {
        // Inside an existing selection → move it. Anywhere else → start a new
        // marquee, which also drops the old selection.
        if (selection && rectContains(selection, sx, sy)) {
          beginSelectionDrag(selection, sx, sy);
        } else {
          setSelection(null);
          dropRotateSource();
          if (name) setMarquee({ x0: sx, y0: sy, x1: sx, y1: sy, region: name });
        }
        return;
      }
      if (isShapeTool(tool)) {
        // Undo is pushed on COMMIT so an abandoned drag leaves no dead step.
        if (name) setShape({ x0: sx, y0: sy, x1: sx, y1: sy, region: name });
        return;
      }
      // Neither `pick` nor `tag` touches a pixel, so neither earns an undo step.
      if (tool !== "pick" && tool !== "tag") pushUndo();
      drawingRef.current = tool === "pencil" || tool === "eraser";
      paintAt(sx, sy);
    },
    [
      eventToSheet, eventToPoint, paintAt, pushUndo, tool, selection, beginSelectionDrag,
      draftRect, draftOffset, rotateHandle, beginRotate, dropRotateSource, zoom,
      pupilArm, placePupil,
    ],
  );

  const handleMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const [sx, sy] = eventToSheet(e);
      const g = draftDragRef.current;
      if (g) {
        setDraftOffset({ dx: g.dx + (sx - g.fromX), dy: g.dy + (sy - g.fromY) });
        return;
      }
      const r = rotDragRef.current;
      if (r) {
        const [px, py] = eventToPoint(e);
        rotateTo(px, py, e.shiftKey);
        return;
      }
      const d = selDragRef.current;
      if (d) {
        moveSelection(sx - d.fromX, sy - d.fromY);
        return;
      }
      if (marquee) {
        setMarquee((m: any) => (m ? { ...m, x1: sx, y1: sy } : m));
        return;
      }
      if (shape) {
        setShape((s: any) => (s ? { ...s, x1: sx, y1: sy } : s));
        return;
      }
      if (!drawingRef.current) return;
      paintAt(sx, sy);
    },
    [eventToSheet, eventToPoint, paintAt, shape, marquee, moveSelection, rotateTo],
  );

  const shapePreview = useMemo(() => {
    if (!shape || !isShapeTool(tool)) return null;
    const b = sheet.regions[shape.region];
    if (!b) return null;
    return shapeToolPixels(tool, shape, filled).filter(
      ([x, y]) => x >= b.x && x < b.x + b.width && y >= b.y && y < b.y + b.height,
    );
  }, [shape, tool, filled, sheet]);

  const endStroke = useCallback(() => {
    if (draftDragRef.current) {
      draftDragRef.current = null;
      return;
    }
    const rot = rotDragRef.current;
    if (rot) {
      // The angle reached becomes the session's angle, so the next drag adds to
      // it instead of re-rotating the result.
      rot.source.angle = rot.angle;
      rotDragRef.current = null;
      publishPreview();
      return;
    }
    if (selDragRef.current) {
      selDragRef.current = null;
      publishPreview();
      return;
    }
    if (marquee) {
      const bounds = sheet.regions[marquee.region];
      const rect = bounds
        ? rectFromDrag(marquee.x0, marquee.y0, marquee.x1, marquee.y1, bounds)
        : null;
      setSelection(rect ? { ...rect, region: marquee.region } : null);
      setMarquee(null);
      dropRotateSource();
      return;
    }
    if (shape) {
      if (shapePreview && shapePreview.length > 0) {
        pushUndo();
        const rgba = hexToRgba(color);
        for (const [x, y] of shapePreview) {
          setPixel(pixelsRef.current, sheetRef.current.width, x, y, rgba);
        }
        repaint();
        publishPreview();
      }
      setShape(null);
      return;
    }
    if (!drawingRef.current) return;
    drawingRef.current = false;
    publishPreview();
  }, [
    shape, shapePreview, color, pushUndo, repaint, publishPreview, marquee, sheet,
    dropRotateSource,
  ]);

  const undo = useCallback(() => {
    const prev = undoRef.current.pop();
    if (!prev) return;
    // The pixels under the selection are about to change, so the cached
    // rotation source no longer describes them.
    dropRotateSource();
    redoRef.current.push(new Uint8ClampedArray(pixelsRef.current));
    // A snapshot from before a sheet change is the wrong length; restoring it
    // would corrupt the canvas, so say so rather than fail silently.
    if (prev.length === pixelsRef.current.length) {
      pixelsRef.current = prev;
      repaint();
      publishPreview();
    } else {
      flash("Undo skipped — that step was before a size change");
    }
  }, [repaint, publishPreview, flash, dropRotateSource]);

  const redo = useCallback(() => {
    const next = redoRef.current.pop();
    if (!next || next.length !== pixelsRef.current.length) return;
    dropRotateSource();
    undoRef.current.push(new Uint8ClampedArray(pixelsRef.current));
    pixelsRef.current = next;
    repaint();
    publishPreview();
  }, [repaint, publishPreview, dropRotateSource]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Typing in a form field must never drive the canvas — the text stamp's
      // textarea needs Enter for newlines and arrows for its caret, and the
      // same is true of every input in the panel.
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      const NUDGE: Record<string, [number, number]> = {
        ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
      };
      // A floating import owns the keyboard while it's in flight: same nudge
      // keys as a selection, plus Enter to commit and Esc to drop it.
      if (draft) {
        if (e.key === "Escape") {
          e.preventDefault();
          cancelImport();
        } else if (e.key === "Enter") {
          e.preventDefault();
          placeImport();
        } else if (NUDGE[e.key]) {
          e.preventDefault();
          const [dx, dy] = NUDGE[e.key];
          setDraftOffset((o) => ({ dx: o.dx + dx, dy: o.dy + dy }));
        }
        return;
      }
      if (e.key === "Escape" && selection) {
        setSelection(null);
        dropRotateSource();
        return;
      }
      // [ and ] turn by one snap step without going near the handle — the only
      // way to hit an exact 15° on a small selection at low zoom.
      if (selection && (e.key === "[" || e.key === "]")) {
        e.preventDefault();
        rotateBy(((e.key === "]" ? 1 : -1) * SNAP_DEG * Math.PI) / 180);
        return;
      }
      if (selection && NUDGE[e.key]) {
        e.preventDefault();
        nudgeSelection(...NUDGE[e.key]);
        return;
      }
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (e.key === "y" || (e.key === "z" && e.shiftKey)) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    undo, redo, selection, nudgeSelection, draft, cancelImport, placeImport,
    dropRotateSource, rotateBy,
  ]);

  // --- canvas paint -----------------------------------------------------

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const c = 8;
    for (let y = 0; y < canvas.height; y += c) {
      for (let x = 0; x < canvas.width; x += c) {
        ctx.fillStyle = ((x / c + y / c) & 1) === 0 ? "#ffffff" : "#e2e8f0";
        ctx.fillRect(x, y, c, c);
      }
    }

    if (onionOn && onionCanvas) {
      ctx.globalAlpha = onionOpacity;
      ctx.drawImage(onionCanvas, 0, 0, canvas.width, canvas.height);
      ctx.globalAlpha = 1;
    }

    ctx.drawImage(
      bufferToCanvas(pixelsRef.current, sheet.width, sheet.height),
      0,
      0,
      canvas.width,
      canvas.height,
    );

    // The floating import, clipped to its region — what lands outside is what
    // "Place" would throw away, so showing it uncropped would lie.
    if (draftRect && draftCanvas) {
      const b = draftRect.bounds;
      ctx.save();
      ctx.beginPath();
      ctx.rect(b.x * zoom, b.y * zoom, b.width * zoom, b.height * zoom);
      ctx.clip();
      ctx.drawImage(
        draftCanvas,
        draftRect.x * zoom,
        draftRect.y * zoom,
        draftRect.width * zoom,
        draftRect.height * zoom,
      );
      ctx.restore();
      // Outline drawn UNCLIPPED, so an oversized import shows how far past the
      // region it runs — the cue to scale it down or grow the canvas.
      ctx.setLineDash([5, 3]);
      ctx.strokeStyle = "#f59e0b";
      ctx.lineWidth = 2;
      ctx.strokeRect(
        draftRect.x * zoom,
        draftRect.y * zoom,
        draftRect.width * zoom,
        draftRect.height * zoom,
      );
      ctx.setLineDash([]);
    }

    if (shapePreview) {
      ctx.globalAlpha = 0.75;
      ctx.fillStyle = color;
      for (const [x, y] of shapePreview) ctx.fillRect(x * zoom, y * zoom, zoom, zoom);
      ctx.globalAlpha = 1;
    }

    // Marquee in progress, then the committed selection. Dashed white-on-black
    // so it stays legible over any art.
    const band = (r: { x: number; y: number; width: number; height: number }) => {
      ctx.setLineDash([]);
      ctx.strokeStyle = "#000000";
      ctx.lineWidth = 3;
      ctx.strokeRect(r.x * zoom, r.y * zoom, r.width * zoom, r.height * zoom);
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(r.x * zoom, r.y * zoom, r.width * zoom, r.height * zoom);
      ctx.setLineDash([]);
    };
    if (marquee) {
      const b = sheet.regions[marquee.region];
      const r = b
        ? rectFromDrag(marquee.x0, marquee.y0, marquee.x1, marquee.y1, b)
        : null;
      if (r) band(r);
    } else if (selection) {
      band(selection);
    }

    ctx.font = "10px ui-monospace, monospace";
    for (const [name, r] of Object.entries(sheet.regions)) {
      const on = name === selectedRegion;
      ctx.strokeStyle = on ? "#f97316" : "#3b82f6";
      ctx.lineWidth = on ? 2 : 1;
      ctx.strokeRect(r.x * zoom, r.y * zoom, r.width * zoom, r.height * zoom);
      ctx.fillStyle = on ? "#f97316" : "#3b82f6";
      ctx.fillText(name, r.x * zoom + 2, r.y * zoom + 10);
      const a = pivotAnchor(r, pivots?.[name] ?? { x: 0.5, y: 0.5 });
      ctx.beginPath();
      ctx.moveTo(a.x * zoom - 4, a.y * zoom);
      ctx.lineTo(a.x * zoom + 4, a.y * zoom);
      ctx.moveTo(a.x * zoom, a.y * zoom - 4);
      ctx.lineTo(a.x * zoom, a.y * zoom + 4);
      ctx.strokeStyle = "#dc2626";
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Eye boxes + pupil marks (Phase 12), over the art but under the rotation
    // handle. Left = amber, right = sky; a pupil is a dot in its box's colour.
    if (slot === "eye") {
      const openRect = sheetRef.current.regions[FREE_EYE_REGION];
      if (openRect) {
        const sides: [typeof eyesDraft.left, string][] = [
          [eyesDraft.left, "#d97706"],
          [eyesDraft.right, "#0284c7"],
        ];
        for (const [side, colour] of sides) {
          ctx.strokeStyle = colour;
          ctx.lineWidth = 1;
          if (side.box) {
            ctx.strokeRect(
              (openRect.x + side.box.x) * zoom + 0.5,
              (openRect.y + side.box.y) * zoom + 0.5,
              side.box.width * zoom - 1,
              side.box.height * zoom - 1,
            );
          }
          if (side.pupil) {
            ctx.fillStyle = colour;
            ctx.beginPath();
            ctx.arc(
              (openRect.x + side.pupil.x + 0.5) * zoom,
              (openRect.y + side.pupil.y + 0.5) * zoom,
              Math.max(2, zoom * 0.3),
              0,
              Math.PI * 2,
            );
            ctx.fill();
          }
        }
      }
    }

    // Rotation handle LAST, over the region overlay — it's the one thing on the
    // canvas that can be grabbed, so nothing should draw across it. A tether
    // runs from the selection's centre, because the centre is what the art
    // turns about and the line is what says so.
    if (selection && !marquee) {
      const h = rotateHandle(selection);
      ctx.strokeStyle = "#0f172a";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(h.cx * zoom, h.cy * zoom);
      ctx.lineTo(h.hx * zoom, h.hy * zoom);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(h.cx * zoom, h.cy * zoom, 2, 0, Math.PI * 2);
      ctx.fillStyle = "#0f172a";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(h.hx * zoom, h.hy * zoom, HANDLE_R, 0, Math.PI * 2);
      ctx.fillStyle = rotDragRef.current ? "#f97316" : "#ffffff";
      ctx.fill();
      ctx.stroke();

      if (rotDragRef.current) {
        const deg = Math.round((rotDragRef.current.angle * 180) / Math.PI);
        const label = `${(((deg % 360) + 540) % 360) - 180}°`;
        ctx.font = "11px ui-monospace, monospace";
        const w = ctx.measureText(label).width + 6;
        ctx.fillStyle = "#0f172a";
        ctx.fillRect(h.hx * zoom + 10, h.hy * zoom - 8, w, 15);
        ctx.fillStyle = "#ffffff";
        ctx.fillText(label, h.hx * zoom + 13, h.hy * zoom + 3);
      }
    }
  });

  // --- eye bands (Phase 11) ---------------------------------------------

  // Copy the open band's art into the half or blink band as a starting point
  // for redrawing lids — auto-cropping open eyes would look wrong, but tracing
  // over them doesn't. A wholesale replace (transparent pixels included), same
  // replace-don't-composite rule as imports; one undo step.
  const copyOpenBand = useCallback(
    (toName: string) => {
      const from = sheet.regions[FREE_EYE_REGION];
      const to = sheet.regions[toName];
      if (!from || !to) return;
      pushUndo();
      const buf = pixelsRef.current;
      for (let y = 0; y < from.height; y++) {
        for (let x = 0; x < from.width; x++) {
          const si = ((from.y + y) * sheet.width + from.x + x) * 4;
          const di = ((to.y + y) * sheet.width + to.x + x) * 4;
          buf[di] = buf[si];
          buf[di + 1] = buf[si + 1];
          buf[di + 2] = buf[si + 2];
          buf[di + 3] = buf[si + 3];
        }
      }
      repaint();
      publishPreview();
    },
    [sheet, pushUndo, repaint, publishPreview],
  );

  // --- save -------------------------------------------------------------

  const handleSave = useCallback(async () => {
    if (!/^[A-Za-z][A-Za-z0-9]*$/.test(partName)) {
      flash("Name must be letters/digits, starting with a letter");
      return;
    }
    // Last defence against the data-loss path: never let an empty canvas
    // silently replace art that's already on disk.
    if (
      savedPart?.name === partName &&
      isBlank() &&
      !window.confirm(`The canvas is empty. Overwrite "${partName}" with nothing?`)
    ) {
      return;
    }
    const dataUrl = bufferToDataUrl(pixelsRef.current, sheet.width, sheet.height);
    const atlas = sheetToAtlas(sheet, dataUrl, pivots);
    try {
      const res = await fetch("/__aachar/save-part", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slot, name: partName, pngBase64: dataUrl.split(",")[1], atlas }),
      });
      const json = (await res.json()) as { ok: boolean; error?: string; partKey?: string };
      if (!json.ok) {
        flash(`Save failed: ${json.error}`);
        return;
      }
      const canonicalAtlas: SpriteAtlas = {
        ...atlas,
        // The model stores the canonical URL the plugin just wrote, not the
        // data URL — that's what keeps the manifest small.
        image: `/aachar/parts/${slot}/${json.partKey}.png`,
      };
      // Non-wardrobe art (the horse tab): the parent owns registration.
      if (onPersist) {
        hydratedRef.current = `${partName}|${canonicalAtlas.image}`;
        onPersist({ name: partName, atlas: canonicalAtlas });
        onSaved?.(partName);
        flash(`Saved ${json.partKey}`);
        return;
      }
      // Character wardrobe path — `slot` is a real AaSlot here (the only
      // non-AaSlot caller, the horse tab, always passes `onPersist`).
      const wardrobeSlot = slot as AaSlot;
      const part: AaPart = {
        name: partName,
        slot: wardrobeSlot,
        atlas: canonicalAtlas,
        ...(authoredFor ? { authoredFor } : {}),
        // The helmet's underside, column by column — the edge hair gets masked
        // against (lib/aachar/hatHair.ts). Free to compute here and impossible to
        // recover later without decoding the PNG. Only the helmet records one:
        // it's the only slot that masks anything, and a profile per region on
        // every part would bloat the manifest for nothing.
        ...(slot === "helmet"
          ? {
              contentBottomProfile: Object.fromEntries(
                Object.entries(sheet.regions).map(([name, r]) => [
                  name,
                  regionBottomProfile(pixelsRef.current, sheet.width, r),
                ]),
              ),
            }
          : {}),
        // Which extra eye bands carry real art (Phase 11) — measured HERE,
        // where the pixels are in memory, because the saved atlas is a URL.
        // `applyEyeState` refuses to swap to an unflagged band, so this is
        // what stands between a blank band and invisible eyes. Only written
        // when a band has art, keeping an eyes-open-only part byte-identical
        // to a pre-Phase-11 save.
        ...(slot === "eye"
          ? (() => {
              const has = (name: string) => {
                const r = sheet.regions[name];
                return !!r && !isRegionEmpty(pixelsRef.current, sheet.width, r);
              };
              const half = has(FREE_EYE_HALF_REGION);
              const close = has(FREE_EYE_CLOSE_REGION);
              return half || close
                ? { eyeBands: { ...(half ? { half: true } : {}), ...(close ? { close: true } : {}) } }
                : {};
            })()
          : {}),
        // Eye boxes + pupil marks (Phase 12): a complete draft wins, an
        // incomplete one carries the saved marks forward, and an explicit
        // Clear drops them.
        ...(slot === "eye"
          ? (() => {
              const eyes = completeEyes() ?? (eyesCleared ? undefined : savedPart?.eyes);
              return eyes ? { eyes } : {};
            })()
          : {}),
        // Only written when there's something to write, so a part with no
        // channels stays byte-identical to what it was before recolouring
        // existed.
        ...(channels.length > 0 ? { colorChannels: channels } : {}),
        ...(protect ? { protect } : {}),
      };
      hydratedRef.current = `${part.name}|${part.atlas.image}`;
      // The canonical URL is unchanged by an overwrite, so recoloured copies
      // cached against it are now of the OLD pixels.
      clearRecolorCache();
      clearHatHairCache();
      clearGazeCache();
      clearShadeCache();
      onModelChange(upsertPart(model, part));
      onSaved?.(part.name);
      flash(`Saved ${json.partKey}`);
    } catch (err) {
      flash(err instanceof Error ? err.message : "Save failed");
    }
  }, [
    partName, sheet, pivots, slot, authoredFor, model, onModelChange, flash, savedPart,
    isBlank, onSaved, onPersist, channels, protect, completeEyes, eyesCleared,
  ]);

  const region = sheet.regions[selectedRegion];
  // Recomputed every render rather than memoised: the buffer lives in a ref and
  // mutates in place, so there is no dependency that changing it would trip. A
  // sheet is a couple of thousand pixels, which is nothing next to the repaint
  // that already runs on the same frame.
  const palette = paletteOf(pixelsRef.current, sheet.width);

  return (
    <div className="flex flex-wrap gap-4">
      <div className="w-72 shrink-0 space-y-3">
        {children}

        <section className="rounded border border-slate-300 bg-white p-3">
          <h2 className="mb-2 text-sm font-semibold">Tools</h2>
          <div className="mb-2 flex flex-wrap gap-1">
            {TOOLS.map((t) => (
              <button
                key={t}
                onClick={() => setTool(t)}
                className={`rounded px-2 py-1 text-xs capitalize ${
                  tool === t ? "bg-slate-900 text-white" : "border border-slate-300 hover:bg-slate-50"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          {isShapeTool(tool) ? (
            <label className="mb-2 flex items-center gap-2 text-xs text-slate-600">
              <input type="checkbox" checked={filled} onChange={(e) => setFilled(e.target.checked)} />
              Filled (otherwise 1px outline)
            </label>
          ) : null}
          {tool === "tag" ? (
            <p className="mb-2 rounded bg-emerald-50 px-2 py-1 text-xs text-emerald-900">
              {armed ? (
                <>
                  Click a pixel to add its colour to <strong>{armed}</strong>;
                  click it again to remove. Pixels are never changed.
                </>
              ) : (
                <>Arm a channel below (&ldquo;tag into&rdquo;) first.</>
              )}
            </p>
          ) : null}
          {tool === "select" ? (
            <p className="mb-2 rounded bg-slate-100 px-2 py-1 text-xs text-slate-600">
              {selection ? (
                <>
                  {selection.width}×{selection.height} selected in{" "}
                  <strong>{selection.region}</strong>
                  {rotAngle ? (
                    <>
                      {" "}
                      — turned <strong>{Math.round((rotAngle * 180) / Math.PI)}°</strong>
                    </>
                  ) : null}
                  . Drag inside it to move, arrow keys to nudge 1px. Drag the ○
                  handle to rotate (Shift snaps to {SNAP_DEG}°, [ and ] step it).
                  Esc drops it.
                </>
              ) : (
                <>Drag a box to select. Moves stay inside the region you started in.</>
              )}
            </p>
          ) : null}
          <div className="mb-2 flex items-center gap-2">
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="h-7 w-10 rounded border border-slate-300"
            />
            <code className="text-xs">{color}</code>
          </div>
          <div className="grid grid-cols-9 gap-1">
            {PALETTE.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                style={{ background: c }}
                className="h-5 w-5 rounded border border-slate-300"
                title={c}
              />
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            <button onClick={undo} className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50">
              ↶ Undo
            </button>
            <button onClick={redo} className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50">
              ↷ Redo
            </button>
          </div>
        </section>

        {slot === "eye" ? (
          <section className="rounded border border-slate-300 bg-white p-3">
            <h2 className="mb-1 text-sm font-semibold">Eye bands</h2>
            <p className="mb-2 text-xs text-slate-500">
              Top band: open. Middle: half-closed. Bottom: blink. Copy the open
              art in as a starting point, then redraw the lids over it.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => copyOpenBand(FREE_EYE_HALF_REGION)}
                className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
                title="Replace the half-closed band with a copy of the open band"
              >
                Copy open → half
              </button>
              <button
                onClick={() => copyOpenBand(FREE_EYE_CLOSE_REGION)}
                className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
                title="Replace the blink band with a copy of the open band"
              >
                Copy open → blink
              </button>
            </div>
          </section>
        ) : null}

        {slot === "eye" ? (
          <section className="rounded border border-slate-300 bg-white p-3">
            <h2 className="mb-1 text-sm font-semibold">Eyes &amp; pupils</h2>
            <p className="mb-2 text-xs text-slate-500">
              Mark each eye (a box) and its pupil (a click) on the top band —
              that&apos;s what makes per-eye nudging and gaze possible. Range
              is derived from the whites, so nothing else to configure.
            </p>
            <div className="mb-2 space-y-0.5 text-xs">
              {(["left", "right"] as const).map((side) => (
                <div key={side} className="flex items-center gap-1">
                  <span
                    className="inline-block h-2 w-2 rounded-sm"
                    style={{ background: side === "left" ? "#d97706" : "#0284c7" }}
                  />
                  <span className="capitalize text-slate-600">{side} eye:</span>
                  <span className={eyesDraft[side].box ? "text-emerald-700" : "text-slate-400"}>
                    box {eyesDraft[side].box ? "✓" : "—"}
                  </span>
                  <span className={eyesDraft[side].pupil ? "text-emerald-700" : "text-slate-400"}>
                    pupil {eyesDraft[side].pupil ? "✓" : "—"}
                  </span>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-1">
              <button
                onClick={handleDetectEyes}
                className="rounded border border-emerald-600 px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-50"
                title="Find the two eyes automatically (the gap between them is real)"
              >
                Auto-detect boxes
              </button>
              <button
                onClick={() => handleSelectionToBox("left")}
                disabled={!selection}
                className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50 disabled:opacity-40"
                title="Use the current marquee selection as the left (on screen) eye's box"
              >
                Selection → left box
              </button>
              <button
                onClick={() => handleSelectionToBox("right")}
                disabled={!selection}
                className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50 disabled:opacity-40"
                title="Use the current marquee selection as the right (on screen) eye's box"
              >
                Selection → right box
              </button>
              {(["left", "right"] as const).map((side) => (
                <button
                  key={side}
                  onClick={() => setPupilArm((cur) => (cur === side ? null : side))}
                  disabled={!eyesDraft[side].box}
                  className={`rounded px-2 py-1 text-xs disabled:opacity-40 ${
                    pupilArm === side
                      ? "bg-slate-900 text-white"
                      : "border border-slate-300 hover:bg-slate-50"
                  }`}
                  title="Then click the pupil on the canvas"
                >
                  Set {side} pupil
                </button>
              ))}
              <button
                onClick={() => {
                  setEyesDraft({ left: {}, right: {} });
                  setEyesCleared(true);
                  setPupilArm(null);
                }}
                className="rounded border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50"
                title="Remove the marks (takes effect on the next save)"
              >
                Clear marks
              </button>
            </div>
            {pupilArm ? (
              <p className="mt-2 rounded bg-emerald-50 px-2 py-1 text-xs text-emerald-900">
                Click the <strong>{pupilArm}</strong> eye&apos;s pupil on the
                canvas.
              </p>
            ) : null}
            <p className="mt-2 text-xs text-slate-500">
              Saved with the part. Nudge lives on each character (Characters
              tab); gaze is previewed below and set per clip on the Animation
              tab.
            </p>
          </section>
        ) : null}

        <section className="rounded border border-slate-300 bg-white p-3">
          <h2 className="mb-2 text-sm font-semibold">View</h2>
          <label className="block text-xs text-slate-600">Zoom {zoom}×</label>
          <input
            type="range"
            min={4}
            max={28}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="w-full"
          />
          <label className="mt-2 flex items-center gap-2 text-xs text-slate-600">
            <input type="checkbox" checked={onionOn} onChange={(e) => setOnionOn(e.target.checked)} />
            Onion skin {Math.round(onionOpacity * 100)}%
          </label>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(onionOpacity * 100)}
            onChange={(e) => setOnionOpacity(Number(e.target.value) / 100)}
            className="w-full"
          />
          <p className="mt-1 text-xs text-slate-500">{onionLabel}</p>
        </section>

        <ColorChannels
          channels={channels}
          onChange={setChannels}
          palette={palette}
          armed={armed}
          onArm={setArmed}
          testColor={testColor}
          onTestColor={setTestColor}
          pixels={pixelsRef.current}
          protect={protect}
          onProtectChange={setProtect}
        />

        <section className="rounded border border-slate-300 bg-white p-3">
          <h2 className="mb-2 text-sm font-semibold">Import image</h2>
          <button
            onClick={() => importRef.current?.click()}
            className="rounded border border-slate-300 px-2 py-1 text-sm hover:bg-slate-50"
          >
            Import into {selectedRegion}…
          </button>
          <input
            ref={importRef}
            type="file"
            accept="image/*,.svg"
            className="hidden"
            onChange={handleImport}
          />

          {draft?.kind === "file" ? (
            <div className="mt-2 rounded border border-amber-300 bg-amber-50 p-2">
              <p className="text-xs font-semibold text-amber-900">
                {draft.file.name} → {draft.region}
              </p>
              <label className="mt-1 block text-xs text-amber-900">
                Size {Math.round(draft.scale * 100)}%
                {draftArt ? ` — ${draftArt.width}×${draftArt.height}px` : " — rendering…"}
              </label>
              <input
                type="range"
                min={10}
                max={400}
                step={1}
                value={Math.round(draft.scale * 100)}
                onChange={(e) =>
                  setDraft((d) =>
                    d?.kind === "file" ? { ...d, scale: Number(e.target.value) / 100 } : d,
                  )
                }
                className="w-full"
              />
              <p className="text-xs text-amber-900">
                Offset {draftOffset.dx >= 0 ? "+" : ""}
                {draftOffset.dx}, {draftOffset.dy >= 0 ? "+" : ""}
                {draftOffset.dy}px
              </p>
              {draftPalette.length > 0 ? (
                <>
                  <p className="mt-1 text-xs text-amber-900">
                    {draftPalette.length} colour{draftPalette.length === 1 ? "" : "s"}
                    {draftPalette.length === 32 ? "+" : ""} — click one to paint with it
                  </p>
                  <div className="mt-0.5 flex flex-wrap gap-0.5">
                    {draftPalette.map(([hex, n]) => (
                      <button
                        key={hex}
                        onClick={() => setColor(hex)}
                        style={{ background: hex }}
                        className="h-4 w-4 rounded-sm border border-amber-300"
                        title={`${hex} — ${n}px`}
                      />
                    ))}
                  </div>
                </>
              ) : null}
              <div className="mt-1 flex flex-wrap gap-1">
                <button
                  onClick={placeImport}
                  disabled={!draftArt}
                  className="rounded bg-slate-900 px-2 py-1 text-xs text-white disabled:opacity-40"
                >
                  Place
                </button>
                <button
                  onClick={() => {
                    setDraft((d) => (d?.kind === "file" ? { ...d, scale: 1 } : d));
                    setDraftOffset({ dx: 0, dy: 0 });
                  }}
                  className="rounded border border-amber-400 bg-white px-2 py-1 text-xs hover:bg-amber-100"
                >
                  Reset
                </button>
                <button
                  onClick={cancelImport}
                  className="rounded border border-amber-400 bg-white px-2 py-1 text-xs hover:bg-amber-100"
                >
                  Cancel
                </button>
              </div>
              <label className="mt-2 flex items-center gap-2 text-xs text-amber-900">
                <input
                  type="checkbox"
                  checked={replaceRegion}
                  onChange={(e) => setReplaceRegion(e.target.checked)}
                />
                Clear the region first
              </label>
              <p className="mt-1 text-xs text-amber-800">
                Drag it on the canvas, arrows nudge 1px, Enter places, Esc drops
                it. Re-rendered from the original file at every size — nothing is
                resampled twice.
              </p>
            </div>
          ) : null}

          <label className="mt-2 flex items-center gap-2 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={importOpts.keepMatte}
              onChange={(e) =>
                setImportOpts((o) => ({ ...o, keepMatte: e.target.checked }))
              }
            />
            Keep background matte (raster only)
          </label>
          <label className="mt-1 flex items-center gap-2 text-xs text-slate-600">
            Sampling
            <select
              value={importOpts.sampling}
              onChange={(e) =>
                setImportOpts((o) => ({
                  ...o,
                  sampling: e.target.value as ImportOptions["sampling"],
                }))
              }
              className="rounded border border-slate-300 px-1 py-0.5"
            >
              <option value="average">average (photos, soft art)</option>
              <option value="crisp">crisp (flat icons)</option>
            </select>
          </label>
          <label className="mt-1 flex items-center gap-2 text-xs text-slate-600">
            Max colours
            <input
              type="number"
              min={0}
              max={64}
              value={importOpts.colors}
              onChange={(e) =>
                setImportOpts((o) => ({ ...o, colors: Math.max(0, Number(e.target.value) || 0) }))
              }
              className="w-14 rounded border border-slate-300 px-1 py-0.5"
            />
            <span className="text-slate-400">0 = off</span>
          </label>
          {importOpts.colors > 0 ? (
            <label className="mt-1 flex items-center gap-2 text-xs text-slate-600">
              Pick by
              <select
                value={importOpts.palette}
                onChange={(e) =>
                  setImportOpts((o) => ({
                    ...o,
                    palette: e.target.value as ImportOptions["palette"],
                  }))
                }
                className="rounded border border-slate-300 px-1 py-0.5"
              >
                <option value="distinct">distinct hues (keeps the red)</option>
                <option value="coverage">area (median cut)</option>
              </select>
            </label>
          ) : null}
          <p className="mt-2 text-xs text-slate-500">
            <strong>SVGs are rasterised at sprite size</strong>, straight from the
            vector — every pixel is a fresh decision rather than a shrunk bitmap.
            Rasters get matte removal, trim, then box-downsample. Either way the
            art is letterboxed, keeping its proportions — 100% fills the region,
            and the options above re-render a floating import in place.
          </p>
        </section>

        <section className="rounded border border-slate-300 bg-white p-3">
          <h2 className="mb-2 text-sm font-semibold">Text</h2>
          {draft?.kind !== "text" ? (
            <>
              <button
                onClick={beginTextStamp}
                className="rounded border border-slate-300 px-2 py-1 text-sm hover:bg-slate-50"
              >
                Stamp text into {selectedRegion}…
              </button>
              <p className="mt-2 text-xs text-slate-500">
                Bitmap fonts rendered at exact pixel sizes — words on a shirt, a
                hat logo, an icon from the dingbats font. Stamps composite over
                the art underneath.
              </p>
              <p className="mt-1 text-xs text-emerald-700">
                Only the 6 pixel fonts live here. For ~20 fonts — Impact,
                Georgia, Comic Sans, script faces — smooth and freely
                resizable, use the green <strong>Text…</strong> button in
                &ldquo;Parts in {slot === "horse" ? "Horse" : SLOT_LABEL[slot]}&rdquo; above.
              </p>
            </>
          ) : (
            <div className="rounded border border-amber-300 bg-amber-50 p-2">
              <p className="text-xs font-semibold text-amber-900">
                Text → {draft.region}{" "}
                <span className="font-normal">(pixel fonts — for real fonts
                use <strong>Text…</strong> in the parts box above)</span>
              </p>
              <textarea
                value={textSpec.text}
                onChange={(e) => setTextSpec((s) => ({ ...s, text: e.target.value }))}
                placeholder="Type here…"
                rows={2}
                autoFocus
                className="mt-1 w-full rounded border border-amber-300 px-1 py-0.5 text-sm"
              />
              <label className="mt-1 flex items-center gap-2 text-xs text-amber-900">
                Font
                <select
                  value={textSpec.fontId}
                  onChange={(e) => setTextSpec((s) => ({ ...s, fontId: e.target.value }))}
                  className="rounded border border-amber-300 px-1 py-0.5"
                >
                  {PIXEL_FONTS.map((f) => (
                    <option key={f.id} value={f.id} title={f.description}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </label>
              {textSpec.fontId === "dingbats" ? (
                <p className="mt-1 text-xs text-amber-800">
                  Every key is an icon:{" "}
                  {Object.entries(fontById("dingbats")?.legend ?? {})
                    .map(([ch, what]) => `${ch}=${what}`)
                    .join(", ")}
                </p>
              ) : null}
              <div className="mt-1 flex items-center gap-3">
                <label className="flex items-center gap-1 text-xs text-amber-900">
                  Size
                  <select
                    value={textSpec.scale}
                    onChange={(e) =>
                      setTextSpec((s) => ({ ...s, scale: Number(e.target.value) }))
                    }
                    className="rounded border border-amber-300 px-1 py-0.5"
                  >
                    {[1, 2, 3, 4].map((n) => (
                      <option key={n} value={n}>
                        {n}×
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center gap-1 text-xs text-amber-900">
                  Spacing
                  <input
                    type="number"
                    min={0}
                    max={4}
                    value={textSpec.letterSpacing}
                    onChange={(e) =>
                      setTextSpec((s) => ({
                        ...s,
                        letterSpacing: Math.max(0, Math.min(4, Number(e.target.value) || 0)),
                      }))
                    }
                    className="w-11 rounded border border-amber-300 px-1 py-0.5"
                  />
                </label>
                <label className="flex items-center gap-1 text-xs text-amber-900">
                  <input
                    type="checkbox"
                    checked={textSpec.slant}
                    onChange={(e) => setTextSpec((s) => ({ ...s, slant: e.target.checked }))}
                  />
                  Italic
                </label>
              </div>
              <div className="mt-1 flex items-center gap-3">
                <label className="flex items-center gap-1 text-xs text-amber-900">
                  Colour
                  <input
                    type="color"
                    value={textSpec.color}
                    onChange={(e) => setTextSpec((s) => ({ ...s, color: e.target.value }))}
                    className="h-6 w-8 rounded border border-amber-300"
                  />
                </label>
                <label className="flex items-center gap-1 text-xs text-amber-900">
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
                    onChange={(e) =>
                      setTextSpec((s) => ({ ...s, outlineColor: e.target.value }))
                    }
                    className="h-6 w-8 rounded border border-amber-300"
                  />
                ) : null}
              </div>
              <p className="mt-1 text-xs text-amber-900">
                {draftArt ? `${draftArt.width}×${draftArt.height}px — ` : ""}
                offset {draftOffset.dx >= 0 ? "+" : ""}
                {draftOffset.dx}, {draftOffset.dy >= 0 ? "+" : ""}
                {draftOffset.dy}px
              </p>
              <div className="mt-1 flex flex-wrap gap-1">
                <button
                  onClick={placeImport}
                  disabled={!draftArt}
                  className="rounded bg-slate-900 px-2 py-1 text-xs text-white disabled:opacity-40"
                >
                  Place
                </button>
                <button
                  onClick={cancelImport}
                  className="rounded border border-amber-400 bg-white px-2 py-1 text-xs hover:bg-amber-100"
                >
                  Cancel
                </button>
              </div>
              <p className="mt-1 text-xs text-amber-800">
                Drag it on the canvas, arrows nudge 1px (click the canvas
                first), Enter places, Esc drops it. It composites over the art
                underneath — the shirt stays.
              </p>
            </div>
          )}
        </section>

        <section className="rounded border border-slate-300 bg-white p-3">
          <h2 className="mb-2 text-sm font-semibold">Save part</h2>
          <div className="flex items-center gap-1">
            <span className="text-xs text-slate-500">AA_</span>
            <input
              value={partName}
              onChange={(e) => setPartName(e.target.value)}
              className="w-28 rounded border border-slate-300 px-1 py-0.5 text-sm"
            />
            <button
              onClick={handleSave}
              className="rounded border border-slate-300 px-2 py-1 text-sm hover:bg-slate-50"
            >
              Save
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Writes <code>public/aachar/parts/{slot}/</code> and adds the part to
            the model library.
          </p>
          {message ? (
            <p className="mt-2 rounded bg-amber-100 px-2 py-1 text-xs text-amber-900">{message}</p>
          ) : null}
        </section>
      </div>

      <div className="flex-1">
        <div className="inline-block rounded border border-slate-300 bg-white p-3">
          <canvas
            ref={canvasRef}
            width={sheet.width * zoom}
            height={sheet.height * zoom}
            onMouseDown={handleDown}
            onMouseMove={handleMove}
            onMouseUp={endStroke}
            onMouseLeave={endStroke}
            className="cursor-crosshair"
            style={{ imageRendering: "pixelated" }}
          />
        </div>
        <p className="mt-2 max-w-md text-xs text-slate-500">
          Sheet {sheet.width}×{sheet.height}. Selected region:{" "}
          <strong>{selectedRegion}</strong>
          {region ? ` ${region.width}×${region.height} at (${region.x}, ${region.y})` : ""}.
          Red cross is the pivot — the point the renderer pins to the bone. Fill
          and shapes are clipped to the region you start in, because the packer
          leaves no gutter between them.
        </p>
      </div>
    </div>
  );
}
