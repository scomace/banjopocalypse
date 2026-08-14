// Texture registration: baked cast sheets, pixel sprites, procedural tile
// skins per world, bubble shells. Everything lands in Phaser's texture
// manager under stable keys at boot.

import type Phaser from "phaser";
import type { BakedCharacter } from "../../aachar/baker";
import type { WorldDef } from "../levels/types";
import { TILE } from "../sim/constants";
import { renderPixelSprite, type PixelSprite } from "./pixelart";

export function registerBaked(
  scene: Phaser.Scene,
  key: string,
  baked: BakedCharacter,
): void {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const tex = scene.textures.addCanvas(key, baked.sheet);
  if (!tex) return;
  let index = 0;
  const total = Object.values(baked.clips).reduce((n, c) => n + c.count, 0);
  for (let i = 0; i < total; i++) {
    const col = i % baked.columns;
    const row = Math.floor(i / baked.columns);
    tex.add(String(i), 0, col * baked.frameW, row * baked.frameH, baked.frameW, baked.frameH);
    index++;
  }
  void index;
  // animations per clip
  for (const [clip, info] of Object.entries(baked.clips)) {
    const animKey = `${key}:${clip}`;
    if (scene.anims.exists(animKey)) scene.anims.remove(animKey);
    scene.anims.create({
      key: animKey,
      frames: Array.from({ length: info.count }, (_, i) => ({
        key,
        frame: String(info.start + i),
      })),
      frameRate: info.fps,
      repeat: info.loop ? -1 : 0,
    });
  }
}

export function registerPixel(
  scene: Phaser.Scene,
  key: string,
  sprite: PixelSprite,
): void {
  for (let f = 0; f < sprite.frames.length; f++) {
    const frameKey = `${key}#${f}`;
    if (scene.textures.exists(frameKey)) continue;
    scene.textures.addCanvas(frameKey, renderPixelSprite(sprite, f));
  }
}

export function pixelFrameKey(key: string, tick: number, frames: number, rate = 14): string {
  if (frames <= 1) return `${key}#0`;
  return `${key}#${Math.floor(tick / rate) % frames}`;
}

function shade(color: number, factor: number): number {
  const r = Math.min(255, Math.floor(((color >> 16) & 0xff) * factor));
  const g = Math.min(255, Math.floor(((color >> 8) & 0xff) * factor));
  const b = Math.min(255, Math.floor((color & 0xff) * factor));
  return (r << 16) | (g << 8) | b;
}

/** Procedural per-world tile skins: solid, platform, spikes. */
export function registerWorldTiles(scene: Phaser.Scene, world: WorldDef): void {
  const mk = (key: string, draw: (g: Phaser.GameObjects.Graphics) => void) => {
    const full = `w${world.index}:${key}`;
    if (scene.textures.exists(full)) return;
    const g = scene.add.graphics();
    draw(g);
    g.generateTexture(full, TILE, TILE);
    g.destroy();
  };

  mk("solid", (g) => {
    g.fillStyle(world.palette.solid);
    g.fillRect(0, 0, TILE, TILE);
    g.fillStyle(world.palette.solidEdge);
    g.fillRect(0, 0, TILE, 4);
    g.fillStyle(shade(world.palette.solid, 0.72));
    g.fillRect(0, TILE - 4, TILE, 4);
    // speckle for texture
    g.fillStyle(shade(world.palette.solid, 1.18));
    g.fillRect(6, 10, 3, 3);
    g.fillRect(20, 18, 3, 3);
    g.fillRect(12, 24, 3, 3);
    g.fillStyle(shade(world.palette.solid, 0.85));
    g.fillRect(24, 8, 3, 3);
    g.fillRect(4, 20, 3, 3);
  });

  mk("platform", (g) => {
    g.fillStyle(world.palette.platform);
    g.fillRect(0, 2, TILE, 10);
    g.fillStyle(shade(world.palette.platform, 1.25));
    g.fillRect(0, 2, TILE, 3);
    g.fillStyle(shade(world.palette.platform, 0.7));
    g.fillRect(0, 9, TILE, 3);
    // plank nails
    g.fillStyle(shade(world.palette.platform, 0.5));
    g.fillRect(5, 5, 2, 2);
    g.fillRect(25, 5, 2, 2);
  });

  mk("spikes", (g) => {
    g.fillStyle(shade(world.palette.solid, 0.6));
    g.fillRect(0, TILE - 6, TILE, 6);
    g.fillStyle(0xb8bcc2);
    for (let i = 0; i < 4; i++) {
      const x = i * 8;
      g.fillTriangle(x, TILE - 4, x + 8, TILE - 4, x + 4, 8);
    }
    g.fillStyle(0xe8ecf2);
    for (let i = 0; i < 4; i++) {
      const x = i * 8;
      g.fillTriangle(x + 2, TILE - 4, x + 4, TILE - 4, x + 4, 14);
    }
  });
}

/** Bubble shell texture (one per player tint + neutral + special gold). */
export function registerBubbleTextures(scene: Phaser.Scene): void {
  const variants: [string, number, number][] = [
    ["bubble:p0", 0x9be8c8, 0x2e8a5e],
    ["bubble:p1", 0xf0c880, 0xa87020],
    ["bubble:special", 0xffe9a0, 0xc89a20],
    ["bubble:ghost", 0xd8d8f0, 0x8080b8],
  ];
  const R = 16;
  for (const [key, rim, deep] of variants) {
    if (scene.textures.exists(key)) continue;
    const g = scene.add.graphics();
    g.fillStyle(rim, 0.16);
    g.fillCircle(R, R, R - 1);
    g.lineStyle(2.4, rim, 0.95);
    g.strokeCircle(R, R, R - 1.5);
    g.lineStyle(1.2, deep, 0.5);
    g.strokeCircle(R, R, R - 4);
    // highlight crescent
    g.fillStyle(0xffffff, 0.85);
    g.fillEllipse(R - 5.5, R - 6.5, 6, 4);
    g.fillStyle(0xffffff, 0.5);
    g.fillCircle(R + 4, R + 6, 1.6);
    g.generateTexture(key, R * 2, R * 2);
    g.destroy();
  }
}
