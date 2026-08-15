// GameHost: React owner of a running campaign. Bakes the cast, owns the
// RunController (plain TS: RunState + current Sim + level flow), mounts the
// Phaser view, renders DOM overlays (HUD, intermission cards, game over).
// React state changes only on flow transitions, never per-frame.

import { useEffect, useMemo, useRef, useState } from "react";
import type Phaser from "phaser";
import { bakeCast, type BakedCharacter } from "../aachar/baker";
import { castById } from "./cast";
import { DEFAULT_BINDINGS, InputSampler, SOLO_BINDINGS } from "./core/input";
import { getLevelDef } from "./levels";
import { isBossLevel, worldForLevel } from "./levels/worlds";
import { deriveSeed } from "./core/rng";
import { createSim, type SimConfig } from "./sim/sim";
import type { FxEvent, Sim } from "./sim/types";
import { LEVEL_CLEAR_TICKS } from "./sim/constants";
import {
  addScore,
  applyCard,
  applyContinue,
  collectLetter,
  dealCards,
  newRun,
  type Card,
  type RunState,
} from "./run/run";
import { createPhaserGame } from "./render/PlayScene";
import { audio } from "./audio/engine";
import { HudOverlay } from "./ui/HudOverlay";
import { IntermissionOverlay } from "./ui/IntermissionOverlay";
import { GameOverOverlay } from "./ui/GameOverOverlay";
import { LevelIntroOverlay } from "./ui/LevelIntroOverlay";
import { FxOverlay, type FxOverlayHandle } from "./fx/FxOverlay";
import { saveCheckpoint } from "./core/save";

export type GameFlow =
  | { kind: "playing" }
  | { kind: "intermission"; cards: (Card[] | null)[]; picked: (Card | null)[] }
  | { kind: "continue" }
  | { kind: "gameover"; won: boolean }
  | { kind: "victory" };

export type GameHostProps = {
  castIds: (string | null)[];
  startLevel: number;
  seed: number;
  onExit: (result: { won: boolean; scores: number[]; level: number }) => void;
};

class RunController {
  run: RunState;
  sim: Sim;
  onFlow: (flow: GameFlow) => void = () => {};
  fxSink: (events: FxEvent[]) => void = () => {};
  private clearedHandled = false;

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
          ? { castId: pr.castId, loadout: pr.loadout, livesLeft: pr.lives }
          : null,
      ),
      deathless: this.run.deathlessThisWorld,
    };
    this.clearedHandled = false;
    return createSim(cfg);
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

    // flow transitions
    if (
      (sim.status === "cleared" || sim.status === "bossDead") &&
      sim.statusTicks <= 0 &&
      !this.clearedHandled
    ) {
      this.clearedHandled = true;
      this.advance();
    } else if (sim.status === "allDead" && !this.clearedHandled) {
      this.clearedHandled = true;
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

export function GameHost({ castIds, startLevel, seed, onExit }: GameHostProps) {
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

  const controller = useMemo(
    () => new RunController(castIds, startLevel, seed),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  // dev observability for headless QA
  (window as unknown as { __banjo?: unknown }).__banjo = controller;
  const solo = castIds.filter(Boolean).length < 2;
  const sampler = useMemo(
    () => new InputSampler(solo ? SOLO_BINDINGS : DEFAULT_BINDINGS),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

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
      if (f.kind === "playing") setIntroKey((k) => k + 1);
    };
    const game = createPhaserGame(
      containerRef.current,
      {
        sampler,
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
        onTick: () => {
          controller.tick();
          audio.tickMusic(controller.sim);
        },
        paused: () => pausedRef.current,
      },
      baked,
    );
    gameRef.current = game;
    setReady(true);
    setIntroKey(1);
    return () => {
      game.destroy(true);
      gameRef.current = null;
      sampler.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baked]);

  // pause key + quickstart dev cheats (0 = clear level, 9 = frenzy, 8 = jar)
  useEffect(() => {
    const dev = new URLSearchParams(window.location.search).has("quickstart");
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
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [flow.kind, controller]);

  const anyPlayers = controller.run.players.some((p) => p !== null);
  if (!anyPlayers) return null;

  return (
    <div className="relative flex h-screen w-screen items-center justify-center bg-[#120d08]">
      <div className="relative" style={{ aspectRatio: "960/544", width: "min(100vw, calc(100vh * 960 / 544))" }}>
        <div ref={containerRef} className="absolute inset-0" />
        <FxOverlay ref={fxRef} />
        {ready && <HudOverlay controller={controller} />}
        {ready && flow.kind === "playing" && (
          <LevelIntroOverlay key={introKey} controller={controller} />
        )}
        {flow.kind === "intermission" && (
          <IntermissionOverlay
            controller={controller}
            cards={flow.cards}
            solo={solo}
            onDone={() => controller.nextLevel()}
          />
        )}
        {(flow.kind === "continue" || flow.kind === "gameover" || flow.kind === "victory") && (
          <GameOverOverlay
            flow={flow}
            controller={controller}
            onContinue={() => controller.useContinue()}
            onExit={() =>
              onExit({ won: flow.kind === "victory", scores: controller.run.players.map((p) => p?.score ?? 0), level: controller.run.levelIndex })
            }
          />
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
