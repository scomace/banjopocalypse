// Continue countdown / game over / victory screens. Continue is a two-item
// row (Continue / let it fall) so a stray B at the death screen can't
// throw the run away; game over and victory leave on any accept.

import { useEffect, useState } from "react";
import type { GameFlow } from "../GameHost";
import { castById } from "../cast";
import { Hints } from "../../shell/MenuChrome";
import { MenuButton } from "../../shell/screens";
import { menuSfx, useMenuNav } from "../../shell/useMenuNav";

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

  // continue: [Continue] [let it fall]; otherwise one button
  const nav = useMenuNav({
    count: isContinue && !waitForHost ? 2 : 1,
    cols: 2,
    enabled: !(isContinue && waitForHost),
    sfx: false,
    onMove: () => menuSfx("move"),
    onAccept: (i) => {
      if (isContinue) {
        if (i === 0) {
          menuSfx("accept");
          onContinue();
        } else {
          menuSfx("back");
          onExit();
        }
      } else {
        menuSfx("accept");
        onExit();
      }
    },
    onBack: () => {
      if (!isContinue) {
        menuSfx("back");
        onExit();
      }
    },
  });

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
              <div className="flex items-center gap-6">
                <MenuButton bind={nav.bind(0)}>Continue</MenuButton>
                <MenuButton subtle bind={nav.bind(1)}>
                  let the holler fall
                </MenuButton>
              </div>
              <Hints
                hints={[
                  { action: "accept", label: "CONTINUE" },
                  { action: "leftright", label: "CHOOSE" },
                ]}
              />
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
          <MenuButton bind={nav.bind(0)} className="mt-3">
            To the Title
          </MenuButton>
          <Hints hints={[{ action: "accept", label: "ONWARD" }]} />
        </>
      )}
    </div>
  );
}
