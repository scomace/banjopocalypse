// FX overlay: comic bursts (full exclaim SVG runtime) + speech balloons +
// screen flashes above the playfield. Bursts are React-rendered (rare
// events); balloons/flashes are imperative DOM (cheap, self-removing).

import {
  forwardRef,
  useEffect,
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

/** A balloon that re-anchors to its speaker every frame while it lives. */
type LiveBalloon = {
  el: HTMLDivElement;
  player: number;
  /** Last good anchor, held if the speaker stops existing mid-line. */
  x: number;
  y: number;
};

const BALLOON_TTL_MS = 1900;
const BALLOON_LIFT = 52; // px above the player's feet-center origin

let fxId = 1;

export const FxOverlay = forwardRef<FxOverlayHandle>(function FxOverlay(_, ref) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [bursts, setBursts] = useState<LiveBurst[]>([]);
  const simRef = useRef<Sim | null>(null);
  const balloonsRef = useRef<LiveBalloon[]>([]);

  // Follow loop: re-anchors every live balloon to its speaker each frame so
  // the bubble travels with the character instead of pinning to the spot
  // they happened to be standing on when the line fired. No-ops when nothing
  // is speaking.
  useEffect(() => {
    let raf = 0;
    const step = () => {
      const live = balloonsRef.current;
      const sim = simRef.current;
      if (live.length > 0 && sim) {
        for (const b of live) {
          const anchor = anchorFor(sim, b.player);
          if (anchor) {
            b.x = anchor.x;
            b.y = anchor.y;
          }
          placeBalloon(b.el, b.x, b.y);
        }
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);

  useImperativeHandle(ref, () => ({
    handleFx(events: FxEvent[], sim: Sim) {
      const root = rootRef.current;
      if (!root) return;
      simRef.current = sim;
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
          // Note: the death bark is emitted right after p.alive flips false,
          // so this must not gate on `alive`. Spectators stay silent.
          if (p && !p.spectating) {
            const line = pickBark(p.castId, e.trigger);
            const anchor = anchorFor(sim, e.player) ?? { x: p.x, y: p.y - BALLOON_LIFT };
            if (line) {
              spawnBalloon(root, balloonsRef.current, line, anchor, e.player);
            }
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

/**
 * Where player `index`'s balloon tail should sit right now: above the live
 * body, above the drifting ghost bubble if they are down but revivable, or
 * null if they have left the field entirely (balloon then holds its spot).
 */
function anchorFor(sim: Sim, index: number): { x: number; y: number } | null {
  const p = sim.players.find((q) => q.index === index);
  if (!p) return null;
  if (p.alive) return { x: p.x, y: p.y - BALLOON_LIFT };
  if (p.ghost) return { x: p.ghost.x, y: p.ghost.y - 34 };
  return null;
}

function placeBalloon(el: HTMLElement, x: number, y: number): void {
  const cx = Math.max(90, Math.min(FIELD_W - 90, x));
  const cy = Math.max(50, Math.min(FIELD_H - 20, y));
  el.style.left = `${(cx / FIELD_W) * 100}%`;
  el.style.top = `${(cy / FIELD_H) * 100}%`;
}

function spawnBalloon(
  root: HTMLElement,
  live: LiveBalloon[],
  text: string,
  anchor: { x: number; y: number },
  player: number,
): void {
  // One balloon per speaker: a new line replaces the one still in the air.
  for (let i = live.length - 1; i >= 0; i--) {
    if (live[i].player === player) {
      live[i].el.remove();
      live.splice(i, 1);
    }
  }
  const el = document.createElement("div");
  el.dataset.balloon = String(player);
  el.style.cssText = `position:absolute;transform:translate(-50%,-100%);
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
  placeBalloon(el, anchor.x, anchor.y);
  root.appendChild(el);
  ensureKeyframes(root);

  const entry: LiveBalloon = { el, player, x: anchor.x, y: anchor.y };
  live.push(entry);
  setTimeout(() => {
    const i = live.indexOf(entry);
    if (i >= 0) live.splice(i, 1);
    el.remove();
  }, BALLOON_TTL_MS);
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
