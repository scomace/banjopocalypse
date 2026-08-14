import type { PosKeyframe, RotKeyframe, Vec2, VisKeyframe } from "./types";

type Keyframed = { t: number };

function findSegment<K extends Keyframed>(keys: K[], t: number): { a: K; b: K; u: number } {
  if (keys.length === 0) throw new Error("findSegment called on empty keyframe array");
  const first = keys[0];
  const last = keys[keys.length - 1];
  if (t <= first.t) return { a: first, b: first, u: 0 };
  if (t >= last.t) return { a: last, b: last, u: 0 };
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i];
    const b = keys[i + 1];
    if (t >= a.t && t <= b.t) {
      const span = b.t - a.t;
      const u = span === 0 ? 0 : (t - a.t) / span;
      return { a, b, u };
    }
  }
  return { a: last, b: last, u: 0 };
}

export function sampleRotZ(keys: RotKeyframe[], t: number): number {
  const { a, b, u } = findSegment(keys, t);
  return a.rot.z + (b.rot.z - a.rot.z) * u;
}

export function samplePos(keys: PosKeyframe[], t: number): Vec2 {
  const { a, b, u } = findSegment(keys, t);
  return {
    x: a.pos.x + (b.pos.x - a.pos.x) * u,
    y: a.pos.y + (b.pos.y - a.pos.y) * u,
  };
}

// Visibility tracks are stepwise — Unity authors m_IsActive with
// `Infinity` tangents so the value flips instantaneously at each keyframe
// rather than blending. The active state at sample time t is whichever
// keyframe's t is the latest <= sample t.
export function sampleVis(keys: VisKeyframe[], t: number): boolean {
  if (keys.length === 0) return true;
  if (t <= keys[0].t) return keys[0].active;
  for (let i = keys.length - 1; i >= 0; i--) {
    if (keys[i].t <= t) return keys[i].active;
  }
  return keys[0].active;
}
