// Runtime comic burst: the exclaim lab's procedural geometry + per-layer
// CSS choreography, stripped of editor chrome and sized for in-game spawns.
// Regular moments get the starburst; big moments get the kaboom fireball.
// The lettering rides the same arced textPath in Badaboom.

import { useMemo } from "react";
import type { CSSProperties } from "react";
import {
  ANIM_CSS,
  buildBurst,
  buildKaboom,
  PALETTES,
  type ExclaimPalette,
} from "../../../screens/admin-exclaim/ComicExclaimLab";

const VIEW_W = 900;
const VIEW_H = 640;
const CX = VIEW_W / 2;
const CY = VIEW_H / 2 - 20;

let injected = false;
function ensureAnimCss(): void {
  if (injected) return;
  injected = true;
  const style = document.createElement("style");
  style.dataset.exclaimAnim = "1";
  style.textContent = ANIM_CSS;
  document.head.appendChild(style);
}

function paletteByName(name?: string): ExclaimPalette {
  const found = name ? PALETTES.find((p) => p.name === name) : undefined;
  return found ?? PALETTES[0];
}

export function ComicExclaimBurst({
  text,
  big,
  seed,
  paletteName,
  anim = "pop",
}: {
  text: string;
  big: boolean;
  seed: number;
  paletteName?: string;
  anim?: string;
}) {
  ensureAnimCss();
  const palette = paletteByName(paletteName);
  const uid = useMemo(() => `x${Math.floor(seed * 1e6) % 999983}`, [seed]);

  const geom = useMemo(
    () => (big ? null : buildBurst(seed, 12 + Math.floor((seed * 97) % 6))),
    [seed, big],
  );
  const kaboom = useMemo(
    () => (big ? buildKaboom(seed, 7) : null),
    [seed, big],
  );

  // arc for the lettering: gentle downward bow
  const bow = big ? 70 : 44;
  const arcPath = `M ${CX - 280} ${CY + 30} Q ${CX} ${CY + 30 - bow} ${CX + 280} ${CY + 30}`;
  const fontSize = Math.min(150, (big ? 1500 : 1150) / Math.max(4, text.length));

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      style={{ width: "100%", height: "100%", overflow: "visible", display: "block" }}
    >
      <defs>
        <radialGradient id={`${uid}-front`} cx="50%" cy="46%" r="62%">
          <stop offset="0%" stopColor={palette.frontInner} />
          <stop offset="55%" stopColor={palette.frontMid} />
          <stop offset="100%" stopColor={palette.frontOuter} />
        </radialGradient>
        <linearGradient id={`${uid}-text`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={palette.textTop} />
          <stop offset="100%" stopColor={palette.textBottom} />
        </linearGradient>
        <path id={`${uid}-arc`} d={arcPath} />
      </defs>
      <g transform={`translate(0 0)`}>
        <g className={`cxa-root cxa-in-${anim}`}>
          <g className="cxa-all">
            {geom && (
              <>
                <g className="cxa-back">
                  <path d={geom.backPath} fill={palette.backFill} stroke={palette.outline} strokeWidth={7} strokeLinejoin="miter" />
                </g>
                <g className="cxa-front">
                  <path d={geom.frontPath} fill={`url(#${uid}-front)`} stroke={palette.outline} strokeWidth={5} strokeLinejoin="miter" />
                </g>
                {geom.streaks.map((s, i) => (
                  <path
                    key={i}
                    className="cxa-streak"
                    d={s.d}
                    fill={palette.streak}
                    style={{ "--bx": `${s.bx.toFixed(0)}px`, "--by": `${s.by.toFixed(0)}px`, "--i": i } as CSSProperties}
                  />
                ))}
                {geom.speckCircles.map((c, i) => (
                  <circle
                    key={i}
                    className="cxa-speck"
                    cx={c.x}
                    cy={c.y}
                    r={c.r}
                    fill={palette.speck}
                    style={{ "--bx": `${(c.x - CX).toFixed(0)}px`, "--by": `${(c.y - CY).toFixed(0)}px`, "--i": i } as CSSProperties}
                  />
                ))}
                {geom.speckDashes.map((s, i) => (
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
                    style={{ "--bx": `${(s.x1 - CX).toFixed(0)}px`, "--by": `${(s.y1 - CY).toFixed(0)}px`, "--i": geom.speckCircles.length + i } as CSSProperties}
                  />
                ))}
              </>
            )}
            {kaboom && (
              <>
                <g className="cxa-back">
                  {kaboom.rays.map((d, i) => (
                    <path key={i} d={d} fill={palette.frontMid} opacity={0.55} />
                  ))}
                  <path d={kaboom.underPath} fill={palette.backFill} stroke={palette.streak} strokeWidth={7} strokeLinejoin="round" />
                </g>
                <g className="cxa-front">
                  <path d={kaboom.cloudPath} fill={`url(#${uid}-front)`} stroke={palette.streak} strokeWidth={6} strokeLinejoin="round" />
                </g>
                {kaboom.puffs.map((p, i) => (
                  <circle
                    key={i}
                    className="cxa-streak"
                    cx={p.x}
                    cy={p.y}
                    r={p.r}
                    fill={`url(#${uid}-front)`}
                    stroke={palette.streak}
                    strokeWidth={5}
                    style={{ "--bx": `${p.bx.toFixed(0)}px`, "--by": `${p.by.toFixed(0)}px`, "--i": i } as CSSProperties}
                  />
                ))}
              </>
            )}
            <g className="cxa-word">
              <text
                fontFamily="Badaboom, 'Arial Black', sans-serif"
                fontSize={fontSize}
                letterSpacing={2}
                stroke={palette.outline}
                strokeWidth={10}
                fill={palette.outline}
                transform="translate(4 8)"
              >
                <textPath href={`#${uid}-arc`} startOffset="50%" textAnchor="middle">
                  {text}
                </textPath>
              </text>
              <text
                fontFamily="Badaboom, 'Arial Black', sans-serif"
                fontSize={fontSize}
                letterSpacing={2}
                fill={`url(#${uid}-text)`}
                stroke={palette.outline}
                strokeWidth={4}
                style={{ paintOrder: "stroke" }}
              >
                <textPath href={`#${uid}-arc`} startOffset="50%" textAnchor="middle">
                  {text}
                </textPath>
              </text>
            </g>
          </g>
        </g>
      </g>
    </svg>
  );
}
