// Home page acceptance test 1: fitting the drawing to the free part of the window.
import { describe, expect, it } from 'vitest';
import { applyFit, fitToRect, freeArea, type Circle, type Rect } from '../../src/lib/graph/fit';
import { seededRandom } from '../../src/lib/graph/layout';

function scatter(count: number, seed: number, spanX: number, spanY: number): Circle[] {
  const random = seededRandom(seed);
  return Array.from({ length: count }, () => ({ x: 100 + random() * spanX, y: 300 + random() * spanY, r: 4 + random() * 20 }));
}

function expectInside(points: Circle[], rect: Rect, fit: ReturnType<typeof fitToRect>) {
  for (const p of points) {
    const s = applyFit(fit, p);
    const r = p.r * fit.scale;
    expect(s.x - r).toBeGreaterThanOrEqual(rect.left - 1e-9);
    expect(s.x + r).toBeLessThanOrEqual(rect.left + rect.width + 1e-9);
    expect(s.y - r).toBeGreaterThanOrEqual(rect.top - 1e-9);
    expect(s.y + r).toBeLessThanOrEqual(rect.top + rect.height + 1e-9);
  }
}

function usedShare(points: Circle[], rect: Rect, fit: ReturnType<typeof fitToRect>) {
  const xs = points.flatMap((p) => [applyFit(fit, p).x - p.r * fit.scale, applyFit(fit, p).x + p.r * fit.scale]);
  const ys = points.flatMap((p) => [applyFit(fit, p).y - p.r * fit.scale, applyFit(fit, p).y + p.r * fit.scale]);
  return { width: (Math.max(...xs) - Math.min(...xs)) / rect.width, height: (Math.max(...ys) - Math.min(...ys)) / rect.height };
}

describe('fitting the drawing to a free rectangle', () => {
  const cases: [string, Circle[], Rect][] = [
    ['a wide drawing in a tall space', scatter(200, 3, 2200, 900), { left: 600, top: 60, width: 640, height: 780 }],
    ['a tall drawing in a wide space', scatter(120, 5, 400, 1300), { left: 0, top: 0, width: 1400, height: 600 }],
    ['a drawing far from the origin in a small space', scatter(60, 9, 300, 300).map((p) => ({ ...p, x: p.x + 9000 })), { left: 20, top: 20, width: 320, height: 240 }],
    ['a phone-sized space', scatter(461, 11, 2300, 1400), { left: 0, top: 0, width: 375, height: 420 }],
  ];

  it.each(cases)('puts every node inside the rectangle: %s', (_name, points, rect) => {
    expectInside(points, rect, fitToRect(points, rect));
  });

  it.each(cases)('uses at least 80%% of the width or the height: %s', (_name, points, rect) => {
    const used = usedShare(points, rect, fitToRect(points, rect));
    expect(Math.max(used.width, used.height)).toBeGreaterThanOrEqual(0.8);
  });

  it('centres the drawing in the rectangle', () => {
    const points: Circle[] = [{ x: 0, y: 0, r: 0 }, { x: 100, y: 50, r: 0 }];
    const rect: Rect = { left: 500, top: 100, width: 400, height: 400 };
    const fit = fitToRect(points, rect, { margin: 0 });
    const a = applyFit(fit, points[0]);
    const b = applyFit(fit, points[1]);
    expect((a.x + b.x) / 2).toBeCloseTo(700);
    expect((a.y + b.y) / 2).toBeCloseTo(300);
  });

  it('gives the same fit for the same input', () => {
    const [, points, rect] = cases[0];
    expect(fitToRect(points, rect)).toEqual(fitToRect(points, rect));
  });

  it('copes with a single node and with none', () => {
    const rect: Rect = { left: 0, top: 0, width: 300, height: 200 };
    const one = fitToRect([{ x: 40, y: 40, r: 5 }], rect, { maxScale: 4 });
    expect(Number.isFinite(one.scale)).toBe(true);
    expect(applyFit(one, { x: 40, y: 40 })).toEqual({ x: 150, y: 100 });
    expect(Number.isFinite(fitToRect([], rect).scale)).toBe(true);
  });
});

describe('the free part of the window', () => {
  const window: Rect = { left: 0, top: 0, width: 1280, height: 660 };

  it('is the whole window when nothing covers it', () => {
    expect(freeArea(window, [], 0)).toEqual(window);
  });

  it('starts to the right of a headline panel on the left', () => {
    const area = freeArea(window, [{ left: 32, top: 120, width: 540, height: 420 }], 24);
    expect(area.left).toBe(32 + 540 + 24);
    expect(area.left + area.width).toBe(1280);
    expect(area.top).toBe(0);
    expect(area.height).toBe(660);
  });

  it('leaves out panels on both sides', () => {
    const area = freeArea(window, [{ left: 16, top: 16, width: 340, height: 600 }, { left: 900, top: 16, width: 364, height: 500 }], 16);
    expect(area.left).toBe(16 + 340 + 16);
    expect(area.left + area.width).toBe(900 - 16);
  });

  it('takes a short bar across the top off the top, not off a side', () => {
    const area = freeArea(window, [{ left: 880, top: 12, width: 380, height: 44 }], 12);
    expect(area.top).toBe(12 + 44 + 12);
    expect(area.width).toBe(1280);
  });

  it('ignores anything outside the window', () => {
    expect(freeArea(window, [{ left: 2000, top: 0, width: 100, height: 100 }], 10)).toEqual(window);
  });
});
