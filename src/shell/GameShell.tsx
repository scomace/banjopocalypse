// The menu flow state machine. ?quickstart=1&cast=earl&level=1&seed=N jumps
// straight into a run for automated QA.

import { useEffect, useState } from "react";
import { GameHost } from "../game/GameHost";
import { markVictory } from "../game/core/save";
import type { NetSession } from "../game/net/client";
import { menuInput } from "./menuInput";
import { OnlineScreen } from "./OnlineScreen";
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
  | { screen: "game"; castIds: (string | null)[]; startLevel: number; seed: number; net?: NetSession }
  | { screen: "online"; initialCode?: string; auto?: "host" | "join" | null; autoCast?: string }
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

/** ?room=CODE deep links into the join flow; ?online=host|join is the QA
 *  autopilot that drives the lobby hands-free. */
function onlineState(): ShellState | null {
  const q = new URLSearchParams(window.location.search);
  const auto = q.get("online");
  if (auto === "host" || auto === "join") {
    return {
      screen: "online",
      auto,
      initialCode: q.get("room") ?? undefined,
      autoCast: q.get("cast") ?? undefined,
    };
  }
  if (q.get("room")) return { screen: "online", initialCode: q.get("room")! };
  return null;
}

export function GameShell() {
  const [state, setState] = useState<ShellState>(
    () => quickstartState() ?? onlineState() ?? { screen: "title" },
  );
  // keyboard + pad + remote -> menu actions, for every screen and overlay
  useEffect(() => {
    menuInput.start();
    return () => menuInput.stop();
  }, []);

  switch (state.screen) {
    case "game":
      return (
        <GameHost
          castIds={state.castIds}
          startLevel={state.startLevel}
          seed={state.seed}
          net={state.net}
          onExit={({ won, scores, level }) => {
            state.net?.client.close();
            if (won) markVictory(false);
            const best = Math.max(...scores, 0);
            const bestIdx = scores.indexOf(best);
            const castId = state.castIds[bestIdx] ?? state.castIds[0] ?? "earl";
            if (best > 0) {
              setState({
                screen: "initials",
                score: best,
                castId,
                // the level the run REACHED, not where it started
                level,
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
    case "online":
      return (
        <OnlineScreen
          initialCode={state.initialCode}
          auto={state.auto}
          autoCast={state.autoCast}
          onStart={(net, seed) =>
            setState({ screen: "game", castIds: net.castIds, startLevel: 1, seed, net })
          }
          onBack={() => setState({ screen: "title" })}
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
          onOnline={() => setState({ screen: "online" })}
          onScores={() => setState({ screen: "scores" })}
          onSettings={() => setState({ screen: "settings" })}
        />
      );
  }
}
