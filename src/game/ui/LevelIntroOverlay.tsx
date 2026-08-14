// Brief level-intro card: world name + level number + a bark line.

import { useEffect, useState } from "react";
import { worldForLevel, levelInWorld, isBossLevel } from "../levels/worlds";

type ControllerLike = { run: { levelIndex: number } };

export function LevelIntroOverlay({ controller }: { controller: ControllerLike }) {
  const [visible, setVisible] = useState(true);
  const idx = controller.run.levelIndex;
  const world = worldForLevel(idx);
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
      </div>
      <style>{`@keyframes introPop{0%{transform:scale(0.4);opacity:0}12%{transform:scale(1.08);opacity:1}20%{transform:scale(1)}80%{opacity:1}100%{opacity:0}}`}</style>
    </div>
  );
}
