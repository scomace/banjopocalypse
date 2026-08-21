// Menu screens: title, character select (live aachar DOM rigs, the pretty
// path), world checkpoint select, leaderboards, settings, initials entry.
// Every screen is driven by useMenuNav (keyboard, gamepad, TV remote, mouse
// all agree on one cursor) and carries a hint bar naming the live buttons.

import { Fragment, useEffect, useMemo, useState } from "react";
import { AaSceneCharacter } from "@/lib/aachar/AaSceneCharacter";
import { CAST, castById, castUnlocked, type CastMember } from "../game/cast";
import {
  addScoreEntry,
  loadLastInitials,
  loadSave,
  loadScores,
  loadSettings,
  writeSettings,
  type Settings,
} from "../game/core/save";
import { audio } from "../game/audio/engine";
import { WORLDS, levelInWorld, worldForLevel } from "../game/levels/worlds";
import { LetterEntry } from "./LetterEntry";
import { HintBar, useDevice } from "./MenuChrome";
import { menuInput } from "./menuInput";
import { menuSfx, useMenuNav, type ItemBind } from "./useMenuNav";

const P_COLORS = ["#9be8c8", "#f0c880"];

export function Marquee({ size = "text-7xl" }: { size?: string }) {
  return (
    <h1
      className={`font-display ${size} uppercase`}
      style={{
        color: "#E8B928",
        textShadow: "3px 3px 0 #000, 6px 6px 0 #B93A20, 9px 9px 0 #000",
        transform: "rotate(-2deg)",
      }}
    >
      Banjopocalypse
    </h1>
  );
}

export function Heading({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-display text-4xl uppercase text-[#E8B928]" style={{ textShadow: "3px 3px 0 #000" }}>
      {children}
    </div>
  );
}

/** A menu button. With `bind` (from useMenuNav) it joins the cursor: hover
 *  focuses, click accepts through the nav, pad/keys land on it. Without, it's
 *  a plain click target (kept for one-off dialogs). */
export function MenuButton({
  children,
  onClick,
  subtle,
  bind,
  className = "",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  subtle?: boolean;
  bind?: ItemBind;
  className?: string;
}) {
  const look = subtle
    ? "menu-item border-2 border-transparent px-3 py-1 font-pixel text-[9px] text-white/40 hover:text-white data-[focused=true]:text-white"
    : "menu-item border-2 border-[#E8B928] px-8 py-2 font-display text-2xl uppercase text-[#E8B928] transition-colors hover:bg-[#E8B928] hover:text-black data-[focused=true]:bg-[#E8B928] data-[focused=true]:text-black";
  if (bind) {
    return (
      <button className={`${look} ${className}`} {...bind}>
        {children}
      </button>
    );
  }
  return (
    <button
      className={`${look} ${className}`}
      onClick={() => {
        audio.ensure();
        menuSfx("accept");
        onClick?.();
      }}
    >
      {children}
    </button>
  );
}

// ------------------------------------------------------------------ title

export function TitleScreen({
  onPlay,
  onOnline,
  onScores,
  onSettings,
}: {
  onPlay: () => void;
  onOnline: () => void;
  onScores: () => void;
  onSettings: () => void;
}) {
  const items = useMemo(
    () => [
      { label: "Play", fn: onPlay },
      { label: "Play Online", fn: onOnline },
      { label: "HIGH SCORES", fn: onScores, subtle: true },
      { label: "SETTINGS", fn: onSettings, subtle: true },
    ],
    [onPlay, onOnline, onScores, onSettings],
  );
  const nav = useMenuNav({
    count: items.length,
    onAccept: (i) => items[i].fn(),
    onStart: onPlay,
    // the two subtle items sit side by side: left/right hops between them
    onHorizontal: (i) => {
      if (i >= 2) {
        nav.setFocus(i === 2 ? 3 : 2);
        menuSfx("move");
        return true;
      }
    },
  });
  const device = useDevice();
  return (
    <div className="relative flex h-screen flex-col items-center justify-center gap-5">
      <Marquee />
      <p className="font-pixel text-[10px] text-white/60">A MOONSHINE-BELCHIN' HOOTENANNY</p>
      <div className="mt-4 flex flex-col items-center gap-3">
        <MenuButton bind={nav.bind(0)}>Play</MenuButton>
        <MenuButton bind={nav.bind(1)}>Play Online</MenuButton>
        <div className="flex gap-6">
          <MenuButton subtle bind={nav.bind(2)}>
            HIGH SCORES
          </MenuButton>
          <MenuButton subtle bind={nav.bind(3)}>
            SETTINGS
          </MenuButton>
        </div>
      </div>
      <p className="absolute bottom-10 font-pixel text-[8px] text-white/30">
        {device === "pad"
          ? "PAD: STICK MOVES · A JUMPS (AGAIN MIDAIR FOR YER SPECIAL) · X/B BLOWS · START PAUSES"
          : "P1: WASD + F/G · P2: ARROWS + K/L · JUMP AGAIN MIDAIR FOR YER SPECIAL · GAMEPADS WELCOME · ESC PAUSES"}
      </p>
      <HintBar
        hints={[
          { action: "move", label: "MOVE" },
          { action: "accept", label: "PICK" },
        ]}
      />
    </div>
  );
}

// ------------------------------------------------------------ char select

export function CastCard({
  member,
  locked,
  rescued,
  selected,
  cursors = [],
  bind,
  onPick,
}: {
  member: CastMember;
  locked: boolean;
  /** busted out of their cage on this save (earns a tag) */
  rescued?: boolean;
  selected: number[]; // player indexes that picked this
  /** player indexes whose cursor is parked here */
  cursors?: number[];
  /** hover/ref wiring from the owning nav (no click; the card's onPick handles that) */
  bind?: Pick<ItemBind, "ref" | "onMouseEnter">;
  onPick: () => void;
}) {
  const cursorColor = cursors.length ? P_COLORS[cursors[0]] : null;
  return (
    <button
      ref={bind?.ref}
      onMouseEnter={bind?.onMouseEnter}
      data-focused={cursors.length > 0}
      className="menu-item no-caret relative flex w-40 flex-col items-center border-2 p-2 text-center"
      style={{
        borderColor: cursorColor ?? (selected.length ? P_COLORS[selected[0]] : locked ? "#332a1a" : "#5a4a30"),
        background: "rgba(0,0,0,0.45)",
        transform: selected.length ? "scale(1.05)" : undefined,
        opacity: locked ? 0.55 : 1,
        boxShadow: cursorColor ? `4px 4px 0 #000, 0 0 0 2px ${cursorColor} inset` : undefined,
      }}
      onClick={onPick}
      tabIndex={-1}
    >
      <div style={{ height: 120, filter: locked ? "brightness(0.2)" : "none" }} className="flex items-end">
        <AaSceneCharacter aachar={{ name: member.aachar }} animation={selected.length ? "greeting1" : "idle"} size={0.55} />
      </div>
      <div className="mt-1 font-display text-lg uppercase leading-none text-white">
        {member.displayName}
      </div>
      {locked && member.rescue ? (
        <>
          <div className="mt-1 font-pixel text-[7px] leading-relaxed text-[#ffd84a]">
            CAGED · WORLD {member.rescue.world} · LEVEL {member.rescue.level}
          </div>
          <div className="mt-1 min-h-8 font-pixel text-[6px] leading-relaxed text-white/45">
            {member.rescue.where}
          </div>
        </>
      ) : (
        <div className="mt-1 h-8 font-pixel text-[7px] leading-relaxed text-white/55">
          {member.bio}
        </div>
      )}
      {rescued && !locked && (
        <div
          className="absolute right-1 top-1 border px-1 font-pixel text-[6px] leading-relaxed"
          style={{ borderColor: "#9be8c8", color: "#9be8c8", background: "rgba(0,0,0,0.6)" }}
        >
          RESCUED
        </div>
      )}
      {!locked && (
        <div className="mt-1 font-pixel text-[7px] text-[#ffd84a]">
          SPD{member.speed} PUF{member.puff} JMP{member.jump} LCK{member.luck}
        </div>
      )}
      {!locked && member.perkLabel && (
        <div className="mt-1 font-pixel text-[7px] text-[#9be8c8]">
          {member.perkLabel}
        </div>
      )}
      {selected.map((pi) => (
        <div
          key={pi}
          className="absolute -top-3 font-pixel text-[9px]"
          style={{ color: P_COLORS[pi], left: pi === 0 ? 4 : undefined, right: pi === 1 ? 4 : undefined }}
        >
          P{pi + 1}
        </div>
      ))}
      {cursors.map((pi) => (
        <div
          key={`c${pi}`}
          className="absolute -bottom-3 border px-1 font-pixel text-[7px] leading-relaxed"
          style={{
            color: "#000",
            background: P_COLORS[pi],
            borderColor: P_COLORS[pi],
            left: pi === 0 ? 4 : undefined,
            right: pi === 1 ? 4 : undefined,
          }}
        >
          P{pi + 1}
        </div>
      ))}
    </button>
  );
}

/** P2 joins with their own keys (K / L) or any button on the second pad -
 *  not the arrows, which drive P1's cursor while they're playing solo. */
function isP2JoinPress(e: { player: number; device: string; code: string }): boolean {
  return e.player === 1 && (e.device === "pad" || e.code === "KeyK" || e.code === "KeyL");
}

export function SelectScreen({
  onStart,
  onBack,
}: {
  onStart: (castIds: (string | null)[]) => void;
  onBack: () => void;
}) {
  const save = useMemo(loadSave, []);
  const [picks, setPicks] = useState<(string | null)[]>([null, null]);
  const [p2Active, setP2Active] = useState(false);
  const device = useDevice();
  const unlocked = (m: CastMember) => castUnlocked(m, save);

  const go = () => onStart(p2Active && picks[1] ? picks : [picks[0], null]);

  const pickFor = (pi: 0 | 1, member: CastMember) => {
    if (!unlocked(member)) {
      menuSfx("nope");
      return;
    }
    if (picks[pi]) return;
    if (pi === 1 && picks[0] === member.id) {
      menuSfx("nope");
      return;
    }
    setPicks((p) => p.map((v, i) => (i === pi ? member.id : v)));
    audio.playSfx("letter", 1 + pi * 0.2);
  };

  // P1 cursor: WASD + Enter/Esc + pad 1, plus the arrow cluster until P2 joins
  const nav1 = useMenuNav({
    count: CAST.length,
    cols: 4,
    player: "any",
    filter: (e) => (p2Active ? e.player !== 1 : !isP2JoinPress(e)),
    sfx: false,
    onMove: () => menuSfx("move"),
    onAccept: (i, e) => {
      if (picks[0]) {
        // locked in: accept again is LET'S GO. While P2 is still picking,
        // P1's own button just waits; the shared keys (Enter / click) can
        // still ride solo, as the status line says.
        if (p2Active && !picks[1] && e.player !== -1) {
          menuSfx("tick");
          return;
        }
        menuSfx("accept");
        go();
      } else {
        pickFor(0, CAST[i]);
      }
    },
    onStart: () => {
      if (picks[0]) {
        menuSfx("accept");
        go();
      }
    },
    onBack: () => {
      if (picks[0]) setPicks((p) => [null, p[1]]);
      else onBack();
    },
  });

  // P2 cursor: arrows + K/L + pad 2, strictly theirs
  const nav2 = useMenuNav({
    count: CAST.length,
    cols: 4,
    player: 1,
    strict: true,
    enabled: p2Active,
    sfx: false,
    onMove: () => menuSfx("move"),
    onAccept: (i) => {
      if (picks[1]) {
        if (picks[0]) {
          menuSfx("accept");
          go();
        } else menuSfx("tick");
      } else pickFor(1, CAST[i]);
    },
    onStart: () => {
      if (picks[0] && picks[1]) {
        menuSfx("accept");
        go();
      }
    },
    onBack: () => {
      if (picks[1]) setPicks((p) => [p[0], null]);
      else {
        setP2Active(false);
        menuSfx("back");
      }
    },
  });

  // P2 join: their own keys or any button on the second pad
  useEffect(() => {
    if (p2Active) return;
    return menuInput.subscribe((e) => {
      if (e.action === "any" && isP2JoinPress(e)) {
        setP2Active(true);
        menuSfx("accept");
      }
    });
  }, [p2Active]);

  const ready = !!picks[0] && (!p2Active || !!picks[1]);
  const status = !picks[0]
    ? `P1: PICK A COUSIN${p2Active ? " · P2: PICK YERS TOO" : device === "pad" ? " · P2: ANY BUTTON ON PAD 2 TO JOIN" : " · P2: PRESS K TO JOIN"}`
    : p2Active && !picks[1]
      ? "P2: YOUR TURN (P1 CAN STILL RIDE SOLO WITH ENTER)"
      : p2Active
        ? "BOTH LOCKED IN"
        : device === "pad"
          ? "LOCKED IN · P2: ANY BUTTON ON PAD 2 TO JOIN"
          : "LOCKED IN · P2: PRESS K TO JOIN";

  return (
    <div className="relative flex h-screen flex-col items-center justify-center gap-4 overflow-auto py-6">
      <Heading>Pick yer kinfolk</Heading>
      <div className="font-pixel text-[9px] text-white/50">{status}</div>
      <div className="grid max-w-4xl grid-cols-4 gap-3 pb-2">
        {CAST.map((m, i) => {
          const cursors: number[] = [];
          if (!picks[0] && nav1.focus === i) cursors.push(0);
          if (p2Active && !picks[1] && nav2.focus === i) cursors.push(1);
          return (
            <CastCard
              key={m.id}
              member={m}
              locked={!unlocked(m)}
              rescued={save.castRescued.includes(m.id)}
              selected={picks.map((p, pi) => (p === m.id ? pi : -1)).filter((pi) => pi >= 0)}
              cursors={cursors}
              bind={nav1.bind(i)}
              onPick={() => {
                // mouse: P1 picks first, then P2 (if they joined), then it's LET'S GO
                if (!picks[0]) pickFor(0, m);
                else if (p2Active && !picks[1]) pickFor(1, m);
              }}
            />
          );
        })}
      </div>
      <div className="flex items-center gap-4">
        <button
          className="menu-item no-caret border-2 px-8 py-2 font-display text-2xl uppercase transition-colors"
          data-focused={ready}
          style={{
            borderColor: ready ? "#E8B928" : "#3a3020",
            color: ready ? "#000" : "#5a4a30",
            background: ready ? "#E8B928" : "rgba(0,0,0,0.4)",
          }}
          disabled={!ready}
          tabIndex={-1}
          onClick={() => {
            menuSfx("accept");
            go();
          }}
        >
          {ready ? "▸ Let's Go" : "Let's Go"}
        </button>
        <MenuButton
          subtle
          onClick={() => {
            if (picks[0]) setPicks([null, picks[1]]);
            else onBack();
          }}
        >
          BACK
        </MenuButton>
      </div>
      <HintBar
        hints={[
          { action: "move", label: "MOVE" },
          { action: "accept", label: ready ? "LET'S GO" : picks[0] ? "WAIT FOR P2" : "PICK" },
          { action: "back", label: picks[0] ? "UNPICK" : "BACK" },
          p2Active
            ? { action: "p2keys", label: "P2 PICKS" }
            : device === "pad"
              ? { action: "pad2", label: "P2 JOIN" }
              : { action: "p2keys", label: "P2 JOIN" },
        ]}
      />
    </div>
  );
}

// ------------------------------------------------------------ world select

export function WorldSelectScreen({
  onPick,
  onBack,
}: {
  onPick: (startLevel: number) => void;
  onBack: () => void;
}) {
  const save = useMemo(loadSave, []);
  const nav = useMenuNav({
    count: WORLDS.length,
    cols: 3,
    // the checkpoint you earned is the likely pick
    initial: Math.max(0, Math.min(WORLDS.length - 1, save.worldsUnlocked - 1)),
    sfx: false,
    onMove: () => menuSfx("move"),
    onAccept: (i) => {
      const w = WORLDS[i];
      if (w.index > save.worldsUnlocked) {
        menuSfx("nope");
        return;
      }
      menuSfx("accept");
      onPick((w.index - 1) * 11 + 1);
    },
    onBack: () => {
      menuSfx("back");
      onBack();
    },
  });
  return (
    <div className="relative flex h-screen flex-col items-center justify-center gap-4">
      <Heading>Where we startin'?</Heading>
      <div className="grid max-w-3xl grid-cols-3 gap-3">
        {WORLDS.map((w, i) => {
          const locked = w.index > save.worldsUnlocked;
          return (
            <button
              key={w.index}
              {...nav.bind(i)}
              className="menu-item no-caret border-2 p-3 text-left"
              style={{
                borderColor: locked ? "#2a2216" : `#${w.palette.glow.toString(16).padStart(6, "0")}`,
                background: "rgba(0,0,0,0.5)",
                opacity: locked ? 0.4 : 1,
              }}
            >
              <div className="font-pixel text-[8px] text-white/50">WORLD {w.index}</div>
              <div className="font-display text-xl uppercase leading-tight text-white">
                {locked ? "????" : w.name}
              </div>
              <div className="mt-1 font-pixel text-[7px] text-white/45">
                {locked ? "BEAT THE PRIOR BOSS" : `LEVELS ${(w.index - 1) * 11 + 1}-${w.index * 11} · ${w.subtitle}`}
              </div>
            </button>
          );
        })}
      </div>
      <MenuButton subtle onClick={onBack}>
        BACK
      </MenuButton>
      <HintBar
        hints={[
          { action: "move", label: "MOVE" },
          { action: "accept", label: "START HERE" },
          { action: "back", label: "BACK" },
        ]}
      />
    </div>
  );
}

// ------------------------------------------------------------ leaderboards

export function ScoresScreen({ onBack }: { onBack: () => void }) {
  const scores = useMemo(loadScores, []);
  const nav = useMenuNav({ count: 1, onAccept: onBack, onBack });
  return (
    <div className="relative flex h-screen flex-col items-center justify-center gap-4">
      <Heading>Holler Heroes</Heading>
      <div className="w-96 border-2 border-[#5a4a30] bg-black/50 p-4">
        {scores.length === 0 && (
          <div className="text-center font-pixel text-[9px] text-white/40">
            NO SCORES YET. GIT PICKIN'.
          </div>
        )}
        {scores.length > 0 && (
          <div className="grid grid-cols-[1.75rem_3rem_1fr_3rem_4.5rem] items-center gap-x-2 gap-y-2 font-pixel text-[10px]">
            {scores.map((s, i) => (
              <Fragment key={i}>
                <span className="text-white/50">{i + 1}.</span>
                <span className="text-[#ffd84a]">{s.initials}</span>
                <span className="truncate text-white/70">
                  {castById(s.cast).displayName.toUpperCase()}
                </span>
                <span className="text-white/50">
                  {worldForLevel(s.level).index}-{levelInWorld(s.level)}
                </span>
                <span className="text-right text-white">{s.score.toLocaleString()}</span>
              </Fragment>
            ))}
          </div>
        )}
      </div>
      <MenuButton subtle bind={nav.bind(0)}>
        BACK
      </MenuButton>
      <HintBar hints={[{ action: "back", label: "BACK" }]} />
    </div>
  );
}

// ------------------------------------------------------------ settings

type SettingRow =
  | { key: "musicVolume" | "sfxVolume"; label: string; kind: "slider" }
  | { key: "screenShake" | "reducedFlash"; label: string; kind: "toggle" }
  | { key: "back"; label: string; kind: "back" };

const SETTING_ROWS: SettingRow[] = [
  { key: "musicVolume", label: "MUSIC", kind: "slider" },
  { key: "sfxVolume", label: "SOUNDS", kind: "slider" },
  { key: "screenShake", label: "SCREEN SHAKE", kind: "toggle" },
  { key: "reducedFlash", label: "REDUCED FLASH", kind: "toggle" },
  { key: "back", label: "BACK", kind: "back" },
];
const SLIDER_STEPS = 20;

export function SettingsScreen({ onBack }: { onBack: () => void }) {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const update = (patch: Partial<Settings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    writeSettings(next);
    audio.setVolumes(next.musicVolume, next.sfxVolume);
  };
  const nudge = (key: "musicVolume" | "sfxVolume", dir: number) => {
    const v = Math.max(0, Math.min(1, Math.round((settings[key] + dir / SLIDER_STEPS) * SLIDER_STEPS) / SLIDER_STEPS));
    update({ [key]: v });
    if (key === "sfxVolume") audio.playSfx("pop", 1);
    else menuSfx("tick");
  };
  const flip = (key: "screenShake" | "reducedFlash") => {
    update({ [key]: !settings[key] });
    menuSfx("accept");
  };
  const nav = useMenuNav({
    count: SETTING_ROWS.length,
    sfx: false,
    onMove: () => menuSfx("move"),
    onHorizontal: (i, dir) => {
      const row = SETTING_ROWS[i];
      if (row.kind === "slider") nudge(row.key, dir);
      else if (row.kind === "toggle") flip(row.key);
      return true;
    },
    onAccept: (i) => {
      const row = SETTING_ROWS[i];
      if (row.kind === "toggle") flip(row.key);
      else if (row.kind === "back") {
        menuSfx("back");
        onBack();
      } else menuSfx("tick"); // sliders: left/right does the work
    },
    onBack: () => {
      menuSfx("back");
      onBack();
    },
  });

  return (
    <div className="relative flex h-screen flex-col items-center justify-center gap-5">
      <Heading>Fixin's</Heading>
      <div className="flex w-[22rem] flex-col gap-2 border-2 border-[#5a4a30] bg-black/50 p-4">
        {SETTING_ROWS.map((row, i) => {
          const focused = nav.focus === i;
          const b = nav.bind(i);
          if (row.kind === "back") {
            return (
              <div key={row.key} className="mt-2 flex justify-center">
                <MenuButton subtle bind={b}>
                  BACK
                </MenuButton>
              </div>
            );
          }
          return (
            <div
              key={row.key}
              ref={b.ref}
              onMouseEnter={b.onMouseEnter}
              data-focused={focused}
              className="menu-item flex items-center justify-between gap-3 border-2 border-transparent px-2 py-1 font-pixel text-[9px]"
              style={{ color: focused ? "#fff" : "rgba(255,255,255,0.7)", background: focused ? "rgba(255,255,255,0.05)" : undefined }}
            >
              <span>{row.label}</span>
              {row.kind === "slider" ? (
                <span className="flex items-center gap-1">
                  <button className="px-1 text-white/50 hover:text-white" tabIndex={-1} onClick={() => { nav.setFocus(i); nudge(row.key, -1); }}>
                    ◀
                  </button>
                  <span className="flex gap-[2px]">
                    {Array.from({ length: SLIDER_STEPS }, (_, k) => (
                      <button
                        key={k}
                        tabIndex={-1}
                        className="h-3 w-[6px]"
                        style={{
                          background:
                            k < Math.round(settings[row.key] * SLIDER_STEPS)
                              ? focused
                                ? "#E8B928"
                                : "#b89a3a"
                              : "rgba(255,255,255,0.12)",
                        }}
                        onClick={() => {
                          nav.setFocus(i);
                          update({ [row.key]: (k + 1) / SLIDER_STEPS });
                          if (row.key === "sfxVolume") audio.playSfx("pop", 1);
                        }}
                      />
                    ))}
                  </span>
                  <button className="px-1 text-white/50 hover:text-white" tabIndex={-1} onClick={() => { nav.setFocus(i); nudge(row.key, 1); }}>
                    ▶
                  </button>
                  <span className="w-8 text-right text-white/50">{Math.round(settings[row.key] * 100)}</span>
                </span>
              ) : (
                <button
                  tabIndex={-1}
                  className="border px-2 py-[2px]"
                  style={{
                    borderColor: settings[row.key] ? "#9be8c8" : "#5a4a30",
                    color: settings[row.key] ? "#9be8c8" : "rgba(255,255,255,0.4)",
                  }}
                  onClick={() => {
                    nav.setFocus(i);
                    flip(row.key);
                  }}
                >
                  {settings[row.key] ? "ON" : "OFF"}
                </button>
              )}
            </div>
          );
        })}
      </div>
      <HintBar
        hints={[
          { action: "updown", label: "ROW" },
          { action: "leftright", label: "ADJUST" },
          { action: "accept", label: "TOGGLE" },
          { action: "back", label: "BACK" },
        ]}
      />
    </div>
  );
}

// ------------------------------------------------------------ initials

export function InitialsScreen({
  score,
  castId,
  level,
  onDone,
}: {
  score: number;
  castId: string;
  level: number;
  onDone: () => void;
}) {
  const last = useMemo(loadLastInitials, []);
  const [done, setDone] = useState(false);
  return (
    <div className="relative flex h-screen flex-col items-center justify-center gap-5">
      <Heading>Yer legend, in 3 letters</Heading>
      <div className="font-display text-3xl text-white">{score.toLocaleString()}</div>
      <LetterEntry
        length={3}
        initial={last}
        enabled={!done}
        onConfirm={(initials) => {
          if (done) return;
          setDone(true);
          addScoreEntry({ initials, score, cast: castId, level });
          onDone();
        }}
      />
      <div className="font-pixel text-[8px] text-white/40">
        TYPE 'EM OR SPIN 'EM · YES, THOSE LETTERS TOO
      </div>
    </div>
  );
}
