// Menu screens: title, character select (live aachar DOM rigs, the pretty
// path), world checkpoint select, leaderboards, settings, initials entry.
// The shell is keyboard-and-click friendly; the game keys work everywhere.

import { useEffect, useMemo, useState } from "react";
import { AaSceneCharacter } from "@/lib/aachar/AaSceneCharacter";
import { CAST, castById, type CastMember } from "../game/cast";
import {
  addScoreEntry,
  loadSave,
  loadScores,
  loadSettings,
  writeSettings,
  type Settings,
} from "../game/core/save";
import { audio } from "../game/audio/engine";
import { WORLDS } from "../game/levels/worlds";

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

export function MenuButton({
  children,
  onClick,
  subtle,
}: {
  children: React.ReactNode;
  onClick: () => void;
  subtle?: boolean;
}) {
  return (
    <button
      className={
        subtle
          ? "font-pixel text-[9px] text-white/40 hover:text-white"
          : "border-2 border-[#E8B928] px-8 py-2 font-display text-2xl uppercase text-[#E8B928] transition-colors hover:bg-[#E8B928] hover:text-black"
      }
      onClick={() => {
        audio.ensure();
        audio.playSfx("food", 1);
        onClick();
      }}
    >
      {children}
    </button>
  );
}

// ------------------------------------------------------------------ title

export function TitleScreen({
  onPlay,
  onScores,
  onSettings,
}: {
  onPlay: () => void;
  onScores: () => void;
  onSettings: () => void;
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.code === "Enter" || e.code === "Space") onPlay();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onPlay]);
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-5">
      <Marquee />
      <p className="font-pixel text-[10px] text-white/60">
        A BUBBLE-BLOWIN' HOOTENANNY AT THE END OF THE WORLD
      </p>
      <div className="mt-4 flex flex-col items-center gap-3">
        <MenuButton onClick={onPlay}>Play</MenuButton>
        <div className="flex gap-6">
          <MenuButton subtle onClick={onScores}>
            HIGH SCORES
          </MenuButton>
          <MenuButton subtle onClick={onSettings}>
            SETTINGS
          </MenuButton>
        </div>
      </div>
      <p className="absolute bottom-4 font-pixel text-[8px] text-white/30">
        P1: WASD + F/G · P2: ARROWS + K/L · GAMEPADS WELCOME · ESC PAUSES
      </p>
    </div>
  );
}

// ------------------------------------------------------------ char select

function CastCard({
  member,
  locked,
  selected,
  color,
  onPick,
}: {
  member: CastMember;
  locked: boolean;
  selected: number[]; // player indexes that picked this
  color?: string;
  onPick: () => void;
}) {
  return (
    <button
      className="relative flex w-40 flex-col items-center border-2 p-2 text-center transition-transform"
      style={{
        borderColor: selected.length
          ? P_COLORS[selected[0]]
          : locked
            ? "#332a1a"
            : "#5a4a30",
        background: "rgba(0,0,0,0.45)",
        transform: selected.length ? "scale(1.05)" : "scale(1)",
        opacity: locked ? 0.45 : 1,
      }}
      onClick={onPick}
      disabled={locked}
    >
      <div style={{ height: 120, filter: locked ? "brightness(0.2)" : "none" }} className="flex items-end">
        <AaSceneCharacter aachar={{ name: member.aachar }} animation={selected.length ? "greeting1" : "idle"} size={0.55} />
      </div>
      <div className="mt-1 font-display text-lg uppercase leading-none text-white">
        {locked ? "????" : member.displayName}
      </div>
      <div className="mt-1 h-8 font-pixel text-[7px] leading-relaxed text-white/55">
        {locked ? `CLEAR ${member.unlockWorlds} WORLDS` : member.bio}
      </div>
      {!locked && (
        <div className="mt-1 font-pixel text-[7px] text-[#ffd84a]">
          SPD{member.speed} PUF{member.puff} JMP{member.jump} LCK{member.luck}
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
      {void color}
    </button>
  );
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
  const [cursor] = useState(0);
  void cursor;

  const pickFor = (member: CastMember) => {
    if (!picks[0]) {
      setPicks([member.id, picks[1]]);
      audio.playSfx("letter", 1);
    } else if (p2Active && !picks[1] && picks[0] !== member.id) {
      setPicks([picks[0], member.id]);
      audio.playSfx("letter", 1.2);
    }
  };

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      // any arrow/K/L press wakes P2
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "KeyK", "KeyL"].includes(e.code)) {
        setP2Active(true);
      }
      if (e.code === "Escape") onBack();
      if (e.code === "Enter" && picks[0]) onStart(p2Active && picks[1] ? picks : [picks[0], null]);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [picks, p2Active, onStart, onBack]);

  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4 overflow-auto py-6">
      <div className="font-display text-4xl uppercase text-[#E8B928]" style={{ textShadow: "3px 3px 0 #000" }}>
        Pick yer kinfolk
      </div>
      <div className="font-pixel text-[9px] text-white/50">
        {!picks[0]
          ? "P1: CLICK A COUSIN"
          : p2Active && !picks[1]
            ? "P2: YOUR TURN (OR HIT ENTER TO RIDE SOLO)"
            : "HIT ENTER TO START · P2 PRESS ANY ARROW TO JOIN"}
      </div>
      <div className="grid max-w-4xl grid-cols-4 gap-3">
        {CAST.map((m) => (
          <CastCard
            key={m.id}
            member={m}
            locked={save.worldsCleared < m.unlockWorlds}
            selected={picks.map((p, i) => (p === m.id ? i : -1)).filter((i) => i >= 0)}
            onPick={() => pickFor(m)}
          />
        ))}
      </div>
      <div className="flex gap-4">
        {picks[0] && (
          <MenuButton onClick={() => onStart(p2Active && picks[1] ? picks : [picks[0], null])}>
            Let's Go
          </MenuButton>
        )}
        <MenuButton subtle onClick={onBack}>
          BACK
        </MenuButton>
      </div>
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
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4">
      <div className="font-display text-4xl uppercase text-[#E8B928]" style={{ textShadow: "3px 3px 0 #000" }}>
        Where we startin'?
      </div>
      <div className="grid max-w-3xl grid-cols-3 gap-3">
        {WORLDS.map((w) => {
          const locked = w.index > save.worldsUnlocked;
          return (
            <button
              key={w.index}
              disabled={locked}
              className="border-2 p-3 text-left"
              style={{
                borderColor: locked ? "#2a2216" : `#${w.palette.glow.toString(16).padStart(6, "0")}`,
                background: "rgba(0,0,0,0.5)",
                opacity: locked ? 0.35 : 1,
              }}
              onClick={() => onPick((w.index - 1) * 11 + 1)}
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
    </div>
  );
}

// ------------------------------------------------------------ leaderboards

export function ScoresScreen({ onBack }: { onBack: () => void }) {
  const scores = useMemo(loadScores, []);
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4">
      <div className="font-display text-4xl uppercase text-[#E8B928]" style={{ textShadow: "3px 3px 0 #000" }}>
        Holler Heroes
      </div>
      <div className="w-96 border-2 border-[#5a4a30] bg-black/50 p-4">
        {scores.length === 0 && (
          <div className="text-center font-pixel text-[9px] text-white/40">
            NO SCORES YET. GIT PICKIN'.
          </div>
        )}
        {scores.map((s, i) => (
          <div key={i} className="flex justify-between py-1 font-pixel text-[10px]">
            <span className="text-white/50">{i + 1}.</span>
            <span className="text-[#ffd84a]">{s.initials}</span>
            <span className="text-white/70">{castById(s.cast).displayName.toUpperCase()}</span>
            <span className="text-white/50">L{s.level}</span>
            <span className="text-white">{s.score.toLocaleString()}</span>
          </div>
        ))}
      </div>
      <MenuButton subtle onClick={onBack}>
        BACK
      </MenuButton>
    </div>
  );
}

// ------------------------------------------------------------ settings

export function SettingsScreen({ onBack }: { onBack: () => void }) {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const update = (patch: Partial<Settings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    writeSettings(next);
    audio.setVolumes(next.musicVolume, next.sfxVolume);
  };
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-5">
      <div className="font-display text-4xl uppercase text-[#E8B928]" style={{ textShadow: "3px 3px 0 #000" }}>
        Fixin's
      </div>
      <div className="flex w-80 flex-col gap-4 border-2 border-[#5a4a30] bg-black/50 p-5">
        <label className="flex items-center justify-between font-pixel text-[9px] text-white/80">
          MUSIC
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={settings.musicVolume}
            onChange={(e) => update({ musicVolume: Number(e.target.value) })}
          />
        </label>
        <label className="flex items-center justify-between font-pixel text-[9px] text-white/80">
          SOUNDS
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={settings.sfxVolume}
            onChange={(e) => {
              update({ sfxVolume: Number(e.target.value) });
              audio.playSfx("pop", 1);
            }}
          />
        </label>
        <label className="flex items-center justify-between font-pixel text-[9px] text-white/80">
          SCREEN SHAKE
          <input
            type="checkbox"
            checked={settings.screenShake}
            onChange={(e) => update({ screenShake: e.target.checked })}
          />
        </label>
        <label className="flex items-center justify-between font-pixel text-[9px] text-white/80">
          REDUCED FLASH
          <input
            type="checkbox"
            checked={settings.reducedFlash}
            onChange={(e) => update({ reducedFlash: e.target.checked })}
          />
        </label>
      </div>
      <MenuButton subtle onClick={onBack}>
        BACK
      </MenuButton>
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
  const [initials, setInitials] = useState("");
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (/^Key[A-Z]$/.test(e.code) && initials.length < 3) {
        setInitials((s) => s + e.code[3]);
        audio.playSfx("letter", 1 + initials.length * 0.15);
      } else if (e.code === "Backspace") {
        setInitials((s) => s.slice(0, -1));
      } else if (e.code === "Enter" && initials.length === 3) {
        addScoreEntry({ initials, score, cast: castId, level });
        onDone();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [initials, score, castId, level, onDone]);
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-5">
      <div className="font-display text-4xl uppercase text-[#E8B928]" style={{ textShadow: "3px 3px 0 #000" }}>
        Yer legend, in 3 letters
      </div>
      <div className="font-display text-3xl text-white">{score.toLocaleString()}</div>
      <div className="flex gap-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="flex h-16 w-14 items-center justify-center border-2 font-display text-4xl text-white"
            style={{ borderColor: initials.length === i ? "#E8B928" : "#5a4a30" }}
          >
            {initials[i] ?? ""}
          </div>
        ))}
      </div>
      <div className="font-pixel text-[8px] text-white/40">
        TYPE 3 LETTERS · ENTER TO CARVE IT · YES, THOSE LETTERS TOO
      </div>
    </div>
  );
}
