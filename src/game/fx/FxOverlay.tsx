// FX overlay: comic bursts (full exclaim SVG runtime) + speech balloons +
// screen flashes above the playfield. Bursts are React-rendered (rare
// events); balloons/flashes are imperative DOM (cheap, self-removing).

import {
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { FIELD_H, FIELD_W } from "../sim/constants";
import type { FxEvent, Sim } from "../sim/types";
import { pickBark } from "../dialog/barks";
import { ComicExclaimBurst } from "./exclaim/ComicExclaimBurst";
import { loadSettings } from "../core/save";

export type FxOverlayHandle = {
  handleFx: (events: FxEvent[], sim: Sim) => void;
};

type LiveBurst = {
  id: number;
  text: string;
  x: number;
  y: number;
  big: boolean;
  palette?: string;
  seed: number;
};

let fxId = 1;

export const FxOverlay = forwardRef<FxOverlayHandle>(function FxOverlay(_, ref) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [bursts, setBursts] = useState<LiveBurst[]>([]);

  useImperativeHandle(ref, () => ({
    handleFx(events: FxEvent[], sim: Sim) {
      const root = rootRef.current;
      if (!root) return;
      for (const e of events) {
        if (e.t === "burst") {
          const burst: LiveBurst = {
            id: fxId++,
            text: e.text,
            x: e.x,
            y: e.y,
            big: !!e.big,
            palette: e.palette,
            seed: (fxId * 2654435761) % 100000,
          };
          setBursts((bs) => [...bs.slice(-2), burst]); // cap at 3 concurrent
          const ttl = e.big ? 1500 : 1000;
          setTimeout(
            () => setBursts((bs) => bs.filter((b) => b.id !== burst.id)),
            ttl,
          );
        } else if (e.t === "balloon") {
          const p = sim.players.find((q) => q.index === e.player);
          if (p && p.alive) {
            const line = pickBark(p.castId, e.trigger);
            if (line) spawnBalloon(root, line, p.x, p.y - 52, e.player);
          }
        } else if (e.t === "flash") {
          if (!loadSettings().reducedFlash) spawnFlash(root, e.color);
        }
      }
    },
  }));

  return (
    <div ref={rootRef} className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
      {bursts.map((b) => {
        const w = b.big ? 34 : 22; // % of playfield width
        return (
          <div
            key={b.id}
            style={{
              position: "absolute",
              left: `${(Math.max(90, Math.min(FIELD_W - 90, b.x)) / FIELD_W) * 100}%`,
              top: `${(Math.max(70, Math.min(FIELD_H - 60, b.y)) / FIELD_H) * 100}%`,
              width: `${w}%`,
              aspectRatio: "900/640",
              transform: "translate(-50%, -50%)",
              zIndex: 5,
            }}
          >
            <ComicExclaimBurst
              text={b.text}
              big={b.big}
              seed={b.seed}
              paletteName={b.palette}
              anim={b.big ? "slam" : "pop"}
            />
          </div>
        );
      })}
    </div>
  );
});

function pct(x: number, y: number): { left: string; top: string } {
  return {
    left: `${(x / FIELD_W) * 100}%`,
    top: `${(y / FIELD_H) * 100}%`,
  };
}

function spawnBalloon(
  root: HTMLElement,
  text: string,
  x: number,
  y: number,
  player: number,
): void {
  const existing = root.querySelector(`[data-balloon="${player}"]`);
  if (existing) existing.remove();
  const el = document.createElement("div");
  el.dataset.balloon = String(player);
  const pos = pct(Math.max(90, Math.min(FIELD_W - 90, x)), Math.max(50, y));
  el.style.cssText = `position:absolute;left:${pos.left};top:${pos.top};transform:translate(-50%,-100%);
    font-family:'Press Start 2P',monospace;font-size:8px;line-height:1.5;color:#1d1409;
    background:#fdf8ea;border:2px solid #1d1409;border-radius:9px;padding:5px 8px;max-width:180px;
    text-align:center;animation:balloonIn 0.22s ease-out both;z-index:6;`;
  const tail = document.createElement("div");
  tail.style.cssText = `position:absolute;left:50%;bottom:-7px;transform:translateX(-50%);
    width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;
    border-top:7px solid #1d1409;`;
  const tailFill = document.createElement("div");
  tailFill.style.cssText = `position:absolute;left:50%;bottom:-4px;transform:translateX(-50%);
    width:0;height:0;border-left:4px solid transparent;border-right:4px solid transparent;
    border-top:5px solid #fdf8ea;`;
  el.textContent = text;
  el.appendChild(tail);
  el.appendChild(tailFill);
  root.appendChild(el);
  ensureKeyframes(root);
  setTimeout(() => el.remove(), 1900);
}

function spawnFlash(root: HTMLElement, color: number): void {
  const el = document.createElement("div");
  el.style.cssText = `position:absolute;inset:0;background:#${color.toString(16).padStart(6, "0")};
    opacity:0.4;animation:fxFlash 0.4s ease-out both;z-index:4;`;
  root.appendChild(el);
  ensureKeyframes(root);
  setTimeout(() => el.remove(), 450);
}

function ensureKeyframes(root: HTMLElement): void {
  if (root.querySelector("style[data-fx]")) return;
  const style = document.createElement("style");
  style.dataset.fx = "1";
  style.textContent = `
    @keyframes balloonIn{0%{transform:translate(-50%,-92%) scale(0.6);opacity:0}
      100%{transform:translate(-50%,-100%) scale(1);opacity:1}}
    @keyframes fxFlash{0%{opacity:0.45}100%{opacity:0}}
  `;
  root.appendChild(style);
}
