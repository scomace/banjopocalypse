// The Sprite Baker: aachar DOM paper-doll rig -> flat spritesheet frames.
//
// The aachar runtime renders characters as a bone-tree of absolutely
// positioned divs (lib/spum/SpumCharacter.tsx). Gorgeous, but too heavy to
// run per-actor inside the game scene. This module produces classic
// spritesheets instead: it reuses the runtime's OWN loaders (manifest bundle,
// baked look pipeline, compiled AA clips) and re-implements only the final
// transform composition on an offscreen canvas.
//
// The math here mirrors SpumCharacter.tsx's rAF phases exactly:
//   local  = translate(pos.x*unitPx, -pos.y*unitPx) rotate(-rotZ)
//   world  = parent world ∘ local  (translate rotated into parent frame)
//   slice  = world ∘ rotate(slice.rot) ∘ scale(S*sx*flip, S*sy)
//            ∘ translate(-pivotX*w, -(1-pivotY)*h)
// with visibility accumulated up the bone chain (clip vis tracks stepwise,
// else Bone.defaultActive), z = bone.sortingOrder (+EYE_Z_LIFT on eye bones),
// stable insertion order breaking ties (slot declaration order).
//
// The AA path never routes shields, never hides hair, and never fetches the
// stock Eye_Close sibling (empty CharacterConfig — see lib/aachar/render.ts),
// so none of that machinery is replicated.

import { SLOT_REGION_TO_BONE } from "@/lib/spum/SpumCharacter";
import type { SpumSlot } from "@/lib/spum/catalog";
import { FREE_EYE_REGION } from "@/lib/spum/freeEye";
import { composeNudge, type PartNudge } from "@/lib/spum/partAdjustments";
import { samplePos, sampleRotZ, sampleVis } from "@/lib/spum/curve";
import type { Bone, Clip, Skeleton, SpriteAtlas } from "@/lib/spum/types";
import {
  aaSceneLookKey,
  cachedAaSceneLook,
  compiledAaClip,
  loadAaSceneBundle,
  resolveAaSceneActor,
  type AaLookOverrides,
  type ResolvedAaActor,
} from "@/lib/aachar/sceneCast";

/** Integer sprite scale baked into the sheets: 2 canvas px per source px.
 *  Characters land ~80px tall, crisp at the game's 32px tile scale. */
const BAKE_SCALE = 2;
const UNIT_PX = 32 * BAKE_SCALE;
const EYE_Z_LIFT = 8;
const EYE_BONE_PREFIX = "Root/BodySet/P_Body/HeadSet/P_Head/P_Eye/";
const FREE_EYE_BASE_DX = 4;
const FRAME_PAD = 3;

/** Game animation set -> AA clip names (all 9 exist as original AA clips). */
export const BAKED_CLIPS: Record<string, { aaClip: string; fps: number; loop: boolean }> = {
  idle: { aaClip: "idle", fps: 10, loop: true },
  run: { aaClip: "move", fps: 12, loop: true },
  jump: { aaClip: "jump", fps: 12, loop: false },
  blow: { aaClip: "throw", fps: 16, loop: false },
  belch: { aaClip: "buff", fps: 12, loop: false },
  hit: { aaClip: "damaged", fps: 12, loop: false },
  die: { aaClip: "die", fps: 10, loop: false },
  victory: { aaClip: "greeting1", fps: 10, loop: true },
  goof: { aaClip: "sit", fps: 10, loop: false },
};
const MAX_FRAMES_PER_CLIP = 16;

export type BakedClipInfo = {
  start: number;
  count: number;
  fps: number;
  loop: boolean;
};

export type BakedCharacter = {
  name: string;
  sheet: HTMLCanvasElement;
  frameW: number;
  frameH: number;
  columns: number;
  /** Root-bone origin inside a frame, canvas px. */
  anchorX: number;
  anchorY: number;
  /** Feet line (lowest visible pixel across all frames), canvas px. */
  groundY: number;
  clips: Record<string, BakedClipInfo>;
};

type FlatSlice = {
  bonePath: string;
  image: HTMLImageElement;
  smooth: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  pivotX: number;
  pivotY: number;
  scaleX: number;
  scaleY: number;
  rot: number;
  flipX: boolean;
  sortingOrder: number;
};

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("baker: atlas image failed to load"));
    img.src = src;
  });
}

/** Mirror of SpumCharacter's slicesByBone construction, AA path only. */
async function buildSlices(
  look: AaLookOverrides,
  slotAdjustments: ResolvedAaActor["slotAdjustments"],
  bonesByPath: Map<string, Bone>,
): Promise<FlatSlice[]> {
  const images = new Map<string, HTMLImageElement>();
  for (const atlas of Object.values(look)) {
    if (atlas && !images.has(atlas.image)) {
      images.set(atlas.image, await loadImage(atlas.image));
    }
  }

  const out: FlatSlice[] = [];
  const push = (
    bonePath: string,
    atlas: SpriteAtlas,
    region: SpriteAtlas["regions"][string],
    adj: PartNudge | undefined,
  ) => {
    const bone = bonesByPath.get(bonePath);
    if (!bone) return;
    const img = images.get(atlas.image);
    if (!img) return;
    const dx = (adj?.flipX ? -1 : 1) * (adj?.dx ?? 0);
    const dy = adj?.dy ?? 0;
    const k =
      atlas.pixelDensity && atlas.pixelDensity !== 1 ? 1 / atlas.pixelDensity : 1;
    const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
    const eyeLift = bonePath.startsWith(EYE_BONE_PREFIX) ? EYE_Z_LIFT : 0;
    out.push({
      bonePath,
      image: img,
      smooth: atlas.smooth ?? false,
      x: region.x,
      y: region.y,
      width: region.width,
      height: region.height,
      pivotX: clamp01(region.pivot.x) - dx / region.width,
      pivotY: clamp01(region.pivot.y) - dy / region.height,
      scaleX: (adj?.scaleX ?? 1) * k,
      scaleY: (adj?.scaleY ?? 1) * k,
      rot: adj?.rot ?? 0,
      flipX: adj?.flipX ?? false,
      sortingOrder: (bone.sortingOrder ?? 0) + eyeLift,
    });
  };

  (Object.keys(SLOT_REGION_TO_BONE) as SpumSlot[]).forEach((slot) => {
    const atlas = look[slot];
    if (!atlas) return;
    const regionToBone = SLOT_REGION_TO_BONE[slot];
    const freeEye = slot === "eye" && atlas.regions[FREE_EYE_REGION] !== undefined;
    for (const [regionName, bonePathOrPaths] of Object.entries(regionToBone)) {
      const region = atlas.regions[regionName];
      if (!region) continue;
      if (slot === "eye") {
        if (freeEye && regionName !== FREE_EYE_REGION) continue;
        if (!freeEye && regionName === FREE_EYE_REGION) continue;
      }
      const bones = Array.isArray(bonePathOrPaths)
        ? bonePathOrPaths
        : [bonePathOrPaths];
      // Free eye layer anchors on P_LEye which sits FREE_EYE_BASE_DX source px
      // left of the head's centre line; the renderer folds that back in.
      const base: PartNudge | undefined =
        regionName === FREE_EYE_REGION
          ? composeNudge({ dx: FREE_EYE_BASE_DX }, slotAdjustments?.[slot])
          : slotAdjustments?.[slot];
      bones.forEach((bonePath) => push(bonePath, atlas, region, base));
    }
  });
  // NOTE: no Eye_Close sibling handling — the AA path's blink bones default
  // inactive and compiled AA clips carry no visibility tracks, so eye-close
  // slices could never be visible in a baked frame anyway.
  return out;
}

type WorldXfm = { x: number; y: number; rot: number };

function computePose(
  skeleton: Skeleton,
  bonesByPath: Map<string, Bone>,
  clip: Clip,
  t: number,
): { world: Map<string, WorldXfm>; vis: Map<string, boolean> } {
  const local = new Map<string, WorldXfm>();
  for (const bone of skeleton.bones) {
    const track = clip.tracks[bone.path];
    const pos = track?.pos ? samplePos(track.pos, t) : bone.defaultPos;
    const rotZ = track?.rot ? sampleRotZ(track.rot, t) : bone.defaultRot.z;
    local.set(bone.path, { x: pos.x * UNIT_PX, y: -pos.y * UNIT_PX, rot: -rotZ });
  }

  const world = new Map<string, WorldXfm>();
  const getWorld = (path: string): WorldXfm => {
    const cached = world.get(path);
    if (cached) return cached;
    const bone = bonesByPath.get(path);
    if (!bone) {
      const zero = { x: 0, y: 0, rot: 0 };
      world.set(path, zero);
      return zero;
    }
    const l = local.get(path) ?? { x: 0, y: 0, rot: 0 };
    const p = bone.parent ? getWorld(bone.parent) : { x: 0, y: 0, rot: 0 };
    const rad = (p.rot * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const w = {
      x: p.x + (l.x * cos - l.y * sin),
      y: p.y + (l.x * sin + l.y * cos),
      rot: p.rot + l.rot,
    };
    world.set(path, w);
    return w;
  };

  const vis = new Map<string, boolean>();
  const getVis = (path: string): boolean => {
    const cached = vis.get(path);
    if (cached !== undefined) return cached;
    const bone = bonesByPath.get(path);
    if (!bone) {
      vis.set(path, true);
      return true;
    }
    const track = clip.tracks[path];
    const self =
      track?.vis && track.vis.length > 0
        ? sampleVis(track.vis, t)
        : bone.defaultActive !== false;
    const result = self && (bone.parent ? getVis(bone.parent) : true);
    vis.set(path, result);
    return result;
  };

  for (const bone of skeleton.bones) {
    getWorld(bone.path);
    getVis(bone.path);
  }
  return { world, vis };
}

/** Slice corner bounds under the full transform chain, for the framing pass. */
function sliceBounds(
  slice: FlatSlice,
  w: WorldXfm,
  into: { minX: number; minY: number; maxX: number; maxY: number },
): void {
  const originX = slice.pivotX * slice.width;
  const originY = (1 - slice.pivotY) * slice.height;
  const sx = BAKE_SCALE * slice.scaleX * (slice.flipX ? -1 : 1);
  const sy = BAKE_SCALE * slice.scaleY;
  const rad = ((w.rot + slice.rot) * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  for (const [cx, cy] of [
    [0, 0],
    [slice.width, 0],
    [0, slice.height],
    [slice.width, slice.height],
  ] as const) {
    const lx = (cx - originX) * sx;
    const ly = (cy - originY) * sy;
    const px = w.x + lx * cos - ly * sin;
    const py = w.y + lx * sin + ly * cos;
    if (px < into.minX) into.minX = px;
    if (px > into.maxX) into.maxX = px;
    if (py < into.minY) into.minY = py;
    if (py > into.maxY) into.maxY = py;
  }
}

function drawFrame(
  ctx: CanvasRenderingContext2D,
  slices: FlatSlice[],
  world: Map<string, WorldXfm>,
  vis: Map<string, boolean>,
  frameX: number,
  frameY: number,
  anchorX: number,
  anchorY: number,
): void {
  // Stable sort by sortingOrder; insertion order (slot declaration order)
  // breaks ties exactly like DOM order does in the live renderer.
  const sorted = slices
    .map((s, i) => ({ s, i }))
    .sort((a, b) => a.s.sortingOrder - b.s.sortingOrder || a.i - b.i);
  for (const { s } of sorted) {
    if (vis.get(s.bonePath) === false) continue;
    const w = world.get(s.bonePath);
    if (!w) continue;
    ctx.save();
    ctx.imageSmoothingEnabled = s.smooth;
    ctx.translate(frameX + anchorX + w.x, frameY + anchorY + w.y);
    ctx.rotate(((w.rot + s.rot) * Math.PI) / 180);
    ctx.scale(
      BAKE_SCALE * s.scaleX * (s.flipX ? -1 : 1),
      BAKE_SCALE * s.scaleY,
    );
    ctx.translate(-s.pivotX * s.width, -(1 - s.pivotY) * s.height);
    ctx.drawImage(s.image, s.x, s.y, s.width, s.height, 0, 0, s.width, s.height);
    ctx.restore();
  }
}

export async function bakeCharacter(name: string): Promise<BakedCharacter | null> {
  const bundle = await loadAaSceneBundle();
  if (!bundle) return null;
  const resolved = resolveAaSceneActor(bundle, name);
  if (!resolved) return null;

  const key = aaSceneLookKey({ name }, "left", undefined);
  const look = await cachedAaSceneLook(resolved, "left", undefined, key);

  const skeleton = resolved.skeleton;
  const bonesByPath = new Map(skeleton.bones.map((b) => [b.path, b] as const));
  const slices = await buildSlices(look, resolved.slotAdjustments, bonesByPath);
  if (slices.length === 0) return null;

  // Pass 1 — resolve every frame's pose and the union bounds, so all frames
  // share one frame box and the anchor never jitters between clips.
  type PendingFrame = { world: Map<string, WorldXfm>; vis: Map<string, boolean> };
  const clipFrames = new Map<string, PendingFrame[]>();
  const bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const [gameName, def] of Object.entries(BAKED_CLIPS)) {
    const clip = compiledAaClip(resolved.model, def.aaClip);
    if (!clip) continue;
    const count = Math.min(
      MAX_FRAMES_PER_CLIP,
      Math.max(2, Math.round(clip.duration * def.fps)),
    );
    const frames: PendingFrame[] = [];
    for (let f = 0; f < count; f++) {
      // Looping clips sample [0, duration) so frame N-1 != frame 0; one-shot
      // clips sample [0, duration] so the final pose is held exactly.
      const t = def.loop
        ? (f / count) * clip.duration
        : (f / (count - 1)) * clip.duration;
      const pose = computePose(skeleton, bonesByPath, clip, t);
      for (const s of slices) {
        if (pose.vis.get(s.bonePath) === false) continue;
        const w = pose.world.get(s.bonePath);
        if (w) sliceBounds(s, w, bounds);
      }
      frames.push(pose);
    }
    clipFrames.set(gameName, frames);
  }
  if (!isFinite(bounds.minX)) return null;

  const frameW = Math.ceil(bounds.maxX - bounds.minX) + FRAME_PAD * 2;
  const frameH = Math.ceil(bounds.maxY - bounds.minY) + FRAME_PAD * 2;
  const anchorX = -bounds.minX + FRAME_PAD;
  const anchorY = -bounds.minY + FRAME_PAD;

  const totalFrames = Array.from(clipFrames.values()).reduce(
    (n, f) => n + f.length,
    0,
  );
  const columns = Math.max(1, Math.ceil(Math.sqrt(totalFrames)));
  const rows = Math.ceil(totalFrames / columns);
  const sheet = document.createElement("canvas");
  sheet.width = columns * frameW;
  sheet.height = rows * frameH;
  const ctx = sheet.getContext("2d");
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = false;

  // Pass 2 — draw.
  const clips: Record<string, BakedClipInfo> = {};
  let index = 0;
  for (const [gameName, frames] of clipFrames) {
    const def = BAKED_CLIPS[gameName];
    clips[gameName] = {
      start: index,
      count: frames.length,
      fps: def.fps,
      loop: def.loop,
    };
    for (const pose of frames) {
      const col = index % columns;
      const row = Math.floor(index / columns);
      drawFrame(
        ctx,
        slices,
        pose.world,
        pose.vis,
        col * frameW,
        row * frameH,
        anchorX,
        anchorY,
      );
      index++;
    }
  }

  return {
    name,
    sheet,
    frameW,
    frameH,
    columns,
    anchorX,
    anchorY,
    groundY: frameH - FRAME_PAD, // bounds bottom sits FRAME_PAD above the frame edge
    clips,
  };
}

const bakeJobs = new Map<string, Promise<BakedCharacter | null>>();

/** Memoized per session — a character bakes once no matter how many scenes ask. */
export function cachedBake(name: string): Promise<BakedCharacter | null> {
  const hit = bakeJobs.get(name);
  if (hit) return hit;
  const job = bakeCharacter(name).catch((err) => {
    console.error(`[baker] bake failed for "${name}":`, err);
    bakeJobs.delete(name);
    return null;
  });
  bakeJobs.set(name, job);
  return job;
}

export function bakeCast(names: string[]): Promise<(BakedCharacter | null)[]> {
  // Sequential on purpose: each bake is ms-scale canvas work; spreading them
  // keeps the boot screen animating instead of one long main-thread stall.
  return names.reduce<Promise<(BakedCharacter | null)[]>>(
    async (accP, name) => {
      const acc = await accP;
      acc.push(await cachedBake(name));
      return acc;
    },
    Promise.resolve([]),
  );
}
