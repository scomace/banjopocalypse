// Baker QA lab (/admin/baker): bakes the full cast and plays every clip so
// sheet fidelity can be eyeballed against the live DOM rig side by side.
// This page is the acceptance gate for the baker: if Earl runs here, the
// game can trust the sheets.

import { useEffect, useRef, useState } from "react";
import { AaSceneCharacter } from "@/lib/aachar/AaSceneCharacter";
import { CAST } from "../../game/cast";
import { bakeCast, type BakedCharacter } from "../../aachar/baker";

function AnimatedFrame({ baked, clip }: { baked: BakedCharacter; clip: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const info = baked.clips[clip];
    const canvas = canvasRef.current;
    if (!info || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const elapsed = (now - start) / 1000;
      let f = Math.floor(elapsed * info.fps);
      f = info.loop ? f % info.count : Math.min(f, info.count - 1);
      const idx = info.start + f;
      const col = idx % baked.columns;
      const row = Math.floor(idx / baked.columns);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(
        baked.sheet,
        col * baked.frameW,
        row * baked.frameH,
        baked.frameW,
        baked.frameH,
        0,
        0,
        baked.frameW,
        baked.frameH,
      );
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [baked, clip]);
  return (
    <canvas
      ref={canvasRef}
      width={baked.frameW}
      height={baked.frameH}
      style={{ imageRendering: "pixelated", border: "1px solid #cbd5e1" }}
    />
  );
}

export function BakerLab() {
  const [baked, setBaked] = useState<BakedCharacter[]>([]);
  const [status, setStatus] = useState("baking the cast...");
  useEffect(() => {
    const t0 = performance.now();
    bakeCast(CAST.map((c) => c.aachar)).then((results) => {
      const ok = results.filter((r): r is BakedCharacter => r !== null);
      setBaked(ok);
      setStatus(
        `${ok.length}/${CAST.length} baked in ${Math.round(performance.now() - t0)}ms`,
      );
    });
  }, []);

  return (
    <div className="p-6">
      <h1 className="mb-1 text-xl font-bold">Baker QA lab</h1>
      <p className="mb-4 text-xs text-slate-500">{status}</p>
      {baked.map((b) => {
        const member = CAST.find((c) => c.aachar === b.name);
        return (
          <div key={b.name} className="mb-8 border-b border-slate-200 pb-6">
            <h2 className="mb-2 text-sm font-bold">
              {member?.displayName ?? b.name}{" "}
              <span className="font-normal text-slate-400">
                ({b.name} · {b.frameW}×{b.frameH} · {Object.keys(b.clips).length}{" "}
                clips)
              </span>
            </h2>
            <div className="flex flex-wrap items-end gap-4">
              <div className="flex flex-col items-center gap-1">
                <div style={{ height: 140 }} className="flex items-end">
                  <AaSceneCharacter
                    aachar={{ name: b.name }}
                    animation="idle"
                    size={0.62}
                  />
                </div>
                <span className="text-[10px] text-slate-400">live rig</span>
              </div>
              {Object.keys(b.clips).map((clip) => (
                <div key={clip} className="flex flex-col items-center gap-1">
                  <AnimatedFrame baked={b} clip={clip} />
                  <span className="text-[10px] text-slate-400">{clip}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
