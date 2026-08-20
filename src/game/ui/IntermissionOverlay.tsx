// The between-level upgrade picks: 1 of 3 cards per player, split screen in
// co-op, one free reroll per world. Keyboard: move + jump/blow to confirm,
// so hands never leave the game keys.

import { useEffect, useMemo, useState } from "react";
import { cardDesc, cardTitle, type Card } from "../run/run";
import { castById } from "../cast";
import { worldForLevel } from "../levels/worlds";

type ControllerLike = {
  run: {
    players: ({ castId: string; rerollsLeft: number } | null)[];
    levelIndex: number;
  };
  pickCard: (player: number, card: Card) => void;
  dealFor: (player: number) => Card[];
};

const P_COLORS = ["#9be8c8", "#f0c880"];
type CardKeys = { left: string[]; right: string[]; confirm: string[]; reroll: string };
const KEYS: Record<number, CardKeys> = {
  0: { left: ["KeyA"], right: ["KeyD"], confirm: ["KeyF", "KeyG"], reroll: "KeyS" },
  1: { left: ["ArrowLeft"], right: ["ArrowRight"], confirm: ["KeyK", "KeyL"], reroll: "ArrowDown" },
};
// Solo: the arrow cluster is free, so it drives player 1's card too.
const SOLO_KEYS: Record<number, CardKeys> = {
  0: {
    left: ["KeyA", "ArrowLeft"],
    right: ["KeyD", "ArrowRight"],
    confirm: ["KeyF", "KeyG", "Enter", "Space"],
    reroll: "KeyS",
  },
  1: KEYS[1],
};

export function IntermissionOverlay({
  controller,
  cards,
  solo = false,
  onDone,
}: {
  controller: ControllerLike;
  cards: (Card[] | null)[];
  solo?: boolean;
  onDone: () => void;
}) {
  const keymap = solo ? SOLO_KEYS : KEYS;
  const activePlayers = useMemo(
    () => cards.map((c, i) => (c ? i : -1)).filter((i) => i >= 0),
    [cards],
  );
  const [cursor, setCursor] = useState<number[]>([0, 0]);
  const [locked, setLocked] = useState<boolean[]>([false, false]);
  const [dealt, setDealt] = useState(cards);
  const world = worldForLevel(controller.run.levelIndex);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      for (const pi of activePlayers) {
        const keys = keymap[pi];
        const hand = dealt[pi];
        if (!hand || locked[pi]) continue;
        if (keys.left.includes(e.code)) {
          setCursor((c) => c.map((v, i) => (i === pi ? (v + hand.length - 1) % hand.length : v)));
        } else if (keys.right.includes(e.code)) {
          setCursor((c) => c.map((v, i) => (i === pi ? (v + 1) % hand.length : v)));
        } else if (keys.confirm.includes(e.code)) {
          controller.pickCard(pi, hand[cursor[pi]]);
          setLocked((l) => l.map((v, i) => (i === pi ? true : v)));
        }
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [activePlayers, cursor, dealt, locked, controller, keymap]);

  useEffect(() => {
    const need = activePlayers.every((pi) => locked[pi]);
    if (need && activePlayers.length > 0) {
      const t = setTimeout(onDone, 550);
      return () => clearTimeout(t);
    }
    if (activePlayers.length === 0) onDone();
  }, [locked, activePlayers, onDone]);

  return (
    <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 bg-black/85">
      <div
        className="font-display text-3xl uppercase text-[#E8B928]"
        style={{ textShadow: "3px 3px 0 #000" }}
      >
        Pick yer poison
      </div>
      <div className="font-pixel text-[9px] text-white/50">
        NEXT: {world.name.toUpperCase()} · LEVEL {controller.run.levelIndex}/99
      </div>
      <div className="flex w-full flex-col gap-3 px-6">
        {activePlayers.map((pi) => {
          const pr = controller.run.players[pi];
          const hand = dealt[pi];
          if (!pr || !hand) return null;
          return (
            <div key={pi}>
              <div className="mb-1 font-pixel text-[10px]" style={{ color: P_COLORS[pi] }}>
                {castById(pr.castId).displayName.toUpperCase()}
                {locked[pi] ? " · PICKED!" : ""}
              </div>
              <div className="flex gap-3">
                {hand.map((card, ci) => (
                  <div
                    key={ci}
                    className="flex-1 cursor-pointer border-2 p-2 transition-transform"
                    style={{
                      borderColor: cursor[pi] === ci ? P_COLORS[pi] : "#3a3020",
                      background: cursor[pi] === ci ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.5)",
                      transform: cursor[pi] === ci && !locked[pi] ? "scale(1.04)" : "scale(1)",
                      opacity: locked[pi] && cursor[pi] !== ci ? 0.35 : 1,
                    }}
                    onClick={() => {
                      if (locked[pi]) return;
                      setCursor((c) => c.map((v, i) => (i === pi ? ci : v)));
                      controller.pickCard(pi, card);
                      setLocked((l) => l.map((v, i) => (i === pi ? true : v)));
                    }}
                  >
                    <div className="font-pixel text-[9px] text-[#ffd84a]">
                      {card.kind === "evolve" ? "★ EVOLUTION ★" : card.kind === "tonic" ? "TONIC" : card.kind === "upgrade" ? "UPGRADE" : "BONUS"}
                    </div>
                    <div className="mt-1 font-display text-lg uppercase leading-tight text-white">
                      {cardTitle(card)}
                    </div>
                    <div className="mt-1 font-pixel text-[8px] leading-relaxed text-white/60">
                      {cardDesc(card)}
                    </div>
                  </div>
                ))}
              </div>
              {!locked[pi] && pr.rerollsLeft > 0 && (
                <button
                  className="mt-1 font-pixel text-[8px] text-white/40 hover:text-white"
                  onClick={() => {
                    pr.rerollsLeft--;
                    const fresh = controller.dealFor(pi);
                    setDealt((d) => d.map((h, i) => (i === pi ? fresh : h)));
                    setCursor((c) => c.map((v, i) => (i === pi ? 0 : v)));
                  }}
                >
                  REROLL ({pr.rerollsLeft} left)
                </button>
              )}
            </div>
          );
        })}
      </div>
      <div className="font-pixel text-[8px] text-white/35">
        move to choose · blow/jump key to confirm · or click
      </div>
    </div>
  );
}
