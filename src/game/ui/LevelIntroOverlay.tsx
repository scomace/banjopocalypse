// Brief level-intro card: world name + level number + a bark line.

import { useEffect, useState } from "react";
import { worldForLevel, levelInWorld, isBossLevel } from "../levels/worlds";
import { hazardDef, type HazardId } from "../sim/hazards";

type ControllerLike = {
  run: { levelIndex: number };
  sim: { hazard: HazardId | null };
};

export function LevelIntroOverlay({ controller }: { controller: ControllerLike }) {
  const [visible, setVisible] = useState(true);
  const idx = controller.run.levelIndex;
  const world = worldForLevel(idx);
  const hazard = hazardDef(controller.sim.hazard);
  useEffect(() => {
    const t = setTimeout(() => setVisible(false), 1600);
    return () => clearTimeout(t);
  }, [idx]);
  if (!visible) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center">
      <div className="text-center" style={{ animation: "introPop 1.6s ease-out both" }}>
        <div
          className="font-display text-5xl uppercase tracking-wide text-[#E8B928]"
          style={{ textShadow: "3px 3px 0 #000, 6px 6px 0 rgba(185,58,32,0.9)" }}
        >
          {isBossLevel(idx) ? world.bossName : world.name}
        </div>
        <div className="mt-1 font-pixel text-[11px] text-white/85" style={{ textShadow: "2px 2px 0 #000" }}>
          {isBossLevel(idx)
            ? "BOSS FIGHT"
            : `LEVEL ${idx} · ${world.index}-${levelInWorld(idx)}`}
        </div>
        <div className="mt-1 font-pixel text-[8px] text-white/50">{world.subtitle}</div>
        {hazard && (
          <div
            className="mx-auto mt-4 inline-block border-y-2 border-[#8CE86A]/40 bg-black/70 px-6 py-2"
            style={{ animation: "hazardShake 0.5s steps(2) 3 0.35s both" }}
          >
            <div
              className="font-display text-2xl uppercase tracking-wide text-[#8CE86A]"
              style={{ textShadow: "2px 2px 0 #000, 4px 4px 0 rgba(20,80,20,0.9)" }}
            >
              {hazard.name}
            </div>
            <div
              className="mt-1 font-pixel text-[8px] text-[#8CE86A]/90"
              style={{ textShadow: "1px 1px 0 #000" }}
            >
              {hazard.tagline}
            </div>
          </div>
        )}
      </div>
      <style>{`@keyframes hazardShake{0%{transform:translateX(-3px) rotate(-1deg)}50%{transform:translateX(3px) rotate(1deg)}100%{transform:none}}
        @keyframes introPop{0%{transform:scale(0.4);opacity:0}12%{transform:scale(1.08);opacity:1}20%{transform:scale(1)}80%{opacity:1}100%{opacity:0}}`}</style>
    </div>
  );
}
