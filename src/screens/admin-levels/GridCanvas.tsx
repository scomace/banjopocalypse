// The level editor's canvas: draws the grid with the world's tile skins and
// handles the pointer side of every tool. Keyboard lives in LevelEditor.

import { useCallback, useEffect, useRef, useState } from "react";
import { MAX_RISE, reachAt, SAFETY } from "../../game/levels/audit";
import type { EnemyKind, WorldDef } from "../../game/levels/types";
import { GRID_H, GRID_W, TILE } from "../../game/sim/constants";
import {
  FLOOR_ROW,
  TIER_ROWS,
  diffCells,
  getCell,
  lineCells,
  placeUnique,
  relocateRun,
  runAt,
  setCell,
  setCells,
  type Grid,
  type GridRun,
  type Tool,
} from "./model";
import {
  drawBackdrop,
  drawMarker,
  drawPlatform,
  drawSolid,
  drawSpikes,
  drawWind,
  hex,
} from "./tileArt";

export type Overlays = {
  grid: boolean;
  tiers: boolean;
  diff: boolean;
  lint: boolean;
  arc: boolean;
};

export type HoverInfo = { x: number; y: number; ch: string } | null;

type Props = {
  grid: Grid;
  authored: Grid;
  skin: WorldDef;
  tool: Tool;
  selection: GridRun | null;
  overlays: Overlays;
  /** effective enemy letters (world defaults merged) for the undeclared-letter ring */
  enemies: Partial<Record<"a" | "b" | "c" | "d", EnemyKind>>;
  lintCells: { x: number; y: number; severity: "error" | "warn" | "info" }[];
  onSelect: (run: GridRun | null) => void;
  /** called once before the first change of a drag, so the parent can snapshot for undo */
  onStrokeStart: () => void;
  onGridChange: (grid: Grid) => void;
  onHover: (info: HoverInfo) => void;
};

type Stroke =
  | { kind: "paint"; ch: string; hole: boolean; lockRow: number | null; last: { x: number; y: number } }
  | { kind: "run"; mode: "move" | "resizeL" | "resizeR"; startGrid: Grid; startRun: GridRun; anchor: { x: number; y: number }; started: boolean }
  | null;

const W = GRID_W * TILE;
const H = GRID_H * TILE;

export function GridCanvas({
  grid,
  authored,
  skin,
  tool,
  selection,
  overlays,
  enemies,
  lintCells,
  onSelect,
  onStrokeStart,
  onGridChange,
  onHover,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokeRef = useRef<Stroke>(null);
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);

  // ------------------------------------------------------------ drawing
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const pal = skin.palette;
    drawBackdrop(ctx, pal, W, H);

    if (overlays.tiers) {
      ctx.fillStyle = "rgba(255,255,255,0.045)";
      for (const r of TIER_ROWS) ctx.fillRect(0, r * TILE, W, TILE);
      ctx.fillStyle = "rgba(255,255,255,0.28)";
      ctx.font = "10px ui-monospace, Menlo, Consolas, monospace";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      TIER_ROWS.forEach((r, i) => ctx.fillText(`tier ${TIER_ROWS.length - i}`, 3, r * TILE + 2));
    }

    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        const ch = getCell(grid, x, y);
        const px = x * TILE;
        const py = y * TILE;
        if (ch === "#") drawSolid(ctx, pal, px, py);
        else if (ch === "=") drawPlatform(ctx, pal, px, py);
        else if (ch === "^") drawSpikes(ctx, pal, px, py);
        else if (ch === "~" || ch === "<" || ch === ">") drawWind(ctx, pal, px, py, ch);
      }
    }
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        const ch = getCell(grid, x, y);
        if ("12abcdJSWR".includes(ch)) {
          const undeclared = "abcd".includes(ch) && !enemies[ch as "a"];
          drawMarker(ctx, x * TILE, y * TILE, ch, undeclared);
          if (undeclared) {
            ctx.strokeStyle = "#ff3b3b";
            ctx.setLineDash([3, 3]);
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(x * TILE + TILE / 2, y * TILE + TILE / 2, 15, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
          }
        }
      }
    }

    if (overlays.grid) {
      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x <= GRID_W; x++) {
        ctx.moveTo(x * TILE + 0.5, 0);
        ctx.lineTo(x * TILE + 0.5, H);
      }
      for (let y = 0; y <= GRID_H; y++) {
        ctx.moveTo(0, y * TILE + 0.5);
        ctx.lineTo(W, y * TILE + 0.5);
      }
      ctx.stroke();
    }

    if (overlays.diff) {
      ctx.fillStyle = "#ffd600";
      for (const c of diffCells(authored, grid)) {
        ctx.fillRect(c.x * TILE + TILE - 7, c.y * TILE + 2, 5, 5);
      }
    }

    if (overlays.lint) {
      for (const c of lintCells) {
        ctx.strokeStyle = c.severity === "error" ? "#ff3b3b" : c.severity === "warn" ? "#ffab2e" : "#6ec1ff";
        ctx.lineWidth = 2;
        ctx.strokeRect(c.x * TILE + 1.5, c.y * TILE + 1.5, TILE - 3, TILE - 3);
      }
    }

    if (selection) {
      if (overlays.arc) {
        // reachable envelope from this surface: the weakest jumper's rise,
        // widening toward the ground by the horizontal reach at each height
        const top = selection.row * TILE;
        const left = selection.c0 * TILE;
        const right = (selection.c1 + 1) * TILE;
        const pts: [number, number][] = [];
        for (let h = 0; h <= MAX_RISE; h += 6) {
          const reach = Math.max(0, reachAt(h + SAFETY));
          pts.push([left - reach, top - h]);
        }
        const back: [number, number][] = [];
        for (let h = 0; h <= MAX_RISE; h += 6) {
          const reach = Math.max(0, reachAt(h + SAFETY));
          back.push([right + reach, top - h]);
        }
        ctx.fillStyle = hex(pal.glow) + "22";
        ctx.strokeStyle = hex(pal.glow) + "99";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        back.reverse().forEach(([x, y]) => ctx.lineTo(x, y));
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = hex(pal.glow) + "cc";
        ctx.beginPath();
        ctx.moveTo(0, top - MAX_RISE);
        ctx.lineTo(W, top - MAX_RISE);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = hex(pal.glow);
        ctx.font = "10px ui-monospace, Menlo, Consolas, monospace";
        ctx.textAlign = "right";
        ctx.textBaseline = "bottom";
        ctx.fillText(`max rise ${(MAX_RISE / TILE).toFixed(1)} tiles`, W - 4, top - MAX_RISE - 2);
      }
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 3]);
      ctx.strokeRect(selection.c0 * TILE + 1, selection.row * TILE + 1, (selection.c1 - selection.c0 + 1) * TILE - 2, TILE - 2);
      ctx.setLineDash([]);
      if (selection.c1 - selection.c0 >= 2) {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(selection.c0 * TILE + 3, selection.row * TILE + TILE / 2 - 5, 4, 10);
        ctx.fillRect((selection.c1 + 1) * TILE - 7, selection.row * TILE + TILE / 2 - 5, 4, 10);
      }
    }

    if (hover) {
      const restricted = tool.kind === "hole" && hover.y !== FLOOR_ROW;
      ctx.strokeStyle = restricted ? "rgba(255,80,80,0.8)" : "rgba(255,255,255,0.9)";
      ctx.lineWidth = 2;
      ctx.strokeRect(hover.x * TILE + 1, hover.y * TILE + 1, TILE - 2, TILE - 2);
    }
  }, [grid, authored, skin, overlays, enemies, lintCells, selection, hover, tool]);

  // ------------------------------------------------------------ pointer
  const cellOf = useCallback((e: React.PointerEvent): { x: number; y: number } | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor(((e.clientX - rect.left) * (W / rect.width)) / TILE);
    const y = Math.floor(((e.clientY - rect.top) * (H / rect.height)) / TILE);
    if (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H) return null;
    return { x, y };
  }, []);

  const applyPaint = (g: Grid, cells: { x: number; y: number }[], ch: string, hole: boolean): Grid => {
    const ok = hole ? cells.filter((c) => c.y === FLOOR_ROW) : cells;
    return setCells(g, ok, ch);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const cell = cellOf(e);
    if (!cell) return;
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const erase = e.button === 2;

    if (tool.kind === "select" && !erase) {
      const run = runAt(grid, cell.x, cell.y);
      onSelect(run);
      if (!run) return;
      const wide = run.c1 - run.c0 >= 2;
      const mode = wide && cell.x === run.c0 ? "resizeL" : wide && cell.x === run.c1 ? "resizeR" : "move";
      strokeRef.current = { kind: "run", mode, startGrid: grid, startRun: run, anchor: cell, started: false };
      return;
    }

    if (tool.kind === "unique" && !erase) {
      onStrokeStart();
      onGridChange(placeUnique(grid, cell.x, cell.y, tool.ch));
      return;
    }
    if (tool.kind === "stamp" && !erase) {
      onStrokeStart();
      onGridChange(setCell(grid, cell.x, cell.y, tool.ch));
      return;
    }

    const ch = erase || tool.kind === "erase" || tool.kind === "hole" ? "." : tool.ch;
    const hole = tool.kind === "hole" && !erase;
    const lockRow = !erase && tool.ch === "=" && !e.shiftKey ? cell.y : null;
    onStrokeStart();
    onSelect(null);
    const next = applyPaint(grid, [cell], ch, hole);
    strokeRef.current = { kind: "paint", ch, hole, lockRow, last: cell };
    if (next !== grid) onGridChange(next);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const cell = cellOf(e);
    if (!cell) {
      if (hover) setHover(null);
      onHover(null);
    } else if (!hover || hover.x !== cell.x || hover.y !== cell.y) {
      setHover(cell);
      onHover({ ...cell, ch: getCell(grid, cell.x, cell.y) });
    }
    const s = strokeRef.current;
    if (!s || !cell) return;
    if (s.kind === "paint") {
      const target = s.lockRow !== null ? { x: cell.x, y: s.lockRow } : cell;
      if (target.x === s.last.x && target.y === s.last.y) return;
      const cells = lineCells(s.last.x, s.last.y, target.x, target.y);
      s.last = target;
      const next = applyPaint(grid, cells, s.ch, s.hole);
      if (next !== grid) onGridChange(next);
      return;
    }
    // run drag
    const { startGrid, startRun, anchor } = s;
    let result: { grid: Grid; run: GridRun };
    if (s.mode === "move") {
      const dx = cell.x - anchor.x;
      const dy = cell.y - anchor.y;
      result = relocateRun(startGrid, startRun, startRun.row + dy, startRun.c0 + dx, startRun.c1 + dx);
    } else if (s.mode === "resizeL") {
      result = relocateRun(startGrid, startRun, startRun.row, Math.min(cell.x, startRun.c1), startRun.c1);
    } else {
      result = relocateRun(startGrid, startRun, startRun.row, startRun.c0, Math.max(cell.x, startRun.c0));
    }
    if (result.grid !== grid) {
      if (!s.started) {
        s.started = true;
        onStrokeStart();
      }
      onGridChange(result.grid);
      onSelect(result.run);
    }
  };

  const endStroke = () => {
    strokeRef.current = null;
  };

  return (
    <canvas
      ref={canvasRef}
      width={W}
      height={H}
      className="block w-full select-none rounded border border-slate-300 shadow-sm"
      style={{ imageRendering: "pixelated", touchAction: "none", cursor: tool.kind === "select" ? "default" : "crosshair" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endStroke}
      onPointerCancel={endStroke}
      onPointerLeave={() => {
        setHover(null);
        onHover(null);
      }}
      onContextMenu={(e) => e.preventDefault()}
    />
  );
}
