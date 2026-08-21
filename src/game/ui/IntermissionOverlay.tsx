// The between-level upgrade picks: 1 of 3 cards per player, split screen in
// co-op, one free reroll per world. Each hand is its own cursor on the menu
// layer: P1's keys / pad 1 drive hand 0, P2's drive hand 1 (solo and online:
// the whole keyboard and any pad drive MY hand). Left/right to choose,
// jump/blow/A/X to confirm, down/Y for the reroll, or click.
//
// Online, the partner's hand is a spectator strip under mine: compact, dimmed,
// no hover/pointer, with their live cursor streamed over the room so you can
// watch them hem and haw. Once I've locked, emphasis swaps — my pick collapses
// to a chip and their strip grows to full size while I wait on them. A lock
// (mine or theirs) is a reveal: the taken card pops, the others fall away.

import { useEffect, useMemo, useRef, useState } from "react";
import { cardDesc, cardTitle, type Card } from "../run/run";
import { castById } from "../cast";
import { worldForLevel } from "../levels/worlds";
import { Hints } from "../../shell/MenuChrome";
import { menuSfx, useMenuNav } from "../../shell/useMenuNav";

type ControllerLike = {
  run: {
    players: ({ castId: string; rerollsLeft: number } | null)[];
    levelIndex: number;
  };
  pickCard: (player: number, card: Card) => void;
  dealFor: (player: number) => Card[];
};

const P_COLORS = ["#9be8c8", "#f0c880"];

/** Online hooks: I only control my own hand; the partner's pick and cursor
 *  arrive via the room (applied by GameHost) and show up here. */
type NetHooks = {
  myIdx: number;
  /** partner's taken card per slot (null until it lands) */
  remotePicks: (Card | null)[];
  /** partner's live cursor per slot (null until their first move arrives) */
  remoteCursor: (number | null)[];
  onPick: (card: Card) => void;
  onCursor: (idx: number) => void;
};

const sameCard = (a: Card, b: Card) => JSON.stringify(a) === JSON.stringify(b);

const kindLabel = (card: Card) =>
  card.kind === "evolve" ? "★ EVOLUTION ★" : card.kind === "tonic" ? "TONIC" : card.kind === "upgrade" ? "UPGRADE" : "BONUS";

export function IntermissionOverlay({
  controller,
  cards,
  solo = false,
  net,
  onDone,
}: {
  controller: ControllerLike;
  cards: (Card[] | null)[];
  solo?: boolean;
  net?: NetHooks;
  onDone: () => void;
}) {
  const activePlayers = useMemo(
    () => cards.map((c, i) => (c ? i : -1)).filter((i) => i >= 0),
    [cards],
  );
  const [locked, setLocked] = useState<boolean[]>([false, false]);
  // which card each hand took (index into its dealt hand), for the reveal
  const [taken, setTaken] = useState<(number | null)[]>([null, null]);
  const [dealt, setDealt] = useState(cards);
  const world = worldForLevel(controller.run.levelIndex);

  // online: the partner's lock state comes over the wire
  const lockedFor = (pi: number): boolean =>
    locked[pi] || (net ? pi !== net.myIdx && net.remotePicks[pi] !== null : false);
  // the index the hand settled on: mine from local state, the partner's by
  // matching their wired card against the (identically dealt) hand
  const takenFor = (pi: number): number | null => {
    if (taken[pi] !== null) return taken[pi];
    const remote = net && pi !== net.myIdx ? net.remotePicks[pi] : null;
    const hand = dealt[pi];
    if (!remote || !hand) return null;
    const i = hand.findIndex((c) => sameCard(c, remote));
    return i >= 0 ? i : null;
  };

  const pick = (pi: number, ci: number) => {
    const hand = dealt[pi];
    if (!hand || locked[pi] || (net && pi !== net.myIdx)) return;
    controller.pickCard(pi, hand[ci]);
    net?.onPick(hand[ci]);
    setLocked((l) => l.map((v, i) => (i === pi ? true : v)));
    setTaken((t) => t.map((v, i) => (i === pi ? ci : v)));
    menuSfx("accept");
  };
  const reroll = (pi: number) => {
    const pr = controller.run.players[pi];
    if (!pr || locked[pi] || net || pr.rerollsLeft <= 0) {
      menuSfx("nope");
      return;
    }
    pr.rerollsLeft--;
    const fresh = controller.dealFor(pi);
    setDealt((d) => d.map((h, i) => (i === pi ? fresh : h)));
    menuSfx("tick");
  };

  // who drives which hand: co-op keyboard splits by cluster; solo and online
  // give the whole keyboard (and any pad) to the one live hand
  const driver = (pi: number): 0 | 1 | "any" => (net || solo ? "any" : (pi as 0 | 1));
  const mine = (pi: number) => !net || pi === net.myIdx;
  const handOpts = (pi: number) => ({
    count: dealt[pi]?.length ?? 0,
    cols: Math.max(1, dealt[pi]?.length ?? 0),
    player: driver(pi),
    // couch co-op: the shared keys (Enter/Space) belong to nobody, or one
    // press would pick for both hands
    strict: !net && !solo,
    enabled: !!dealt[pi] && !locked[pi] && mine(pi),
    sfx: false,
    onMove: () => menuSfx("move"),
    onAccept: (i: number) => pick(pi, i),
    onAlt: (i: number) => pick(pi, i),
    onAlt2: () => reroll(pi),
    onVertical: (_i: number, dir: -1 | 1) => {
      if (dir > 0) reroll(pi);
      return true;
    },
  });
  const nav0 = useMenuNav(handOpts(0));
  const nav1 = useMenuNav(handOpts(1));
  const navs = [nav0, nav1];

  // online: stream my cursor so the partner can watch me deliberate
  const myFocus = net ? navs[net.myIdx].focus : -1;
  useEffect(() => {
    if (net) net.onCursor(myFocus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myFocus, !!net]);

  // both hands settled -> on to the level. Keyed on a plain boolean (and
  // onDone via a ref) so GameHost re-renders can't keep resetting the timer.
  const allLocked = activePlayers.length > 0 && activePlayers.every((pi) => lockedFor(pi));
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  useEffect(() => {
    if (allLocked) {
      // let the last reveal land before the level flips
      const t = setTimeout(() => onDoneRef.current(), 800);
      return () => clearTimeout(t);
    }
    if (activePlayers.length === 0) onDoneRef.current();
  }, [allLocked, activePlayers]);

  // online: my hand on top, the partner's strip under it, whatever our slots
  const order = net
    ? [...activePlayers.filter((p) => p === net.myIdx), ...activePlayers.filter((p) => p !== net.myIdx)]
    : activePlayers;
  const iLocked = net ? locked[net.myIdx] : false;
  const partnerIdx = net ? activePlayers.find((p) => p !== net.myIdx) : undefined;
  const partnerCast = partnerIdx !== undefined ? controller.run.players[partnerIdx]?.castId : undefined;
  const partnerName = partnerCast ? castById(partnerCast).displayName.toUpperCase() : null;

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
        {order.map((pi) => {
          const pr = controller.run.players[pi];
          const hand = dealt[pi];
          const nav = navs[pi];
          if (!pr || !hand) return null;
          const isMine = mine(pi);
          const isLocked = lockedFor(pi);
          const tookIdx = takenFor(pi);
          const color = P_COLORS[pi];
          const name = castById(pr.castId).displayName.toUpperCase();
          // the partner's strip: compact while I'm still choosing, full once
          // I've locked and I'm just watching them
          const spectator = !!net && !isMine;
          const compact = spectator && !iLocked;
          // live cursor: mine from the nav, theirs from the wire
          const cursor = isMine ? nav.focus : net?.remoteCursor[pi] ?? null;
          // cursor highlight only while still choosing; once locked the
          // reveal takes over
          const hot = isLocked ? tookIdx : cursor;

          // online, once I've locked: collapse my hand to a confirmation chip
          if (net && isMine && isLocked && tookIdx !== null) {
            const card = hand[tookIdx];
            return (
              <div key={pi} className="flex items-center justify-center gap-3 py-1">
                <span className="font-pixel text-[9px]" style={{ color }}>
                  YOU TOOK
                </span>
                <span
                  className="border-2 px-3 py-1 font-display text-base uppercase leading-none text-white"
                  style={{ borderColor: color, background: "rgba(0,0,0,0.6)", boxShadow: "3px 3px 0 #000" }}
                >
                  {cardTitle(card)}
                </span>
                {partnerName && (
                  <span className="font-pixel text-[8px] text-white/40">
                    {partnerIdx !== undefined && lockedFor(partnerIdx) ? "ALL SET!" : `WAITIN' ON ${partnerName}...`}
                  </span>
                )}
              </div>
            );
          }

          const status = isLocked ? " · PICKED!" : spectator ? " · PICKIN'..." : "";

          return (
            <div
              key={pi}
              className="transition-opacity duration-300"
              style={{ opacity: compact ? 0.75 : 1 }}
            >
              <div
                className={`mb-1 flex items-center gap-2 font-pixel ${compact ? "text-[8px]" : "text-[10px]"}`}
                style={{ color }}
              >
                {!net && !solo && (
                  <span
                    className="inline-flex items-center justify-center border px-1 leading-none"
                    style={{ borderColor: color, fontSize: "7px", paddingTop: 2, paddingBottom: 1 }}
                  >
                    P{pi + 1}
                  </span>
                )}
                <span>
                  {name}
                  {net && isMine ? " (YOU)" : ""}
                  {status}
                </span>
                {spectator && !isLocked && (
                  <span className="ml-1 inline-block h-[6px] w-[6px] animate-pulse" style={{ background: color }} />
                )}
              </div>
              <div className={`flex ${compact ? "gap-2" : "gap-3"}`}>
                {hand.map((card, ci) => {
                  const b = nav.bind(ci);
                  const isHot = hot === ci;
                  const isTaken = isLocked && tookIdx === ci;
                  const interactive = isMine && !locked[pi];
                  return (
                    <div
                      key={ci}
                      ref={isMine ? b.ref : undefined}
                      onMouseEnter={interactive ? b.onMouseEnter : undefined}
                      className={`flex-1 border-2 transition-all duration-200 ${compact ? "p-1.5" : "p-2"} ${interactive ? "cursor-pointer" : "cursor-default"}`}
                      style={{
                        borderColor: isHot ? color : "#3a3020",
                        background: isTaken
                          ? "rgba(255,255,255,0.12)"
                          : isHot
                            ? "rgba(255,255,255,0.07)"
                            : "rgba(0,0,0,0.5)",
                        transform: isTaken
                          ? "scale(1.06)"
                          : isHot && !isLocked && !spectator
                            ? "scale(1.04)"
                            : "scale(1)",
                        // the reveal: the taken card stays lit, the rest fall away
                        opacity: isLocked && !isTaken ? 0.2 : spectator && !isHot ? 0.6 : 1,
                        boxShadow: isTaken ? `0 0 0 2px ${color}, 4px 4px 0 #000` : isHot && !isLocked && !spectator ? "4px 4px 0 #000" : undefined,
                        filter: spectator && !isTaken ? "saturate(0.6)" : undefined,
                        position: "relative",
                      }}
                      onClick={() => {
                        if (!interactive) return;
                        nav.setFocus(ci);
                        pick(pi, ci);
                      }}
                    >
                      <div className={`font-pixel text-[#ffd84a] ${compact ? "text-[7px]" : "text-[9px]"}`}>
                        {kindLabel(card)}
                      </div>
                      <div className={`mt-1 font-display uppercase leading-tight text-white ${compact ? "text-sm" : "text-lg"}`}>
                        {cardTitle(card)}
                      </div>
                      {!compact && (
                        <div className="mt-1 font-pixel text-[8px] leading-relaxed text-white/60">
                          {cardDesc(card)}
                        </div>
                      )}
                      {isTaken && (
                        <div
                          className="pointer-events-none absolute -right-2 -top-2 rotate-6 border-2 px-1 font-pixel text-[8px] leading-none"
                          style={{
                            color: "#000",
                            background: color,
                            borderColor: "#000",
                            paddingTop: 3,
                            paddingBottom: 2,
                            boxShadow: "2px 2px 0 #000",
                          }}
                        >
                          PICKED!
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {!locked[pi] && !net && pr.rerollsLeft > 0 && (
                <button
                  className="mt-1 font-pixel text-[8px] text-white/40 hover:text-white"
                  tabIndex={-1}
                  onClick={() => reroll(pi)}
                >
                  REROLL ({pr.rerollsLeft} left)
                </button>
              )}
            </div>
          );
        })}
      </div>
      {!iLocked && (
        <Hints
          hints={[
            { action: "leftright", label: "CHOOSE" },
            { action: "accept", label: "TAKE IT" },
            ...(!net && activePlayers.some((pi) => (controller.run.players[pi]?.rerollsLeft ?? 0) > 0 && !locked[pi])
              ? [{ action: "down" as const, label: "REROLL" }]
              : []),
          ]}
          className="text-white/35"
        />
      )}
    </div>
  );
}
