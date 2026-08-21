// Pause menu: Resume / Music / Sounds / Quit, a yes-no guard on Quit so a
// stray B press can't dump a run. Driven by the menu layer (Esc/Start/B
// resume; pad/keys/remote/mouse all move the same cursor).

import { useState } from "react";
import { audio } from "../audio/engine";
import { loadSettings, writeSettings, type Settings } from "../core/save";
import { HintBar } from "../../shell/MenuChrome";
import { MenuButton } from "../../shell/screens";
import { menuSfx, useMenuNav } from "../../shell/useMenuNav";

const STEPS = 10;

export function PauseOverlay({
  online,
  onResume,
  onQuit,
}: {
  /** online: the partner is stalled while we sit here */
  online: boolean;
  onResume: () => void;
  onQuit: () => void;
}) {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [confirmQuit, setConfirmQuit] = useState(false);
  const update = (patch: Partial<Settings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    writeSettings(next);
    audio.setVolumes(next.musicVolume, next.sfxVolume);
  };
  const nudge = (key: "musicVolume" | "sfxVolume", dir: number) => {
    const v = Math.max(0, Math.min(1, Math.round((settings[key] + dir / STEPS) * STEPS) / STEPS));
    update({ [key]: v });
    if (key === "sfxVolume") audio.playSfx("pop", 1);
    else menuSfx("tick");
  };

  // main list: Resume, Music, Sounds, Quit
  const main = useMenuNav({
    count: 4,
    enabled: !confirmQuit,
    sfx: false,
    onMove: () => menuSfx("move"),
    onHorizontal: (i, dir) => {
      if (i === 1) nudge("musicVolume", dir);
      else if (i === 2) nudge("sfxVolume", dir);
      return true;
    },
    onAccept: (i) => {
      if (i === 0) {
        menuSfx("back");
        onResume();
      } else if (i === 3) {
        menuSfx("accept");
        setConfirmQuit(true);
      } else menuSfx("tick");
    },
    onBack: () => {
      menuSfx("back");
      onResume();
    },
    onStart: () => {
      menuSfx("back");
      onResume();
    },
  });
  // confirm: [Keep Pickin'] [Quit]
  const confirm = useMenuNav({
    count: 2,
    cols: 2,
    enabled: confirmQuit,
    sfx: false,
    onMove: () => menuSfx("move"),
    onAccept: (i) => {
      if (i === 1) {
        menuSfx("accept");
        onQuit();
      } else {
        menuSfx("back");
        setConfirmQuit(false);
      }
    },
    onBack: () => {
      menuSfx("back");
      setConfirmQuit(false);
    },
  });

  const slider = (key: "musicVolume" | "sfxVolume", label: string, idx: number) => {
    const b = main.bind(idx);
    const focused = main.focus === idx && !confirmQuit;
    return (
      <div
        ref={b.ref}
        onMouseEnter={b.onMouseEnter}
        data-focused={focused}
        className="menu-item flex w-72 items-center justify-between border-2 border-transparent px-3 py-1 font-pixel text-[9px]"
        style={{ color: focused ? "#fff" : "rgba(255,255,255,0.65)" }}
      >
        <span>{label}</span>
        <span className="flex items-center gap-1">
          <button className="px-1 text-white/50 hover:text-white" tabIndex={-1} onClick={() => { main.setFocus(idx); nudge(key, -1); }}>
            ◀
          </button>
          <span className="flex gap-[2px]">
            {Array.from({ length: STEPS }, (_, k) => (
              <button
                key={k}
                tabIndex={-1}
                className="h-3 w-[7px]"
                style={{
                  background:
                    k < Math.round(settings[key] * STEPS)
                      ? focused
                        ? "#E8B928"
                        : "#b89a3a"
                      : "rgba(255,255,255,0.12)",
                }}
                onClick={() => {
                  main.setFocus(idx);
                  update({ [key]: (k + 1) / STEPS });
                  if (key === "sfxVolume") audio.playSfx("pop", 1);
                }}
              />
            ))}
          </span>
          <button className="px-1 text-white/50 hover:text-white" tabIndex={-1} onClick={() => { main.setFocus(idx); nudge(key, 1); }}>
            ▶
          </button>
        </span>
      </div>
    );
  };

  return (
    <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-3 bg-black/70">
      <div className="font-display text-5xl uppercase text-[#E8B928]" style={{ textShadow: "3px 3px 0 #000" }}>
        Paused
      </div>
      {online && (
        <div className="font-pixel text-[8px] text-[#f0c880]">YER PARTNER'S FROZE TOO. BE QUICK.</div>
      )}
      {confirmQuit ? (
        <>
          <div className="mt-2 font-pixel text-[10px] text-white/80">QUIT TO THE TITLE? THIS RUN'S DONE FOR.</div>
          <div className="flex gap-4">
            <MenuButton bind={confirm.bind(0)}>Keep Pickin'</MenuButton>
            <MenuButton bind={confirm.bind(1)}>Quit</MenuButton>
          </div>
          <HintBar
            hints={[
              { action: "leftright", label: "CHOOSE" },
              { action: "accept", label: "CONFIRM" },
              { action: "back", label: "KEEP PICKIN'" },
            ]}
          />
        </>
      ) : (
        <>
          <div className="mt-2 flex flex-col items-center gap-2">
            <MenuButton bind={main.bind(0)}>Keep Pickin'</MenuButton>
            {slider("musicVolume", "MUSIC", 1)}
            {slider("sfxVolume", "SOUNDS", 2)}
            <MenuButton subtle bind={main.bind(3)}>
              QUIT TO TITLE
            </MenuButton>
          </div>
          <HintBar
            hints={[
              { action: "updown", label: "MOVE" },
              { action: "leftright", label: "VOLUME" },
              { action: "accept", label: "PICK" },
              { action: "back", label: "RESUME" },
            ]}
          />
        </>
      )}
    </div>
  );
}
