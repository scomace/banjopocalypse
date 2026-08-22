// HUD: score, lives, YEEHAW letters, wind pips, frenzy bar. Updated imperatively at
// ~10Hz off a rAF loop reading controller state directly; React renders the
// static skeleton once.

import { useEffect, useRef } from "react";
import { WIND_ENABLED, WIND_MAX, YEEHAW } from "../sim/constants";
import { castById } from "../cast";
import { weaponById } from "../sim/weapons";

type ControllerLike = {
  run: {
    players: ({
      castId: string;
      lives: number;
      score: number;
      letters: boolean[];
    } | null)[];
    levelIndex: number;
  };
  sim: {
    players: {
      index: number;
      frenzy: { weapon: string; ticksLeft: number } | null;
      wind: number;
    }[];
    world: { name: string };
    isBoss: boolean;
  };
};

const P_COLORS = ["#9be8c8", "#f0c880"];

export function HudOverlay({ controller }: { controller: ControllerLike }) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let raf = 0;
    let last = 0;
    const update = (now: number) => {
      raf = requestAnimationFrame(update);
      if (now - last < 90) return;
      last = now;
      const root = rootRef.current;
      if (!root) return;
      for (let i = 0; i < 2; i++) {
        const pr = controller.run.players[i];
        const panel = root.querySelector<HTMLElement>(`[data-hud="${i}"]`);
        if (!panel) continue;
        panel.style.display = pr ? "block" : "none";
        if (!pr) continue;
        const scoreEl = panel.querySelector<HTMLElement>("[data-score]");
        if (scoreEl) scoreEl.textContent = pr.score.toLocaleString();
        const livesEl = panel.querySelector<HTMLElement>("[data-lives]");
        if (livesEl) livesEl.textContent = "♥".repeat(Math.min(pr.lives, 8));
        const letters = panel.querySelectorAll<HTMLElement>("[data-letter]");
        letters.forEach((el, li) => {
          el.style.opacity = pr.letters[li] ? "1" : "0.25";
        });
        const simP = controller.sim.players.find((p) => p.index === i);
        // wind pips: lit = air specials in the tank; empty + gassed blinks red
        const windEl = panel.querySelector<HTMLElement>("[data-wind]");
        if (windEl) {
          const show = WIND_ENABLED && !controller.sim.isBoss && !!simP;
          windEl.style.display = show ? "flex" : "none";
          if (show && simP) {
            const gassed = simP.wind <= 0;
            const blink = gassed && Math.floor(now / 180) % 2 === 0;
            windEl.querySelectorAll<HTMLElement>("[data-windpip]").forEach((el, wi) => {
              // wind is fractional (Bobbie Sue's sputter sips it): the pip
              // being drained dims smoothly instead of snapping off
              const fill = Math.max(0, Math.min(1, simP.wind - wi));
              el.style.opacity =
                fill >= 1 ? "1" : fill > 0 ? (0.3 + fill * 0.7).toFixed(2) : blink ? "0.7" : "0.3";
              el.style.background = gassed ? "#ff6b6b" : "#8fe3ff";
            });
          }
        }
        const fbar = panel.querySelector<HTMLElement>("[data-frenzy]");
        const fname = panel.querySelector<HTMLElement>("[data-frenzyname]");
        if (fbar && fname) {
          if (simP?.frenzy) {
            fbar.style.display = "block";
            fname.textContent = weaponById(simP.frenzy.weapon).name.toUpperCase();
            const fill = fbar.querySelector<HTMLElement>("[data-fill]");
            if (fill) {
              fill.style.width = `${Math.max(0, Math.min(100, (simP.frenzy.ticksLeft / (20 * 60)) * 100))}%`;
            }
          } else {
            fbar.style.display = "none";
            fname.textContent = "";
          }
        }
      }
      const lvl = root.querySelector<HTMLElement>("[data-level]");
      if (lvl) {
        lvl.textContent = `${controller.sim.world.name.toUpperCase()} · ${controller.run.levelIndex}/99`;
      }
    };
    raf = requestAnimationFrame(update);
    return () => cancelAnimationFrame(raf);
  }, [controller]);

  return (
    <div ref={rootRef} className="pointer-events-none absolute inset-0 z-20 select-none">
      {[0, 1].map((i) => {
        const pr = controller.run.players[i];
        return (
          <div
            key={i}
            data-hud={i}
            className={`absolute top-1 ${i === 0 ? "left-2 text-left" : "right-2 text-right"}`}
            style={{ display: pr ? "block" : "none", color: P_COLORS[i] }}
          >
            <div className="font-pixel text-[9px] opacity-80">
              {pr ? castById(pr.castId).displayName.toUpperCase() : ""}
            </div>
            <div data-score className="font-pixel text-[13px]" style={{ textShadow: "2px 2px 0 #000" }}>
              0
            </div>
            <div data-lives className="font-pixel text-[10px] text-[#ff6b6b]" style={{ textShadow: "1px 1px 0 #000" }} />
            <div
              data-wind
              title="wind"
              className={`mt-0.5 gap-[3px] ${i === 1 ? "justify-end" : ""}`}
              style={{ display: "none" }}
            >
              {Array.from({ length: WIND_MAX }, (_, wi) => (
                <span
                  key={wi}
                  data-windpip
                  className="inline-block h-1.5 w-2.5 border border-black/70"
                  style={{ background: "#8fe3ff", opacity: 1 }}
                />
              ))}
            </div>
            <div className={`mt-0.5 flex gap-0.5 ${i === 1 ? "justify-end" : ""}`}>
              {YEEHAW.map((ch, li) => (
                <span
                  key={li}
                  data-letter
                  className="font-pixel text-[9px] text-[#ffd84a]"
                  style={{ opacity: 0.25, textShadow: "1px 1px 0 #000" }}
                >
                  {ch}
                </span>
              ))}
            </div>
            <div data-frenzy className="mt-1 hidden w-28">
              <div data-frenzyname className="font-pixel text-[7px] text-[#ffd84a]" />
              <div className="h-1.5 w-full border border-black/60 bg-black/40">
                <div data-fill className="h-full bg-[#ffd84a]" style={{ width: "100%" }} />
              </div>
            </div>
          </div>
        );
      })}
      <div
        data-level
        className="absolute left-1/2 top-1 -translate-x-1/2 font-pixel text-[9px] text-white/70"
        style={{ textShadow: "1px 1px 0 #000" }}
      />
    </div>
  );
}
