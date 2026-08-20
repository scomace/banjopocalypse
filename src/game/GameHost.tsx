// GameHost: React owner of a running campaign. Bakes the cast, owns the
// RunController (plain TS: RunState + current Sim + level flow), mounts the
// Phaser view, renders DOM overlays (HUD, intermission cards, game over).
// React state changes only on flow transitions, never per-frame.

import { useEffect, useMemo, useRef, useState } from "react";
import type Phaser from "phaser";
import { bakeCast, type BakedCharacter } from "../aachar/baker";
import { castById } from "./cast";
import { DEFAULT_BINDINGS, InputSampler, SOLO_BINDINGS } from "./core/input";
import { LocalInputSource, type InputSource } from "./core/inputsource";
import { ReplayRecorder, saveLastReplay, verifyReplay, type LevelReplay } from "./replay";
import { NetworkInputSource } from "./net/netsource";
import type { NetSession } from "./net/client";
import { hashSim } from "./sim/hash";
import { getLevelDef } from "./levels";
import { isBossLevel, worldForLevel } from "./levels/worlds";
import { deriveSeed } from "./core/rng";
import { createSim, type SimConfig } from "./sim/sim";
import { takeShrine } from "./sim/shrine";
import type { FxEvent, ShrineGift, Sim, SimInputs } from "./sim/types";
import { LEVEL_CLEAR_TICKS } from "./sim/constants";
import {
  addScore,
  applyCard,
  applyContinue,
  collectLetter,
  dealCards,
  newRun,
  shrineGiftsFor,
  type Card,
  type RunState,
} from "./run/run";
import { createPhaserGame } from "./render/PlayScene";
import { audio } from "./audio/engine";
import { HudOverlay } from "./ui/HudOverlay";
import { IntermissionOverlay } from "./ui/IntermissionOverlay";
import { GameOverOverlay } from "./ui/GameOverOverlay";
import { LevelIntroOverlay } from "./ui/LevelIntroOverlay";
import { WeaponAcquiredOverlay } from "./ui/WeaponAcquiredOverlay";
import { FxOverlay, type FxOverlayHandle } from "./fx/FxOverlay";
import { saveCheckpoint } from "./core/save";

export type GameFlow =
  /** `resume`: back from a mid-level hold (shrine reveal) — no level intro */
  | { kind: "playing"; resume?: boolean }
  | { kind: "acquired"; gift: ShrineGift; player: number }
  | { kind: "intermission"; cards: (Card[] | null)[]; picked: (Card | null)[] }
  | { kind: "continue" }
  | { kind: "gameover"; won: boolean }
  | { kind: "victory" };

export type GameHostProps = {
  castIds: (string | null)[];
  startLevel: number;
  seed: number;
  /** present = lockstep online session; the sim itself never knows */
  net?: NetSession;
  onExit: (result: { won: boolean; scores: number[]; level: number }) => void;
};

class RunController {
  run: RunState;
  sim: Sim;
  onFlow: (flow: GameFlow) => void = () => {};
  fxSink: (events: FxEvent[]) => void = () => {};
  private clearedHandled = false;
  /** Sim is frozen mid-level for a reveal (set synchronously — React lags a frame). */
  held = false;
  private recorder!: ReplayRecorder;
  /** The finished input log of the last completed level. */
  lastReplay: LevelReplay | null = null;

  constructor(castIds: (string | null)[], startLevel: number, seed: number) {
    this.run = newRun(seed, startLevel, castIds);
    this.sim = this.buildSim();
  }

  buildSim(): Sim {
    const idx = this.run.levelIndex;
    const world = worldForLevel(idx);
    const cfg: SimConfig = {
      seed: deriveSeed(this.run.seed, idx),
      levelDef: getLevelDef(idx),
      world,
      levelIndex: idx,
      isBoss: isBossLevel(idx),
      players: this.run.players.map((pr) =>
        pr
          ? { castId: pr.castId, loadout: pr.loadout, livesLeft: pr.lives, headStart: pr.headStart }
          : null,
      ),
      deathless: this.run.deathlessThisWorld,
      shrine: shrineGiftsFor(this.run),
    };
    this.clearedHandled = false;
    this.held = false;
    // the recorder deep-copies the config now, before play mutates loadouts
    this.recorder = new ReplayRecorder(cfg);
    // Jar o' Lightnin' is one level only; the sim has its copy now
    for (const pr of this.run.players) if (pr) pr.headStart = false;
    return createSim(cfg);
  }

  /** Called by the scene with the inputs that drove each tick. */
  recordTick(inputs: SimInputs): void {
    this.recorder.record(inputs);
  }

  /** Re-run the last completed level's log headless; true = tick-perfect. */
  verifyLastReplay(): { ok: boolean; hash: number; tick: number } | null {
    return this.lastReplay ? verifyReplay(this.lastReplay) : null;
  }

  /** Verify the in-progress level's log right now (dev/QA; fails after a
   *  dev cheat, which mutates the sim outside the input stream — as it must). */
  verifyReplayNow(): { ok: boolean; hash: number; tick: number } {
    return verifyReplay(this.recorder.finish(this.sim));
  }

  /** Called once per sim tick by the scene. */
  tick(): void {
    const sim = this.sim;
    // drain run-level events
    for (const s of sim.scored) {
      const pr = this.run.players[s.player];
      if (pr && addScore(pr, s.amount).extraLife) {
        sim.fx.push({ t: "sfx", name: "extraLife" });
      }
    }
    for (const l of sim.lettersFound) {
      const pr = this.run.players[l.player];
      if (pr && collectLetter(pr, l.letter).completed) {
        sim.fx.push({ t: "burst", text: "YEE-HAW!", x: 480, y: 160, big: true });
        sim.fx.push({ t: "sfx", name: "yeehawComplete" });
      }
    }
    for (const l of sim.livesFound) {
      const pr = this.run.players[l.player];
      if (pr) pr.lives++;
    }
    if (sim.deaths.length > 0) {
      this.run.deathlessThisWorld = false;
      for (const d of sim.deaths) {
        const pr = this.run.players[d];
        if (pr) pr.lives = Math.max(0, pr.lives - 1);
      }
    }
    // shrine claimed: the sim already handed out the gift (loadouts are
    // shared objects) and lit the frenzies; hold it and show the card
    if (sim.shrineTaken) {
      const ev = sim.shrineTaken;
      sim.shrineTaken = null;
      this.held = true;
      this.onFlow({ kind: "acquired", gift: ev.gift, player: ev.player });
    }

    // flow transitions
    if (
      (sim.status === "cleared" || sim.status === "bossDead") &&
      sim.statusTicks <= 0 &&
      !this.clearedHandled
    ) {
      this.clearedHandled = true;
      this.lastReplay = this.recorder.finish(sim);
      saveLastReplay(this.lastReplay);
      this.advance();
    } else if (sim.status === "allDead" && !this.clearedHandled) {
      this.clearedHandled = true;
      this.lastReplay = this.recorder.finish(sim);
      saveLastReplay(this.lastReplay);
      if (this.run.continuesLeft > 0) this.onFlow({ kind: "continue" });
      else this.onFlow({ kind: "gameover", won: false });
    }
  }

  private advance(): void {
    const finishedBoss = isBossLevel(this.run.levelIndex);
    if (this.run.levelIndex >= 99) {
      this.onFlow({ kind: "victory" });
      return;
    }
    if (this.sim.secretEntered) {
      this.run.levelIndex += 2; // warp cellar skips one level
    } else {
      this.run.levelIndex += 1;
    }
    if (finishedBoss) {
      this.run.deathlessThisWorld = true;
      saveCheckpoint(this.run);
    }
    // deal cards
    const cards = this.run.players.map((pr) =>
      pr && pr.lives > 0 ? dealCards(this.run, pr) : null,
    );
    this.onFlow({ kind: "intermission", cards, picked: [null, null] });
  }

  /** Dismiss the shrine reveal: back into the level, frenzy already running. */
  resume(): void {
    this.held = false;
    this.onFlow({ kind: "playing", resume: true });
  }

  pickCard(player: number, card: Card): void {
    const pr = this.run.players[player];
    if (pr) applyCard(pr, card);
  }

  /** Re-deal a hand (reroll button). */
  dealFor(player: number): Card[] {
    const pr = this.run.players[player];
    return pr ? dealCards(this.run, pr) : [];
  }

  nextLevel(): void {
    // revive any zero-life partner at world boundaries with 1 life
    const world = worldForLevel(this.run.levelIndex);
    if (((this.run.levelIndex - 1) % 11) === 0) {
      for (const pr of this.run.players) {
        if (pr && pr.lives <= 0) pr.lives = 1;
      }
      void world;
    }
    this.sim = this.buildSim();
    this.onFlow({ kind: "playing" });
  }

  useContinue(): void {
    applyContinue(this.run);
    this.sim = this.buildSim();
    this.onFlow({ kind: "playing" });
  }
}

export function GameHost({ castIds, startLevel, seed, net, onExit }: GameHostProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const fxRef = useRef<FxOverlayHandle>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const [flow, setFlow] = useState<GameFlow>({ kind: "playing" });
  const [ready, setReady] = useState(false);
  const [baked, setBaked] = useState<Map<string, BakedCharacter> | null>(null);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  pausedRef.current = paused || flow.kind !== "playing";
  const [introKey, setIntroKey] = useState(0);
  // online session state
  const netSourceRef = useRef<NetworkInputSource | null>(null);
  const netSeq = useRef(0);
  const netPicksRef = useRef<(Card | null)[]>([null, null]);
  const [, bumpNetPicks] = useState(0);
  const [desyncTick, setDesyncTick] = useState<number | null>(null);
  /** fatal: the session cannot continue (desynced past repair, room gone) */
  const [partnerGone, setPartnerGone] = useState<string | null>(null);
  /** temporary: somebody dropped and we're holding the line */
  const [netTrouble, setNetTrouble] = useState<string | null>(null);
  const [stalled, setStalled] = useState(false);
  const [pingMs, setPingMs] = useState<number | null>(null);
  const reconnecting = useRef(false);

  const controller = useMemo(
    () => new RunController(castIds, startLevel, seed),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  // dev observability for headless QA
  (window as unknown as { __banjo?: unknown }).__banjo = controller;
  const solo = castIds.filter(Boolean).length < 2;
  // online: the local player gets the whole keyboard, whichever slot they are
  const sampler = useMemo(
    () => new InputSampler(net || solo ? SOLO_BINDINGS : DEFAULT_BINDINGS),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  /** Sim swaps (next level, continue) must bump the lockstep level sequence
   *  identically on both clients — always go through these. */
  const goNextLevel = () => {
    // reset picks on the way OUT: a fast partner's pick for the intermission
    // we're entering can arrive moments before our own flow flips
    netPicksRef.current = [null, null];
    controller.nextLevel();
    netSourceRef.current?.newLevel(++netSeq.current);
  };
  const doContinue = () => {
    netPicksRef.current = [null, null];
    controller.useContinue();
    netSourceRef.current?.newLevel(++netSeq.current);
  };

  // bake the cast once
  useEffect(() => {
    let cancelled = false;
    const names = castIds.filter(Boolean).map((id) => castById(id!).aachar);
    bakeCast(names).then((results) => {
      if (cancelled) return;
      const map = new Map<string, BakedCharacter>();
      results.forEach((b) => {
        if (b) map.set(b.name, b);
      });
      setBaked(map);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // mount phaser once baked
  useEffect(() => {
    if (!baked || !containerRef.current || gameRef.current) return;
    controller.onFlow = (f) => {
      setFlow(f);
      if (f.kind === "playing" && !f.resume) setIntroKey((k) => k + 1);
    };
    let source: InputSource;
    if (net) {
      const ns = new NetworkInputSource(net.client, sampler, net.myIdx, net.delay);
      ns.onDesync = (tick) => setDesyncTick(tick);
      netSourceRef.current = ns;
      // QA observability
      (window as unknown as { __banjoNet?: unknown }).__banjoNet = ns;
      (window as unknown as { __banjoClient?: unknown }).__banjoClient = net.client;
      source = ns;
    } else {
      source = new LocalInputSource(sampler);
    }
    const game = createPhaserGame(
      containerRef.current,
      {
        source,
        getSim: () => controller.sim,
        onFx: (events) => {
          audio.handleFx(events);
          fxRef.current?.handleFx(events, controller.sim);
          for (const e of events) {
            if (e.t === "shake") {
              const scene = game.scene.getScene("play") as Phaser.Scene | null;
              scene?.cameras.main.shake(120, 0.004 * e.power);
            }
          }
        },
        onTick: (inputs) => {
          controller.recordTick(inputs);
          // desync canary: exchange a full-state hash once a second
          const ns = netSourceRef.current;
          if (ns && controller.sim.tick > 0 && controller.sim.tick % 60 === 0) {
            ns.reportLocalHash(controller.sim.tick, hashSim(controller.sim));
          }
          controller.tick();
          audio.tickMusic(controller.sim);
        },
        paused: () => pausedRef.current || controller.held,
      },
      baked,
    );
    gameRef.current = game;
    setReady(true);
    setIntroKey(1);
    return () => {
      audio.stopMusic();
      game.destroy(true);
      gameRef.current = null;
      sampler.destroy();
      netSourceRef.current?.destroy();
      netSourceRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baked]);

  // online: remote card picks, host's continue, partner presence + recovery
  useEffect(() => {
    if (!net) return;
    let disposed = false;

    const resendMyPick = () => {
      const mine = netPicksRef.current[net.myIdx];
      if (mine) net.client.send({ t: "card", player: net.myIdx, card: mine });
    };

    const un = net.client.on((m) => {
      if (m.t === "card" && typeof m.player === "number" && m.player !== net.myIdx) {
        if (!netPicksRef.current[m.player]) {
          netPicksRef.current[m.player] = m.card as Card;
          controller.pickCard(m.player, m.card as Card);
          bumpNetPicks((v) => v + 1);
        }
      } else if (m.t === "continue") {
        doContinue();
      } else if (m.t === "peer" && m.event === "leave") {
        setNetTrouble("partner dropped — holdin' the line");
      } else if (m.t === "peer" && m.event === "join") {
        // they're back: refill both input directions, re-offer my card pick
        setNetTrouble(null);
        netSourceRef.current?.requestResume();
        resendMyPick();
      }
    });

    // my own socket dropped: quietly try to slip back into the same slot
    net.client.onClosed = () => {
      if (disposed || reconnecting.current) return;
      reconnecting.current = true;
      setNetTrouble("lost the connection — tryin' to get back");
      void (async () => {
        for (let i = 0; i < 10 && !disposed; i++) {
          await new Promise((r) => setTimeout(r, 1200 + i * 400));
          try {
            await net.client.reconnect();
            reconnecting.current = false;
            setNetTrouble(null);
            netSourceRef.current?.requestResume();
            resendMyPick();
            return;
          } catch {
            // room may still be there; keep knocking
          }
        }
        reconnecting.current = false;
        if (!disposed) setPartnerGone("couldn't get back to the room");
      })();
    };

    if (netSourceRef.current) {
      netSourceRef.current.onResumeDead = () =>
        setPartnerGone("y'all drifted apart — start a fresh room");
    }

    // stall indicator + ping readout
    const iv = setInterval(() => {
      setStalled((netSourceRef.current?.stalledMs() ?? 0) > 900);
    }, 400);
    const pingIv = setInterval(() => {
      void net.client.rtt(1).then((ms) => setPingMs(ms));
    }, 5000);

    return () => {
      disposed = true;
      clearInterval(iv);
      clearInterval(pingIv);
      un();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [net, ready]);

  // pause key + quickstart dev cheats (0 = clear level, 9 = frenzy, 8 = claim shrine)
  // cheats mutate the sim outside the input stream, so they are HARD OFF online
  useEffect(() => {
    const dev = new URLSearchParams(window.location.search).has("quickstart") && !net;
    const h = (e: KeyboardEvent) => {
      if (e.code === "Escape" && flow.kind === "playing") setPaused((p) => !p);
      if (!dev) return;
      const sim = controller.sim;
      if (e.code === "Digit0") {
        if (sim.boss) sim.boss.hp = 1;
        for (const en of sim.enemies) {
          if (en.phase.kind !== "dying") {
            en.phase = {
              kind: "dying",
              ticks: 0,
              targetX: en.x,
              targetY: en.y,
              chain: 1,
              toBoss: false,
            };
          }
        }
      } else if (e.code === "Digit9") {
        const p = sim.players[0];
        if (p && p.loadout.weapons.length > 0) {
          p.frenzy = {
            weapon: p.loadout.weapons[0].id,
            level: p.loadout.weapons[0].level,
            ticksLeft: 20 * 60,
          };
        }
      } else if (e.code === "Digit8") {
        const p = sim.players[0];
        if (p && sim.shrine && sim.shrine.taken < 0) takeShrine(sim, p, 0);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flow.kind, controller]);

  const anyPlayers = controller.run.players.some((p) => p !== null);
  if (!anyPlayers) return null;

  return (
    <div className="relative flex h-screen w-screen items-center justify-center bg-[#120d08]">
      <div className="relative" style={{ aspectRatio: "960/544", width: "min(100vw, calc(100vh * 960 / 544))" }}>
        <div ref={containerRef} className="absolute inset-0" />
        <FxOverlay ref={fxRef} />
        {ready && <HudOverlay controller={controller} />}
        {ready && (flow.kind === "playing" || flow.kind === "acquired") && (
          <LevelIntroOverlay key={introKey} controller={controller} />
        )}
        {flow.kind === "acquired" && (
          <WeaponAcquiredOverlay
            gift={flow.gift}
            player={flow.player}
            castId={controller.run.players[flow.player]?.castId ?? castIds.find(Boolean) ?? "earl"}
            coop={!solo}
            onDone={() => controller.resume()}
          />
        )}
        {flow.kind === "intermission" && (
          <IntermissionOverlay
            controller={controller}
            cards={flow.cards}
            solo={solo}
            net={
              net
                ? {
                    myIdx: net.myIdx,
                    remotePicked: netPicksRef.current.map((c) => c !== null),
                    onPick: (card) => {
                      netPicksRef.current[net.myIdx] = card;
                      net.client.send({ t: "card", player: net.myIdx, card });
                    },
                  }
                : undefined
            }
            onDone={goNextLevel}
          />
        )}
        {(flow.kind === "continue" || flow.kind === "gameover" || flow.kind === "victory") && (
          <GameOverOverlay
            flow={flow}
            controller={controller}
            waitForHost={!!net && net.myIdx !== 0}
            onContinue={() => {
              net?.client.send({ t: "continue" });
              doContinue();
            }}
            onExit={() =>
              onExit({ won: flow.kind === "victory", scores: controller.run.players.map((p) => p?.score ?? 0), level: controller.run.levelIndex })
            }
          />
        )}
        {desyncTick !== null && (
          <div className="absolute left-0 right-0 top-0 z-50 bg-[#B93A20] py-1 text-center font-pixel text-[9px] text-white">
            OUT OF SYNC AT TICK {desyncTick} — Y'ALL ARE PLAYIN' DIFFERENT GAMES. RESTART THE ROOM.
          </div>
        )}
        {net && pingMs !== null && (
          <div className="absolute bottom-1 right-2 z-40 font-pixel text-[7px] text-white/35">
            PING {pingMs}MS · DELAY {net.delay}
          </div>
        )}
        {net && stalled && !netTrouble && !partnerGone && flow.kind === "playing" && !paused && (
          <div className="absolute bottom-6 left-0 right-0 z-40 text-center font-pixel text-[9px] text-white/70">
            WAITIN' ON YER PARTNER...
          </div>
        )}
        {netTrouble && !partnerGone && (
          <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black/75">
            <div className="font-display text-3xl uppercase text-[#E8B928]" style={{ textShadow: "3px 3px 0 #000" }}>
              Hold yer horses
            </div>
            <div className="font-pixel text-[9px] text-white/70">{netTrouble.toUpperCase()}...</div>
            <button
              className="font-pixel text-[9px] text-white/40 hover:text-white"
              onClick={() =>
                onExit({ won: false, scores: controller.run.players.map((p) => p?.score ?? 0), level: controller.run.levelIndex })
              }
            >
              GIVE UP AND HEAD HOME
            </button>
          </div>
        )}
        {partnerGone && flow.kind !== "gameover" && flow.kind !== "victory" && (
          <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black/85">
            <div className="font-display text-4xl uppercase text-[#E8B928]" style={{ textShadow: "3px 3px 0 #000" }}>
              Partner's gone
            </div>
            <div className="font-pixel text-[9px] text-white/60">{partnerGone.toUpperCase()}</div>
            <button
              className="border-2 border-[#E8B928] px-6 py-2 font-display text-xl uppercase text-[#E8B928] hover:bg-[#E8B928] hover:text-black"
              onClick={() =>
                onExit({ won: false, scores: controller.run.players.map((p) => p?.score ?? 0), level: controller.run.levelIndex })
              }
            >
              Back to the Title
            </button>
          </div>
        )}
        {paused && flow.kind === "playing" && (
          <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-4 bg-black/70">
            <div className="font-display text-5xl uppercase text-[#E8B928]" style={{ textShadow: "3px 3px 0 #000" }}>
              Paused
            </div>
            <div className="text-xs text-[#a99b7c]">ESC to keep pickin'</div>
            <button
              className="border-2 border-[#E8B928] px-4 py-1 font-display text-lg uppercase text-[#E8B928] hover:bg-[#E8B928] hover:text-black"
              onClick={() =>
                onExit({ won: false, scores: controller.run.players.map((p) => p?.score ?? 0), level: controller.run.levelIndex })
              }
            >
              Quit to Title
            </button>
          </div>
        )}
        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-[#a99b7c]">
            stokin' the still...
          </div>
        )}
      </div>
    </div>
  );
}
