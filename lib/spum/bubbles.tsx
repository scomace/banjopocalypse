"use client";

// E13d — Shared pixel-bubble rendering primitives.
//
// Extracted from the original `SpumCommsHarness` (admin tab) so both the
// admin look-iteration UI and the live scene runtime render byte-identical
// pixels from the same source. Components here are pure presentation —
// they take a config blob and render. No scene state, no anchors; the
// scene layer wraps them and positions them.
//
// Three bubble families ship today; each is a separate component but they
// share the same control surface (pixelSize, font, padding, alignment,
// colour, etc.) via `BubbleCommonProps`. A discriminated-union
// `SceneBubbleStyle` (defined in `./types`) names a specific bubble plus
// its kind-specific fields; `BubbleByStyle` switches on it.

import { useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

import "@fontsource/press-start-2p";

import type { SceneBubbleStyle } from "./types";

// next/font replaced by @fontsource in the Vite port. Tailwind arbitrary
// font-family (underscores become spaces) keeps the same className contract.
const pixelFont = { className: "font-['Press_Start_2P']" };

// Press Start 2P's space glyph is a full em, which reads too airy at bubble
// scale. Every bubble text block AND its hidden measurement twin must use
// the same value or measured widths drift from rendered ones.
const WORD_SPACING = "-0.3em";

// "." and "," also occupy a full monospace cell with their ink in the far
// bottom-left, so punctuation + space still reads double-wide after
// WORD_SPACING. Kern the punctuation glyph itself whenever a space follows.
// All bubble text (and the measurement twin) must go through kernedText or
// measured widths drift from rendered ones.
const PUNCT_KERN = "-0.35em";

function kernedText(text: string): ReactNode {
  if (!/[.,] /.test(text)) return text;
  const nodes: ReactNode[] = [];
  let buf = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    buf += ch;
    if ((ch === "." || ch === ",") && text[i + 1] === " ") {
      nodes.push(
        <span key={nodes.length} style={{ marginRight: PUNCT_KERN }}>
          {buf}
        </span>,
      );
      buf = "";
    }
  }
  if (buf) nodes.push(buf);
  return nodes;
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type BubbleRoundedVariant = "classic" | "drop-shadow";
// "none" is the tailless option: a bare rounded/thought body with no mouth.
// Reach for it when the bubble is a CAPTION rather than speech — infomercial
// title cards, on-screen labels, chyrons — where a tail would imply a speaker
// who isn't there. `unit0-lesson4-ch8` is the worked example.
export type BubbleTailShape =
  | "none"
  | "slanted-left"
  | "wide"
  | "slanted-right";
export type BubbleThoughtShape = "ellipse" | "cloud";
export type BubbleExclamationShape = "star-8" | "spiky-5";

export type BubbleTextAlignH = "left" | "center" | "right";
export type BubbleTextAlignV = "top" | "middle" | "bottom";

// ---------------------------------------------------------------------------
// Enter/exit transition math — shared between the scene runtime and the
// /admin/spum Comms harness preview so both render the same curves.
// ---------------------------------------------------------------------------

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

// Bubble pop scale curve. Enter: 0 → 1.15 (at p=0.6) → 1.0 (at p=1). Exit:
// 1.0 → 1.15 (at p=0.4) → 0 (at p=1). The overshoot is what makes the
// comedic beat read — a straight 0→1 ease just looks like a fade-with-zoom.
export function bubblePopScale(p: number, direction: "in" | "out"): number {
  if (direction === "in") {
    if (p <= 0.6) return (p / 0.6) * 1.15;
    return 1.15 - ((p - 0.6) / 0.4) * 0.15;
  }
  if (p <= 0.4) return 1 + (p / 0.4) * 0.15;
  return 1.15 - ((p - 0.4) / 0.6) * 1.15;
}

// Bounce: bubble drops in from -BOUNCE_HEIGHT to 0 with a three-arc decay
// (the initial drop + two diminishing bounces). The exit is asymmetrical —
// a straight accelerating lift up + fade, since a real ball doesn't "un-drop"
// and a multi-bounce reversal reads as agitated rather than departing.
const BOUNCE_HEIGHT = 30;
function bubbleBounceState(
  p: number,
  direction: "in" | "out",
): { dy: number; opacity: number } {
  if (direction === "in") {
    // Arc 1 (0..0.5): initial drop from -H to 0, parabolic ease-in.
    if (p < 0.5) {
      const lp = p / 0.5;
      return { dy: -BOUNCE_HEIGHT * (1 - lp) * (1 - lp), opacity: 1 };
    }
    // Arc 2 (0.5..0.75): bounce up to -H*0.3 then back to 0.
    if (p < 0.75) {
      const lp = (p - 0.5) / 0.25;
      return { dy: -BOUNCE_HEIGHT * 0.3 * 4 * lp * (1 - lp), opacity: 1 };
    }
    // Arc 3 (0.75..1.0): smaller bounce up to -H*0.09 then back to 0.
    const lp = (p - 0.75) / 0.25;
    return { dy: -BOUNCE_HEIGHT * 0.09 * 4 * lp * (1 - lp), opacity: 1 };
  }
  // Exit: bubble lifts up with accelerating speed (p²) while fading. Reads
  // as "pulled away" rather than "bounces up and bumps back down."
  return { dy: -BOUNCE_HEIGHT * p * p, opacity: 1 - p };
}

// Shake: damped sinusoidal wobble. Five oscillations over the duration. Enter
// snaps to full opacity and shakes its biggest at p=0 (startled-then-settles).
// Exit fades opacity to 0 across the full duration while the wobble decays
// from the opposite end (small → small) — visually "trembling out."
const SHAKE_AMPLITUDE = 8;
const SHAKE_OSCILLATIONS = 5;
function bubbleShakeState(
  p: number,
  direction: "in" | "out",
): { dx: number; opacity: number } {
  // Decay envelope: highest amplitude at p=0 for in, at p=1 for out. The
  // exp(-3*x) factor takes the wobble from ~1.0 to ~0.05 across the curve.
  const decayArg = direction === "in" ? p : 1 - p;
  const envelope = Math.exp(-3 * decayArg);
  const dx =
    SHAKE_AMPLITUDE * envelope * Math.sin(2 * Math.PI * SHAKE_OSCILLATIONS * p);
  const opacity = direction === "in" ? 1 : 1 - p;
  return { dx, opacity };
}

// Per-frame transform state for a bubble inside an enter/exit window. The
// runtime and the harness preview both feed `(kind, p, direction)` and write
// the returned dx/dy/scale/opacity onto the bubble wrapper. Each kind
// populates the fields it owns; the others stay at their no-op defaults.
export type BubbleTransitionState = {
  dx: number;
  dy: number;
  scale: number;
  opacity: number;
};

export const BUBBLE_TRANSITION_DEFAULT_DUR: Record<
  "fade" | "pop" | "bounce" | "shake",
  number
> = {
  fade: 0.25,
  pop: 0.15,
  bounce: 0.6,
  shake: 0.5,
};

export function evaluateBubbleTransition(
  kind: "fade" | "pop" | "bounce" | "shake",
  p: number,
  direction: "in" | "out",
): BubbleTransitionState {
  const pc = clamp01(p);
  if (kind === "fade") {
    return { dx: 0, dy: 0, scale: 1, opacity: direction === "in" ? pc : 1 - pc };
  }
  if (kind === "pop") {
    return { dx: 0, dy: 0, scale: bubblePopScale(pc, direction), opacity: 1 };
  }
  if (kind === "bounce") {
    const { dy, opacity } = bubbleBounceState(pc, direction);
    return { dx: 0, dy, scale: 1, opacity };
  }
  // shake
  const { dx, opacity } = bubbleShakeState(pc, direction);
  return { dx, dy: 0, scale: 1, opacity };
}

// Each tail shape: array of `[leftCol, rightCol]` per row from the seam
// (row 0) downward. Coordinates in pixel-units (× pixelSize at render time).
const TAIL_SHAPES: Record<BubbleTailShape, ReadonlyArray<readonly [number, number]>> = {
  // No mouth at all — zero rows, so `tailWidthUnits`/`tailHeightUnits` both
  // return 0 and the renderers skip <PixelTail> entirely.
  none: [],
  // Right-triangle: left side vertical, right side angles in to bottom-left.
  "slanted-left": [
    [0, 4],
    [0, 3],
    [0, 2],
    [0, 1],
    [0, 0],
  ],
  // Equilateral 7 × 3, point centred.
  wide: [
    [0, 6],
    [1, 5],
    [2, 4],
    [3, 3],
  ],
  // Mirror of slanted-left: right side vertical, left side angles in.
  "slanted-right": [
    [0, 4],
    [1, 4],
    [2, 4],
    [3, 4],
    [4, 4],
  ],
};

function tailWidthUnits(shape: BubbleTailShape) {
  return TAIL_SHAPES[shape].reduce((acc, [, r]) => Math.max(acc, r + 1), 0);
}

function tailHeightUnits(shape: BubbleTailShape) {
  return TAIL_SHAPES[shape].length;
}

export const EXCLAMATION_LABELS: Record<BubbleExclamationShape, string> = {
  "star-8": "8-pt star",
  "spiky-5": "Spiky burst",
};

// ---------------------------------------------------------------------------
// Pixel-ellipse rasterizer (midpoint algorithm)
// ---------------------------------------------------------------------------
//
// The thought-bubble shapes (ellipse / cloud / pill) all draw curves. To keep
// the pixel-art look we can't lean on SVG <ellipse>: browsers antialias
// curves even with `shape-rendering: crispEdges`. So we rasterize ellipses
// ourselves with the midpoint algorithm and emit each output pixel as a
// `px × px` <rect>, the same approach the triangle tail uses.

// Returns the outline pixel coords of an ellipse centred on the origin with
// integer semi-axes (rx, ry). Standard two-region midpoint ellipse.
function ellipseOutline(rx: number, ry: number): Array<[number, number]> {
  const seen = new Set<string>();
  const out: Array<[number, number]> = [];
  const add = (x: number, y: number) => {
    const k = `${x},${y}`;
    if (!seen.has(k)) {
      seen.add(k);
      out.push([x, y]);
    }
  };

  let x = 0;
  let y = ry;
  const rx2 = rx * rx;
  const ry2 = ry * ry;
  let d1 = ry2 - rx2 * ry + 0.25 * rx2;
  let dx = 2 * ry2 * x;
  let dy = 2 * rx2 * y;

  // Region 1: slope < 1 in absolute value (top/bottom-ish arcs).
  while (dx < dy) {
    add(x, y); add(-x, y); add(x, -y); add(-x, -y);
    if (d1 < 0) {
      x++;
      dx += 2 * ry2;
      d1 += dx + ry2;
    } else {
      x++;
      y--;
      dx += 2 * ry2;
      dy -= 2 * rx2;
      d1 += dx - dy + ry2;
    }
  }

  // Region 2: slope > 1 (side arcs).
  let d2 =
    ry2 * (x + 0.5) * (x + 0.5) + rx2 * (y - 1) * (y - 1) - rx2 * ry2;
  while (y >= 0) {
    add(x, y); add(-x, y); add(x, -y); add(-x, -y);
    if (d2 > 0) {
      y--;
      dy -= 2 * rx2;
      d2 += rx2 - dy;
    } else {
      y--;
      x++;
      dx += 2 * ry2;
      dy -= 2 * rx2;
      d2 += dx - dy + rx2;
    }
  }

  return out;
}

// Compute min/max x outline pixel per row — used for both single-ellipse
// fill (each row has one span between min and max) and for the multi-
// ellipse union renderer (per-row spans get merged across ellipses).
function ellipseSpans(
  rx: number,
  ry: number,
): Array<{ y: number; xMin: number; xMax: number }> {
  const points = ellipseOutline(rx, ry);
  const byRow = new Map<number, { min: number; max: number }>();
  for (const [x, y] of points) {
    const e = byRow.get(y);
    if (!e) byRow.set(y, { min: x, max: x });
    else {
      if (x < e.min) e.min = x;
      if (x > e.max) e.max = x;
    }
  }
  return Array.from(byRow.entries())
    .map(([y, { min, max }]) => ({ y, xMin: min, xMax: max }))
    .sort((a, b) => a.y - b.y);
}

// Union of N positioned ellipses. Returns:
//   - fillSpans: per-row horizontal spans covering the union's interior
//   - outlinePoints: outline pixels of each ellipse, with any pixel that's
//     strictly inside another ellipse removed (so internal seams disappear
//     and the result reads as one shape).
type PositionedEllipse = { cx: number; cy: number; rx: number; ry: number };

function ellipseUnion(ellipses: PositionedEllipse[]): {
  fillSpans: Array<{ y: number; xMin: number; xMax: number }>;
  outlinePoints: Array<[number, number]>;
} {
  // Outlines, filtered to drop pixels strictly inside any other ellipse.
  const outlinePoints: Array<[number, number]> = [];
  for (const e of ellipses) {
    const pts = ellipseOutline(e.rx, e.ry);
    for (const [px, py] of pts) {
      const ax = e.cx + px;
      const ay = e.cy + py;
      let insideOther = false;
      for (const o of ellipses) {
        if (o === e) continue;
        const ox = ax - o.cx;
        const oy = ay - o.cy;
        if ((ox * ox) / (o.rx * o.rx) + (oy * oy) / (o.ry * o.ry) < 1) {
          insideOther = true;
          break;
        }
      }
      if (!insideOther) outlinePoints.push([ax, ay]);
    }
  }

  // Per-row span merge for the fill.
  const rowMap = new Map<number, Array<[number, number]>>();
  for (const e of ellipses) {
    for (const { y, xMin, xMax } of ellipseSpans(e.rx, e.ry)) {
      const absY = e.cy + y;
      const spans = rowMap.get(absY) ?? [];
      spans.push([e.cx + xMin, e.cx + xMax]);
      rowMap.set(absY, spans);
    }
  }
  const fillSpans: Array<{ y: number; xMin: number; xMax: number }> = [];
  Array.from(rowMap.entries()).forEach(([y, spans]) => {
    spans.sort((a: [number, number], b: [number, number]) => a[0] - b[0]);
    const merged: Array<[number, number]> = [];
    for (const [a, b] of spans) {
      const last = merged[merged.length - 1];
      if (!last || a > last[1] + 1) merged.push([a, b]);
      else if (b > last[1]) last[1] = b;
    }
    for (const [xMin, xMax] of merged) fillSpans.push({ y, xMin, xMax });
  });
  return { outlinePoints, fillSpans };
}

// ---------------------------------------------------------------------------
// Thought-bubble shape definitions
// ---------------------------------------------------------------------------

type ThoughtGeometry = {
  widthUnits: number;
  heightUnits: number;
  innerOffsetX: number;
  innerOffsetY: number;
  ellipses: PositionedEllipse[];
};

function thoughtGeometry(
  shape: BubbleThoughtShape,
  innerWidthUnits: number,
  innerHeightUnits: number,
): ThoughtGeometry {
  const w = Math.max(2, innerWidthUnits);
  const h = Math.max(2, innerHeightUnits);

  if (shape === "ellipse") {
    const rx = Math.ceil(w / Math.SQRT2);
    const ry = Math.ceil(h / Math.SQRT2);
    const totalW = rx * 2 + 1;
    const totalH = ry * 2 + 1;
    return {
      widthUnits: totalW,
      heightUnits: totalH,
      innerOffsetX: Math.round((totalW - w) / 2),
      innerOffsetY: Math.round((totalH - h) / 2),
      ellipses: [{ cx: rx, cy: ry, rx, ry }],
    };
  }

  // shape === "cloud" — bumpy outline made by overlapping a central ellipse
  // with satellite ellipses bulging out every edge.
  const bumpR = Math.max(4, Math.round(h * 0.55));
  const padX = Math.max(bumpR, Math.ceil(w * 0.15));
  const padY = bumpR;
  const totalW = w + padX * 2;
  const totalH = h + padY * 2;
  const cx = Math.floor(totalW / 2);
  const cy = Math.floor(totalH / 2);

  const bumpSpacing = bumpR * 1.6;
  const nBumps = Math.max(2, Math.min(5, Math.round(w / bumpSpacing)));
  const step = w / nBumps;
  const topBumps: PositionedEllipse[] = [];
  const bottomBumps: PositionedEllipse[] = [];
  for (let i = 0; i < nBumps; i++) {
    const bx = padX + Math.round(step * (i + 0.5));
    topBumps.push({ cx: bx, cy: padY, rx: bumpR, ry: bumpR });
    bottomBumps.push({ cx: bx, cy: totalH - padY - 1, rx: bumpR, ry: bumpR });
  }
  const sideBumps: PositionedEllipse[] = [
    { cx: padX, cy, rx: bumpR, ry: bumpR },
    { cx: totalW - padX - 1, cy, rx: bumpR, ry: bumpR },
  ];
  const central: PositionedEllipse = {
    cx,
    cy,
    rx: Math.ceil(w / 2) + 1,
    ry: Math.ceil(h / 2) + 1,
  };

  return {
    widthUnits: totalW,
    heightUnits: totalH,
    innerOffsetX: padX,
    innerOffsetY: padY,
    ellipses: [central, ...topBumps, ...bottomBumps, ...sideBumps],
  };
}

// ---------------------------------------------------------------------------
// Common bubble props
// ---------------------------------------------------------------------------

type BubbleCommonProps = {
  text: string;
  pixelSize: number;
  fontScale: number;        // integer ≥1; CSS font-size = fontScale * 8 (Press Start 2P native unit)
  paddingX: number;
  paddingY: number;
  lineHeight: number;
  sideTrim: number;
  widthPx: number | null;
  heightPx: number | null;
  wrap: boolean;
  textAlignH: BubbleTextAlignH;
  textAlignV: BubbleTextAlignV;
  textOffsetX: number;
  textOffsetY: number;
  textColor: string;
  bgColor: string;
};

type SpeechBubbleTailProps = {
  tailShape: BubbleTailShape;
  tailXPercent: number; // 0 = far left, 100 = far right
};

const ALIGN_H_TO_FLEX: Record<BubbleTextAlignH, "flex-start" | "center" | "flex-end"> = {
  left: "flex-start",
  center: "center",
  right: "flex-end",
};
const ALIGN_V_TO_FLEX: Record<BubbleTextAlignV, "flex-start" | "center" | "flex-end"> = {
  top: "flex-start",
  middle: "center",
  bottom: "flex-end",
};

// ---------------------------------------------------------------------------
// Triangle tail (for rounded speech bubbles)
// ---------------------------------------------------------------------------

function PixelTail({
  shape,
  pixelSize,
  fg,
  bg,
  showShadow,
  leftPx,
}: {
  shape: BubbleTailShape;
  pixelSize: number;
  fg: string;
  bg: string;
  showShadow: boolean;
  leftPx: number;
}) {
  const px = pixelSize;
  const rows = TAIL_SHAPES[shape];
  const w = tailWidthUnits(shape) * px;
  const h = tailHeightUnits(shape) * px;

  const baseStyle: React.CSSProperties = {
    position: "absolute",
    pointerEvents: "none",
    display: "block",
    overflow: "visible",
    top: "100%",
    left: leftPx,
    // Overlap the bubble's bottom border by one pixel-unit so the seam row
    // sits ON the border row (its outer cells match the existing border;
    // its inner cells erase the border to open the mouth).
    marginTop: -px,
  };

  return (
    <>
      {showShadow && (
        <svg
          width={w}
          height={h}
          viewBox={`0 0 ${w} ${h}`}
          shapeRendering="crispEdges"
          style={{
            ...baseStyle,
            transform: `translate(${px}px, ${px}px)`,
            zIndex: 0,
          }}
        >
          {rows.flatMap(([left, right], r) =>
            Array.from({ length: right - left + 1 }, (_, i) => {
              const c = left + i;
              return (
                <rect
                  key={`s-${r}-${c}`}
                  x={c * px}
                  y={r * px}
                  width={px}
                  height={px}
                  fill={fg}
                />
              );
            }),
          )}
        </svg>
      )}
      <svg
        width={w}
        height={h}
        viewBox={`0 0 ${w} ${h}`}
        shapeRendering="crispEdges"
        style={{ ...baseStyle, zIndex: 1 }}
      >
        {rows.flatMap(([left, right], r) =>
          Array.from({ length: right - left + 1 }, (_, i) => {
            const c = left + i;
            const isEdge = c === left || c === right;
            return (
              <rect
                key={`${r}-${c}`}
                x={c * px}
                y={r * px}
                width={px}
                height={px}
                fill={isEdge ? fg : bg}
              />
            );
          }),
        )}
      </svg>
    </>
  );
}

// ---------------------------------------------------------------------------
// Thought bubble
// ---------------------------------------------------------------------------

export type PixelThoughtBubbleProps = BubbleCommonProps &
  SpeechBubbleTailProps & {
    shape: BubbleThoughtShape;
  };

export function PixelThoughtBubble({
  text,
  shape,
  tailShape,
  tailXPercent,
  pixelSize,
  fontScale,
  paddingX,
  paddingY,
  lineHeight,
  sideTrim,
  widthPx,
  heightPx,
  wrap,
  textAlignH,
  textAlignV,
  textOffsetX,
  textOffsetY,
  textColor,
  bgColor,
}: PixelThoughtBubbleProps) {
  const px = pixelSize;
  const fg = textColor;
  const bg = bgColor;

  const innerRef = useRef<HTMLDivElement>(null);
  const [innerSize, setInnerSize] = useState<{ w: number; h: number } | null>(
    null,
  );
  const [tailLeftPx, setTailLeftPx] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    const compute = () => {
      // offsetWidth/offsetHeight, NOT getBoundingClientRect: the rect is
      // post-transform, and scenes render inside a responsive
      // `transform: scale(...)` wrapper — on a scaled-down phone viewport
      // the rect under-measures the text and the bubble body is drawn too
      // small for its words. offset* return untransformed layout pixels.
      setInnerSize({ w: el.offsetWidth, h: el.offsetHeight });
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [text, fontScale, paddingX, paddingY, lineHeight, sideTrim, widthPx, heightPx, px, wrap]);

  const innerWUnits = innerSize ? Math.max(2, Math.ceil(innerSize.w / px)) : 2;
  const innerHUnits = innerSize ? Math.max(2, Math.ceil(innerSize.h / px)) : 2;
  const geom = thoughtGeometry(shape, innerWUnits, innerHUnits);
  const { outlinePoints, fillSpans } = ellipseUnion(geom.ellipses);

  const shapePxW = geom.widthUnits * px;
  const shapePxH = geom.heightUnits * px;
  // Hidden until the body has a real measurement (see below).
  const measured = innerSize !== null;

  useLayoutEffect(() => {
    if (!innerSize) return;
    const range = Math.max(0, shapePxW);
    const raw = (range * tailXPercent) / 100;
    setTailLeftPx(Math.round(raw / px) * px);
  }, [tailXPercent, shapePxW, px, innerSize]);

  return (
    <div
      style={{
        position: "relative",
        width: shapePxW,
        height: shapePxH,
        overflow: "visible",
        // Never paint an unmeasured body — the pre-measurement fallback is
        // a 2-unit stub, and flashing that reads as a glitch.
        visibility: measured ? "visible" : "hidden",
      }}
    >
      <svg
        width={shapePxW}
        height={shapePxH}
        viewBox={`0 0 ${shapePxW} ${shapePxH}`}
        shapeRendering="crispEdges"
        style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
      >
        {fillSpans.map(({ y, xMin, xMax }) => (
          <rect
            key={`f-${y}-${xMin}`}
            x={xMin * px}
            y={y * px}
            width={(xMax - xMin + 1) * px}
            height={px}
            fill={bg}
          />
        ))}
        {outlinePoints.map(([x, y], i) => (
          <rect
            key={`o-${i}`}
            x={x * px}
            y={y * px}
            width={px}
            height={px}
            fill={fg}
          />
        ))}
      </svg>

      <div
        ref={innerRef}
        className={pixelFont.className}
        style={{
          position: "absolute",
          left: geom.innerOffsetX * px,
          top: geom.innerOffsetY * px,
          color: fg,
          padding: `${px * paddingY}px ${px * paddingX}px`,
          fontSize: 8 * fontScale,
          lineHeight,
          letterSpacing: 0,
          wordSpacing: WORD_SPACING,
          whiteSpace: wrap ? "pre-wrap" : "nowrap",
          wordBreak: wrap ? "break-word" : "normal",
          display: "flex",
          flexDirection: "column",
          alignItems: ALIGN_H_TO_FLEX[textAlignH],
          // alignItems places the text BLOCK; textAlign lays the lines out
          // inside it. Only multi-line text (wrapped, or with an authored
          // newline) can tell the difference — a single line is exactly as
          // wide as its block, so this is a no-op for the common case.
          textAlign: textAlignH,
          justifyContent: ALIGN_V_TO_FLEX[textAlignV],
          boxSizing: "border-box",
          // `max-content` when auto-sizing is LOAD-BEARING. This element is
          // absolutely positioned inside the very box its own measurement
          // sizes, so a shrink-to-fit width is capped by that box: on first
          // mount the parent is the 2-unit stub, the text wraps hard against
          // it, measures narrow, the parent grows a little, and it re-wraps —
          // converging over many frames as the words visibly unpack. Sizing
          // to the widest line instead ignores the parent and lands the right
          // measurement on the first pass. Lines still break exactly where
          // the author put a newline (see the authoring doc's rule about
          // breaking any line over ~10 characters).
          width: widthPx ?? "max-content",
          height: heightPx ?? undefined,
          overflow: "visible",
          WebkitFontSmoothing: "none",
          MozOsxFontSmoothing: "grayscale",
        }}
      >
        <span
          style={{
            display: "inline-block",
            marginLeft: -sideTrim * px,
            marginRight: -sideTrim * px,
            transform: `translate(${textOffsetX * px}px, ${textOffsetY * px}px)`,
          }}
        >
          {kernedText(text)}
        </span>
      </div>

      {tailLeftPx !== null && tailShape !== "none" && (
        <PixelDotTail
          direction={tailShape}
          pixelSize={px}
          fg={fg}
          bg={bg}
          anchorXPx={tailLeftPx}
          bubbleHeightPx={shapePxH}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dot tail (hollow-circles trio for thought bubbles)
// ---------------------------------------------------------------------------

// Straight tail (`wide`): dots descend vertically below the bubble.
const DOT_TAIL_DOTS: ReadonlyArray<{ size: number; dy: number }> = [
  { size: 5, dy: 2 },
  { size: 3, dy: 10 },
  { size: 3, dy: 16 },
];

// Slanted tails: a single dot overlapping the bubble's bottom edge on the
// slant side (negative `dy` pulls it up into the bubble body). `dx` is in
// pixel-units toward the slant side (negated for slanted-left).
const DOT_TAIL_DOTS_CURVED: ReadonlyArray<{
  size: number;
  dx: number;
  dy: number;
}> = [{ size: 5, dx: 2, dy: -8 }];

function hollowCirclePixels(size: number): {
  fill: Array<[number, number]>;
  outline: Array<[number, number]>;
} {
  const r = Math.max(0, Math.floor((size - 1) / 2));
  if (r === 0) {
    return { fill: [], outline: [[0, 0]] };
  }
  const spans = ellipseSpans(r, r);
  const outlinePts = ellipseOutline(r, r);
  const fill: Array<[number, number]> = [];
  for (const { y, xMin, xMax } of spans) {
    for (let x = xMin + 1; x < xMax; x++) fill.push([x + r, y + r]);
  }
  const outline: Array<[number, number]> = outlinePts.map(([x, y]) => [
    x + r,
    y + r,
  ]);
  return { fill, outline };
}

function PixelDotTail({
  direction,
  pixelSize,
  fg,
  bg,
  anchorXPx,
  bubbleHeightPx,
}: {
  direction: BubbleTailShape;
  pixelSize: number;
  fg: string;
  bg: string;
  anchorXPx: number;
  bubbleHeightPx: number;
}) {
  const px = pixelSize;
  const slope =
    direction === "slanted-left" ? -1 : direction === "slanted-right" ? 1 : 0;

  const dots =
    slope === 0
      ? DOT_TAIL_DOTS.map((d) => ({ size: d.size, dx: 0, dy: d.dy }))
      : DOT_TAIL_DOTS_CURVED.map((d) => ({
          size: d.size,
          dx: d.dx * slope,
          dy: d.dy,
        }));

  return (
    <>
      {dots.map((dot, i) => {
        const { fill, outline } = hollowCirclePixels(dot.size);
        const renderedSize = Math.max(1, Math.floor((dot.size - 1) / 2) * 2 + 1);
        const w = renderedSize * px;
        const h = renderedSize * px;
        const centerXPx = anchorXPx + dot.dx * px;
        const leftPx = centerXPx - Math.floor(renderedSize / 2) * px;
        const topPx = bubbleHeightPx + dot.dy * px;
        return (
          <svg
            key={i}
            width={w}
            height={h}
            viewBox={`0 0 ${w} ${h}`}
            shapeRendering="crispEdges"
            style={{
              position: "absolute",
              left: leftPx,
              top: topPx,
              pointerEvents: "none",
              display: "block",
              overflow: "visible",
            }}
          >
            {fill.map(([x, y], j) => (
              <rect
                key={`f-${j}`}
                x={x * px}
                y={y * px}
                width={px}
                height={px}
                fill={bg}
              />
            ))}
            {outline.map(([x, y], j) => (
              <rect
                key={`o-${j}`}
                x={x * px}
                y={y * px}
                width={px}
                height={px}
                fill={fg}
              />
            ))}
          </svg>
        );
      })}
    </>
  );
}

// ---------------------------------------------------------------------------
// Rounded-corner word bubble
// ---------------------------------------------------------------------------

function roundRectGeometry(
  totalW: number,
  totalH: number,
  cornerR: number,
): {
  fillSpans: Array<{ y: number; xMin: number; xMax: number }>;
  outlinePoints: Array<[number, number]>;
} {
  const r = Math.max(
    0,
    Math.min(cornerR, Math.floor(Math.min(totalW, totalH) / 2)),
  );
  const spanByLocalY = new Map<number, { xMin: number; xMax: number }>();
  if (r > 0) {
    for (const s of ellipseSpans(r, r)) {
      spanByLocalY.set(s.y, { xMin: s.xMin, xMax: s.xMax });
    }
  }

  const rowExtent = (
    y: number,
  ): { xMin: number; xMax: number } | null => {
    if (y < 0 || y >= totalH) return null;
    if (r === 0) return { xMin: 0, xMax: totalW - 1 };
    if (y < r) {
      const s = spanByLocalY.get(y - r);
      if (s) return { xMin: r + s.xMin, xMax: totalW - 1 - r + s.xMax };
    } else if (y >= totalH - r) {
      const s = spanByLocalY.get(y - (totalH - 1 - r));
      if (s) return { xMin: r + s.xMin, xMax: totalW - 1 - r + s.xMax };
    }
    return { xMin: 0, xMax: totalW - 1 };
  };

  const inFill = (x: number, y: number) => {
    const e = rowExtent(y);
    if (!e) return false;
    return x >= e.xMin && x <= e.xMax;
  };

  const fillSpans: Array<{ y: number; xMin: number; xMax: number }> = [];
  const outlinePoints: Array<[number, number]> = [];
  for (let y = 0; y < totalH; y++) {
    const e = rowExtent(y);
    if (!e) continue;
    fillSpans.push({ y, xMin: e.xMin, xMax: e.xMax });
    for (let x = e.xMin; x <= e.xMax; x++) {
      if (
        !inFill(x - 1, y) ||
        !inFill(x + 1, y) ||
        !inFill(x, y - 1) ||
        !inFill(x, y + 1)
      ) {
        outlinePoints.push([x, y]);
      }
    }
  }
  return { fillSpans, outlinePoints };
}

export type PixelRoundedBubbleProps = BubbleCommonProps &
  SpeechBubbleTailProps & {
    variant: BubbleRoundedVariant;
    cornerRadius: number;
  };

export function PixelRoundedBubble({
  text,
  variant,
  tailShape,
  tailXPercent,
  pixelSize,
  fontScale,
  paddingX,
  paddingY,
  lineHeight,
  sideTrim,
  widthPx,
  heightPx,
  wrap,
  textAlignH,
  textAlignV,
  textOffsetX,
  textOffsetY,
  textColor,
  bgColor,
  cornerRadius,
}: PixelRoundedBubbleProps) {
  const px = pixelSize;
  const fg = textColor;
  const bg = bgColor;

  const innerRef = useRef<HTMLDivElement>(null);
  const [innerSize, setInnerSize] = useState<{ w: number; h: number } | null>(
    null,
  );

  useLayoutEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    const compute = () => {
      // offsetWidth/offsetHeight, NOT getBoundingClientRect: the rect is
      // post-transform, and scenes render inside a responsive
      // `transform: scale(...)` wrapper — on a scaled-down phone viewport
      // the rect under-measures the text and the bubble body is drawn too
      // small for its words. offset* return untransformed layout pixels.
      setInnerSize({ w: el.offsetWidth, h: el.offsetHeight });
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [text, fontScale, paddingX, paddingY, lineHeight, sideTrim, widthPx, heightPx, px, wrap]);

  const innerWUnits = innerSize ? Math.max(2, Math.ceil(innerSize.w / px)) : 2;
  const innerHUnits = innerSize ? Math.max(2, Math.ceil(innerSize.h / px)) : 2;
  const totalW = innerWUnits + 2;
  const totalH = innerHUnits + 2;
  const r = Math.max(
    0,
    Math.min(cornerRadius, Math.floor(Math.min(totalW, totalH) / 2)),
  );
  const geom = roundRectGeometry(totalW, totalH, r);
  const shapePxW = totalW * px;
  const shapePxH = totalH * px;
  // Hidden until the body has a real measurement (see below).
  const measured = innerSize !== null;

  const [tailLeftPx, setTailLeftPx] = useState<number | null>(null);
  useLayoutEffect(() => {
    if (!innerSize) return;
    const tailW = tailWidthUnits(tailShape) * px;
    const cornerPx = r * px;
    const safeStart = cornerPx;
    const safeEnd = shapePxW - cornerPx;
    const range = Math.max(0, safeEnd - safeStart - tailW);
    const raw = (range * tailXPercent) / 100;
    const snapped = Math.round(raw / px) * px;
    setTailLeftPx(safeStart + Math.max(0, Math.min(range, snapped)));
  }, [tailXPercent, tailShape, px, shapePxW, r, innerSize]);

  const showShadow = variant === "drop-shadow";

  return (
    <div
      style={{
        position: "relative",
        display: "inline-block",
        width: shapePxW,
        height: shapePxH,
        overflow: "visible",
        // Never paint an unmeasured body — the pre-measurement fallback is
        // a 2-unit stub, and flashing that reads as a glitch.
        visibility: measured ? "visible" : "hidden",
      }}
    >
      {showShadow && (
        <svg
          width={shapePxW}
          height={shapePxH}
          viewBox={`0 0 ${shapePxW} ${shapePxH}`}
          shapeRendering="crispEdges"
          style={{
            position: "absolute",
            inset: 0,
            transform: `translate(${px}px, ${px}px)`,
            pointerEvents: "none",
            zIndex: 0,
          }}
        >
          {geom.fillSpans.map(({ y, xMin, xMax }) => (
            <rect
              key={`sh-${y}-${xMin}`}
              x={xMin * px}
              y={y * px}
              width={(xMax - xMin + 1) * px}
              height={px}
              fill={fg}
            />
          ))}
        </svg>
      )}
      <svg
        width={shapePxW}
        height={shapePxH}
        viewBox={`0 0 ${shapePxW} ${shapePxH}`}
        shapeRendering="crispEdges"
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          zIndex: 1,
        }}
      >
        {geom.fillSpans.map(({ y, xMin, xMax }) => (
          <rect
            key={`f-${y}-${xMin}`}
            x={xMin * px}
            y={y * px}
            width={(xMax - xMin + 1) * px}
            height={px}
            fill={bg}
          />
        ))}
        {geom.outlinePoints.map(([x, y], i) => (
          <rect
            key={`o-${i}`}
            x={x * px}
            y={y * px}
            width={px}
            height={px}
            fill={fg}
          />
        ))}
      </svg>
      <div
        ref={innerRef}
        className={pixelFont.className}
        style={{
          position: "absolute",
          left: px,
          top: px,
          color: fg,
          padding: `${px * paddingY}px ${px * paddingX}px`,
          fontSize: 8 * fontScale,
          lineHeight,
          letterSpacing: 0,
          wordSpacing: WORD_SPACING,
          whiteSpace: wrap ? "pre-wrap" : "nowrap",
          wordBreak: wrap ? "break-word" : "normal",
          display: "flex",
          flexDirection: "column",
          alignItems: ALIGN_H_TO_FLEX[textAlignH],
          // alignItems places the text BLOCK; textAlign lays the lines out
          // inside it. Only multi-line text (wrapped, or with an authored
          // newline) can tell the difference — a single line is exactly as
          // wide as its block, so this is a no-op for the common case.
          textAlign: textAlignH,
          justifyContent: ALIGN_V_TO_FLEX[textAlignV],
          boxSizing: "border-box",
          // `max-content` when auto-sizing is LOAD-BEARING. This element is
          // absolutely positioned inside the very box its own measurement
          // sizes, so a shrink-to-fit width is capped by that box: on first
          // mount the parent is the 2-unit stub, the text wraps hard against
          // it, measures narrow, the parent grows a little, and it re-wraps —
          // converging over many frames as the words visibly unpack. Sizing
          // to the widest line instead ignores the parent and lands the right
          // measurement on the first pass. Lines still break exactly where
          // the author put a newline (see the authoring doc's rule about
          // breaking any line over ~10 characters).
          width:
            widthPx !== null ? Math.max(0, widthPx - 2 * px) : "max-content",
          height:
            heightPx !== null ? Math.max(0, heightPx - 2 * px) : undefined,
          overflow: "visible",
          WebkitFontSmoothing: "none",
          MozOsxFontSmoothing: "grayscale",
          zIndex: 2,
        }}
      >
        <span
          style={{
            display: "inline-block",
            marginLeft: -sideTrim * px,
            marginRight: -sideTrim * px,
            transform: `translate(${textOffsetX * px}px, ${textOffsetY * px}px)`,
          }}
        >
          {kernedText(text)}
        </span>
      </div>
      {tailLeftPx !== null && tailShape !== "none" && (
        <PixelTail
          shape={tailShape}
          pixelSize={px}
          fg={fg}
          bg={bg}
          showShadow={showShadow}
          leftPx={tailLeftPx}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Exclamation bubbles (Batman-66 "WHAM!" style)
// ---------------------------------------------------------------------------

function rasterizePolygon(
  verts: ReadonlyArray<readonly [number, number]>,
  totalW: number,
  totalH: number,
): {
  fillSpans: Array<{ y: number; xMin: number; xMax: number }>;
  outlinePoints: Array<[number, number]>;
} {
  const pointInside = (qx: number, qy: number): boolean => {
    let inside = false;
    for (let i = 0, j = verts.length - 1; i < verts.length; j = i++) {
      const [xi, yi] = verts[i];
      const [xj, yj] = verts[j];
      const crosses =
        yi > qy !== yj > qy &&
        qx < ((xj - xi) * (qy - yi)) / (yj - yi) + xi;
      if (crosses) inside = !inside;
    }
    return inside;
  };

  const fill = new Uint8Array(totalW * totalH);
  const idx = (x: number, y: number) => y * totalW + x;
  for (let y = 0; y < totalH; y++) {
    for (let x = 0; x < totalW; x++) {
      if (pointInside(x + 0.5, y + 0.5)) fill[idx(x, y)] = 1;
    }
  }
  const inFill = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < totalW && y < totalH && fill[idx(x, y)] === 1;

  const fillSpans: Array<{ y: number; xMin: number; xMax: number }> = [];
  const outlinePoints: Array<[number, number]> = [];
  for (let y = 0; y < totalH; y++) {
    let spanStart = -1;
    for (let x = 0; x <= totalW; x++) {
      const inside = x < totalW && fill[idx(x, y)] === 1;
      if (inside) {
        if (spanStart < 0) spanStart = x;
        if (
          !inFill(x - 1, y) ||
          !inFill(x + 1, y) ||
          !inFill(x, y - 1) ||
          !inFill(x, y + 1)
        ) {
          outlinePoints.push([x, y]);
        }
      } else if (spanStart >= 0) {
        fillSpans.push({ y, xMin: spanStart, xMax: x - 1 });
        spanStart = -1;
      }
    }
  }
  return { fillSpans, outlinePoints };
}

type ExclamationGeometry = {
  widthUnits: number;
  heightUnits: number;
  innerOffsetX: number;
  innerOffsetY: number;
  vertices: Array<[number, number]>;
};

function starVertices(
  n: number,
  outerRx: number,
  outerRy: number,
  innerRx: number,
  innerRy: number,
  startAngle = -Math.PI / 2,
): Array<[number, number]> {
  const verts: Array<[number, number]> = [];
  for (let i = 0; i < 2 * n; i++) {
    const a = startAngle + (i * Math.PI) / n;
    const rx = i % 2 === 0 ? outerRx : innerRx;
    const ry = i % 2 === 0 ? outerRy : innerRy;
    verts.push([rx * Math.cos(a), ry * Math.sin(a)]);
  }
  return verts;
}

function exclamationGeometry(
  shape: BubbleExclamationShape,
  innerWUnits: number,
  innerHUnits: number,
): ExclamationGeometry {
  const w = Math.max(4, innerWUnits);
  const h = Math.max(2, innerHUnits);

  const denom = Math.SQRT2;

  let verts: Array<[number, number]> = [];

  if (shape === "star-8") {
    const n = 8;
    const cosN = Math.cos(Math.PI / n);
    const innerRx = Math.ceil(w / (denom * cosN)) + 2;
    const innerRy = Math.ceil(h / (denom * cosN)) + 2;
    const outerRx = Math.round(innerRx * 1.5);
    const outerRy = Math.round(innerRy * 1.5);
    verts = starVertices(n, outerRx, outerRy, innerRx, innerRy);
  } else {
    const n = 5;
    const cosN = Math.cos(Math.PI / n);
    const innerRx = Math.ceil(w / (denom * cosN)) + 2;
    const innerRy = Math.ceil(h / (denom * cosN)) + 2;
    const outerRx = Math.round(innerRx * 2.1);
    const outerRy = Math.round(innerRy * 2.1);
    verts = starVertices(n, outerRx, outerRy, innerRx, innerRy);
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of verts) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  const pad = 1;
  const totalW = Math.ceil(maxX - minX) + 1 + 2 * pad;
  const totalH = Math.ceil(maxY - minY) + 1 + 2 * pad;
  const cx = -minX + pad;
  const cy = -minY + pad;
  const shifted = verts.map(
    ([x, y]) => [x + cx, y + cy] as [number, number],
  );

  const bboxCx = totalW / 2;
  const bboxCy = totalH / 2;

  return {
    widthUnits: totalW,
    heightUnits: totalH,
    innerOffsetX: Math.round(bboxCx - w / 2),
    innerOffsetY: Math.round(bboxCy - h / 2),
    vertices: shifted,
  };
}

export type PixelExclamationBubbleProps = Omit<
  BubbleCommonProps,
  never
> & { shape: BubbleExclamationShape };

const EXCLAIM_ALIGN_SLACK = 3;

export function PixelExclamationBubble({
  text,
  shape,
  pixelSize,
  fontScale,
  paddingX,
  paddingY,
  lineHeight,
  sideTrim,
  widthPx,
  heightPx,
  wrap,
  textAlignH,
  textAlignV,
  textOffsetX,
  textOffsetY,
  textColor,
  bgColor,
}: PixelExclamationBubbleProps) {
  const px = pixelSize;
  const fill = bgColor;
  const outline = textColor;

  const measureRef = useRef<HTMLSpanElement>(null);
  const [textSize, setTextSize] = useState<{ w: number; h: number } | null>(
    null,
  );

  useLayoutEffect(() => {
    const el = measureRef.current;
    if (!el) return;
    const compute = () => {
      // offset* not getBoundingClientRect — see the note on the rounded
      // bubble's measurement: rects are post-transform and under-measure
      // inside the responsive scene scale.
      setTextSize({ w: el.offsetWidth, h: el.offsetHeight });
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [text, fontScale, sideTrim, px, lineHeight, wrap]);

  const textWUnits = textSize ? Math.ceil(textSize.w / px) : 4;
  const textHUnits = textSize ? Math.ceil(textSize.h / px) : 2;

  const autoInnerW = textWUnits + 2 * paddingX + 2 * EXCLAIM_ALIGN_SLACK;
  const autoInnerH = textHUnits + 2 * paddingY + 2 * EXCLAIM_ALIGN_SLACK;
  const innerWUnits =
    widthPx !== null ? Math.max(2, Math.floor(widthPx / px)) : autoInnerW;
  const innerHUnits =
    heightPx !== null ? Math.max(2, Math.floor(heightPx / px)) : autoInnerH;

  const geom = exclamationGeometry(shape, innerWUnits, innerHUnits);
  const { fillSpans, outlinePoints } = rasterizePolygon(
    geom.vertices,
    geom.widthUnits,
    geom.heightUnits,
  );

  const shapePxW = geom.widthUnits * px;
  const shapePxH = geom.heightUnits * px;
  // Hidden until the body has a real measurement (see below).
  const measured = textSize !== null;

  return (
    <div
      style={{
        position: "relative",
        width: shapePxW,
        height: shapePxH,
        overflow: "visible",
        // Never paint an unmeasured body — the pre-measurement fallback is
        // a 2-unit stub, and flashing that reads as a glitch.
        visibility: measured ? "visible" : "hidden",
      }}
    >
      <svg
        width={shapePxW}
        height={shapePxH}
        viewBox={`0 0 ${shapePxW} ${shapePxH}`}
        shapeRendering="crispEdges"
        style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
      >
        {fillSpans.map(({ y, xMin, xMax }) => (
          <rect
            key={`f-${y}-${xMin}`}
            x={xMin * px}
            y={y * px}
            width={(xMax - xMin + 1) * px}
            height={px}
            fill={fill}
          />
        ))}
        {outlinePoints.map(([x, y], i) => (
          <rect
            key={`o-${i}`}
            x={x * px}
            y={y * px}
            width={px}
            height={px}
            fill={outline}
          />
        ))}
      </svg>

      <span
        ref={measureRef}
        aria-hidden
        className={pixelFont.className}
        style={{
          position: "absolute",
          left: -9999,
          top: -9999,
          visibility: "hidden",
          whiteSpace: "nowrap",
          fontSize: 8 * fontScale,
          lineHeight,
          letterSpacing: 0,
          wordSpacing: WORD_SPACING,
          marginLeft: -sideTrim * px,
          marginRight: -sideTrim * px,
          pointerEvents: "none",
        }}
      >
        {kernedText(text)}
      </span>

      <div
        className={pixelFont.className}
        style={{
          position: "absolute",
          left: geom.innerOffsetX * px,
          top: geom.innerOffsetY * px,
          width: innerWUnits * px,
          height: innerHUnits * px,
          color: textColor,
          padding: `${px * paddingY}px ${px * paddingX}px`,
          fontSize: 8 * fontScale,
          lineHeight,
          letterSpacing: 0,
          wordSpacing: WORD_SPACING,
          whiteSpace: wrap ? "pre-wrap" : "nowrap",
          wordBreak: wrap ? "break-word" : "normal",
          display: "flex",
          flexDirection: "column",
          alignItems: ALIGN_H_TO_FLEX[textAlignH],
          // alignItems places the text BLOCK; textAlign lays the lines out
          // inside it. Only multi-line text (wrapped, or with an authored
          // newline) can tell the difference — a single line is exactly as
          // wide as its block, so this is a no-op for the common case.
          textAlign: textAlignH,
          justifyContent: ALIGN_V_TO_FLEX[textAlignV],
          boxSizing: "border-box",
          overflow: "visible",
          WebkitFontSmoothing: "none",
          MozOsxFontSmoothing: "grayscale",
        }}
      >
        <span
          style={{
            display: "inline-block",
            marginLeft: -sideTrim * px,
            marginRight: -sideTrim * px,
            transform: `translate(${textOffsetX * px}px, ${textOffsetY * px}px)`,
          }}
        >
          {kernedText(text)}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Style-driven dispatcher — the entry point the scene runtime uses.
// ---------------------------------------------------------------------------

// Default style for each kind — used by editor + as fallback when a partial
// style omits common fields. Centralised so the harness and the scene agree
// on what "RENT'S DUE! in a classic rounded bubble at pixelSize 3" means.
export const DEFAULT_BUBBLE_COMMON: BubbleCommonProps = {
  text: "",
  pixelSize: 3,
  fontScale: 3,
  paddingX: 4,
  paddingY: 3,
  lineHeight: 1,
  sideTrim: 0,
  widthPx: null,
  heightPx: null,
  wrap: false,
  textAlignH: "left",
  textAlignV: "top",
  textOffsetX: 0,
  textOffsetY: 0,
  textColor: "#000000",
  bgColor: "#ffffff",
};

// ---------------------------------------------------------------------------
// Pick-key helpers (shared between Comms harness export + Scene editor)
// ---------------------------------------------------------------------------
//
// `BubblePickKey` is a flat string that identifies one concrete variant
// across the (kind, variant/shape) matrix. Useful when a single <select>
// or radio control needs to drive the union — both the Comms harness's
// card picker and the Scene editor's per-bubble kind selector reach for
// this rather than tracking two coupled fields.

export type BubblePickKey =
  | "rounded-classic"
  | "rounded-drop-shadow"
  | "thought-ellipse"
  | "thought-cloud"
  | "exclaim-star-8"
  | "exclaim-spiky-5";

export const DEFAULT_BUBBLE_PICK: BubblePickKey = "rounded-classic";

export function isBubblePickKey(v: unknown): v is BubblePickKey {
  return (
    v === "rounded-classic" ||
    v === "rounded-drop-shadow" ||
    v === "thought-ellipse" ||
    v === "thought-cloud" ||
    v === "exclaim-star-8" ||
    v === "exclaim-spiky-5"
  );
}

export function pickKeyOfStyle(s: SceneBubbleStyle): BubblePickKey {
  if (s.kind === "rounded") {
    return s.variant === "classic" ? "rounded-classic" : "rounded-drop-shadow";
  }
  if (s.kind === "thought") {
    return s.shape === "ellipse" ? "thought-ellipse" : "thought-cloud";
  }
  return s.shape === "star-8" ? "exclaim-star-8" : "exclaim-spiky-5";
}

// Switch a style to a new pick key while preserving every common field +
// (where the target kind still has them) tail + corner radius. Used when
// the Scene editor's kind selector flips a bubble between variants — the
// author's existing pixelSize, font, padding, colour choices all carry
// across, only the kind-discriminator + (drop or recreate) the variant/
// shape fields change.
export function styleForPickKey(
  key: BubblePickKey,
  prev: SceneBubbleStyle,
): SceneBubbleStyle {
  const common = {
    pixelSize: prev.pixelSize,
    fontScale: prev.fontScale,
    paddingX: prev.paddingX,
    paddingY: prev.paddingY,
    lineHeight: prev.lineHeight,
    sideTrim: prev.sideTrim,
    widthPx: prev.widthPx,
    heightPx: prev.heightPx,
    wrap: prev.wrap,
    textAlignH: prev.textAlignH,
    textAlignV: prev.textAlignV,
    textOffsetX: prev.textOffsetX,
    textOffsetY: prev.textOffsetY,
    textColor: prev.textColor,
    bgColor: prev.bgColor,
  };
  const prevTailShape =
    prev.kind === "exclaim" ? ("wide" as const) : prev.tailShape;
  const prevTailX = prev.kind === "exclaim" ? 50 : prev.tailXPercent;
  const prevCornerRadius = prev.kind === "rounded" ? prev.cornerRadius : 3;

  switch (key) {
    case "rounded-classic":
      return {
        kind: "rounded",
        variant: "classic",
        cornerRadius: prevCornerRadius,
        tailShape: prevTailShape,
        tailXPercent: prevTailX,
        ...common,
      };
    case "rounded-drop-shadow":
      return {
        kind: "rounded",
        variant: "drop-shadow",
        cornerRadius: prevCornerRadius,
        tailShape: prevTailShape,
        tailXPercent: prevTailX,
        ...common,
      };
    case "thought-ellipse":
      return {
        kind: "thought",
        shape: "ellipse",
        tailShape: prevTailShape,
        tailXPercent: prevTailX,
        ...common,
      };
    case "thought-cloud":
      return {
        kind: "thought",
        shape: "cloud",
        tailShape: prevTailShape,
        tailXPercent: prevTailX,
        ...common,
      };
    case "exclaim-star-8":
      return { kind: "exclaim", shape: "star-8", ...common };
    case "exclaim-spiky-5":
      return { kind: "exclaim", shape: "spiky-5", ...common };
  }
}

// Fresh default style for a new bubble. Same defaults the Comms harness
// initialises with on first load, packaged so the Scene editor's `addBubble`
// call can spawn a sensible starting style without duplicating defaults.
export const DEFAULT_BUBBLE_STYLE: SceneBubbleStyle = {
  kind: "rounded",
  variant: "classic",
  cornerRadius: 3,
  tailShape: "wide",
  tailXPercent: 50,
  pixelSize: 3,
  fontScale: 3,
  paddingX: 4,
  paddingY: 3,
  lineHeight: 1,
  sideTrim: 0,
  widthPx: null,
  heightPx: null,
  wrap: false,
  textAlignH: "left",
  textAlignV: "top",
  textOffsetX: 0,
  textOffsetY: 0,
  textColor: "#000000",
  bgColor: "#ffffff",
};

export const BUBBLE_PICK_LABELS: Record<BubblePickKey, string> = {
  "rounded-classic": "Rounded · classic",
  "rounded-drop-shadow": "Rounded · drop-shadow",
  "thought-ellipse": "Thought · ellipse",
  "thought-cloud": "Thought · cloud",
  "exclaim-star-8": "Exclaim · 8-pt star",
  "exclaim-spiky-5": "Exclaim · spiky-5",
};

export function BubbleByStyle({
  text,
  style,
}: {
  text: string;
  style: SceneBubbleStyle;
}) {
  if (style.kind === "rounded") {
    return (
      <PixelRoundedBubble
        text={text}
        variant={style.variant}
        cornerRadius={style.cornerRadius}
        tailShape={style.tailShape}
        tailXPercent={style.tailXPercent}
        pixelSize={style.pixelSize}
        fontScale={style.fontScale}
        paddingX={style.paddingX}
        paddingY={style.paddingY}
        lineHeight={style.lineHeight}
        sideTrim={style.sideTrim}
        widthPx={style.widthPx}
        heightPx={style.heightPx}
        wrap={style.wrap}
        textAlignH={style.textAlignH}
        textAlignV={style.textAlignV}
        textOffsetX={style.textOffsetX}
        textOffsetY={style.textOffsetY}
        textColor={style.textColor}
        bgColor={style.bgColor}
      />
    );
  }
  if (style.kind === "thought") {
    return (
      <PixelThoughtBubble
        text={text}
        shape={style.shape}
        tailShape={style.tailShape}
        tailXPercent={style.tailXPercent}
        pixelSize={style.pixelSize}
        fontScale={style.fontScale}
        paddingX={style.paddingX}
        paddingY={style.paddingY}
        lineHeight={style.lineHeight}
        sideTrim={style.sideTrim}
        widthPx={style.widthPx}
        heightPx={style.heightPx}
        wrap={style.wrap}
        textAlignH={style.textAlignH}
        textAlignV={style.textAlignV}
        textOffsetX={style.textOffsetX}
        textOffsetY={style.textOffsetY}
        textColor={style.textColor}
        bgColor={style.bgColor}
      />
    );
  }
  // exclaim
  return (
    <PixelExclamationBubble
      text={text}
      shape={style.shape}
      pixelSize={style.pixelSize}
      fontScale={style.fontScale}
      paddingX={style.paddingX}
      paddingY={style.paddingY}
      lineHeight={style.lineHeight}
      sideTrim={style.sideTrim}
      widthPx={style.widthPx}
      heightPx={style.heightPx}
      wrap={style.wrap}
      textAlignH={style.textAlignH}
      textAlignV={style.textAlignV}
      textOffsetX={style.textOffsetX}
      textOffsetY={style.textOffsetY}
      textColor={style.textColor}
      bgColor={style.bgColor}
    />
  );
}
