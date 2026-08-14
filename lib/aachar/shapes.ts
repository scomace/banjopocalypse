// AA character pipeline — drag-to-size shape tools.
//
// ISOLATION NOTE: this is the one place `lib/aachar/` reaches into `lib/spum/`
// for something other than types or the renderer. `lib/spum/shapeTools.ts` is
// pure geometry — no canvas, no React, no catalog — and its ellipse rasteriser
// is already tested against the awkward cases (1px shapes, very flat ellipses,
// inverted drags). The isolation rule exists to stop AA coupling to SPUM's
// CATALOG, ART and SAVE PATH; duplicating a tested pure function would serve
// the letter of it and hurt the point of it. Re-exported through this module
// so the dependency has exactly one site.

import { shapePixels, squareDrag, type ShapeDrag } from "@/lib/spum/shapeTools";

export type { ShapeDrag };
export { squareDrag };

export type ShapeTool = "rect" | "ellipse" | "circle";

export function isShapeTool(tool: string): tool is ShapeTool {
  return tool === "rect" || tool === "ellipse" || tool === "circle";
}

// Axis-aligned rectangle. `shapeTools` has no rect rasteriser — the Part Studio
// only ever needed ellipses — so it lives here.
export function rectPixels(d: ShapeDrag, filled: boolean): Array<[number, number]> {
  const minX = Math.min(d.x0, d.x1);
  const maxX = Math.max(d.x0, d.x1);
  const minY = Math.min(d.y0, d.y1);
  const maxY = Math.max(d.y0, d.y1);
  const out: Array<[number, number]> = [];
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const edge = x === minX || x === maxX || y === minY || y === maxY;
      if (filled || edge) out.push([x, y]);
    }
  }
  return out;
}

// One entry point for every shape tool. `circle` is `ellipse` with the drag
// squared off, and holding shift squares a rect the same way — so the modifier
// means the same thing on every tool.
export function shapeToolPixels(
  tool: ShapeTool,
  drag: ShapeDrag,
  filled: boolean,
  forceSquare = false,
): Array<[number, number]> {
  if (tool === "rect") {
    return rectPixels(forceSquare ? squareDrag(drag) : drag, filled);
  }
  return shapePixels(drag, tool === "circle" || forceSquare, filled);
}
