// Continue countdown / game over / victory screens.

import { useEffect, useState } from "react";
import type { GameFlow } from "../GameHost";
import { castById } from "../cast";

type ControllerLike = {
  run: {
    players: ({ castId: string; score: number } | null)[];
    continuesLeft: number;
    levelIndex: number;
  };
};

export function GameOverOverlay({
  flow,
  controller,
  waitForHost = false,
  onContinue,
  onExit,
}: {
  flow: GameFlow;
  controller: ControllerLike;
  /** online guest: only the host can spend a continue */
  waitForHost?: boolean;
  onContinue: () => void;
  onExit: () => void;
}) {
  const [count, setCount] = useState(9);
  const isContinue = flow.kind === "continue";
  const isVictory = flow.kind === "victory";

  useEffect(() => {
    if (!isContinue) return;
    if (count <= 0) {
      // online guest: linger a beat — the host's continue may be in flight
      const t = setTimeout(onExit, waitForHost ? 2500 : 0);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setCount((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [count, isContinue, waitForHost, onExit]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (isContinue && !waitForHost && (e.code === "KeyF" || e.code === "KeyK" || e.code === "Enter")) {
        onContinue();
      }
      if (!isContinue && (e.code === "Enter" || e.code === "Space")) {
        onExit();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [isContinue, waitForHost, onContinue, onExit]);

  return (
    <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 bg-black/90">
      {isContinue ? (
        <>
          <div className="font-display text-6xl uppercase text-[#E8B928]" style={{ textShadow: "4px 4px 0 #000, 8px 8px 0 rgba(185,58,32,0.9)" }}>
            Continue?
          </div>
          <div className="font-display text-7xl text-white" style={{ textShadow: "4px 4px 0 #B93A20" }}>
            {count}
          </div>
          <div className="font-pixel text-[10px] text-white/70">
            {controller.run.continuesLeft} CONTINUE{controller.run.continuesLeft === 1 ? "" : "S"} LEFT ·
            RESTARTS THIS WORLD · ARSENAL RESETS
          </div>
          {waitForHost ? (
            <div className="font-pixel text-[10px] text-white/70">
              WAITIN' ON THE HOST TO SPOT Y'ALL A CONTINUE...
            </div>
          ) : (
            <>
              <button
                className="border-2 border-[#E8B928] px-6 py-2 font-display text-2xl uppercase text-[#E8B928] hover:bg-[#E8B928] hover:text-black"
                onClick={onContinue}
              >
                Hit F / K / Enter
              </button>
              <button className="font-pixel text-[9px] text-white/40 hover:text-white" onClick={onExit}>
                let the holler fall
              </button>
            </>
          )}
        </>
      ) : (
        <>
          <div
            className="font-display text-6xl uppercase"
            style={{
              color: isVictory ? "#9BC318" : "#B93A20",
              textShadow: "4px 4px 0 #000, 8px 8px 0 rgba(0,0,0,0.6)",
            }}
          >
            {isVictory ? "THE STILL IS HOME!" : "GAME OVER"}
          </div>
          {isVictory && (
            <div className="max-w-md text-center font-pixel text-[10px] leading-relaxed text-white/80">
              Ol' Scratch got his tail whooped by 99 levels of family. The
              holler throws the hoedown of the century.
            </div>
          )}
          <div className="mt-2 flex gap-10">
            {controller.run.players.map((pr, i) =>
              pr ? (
                <div key={i} className="text-center">
                  <div className="font-pixel text-[10px]" style={{ color: i === 0 ? "#9be8c8" : "#f0c880" }}>
                    {castById(pr.castId).displayName.toUpperCase()}
                  </div>
                  <div className="font-display text-3xl text-white">{pr.score.toLocaleString()}</div>
                </div>
              ) : null,
            )}
          </div>
          <button
            className="mt-3 border-2 border-white/70 px-6 py-2 font-display text-xl uppercase text-white hover:bg-white hover:text-black"
            onClick={onExit}
          >
            To the Title (Enter)
          </button>
        </>
      )}
    </div>
  );
}
