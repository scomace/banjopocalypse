// The menu flow state machine. ?quickstart=1&cast=earl&level=1&seed=N jumps
// straight into a run for automated QA.

import { useState } from "react";
import { GameHost } from "../game/GameHost";
import { markVictory } from "../game/core/save";
import {
  InitialsScreen,
  ScoresScreen,
  SelectScreen,
  SettingsScreen,
  TitleScreen,
  WorldSelectScreen,
} from "./screens";

type ShellState =
  | { screen: "title" }
  | { screen: "select" }
  | { screen: "world"; castIds: (string | null)[] }
  | { screen: "game"; castIds: (string | null)[]; startLevel: number; seed: number }
  | { screen: "initials"; score: number; castId: string; level: number }
  | { screen: "scores" }
  | { screen: "settings" };

function quickstartState(): ShellState | null {
  const q = new URLSearchParams(window.location.search);
  if (!q.has("quickstart")) return null;
  return {
    screen: "game",
    castIds: [q.get("cast") ?? "earl", q.get("cast2")],
    startLevel: Math.max(1, Math.min(99, Number(q.get("level") ?? "1"))),
    seed: Number(q.get("seed") ?? "12345"),
  };
}

export function GameShell() {
  const [state, setState] = useState<ShellState>(
    () => quickstartState() ?? { screen: "title" },
  );
  const [lastRun, setLastRun] = useState<{ castIds: (string | null)[]; level: number }>({
    castIds: ["earl", null],
    level: 1,
  });

  switch (state.screen) {
    case "game":
      return (
        <GameHost
          castIds={state.castIds}
          startLevel={state.startLevel}
          seed={state.seed}
          onExit={({ won, scores }) => {
            if (won) markVictory(false);
            const best = Math.max(...scores, 0);
            const bestIdx = scores.indexOf(best);
            const castId = state.castIds[bestIdx] ?? state.castIds[0] ?? "earl";
            if (best > 0) {
              setState({
                screen: "initials",
                score: best,
                castId,
                level: lastRun.level,
              });
            } else {
              setState({ screen: "title" });
            }
          }}
        />
      );
    case "initials":
      return (
        <InitialsScreen
          score={state.score}
          castId={state.castId}
          level={state.level}
          onDone={() => setState({ screen: "scores" })}
        />
      );
    case "select":
      return (
        <SelectScreen
          onStart={(castIds) => setState({ screen: "world", castIds })}
          onBack={() => setState({ screen: "title" })}
        />
      );
    case "world":
      return (
        <WorldSelectScreen
          onPick={(startLevel) => {
            setLastRun({ castIds: state.castIds, level: startLevel });
            setState({
              screen: "game",
              castIds: state.castIds,
              startLevel,
              seed: (Math.random() * 0xffffffff) >>> 0,
            });
          }}
          onBack={() => setState({ screen: "select" })}
        />
      );
    case "scores":
      return <ScoresScreen onBack={() => setState({ screen: "title" })} />;
    case "settings":
      return <SettingsScreen onBack={() => setState({ screen: "title" })} />;
    default:
      return (
        <TitleScreen
          onPlay={() => setState({ screen: "select" })}
          onScores={() => setState({ screen: "scores" })}
          onSettings={() => setState({ screen: "settings" })}
        />
      );
  }
}
