// Canvas2D port of the procedural tile skins in game/render/textures.ts, so
// the editor shows a level the way the game draws it (per-world palette,
// planks, speckles, spikes) instead of as ASCII.

import type { WorldDef } from "../../game/levels/types";
import { TILE } from "../../game/sim/constants";

export function hex(color: number): string {
  return "#" + (color & 0xffffff).toString(16).padStart(6, "0");
}

export function shade(color: number, factor: number): number {
  const r = Math.min(255, Math.floor(((color >> 16) & 0xff) * factor));
  const g = Math.min(255, Math.floor(((color >> 8) & 0xff) * factor));
  const b = Math.min(255, Math.floor((color & 0xff) * factor));
  return (r << 16) | (g << 8) | b;
}

type Pal = WorldDef["palette"];

export function drawBackdrop(ctx: CanvasRenderingContext2D, pal: Pal, w: number, h: number): void {
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, hex(pal.bgTop));
  grad.addColorStop(1, hex(pal.bgBottom));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
}

export function drawSolid(ctx: CanvasRenderingContext2D, pal: Pal, x: number, y: number): void {
  ctx.fillStyle = hex(pal.solid);
  ctx.fillRect(x, y, TILE, TILE);
  ctx.fillStyle = hex(pal.solidEdge);
  ctx.fillRect(x, y, TILE, 4);
  ctx.fillStyle = hex(shade(pal.solid, 0.72));
  ctx.fillRect(x, y + TILE - 4, TILE, 4);
  ctx.fillStyle = hex(shade(pal.solid, 1.18));
  ctx.fillRect(x + 6, y + 10, 3, 3);
  ctx.fillRect(x + 20, y + 18, 3, 3);
  ctx.fillRect(x + 12, y + 24, 3, 3);
  ctx.fillStyle = hex(shade(pal.solid, 0.85));
  ctx.fillRect(x + 24, y + 8, 3, 3);
  ctx.fillRect(x + 4, y + 20, 3, 3);
}

export function drawPlatform(ctx: CanvasRenderingContext2D, pal: Pal, x: number, y: number): void {
  ctx.fillStyle = hex(pal.platform);
  ctx.fillRect(x, y + 2, TILE, 10);
  ctx.fillStyle = hex(shade(pal.platform, 1.25));
  ctx.fillRect(x, y + 2, TILE, 3);
  ctx.fillStyle = hex(shade(pal.platform, 0.7));
  ctx.fillRect(x, y + 9, TILE, 3);
  ctx.fillStyle = hex(shade(pal.platform, 0.5));
  ctx.fillRect(x + 5, y + 5, 2, 2);
  ctx.fillRect(x + 25, y + 5, 2, 2);
}

export function drawSpikes(ctx: CanvasRenderingContext2D, pal: Pal, x: number, y: number): void {
  ctx.fillStyle = hex(shade(pal.solid, 0.6));
  ctx.fillRect(x, y + TILE - 6, TILE, 6);
  const tri = (x0: number, y0: number, x1: number, y1: number, x2: number, y2: number) => {
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.closePath();
    ctx.fill();
  };
  ctx.fillStyle = "#b8bcc2";
  for (let i = 0; i < 4; i++) {
    const sx = x + i * 8;
    tri(sx, y + TILE - 4, sx + 8, y + TILE - 4, sx + 4, y + 8);
  }
  ctx.fillStyle = "#e8ecf2";
  for (let i = 0; i < 4; i++) {
    const sx = x + i * 8;
    tri(sx + 2, y + TILE - 4, sx + 4, y + TILE - 4, sx + 4, y + 14);
  }
}

export function drawWind(ctx: CanvasRenderingContext2D, pal: Pal, x: number, y: number, ch: "~" | "<" | ">"): void {
  ctx.fillStyle = hex(pal.glow) + "2a";
  ctx.fillRect(x, y, TILE, TILE);
  ctx.strokeStyle = hex(pal.glow) + "cc";
  ctx.lineWidth = 2;
  ctx.beginPath();
  const cx = x + TILE / 2;
  const cy = y + TILE / 2;
  if (ch === "~") {
    ctx.moveTo(cx, cy + 8);
    ctx.lineTo(cx, cy - 8);
    ctx.moveTo(cx - 5, cy - 3);
    ctx.lineTo(cx, cy - 8);
    ctx.lineTo(cx + 5, cy - 3);
  } else {
    const d = ch === "<" ? -1 : 1;
    ctx.moveTo(cx - 8 * d, cy);
    ctx.lineTo(cx + 8 * d, cy);
    ctx.moveTo(cx + 3 * d, cy - 5);
    ctx.lineTo(cx + 8 * d, cy);
    ctx.lineTo(cx + 3 * d, cy + 5);
  }
  ctx.stroke();
}

export const MARKER_COLORS: Record<string, string> = {
  "1": "#c4f06a",
  "2": "#f0b850",
  a: "#ff7b7b",
  b: "#ff9e5e",
  c: "#ff6fb5",
  d: "#d98cff",
  J: "#ffd166",
  S: "#b388ff",
  W: "#ffe066",
  R: "#ff8fab",
};

export function drawMarker(ctx: CanvasRenderingContext2D, x: number, y: number, ch: string, faded = false): void {
  const cx = x + TILE / 2;
  const cy = y + TILE / 2;
  ctx.globalAlpha = faded ? 0.45 : 1;
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.beginPath();
  ctx.arc(cx, cy, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = MARKER_COLORS[ch] ?? "#ffffff";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = MARKER_COLORS[ch] ?? "#ffffff";
  ctx.font = "bold 14px ui-monospace, Menlo, Consolas, monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(ch, cx, cy + 1);
  ctx.globalAlpha = 1;
}
