// Comic Exclamations lab — /admin/systems/exclaims. Generates a comic-book
// exclamation burst (BOOM! / KA-BLOOEY / …) as pure SVG: a seeded double
// starburst, radiating streaks, ink specks, and Badaboom BB lettering on an
// arc with a chunky offset outline. Type new text, shuffle the burst shape,
// swap palettes, and export a transparent PNG for use in scenes.
//
// Font: Badaboom BB (Blambot/Nate Piekos) — freeware for indie-comic and
// non-profit use; commercial non-comic use needs a license from the author.
// The license text ships next to the font: public/fonts/badaboom-bb-LICENSE.txt

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";

const FONT_FAMILY = "Badaboom BB";
const FONT_URL = "/fonts/badaboom-bb.ttf";
const FONT_STACK = `"${FONT_FAMILY}", "Arial Black", sans-serif`;

const VIEW_W = 900;
const VIEW_H = 640;
const CX = VIEW_W / 2;
const CY = VIEW_H / 2;
// The burst is an ellipse: wider than tall, like a real panel exclamation.
const SX = 1.5;
const SY = 0.92;
// Text tries to fill this much width before the font size clamps.
const TARGET_TEXT_W = 500;

interface ExclaimPalette {
  name: string;
  /** Back (spikier, larger) burst layer. */
  backFill: string;
  /** Front burst radial gradient, center → edge. */
  frontInner: string;
  frontMid: string;
  frontOuter: string;
  /** Radiating wedge streaks inside the front burst. */
  streak: string;
  /** Letter fill gradient, top → bottom. */
  textTop: string;
  textBottom: string;
  /** Letter outline + offset depth copy. */
  outline: string;
  /** Ink specks flying off the burst. */
  speck: string;
}

const PALETTES: ExclaimPalette[] = [
  {
    name: "Classic",
    backFill: "#f13a12",
    frontInner: "#ffef5e",
    frontMid: "#ffc116",
    frontOuter: "#ff8c00",
    streak: "#f26011",
    textTop: "#fff763",
    textBottom: "#ffb400",
    outline: "#181008",
    speck: "#20140a",
  },
  {
    name: "Ice",
    backFill: "#1f74e8",
    frontInner: "#ffffff",
    frontMid: "#c9ecff",
    frontOuter: "#7cc0ff",
    streak: "#3f8fe0",
    textTop: "#ffffff",
    textBottom: "#a8dcff",
    outline: "#0b2547",
    speck: "#0b2547",
  },
  {
    name: "Toxic",
    backFill: "#2f9410",
    frontInner: "#f3ff9a",
    frontMid: "#b7f23c",
    frontOuter: "#6cc716",
    streak: "#4a9e0e",
    textTop: "#fff763",
    textBottom: "#ffc400",
    outline: "#122b04",
    speck: "#122b04",
  },
  {
    name: "Electric",
    backFill: "#ffb300",
    frontInner: "#fff9d6",
    frontMid: "#ffe14d",
    frontOuter: "#ffb300",
    streak: "#f59e0b",
    textTop: "#ff5a45",
    textBottom: "#d91f11",
    outline: "#181008",
    speck: "#141008",
  },
  {
    name: "Inferno",
    backFill: "#ff8400",
    frontInner: "#fff176",
    frontMid: "#ffd91c",
    frontOuter: "#ffab00",
    streak: "#e05e00",
    textTop: "#ffef5e",
    textBottom: "#ff7a00",
    outline: "#7a2e00",
    speck: "#e05e00",
  },
  {
    name: "Scream",
    backFill: "#e8401c",
    frontInner: "#ffe873",
    frontMid: "#ffd333",
    frontOuter: "#ffc400",
    streak: "#e8401c",
    textTop: "#f5503a",
    textBottom: "#d11f08",
    outline: "#801205",
    speck: "#5c0f04",
  },
  {
    name: "Pow",
    backFill: "#ef1f8f",
    frontInner: "#fff3fb",
    frontMid: "#ffc0e4",
    frontOuter: "#ff7cc4",
    streak: "#e0489e",
    textTop: "#ffffff",
    textBottom: "#ffc9e8",
    outline: "#3a0a26",
    speck: "#3a0a26",
  },
];

// Deterministic RNG so a given seed always draws the same burst (and the
// exported PNG matches the preview exactly).
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Point on the burst ellipse, in coordinates centered on the burst. */
function pt(angle: number, radius: number): [number, number] {
  return [Math.cos(angle) * radius * SX, Math.sin(angle) * radius * SY];
}

function starPath(
  rng: () => number,
  spikes: number,
  rOuter: number,
  rInner: number,
  rot: number,
): string {
  const step = (Math.PI * 2) / spikes;
  const pts: string[] = [];
  for (let i = 0; i < spikes; i++) {
    const aO = rot + i * step + (rng() - 0.5) * step * 0.35;
    const rO = rOuter * (0.82 + rng() * 0.26);
    const [ox, oy] = pt(aO, rO);
    pts.push(`${ox.toFixed(1)},${oy.toFixed(1)}`);
    const aI = rot + (i + 0.5) * step + (rng() - 0.5) * step * 0.3;
    const rI = rInner * (0.85 + rng() * 0.3);
    const [ix, iy] = pt(aI, rI);
    pts.push(`${ix.toFixed(1)},${iy.toFixed(1)}`);
  }
  return `M${pts.join("L")}Z`;
}

interface BurstGeometry {
  backPath: string;
  frontPath: string;
  /** bx/by = the streak's outward direction, used by blast animations. */
  streaks: { d: string; bx: number; by: number }[];
  speckCircles: { x: number; y: number; r: number }[];
  speckDashes: { x1: number; y1: number; x2: number; y2: number }[];
}

function buildBurst(seed: number, spikes: number): BurstGeometry {
  const rng = mulberry32(seed);
  const step = (Math.PI * 2) / spikes;
  const backPath = starPath(rng, spikes, 250, 148, rng() * step);
  const frontPath = starPath(rng, spikes, 202, 120, rng() * step + step * 0.5);

  // Tapered wedges radiating outward between the text and the burst edge.
  const streaks: BurstGeometry["streaks"] = [];
  for (let i = 0; i < spikes; i++) {
    const a = i * step + step * 0.5 + (rng() - 0.5) * 0.25;
    const r0 = 78 + rng() * 25;
    const r1 = r0 + 55 + rng() * 55;
    const halfW = 3.5 + rng() * 3.5;
    const [x0, y0] = pt(a, r0);
    const [x1, y1] = pt(a, r1);
    const len = Math.hypot(x1 - x0, y1 - y0) || 1;
    const nx = (-(y1 - y0) / len) * halfW;
    const ny = ((x1 - x0) / len) * halfW;
    const [bx, by] = pt(a, 250);
    streaks.push({
      d:
        `M${(x0 + nx).toFixed(1)},${(y0 + ny).toFixed(1)}` +
        `L${(x0 - nx).toFixed(1)},${(y0 - ny).toFixed(1)}` +
        `L${x1.toFixed(1)},${y1.toFixed(1)}Z`,
      bx,
      by,
    });
  }

  // Ink specks scattered just past the spike tips.
  const speckCircles: BurstGeometry["speckCircles"] = [];
  const speckDashes: BurstGeometry["speckDashes"] = [];
  const speckCount = 16 + Math.floor(rng() * 6);
  for (let i = 0; i < speckCount; i++) {
    const a = rng() * Math.PI * 2;
    const f = 1.03 + rng() * 0.09;
    const [x, y] = pt(a, 250 * f);
    if (rng() < 0.5) {
      speckCircles.push({ x, y, r: 2.5 + rng() * 3 });
    } else {
      const [x2, y2] = pt(a, 250 * f + 8 + rng() * 8);
      speckDashes.push({ x1: x, y1: y, x2, y2 });
    }
  }

  return { backPath, frontPath, streaks, speckCircles, speckDashes };
}

interface SplatGeometry {
  blobPath: string;
  /** Darker goo splotches inside the blob — the splat's "streak" layer. */
  splotches: { x: number; y: number; rx: number; ry: number; bx: number; by: number }[];
  /** Flying droplets around the blob — the splat's "speck" layer. */
  droplets: { x: number; y: number; r: number; ring: boolean }[];
}

// A gooey splat: lobed blob (some lobes stretched into arms), smoothed by
// running quadratics through the midpoints of a jittered radial polygon.
function buildSplat(seed: number, lobes: number, drips: number): SplatGeometry {
  const rng = mulberry32(seed ^ 0x5eaf00d);
  const step = (Math.PI * 2) / lobes;
  const pts: [number, number][] = [];
  for (let i = 0; i < lobes; i++) {
    const aT = i * step + (rng() - 0.5) * step * 0.4;
    const arm = rng() < 0.28;
    const rT = arm ? 215 + rng() * 40 : 170 + rng() * 40;
    pts.push(pt(aT, rT));
    const aV = (i + 0.5) * step + (rng() - 0.5) * step * 0.3;
    pts.push(pt(aV, 125 + rng() * 30));
  }
  const mid = (a: [number, number], b: [number, number]): [number, number] => [
    (a[0] + b[0]) / 2,
    (a[1] + b[1]) / 2,
  ];
  const n = pts.length;
  const m0 = mid(pts[n - 1], pts[0]);
  let d = `M${m0[0].toFixed(1)},${m0[1].toFixed(1)}`;
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const m = mid(p, pts[(i + 1) % n]);
    d += `Q${p[0].toFixed(1)},${p[1].toFixed(1)} ${m[0].toFixed(1)},${m[1].toFixed(1)}`;
  }
  d += "Z";

  const splotches: SplatGeometry["splotches"] = [];
  const splotchCount = 6 + Math.floor(rng() * 4);
  for (let i = 0; i < splotchCount; i++) {
    const a = rng() * Math.PI * 2;
    const [x, y] = pt(a, 30 + rng() * 65);
    const rx = 8 + rng() * 12;
    const [bx, by] = pt(a, 230);
    splotches.push({ x, y, rx, ry: rx * (0.6 + rng() * 0.4), bx, by });
  }

  // Droplets hug the blob's edge (some overlap it, reading as attached
  // goo bumps), with a few smaller satellites slung further out.
  const droplets: SplatGeometry["droplets"] = [];
  for (let i = 0; i < drips; i++) {
    const a = rng() * Math.PI * 2;
    const far = rng() < 0.3;
    const [x, y] = pt(a, far ? 245 + rng() * 30 : 190 + rng() * 45);
    const r = far ? 3 + rng() * 5 : 6 + rng() * 9;
    droplets.push({ x, y, r, ring: r > 6.5 });
  }

  return { blobPath: d, splotches, droplets };
}

interface ZapGeometry {
  cloudPath: string;
  /** Lightning bolts radiating from behind the cloud; big ones get the
      brighter fill. */
  bolts: { d: string; big: boolean; bx: number; by: number }[];
  /** Small black energy zigzags near the cloud edge (streak layer). */
  sparks: { d: string; bx: number; by: number }[];
  dots: { x: number; y: number; r: number }[];
  dashes: { x1: number; y1: number; x2: number; y2: number }[];
}

// A cartoon lightning bolt: tapered zigzag silhouette pointing outward along
// angle `a`, from radius r0 to r0+len, half-width w at the base.
function boltPath(a: number, r0: number, len: number, w: number): string {
  const silhouette: [number, number][] = [
    [0, -0.7],
    [0.45, -0.4],
    [0.32, -0.12],
    [1, 0],
    [0.5, 0.4],
    [0.62, 0.1],
    [0, 0.7],
  ];
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  const px = (t: number, s: number): string => {
    const rr = r0 + t * len;
    const x = ca * rr * SX - sa * s * w;
    const y = sa * rr * SY + ca * s * w;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  };
  return "M" + silhouette.map(([t, s]) => px(t, s)).join("L") + "Z";
}

// The electric zap: a scalloped thundercloud (outward arcs between jittered
// ring points) with a ring of bolts behind it and sparks flying.
function buildZap(seed: number, boltCount: number): ZapGeometry {
  const rng = mulberry32(seed ^ 0x2a9b01);

  const bumps = 10 + Math.floor(rng() * 3);
  const bumpStep = (Math.PI * 2) / bumps;
  const ring: [number, number][] = [];
  for (let i = 0; i < bumps; i++) {
    const a = i * bumpStep + (rng() - 0.5) * bumpStep * 0.35;
    ring.push(pt(a, 150 + rng() * 28));
  }
  let cloudPath = `M${ring[0][0].toFixed(1)},${ring[0][1].toFixed(1)}`;
  for (let i = 0; i < bumps; i++) {
    const [x, y] = ring[(i + 1) % bumps];
    const [px0, py0] = ring[i];
    const chord = Math.hypot(x - px0, y - py0);
    const arcR = (chord / 2) * (1.05 + rng() * 0.25);
    cloudPath += `A${arcR.toFixed(1)},${arcR.toFixed(1)} 0 0,1 ${x.toFixed(1)},${y.toFixed(1)}`;
  }
  cloudPath += "Z";

  const bolts: ZapGeometry["bolts"] = [];
  const boltStep = (Math.PI * 2) / boltCount;
  for (let i = 0; i < boltCount; i++) {
    const a = i * boltStep + (rng() - 0.5) * boltStep * 0.5;
    const r0 = 118 + rng() * 15;
    const len = 130 + rng() * 50;
    const w = 27 + rng() * 12;
    const [bx, by] = pt(a, 250);
    bolts.push({ d: boltPath(a, r0, len, w), big: rng() < 0.5, bx, by });
  }

  const sparks: ZapGeometry["sparks"] = [];
  const sparkCount = 5 + Math.floor(rng() * 3);
  for (let i = 0; i < sparkCount; i++) {
    const a = rng() * Math.PI * 2;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const r0 = 168 + rng() * 20;
    let d = "";
    for (let k = 0; k < 3; k++) {
      const rr = r0 + k * (13 + rng() * 5);
      const off = (k % 2 === 0 ? 1 : -1) * (6 + rng() * 4);
      const x = ca * rr * SX - sa * off;
      const y = sa * rr * SY + ca * off;
      d += `${k === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    }
    const [bx, by] = pt(a, 240);
    sparks.push({ d, bx, by });
  }

  const dots: ZapGeometry["dots"] = [];
  const dashes: ZapGeometry["dashes"] = [];
  const speckCount = 12 + Math.floor(rng() * 5);
  for (let i = 0; i < speckCount; i++) {
    const a = rng() * Math.PI * 2;
    const [x, y] = pt(a, 215 + rng() * 30);
    if (rng() < 0.55) {
      dots.push({ x, y, r: 2.5 + rng() * 3 });
    } else {
      const [x2, y2] = pt(a, 215 + rng() * 30 + 10 + rng() * 8);
      dashes.push({ x1: x, y1: y, x2, y2 });
    }
  }

  return { cloudPath, bolts, sparks, dots, dashes };
}

interface KaboomGeometry {
  /** Front fireball cloud. */
  cloudPath: string;
  /** Bigger, deeper-orange fireball behind it. */
  underPath: string;
  /** Thin speed-rays radiating out (rendered with the back layer). */
  rays: string[];
  /** Billowing puff bubbles inside the fireball (streak layer). */
  puffs: { x: number; y: number; r: number; bx: number; by: number }[];
  /** Ember dots and bubbles flying around (speck layer). */
  sparks: { x: number; y: number; r: number; ring: boolean }[];
}

// Scalloped fireball ring: jittered radial points joined by outward arcs.
function fireballPath(
  rng: () => number,
  bumps: number,
  rBase: number,
  rJit: number,
): string {
  const step = (Math.PI * 2) / bumps;
  const ring: [number, number][] = [];
  for (let i = 0; i < bumps; i++) {
    const a = i * step + (rng() - 0.5) * step * 0.35;
    ring.push(pt(a, rBase + rng() * rJit));
  }
  let d = `M${ring[0][0].toFixed(1)},${ring[0][1].toFixed(1)}`;
  for (let i = 0; i < bumps; i++) {
    const [x, y] = ring[(i + 1) % bumps];
    const [x0, y0] = ring[i];
    const chord = Math.hypot(x - x0, y - y0);
    const arcR = (chord / 2) * (1.05 + rng() * 0.25);
    d += `A${arcR.toFixed(1)},${arcR.toFixed(1)} 0 0,1 ${x.toFixed(1)},${y.toFixed(1)}`;
  }
  return d + "Z";
}

// The kaboom: a double fireball cloud that boils with rimmed puff bubbles,
// speed-rays behind, embers around.
function buildKaboom(seed: number, puffCount: number): KaboomGeometry {
  const rng = mulberry32(seed ^ 0xca800f);
  const underPath = fireballPath(rng, 9 + Math.floor(rng() * 3), 185, 30);
  const cloudPath = fireballPath(rng, 11 + Math.floor(rng() * 3), 145, 35);

  const rays: string[] = [];
  const rayCount = 11 + Math.floor(rng() * 4);
  const rayStep = (Math.PI * 2) / rayCount;
  for (let i = 0; i < rayCount; i++) {
    const a = i * rayStep + (rng() - 0.5) * rayStep * 0.5;
    const r0 = 165 + rng() * 15;
    const r1 = r0 + 60 + rng() * 60;
    const halfW = 3 + rng() * 2.5;
    const [x0, y0] = pt(a, r0);
    const [x1, y1] = pt(a, r1);
    const len = Math.hypot(x1 - x0, y1 - y0) || 1;
    const nx = (-(y1 - y0) / len) * halfW;
    const ny = ((x1 - x0) / len) * halfW;
    rays.push(
      `M${(x0 + nx).toFixed(1)},${(y0 + ny).toFixed(1)}` +
        `L${(x0 - nx).toFixed(1)},${(y0 - ny).toFixed(1)}` +
        `L${x1.toFixed(1)},${y1.toFixed(1)}Z`,
    );
  }

  // Big puffs billow along the upper rim of the fireball (the word covers
  // the middle, so that's where they read).
  const puffs: KaboomGeometry["puffs"] = [];
  for (let i = 0; i < puffCount; i++) {
    const a = Math.PI + rng() * Math.PI;
    const rr = 95 + rng() * 55;
    const [px, py] = pt(a, rr);
    const [bx, by] = pt(a, 230);
    puffs.push({ x: px, y: py * 0.9, r: 24 + rng() * 22, bx, by });
  }

  const sparks: KaboomGeometry["sparks"] = [];
  const sparkCount = 10 + Math.floor(rng() * 5);
  for (let i = 0; i < sparkCount; i++) {
    const a = rng() * Math.PI * 2;
    const [x, y] = pt(a, 205 + rng() * 40);
    const r = 3.5 + rng() * 4.5;
    sparks.push({ x, y, r, ring: rng() < 0.4 });
  }

  return { cloudPath, underPath, rays, puffs, sparks };
}

interface ScreamGeometry {
  /** The jagged scream bubble. */
  bubblePath: string;
  /** Sharp rays radiating behind it (back layer). */
  rays: string[];
  /** Anime tension ticks in the valleys between spikes (streak layer). */
  ticks: { d: string; bx: number; by: number }[];
  dots: { x: number; y: number; r: number }[];
  dashes: { x1: number; y1: number; x2: number; y2: number }[];
}

// The aaargh: a chaotic spiked scream bubble — high radius variance with a
// few extra-long spikes, so it reads as a shriek rather than an explosion.
function buildScream(seed: number, spikes: number): ScreamGeometry {
  const rng = mulberry32(seed ^ 0xaaa421);
  const step = (Math.PI * 2) / spikes;
  const outer: string[] = [];
  for (let i = 0; i < spikes; i++) {
    const aO = i * step + (rng() - 0.5) * step * 0.6;
    const long = rng() < 0.22;
    const rO = long ? 225 + rng() * 35 : 150 + rng() * 55;
    const [ox, oy] = pt(aO, rO);
    outer.push(`${ox.toFixed(1)},${oy.toFixed(1)}`);
    const aI = (i + 0.5) * step + (rng() - 0.5) * step * 0.4;
    const [ix, iy] = pt(aI, 95 + rng() * 35);
    outer.push(`${ix.toFixed(1)},${iy.toFixed(1)}`);
  }
  const bubblePath = `M${outer.join("L")}Z`;

  const rays: string[] = [];
  const rayCount = 9 + Math.floor(rng() * 4);
  const rayStep = (Math.PI * 2) / rayCount;
  for (let i = 0; i < rayCount; i++) {
    const a = i * rayStep + (rng() - 0.5) * rayStep * 0.5;
    const r0 = 175 + rng() * 15;
    const r1 = Math.min(r0 + 70 + rng() * 55, 290);
    const halfW = 3.5 + rng() * 3;
    const [x0, y0] = pt(a, r0);
    const [x1, y1] = pt(a, r1);
    const len = Math.hypot(x1 - x0, y1 - y0) || 1;
    const nx = (-(y1 - y0) / len) * halfW;
    const ny = ((x1 - x0) / len) * halfW;
    rays.push(
      `M${(x0 + nx).toFixed(1)},${(y0 + ny).toFixed(1)}` +
        `L${(x0 - nx).toFixed(1)},${(y0 - ny).toFixed(1)}` +
        `L${x1.toFixed(1)},${y1.toFixed(1)}Z`,
    );
  }

  // Ticks sit just past the valleys, so they hover at the bubble's rim.
  const ticks: ScreamGeometry["ticks"] = [];
  for (let i = 0; i < spikes; i++) {
    if (rng() > 0.55) continue;
    const a = (i + 0.5) * step + (rng() - 0.5) * step * 0.2;
    const [x0, y0] = pt(a, 138 + rng() * 10);
    const [x1, y1] = pt(a, 166 + rng() * 16);
    const [bx, by] = pt(a, 240);
    ticks.push({
      d: `M${x0.toFixed(1)},${y0.toFixed(1)}L${x1.toFixed(1)},${y1.toFixed(1)}`,
      bx,
      by,
    });
  }

  const dots: ScreamGeometry["dots"] = [];
  const dashes: ScreamGeometry["dashes"] = [];
  const speckCount = 11 + Math.floor(rng() * 5);
  for (let i = 0; i < speckCount; i++) {
    const a = rng() * Math.PI * 2;
    const [x, y] = pt(a, 215 + rng() * 35);
    if (rng() < 0.55) {
      dots.push({ x, y, r: 2.5 + rng() * 3.5 });
    } else {
      const [x2, y2] = pt(a, 215 + rng() * 35 + 10 + rng() * 8);
      dashes.push({ x1: x, y1: y, x2, y2 });
    }
  }

  return { bubblePath, rays, ticks, dots, dashes };
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

// The font base64 is needed for every rasterization (the SVG-in-<img> trick
// can't fetch external resources), so fetch + encode it once per session.
let fontB64Promise: Promise<string> | null = null;
function getFontB64(): Promise<string> {
  fontB64Promise ??= fetch(FONT_URL)
    .then((r) => r.arrayBuffer())
    .then((buf) => {
      const bytes = new Uint8Array(buf);
      let bin = "";
      for (let i = 0; i < bytes.length; i += 8192) {
        bin += String.fromCharCode.apply(
          null,
          Array.from(bytes.subarray(i, i + 8192)),
        );
      }
      return btoa(bin);
    });
  return fontB64Promise;
}

/** Serialize the live SVG (with the font embedded) and load it as an image. */
async function rasterizeSvg(svg: SVGSVGElement): Promise<HTMLImageElement> {
  const fontB64 = await getFontB64();
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.removeAttribute("style");
  clone.removeAttribute("class");
  const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
  style.textContent = `@font-face{font-family:"${FONT_FAMILY}";src:url(data:font/ttf;base64,${fontB64}) format("truetype");}`;
  clone.insertBefore(style, clone.firstChild);

  const svgBlob = new Blob([new XMLSerializer().serializeToString(clone)], {
    type: "image/svg+xml",
  });
  const url = URL.createObjectURL(svgBlob);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("SVG rasterize failed"));
      img.src = url;
    });
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Draw `img` into `canvas` at `outW`×`outH` in blocky pixels: downsample to
 * one sample per `pixel`-sized block (at viewBox scale), then upscale with
 * smoothing off.
 */
function drawPixelated(
  img: HTMLImageElement,
  canvas: HTMLCanvasElement,
  pixel: number,
  outW: number,
  outH: number,
): void {
  const smallW = Math.max(1, Math.round(VIEW_W / pixel));
  const smallH = Math.max(1, Math.round(VIEW_H / pixel));
  const small = document.createElement("canvas");
  small.width = smallW;
  small.height = smallH;
  const sctx = small.getContext("2d");
  if (!sctx) return;
  sctx.drawImage(img, 0, 0, smallW, smallH);
  // Snap alpha to on/off so edges read as crisp sprite pixels instead of the
  // mushy semi-transparent fringe averaging leaves behind.
  const data = sctx.getImageData(0, 0, smallW, smallH);
  const px = data.data;
  for (let i = 3; i < px.length; i += 4) {
    px[i] = px[i] < 128 ? 0 : 255;
  }
  sctx.putImageData(data, 0, 0);
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, outW, outH);
  ctx.drawImage(small, 0, 0, outW, outH);
}

// ---------------------------------------------------------------------------
// Animations. Each entry is a per-layer choreography defined in ANIM_CSS:
// the play classes (cxa-in-* / cxa-out-*) select keyframes for .cxa-back,
// .cxa-front, .cxa-streak, .cxa-speck, and .cxa-word independently. Specks
// and streaks carry --bx/--by (their outward vector from the burst center)
// and --i (index) so they can blast/stagger individually.
// ---------------------------------------------------------------------------

const IN_ANIMS = [
  { key: "pop", label: "Pop", dur: 900 },
  { key: "slam", label: "Slam", dur: 1000 },
  { key: "spin", label: "Spin", dur: 1000 },
  { key: "flash", label: "Flash", dur: 850 },
  { key: "bounce", label: "Bounce", dur: 1050 },
  { key: "drip", label: "Drip", dur: 1800 },
  { key: "splat", label: "Splat", dur: 900 },
  { key: "wave", label: "Wave", dur: 1200 },
] as const;

const OUT_ANIMS = [
  { key: "pop", label: "Pop", dur: 750 },
  { key: "blast", label: "Blast", dur: 750 },
  { key: "drop", label: "Drop", dur: 950 },
  { key: "implode", label: "Implode", dur: 1000 },
  { key: "deflate", label: "Deflate", dur: 1150 },
  { key: "drip", label: "Drip", dur: 1200 },
  { key: "melt", label: "Melt", dur: 1300 },
] as const;

const ANIM_CSS = `
.cxa-root, .cxa-root * { transform-box: fill-box; transform-origin: center; }

/* ---- shared keyframes ---- */
@keyframes cxaPopIn { from { transform: scale(0); } to { transform: scale(1); } }
@keyframes cxaShrinkOut { from { transform: scale(1); } to { transform: scale(0); opacity: 0; } }
@keyframes cxaSpeckOutward {
  from { transform: translate(calc(var(--bx) * -0.85), calc(var(--by) * -0.85)) scale(0.2); opacity: 0; }
  40% { opacity: 1; }
  to { transform: none; opacity: 1; }
}
@keyframes cxaSpeckInward {
  from { transform: none; opacity: 1; }
  to { transform: translate(calc(var(--bx) * -0.9), calc(var(--by) * -0.9)) scale(0.2); opacity: 0; }
}
@keyframes cxaSpeckBlast {
  0% { transform: none; opacity: 1; }
  65% { opacity: 1; }
  100% { transform: translate(calc(var(--bx) * 1.8), calc(var(--by) * 1.8)); opacity: 0; }
}

/* ---- IN: pop — layered elastic pop, back to front, specks shoot out ---- */
.cxa-in-pop .cxa-back { animation: cxaPopIn .5s cubic-bezier(.22,1.6,.36,1) both; }
.cxa-in-pop .cxa-front { animation: cxaPopIn .5s cubic-bezier(.22,1.6,.36,1) .08s both; }
.cxa-in-pop .cxa-streak { animation: cxaPopIn .38s cubic-bezier(.22,1.6,.36,1) calc(.14s + var(--i) * .028s) both; }
.cxa-in-pop .cxa-speck { animation: cxaSpeckOutward .5s cubic-bezier(.16,.84,.44,1) calc(.18s + var(--i) * .02s) both; }
.cxa-in-pop .cxa-word { animation: cxaWordPop .55s cubic-bezier(.22,1.5,.36,1) .16s both; }
@keyframes cxaWordPop { from { transform: scale(0); } to { transform: none; } }

/* ---- IN: slam — the word erupts from the center first, bursts detonate on impact ---- */
@keyframes cxaSlamWord {
  0% { transform: scale(0) rotate(-8deg); }
  55% { transform: scale(1.32) rotate(3deg); }
  100% { transform: none; }
}
@keyframes cxaBlastOpen { from { transform: scale(.15); opacity: 0; } 30% { opacity: 1; } to { transform: scale(1); opacity: 1; } }
@keyframes cxaShake {
  0%, 100% { transform: none; }
  14% { transform: translate(-10px, 6px) rotate(-1.3deg); }
  28% { transform: translate(9px, -5px) rotate(1.1deg); }
  44% { transform: translate(-7px, 3px) rotate(-.8deg); }
  62% { transform: translate(4px, -2px) rotate(.5deg); }
  80% { transform: translate(-2px, 1px); }
}
.cxa-in-slam .cxa-word { animation: cxaSlamWord .3s cubic-bezier(.25,.6,.3,1) both; }
.cxa-in-slam .cxa-back { animation: cxaBlastOpen .42s cubic-bezier(.22,1.5,.36,1) .22s both; }
.cxa-in-slam .cxa-front { animation: cxaBlastOpen .38s cubic-bezier(.22,1.5,.36,1) .26s both; }
.cxa-in-slam .cxa-streak { animation: cxaPopIn .3s cubic-bezier(.22,1.6,.36,1) calc(.3s + var(--i) * .014s) both; }
.cxa-in-slam .cxa-speck { animation: cxaSpeckOutward .42s cubic-bezier(.16,.84,.44,1) calc(.26s + var(--i) * .012s) both; }
.cxa-in-slam .cxa-all { animation: cxaShake .5s linear .24s both; }

/* ---- IN: spin — whole burst spirals in, word unspins the other way ---- */
@keyframes cxaSpinAll { from { transform: rotate(-560deg) scale(.02); opacity: .3; } 25% { opacity: 1; } to { transform: none; opacity: 1; } }
@keyframes cxaWordUnspin { from { transform: rotate(300deg) scale(.3); opacity: 0; } 35% { opacity: 1; } to { transform: none; opacity: 1; } }
.cxa-in-spin .cxa-all { animation: cxaSpinAll .8s cubic-bezier(.3,1.25,.45,1) both; }
.cxa-in-spin .cxa-word { animation: cxaWordUnspin .85s cubic-bezier(.25,1.3,.4,1) .05s both; }
.cxa-in-spin .cxa-speck { animation: cxaSpeckOutward .4s ease-out calc(.55s + var(--i) * .015s) both; }

/* ---- IN: flash — a white detonation flash, layers cut in overbright ---- */
@keyframes cxaFlashRing {
  0% { opacity: 0; transform: scale(.05); }
  12% { opacity: 1; transform: scale(.55); }
  55% { opacity: .85; transform: scale(1.5); }
  100% { opacity: 0; transform: scale(2.05); }
}
@keyframes cxaBrightIn {
  0% { opacity: 0; filter: brightness(6) saturate(.3); transform: scale(.88); }
  15% { opacity: 1; filter: brightness(2.6) saturate(.6); transform: scale(1.07); }
  60% { filter: brightness(1.25) saturate(1); }
  100% { opacity: 1; filter: none; transform: none; }
}
@keyframes cxaWordFlashIn { from { transform: scale(0); } to { transform: none; } }
.cxa-in-flash .cxa-flash { animation: cxaFlashRing .55s ease-out both; }
.cxa-in-flash .cxa-all { animation: cxaBrightIn .65s ease-out .05s both; }
.cxa-in-flash .cxa-word { animation: cxaWordFlashIn .45s cubic-bezier(.22,1.5,.36,1) .14s both; }
.cxa-in-flash .cxa-speck { animation: cxaSpeckOutward .45s ease-out calc(.12s + var(--i) * .014s) both; }

/* ---- IN: bounce — falls in with squash & stretch, word pops on impact ---- */
@keyframes cxaDropBounce {
  0% { transform: translateY(-640px); opacity: 0; animation-timing-function: cubic-bezier(.55,0,.85,.36); }
  8% { opacity: 1; }
  36% { transform: translateY(0); }
  46% { transform: translateY(0) scale(1.14, .8); }
  60% { transform: translateY(-95px) scale(.97, 1.05); }
  74% { transform: translateY(0); }
  82% { transform: translateY(0) scale(1.06, .93); }
  92% { transform: translateY(-20px); }
  100% { transform: none; }
}
@keyframes cxaWordJiggle { from { transform: scale(.78) rotate(-3deg); } to { transform: none; } }
.cxa-in-bounce .cxa-all { animation: cxaDropBounce .95s ease both; }
.cxa-in-bounce .cxa-word { animation: cxaWordJiggle .5s cubic-bezier(.22,1.6,.36,1) .4s both; }

/* ---- IN: drip — body lands softly, then every drop rains down onto it ---- */
@keyframes cxaDripIn {
  0% { transform: translateY(calc(-340px - var(--by))); animation-timing-function: cubic-bezier(.55,0,.85,.36); }
  70% { transform: translateY(0); }
  82% { transform: translateY(0) scale(1.35, .65); }
  100% { transform: none; }
}
.cxa-in-drip .cxa-back { animation: cxaPopIn .4s cubic-bezier(.22,1.4,.36,1) both; }
.cxa-in-drip .cxa-front { animation: cxaPopIn .45s cubic-bezier(.22,1.4,.36,1) .05s both; }
.cxa-in-drip .cxa-streak { animation: cxaPopIn .3s cubic-bezier(.22,1.6,.36,1) calc(.6s + var(--i) * .03s) both; }
.cxa-in-drip .cxa-speck { animation: cxaDripIn .5s linear calc(.25s + var(--i) * .045s) both; }
/* The word is the biggest drop of all: falls from above and lands with a squash. */
@keyframes cxaWordDripIn {
  0% { transform: translateY(-560px); animation-timing-function: cubic-bezier(.55,0,.85,.36); }
  70% { transform: translateY(0); }
  80% { transform: translateY(0) scale(1.12, .82); }
  100% { transform: none; }
}
.cxa-in-drip .cxa-word { animation: cxaWordDripIn .6s linear .3s both; }

/* ---- IN: splat — hurled at the wall; hits, spreads wide, jello-settles ---- */
@keyframes cxaSplatIn {
  0% { transform: scale(.05); opacity: 0; animation-timing-function: cubic-bezier(.6,0,.9,.4); }
  18% { transform: scale(1.35, .68); opacity: 1; }
  36% { transform: scale(.82, 1.22); }
  54% { transform: scale(1.14, .9); }
  72% { transform: scale(.95, 1.05); }
  88% { transform: scale(1.03, .98); }
  100% { transform: none; }
}
.cxa-in-splat .cxa-all { animation: cxaSplatIn .75s linear both; }
.cxa-in-splat .cxa-speck { animation: cxaSpeckOutward .4s ease-out calc(.14s + var(--i) * .012s) both; }
/* The word was thrown WITH the goo: flies in from the viewer and slaps on
   just after the body hits the wall. */
@keyframes cxaWordHurl { 0% { transform: scale(3); opacity: 0; } 40% { opacity: 1; } 100% { transform: none; opacity: 1; } }
.cxa-in-splat .cxa-word { animation: cxaWordHurl .3s cubic-bezier(.5,0,.8,.4) .06s both; }

/* ---- IN: wave — surges up like liquid and wobbles; drops splash upward ---- */
@keyframes cxaWaveIn {
  0% { transform: translateY(140px) scale(1.25, .1); opacity: 0; animation-timing-function: cubic-bezier(.2,.6,.35,1); }
  10% { opacity: 1; }
  30% { transform: translateY(-18px) scale(.92, 1.14) skewX(-6deg); }
  48% { transform: translateY(8px) scale(1.08, .92) skewX(5deg); }
  64% { transform: translateY(-4px) scale(.96, 1.05) skewX(-3deg); }
  80% { transform: translateY(2px) scale(1.02, .98) skewX(1.5deg); }
  100% { transform: none; }
}
@keyframes cxaSplashUp {
  0% { transform: translate(calc(var(--bx) * -0.75), calc(var(--by) * -0.75)) scale(.3); opacity: 0; }
  40% { transform: translate(calc(var(--bx) * -0.25), calc(var(--by) * -0.35 - 70px)) scale(1.1); opacity: 1; }
  100% { transform: none; opacity: 1; }
}
/* The word surfaces from deep underwater and bobs up past the rest line. */
@keyframes cxaWordSurface {
  0% { transform: translateY(260px) scale(.85); opacity: 0; }
  35% { opacity: 1; }
  70% { transform: translateY(-14px) scale(1.04); }
  100% { transform: none; opacity: 1; }
}
.cxa-in-wave .cxa-all { animation: cxaWaveIn .9s linear both; }
.cxa-in-wave .cxa-speck { animation: cxaSplashUp .55s cubic-bezier(.3,.6,.4,1) calc(.25s + var(--i) * .02s) both; }
.cxa-in-wave .cxa-word { animation: cxaWordSurface .65s cubic-bezier(.3,.7,.35,1) .3s both; }

/* ---- OUT: pop — word first, streaks retract, specks get sucked in ---- */
@keyframes cxaWordPopOut { 0% { transform: none; opacity: 1; } 25% { transform: scale(1.18) rotate(-3deg); } 100% { transform: scale(0); opacity: 1; } }
@keyframes cxaBurstPopOut { 0% { transform: none; } 30% { transform: scale(1.07); } 100% { transform: scale(0); } }
.cxa-out-pop .cxa-word { animation: cxaWordPopOut .32s cubic-bezier(.5,0,.75,.3) both; }
.cxa-out-pop .cxa-streak { animation: cxaShrinkOut .22s ease-in calc(.06s + var(--i) * .016s) both; }
.cxa-out-pop .cxa-speck { animation: cxaSpeckInward .32s ease-in calc(.04s + var(--i) * .012s) both; }
.cxa-out-pop .cxa-front { animation: cxaBurstPopOut .3s cubic-bezier(.6,-.25,.8,.3) .2s both; }
.cxa-out-pop .cxa-back { animation: cxaBurstPopOut .34s cubic-bezier(.6,-.25,.8,.3) .3s both; }

/* ---- OUT: blast — everything detonates outward; dots & dashes fly clear ---- */
@keyframes cxaBurstBlast { 0% { transform: none; opacity: 1; } 100% { transform: scale(1.8); opacity: 0; } }
@keyframes cxaWordBlast { 0% { transform: none; opacity: 1; } 100% { transform: scale(2.7) rotate(-9deg); opacity: 0; } }
@keyframes cxaStreakBlast {
  0% { transform: none; opacity: 1; }
  60% { opacity: 1; }
  100% { transform: translate(calc(var(--bx) * 1.1), calc(var(--by) * 1.1)) scale(1.4); opacity: 0; }
}
.cxa-out-blast .cxa-speck { animation: cxaSpeckBlast .55s cubic-bezier(.2,.6,.36,1) both; }
.cxa-out-blast .cxa-streak { animation: cxaStreakBlast .5s cubic-bezier(.2,.6,.36,1) .03s both; }
.cxa-out-blast .cxa-front { animation: cxaBurstBlast .45s ease-out .06s both; }
.cxa-out-blast .cxa-back { animation: cxaBurstBlast .5s ease-out .03s both; }
.cxa-out-blast .cxa-word { animation: cxaWordBlast .4s cubic-bezier(.5,0,.8,.4) .08s both; }

/* ---- OUT: drop — loses its stick and falls off, word peels separately ---- */
@keyframes cxaFallAway { 0% { transform: none; } 14% { transform: translateY(-26px) rotate(3deg); } 100% { transform: translateY(820px) rotate(34deg); } }
@keyframes cxaWordPeel { 0% { transform: none; } 20% { transform: translateY(-12px) rotate(-4deg); } 100% { transform: translateY(880px) rotate(-28deg); } }
.cxa-out-drop .cxa-all { animation: cxaFallAway .8s cubic-bezier(.45,0,.9,.4) both; }
.cxa-out-drop .cxa-word { animation: cxaWordPeel .78s cubic-bezier(.45,0,.9,.4) .1s both; }

/* ---- OUT: implode — sucked to a point, then a little pip winks out ---- */
@keyframes cxaImplodeAll { 0% { transform: none; } 20% { transform: scale(1.06) rotate(-4deg); } 100% { transform: scale(0) rotate(220deg); } }
@keyframes cxaPip { 0% { opacity: 0; transform: scale(0); } 10% { opacity: 1; } 45% { transform: scale(1.5); opacity: 1; } 100% { transform: scale(.1); opacity: 0; } }
.cxa-out-implode .cxa-speck { animation: cxaSpeckInward .28s ease-in calc(var(--i) * .01s) both; }
.cxa-out-implode .cxa-streak { animation: cxaShrinkOut .26s ease-in .04s both; }
.cxa-out-implode .cxa-all { animation: cxaImplodeAll .5s cubic-bezier(.65,-.25,.85,.35) .14s both; }
.cxa-out-implode .cxa-pip { animation: cxaPip .32s ease-out .6s both; }

/* ---- OUT: drip — every drop loses its grip and rains off; body sags after ---- */
@keyframes cxaDripOff {
  0% { transform: none; animation-timing-function: ease-out; }
  15% { transform: translateY(6px) scale(1.15, .85); animation-timing-function: cubic-bezier(.5,0,.85,.4); }
  100% { transform: translateY(760px); }
}
@keyframes cxaSagFall {
  0% { transform: none; animation-timing-function: ease-in-out; }
  25% { transform: translateY(14px) scale(1.04, .94); animation-timing-function: cubic-bezier(.5,0,.85,.4); }
  100% { transform: translateY(760px); }
}
.cxa-out-drip .cxa-speck { animation: cxaDripOff .55s linear calc(var(--i) * .03s) both; }
.cxa-out-drip .cxa-streak { animation: cxaDripOff .5s linear calc(.2s + var(--i) * .02s) both; }
.cxa-out-drip .cxa-word { animation: cxaSagFall .55s linear .35s both; }
.cxa-out-drip .cxa-front { animation: cxaSagFall .6s linear .4s both; }
.cxa-out-drip .cxa-back { animation: cxaSagFall .55s linear .5s both; }

/* ---- OUT: melt — word puddles into the goo, then the goo melts flat ---- */
.cxa-out-melt .cxa-front,
.cxa-out-melt .cxa-back,
.cxa-out-melt .cxa-word { transform-origin: 50% 100%; }
@keyframes cxaMeltDown {
  0% { transform: none; opacity: 1; }
  30% { transform: scale(1.06, .8); }
  60% { transform: scale(1.18, .38); }
  85% { transform: scale(1.3, .08); opacity: 1; }
  100% { transform: scale(1.35, .01); opacity: 0; }
}
.cxa-out-melt .cxa-speck { animation: cxaDripOff .5s linear calc(var(--i) * .02s) both; }
.cxa-out-melt .cxa-streak { animation: cxaShrinkOut .4s ease-in .15s both; }
.cxa-out-melt .cxa-word { animation: cxaMeltDown .6s cubic-bezier(.4,0,.7,.3) .15s both; }
.cxa-out-melt .cxa-front { animation: cxaMeltDown .7s cubic-bezier(.4,0,.7,.3) .35s both; }
.cxa-out-melt .cxa-back { animation: cxaMeltDown .6s cubic-bezier(.4,0,.7,.3) .45s both; }

/* ---- OUT: deflate — wobbles like a punctured balloon and sputters away ---- */
@keyframes cxaDeflate {
  0% { transform: none; opacity: 1; }
  12% { transform: translate(0, -6px) rotate(-2deg) scale(1.06, .9); }
  30% { transform: translate(20px, 12px) rotate(3.5deg) scale(.9, 1.04); }
  48% { transform: translate(-28px, 40px) rotate(-7deg) scale(.75, .82); }
  66% { transform: translate(26px, 86px) rotate(10deg) scale(.52, .6); }
  84% { transform: translate(-18px, 130px) rotate(-16deg) scale(.26, .33); opacity: 1; }
  100% { transform: translate(4px, 170px) rotate(-32deg) scale(0); opacity: 0; }
}
.cxa-out-deflate .cxa-all { animation: cxaDeflate 1.05s cubic-bezier(.4,.1,.6,.9) both; }
.cxa-out-deflate .cxa-speck { animation: cxaSpeckBlast .4s ease-out both; }
`;

interface LabState {
  text: string;
  palette: string;
  /** "burst" (spiky explosion), "splat" (gooey blob), or "zap" (cloud + bolts). */
  shape: string;
  spikes: number;
  lobes: number;
  drips: number;
  bolts: number;
  puffs: number;
  bow: number;
  tilt: number;
  seed: number;
  /** Pixel block size at viewBox scale; 0 = crisp vector, no pixelation. */
  pixel: number;
  animIn: string;
  animOut: string;
}

const DEFAULT_STATE: LabState = {
  text: "BOOM!",
  palette: "Classic",
  shape: "burst",
  spikes: 14,
  lobes: 10,
  drips: 14,
  bolts: 8,
  puffs: 8,
  bow: 30,
  tilt: -4,
  seed: 1977,
  pixel: 0,
  animIn: "pop",
  animOut: "blast",
};

const STORAGE_KEY = "exclaim-lab-v1";

// Keep only known keys with the right types (shared by localStorage load and
// pasted-JSON import, which both take arbitrary input).
function sanitizeState(raw: unknown): LabState {
  if (typeof raw !== "object" || raw === null) return DEFAULT_STATE;
  const src = raw as Record<string, unknown>;
  const out = { ...DEFAULT_STATE };
  for (const key of Object.keys(DEFAULT_STATE) as (keyof LabState)[]) {
    const v = src[key];
    if (typeof v === typeof DEFAULT_STATE[key]) {
      (out as Record<string, unknown>)[key] = v;
    }
  }
  out.spikes = clamp(Math.round(out.spikes), 3, 40);
  out.lobes = clamp(Math.round(out.lobes), 3, 30);
  out.drips = clamp(Math.round(out.drips), 0, 60);
  out.bolts = clamp(Math.round(out.bolts), 2, 24);
  out.puffs = clamp(Math.round(out.puffs), 0, 30);
  out.bow = clamp(out.bow, 0, 120);
  out.tilt = clamp(out.tilt, -45, 45);
  out.pixel = clamp(Math.round(out.pixel), 0, 32);
  return out;
}

function loadState(): LabState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    return sanitizeState(JSON.parse(raw));
  } catch {
    return DEFAULT_STATE;
  }
}

export function ComicExclaimLab() {
  const [state, setState] = useState<LabState>(loadState);
  const [fontSize, setFontSize] = useState(180);
  const svgRef = useRef<SVGSVGElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Monotonic token so a slow rasterization can't paint over a newer one.
  const renderToken = useRef(0);
  // "in" / "out" while an animation plays; playKey remounts the animated
  // group so CSS animations restart even when replaying the same one.
  const [playing, setPlaying] = useState<"in" | "out" | null>(null);
  const [playKey, setPlayKey] = useState(0);
  const playTimers = useRef<number[]>([]);
  const [jsonStatus, setJsonStatus] = useState<{
    kind: "copied" | "pasted" | "error";
    message: string;
  } | null>(null);
  const jsonStatusTimer = useRef<number | undefined>(undefined);

  const {
    text,
    palette: paletteName,
    shape,
    spikes,
    lobes,
    drips,
    bolts,
    puffs,
    bow,
    tilt,
    seed,
    pixel,
    animIn,
    animOut,
  } = state;
  const isSplat = shape === "splat";
  const isZap = shape === "zap";
  const isKaboom = shape === "kaboom";
  const isAaargh = shape === "aaargh";
  const palette =
    PALETTES.find((p) => p.name === paletteName) ?? PALETTES[0];
  const display = text.trim() ? text.toUpperCase() : "BOOM!";

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Storage full/blocked — the lab still works, it just won't persist.
    }
  }, [state]);

  // Size the lettering to fill the burst: measure the real font off-screen
  // once it's loaded, then scale so the text spans TARGET_TEXT_W.
  useEffect(() => {
    let alive = true;
    document.fonts.load(`120px "${FONT_FAMILY}"`).then(
      () => {
        if (!alive) return;
        const ctx = document.createElement("canvas").getContext("2d");
        if (!ctx) return;
        ctx.font = `120px ${FONT_STACK}`;
        const w = ctx.measureText(display).width || 1;
        setFontSize(clamp((120 * TARGET_TEXT_W) / w, 54, 205));
      },
      () => {
        // Font failed to load — keep the current estimate.
      },
    );
    return () => {
      alive = false;
    };
  }, [display]);

  const burst = useMemo(() => buildBurst(seed, spikes), [seed, spikes]);
  const splat = useMemo(
    () => buildSplat(seed, lobes, drips),
    [seed, lobes, drips],
  );
  const zap = useMemo(() => buildZap(seed, bolts), [seed, bolts]);
  const kaboom = useMemo(() => buildKaboom(seed, puffs), [seed, puffs]);
  const scream = useMemo(() => buildScream(seed, spikes), [seed, spikes]);

  // Pixelated preview: re-rasterize the (hidden) SVG whenever anything that
  // affects the drawing changes. Debounced so typing doesn't thrash it.
  useEffect(() => {
    // While an animation plays the vector SVG is shown instead, so skip
    // re-rasterizing until it settles.
    if (pixel <= 0 || playing) return;
    const token = ++renderToken.current;
    const timer = setTimeout(() => {
      const svg = svgRef.current;
      const canvas = canvasRef.current;
      if (!svg || !canvas) return;
      rasterizeSvg(svg)
        .then((img) => {
          if (token !== renderToken.current || !canvasRef.current) return;
          drawPixelated(img, canvasRef.current, pixel, VIEW_W, VIEW_H);
        })
        .catch(() => {
          // Rasterize failed (font fetch etc.) — leave the last frame.
        });
    }, 120);
    return () => clearTimeout(timer);
  }, [state, fontSize, pixel, playing]);

  // Arc the baseline: ends dip by `bow`, so the middle of the word rides high.
  const baseY = fontSize * 0.34;
  const arcPath = `M ${-300} ${(baseY + bow).toFixed(1)} Q 0 ${(baseY - bow).toFixed(1)} ${300} ${(baseY + bow).toFixed(1)}`;
  const strokeW = fontSize * 0.115;
  const depthX = fontSize * 0.05;
  const depthY = fontSize * 0.07;

  const set = (patch: Partial<LabState>) =>
    setState((s) => ({ ...s, ...patch }));

  const clearPlayTimers = () => {
    playTimers.current.forEach(clearTimeout);
    playTimers.current = [];
  };
  useEffect(
    () => () => {
      clearPlayTimers();
      window.clearTimeout(jsonStatusTimer.current);
    },
    [],
  );

  const inDur = (IN_ANIMS.find((a) => a.key === animIn) ?? IN_ANIMS[0]).dur;
  const outDur = (OUT_ANIMS.find((a) => a.key === animOut) ?? OUT_ANIMS[0]).dur;

  const play = (mode: "in" | "out" | "both") => {
    clearPlayTimers();
    setPlayKey((k) => k + 1);
    const later = (fn: () => void, ms: number) =>
      playTimers.current.push(window.setTimeout(fn, ms));
    if (mode === "in") {
      setPlaying("in");
      later(() => setPlaying(null), inDur + 250);
    } else if (mode === "out") {
      setPlaying("out");
      // Hold the empty frame for a beat, then bring it back.
      later(() => setPlaying(null), outDur + 900);
    } else {
      setPlaying("in");
      later(() => setPlaying("out"), inDur + 600);
      later(() => setPlaying(null), inDur + 600 + outDur + 900);
    }
  };

  const playClass =
    playing === "in"
      ? `cxa-in-${animIn}`
      : playing === "out"
        ? `cxa-out-${animOut}`
        : "";

  const flashJsonStatus = (status: NonNullable<typeof jsonStatus>) => {
    window.clearTimeout(jsonStatusTimer.current);
    setJsonStatus(status);
    jsonStatusTimer.current = window.setTimeout(
      () => setJsonStatus(null),
      2500,
    );
  };

  // The full spec — everything needed to reproduce this exclamation exactly
  // (the seed pins the burst geometry).
  const copyJson = async () => {
    try {
      await navigator.clipboard.writeText(
        JSON.stringify({ version: 1, ...state }, null, 2),
      );
      flashJsonStatus({ kind: "copied", message: "✓ Spec copied to clipboard" });
    } catch {
      flashJsonStatus({ kind: "error", message: "Clipboard write failed" });
    }
  };

  const pasteJson = async () => {
    try {
      const text = await navigator.clipboard.readText();
      const parsed: unknown = JSON.parse(text);
      setState(sanitizeState(parsed));
      flashJsonStatus({ kind: "pasted", message: "✓ Spec loaded" });
    } catch {
      flashJsonStatus({
        kind: "error",
        message: "Clipboard doesn't hold valid exclaim JSON",
      });
    }
  };

  const exportPng = async () => {
    const svg = svgRef.current;
    if (!svg) return;
    const img = await rasterizeSvg(svg);
    const scale = 2;
    const canvas = document.createElement("canvas");
    if (pixel > 0) {
      // Blocks stay crisp: one sample per block, upscaled with smoothing off.
      drawPixelated(img, canvas, pixel, VIEW_W * scale, VIEW_H * scale);
    } else {
      canvas.width = VIEW_W * scale;
      canvas.height = VIEW_H * scale;
      canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
    }
    canvas.toBlob((png) => {
      if (!png) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(png);
      a.download = `exclaim-${display.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "boom"}.png`;
      a.click();
      URL.revokeObjectURL(a.href);
    }, "image/png");
  };

  return (
    <div className="p-6">
      <div className="mx-auto max-w-5xl">
        <h1 className="text-lg font-semibold text-neutral-800">
          Comic Exclamations
        </h1>
        <p className="mt-1 text-xs text-neutral-500">
          Seeded SVG burst + Badaboom BB lettering. Type anything, shuffle the
          burst, export a transparent PNG. (Font is Blambot indie-comic
          freeware — license in public/fonts/badaboom-bb-LICENSE.txt.)
        </p>

        <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_260px]">
          {/* Preview on comic-paper cream, like a printed panel. */}
          <div
            className="flex items-center justify-center rounded-xl border border-neutral-300 p-2"
            style={{ backgroundColor: "#f2ead8" }}
          >
            {/* Animation choreography for the layer classes below. */}
            <style>{ANIM_CSS}</style>
            {/* The SVG stays mounted even while pixelated — it's the source
                the rasterizer serializes. Animations always play on the
                vector (a static pixelated frame can't move per-layer). */}
            <canvas
              ref={canvasRef}
              width={VIEW_W}
              height={VIEW_H}
              className={pixel > 0 && !playing ? "h-auto w-full" : "hidden"}
            />
            <svg
              ref={svgRef}
              viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
              className={pixel > 0 && !playing ? "hidden" : "h-auto w-full"}
            >
              <defs>
                <radialGradient id="exclaim-front" cx="50%" cy="46%" r="62%">
                  <stop offset="0%" stopColor={palette.frontInner} />
                  <stop offset="55%" stopColor={palette.frontMid} />
                  <stop offset="100%" stopColor={palette.frontOuter} />
                </radialGradient>
                <linearGradient id="exclaim-text" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={palette.textTop} />
                  <stop offset="100%" stopColor={palette.textBottom} />
                </linearGradient>
                {/* Thundercloud shading and the halftone dots inside the
                    zap's lettering. */}
                {/* Kaboom fireball: yellow body, orange squeezed to the rim. */}
                <radialGradient id="exclaim-fire" cx="50%" cy="46%" r="62%">
                  <stop offset="0%" stopColor={palette.frontInner} />
                  <stop offset="60%" stopColor={palette.frontMid} />
                  <stop offset="90%" stopColor={palette.frontMid} />
                  <stop offset="100%" stopColor={palette.frontOuter} />
                </radialGradient>
                <radialGradient id="exclaim-cloud" cx="50%" cy="42%" r="65%">
                  <stop offset="0%" stopColor="#ffffff" />
                  <stop offset="70%" stopColor="#fbf8ef" />
                  <stop offset="100%" stopColor="#eae5d6" />
                </radialGradient>
                <pattern
                  id="exclaim-text-dots"
                  width={11}
                  height={11}
                  patternUnits="userSpaceOnUse"
                  patternTransform="rotate(-6)"
                >
                  <circle cx={3} cy={3} r={2.1} fill="#ffffff" />
                  <circle cx={8.5} cy={8.5} r={1.4} fill="#ffffff" />
                </pattern>
                {/* Comic-print halftone for the splat's dot shadow. */}
                <pattern
                  id="exclaim-halftone"
                  width={17}
                  height={17}
                  patternUnits="userSpaceOnUse"
                  patternTransform="rotate(8)"
                >
                  <circle cx={4.5} cy={4.5} r={4.4} fill={palette.speck} />
                  <circle cx={13} cy={13} r={2.6} fill={palette.speck} />
                </pattern>
                <path id="exclaim-arc" d={arcPath} />
              </defs>

              <g transform={`translate(${CX} ${CY}) rotate(${tilt})`}>
                <g key={playKey} className={`cxa-root ${playClass}`}>
                  <g className="cxa-all">
                    {isAaargh ? (
                      <>
                        {/* Scream rays radiating behind the bubble. */}
                        <g className="cxa-back">
                          {scream.rays.map((d, i) => (
                            <path
                              key={i}
                              d={d}
                              fill={palette.backFill}
                              opacity={0.9}
                            />
                          ))}
                        </g>
                        {/* The jagged scream bubble — thick rim, sharp points. */}
                        <g className="cxa-front">
                          <path
                            d={scream.bubblePath}
                            fill="url(#exclaim-fire)"
                            stroke={palette.streak}
                            strokeWidth={9}
                            strokeLinejoin="miter"
                            strokeMiterlimit={5}
                          />
                        </g>
                        {/* Tension ticks at the rim (streak layer). */}
                        {scream.ticks.map((t, i) => (
                          <path
                            key={i}
                            className="cxa-streak"
                            d={t.d}
                            fill="none"
                            stroke={palette.streak}
                            strokeWidth={6}
                            strokeLinecap="round"
                            style={
                              {
                                "--bx": `${t.bx.toFixed(0)}px`,
                                "--by": `${t.by.toFixed(0)}px`,
                                "--i": i,
                              } as CSSProperties
                            }
                          />
                        ))}
                        {/* Spittle and shock dots (speck layer). */}
                        {scream.dots.map((c, i) => (
                          <circle
                            key={i}
                            className="cxa-speck"
                            cx={c.x}
                            cy={c.y}
                            r={c.r}
                            fill={palette.speck}
                            style={
                              {
                                "--bx": `${c.x.toFixed(0)}px`,
                                "--by": `${c.y.toFixed(0)}px`,
                                "--i": i,
                              } as CSSProperties
                            }
                          />
                        ))}
                        {scream.dashes.map((s, i) => (
                          <line
                            key={i}
                            className="cxa-speck"
                            x1={s.x1}
                            y1={s.y1}
                            x2={s.x2}
                            y2={s.y2}
                            stroke={palette.speck}
                            strokeWidth={4.5}
                            strokeLinecap="round"
                            style={
                              {
                                "--bx": `${s.x1.toFixed(0)}px`,
                                "--by": `${s.y1.toFixed(0)}px`,
                                "--i": scream.dots.length + i,
                              } as CSSProperties
                            }
                          />
                        ))}
                      </>
                    ) : isKaboom ? (
                      <>
                        {/* Speed-rays + the deep-orange under-fireball. */}
                        <g className="cxa-back">
                          {kaboom.rays.map((d, i) => (
                            <path
                              key={i}
                              d={d}
                              fill={palette.frontMid}
                              opacity={0.55}
                            />
                          ))}
                          <path
                            d={kaboom.underPath}
                            fill={palette.backFill}
                            stroke={palette.streak}
                            strokeWidth={7}
                            strokeLinejoin="round"
                          />
                        </g>
                        {/* The yellow-hot fireball. */}
                        <g className="cxa-front">
                          <path
                            d={kaboom.cloudPath}
                            fill="url(#exclaim-fire)"
                            stroke={palette.streak}
                            strokeWidth={6}
                            strokeLinejoin="round"
                          />
                        </g>
                        {/* Billowing puffs boiling inside (streak layer —
                            each has its own radial shading). */}
                        {kaboom.puffs.map((p, i) => (
                          <circle
                            key={i}
                            className="cxa-streak"
                            cx={p.x}
                            cy={p.y}
                            r={p.r}
                            fill="url(#exclaim-front)"
                            stroke={palette.streak}
                            strokeWidth={5}
                            style={
                              {
                                "--bx": `${p.bx.toFixed(0)}px`,
                                "--by": `${p.by.toFixed(0)}px`,
                                "--i": i,
                              } as CSSProperties
                            }
                          />
                        ))}
                        {/* Ember dots and bubbles (speck layer). */}
                        {kaboom.sparks.map((s, i) => (
                          <circle
                            key={i}
                            className="cxa-speck"
                            cx={s.x}
                            cy={s.y}
                            r={s.r}
                            fill={s.ring ? palette.frontMid : palette.speck}
                            stroke={s.ring ? palette.streak : undefined}
                            strokeWidth={s.ring ? 3.5 : 0}
                            style={
                              {
                                "--bx": `${s.x.toFixed(0)}px`,
                                "--by": `${s.y.toFixed(0)}px`,
                                "--i": i,
                              } as CSSProperties
                            }
                          />
                        ))}
                      </>
                    ) : isZap ? (
                      <>
                        {/* Ring of lightning bolts behind the cloud. */}
                        <g className="cxa-back">
                          {zap.bolts.map((b, i) => (
                            <path
                              key={i}
                              d={b.d}
                              fill={b.big ? palette.frontMid : palette.frontOuter}
                              stroke={palette.outline}
                              strokeWidth={5}
                              strokeLinejoin="round"
                            />
                          ))}
                        </g>
                        {/* The thundercloud. */}
                        <g className="cxa-front">
                          <path
                            d={zap.cloudPath}
                            fill="url(#exclaim-cloud)"
                            stroke={palette.outline}
                            strokeWidth={8}
                            strokeLinejoin="round"
                          />
                        </g>
                        {/* Black energy zigzags at the cloud edge. */}
                        {zap.sparks.map((s, i) => (
                          <path
                            key={i}
                            className="cxa-streak"
                            d={s.d}
                            fill="none"
                            stroke={palette.speck}
                            strokeWidth={5}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            style={
                              {
                                "--bx": `${s.bx.toFixed(0)}px`,
                                "--by": `${s.by.toFixed(0)}px`,
                                "--i": i,
                              } as CSSProperties
                            }
                          />
                        ))}
                        {/* Static crackle flying around (speck layer). */}
                        {zap.dots.map((c, i) => (
                          <circle
                            key={i}
                            className="cxa-speck"
                            cx={c.x}
                            cy={c.y}
                            r={c.r}
                            fill={palette.speck}
                            style={
                              {
                                "--bx": `${c.x.toFixed(0)}px`,
                                "--by": `${c.y.toFixed(0)}px`,
                                "--i": i,
                              } as CSSProperties
                            }
                          />
                        ))}
                        {zap.dashes.map((s, i) => (
                          <line
                            key={i}
                            className="cxa-speck"
                            x1={s.x1}
                            y1={s.y1}
                            x2={s.x2}
                            y2={s.y2}
                            stroke={palette.speck}
                            strokeWidth={4.5}
                            strokeLinecap="round"
                            style={
                              {
                                "--bx": `${s.x1.toFixed(0)}px`,
                                "--by": `${s.y1.toFixed(0)}px`,
                                "--i": zap.dots.length + i,
                              } as CSSProperties
                            }
                          />
                        ))}
                      </>
                    ) : isSplat ? (
                      <>
                        {/* Halftone dot shadow behind the goo — plays the
                            "back" role in every animation. */}
                        <g className="cxa-back">
                          <path
                            d={splat.blobPath}
                            transform="translate(22 30)"
                            fill="url(#exclaim-halftone)"
                            opacity={0.9}
                          />
                        </g>
                        {/* The goo blob itself. */}
                        <g className="cxa-front">
                          <path
                            d={splat.blobPath}
                            fill="url(#exclaim-front)"
                            stroke={palette.outline}
                            strokeWidth={8}
                            strokeLinejoin="round"
                          />
                        </g>
                        {/* Darker splotches inside the goo (streak layer). */}
                        {splat.splotches.map((s, i) => (
                          <ellipse
                            key={i}
                            className="cxa-streak"
                            cx={s.x}
                            cy={s.y}
                            rx={s.rx}
                            ry={s.ry}
                            fill={palette.streak}
                            opacity={0.55}
                            style={
                              {
                                "--bx": `${s.bx.toFixed(0)}px`,
                                "--by": `${s.by.toFixed(0)}px`,
                                "--i": i,
                              } as CSSProperties
                            }
                          />
                        ))}
                        {/* Flying droplets (speck layer — they blast out). */}
                        {splat.droplets.map((dp, i) => (
                          <circle
                            key={i}
                            className="cxa-speck"
                            cx={dp.x}
                            cy={dp.y}
                            r={dp.r}
                            fill={palette.frontMid}
                            stroke={dp.ring ? palette.outline : undefined}
                            strokeWidth={dp.ring ? 4 : 0}
                            style={
                              {
                                "--bx": `${dp.x.toFixed(0)}px`,
                                "--by": `${dp.y.toFixed(0)}px`,
                                "--i": i,
                              } as CSSProperties
                            }
                          />
                        ))}
                      </>
                    ) : (
                      <>
                    {/* Back burst: bigger, offset spikes, hot solid color. */}
                    <g className="cxa-back">
                      <path
                        d={burst.backPath}
                        fill={palette.backFill}
                        stroke={palette.outline}
                        strokeWidth={9}
                        strokeLinejoin="round"
                      />
                    </g>
                    {/* Front burst: yellow-hot radial core. */}
                    <g className="cxa-front">
                      <path
                        d={burst.frontPath}
                        fill="url(#exclaim-front)"
                        stroke={palette.outline}
                        strokeWidth={7}
                        strokeLinejoin="round"
                      />
                    </g>
                    {/* Radiating streaks. */}
                    {burst.streaks.map((s, i) => (
                      <path
                        key={i}
                        className="cxa-streak"
                        d={s.d}
                        fill={palette.streak}
                        opacity={0.85}
                        style={
                          {
                            "--bx": `${s.bx.toFixed(0)}px`,
                            "--by": `${s.by.toFixed(0)}px`,
                            "--i": i,
                          } as CSSProperties
                        }
                      />
                    ))}
                    {/* Ink specks flying off the tips. */}
                    {burst.speckCircles.map((c, i) => (
                      <circle
                        key={i}
                        className="cxa-speck"
                        cx={c.x}
                        cy={c.y}
                        r={c.r}
                        fill={palette.speck}
                        style={
                          {
                            "--bx": `${c.x.toFixed(0)}px`,
                            "--by": `${c.y.toFixed(0)}px`,
                            "--i": i,
                          } as CSSProperties
                        }
                      />
                    ))}
                    {burst.speckDashes.map((s, i) => (
                      <line
                        key={i}
                        className="cxa-speck"
                        x1={s.x1}
                        y1={s.y1}
                        x2={s.x2}
                        y2={s.y2}
                        stroke={palette.speck}
                        strokeWidth={4.5}
                        strokeLinecap="round"
                        style={
                          {
                            "--bx": `${s.x1.toFixed(0)}px`,
                            "--by": `${s.y1.toFixed(0)}px`,
                            "--i": burst.speckCircles.length + i,
                          } as CSSProperties
                        }
                      />
                    ))}
                      </>
                    )}

                    {/* Depth copy first (offset dark), then the face on top. */}
                    <g className="cxa-word">
                      <g
                        transform={`translate(${depthX.toFixed(1)} ${depthY.toFixed(1)})`}
                      >
                        <text
                          fontFamily={FONT_STACK}
                          fontSize={fontSize}
                          fill={palette.outline}
                          stroke={palette.outline}
                          strokeWidth={strokeW}
                          strokeLinejoin="round"
                        >
                          <textPath
                            href="#exclaim-arc"
                            startOffset="50%"
                            textAnchor="middle"
                          >
                            {display}
                          </textPath>
                        </text>
                      </g>
                      <text
                        fontFamily={FONT_STACK}
                        fontSize={fontSize}
                        fill="url(#exclaim-text)"
                        stroke={palette.outline}
                        strokeWidth={strokeW}
                        strokeLinejoin="round"
                        style={{ paintOrder: "stroke" }}
                      >
                        <textPath
                          href="#exclaim-arc"
                          startOffset="50%"
                          textAnchor="middle"
                        >
                          {display}
                        </textPath>
                      </text>
                      {isZap ? (
                        /* Comic-print halftone inside the zap lettering. */
                        <text
                          fontFamily={FONT_STACK}
                          fontSize={fontSize}
                          fill="url(#exclaim-text-dots)"
                          fillOpacity={0.38}
                        >
                          <textPath
                            href="#exclaim-arc"
                            startOffset="50%"
                            textAnchor="middle"
                          >
                            {display}
                          </textPath>
                        </text>
                      ) : null}
                    </g>
                  </g>

                  {/* Flash-in ring and implode pip: invisible until their
                      animations light them up. */}
                  <circle className="cxa-flash" r={210} fill="#ffffff" opacity={0} />
                  <circle
                    className="cxa-pip"
                    r={13}
                    fill={palette.outline}
                    opacity={0}
                  />
                </g>
              </g>
            </svg>
          </div>

          {/* Controls */}
          <div className="flex flex-col gap-4 rounded-xl border border-neutral-300 bg-white p-4">
            <label className="block">
              <span className="text-xs font-medium text-neutral-600">Text</span>
              <input
                value={text}
                onChange={(e) => set({ text: e.target.value })}
                placeholder="BOOM!"
                className="mt-1 w-full rounded border border-neutral-300 px-2 py-1.5 text-sm font-bold uppercase tracking-wide focus:border-neutral-500 focus:outline-none"
              />
            </label>

            <div>
              <span className="text-xs font-medium text-neutral-600">
                Palette
              </span>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {PALETTES.map((p) => (
                  <button
                    key={p.name}
                    onClick={() => set({ palette: p.name })}
                    className={
                      "rounded px-2 py-1 text-xs " +
                      (p.name === palette.name
                        ? "ring-2 ring-neutral-800"
                        : "ring-1 ring-neutral-300")
                    }
                    style={{
                      background: `linear-gradient(135deg, ${p.frontMid} 50%, ${p.backFill} 50%)`,
                      color: p.outline,
                      fontWeight: 700,
                    }}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <span className="text-xs font-medium text-neutral-600">Shape</span>
              <div className="mt-1 flex gap-1.5">
                {[
                  { key: "burst", label: "💥 Burst" },
                  { key: "splat", label: "🟢 Splat" },
                  { key: "zap", label: "⚡ Zap" },
                  { key: "kaboom", label: "🔥 Kaboom" },
                  { key: "aaargh", label: "😱 Aaargh" },
                ].map((s) => (
                  <button
                    key={s.key}
                    onClick={() => set({ shape: s.key })}
                    className={
                      "flex-1 rounded px-2 py-1 text-xs " +
                      (s.key ===
                      (isAaargh
                        ? "aaargh"
                        : isKaboom
                          ? "kaboom"
                          : isZap
                            ? "zap"
                            : isSplat
                              ? "splat"
                              : "burst")
                        ? "bg-neutral-800 text-white"
                        : "border border-neutral-300 text-neutral-700 hover:bg-neutral-50")
                    }
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {isKaboom ? (
              <label className="block">
                <span className="text-xs font-medium text-neutral-600">
                  Puffs: {puffs}
                </span>
                <input
                  type="range"
                  min={4}
                  max={14}
                  value={puffs}
                  onChange={(e) => set({ puffs: Number(e.target.value) })}
                  className="mt-1 w-full"
                />
              </label>
            ) : isZap ? (
              <label className="block">
                <span className="text-xs font-medium text-neutral-600">
                  Bolts: {bolts}
                </span>
                <input
                  type="range"
                  min={5}
                  max={12}
                  value={bolts}
                  onChange={(e) => set({ bolts: Number(e.target.value) })}
                  className="mt-1 w-full"
                />
              </label>
            ) : isSplat ? (
              <>
                <label className="block">
                  <span className="text-xs font-medium text-neutral-600">
                    Lobes: {lobes}
                  </span>
                  <input
                    type="range"
                    min={7}
                    max={16}
                    value={lobes}
                    onChange={(e) => set({ lobes: Number(e.target.value) })}
                    className="mt-1 w-full"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-neutral-600">
                    Drips: {drips}
                  </span>
                  <input
                    type="range"
                    min={4}
                    max={24}
                    value={drips}
                    onChange={(e) => set({ drips: Number(e.target.value) })}
                    className="mt-1 w-full"
                  />
                </label>
              </>
            ) : (
              <label className="block">
                <span className="text-xs font-medium text-neutral-600">
                  Spikes: {spikes}
                </span>
                <input
                  type="range"
                  min={10}
                  max={20}
                  value={spikes}
                  onChange={(e) => set({ spikes: Number(e.target.value) })}
                  className="mt-1 w-full"
                />
              </label>
            )}

            <label className="block">
              <span className="text-xs font-medium text-neutral-600">
                Arc: {bow}
              </span>
              <input
                type="range"
                min={0}
                max={60}
                value={bow}
                onChange={(e) => set({ bow: Number(e.target.value) })}
                className="mt-1 w-full"
              />
            </label>

            <label className="block">
              <span className="text-xs font-medium text-neutral-600">
                Tilt: {tilt}°
              </span>
              <input
                type="range"
                min={-15}
                max={15}
                value={tilt}
                onChange={(e) => set({ tilt: Number(e.target.value) })}
                className="mt-1 w-full"
              />
            </label>

            <label className="block">
              <span className="text-xs font-medium text-neutral-600">
                Pixelate: {pixel > 0 ? `${pixel}px blocks` : "off"}
              </span>
              <input
                type="range"
                min={0}
                max={16}
                value={pixel}
                onChange={(e) => set({ pixel: Number(e.target.value) })}
                className="mt-1 w-full"
              />
            </label>

            <button
              onClick={() =>
                set({ seed: Math.floor(Math.random() * 0xffffffff) })
              }
              className="rounded border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50"
            >
              🎲 Reshuffle shape
            </button>

            <div className="border-t border-neutral-200 pt-3">
              <span className="text-xs font-medium text-neutral-600">
                Animate in
              </span>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {IN_ANIMS.map((a) => (
                  <button
                    key={a.key}
                    onClick={() => set({ animIn: a.key })}
                    className={
                      "rounded px-2 py-1 text-xs " +
                      (a.key === animIn
                        ? "bg-neutral-800 text-white"
                        : "border border-neutral-300 text-neutral-700 hover:bg-neutral-50")
                    }
                  >
                    {a.label}
                  </button>
                ))}
              </div>
              <span className="mt-2 block text-xs font-medium text-neutral-600">
                Animate out
              </span>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {OUT_ANIMS.map((a) => (
                  <button
                    key={a.key}
                    onClick={() => set({ animOut: a.key })}
                    className={
                      "rounded px-2 py-1 text-xs " +
                      (a.key === animOut
                        ? "bg-neutral-800 text-white"
                        : "border border-neutral-300 text-neutral-700 hover:bg-neutral-50")
                    }
                  >
                    {a.label}
                  </button>
                ))}
              </div>
              <div className="mt-2 flex gap-1.5">
                <button
                  onClick={() => play("in")}
                  className="flex-1 rounded border border-neutral-300 px-2 py-1.5 text-sm hover:bg-neutral-50"
                >
                  ▶ In
                </button>
                <button
                  onClick={() => play("out")}
                  className="flex-1 rounded border border-neutral-300 px-2 py-1.5 text-sm hover:bg-neutral-50"
                >
                  ▶ Out
                </button>
                <button
                  onClick={() => play("both")}
                  className="flex-1 rounded border border-neutral-300 px-2 py-1.5 text-sm hover:bg-neutral-50"
                >
                  ▶ Both
                </button>
              </div>
            </div>

            <button
              onClick={() => void exportPng()}
              className="rounded bg-neutral-800 px-3 py-1.5 text-sm text-white hover:bg-neutral-700"
            >
              Download PNG (transparent)
            </button>

            <div className="border-t border-neutral-200 pt-3">
              <div className="flex gap-1.5">
                <button
                  onClick={() => void copyJson()}
                  className="flex-1 rounded border border-neutral-300 px-2 py-1.5 text-sm hover:bg-neutral-50"
                >
                  📋 Copy JSON
                </button>
                <button
                  onClick={() => void pasteJson()}
                  className="flex-1 rounded border border-neutral-300 px-2 py-1.5 text-sm hover:bg-neutral-50"
                >
                  📥 Paste JSON
                </button>
              </div>
              {jsonStatus ? (
                <p
                  className={
                    "mt-1.5 text-xs " +
                    (jsonStatus.kind === "error"
                      ? "text-red-600"
                      : "text-green-700")
                  }
                >
                  {jsonStatus.message}
                </p>
              ) : (
                <p className="mt-1.5 text-xs text-neutral-400">
                  The spec reproduces this exclamation exactly — seed included.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
