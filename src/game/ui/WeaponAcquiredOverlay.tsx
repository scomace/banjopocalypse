// The shrine reveal: sim holds, the screen goes to vignette, WEAPON ACQUIRED
// slams in, the weapon icon spins up on a burst of rays, then the name and
// its one-liner. Any key or click (after a short guard so a held belch key
// can't skip it) hands control back — straight into the test-drive frenzy.

import { useEffect, useMemo, useState } from "react";
import type { ShrineGift } from "../sim/types";
import { giftDesc, giftTitle } from "../sim/shrine";
import { giftIcon } from "../render/sprites-weapons";
import { renderPixelSprite } from "../render/pixelart";
import { castById } from "../cast";

const P_COLORS = ["#9be8c8", "#f0c880"];
const GUARD_MS = 700;

export function WeaponAcquiredOverlay({
  gift,
  player,
  castId,
  coop,
  onDone,
}: {
  gift: ShrineGift;
  player: number;
  castId: string;
  coop: boolean;
  onDone: () => void;
}) {
  const [armed, setArmed] = useState(false);
  const src = useMemo(() => renderPixelSprite(giftIcon(gift).sprite, 0).toDataURL(), [gift]);
  const isWeapon = gift.kind === "weapon";

  useEffect(() => {
    const t = setTimeout(() => setArmed(true), GUARD_MS);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!armed) return;
    const h = (e: KeyboardEvent) => {
      if (e.code === "Escape") return; // leave pause alone
      e.preventDefault();
      onDone();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [armed, onDone]);

  return (
    <div
      className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-2 select-none"
      style={{
        background:
          "radial-gradient(ellipse at center, rgba(30,20,6,0.78) 0%, rgba(0,0,0,0.9) 70%, #000 100%)",
        cursor: armed ? "pointer" : "default",
      }}
      onClick={() => armed && onDone()}
    >
      <div
        className="font-display text-6xl uppercase tracking-wider text-[#E8B928]"
        style={{
          textShadow: "4px 4px 0 #000, 8px 8px 0 rgba(185,58,32,0.9)",
          animation: "acqSlam 0.55s cubic-bezier(.2,1.6,.4,1) both",
        }}
      >
        {isWeapon ? "Weapon Acquired" : "Relic Acquired"}
      </div>

      <div className="relative mt-3 flex h-44 w-44 items-center justify-center">
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background:
              "conic-gradient(from 0deg, rgba(255,216,74,0.0) 0deg, rgba(255,216,74,0.55) 18deg, rgba(255,216,74,0.0) 36deg, rgba(255,216,74,0.55) 54deg, rgba(255,216,74,0.0) 72deg, rgba(255,216,74,0.55) 90deg, rgba(255,216,74,0.0) 108deg, rgba(255,216,74,0.55) 126deg, rgba(255,216,74,0.0) 144deg, rgba(255,216,74,0.55) 162deg, rgba(255,216,74,0.0) 180deg, rgba(255,216,74,0.55) 198deg, rgba(255,216,74,0.0) 216deg, rgba(255,216,74,0.55) 234deg, rgba(255,216,74,0.0) 252deg, rgba(255,216,74,0.55) 270deg, rgba(255,216,74,0.0) 288deg, rgba(255,216,74,0.55) 306deg, rgba(255,216,74,0.0) 324deg, rgba(255,216,74,0.55) 342deg, rgba(255,216,74,0.0) 360deg)",
            maskImage: "radial-gradient(circle, #000 30%, transparent 72%)",
            WebkitMaskImage: "radial-gradient(circle, #000 30%, transparent 72%)",
            animation: "acqRays 9s linear infinite, acqFade 0.6s ease-out 0.25s both",
          }}
        />
        <img
          src={src}
          alt=""
          className="relative"
          style={{
            width: 128,
            height: 128,
            imageRendering: "pixelated",
            filter: "drop-shadow(0 0 14px rgba(255,216,74,0.85)) drop-shadow(4px 6px 0 #000)",
            animation: "acqIcon 0.7s cubic-bezier(.2,1.5,.4,1) 0.2s both, acqBob 2.4s ease-in-out 0.9s infinite",
          }}
        />
      </div>

      <div
        className="mt-2 font-display text-4xl uppercase leading-tight text-white"
        style={{
          textShadow: "3px 3px 0 #000",
          animation: "acqRise 0.5s ease-out 0.55s both",
        }}
      >
        {giftTitle(gift)}
      </div>
      <div
        className="font-pixel text-[10px] text-white/75"
        style={{ textShadow: "2px 2px 0 #000", animation: "acqRise 0.5s ease-out 0.75s both" }}
      >
        {giftDesc(gift).toUpperCase()}
      </div>
      <div
        className="mt-1 font-pixel text-[8px]"
        style={{ color: P_COLORS[player] ?? "#fff", animation: "acqRise 0.5s ease-out 0.9s both" }}
      >
        {castById(castId).displayName.toUpperCase()} FOUND IT
        {coop ? " · EVERYBODY GETS ONE" : ""}
        {isWeapon ? " · FRENZY'S LIT, GO TEST IT" : ""}
      </div>
      <div
        className="mt-3 font-pixel text-[8px] text-white/45"
        style={{ visibility: armed ? "visible" : "hidden", animation: "acqBlink 1.1s steps(2) infinite" }}
      >
        any key to keep pickin'
      </div>
      <style>{`
        @keyframes acqSlam{0%{transform:scale(2.6);opacity:0}60%{transform:scale(0.94);opacity:1}100%{transform:scale(1)}}
        @keyframes acqIcon{0%{transform:scale(0) rotate(-40deg);opacity:0}100%{transform:scale(1) rotate(0);opacity:1}}
        @keyframes acqBob{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
        @keyframes acqRays{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        @keyframes acqFade{from{opacity:0}to{opacity:1}}
        @keyframes acqRise{0%{transform:translateY(14px);opacity:0}100%{transform:translateY(0);opacity:1}}
        @keyframes acqBlink{0%{opacity:1}100%{opacity:0.2}}
      `}</style>
    </div>
  );
}
