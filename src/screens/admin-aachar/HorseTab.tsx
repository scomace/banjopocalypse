"use client";

// AA horse tab — docs/aachar-horse-plan.md.
//
// Two views:
//
//   draw     original horse art on the padded 10-region sheet, with any SPUM
//            horse composited underneath as an onion skin (pivot-to-pivot,
//            pairs by name — the sheet keeps SPUM's region names, H2), and a
//            live animated preview beside the canvas.
//   animate  the 12 rebuilt horse clips: scrub, edit beat poses numerically
//            (13 channels), A/B against SPUM's clip of the same name, Copy TS
//            to promote a tuned clip into lib/aachar/horse/clips.ts.
//
// Isolation (H1/H4): horse art registers in `model.horse.parts` via
// PartCanvas's `onPersist` seam — the character wardrobe (`model.parts`,
// `AA_SLOTS`, pickers, outfits) never sees any of this.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  AA_CHANNELS,
  CHANNEL_LABELS,
  channelAt,
  type AaChannel,
} from "@/lib/aachar/clip";
import { AA_CLIP_NAMES } from "@/lib/aachar/clips";
import { effectiveProportions, effectiveZOrder, partsInSlot } from "@/lib/aachar/character";
import { AA_RENDER_CONFIG, toAtlasOverrides, toSlotAdjustments } from "@/lib/aachar/render";
import { composeSkeleton } from "@/lib/aachar/skeleton";
import { AA_SLOTS, type AaCharacter, type AaSlot } from "@/lib/aachar/types";
import {
  AA_FPS,
  HORSE_CHANNELS,
  HORSE_CHANNEL_LABELS,
  type AaHorseBeat,
  type AaHorseChannel,
  type AaHorseClip,
  checkHorseClip,
  compileHorseClip,
  horseChannelAt,
  horseClipAmplitude,
  horseClipToSource,
} from "@/lib/aachar/horse/clip";
import {
  DEFAULT_RIDER_OFFSET,
  compiledRiderClip,
  riderHold,
  riderOffset,
  riderPose,
  type AaHorseRider,
} from "@/lib/aachar/horse/rider";
import { AA_HORSE_CLIPS, HORSE_LOCKED_FRAMES } from "@/lib/aachar/horse/clips";
import {
  type AaHorseModel,
  findHorsePart,
  horseClipSource,
  horseModelOf,
  horseStance,
  removeFaceStamp,
  removeHorsePart,
  resolveHorseClip,
  suggestHorsePartName,
  upsertFaceStamp,
  upsertHorseClip,
  upsertHorsePart,
  revertHorseClip,
} from "@/lib/aachar/horse/model";
import {
  FACE_PALETTE,
  applyHorseStamps,
  faceStyleList,
  findFaceStamp,
  isCustomFaceStamp,
  stampToDataUrl,
  type HorseFacePick,
  type HorseFaceStamp,
} from "@/lib/aachar/horse/face";
import { applyHorseHat, type HorseHatPick } from "@/lib/aachar/horse/hat";
import { packHorseSheet } from "@/lib/aachar/horse/sheet";
import { loadOnionSource, type OnionSource } from "@/lib/aachar/onion";
import type { AaModel } from "@/lib/aachar/types";
import { SpumCharacter } from "@/lib/spum/SpumCharacter";
import { SpumHorse } from "@/lib/spum/SpumHorse";
import {
  HORSE_ANIMATIONS,
  HORSE_PART_LIST,
  HORSE_SADDLE_BONE,
  horseAtlasPath,
  type HorseAnimation,
  type HorsePart,
} from "@/lib/spum/horseCatalog";
import type { BoneTransformMap, Clip, Skeleton, SpriteAtlas } from "@/lib/spum/types";
import type { PartNudge } from "@/lib/spum/partAdjustments";
import type { SpumSlot } from "@/lib/spum/catalog";

import { PartCanvas } from "./PartCanvas";
import { useRecoloredOverrides } from "./useRecoloredOverrides";
import { useShadedOverrides } from "./useShadedOverrides";

type View = "draw" | "animate" | "ride";

// The straddle depth trick, learned from SPUM's own harness: the character
// rig fakes limb depth with X offsets, not z-occlusion, so a mounted rider's
// far-side slices must literally render BEHIND the horse. The rider draws
// TWICE — a copy showing only these slices before the horse in DOM order,
// and the rest after. The right LEG is always behind (that's what reads as
// straddling); the right arm + held weapon are toggleable.
const RIDER_BACK_LEG_SLICES = ["body:Foot_R"];
const RIDER_BACK_ARM_SLICES = ["body:Arm_R", "cloth:Right", "weapon:Weapon"];

// Sentinel for "editing a new, unsaved horse" — same trick as BodyEditor's:
// part names are letters/digits, so this can never collide with a real one.
const NEW_PART = " new";

// The custom-stamp editor's paint area, in head-region pixels. Big enough
// for any face feature; the saved stamp is trimmed to its painted bounds.
const STAMP_W = 12;
const STAMP_H = 10;
const STAMP_CELL = 18;
const NAME_RE = /^[A-Za-z][A-Za-z0-9]*$/;

// Draft being drawn in the custom-stamp editor. `kind` uses the PICK key
// ("mouth", not "mouths"); grid cells are hex colours or null.
type StampDraft = {
  kind: "eyes" | "mouth";
  /** Original name when editing an existing custom stamp, else null. */
  editing: string | null;
  name: string;
  x: number;
  y: number;
  grid: (string | null)[][];
};

const listKindOf = (kind: "eyes" | "mouth"): "eyes" | "mouths" =>
  kind === "eyes" ? "eyes" : "mouths";

const emptyGrid = (): (string | null)[][] =>
  Array.from({ length: STAMP_H }, () => Array<string | null>(STAMP_W).fill(null));

// Draft → stamp. `trim: false` keeps the full grid (live preview while
// drawing); `trim: true` shrinks to the painted bounds for saving. Returns
// null when nothing is painted.
function draftToStamp(draft: StampDraft, trim: boolean): HorseFaceStamp | null {
  let minX = STAMP_W;
  let minY = STAMP_H;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < STAMP_H; y++)
    for (let x = 0; x < STAMP_W; x++)
      if (draft.grid[y][x]) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
  if (maxX < 0) return null;
  const x0 = trim ? minX : 0;
  const y0 = trim ? minY : 0;
  const x1 = trim ? maxX : STAMP_W - 1;
  const y1 = trim ? maxY : STAMP_H - 1;

  // Assign a char per colour, reusing the shared palette's chars where the
  // colour matches so simple stamps read like the built-ins.
  const byColor = new Map<string, string>();
  const palette: Record<string, string> = {};
  const spare = "abcdefghijmnopqrsuvxyz".split("");
  const charFor = (color: string) => {
    const known = byColor.get(color);
    if (known) return known;
    let ch = Object.entries(FACE_PALETTE).find(([, hex]) => hex === color)?.[0];
    while (!ch || ch in palette) ch = spare.shift();
    byColor.set(color, ch);
    palette[ch] = color;
    return ch;
  };
  const rows: string[] = [];
  for (let y = y0; y <= y1; y++) {
    let row = "";
    for (let x = x0; x <= x1; x++) {
      const c = draft.grid[y][x];
      row += c ? charFor(c) : ".";
    }
    rows.push(row);
  }
  const name = draft.name || "custom";
  return { name, label: name, x: draft.x + x0, y: draft.y + y0, rows, palette };
}

// Peak-to-peak rotation guidance per channel, shown beside a clip's own
// amplitude. Looser than the character budget — the horse's legs are stubs
// that only read when swung hard (SPUM's own gallop swings fetlocks ~100°+).
const HORSE_AMPLITUDE_BUDGET: Record<AaHorseChannel, number> = {
  root: 30,
  body: 40,
  neck: 45,
  head: 50,
  tail: 80,
  frontNear: 110,
  frontNearLow: 125,
  frontFar: 110,
  frontFarLow: 125,
  hindNear: 110,
  hindNearLow: 125,
  hindFar: 110,
  hindFarLow: 125,
};

type Props = {
  model: AaModel;
  onModelChange: (next: AaModel) => void;
  /** The project's characters — the Ride view mounts one on the horse. */
  characters: AaCharacter[];
  /** SPUM's character skeleton, for the rider's proportion compose. */
  baseSkeleton: Skeleton | null;
};

// The horse renders from a zero-size origin with the body ABOVE it and the
// legs around it, so it needs an explicit anchor rather than flex centring —
// same pattern as the character tabs' Rig.
function HorseRig({
  artHorse,
  animation,
  atlasOverride,
  clip,
  size,
  speed,
  paused,
  time,
  dim,
}: {
  artHorse: HorsePart;
  animation: HorseAnimation;
  atlasOverride?: SpriteAtlas;
  clip?: Clip;
  size: number;
  speed?: number;
  paused?: boolean;
  time?: number;
  dim?: boolean;
}) {
  return (
    <div
      className="absolute"
      // 72%: the horse is all ABOVE its origin (head top ~−34 source px,
      // hooves ~0), so the anchor sits low in the pane or the ears clip.
      style={{ left: "50%", top: "72%", opacity: dim ? 0.45 : 1 }}
    >
      <SpumHorse
        horse={artHorse}
        animation={animation}
        size={size}
        speed={speed}
        {...(atlasOverride ? { atlasOverride } : {})}
        {...(clip ? { clipOverride: clip } : {})}
        paused={paused}
        time={time}
      />
    </div>
  );
}

export function HorseTab({ model, onModelChange, characters, baseSkeleton }: Props) {
  const [view, setView] = useState<View>("draw");
  const [message, setMessage] = useState<string | null>(null);

  const flash = useCallback((text: string) => {
    setMessage(text);
    window.setTimeout(() => setMessage(null), 3000);
  }, []);

  const horse = useMemo(() => horseModelOf(model), [model]);
  const updateHorse = useCallback(
    (next: AaHorseModel) => onModelChange({ ...model, horse: next }),
    [model, onModelChange],
  );

  // --- drawing state -----------------------------------------------------

  const sheet = useMemo(() => packHorseSheet(), []);
  const [onionPart, setOnionPart] = useState<HorsePart>("Horse1");
  const [onion, setOnion] = useState<OnionSource | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [livePreview, setLivePreview] = useState<SpriteAtlas | null>(null);

  // PartCanvas publishes its working buffer as an atlas on every change —
  // including the ALL-TRANSPARENT buffer a fresh canvas starts with. Feeding
  // that to the rig as an override would render an invisible horse and mask
  // the SPUM-art fallback, so blank publishes count as "no live art". The
  // sheet is ~5k pixels; decoding it per publish is nothing.
  const handlePreview = useCallback((atlas: SpriteAtlas | null) => {
    if (!atlas) {
      setLivePreview(null);
      return;
    }
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext("2d");
      if (!ctx) {
        setLivePreview(atlas);
        return;
      }
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, c.width, c.height).data;
      let any = false;
      for (let i = 3; i < data.length; i += 4) {
        if (data[i] !== 0) {
          any = true;
          break;
        }
      }
      setLivePreview(any ? atlas : null);
    };
    img.onerror = () => setLivePreview(null);
    img.src = atlas.image;
  }, []);

  const activeName =
    editing === NEW_PART ? null : (editing ?? horse.parts[0]?.name ?? null);
  const savedPart = useMemo(
    () => (activeName ? findHorsePart(horse, activeName) : undefined),
    [horse, activeName],
  );
  const newName = useMemo(() => suggestHorsePartName(horse), [horse]);

  // The SPUM horse being traced over. Any of the 9 catalog horses works —
  // they all share one region layout, so the onion pairs by name.
  useEffect(() => {
    let cancelled = false;
    loadOnionSource(horseAtlasPath(onionPart))
      .then((src) => !cancelled && setOnion(src))
      .catch(() => !cancelled && setOnion(null));
    return () => {
      cancelled = true;
    };
  }, [onionPart]);

  const handleDelete = useCallback(() => {
    if (!savedPart) return;
    if (!window.confirm(`Delete "${savedPart.name}"? The PNG stays on disk.`)) return;
    updateHorse(removeHorsePart(horse, savedPart.name));
    setEditing(null);
  }, [savedPart, horse, updateHorse]);

  // --- preview / animation state -----------------------------------------

  const [animation, setAnimation] = useState<HorseAnimation>("idle");
  const [clipView, setClipView] = useState<"aa" | "spum">("aa");
  const [speed, setSpeed] = useState(1);
  // 0.85 fits the whole rig (with the taller AA head) in a 280px pane.
  const [zoom, setZoom] = useState(0.85);
  const [playing, setPlaying] = useState(true);
  const [frame, setFrame] = useState(0);
  const [selectedBeat, setSelectedBeat] = useState(0);
  const [spumClip, setSpumClip] = useState<Clip | null>(null);

  const clip = useMemo(() => resolveHorseClip(horse, animation), [horse, animation]);
  const source = horseClipSource(horse, animation);
  const stance = useMemo(() => horseStance(horse), [horse]);
  const compiled = useMemo(
    () => (clip ? compileHorseClip(clip, stance) : null),
    [clip, stance],
  );
  const frames = clip?.frames ?? HORSE_LOCKED_FRAMES[animation] ?? 30;

  // SPUM's clip of the same name — the A/B reference. Read-only.
  useEffect(() => {
    let cancelled = false;
    setSpumClip(null);
    fetch(`/spum/horse-anims/${animation}.json`)
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

  const problems = useMemo(() => (clip ? checkHorseClip(clip) : []), [clip]);
  const amplitude = useMemo(() => (clip ? horseClipAmplitude(clip) : {}), [clip]);

  // Custom-stamp editor draft. While it is open, the drafted feature
  // replaces that feature's pick in the live composite, so every painted
  // pixel and every nudge shows on the rig immediately.
  const [stampDraft, setStampDraft] = useState<StampDraft | null>(null);
  const draftStamp = useMemo(
    () => (stampDraft ? (draftToStamp(stampDraft, false) ?? undefined) : undefined),
    [stampDraft],
  );

  // What the rigs wear: unsaved canvas art > the selected saved AA horse >
  // SPUM's own art (so animation work never waits on drawing). The picked
  // face composites into the Head region asynchronously — and the picked hat
  // appends as a `Hat` region on the same pass; until they land the bare
  // atlas shows, so a slow decode never blanks the rig.
  const baseAtlas = livePreview ?? savedPart?.atlas ?? undefined;
  const face = savedPart?.face;
  const hat = savedPart?.hat;
  const helmetParts = useMemo(() => partsInSlot(model, "helmet"), [model]);
  const hatPart = useMemo(
    () => (hat ? helmetParts.find((p) => p.name === hat.name) : undefined),
    [hat, helmetParts],
  );
  const [facedAtlas, setFacedAtlas] = useState<SpriteAtlas | null>(null);
  useEffect(() => {
    let cancelled = false;
    const eyeStamp =
      stampDraft?.kind === "eyes"
        ? draftStamp
        : face?.eyes
          ? findFaceStamp("eyes", face.eyes, horse.faces)
          : undefined;
    const mouthStamp =
      stampDraft?.kind === "mouth"
        ? draftStamp
        : face?.mouth
          ? findFaceStamp("mouth", face.mouth, horse.faces)
          : undefined;
    if (!baseAtlas || (!eyeStamp && !mouthStamp && !(hat && hatPart))) {
      setFacedAtlas(null);
      return;
    }
    applyHorseStamps(baseAtlas, [eyeStamp, mouthStamp])
      .then((a) => applyHorseHat(a, hat, hatPart?.atlas))
      .then((a) => {
        if (!cancelled) setFacedAtlas(a);
      })
      .catch(() => {
        if (!cancelled) setFacedAtlas(null);
      });
    return () => {
      cancelled = true;
    };
  }, [baseAtlas, face, hat, hatPart, horse.faces, stampDraft?.kind, draftStamp]);
  const previewAtlas = facedAtlas ?? baseAtlas;

  const setFace = useCallback(
    (kind: "eyes" | "mouth", name: string | undefined) => {
      if (!savedPart) return;
      const next: HorseFacePick = { ...(savedPart.face ?? {}) };
      if (name === undefined) delete next[kind];
      else next[kind] = name;
      const part = { ...savedPart };
      if (next.eyes || next.mouth) part.face = next;
      else delete part.face;
      updateHorse(upsertHorsePart(horse, part));
    },
    [savedPart, horse, updateHorse],
  );

  const setHat = useCallback(
    (next: HorseHatPick | undefined) => {
      if (!savedPart) return;
      const part = { ...savedPart };
      if (next) part.hat = next;
      else delete part.hat;
      updateHorse(upsertHorsePart(horse, part));
    },
    [savedPart, horse, updateHorse],
  );

  // --- custom stamp editor -------------------------------------------------

  const openNewStamp = useCallback((kind: "eyes" | "mouth") => {
    setStampDraft({
      kind,
      editing: null,
      name: "",
      // Sensible starting spots: over the eye zone / the muzzle corner.
      x: kind === "eyes" ? 10 : 1,
      y: kind === "eyes" ? 5 : 13,
      grid: emptyGrid(),
    });
  }, []);

  const openEditStamp = useCallback(
    (kind: "eyes" | "mouth", name: string) => {
      const stamp = findFaceStamp(kind, name, horse.faces);
      if (!stamp) return;
      const grid = emptyGrid();
      const palette = stamp.palette ?? FACE_PALETTE;
      stamp.rows.forEach((row, dy) => {
        for (let dx = 0; dx < row.length && dx < STAMP_W; dx++) {
          if (dy < STAMP_H && row[dx] !== ".") grid[dy][dx] = palette[row[dx]] ?? null;
        }
      });
      setStampDraft({ kind, editing: name, name, x: stamp.x, y: stamp.y, grid });
    },
    [horse.faces],
  );

  const saveStamp = useCallback(() => {
    if (!stampDraft || !savedPart) return;
    if (!NAME_RE.test(stampDraft.name)) {
      flash("Stamp name must be letters/digits, starting with a letter");
      return;
    }
    const listKind = listKindOf(stampDraft.kind);
    const builtIn = faceStyleList(stampDraft.kind).some(
      (s) => s.name === stampDraft.name && !isCustomFaceStamp(stampDraft.kind, s.name, horse.faces),
    );
    if (builtIn) {
      flash(`"${stampDraft.name}" is a built-in style — pick another name`);
      return;
    }
    const stamp = draftToStamp(stampDraft, true);
    if (!stamp) {
      flash("Nothing painted yet");
      return;
    }
    stamp.name = stampDraft.name;
    stamp.label = stampDraft.name;
    let next = upsertFaceStamp(horse, listKind, stamp, stampDraft.editing ?? undefined);
    // Wear it immediately on the selected horse.
    const part = { ...(findHorsePart(next, savedPart.name) ?? savedPart) };
    part.face = { ...(part.face ?? {}), [stampDraft.kind]: stamp.name };
    next = upsertHorsePart(next, part);
    updateHorse(next);
    setStampDraft(null);
    flash(`Saved ${stampDraft.kind} stamp "${stamp.name}"`);
  }, [stampDraft, savedPart, horse, updateHorse, flash]);

  const deleteStamp = useCallback(() => {
    if (!stampDraft?.editing) return;
    if (!window.confirm(`Delete custom stamp "${stampDraft.editing}"?`)) return;
    updateHorse(removeFaceStamp(horse, listKindOf(stampDraft.kind), stampDraft.editing));
    setStampDraft(null);
  }, [stampDraft, horse, updateHorse]);

  const updateClip = useCallback(
    (next: AaHorseClip) => updateHorse(upsertHorseClip(horse, next)),
    [horse, updateHorse],
  );

  const editBeat = useCallback(
    (index: number, ch: AaHorseChannel, key: "rot" | "x" | "y", value: number) => {
      if (!clip) return;
      const beats = clip.beats.map((b, i) => {
        if (i !== index) return b;
        const current = horseChannelAt(b.pose, ch);
        return { ...b, pose: { ...b.pose, [ch]: { ...current, [key]: value } } };
      });
      // A looping clip's endpoints are the SAME pose — they move together.
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
      .writeText(horseClipToSource(clip))
      .then(() => flash("Beat sheet copied — paste into lib/aachar/horse/clips.ts"))
      .catch(() => flash("Clipboard blocked"));
  }, [clip, flash]);

  const beatFrames = clip?.beats.map((b) => b.frame) ?? [];
  const scrubTime = frame / AA_FPS;
  const paused = !playing;

  // --- ride state ---------------------------------------------------------

  const [riderName, setRiderName] = useState<string | null>(null);
  const [riderClipName, setRiderClipName] = useState("idle");
  const rider = horse.rider;

  const riderChar = useMemo<AaCharacter>(() => {
    const found = characters.find((c) => c.name === riderName);
    if (found) return found;
    // No pick: an implicit one-of-each character, same as the Model tab.
    const picks: Partial<Record<AaSlot, string>> = {};
    for (const slot of AA_SLOTS) {
      const first = partsInSlot(model, slot)[0];
      if (first) picks[slot] = first.name;
    }
    return { name: "(rider preview)", picks, skeleton: {} };
  }, [characters, riderName, model]);

  // The rider's look, through the same seams the other tabs use: base picks
  // → per-character recolour → cel shading. (Hat-hair masking and gaze are
  // skipped here — close-enough for the mount preview.)
  const riderRaw = useMemo(() => toAtlasOverrides(model, riderChar), [model, riderChar]);
  const riderRecolored = useRecoloredOverrides(model, riderChar, riderRaw);
  const riderOverrides = useShadedOverrides(model, riderChar, riderRecolored, "left");
  const riderSkeleton = useMemo(
    () =>
      baseSkeleton
        ? composeSkeleton(
            baseSkeleton,
            effectiveProportions(model, riderChar),
            effectiveZOrder(model),
          ).skeleton
        : null,
    [baseSkeleton, model, riderChar],
  );
  const riderAdjust = useMemo(() => toSlotAdjustments(riderChar), [riderChar]);
  const riderCompiled = useMemo(
    () => compiledRiderClip(model, riderClipName, rider),
    [model, riderClipName, rider],
  );

  const setRider = useCallback(
    (next: AaHorseRider | undefined) => {
      const h = { ...horse };
      if (next && Object.keys(next).length > 0) h.rider = next;
      else delete h.rider;
      updateHorse(h);
    },
    [horse, updateHorse],
  );

  const editRiderPose = useCallback(
    (ch: AaChannel, key: "rot" | "x" | "y", value: number) => {
      const pose = { ...riderPose(rider) };
      pose[ch] = { ...channelAt(pose, ch), [key]: value };
      setRider({ ...(rider ?? {}), pose });
    },
    [rider, setRider],
  );

  const toggleRiderHold = useCallback(
    (ch: AaChannel) => {
      const hold = riderHold(rider);
      const next = hold.includes(ch) ? hold.filter((c) => c !== ch) : [...hold, ch];
      setRider({ ...(rider ?? {}), hold: next });
    },
    [rider, setRider],
  );

  const editRiderOffset = useCallback(
    (axis: "x" | "y", value: number) => {
      if (!Number.isFinite(value)) return;
      setRider({ ...(rider ?? {}), offset: { ...riderOffset(rider), [axis]: value } });
    },
    [rider, setRider],
  );

  const header = (
    <header className="flex flex-wrap items-center gap-2 rounded border border-slate-300 bg-white p-3">
      {(["draw", "animate", "ride"] as View[]).map((v) => (
        <button
          key={v}
          onClick={() => setView(v)}
          className={`rounded px-3 py-1 text-sm capitalize ${
            view === v ? "bg-slate-900 text-white" : "border border-slate-300 hover:bg-slate-50"
          }`}
        >
          {v}
        </button>
      ))}
      <span className="text-xs text-slate-500">
        AA horse — original art + rebuilt clips on SPUM&apos;s horse skeleton
        (docs/aachar-horse-plan.md)
      </span>
      {message ? (
        <span className="ml-auto rounded bg-amber-100 px-2 py-1 text-xs text-amber-900">
          {message}
        </span>
      ) : null}
    </header>
  );

  // --- the shared animated preview panel (draw view's right column) -------

  const previewPanel = (
    <div className="sticky top-4 w-[360px] shrink-0 self-start space-y-2 rounded border border-slate-300 bg-white p-3">
      <h2 className="text-sm font-semibold">Preview</h2>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <select
          value={animation}
          onChange={(e) => setAnimation(e.target.value as HorseAnimation)}
          className="rounded border border-slate-300 px-1 py-0.5"
        >
          {HORSE_ANIMATIONS.map((n) => (
            <option key={n} value={n}>
              {horseClipSource(horse, n) === "override" ? "◆" : "●"} {n}
            </option>
          ))}
        </select>
        <div className="flex gap-1">
          {(["aa", "spum"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setClipView(s)}
              className={`rounded px-2 py-0.5 uppercase ${
                clipView === s
                  ? "bg-slate-900 text-white"
                  : "border border-slate-300 hover:bg-slate-50"
              }`}
              title={s === "aa" ? "The rebuilt AA clip" : "SPUM's original clip, for comparison"}
            >
              {s}
            </button>
          ))}
        </div>
      </div>
      <div className="relative h-[280px] overflow-hidden rounded bg-slate-200">
        <span className="absolute left-2 top-2 z-10 rounded bg-white/80 px-1 text-[10px] text-slate-600">
          {previewAtlas ? "AA art" : `no AA art yet — showing SPUM ${onionPart}`} ·{" "}
          {clipView === "aa" ? "AA clip" : "SPUM clip"}
        </span>
        <HorseRig
          artHorse={onionPart}
          animation={animation}
          atlasOverride={previewAtlas}
          clip={clipView === "aa" ? (compiled ?? undefined) : undefined}
          size={zoom}
          speed={speed}
        />
      </div>
      <label className="block text-xs text-slate-600">
        zoom {zoom.toFixed(2)}×
        <input
          type="range"
          min={0.4}
          max={3}
          step={0.05}
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          className="w-full"
        />
      </label>
      <label className="block text-xs text-slate-600">
        speed {speed.toFixed(2)}×
        <input
          type="range"
          min={0.25}
          max={3}
          step={0.05}
          value={speed}
          onChange={(e) => setSpeed(Number(e.target.value))}
          className="w-full"
        />
      </label>
      <p className="text-xs text-slate-500">
        Unsaved canvas art previews live. Until the first AA horse is saved,
        the rig wears the onion horse&apos;s SPUM art so clips can be judged.
      </p>
    </div>
  );

  return (
    <div className="min-w-[720px] flex-1 space-y-3">
      {header}

      {/* Kept MOUNTED and hidden on the animate view — the drawing buffer
          lives in PartCanvas's ref, so unmounting would discard unsaved
          pixels (same rule as the Body/Slots tabs in AaCharAdmin). */}
      <div className={view === "draw" ? "flex flex-wrap gap-4" : "hidden"}>
        <div className="min-w-[600px] flex-1">
          <PartCanvas
            // Remount per PART: buffer, undo stack and hydration are per-part.
            key={`horse:${activeName ?? NEW_PART}`}
            slot="horse"
            sheet={sheet}
            model={model}
            onModelChange={onModelChange}
            onPreview={handlePreview}
            savedPart={savedPart}
            defaultZoom={8}
            onion={onion}
            onionLabel={`SPUM ${onionPart}, aligned pivot-to-pivot per region — reference only, the pixels are yours.`}
            defaultName={savedPart?.name ?? newName}
            onSaved={setEditing}
            onPersist={({ name, atlas }) =>
              // Keep face/hat/tags across an overwrite of the same part —
              // only the pixels changed.
              updateHorse(
                upsertHorsePart(horse, {
                  ...(findHorsePart(horse, name) ?? {}),
                  name,
                  atlas,
                }),
              )
            }
          >
            <section className="rounded border border-slate-300 bg-white p-3">
              <h2 className="mb-2 text-sm font-semibold">Horses</h2>
              <div className="mb-2 flex flex-wrap gap-1">
                {horse.parts.map((p) => (
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
                <button
                  onClick={handleDelete}
                  className="mb-2 rounded border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50"
                >
                  Delete {savedPart.name}
                </button>
              ) : null}
              <p className="text-xs text-slate-500">
                One sheet per horse — head, neck, body halves, tail, saddle
                (Acc) and the four leg sprites. Regions keep SPUM&apos;s names
                (that&apos;s what routes them onto the rig) but each has 4px of
                extra room per side over SPUM&apos;s sizes.
              </p>
            </section>
            <section className="rounded border border-slate-300 bg-white p-3">
              <h2 className="mb-2 text-sm font-semibold">Onion horse</h2>
              <select
                value={onionPart}
                onChange={(e) => setOnionPart(e.target.value as HorsePart)}
                className="w-full rounded border border-slate-300 px-1 py-0.5 text-xs"
              >
                {HORSE_PART_LIST.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
              <p className="mt-2 text-xs text-slate-500">
                Any SPUM horse as the underlay — they all share one region
                layout. The preview rig also wears this horse&apos;s art until
                an AA horse is saved.
              </p>
            </section>
            <section className="rounded border border-slate-300 bg-white p-3">
              <h2 className="mb-1 text-sm font-semibold">Face</h2>
              <p className="mb-2 text-xs text-slate-500">
                Eyes and mouth, picked per horse and composited into the Head
                region at render time — locked to the head bone, so they ride
                every nod. &ldquo;drawn&rdquo; leaves the canvas art untouched.
              </p>
              {savedPart ? (
                <>
                  <FacePickerRow
                    label="Eyes"
                    styles={faceStyleList("eyes", horse.faces)}
                    customNames={new Set((horse.faces?.eyes ?? []).map((s) => s.name))}
                    picked={savedPart.face?.eyes}
                    onPick={(name) => setFace("eyes", name)}
                    onNew={() => openNewStamp("eyes")}
                    onEditCustom={(name) => openEditStamp("eyes", name)}
                  />
                  <FacePickerRow
                    label="Mouth"
                    styles={faceStyleList("mouth", horse.faces)}
                    customNames={new Set((horse.faces?.mouths ?? []).map((s) => s.name))}
                    picked={savedPart.face?.mouth}
                    onPick={(name) => setFace("mouth", name)}
                    onNew={() => openNewStamp("mouth")}
                    onEditCustom={(name) => openEditStamp("mouth", name)}
                  />
                  {stampDraft ? (
                    <StampEditor
                      draft={stampDraft}
                      onChange={setStampDraft}
                      onSave={saveStamp}
                      onDelete={stampDraft.editing ? deleteStamp : undefined}
                      onCancel={() => setStampDraft(null)}
                      underlayAtlas={baseAtlas}
                    />
                  ) : null}
                </>
              ) : (
                <p className="text-xs text-amber-700">
                  Save the horse first — face picks live on the saved part.
                </p>
              )}
            </section>
            <section className="rounded border border-slate-300 bg-white p-3">
              <h2 className="mb-1 text-sm font-semibold">Hat</h2>
              <p className="mb-2 text-xs text-slate-500">
                Any character hat, seated on the crown and composited into the
                atlas — locked to the head bone, so it rides every nod. Nudge
                is in source px (+x right, +y up).
              </p>
              {savedPart ? (
                <>
                  <div className="flex items-center gap-2">
                    <select
                      value={hat?.name ?? ""}
                      onChange={(e) =>
                        setHat(
                          e.target.value
                            ? { ...(hat ?? {}), name: e.target.value }
                            : undefined,
                        )
                      }
                      className="min-w-0 flex-1 rounded border border-slate-300 px-1 py-0.5 text-xs"
                    >
                      <option value="">none</option>
                      {helmetParts.map((p) => (
                        <option key={p.name} value={p.name}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                    {hatPart ? (
                      <img
                        src={hatPart.atlas.image}
                        alt={hatPart.name}
                        className="h-10 w-auto shrink-0"
                        style={{ imageRendering: "pixelated" }}
                      />
                    ) : null}
                  </div>
                  {hat && !hatPart ? (
                    <p className="mt-1 text-xs text-amber-700">
                      Hat &ldquo;{hat.name}&rdquo; no longer exists — the horse
                      renders bare-headed.
                    </p>
                  ) : null}
                  {hat ? (
                    <div className="mt-2 flex items-center gap-2 text-xs text-slate-600">
                      <label className="flex items-center gap-1">
                        dx
                        <input
                          type="number"
                          value={hat.dx ?? 0}
                          onChange={(e) => {
                            const v = Number(e.target.value);
                            const next: HorseHatPick = { ...hat };
                            if (v) next.dx = v;
                            else delete next.dx;
                            setHat(next);
                          }}
                          className="w-14 rounded border border-slate-300 px-1 py-0.5"
                        />
                      </label>
                      <label className="flex items-center gap-1">
                        dy
                        <input
                          type="number"
                          value={hat.dy ?? 0}
                          onChange={(e) => {
                            const v = Number(e.target.value);
                            const next: HorseHatPick = { ...hat };
                            if (v) next.dy = v;
                            else delete next.dy;
                            setHat(next);
                          }}
                          className="w-14 rounded border border-slate-300 px-1 py-0.5"
                        />
                      </label>
                      <button
                        onClick={() => setHat({ name: hat.name })}
                        className="rounded border border-slate-300 px-2 py-0.5 hover:bg-slate-50"
                      >
                        reset
                      </button>
                    </div>
                  ) : null}
                </>
              ) : (
                <p className="text-xs text-amber-700">
                  Save the horse first — the hat pick lives on the saved part.
                </p>
              )}
            </section>
          </PartCanvas>
        </div>
        {previewPanel}
      </div>

      {view === "animate" ? (
        <div className="space-y-3">
          <section className="rounded border border-slate-300 bg-white p-3">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <select
                value={animation}
                onChange={(e) => setAnimation(e.target.value as HorseAnimation)}
                className="rounded border border-slate-300 px-2 py-1 text-sm"
              >
                {HORSE_ANIMATIONS.map((n) => (
                  <option key={n} value={n}>
                    {horseClipSource(horse, n) === "override" ? "◆" : "●"} {n}
                  </option>
                ))}
              </select>
              <span
                className={`rounded px-2 py-1 text-xs ${
                  source === "override"
                    ? "bg-sky-100 text-sky-900"
                    : "bg-emerald-100 text-emerald-900"
                }`}
              >
                {source === "override" ? "project override" : "AA horse library"}
              </span>
              <span className="text-xs text-slate-500">{frames}f</span>
              <button
                onClick={() => setPlaying((p) => !p)}
                className="rounded border border-slate-300 px-2 py-1 text-sm hover:bg-slate-50"
              >
                {playing ? "Pause" : "Play"}
              </button>
              <label className="ml-auto text-xs text-slate-600">zoom {zoom.toFixed(2)}×</label>
              <input
                type="range"
                min={0.4}
                max={3}
                step={0.05}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="w-32"
              />
            </div>

            <div className="flex gap-3">
              <div className="relative h-[280px] flex-1 overflow-hidden rounded bg-slate-200">
                <span className="absolute left-2 top-2 z-10 rounded bg-white/80 px-1 text-[10px] text-slate-600">
                  AA
                </span>
                <HorseRig
                  artHorse={onionPart}
                  animation={animation}
                  atlasOverride={previewAtlas}
                  clip={compiled ?? undefined}
                  size={zoom}
                  paused={paused}
                  time={scrubTime}
                />
              </div>
              <div className="relative h-[280px] flex-1 overflow-hidden rounded bg-slate-200">
                <span className="absolute left-2 top-2 z-10 rounded bg-white/80 px-1 text-[10px] text-slate-600">
                  SPUM reference
                </span>
                {spumClip ? (
                  <HorseRig
                    artHorse={onionPart}
                    animation={animation}
                    atlasOverride={previewAtlas}
                    clip={spumClip}
                    size={zoom}
                    paused={paused}
                    time={scrubTime}
                  />
                ) : (
                  <span className="absolute inset-0 flex items-center justify-center text-xs text-slate-500">
                    Loading reference clip…
                  </span>
                )}
              </div>
            </div>

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
                    <span className="ml-1 text-[10px] opacity-70">{clip?.beats[i].role}</span>
                  </button>
                ))}
              </div>
            </div>
          </section>

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
                        updateHorse(revertHorseClip(horse, animation));
                        flash("Reverted to the AA horse library version");
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
                No AA beat sheet for <code>{animation}</code>.
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
                <HorseBeatEditor
                  beat={clip.beats[selectedBeat]}
                  onEdit={(ch, key, value) => editBeat(selectedBeat, ch, key, value)}
                />
                {clip.loop && (selectedBeat === 0 || selectedBeat === clip.beats.length - 1) ? (
                  <p className="mt-2 rounded bg-slate-50 p-2 text-xs text-slate-600">
                    This is a loop endpoint — edits here are applied to the
                    other end too, or the clip would snap every cycle.
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
                  {HORSE_CHANNELS.filter((ch) => amplitude[ch]).map((ch) => {
                    const a = amplitude[ch];
                    if (!a) return null;
                    const over = a.rot > HORSE_AMPLITUDE_BUDGET[ch];
                    return (
                      <tr key={ch} className="border-t border-slate-100">
                        <td className="py-0.5 text-slate-600">{HORSE_CHANNEL_LABELS[ch]}</td>
                        <td
                          className={`text-right tabular-nums ${over ? "font-semibold text-amber-700" : ""}`}
                        >
                          {a.rot.toFixed(1)}
                        </td>
                        <td className="text-right tabular-nums text-slate-400">
                          {HORSE_AMPLITUDE_BUDGET[ch]}
                        </td>
                        <td className="text-right tabular-nums">{a.x.toFixed(1)}</td>
                        <td className="text-right tabular-nums">{a.y.toFixed(1)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : null}
            <p className="mt-2 text-xs text-slate-500">
              All 12 clips ship rebuilt in <code>lib/aachar/horse/clips.ts</code>.
              Edits here save as project overrides (autosaved to the manifest);
              &ldquo;Copy TS&rdquo; promotes a tuned clip back into the library
              file. {AA_HORSE_CLIPS[animation] ? null : "This name has no library entry."}
            </p>
          </section>
        </div>
      ) : null}

      {view === "ride" ? (
        <div className="flex flex-wrap gap-4">
          <div className="w-80 shrink-0 space-y-3">
            <section className="rounded border border-slate-300 bg-white p-3">
              <h2 className="mb-2 text-sm font-semibold">Rider</h2>
              <label className="mb-1 block text-xs text-slate-600">Character</label>
              <select
                value={riderName ?? ""}
                onChange={(e) => setRiderName(e.target.value || null)}
                className="mb-2 w-full rounded border border-slate-300 px-1 py-0.5 text-xs"
              >
                <option value="">(model preview)</option>
                {characters.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
              <label className="mb-1 block text-xs text-slate-600">Rider animation</label>
              <select
                value={riderClipName}
                onChange={(e) => setRiderClipName(e.target.value)}
                className="mb-2 w-full rounded border border-slate-300 px-1 py-0.5 text-xs"
              >
                {AA_CLIP_NAMES.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-1 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={rider?.rightArmBehind ?? true}
                  onChange={(e) => setRider({ ...(rider ?? {}), rightArmBehind: e.target.checked })}
                />
                right arm + weapon behind the horse
              </label>
              <p className="mt-2 text-xs text-slate-500">
                Every character animation plays while mounted — the held
                channels below are frozen to the riding pose, the rest of the
                clip runs as authored (the carry-clip mechanism).
              </p>
            </section>

            <section className="rounded border border-slate-300 bg-white p-3">
              <div className="mb-1 flex items-center gap-2">
                <h2 className="text-sm font-semibold">Riding pose</h2>
                <button
                  onClick={() => {
                    const next = { ...(rider ?? {}) };
                    delete next.pose;
                    delete next.hold;
                    delete next.offset;
                    setRider(Object.keys(next).length ? next : undefined);
                    flash("Riding pose reset to the default straddle");
                  }}
                  className="rounded border border-slate-300 px-2 py-0.5 text-xs hover:bg-slate-50"
                >
                  Reset
                </button>
              </div>
              <p className="mb-2 text-xs text-slate-500">
                Held channels freeze at stance + these deltas. Legs only by
                default; hold the arms too for a locked rein grip. Saved on
                the model — all characters share the straddle.
              </p>
              <table className="w-full text-xs">
                <thead className="text-left text-slate-500">
                  <tr>
                    <th className="py-1">hold</th>
                    <th>channel</th>
                    <th className="text-right">rot°</th>
                    <th className="text-right">x px</th>
                    <th className="text-right">y px</th>
                  </tr>
                </thead>
                <tbody>
                  {AA_CHANNELS.map((ch) => {
                    const held = riderHold(rider).includes(ch);
                    const v = channelAt(riderPose(rider), ch);
                    return (
                      <tr key={ch} className="border-t border-slate-100">
                        <td className="py-0.5">
                          <input
                            type="checkbox"
                            checked={held}
                            onChange={() => toggleRiderHold(ch)}
                          />
                        </td>
                        <td className="py-0.5 text-slate-600">{CHANNEL_LABELS[ch]}</td>
                        {(["rot", "x", "y"] as const).map((k) => (
                          <td key={k} className="py-0.5 text-right">
                            <input
                              type="number"
                              step={k === "rot" ? 1 : 0.5}
                              value={Number(v[k].toFixed(2))}
                              disabled={!held}
                              onChange={(e) => editRiderPose(ch, k, Number(e.target.value))}
                              className="w-14 rounded border border-slate-300 px-1 py-0.5 text-right tabular-nums disabled:bg-slate-100 disabled:text-slate-400"
                            />
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="mt-2 flex items-center gap-2 text-xs text-slate-600">
                <span title="Rider offset from the saddle bone, css px at size 1. Negative y lifts.">
                  saddle offset
                </span>
                {(["x", "y"] as const).map((axis) => (
                  <label key={axis} className="flex items-center gap-1">
                    {axis}
                    <input
                      type="number"
                      step={1}
                      value={riderOffset(rider)[axis]}
                      onChange={(e) => editRiderOffset(axis, Number(e.target.value))}
                      className="w-14 rounded border border-slate-300 px-1 py-0.5 text-right tabular-nums"
                    />
                  </label>
                ))}
                <span className="text-slate-400">default {DEFAULT_RIDER_OFFSET.x},{DEFAULT_RIDER_OFFSET.y}</span>
              </div>
            </section>
          </div>

          <section className="min-w-[480px] flex-1 rounded border border-slate-300 bg-white p-3">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <select
                value={animation}
                onChange={(e) => setAnimation(e.target.value as HorseAnimation)}
                className="rounded border border-slate-300 px-2 py-1 text-sm"
                title="Horse animation"
              >
                {HORSE_ANIMATIONS.map((n) => (
                  <option key={n} value={n}>
                    🐴 {n}
                  </option>
                ))}
              </select>
              <label className="ml-auto text-xs text-slate-600">zoom {zoom.toFixed(2)}×</label>
              <input
                type="range"
                min={0.4}
                max={3}
                step={0.05}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="w-32"
              />
              <label className="text-xs text-slate-600">speed {speed.toFixed(2)}×</label>
              <input
                type="range"
                min={0.25}
                max={3}
                step={0.05}
                value={speed}
                onChange={(e) => setSpeed(Number(e.target.value))}
                className="w-32"
              />
            </div>
            <div className="relative h-[420px] overflow-hidden rounded bg-slate-200">
              <span className="absolute left-2 top-2 z-10 rounded bg-white/80 px-1 text-[10px] text-slate-600">
                {riderChar.name} riding {activeName ?? `SPUM ${onionPart}`} · horse {animation} ·
                rider {riderClipName}
              </span>
              <MountedRig
                artHorse={onionPart}
                horseAnimation={animation}
                horseAtlas={previewAtlas}
                horseClip={compiled ?? undefined}
                riderSkeleton={riderSkeleton}
                riderOverrides={riderOverrides}
                riderAdjust={riderAdjust}
                riderAnimation={riderClipName}
                riderClip={riderCompiled ?? undefined}
                size={zoom}
                speed={speed}
                offset={riderOffset(rider)}
                rightArmBehind={rider?.rightArmBehind ?? true}
              />
            </div>
            <p className="mt-2 text-xs text-slate-500">
              The rider is glued to the saddle bone each frame, so the horse&apos;s
              bob carries through automatically. The far-side leg (and
              optionally arm + weapon) render behind the horse — that&apos;s the
              straddle. Scene mounting of AA horses/riders stays a follow-up;
              this view is where the pose gets dialled in first.
            </p>
          </section>
        </div>
      ) : null}
    </div>
  );
}

// The mounted composite: horse + a rider drawn twice for side-view depth
// (back-side slices behind the horse, the rest in front), glued to the
// saddle bone every frame via the E16 bone-transform export.
function MountedRig({
  artHorse,
  horseAnimation,
  horseAtlas,
  horseClip,
  riderSkeleton,
  riderOverrides,
  riderAdjust,
  riderAnimation,
  riderClip,
  size,
  speed,
  offset,
  rightArmBehind,
}: {
  artHorse: HorsePart;
  horseAnimation: HorseAnimation;
  horseAtlas?: SpriteAtlas;
  horseClip?: Clip;
  riderSkeleton: Skeleton | null;
  riderOverrides: Partial<Record<SpumSlot, SpriteAtlas>>;
  riderAdjust?: Partial<Record<SpumSlot, PartNudge>>;
  riderAnimation: string;
  riderClip?: Clip;
  size: number;
  speed: number;
  offset: { x: number; y: number };
  rightArmBehind: boolean;
}) {
  const horseBoneRef = useRef<BoneTransformMap | null>(null);
  const backRef = useRef<HTMLDivElement | null>(null);
  const frontRef = useRef<HTMLDivElement | null>(null);
  // The glue loop reads these refs so prop changes never restart the rAF.
  const glueRef = useRef({ x: offset.x, y: offset.y, size });
  useEffect(() => {
    glueRef.current = { x: offset.x, y: offset.y, size };
  }, [offset.x, offset.y, size]);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const saddle = horseBoneRef.current?.get(HORSE_SADDLE_BONE);
      if (saddle) {
        const g = glueRef.current;
        // Offset is authored at size 1 and scales with the preview so the
        // seat stays seated at every zoom.
        const t = `translate(${saddle.x + g.x * g.size}px, ${saddle.y + g.y * g.size}px) rotate(${saddle.rotation}deg)`;
        if (backRef.current) backRef.current.style.transform = t;
        if (frontRef.current) frontRef.current.style.transform = t;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const backSlices = useMemo(
    () =>
      new Set(
        rightArmBehind
          ? [...RIDER_BACK_LEG_SLICES, ...RIDER_BACK_ARM_SLICES]
          : RIDER_BACK_LEG_SLICES,
      ),
    [rightArmBehind],
  );

  const riderCommon = riderSkeleton
    ? {
        config: AA_RENDER_CONFIG,
        animation: riderAnimation as never,
        size,
        speed,
        atlasOverrides: riderOverrides,
        slotAdjustments: riderAdjust,
        skeletonOverride: riderSkeleton,
        ...(riderClip ? { clipOverride: riderClip } : {}),
      }
    : null;

  return (
    <div className="absolute" style={{ left: "50%", top: "72%" }}>
      {/* Back-side-only rider copy — BEFORE the horse in DOM order so it
          paints behind (no z-index: it would force a stacking context). */}
      {riderCommon ? (
        <div ref={backRef} style={{ position: "absolute", left: 0, top: 0 }}>
          <SpumCharacter {...riderCommon} visibleSlices={backSlices} />
        </div>
      ) : null}
      <SpumHorse
        horse={artHorse}
        animation={horseAnimation}
        size={size}
        speed={speed}
        {...(horseAtlas ? { atlasOverride: horseAtlas } : {})}
        {...(horseClip ? { clipOverride: horseClip } : {})}
        boneTransformRef={horseBoneRef}
      />
      {riderCommon ? (
        <div ref={frontRef} style={{ position: "absolute", left: 0, top: 0 }}>
          <SpumCharacter {...riderCommon} hiddenSlices={backSlices} />
        </div>
      ) : null}
    </div>
  );
}

// One row of face-style buttons: a "drawn" (no-stamp) option, each style as
// a pixelated thumbnail (custom ones get an ✎ edit affordance), and
// "+ custom" opening the stamp editor. Thumbnails are data URLs per render
// of the style list — it only changes when a custom stamp is saved.
function FacePickerRow({
  label,
  styles,
  customNames,
  picked,
  onPick,
  onNew,
  onEditCustom,
}: {
  label: string;
  styles: HorseFaceStamp[];
  customNames: Set<string>;
  picked: string | undefined;
  onPick: (name: string | undefined) => void;
  onNew: () => void;
  onEditCustom: (name: string) => void;
}) {
  const thumbs = useMemo(
    () => Object.fromEntries(styles.map((s) => [s.name, stampToDataUrl(s)])),
    [styles],
  );
  return (
    <div className="mb-2">
      <div className="mb-1 text-xs text-slate-600">{label}</div>
      <div className="flex flex-wrap items-center gap-1">
        <button
          onClick={() => onPick(undefined)}
          className={`rounded px-2 py-1 text-xs ${
            picked === undefined
              ? "bg-slate-900 text-white"
              : "border border-slate-300 hover:bg-slate-50"
          }`}
          title="No stamp — whatever is drawn on the canvas shows"
        >
          drawn
        </button>
        {styles.map((s) => (
          <span key={s.name} className="flex items-center">
            <button
              onClick={() => onPick(s.name)}
              className={`flex items-center gap-1 rounded px-2 py-1 text-xs ${
                picked === s.name
                  ? "bg-slate-900 text-white"
                  : "border border-slate-300 hover:bg-slate-50"
              }`}
              title={s.label}
            >
              {thumbs[s.name] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={thumbs[s.name]}
                  // Decorative — the label text sits right beside it, and a
                  // non-empty alt would double the button's accessible name.
                  alt=""
                  style={{
                    width: Math.max(...s.rows.map((r) => r.length)) * 4,
                    height: s.rows.length * 4,
                    imageRendering: "pixelated",
                  }}
                />
              ) : null}
              {s.label}
            </button>
            {customNames.has(s.name) ? (
              <button
                onClick={() => onEditCustom(s.name)}
                className="ml-0.5 rounded border border-slate-300 px-1 py-0.5 text-[10px] text-slate-600 hover:bg-slate-50"
                title={`Edit custom stamp "${s.label}"`}
              >
                ✎
              </button>
            ) : null}
          </span>
        ))}
        <button
          onClick={onNew}
          className="rounded border border-dashed border-slate-400 px-2 py-1 text-xs hover:bg-slate-50"
          title="Draw your own stamp"
        >
          + custom
        </button>
      </div>
    </div>
  );
}

// The custom-stamp pixel editor: a small paint grid with the horse's own
// head art ghosted underneath at the stamp's position, so the feature is
// drawn in place. Every paint and nudge previews live on the rig (the draft
// replaces its feature in the face composite while this is open).
function StampEditor({
  draft,
  onChange,
  onSave,
  onDelete,
  onCancel,
  underlayAtlas,
}: {
  draft: StampDraft;
  onChange: (next: StampDraft) => void;
  onSave: () => void;
  onDelete?: () => void;
  onCancel: () => void;
  underlayAtlas?: SpriteAtlas;
}) {
  const [color, setColor] = useState("#1a1c2c");
  const [erasing, setErasing] = useState(false);
  const paintingRef = useRef(false);
  useEffect(() => {
    const up = () => {
      paintingRef.current = false;
    };
    window.addEventListener("mouseup", up);
    return () => window.removeEventListener("mouseup", up);
  }, []);

  const paint = (x: number, y: number) => {
    const next = draft.grid.map((row) => [...row]);
    next[y][x] = erasing ? null : color;
    onChange({ ...draft, grid: next });
  };

  const head = underlayAtlas?.regions.Head;
  const swatches = [
    "#1a1c2c", "#f4f4f4", "#ef7d57", "#c9976d", "#e8c39e",
    "#333c57", "#b13e53", "#ffcd75", "#3b5dc9", "#38b764",
  ];
  const nudge = (dx: number, dy: number) =>
    onChange({
      ...draft,
      x: Math.max(0, Math.min(24, draft.x + dx)),
      y: Math.max(0, Math.min(22, draft.y + dy)),
    });

  return (
    <div className="mt-2 rounded border border-slate-400 bg-slate-50 p-2">
      <div className="mb-1 flex items-center gap-2 text-xs">
        <span className="font-semibold">
          {draft.editing ? `Edit ${draft.kind} stamp` : `New ${draft.kind} stamp`}
        </span>
        <input
          value={draft.name}
          onChange={(e) => onChange({ ...draft, name: e.target.value })}
          placeholder="name"
          className="w-24 rounded border border-slate-300 px-1 py-0.5"
        />
      </div>

      <div
        className="relative"
        style={{ width: STAMP_W * STAMP_CELL, height: STAMP_H * STAMP_CELL }}
      >
        {/* The horse's head art, ghosted and aligned so grid cell (0,0) is
            head pixel (x,y) — the feature is drawn where it will live. */}
        {underlayAtlas && head ? (
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage: `url(${underlayAtlas.image})`,
              backgroundSize: `${underlayAtlas.width * STAMP_CELL}px ${underlayAtlas.height * STAMP_CELL}px`,
              backgroundPosition: `${-(head.x + draft.x) * STAMP_CELL}px ${-(head.y + draft.y) * STAMP_CELL}px`,
              imageRendering: "pixelated",
              opacity: 0.4,
            }}
          />
        ) : null}
        {draft.grid.map((row, y) =>
          row.map((cell, x) => (
            <div
              key={`${x},${y}`}
              onMouseDown={(e) => {
                e.preventDefault();
                paintingRef.current = true;
                paint(x, y);
              }}
              onMouseEnter={() => {
                if (paintingRef.current) paint(x, y);
              }}
              className="absolute border border-slate-300/60"
              style={{
                left: x * STAMP_CELL,
                top: y * STAMP_CELL,
                width: STAMP_CELL,
                height: STAMP_CELL,
                background: cell ?? "transparent",
                cursor: "crosshair",
              }}
            />
          )),
        )}
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-1">
        {swatches.map((hex) => (
          <button
            key={hex}
            onClick={() => {
              setColor(hex);
              setErasing(false);
            }}
            className={`h-5 w-5 rounded border ${
              color === hex && !erasing ? "border-slate-900 ring-1 ring-slate-900" : "border-slate-300"
            }`}
            style={{ background: hex }}
            title={hex}
          />
        ))}
        <input
          type="color"
          value={color}
          onChange={(e) => {
            setColor(e.target.value);
            setErasing(false);
          }}
          className="h-5 w-7 cursor-pointer border-0 bg-transparent p-0"
          title="Any colour"
        />
        <button
          onClick={() => setErasing(true)}
          className={`rounded px-2 py-0.5 text-xs ${
            erasing ? "bg-slate-900 text-white" : "border border-slate-300 hover:bg-white"
          }`}
        >
          eraser
        </button>
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-1 text-xs">
        <span className="text-slate-600">position</span>
        <button onClick={() => nudge(-1, 0)} className="rounded border border-slate-300 px-1.5 hover:bg-white">←</button>
        <button onClick={() => nudge(1, 0)} className="rounded border border-slate-300 px-1.5 hover:bg-white">→</button>
        <button onClick={() => nudge(0, -1)} className="rounded border border-slate-300 px-1.5 hover:bg-white">↑</button>
        <button onClick={() => nudge(0, 1)} className="rounded border border-slate-300 px-1.5 hover:bg-white">↓</button>
        <span className="tabular-nums text-slate-500">
          {draft.x},{draft.y} in head px
        </span>
      </div>

      <div className="mt-2 flex gap-2">
        <button
          onClick={onSave}
          className="rounded bg-slate-900 px-3 py-1 text-xs text-white hover:bg-slate-700"
        >
          Save stamp
        </button>
        {onDelete ? (
          <button
            onClick={onDelete}
            className="rounded border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50"
          >
            Delete
          </button>
        ) : null}
        <button
          onClick={onCancel}
          className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-white"
        >
          Cancel
        </button>
      </div>
      <p className="mt-1 text-xs text-slate-500">
        Paint over the ghosted head; the rig preview updates live. Saved
        stamps are trimmed to their painted pixels and join the picker for
        every horse.
      </p>
    </div>
  );
}

// Numeric pose editing for one beat — deltas over stance+rest, same contract
// as the character BeatEditor but over the 13 horse channels.
function HorseBeatEditor({
  beat,
  onEdit,
}: {
  beat: AaHorseBeat;
  onEdit: (ch: AaHorseChannel, key: "rot" | "x" | "y", value: number) => void;
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
          {HORSE_CHANNELS.map((ch) => {
            const v = horseChannelAt(beat.pose, ch);
            return (
              <tr key={ch} className="border-t border-slate-100">
                <td className="py-0.5 text-slate-600">{HORSE_CHANNEL_LABELS[ch]}</td>
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
