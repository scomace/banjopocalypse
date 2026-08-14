// Pixel-art shape rasterisers for the Part Studio's drag-to-size tools
// (/admin/spum?tab=parts). Pure geometry — no canvas, no React — so the
// awkward cases (1px shapes, very flat ellipses, inverted drags) can be
// pinned down in tests rather than eyeballed at 16× zoom.

export type ShapeDrag = { x0: number; y0: number; x1: number; y1: number };

// A pixel is in the ellipse when its CENTRE falls inside the ellipse
// inscribed in the drag's bounding box.
function insideTest(d: ShapeDrag) {
  const minX = Math.min(d.x0, d.x1);
  const maxX = Math.max(d.x0, d.x1);
  const minY = Math.min(d.y0, d.y1);
  const maxY = Math.max(d.y0, d.y1);
  const cx = (minX + maxX + 1) / 2;
  const cy = (minY + maxY + 1) / 2;
  const rx = (maxX - minX + 1) / 2;
  const ry = (maxY - minY + 1) / 2;
  return {
    minX,
    maxX,
    minY,
    maxY,
    inside: (px: number, py: number) => {
      const nx = (px + 0.5 - cx) / rx;
      const ny = (py + 0.5 - cy) / ry;
      return nx * nx + ny * ny <= 1;
    },
  };
}

// Ellipse inscribed in the drag box. Outline mode keeps the inside pixels
// that have an outside 4-neighbour, which yields an unbroken 1px ring at any
// radius — stepping a Bresenham arc leaves gaps on very flat ellipses, which
// is exactly the shape an eye needs.
export function ellipsePixels(d: ShapeDrag, filled: boolean): Array<[number, number]> {
  const { minX, maxX, minY, maxY, inside } = insideTest(d);
  const out: Array<[number, number]> = [];
  for (let py = minY; py <= maxY; py++) {
    for (let px = minX; px <= maxX; px++) {
      if (!inside(px, py)) continue;
      if (
        filled ||
        !inside(px - 1, py) ||
        !inside(px + 1, py) ||
        !inside(px, py - 1) ||
        !inside(px, py + 1)
      ) {
        out.push([px, py]);
      }
    }
  }
  return out;
}

// Square off a drag box while keeping its direction, so a circle still grows
// toward the cursor rather than snapping to a fixed quadrant.
export function squareDrag(d: ShapeDrag): ShapeDrag {
  const dx = d.x1 - d.x0;
  const dy = d.y1 - d.y0;
  const side = Math.max(Math.abs(dx), Math.abs(dy));
  return {
    x0: d.x0,
    y0: d.y0,
    x1: d.x0 + (dx < 0 ? -side : side),
    y1: d.y0 + (dy < 0 ? -side : side),
  };
}

// `square` is what separates the circle tool from the ellipse tool.
export function shapePixels(
  d: ShapeDrag,
  square: boolean,
  filled: boolean,
): Array<[number, number]> {
  return ellipsePixels(square ? squareDrag(d) : d, filled);
}
