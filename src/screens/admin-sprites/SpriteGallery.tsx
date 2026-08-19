// Sprite gallery (/admin/sprites): every code-authored pixel sprite at 4x
// with frame animation, for eyeball QA. Sections per record.

import { useEffect, useRef } from "react";
import { renderPixelSprite, type PixelSprite } from "../../game/render/pixelart";
import {
  BOSS_SPRITES,
  CRITTER_SPRITES,
  MISC_CRITTERS,
} from "../../game/render/sprites-critters";
import {
  FOOD_SPRITES,
  MISC_ITEM_SPRITES,
  PROJECTILE_SPRITES,
  SPECIAL_SPRITES,
} from "../../game/render/sprites-items";

function SpriteView({ name, sprite }: { name: string; sprite: PixelSprite }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const frames = sprite.frames.map((_, i) => renderPixelSprite(sprite, i));
    const w = Math.max(...frames.map((f) => f.width));
    const h = Math.max(...frames.map((f) => f.height));
    const scale = 4;
    canvas.width = w * scale;
    canvas.height = h * scale;
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    let raf = 0;
    const tick = (now: number) => {
      const f = Math.floor(now / 220) % frames.length;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(frames[f], 0, 0, w * scale, h * scale);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [sprite]);
  return (
    <div className="flex flex-col items-center gap-1 rounded border border-slate-200 bg-[#1a2416] p-2">
      <canvas ref={ref} style={{ imageRendering: "pixelated" }} />
      <span className="font-mono text-[10px] text-slate-300">{name}</span>
    </div>
  );
}

function Section({ title, sprites }: { title: string; sprites: Record<string, PixelSprite> }) {
  return (
    <div className="mb-8">
      <h2 className="mb-2 text-sm font-bold">{title}</h2>
      <div className="flex flex-wrap gap-3">
        {Object.entries(sprites).map(([name, spr]) => (
          <SpriteView key={name} name={name} sprite={spr} />
        ))}
      </div>
    </div>
  );
}

export function SpriteGallery() {
  return (
    <div className="p-6">
      <h1 className="mb-4 text-xl font-bold">Pixel sprite gallery</h1>
      <Section title="Critters" sprites={CRITTER_SPRITES} />
      <Section title="Bosses" sprites={BOSS_SPRITES} />
      <Section title="Misc critters (revenuer, hog, pets)" sprites={MISC_CRITTERS} />
      <Section title="Food" sprites={FOOD_SPRITES} />
      <Section title="Special belch icons" sprites={SPECIAL_SPRITES} />
      <Section title="Projectiles" sprites={PROJECTILE_SPRITES} />
      <Section title="Misc items" sprites={MISC_ITEM_SPRITES} />
    </div>
  );
}
