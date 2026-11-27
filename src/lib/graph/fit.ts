// Fitting the drawing to the part of the window nothing covers. Pure arithmetic
// with no browser, so the viewer and the tests share it.
//
// A fit is a scale and an offset: a map point (x, y) is drawn at
// (x * scale + offsetX, y * scale + offsetY) in the canvas's own pixels. Marks
// grow with the scale, so a node's radius is part of the extent being fitted.

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface Circle {
  x: number;
  y: number;
  /** Radius in map units; drawn at radius * scale. */
  r: number;
}

export interface Fit {
  scale: number;
  offsetX: number;
  offsetY: number;
}

export interface FitOptions {
  /** Space kept clear inside the rectangle, in screen pixels. Defaults to a small share of its shorter side. */
  margin?: number;
  minScale?: number;
  maxScale?: number;
}

/** Where a map point is drawn under a fit. */
export function applyFit(fit: Fit, p: { x: number; y: number }): { x: number; y: number } {
  return { x: p.x * fit.scale + fit.offsetX, y: p.y * fit.scale + fit.offsetY };
}

/** The scale and offset that fit the nodes, marks and all, into the rectangle, centred. */
export function fitToRect(points: readonly Circle[], rect: Rect, options: FitOptions = {}): Fit {
  const margin = options.margin ?? Math.min(28, Math.min(rect.width, rect.height) * 0.06);
  const minScale = options.minScale ?? 0;
  const maxScale = options.maxScale ?? Infinity;
  const centreX = rect.left + rect.width / 2;
  const centreY = rect.top + rect.height / 2;
  if (!points.length) return { scale: 1, offsetX: centreX, offsetY: centreY };
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x - p.r);
    maxX = Math.max(maxX, p.x + p.r);
    minY = Math.min(minY, p.y - p.r);
    maxY = Math.max(maxY, p.y + p.r);
  }
  const spanX = maxX - minX;
  const spanY = maxY - minY;
  const roomX = Math.max(1, rect.width - 2 * margin);
  const roomY = Math.max(1, rect.height - 2 * margin);
  const fitted = Math.min(spanX > 0 ? roomX / spanX : Infinity, spanY > 0 ? roomY / spanY : Infinity);
  const scale = Math.min(maxScale, Math.max(minScale, Number.isFinite(fitted) ? fitted : 1));
  return {
    scale,
    offsetX: centreX - ((minX + maxX) / 2) * scale,
    offsetY: centreY - ((minY + maxY) / 2) * scale,
  };
}

const area = (r: Rect) => Math.max(0, r.width) * Math.max(0, r.height);

/**
 * The largest part of the container left once each obstacle (a panel over the
 * map) is cut away from the side it sits nearest: a tall panel takes its side
 * off, a short bar takes the top or bottom off, whichever leaves more room.
 * Obstacles outside the container are ignored. Larger obstacles are cut first,
 * so the result does not depend on the order they are given in.
 */
export function freeArea(container: Rect, obstacles: readonly Rect[], gap = 16): Rect {
  let free: Rect = { ...container };
  const sorted = [...obstacles].sort((a, b) => area(b) - area(a) || a.left - b.left || a.top - b.top);
  for (const o of sorted) {
    const right = free.left + free.width;
    const bottom = free.top + free.height;
    const oRight = o.left + o.width;
    const oBottom = o.top + o.height;
    // Only an obstacle that overlaps what is still free changes anything.
    if (o.width <= 0 || o.height <= 0 || oRight <= free.left || o.left >= right || oBottom <= free.top || o.top >= bottom) continue;
    const cuts: Rect[] = [
      { left: oRight + gap, top: free.top, width: right - (oRight + gap), height: free.height },
      { left: free.left, top: free.top, width: o.left - gap - free.left, height: free.height },
      { left: free.left, top: oBottom + gap, width: free.width, height: bottom - (oBottom + gap) },
      { left: free.left, top: free.top, width: free.width, height: o.top - gap - free.top },
    ];
    let best = cuts[0];
    for (const cut of cuts) if (area(cut) > area(best)) best = cut;
    if (area(best) <= 0) continue;
    free = best;
  }
  return free;
}
