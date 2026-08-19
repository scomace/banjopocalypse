// Texture registration: baked cast sheets, pixel sprites, procedural tile
// skins per world, belch shells. Everything lands in Phaser's texture
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

/**
 * Belch shell texture (one per player tint + ghost + special gold).
 * The player swigs shine and belches a fume-bubble: a lumpy, hazy blob with
 * a wobbly rim and a couple of stink-wisps curling inside, not a soap sphere.
 */
export function registerBubbleTextures(scene: Phaser.Scene): void {
  const variants: [string, number, number, number][] = [
    // key, rim, deep shade, inner haze
    ["bubble:p0", 0xc4f06a, 0x5e9a22, 0xe8ffb0],
    ["bubble:p1", 0xf0b850, 0xa86a14, 0xffe4a8],
    ["bubble:special", 0xffe9a0, 0xc89a20, 0xfff6d0],
    ["bubble:ghost", 0xd8d8f0, 0x8080b8, 0xf0f0ff],
  ];
  const R = 16;
  // lumpy outline: base radius with five soft bulges
  const blob = (r0: number, amp: number, phase: number): { x: number; y: number }[] => {
    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2;
      const r = r0 + Math.sin(a * 5 + phase) * amp + Math.sin(a * 3 - phase) * amp * 0.4;
      pts.push({ x: R + Math.cos(a) * r, y: R + Math.sin(a) * r });
    }
    return pts;
  };
  for (const [key, rim, deep, haze] of variants) {
    if (scene.textures.exists(key)) continue;
    const g = scene.add.graphics();
    // hazy body: two layered blobs so the middle reads denser than the edge
    g.fillStyle(rim, 0.2);
    g.fillPoints(blob(R - 1.8, 1.2, 0.4), true);
    g.fillStyle(haze, 0.16);
    g.fillPoints(blob(R - 6, 1.4, 2.1), true);
    // wobbly rim + faint inner echo
    g.lineStyle(2.4, rim, 0.95);
    g.strokePoints(blob(R - 2.2, 1.2, 0.4), true);
    g.lineStyle(1.1, deep, 0.45);
    g.strokePoints(blob(R - 5, 1.0, 3.0), true);
    // stink-wisps curling up inside
    g.lineStyle(1.3, haze, 0.8);
    g.beginPath();
    g.moveTo(R - 5, R + 4);
    g.lineTo(R - 3.2, R + 1.5);
    g.lineTo(R - 5, R - 1);
    g.lineTo(R - 3.2, R - 3.5);
    g.strokePath();
    g.beginPath();
    g.moveTo(R + 3, R + 6);
    g.lineTo(R + 4.8, R + 3.5);
    g.lineTo(R + 3, R + 1);
    g.strokePath();
    // soft highlight so it still reads as a rounded, contained thing
    g.fillStyle(0xffffff, 0.55);
    g.fillEllipse(R - 5.5, R - 7, 5, 3);
    g.fillStyle(0xffffff, 0.35);
    g.fillCircle(R + 5, R + 6.5, 1.4);
    g.generateTexture(key, R * 2, R * 2);
    g.destroy();
  }
}
