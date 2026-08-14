"use client";

// E22 — Horse rig renderer. Same architectural pattern as `SpumCharacter`:
// fetch skeleton + clip + single atlas, build a bone tree, per-rAF sample
// the clip's keyframes and write composed world transforms to a flat list
// of slice divs. Diff from the character is intentionally minimal — just
// the URLs, the single-slot atlas pipeline, and the simplified slot set:
//
//   - Skeleton: `/spum/horse-skeleton.json` (not `skeleton.json`)
//   - Clips:    `/spum/horse-anims/<name>.json` (not `/anims/`)
//   - Atlas:    one per character (the body), 10 regions
//
// Per-pixel rendering, tint via `<feColorMatrix>`, appearance dial, scaling
// math, and bone-transform export all follow the character renderer's
// approach. We don't share code (yet) — copy is ~250 LoC vs ~500 LoC, the
// shapes diverge in slot count (1 vs 10) + skeleton URL + clip URL, and a
// generic <SpumRig> abstraction would multiply complexity for both. Revisit
// if a third rig lands.

import { useEffect, useId, useMemo, useRef, useState, type MutableRefObject } from "react";

import {
  HORSE_REGION_TO_BONE,
  horseAtlasPath,
  horseClipPath,
  type HorseAnimation,
  type HorseColors,
  type HorsePart,
} from "./horseCatalog";
import { cssFilterFromAppearance, type AppearanceFields } from "./appearance";
import { clipPhaseAt } from "./clipPhase";
import { samplePos, sampleRotZ, sampleVis } from "./curve";
import type { Bone, BoneTransform, BoneTransformMap, Clip, Skeleton, SpriteAtlas } from "./types";

// Same base sizing constants as `SpumCharacter` so a horse at `size=1`
// renders at SPUM's native scale and integer-pixel multiples stay crisp.
const BASE_UNIT_PX = 220;
const BASE_SPRITE_SCALE = BASE_UNIT_PX / 32;

export type SpumHorseProps = {
  horse: HorsePart;
  animation: HorseAnimation;
  // Apparent size multiplier (1 = base). Composes with character size in the
  // scene runtime so the rider's character renders at the same apparent
  // size as their horse.
  size?: number;
  facing?: "left" | "right";
  // E21 playback-speed multiplier — same `speedRef` pattern as
  // SpumCharacter (the rAF reads it each frame so mid-clip speed changes
  // continue smoothly).
  speed?: number;
  // Scene-clock binding — same contract as SpumCharacter's `clockRef` /
  // `clockStart` (see clipPhase.ts): phase derives from the shared scene
  // time so scene loops keep the horse in sync with FX / action timings;
  // a `null` clock (non-looping scene completed) falls back to the
  // free-running accumulator.
  clockRef?: MutableRefObject<number | null>;
  clockStart?: number;
  paused?: boolean;
  time?: number;
  onClipLoad?: (info: { duration: number; fps: number }) => void;
  // Per-character tint. Today the horse atlas has one slot (`horse`); the
  // type leaves room for finer-grained channels (mane, tail) later.
  colors?: HorseColors;
  // Global appearance filter (E1c equivalent).
  appearance?: AppearanceFields;
  // E16-style bone transform export. The scene runtime reads this each
  // frame to position the rider character at the saddle bone.
  boneTransformRef?: MutableRefObject<BoneTransformMap | null>;
  // AA horse pipeline seams (docs/aachar-horse-plan.md H1) — additive and
  // opt-in, the same contract as SpumCharacter's `atlasOverrides` /
  // `clipOverride`. When present they replace the fetch of the same data;
  // no existing caller passes them, so SPUM horses render byte-identically.
  atlasOverride?: SpriteAtlas;
  clipOverride?: Clip;
};

type TreeNode = { bone: Bone; children: TreeNode[] };
type AtlasSlice = {
  key: string;
  image: string;
  x: number;
  y: number;
  width: number;
  height: number;
  pivotX: number;
  pivotY: number;
};

function buildTree(skeleton: Skeleton): TreeNode {
  const byPath = new Map<string, TreeNode>();
  for (const bone of skeleton.bones) {
    byPath.set(bone.path, { bone, children: [] });
  }
  let root: TreeNode | null = null;
  for (const bone of skeleton.bones) {
    const node = byPath.get(bone.path);
    if (!node) continue;
    if (bone.parent === null) {
      root = node;
    } else {
      const parent = byPath.get(bone.parent);
      parent?.children.push(node);
    }
  }
  if (!root) throw new Error("SPUM horse skeleton has no root bone");
  return root;
}

function parseHexRgb(hex: string): [number, number, number] {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function unityRotToCss(rotZ: number): number {
  return -rotZ;
}

function unityPosToCss(
  x: number,
  y: number,
  unitPx: number,
): { x: number; y: number } {
  return { x: x * unitPx, y: -y * unitPx };
}

function localTransformCss(
  pos: { x: number; y: number },
  rotZ: number,
  unitPx: number,
): string {
  const css = unityPosToCss(pos.x, pos.y, unitPx);
  return `translate(${css.x}px, ${css.y}px) rotate(${unityRotToCss(rotZ)}deg)`;
}

function defaultLocalTransform(bone: Bone, unitPx: number): string {
  return localTransformCss(bone.defaultPos, bone.defaultRot.z, unitPx);
}

function defaultWorldTransform(
  bone: Bone,
  bonesByPath: Map<string, Bone>,
  unitPx: number,
): string {
  const chain: string[] = [];
  let current: Bone | undefined = bone;
  while (current) {
    chain.unshift(defaultLocalTransform(current, unitPx));
    current = current.parent ? bonesByPath.get(current.parent) : undefined;
  }
  return chain.join(" ");
}

export function SpumHorse({
  horse,
  animation,
  size = 1,
  facing = "left",
  speed = 1,
  clockRef,
  clockStart = 0,
  paused,
  time,
  onClipLoad,
  colors,
  appearance,
  boneTransformRef,
  atlasOverride,
  clipOverride,
}: SpumHorseProps) {
  const speedRef = useRef(speed);
  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);
  const clockStartRef = useRef(clockStart);
  useEffect(() => {
    clockStartRef.current = clockStart;
  }, [clockStart]);

  // Same integer-multiple sprite scale + outer remainder pattern as
  // SpumCharacter — preserves pixel-perfect rendering at any apparent size.
  const effectiveSpriteScale = Math.max(
    1,
    Math.round(BASE_SPRITE_SCALE * size),
  );
  const effectiveUnitPx = effectiveSpriteScale * 32;
  const outerRemainderScale =
    (BASE_SPRITE_SCALE * size) / effectiveSpriteScale;

  const [skeleton, setSkeleton] = useState<Skeleton | null>(null);
  const [clip, setClip] = useState<Clip | null>(null);
  const [atlas, setAtlas] = useState<SpriteAtlas | null>(null);
  const boneRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  useEffect(() => {
    let cancelled = false;
    fetch("/spum/horse-skeleton.json")
      .then((r) => r.json() as Promise<Skeleton>)
      .then((s) => {
        if (!cancelled) setSkeleton(s);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    // AA seam: a supplied clip replaces the fetch outright — same object in,
    // same object rendered, so the editor's compiled beat sheet plays live.
    if (clipOverride) {
      setClip(clipOverride);
      onClipLoad?.({ duration: clipOverride.duration, fps: clipOverride.fps });
      return;
    }
    let cancelled = false;
    fetch(horseClipPath(animation))
      .then((r) => r.json() as Promise<Clip>)
      .then((c) => {
        if (!cancelled) {
          setClip(c);
          onClipLoad?.({ duration: c.duration, fps: c.fps });
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animation, clipOverride]);

  useEffect(() => {
    // AA seam: a supplied atlas (an AA horse sheet, image usually a data URL)
    // replaces the catalog fetch.
    if (atlasOverride) {
      setAtlas(atlasOverride);
      return;
    }
    let cancelled = false;
    fetch(horseAtlasPath(horse))
      .then((r) => r.json() as Promise<SpriteAtlas>)
      .then((a) => {
        if (!cancelled) setAtlas(a);
      });
    return () => {
      cancelled = true;
    };
  }, [horse, atlasOverride]);

  const tree = useMemo(() => (skeleton ? buildTree(skeleton) : null), [skeleton]);

  const bonesByPath = useMemo(() => {
    if (!skeleton) return null;
    const map = new Map<string, Bone>();
    for (const bone of skeleton.bones) map.set(bone.path, bone);
    return map;
  }, [skeleton]);

  // Build the flat slice list: each atlas region → its target bone(s),
  // disambiguated by `#i` when one region renders at multiple bones.
  const flatSlices = useMemo(() => {
    if (!atlas || !bonesByPath) return [];
    const list: { slice: AtlasSlice; bonePath: string; sortingOrder: number }[] = [];
    for (const [regionName, target] of Object.entries(HORSE_REGION_TO_BONE)) {
      const region = atlas.regions[regionName];
      if (!region) continue;
      const bones = Array.isArray(target) ? target : [target];
      bones.forEach((bonePath, idx) => {
        const bone = bonesByPath.get(bonePath);
        if (!bone) return;
        const suffix = bones.length > 1 ? `#${idx}` : "";
        list.push({
          slice: {
            key: `horse:${regionName}${suffix}`,
            image: atlas.image,
            x: region.x,
            y: region.y,
            width: region.width,
            height: region.height,
            pivotX: region.pivot.x,
            pivotY: region.pivot.y,
          },
          bonePath,
          sortingOrder: bone.sortingOrder ?? 0,
        });
      });
    }
    return list;
  }, [atlas, bonesByPath]);

  const sliceRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  useEffect(() => {
    if (!clip || !bonesByPath || !skeleton) return;

    const sampleAt = (t: number) => {
      const localXfms = new Map<string, string>();
      const localNums = boneTransformRef
        ? new Map<string, { x: number; y: number; rot: number }>()
        : null;
      for (const bone of skeleton.bones) {
        const track = clip.tracks[bone.path];
        const pos = track?.pos ? samplePos(track.pos, t) : bone.defaultPos;
        const rotZ = track?.rot ? sampleRotZ(track.rot, t) : bone.defaultRot.z;
        localXfms.set(bone.path, localTransformCss(pos, rotZ, effectiveUnitPx));
        if (localNums) {
          const css = unityPosToCss(pos.x, pos.y, effectiveUnitPx);
          localNums.set(bone.path, { x: css.x, y: css.y, rot: unityRotToCss(rotZ) });
        }
      }

      localXfms.forEach((xfm, path) => {
        const el = boneRefs.current.get(path);
        if (el) el.style.transform = xfm;
      });

      const worldXfms = new Map<string, string>();
      const getWorld = (path: string): string => {
        const cached = worldXfms.get(path);
        if (cached !== undefined) return cached;
        const bone = bonesByPath.get(path);
        if (!bone) {
          worldXfms.set(path, "");
          return "";
        }
        const local = localXfms.get(path) ?? "";
        const parentWorld = bone.parent ? getWorld(bone.parent) : "";
        const world = parentWorld ? `${parentWorld} ${local}` : local;
        worldXfms.set(path, world);
        return world;
      };

      const worldNums = localNums
        ? new Map<string, { x: number; y: number; rot: number }>()
        : null;
      if (localNums && worldNums) {
        const getWorldNum = (path: string): { x: number; y: number; rot: number } => {
          const cached = worldNums.get(path);
          if (cached !== undefined) return cached;
          const bone = bonesByPath.get(path);
          if (!bone) {
            const zero = { x: 0, y: 0, rot: 0 };
            worldNums.set(path, zero);
            return zero;
          }
          const local = localNums.get(path) ?? { x: 0, y: 0, rot: 0 };
          const parent = bone.parent ? getWorldNum(bone.parent) : { x: 0, y: 0, rot: 0 };
          const rad = (parent.rot * Math.PI) / 180;
          const cos = Math.cos(rad);
          const sin = Math.sin(rad);
          const world = {
            x: parent.x + (local.x * cos - local.y * sin),
            y: parent.y + (local.x * sin + local.y * cos),
            rot: parent.rot + local.rot,
          };
          worldNums.set(path, world);
          return world;
        };
        for (const bone of skeleton.bones) getWorldNum(bone.path);
      }

      // Visibility — horse anims don't author m_IsActive curves in practice,
      // but the plumbing matches the character renderer in case a future
      // SPUM update changes that.
      const visByBone = new Map<string, boolean>();
      const getVis = (path: string): boolean => {
        const cached = visByBone.get(path);
        if (cached !== undefined) return cached;
        const bone = bonesByPath.get(path);
        if (!bone) {
          visByBone.set(path, true);
          return true;
        }
        const track = clip.tracks[path];
        let self: boolean;
        if (track?.vis && track.vis.length > 0) {
          self = sampleVis(track.vis, t);
        } else {
          self = bone.defaultActive !== false;
        }
        const parentVis = bone.parent ? getVis(bone.parent) : true;
        const result = self && parentVis;
        visByBone.set(path, result);
        return result;
      };

      for (const item of flatSlices) {
        const el = sliceRefs.current.get(item.slice.key);
        if (!el) continue;
        const visible = getVis(item.bonePath);
        el.style.display = visible ? "" : "none";
        if (!visible) continue;
        const world = getWorld(item.bonePath);
        const originX = item.slice.pivotX * item.slice.width;
        const originY = (1 - item.slice.pivotY) * item.slice.height;
        el.style.transform = `${world} scale(${effectiveSpriteScale}) translate(-${originX}px, -${originY}px)`;
      }

      if (worldNums && boneTransformRef) {
        const facingFlip = facing === "right" ? -1 : 1;
        const map: BoneTransformMap =
          boneTransformRef.current ?? new Map<string, BoneTransform>();
        map.clear();
        for (const bone of skeleton.bones) {
          const w = worldNums.get(bone.path);
          if (!w) continue;
          map.set(bone.path, {
            x: w.x * outerRemainderScale * facingFlip,
            y: w.y * outerRemainderScale,
            rotation: w.rot * facingFlip,
            scale: size,
          });
        }
        boneTransformRef.current = map;
      }
    };

    if (paused) {
      const clamped = Math.max(0, Math.min(time ?? 0, clip.duration));
      sampleAt(clamped);
      return;
    }

    // Scene-clock / E21-accumulator split — same pattern as SpumCharacter
    // (see the comment there and clipPhase.ts).
    let raf = 0;
    let lastNow: number | null = null;
    let clipTime = 0;
    const tick = (now: number) => {
      const clockT = clockRef ? clockRef.current : null;
      if (clockT !== null && clockT !== undefined) {
        clipTime = clipPhaseAt(
          clockT,
          clockStartRef.current,
          speedRef.current,
          clip.duration,
        );
        lastNow = now;
      } else if (lastNow === null) {
        lastNow = now;
      } else {
        const deltaSec = (now - lastNow) / 1000;
        lastNow = now;
        clipTime = (clipTime + deltaSec * speedRef.current) % clip.duration;
        if (clipTime < 0) clipTime += clip.duration;
      }
      sampleAt(clipTime);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [
    clip,
    bonesByPath,
    skeleton,
    paused,
    time,
    flatSlices,
    effectiveUnitPx,
    effectiveSpriteScale,
    outerRemainderScale,
    size,
    facing,
    boneTransformRef,
    clockRef,
  ]);

  // Single colour channel (`horse`) — same SVG `<feColorMatrix>` plumbing
  // as the character renderer, just one filter per character instead of N.
  const reactIdRaw = useId();
  const filterIdPrefix = `spum-horse-tint-${reactIdRaw.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
  const tintHex = colors?.horse;
  const filterId = tintHex ? `${filterIdPrefix}-${tintHex.replace("#", "").toLowerCase()}` : null;

  const globalAppearanceFilter = useMemo(
    () => cssFilterFromAppearance(appearance),
    [appearance],
  );

  if (!tree || !bonesByPath) return null;

  const facingTransform = facing === "right" ? "scaleX(-1)" : "";

  return (
    <div
      data-spum-horse
      style={{
        position: "relative",
        width: 0,
        height: 0,
        transform: `scale(${outerRemainderScale}) ${facingTransform}`.trim(),
        transformOrigin: "center",
        filter: globalAppearanceFilter,
      }}
    >
      {tintHex && filterId ? (
        <svg
          width={0}
          height={0}
          aria-hidden="true"
          style={{ position: "absolute", width: 0, height: 0, pointerEvents: "none" }}
        >
          <defs>
            <filter
              id={filterId}
              colorInterpolationFilters="sRGB"
              x="-10%"
              y="-10%"
              width="120%"
              height="120%"
            >
              {(() => {
                const [r, g, b] = parseHexRgb(tintHex);
                const matrix = `${r / 255} 0 0 0 0  0 ${g / 255} 0 0 0  0 0 ${b / 255} 0 0  0 0 0 1 0`;
                return <feColorMatrix type="matrix" values={matrix} />;
              })()}
            </filter>
          </defs>
        </svg>
      ) : null}

      <HorseBoneNode node={tree} boneRefs={boneRefs} unitPx={effectiveUnitPx} />

      {flatSlices.map(({ slice, bonePath, sortingOrder }) => {
        const bone = bonesByPath.get(bonePath);
        if (!bone) return null;
        const originX = slice.pivotX * slice.width;
        const originY = (1 - slice.pivotY) * slice.height;
        const initialWorld = defaultWorldTransform(bone, bonesByPath, effectiveUnitPx);
        let initialActive = true;
        for (
          let cursor: Bone | undefined = bone;
          cursor && initialActive;
          cursor = cursor.parent ? bonesByPath.get(cursor.parent) : undefined
        ) {
          if (cursor.defaultActive === false) initialActive = false;
        }
        return (
          <div
            key={slice.key}
            ref={(el) => {
              if (el) sliceRefs.current.set(slice.key, el);
              else sliceRefs.current.delete(slice.key);
            }}
            data-spum-horse-slice={slice.key}
            data-bone={bonePath}
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: slice.width,
              height: slice.height,
              backgroundImage: `url(${slice.image})`,
              backgroundPosition: `-${slice.x}px -${slice.y}px`,
              backgroundRepeat: "no-repeat",
              transformOrigin: "0 0",
              transform: `${initialWorld} scale(${effectiveSpriteScale}) translate(-${originX}px, -${originY}px)`,
              imageRendering: "pixelated",
              pointerEvents: "none",
              zIndex: sortingOrder,
              display: initialActive ? undefined : "none",
              filter: filterId ? `url(#${filterId})` : undefined,
            }}
          />
        );
      })}
    </div>
  );
}

function HorseBoneNode({
  node,
  boneRefs,
  unitPx,
}: {
  node: TreeNode;
  boneRefs: MutableRefObject<Map<string, HTMLDivElement>>;
  unitPx: number;
}) {
  const { bone, children } = node;
  return (
    <div
      ref={(el) => {
        if (el) boneRefs.current.set(bone.path, el);
        else boneRefs.current.delete(bone.path);
      }}
      data-bone={bone.path}
      data-bone-name={bone.name}
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: 0,
        height: 0,
        transform: defaultLocalTransform(bone, unitPx),
        transformOrigin: "0 0",
      }}
    >
      {children.map((child) => (
        <HorseBoneNode
          key={child.bone.path}
          node={child}
          boneRefs={boneRefs}
          unitPx={unitPx}
        />
      ))}
    </div>
  );
}
