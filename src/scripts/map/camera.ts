// Zoom and movement for the whole map. The drawing is SVG built at build time;
// moving it only changes its viewBox, one attribute, so a frame costs almost
// nothing however many marks there are.
//
// Marks and labels on the wheel keep their size on screen while the map
// zooms: the drawing carries a class for the nearest step of a fine scale
// ladder (us-<n>), and the stylesheet scales those marks by its inverse
// (--u). Labels belong to steps of the coarser zoom ladder the layout placed
// them for (view-common.ts); the drawing carries z0 to z<step> for the steps
// reached, and a label shows from its own step upwards. No style attribute is
// ever written.
//
// A camera move is animated only when the visitor has not asked for reduced
// motion; then it is a jump. Every applied frame is counted in data-frames so
// tests can tell a flight from a jump.
import { stepFor, ZOOM_STEPS } from '../../lib/graph/view-common';
import type { Rect } from '../../lib/graph/fit';

/** The fine ladder for keeping marks a steady size: 0.2 × 1.08^n screen pixels per map unit. */
export const U_BASE = 0.2;
export const U_RATIO = 1.08;
export const U_COUNT = 49;
const MIN_SCALE = 0.2;
const MAX_SCALE = 7;

export interface View {
  /** Screen pixels per map unit. */
  s: number;
  /** Where the map's origin is drawn, in the drawing's own pixels. */
  ox: number;
  oy: number;
}

type Box = [number, number, number, number];

export class MapCamera {
  readonly svg: SVGSVGElement;
  private view: View = { s: 1, ox: 0, oy: 0 };
  private free: Rect = { left: 0, top: 0, width: 1, height: 1 };
  private flight: number | null = null;
  private frames = 0;
  private step = -1;
  private uStep = -1;
  /** Whether the visitor has moved the map since the last fit; a fitted map refits when its room changes. */
  moved = false;
  reducedMotion: boolean;
  /** Fit to the wheel alone (at phone width the tree sits beneath it), or to everything. */
  wheelOnly = false;
  /** Fit to the wheel alone, as the landing view does: the business structure joins on exploring. */
  leading = false;
  private readonly all: Box;
  private readonly wheel: Box;

  constructor(svg: SVGSVGElement, reducedMotion: boolean) {
    this.svg = svg;
    this.reducedMotion = reducedMotion;
    const n = (v: string | undefined) => (v ?? '').split(' ').map(Number);
    const [cx, cy, r] = n(svg.dataset.wheel);
    const [tx, ty, tw, th] = n(svg.dataset.tree);
    this.wheel = [cx - r - 8, cy - r - 8, cx + r + 8, cy + r + 8];
    this.all = Number.isFinite(tx) ? [Math.min(this.wheel[0], tx), Math.min(this.wheel[1], ty), Math.max(this.wheel[2], tx + tw), Math.max(this.wheel[3], ty + th)] : this.wheel;
  }

  get scale(): number {
    return this.view.s;
  }

  /** The drawing's size on screen. */
  private size() {
    const r = this.svg.getBoundingClientRect();
    return { w: r.width, h: r.height };
  }

  /** The view that fits a box into the free area. */
  private fitted(box: Box, margin = 24, labels = 0): View {
    const f = this.free;
    const bw = box[2] - box[0];
    const bh = box[3] - box[1];
    // Labels round the wheel keep their size on screen, so the room they need is kept in pixels, not map units.
    const s = Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.min((f.width - 2 * margin - 2 * labels) / bw, (f.height - 2 * margin - labels / 3) / bh)));
    return { s, ox: f.left + f.width / 2 - ((box[0] + box[2]) / 2) * s, oy: f.top + f.height / 2 - ((box[1] + box[3]) / 2) * s };
  }

  setFree(area: Rect, options: { animate?: boolean } = {}): void {
    this.free = area;
    if (!this.moved) this.fit(options);
  }

  fit(options: { animate?: boolean } = {}): void {
    this.moved = false;
    this.moveTo(this.fitted(this.box(), 16, this.wheelOnly ? 40 : 92), options.animate ?? false);
  }

  private box(): Box {
    return this.wheelOnly || this.leading ? this.wheel : this.all;
  }

  /** Zooms by a factor about a point on the drawing (its centre by default). */
  zoomBy(factor: number, sx?: number, sy?: number): void {
    const { w, h } = this.size();
    const px = sx ?? (this.free.width > 1 ? this.free.left + this.free.width / 2 : w / 2);
    const py = sy ?? (this.free.height > 1 ? this.free.top + this.free.height / 2 : h / 2);
    const v = this.flightTarget ?? this.view;
    const s = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.s * factor));
    const k = s / v.s;
    this.moved = true;
    this.stopFlight();
    this.apply({ s, ox: px - (px - v.ox) * k, oy: py - (py - v.oy) * k });
  }

  panBy(dx: number, dy: number): void {
    this.moved = true;
    this.stopFlight();
    this.apply({ s: this.view.s, ox: this.view.ox + dx, oy: this.view.oy + dy });
  }

  /** Brings map points into the free area, zooming in to at least a scale if asked, without zooming out. */
  focusOn(points: { x: number; y: number }[], options: { minScale?: number; animate?: boolean } = {}): void {
    if (!points.length) return;
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const box: Box = [Math.min(...xs) - 30, Math.min(...ys) - 30, Math.max(...xs) + 30, Math.max(...ys) + 30];
    const f = this.free;
    const v = this.view;
    const onScreen = (x: number, y: number) => {
      const sx = x * v.s + v.ox;
      const sy = y * v.s + v.oy;
      return sx >= f.left + 20 && sx <= f.left + f.width - 20 && sy >= f.top + 20 && sy <= f.top + f.height - 20;
    };
    const want = Math.max(v.s, options.minScale ?? 0);
    if (want === v.s && onScreen(box[0], box[1]) && onScreen(box[2], box[3])) return;
    const fit = this.fitted(box, 40);
    const s = Math.min(want, fit.s);
    const cx = (box[0] + box[2]) / 2;
    const cy = (box[1] + box[3]) / 2;
    this.moved = true;
    this.moveTo({ s, ox: f.left + f.width / 2 - cx * s, oy: f.top + f.height / 2 - cy * s }, options.animate ?? !this.reducedMotion);
  }

  /** Re-applies the current view, after the drawing changes size or is shown. */
  refresh(): void {
    this.apply(this.view, true);
  }

  private flightTarget: View | null = null;

  private moveTo(target: View, animate: boolean): void {
    this.stopFlight();
    if (!animate || this.reducedMotion) {
      this.apply(target);
      return;
    }
    const from = { ...this.view };
    const start = performance.now();
    const duration = 420;
    this.flightTarget = target;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const e = 1 - Math.pow(1 - t, 3);
      // Scale moves geometrically so a zoom feels even.
      const s = from.s * Math.pow(target.s / from.s, e);
      // Keep the screen point the target centres on moving in a straight line.
      const cx = this.free.left + this.free.width / 2;
      const cy = this.free.top + this.free.height / 2;
      const wxFrom = (cx - from.ox) / from.s;
      const wyFrom = (cy - from.oy) / from.s;
      const wxTo = (cx - target.ox) / target.s;
      const wyTo = (cy - target.oy) / target.s;
      const wx = wxFrom + (wxTo - wxFrom) * e;
      const wy = wyFrom + (wyTo - wyFrom) * e;
      this.apply({ s, ox: cx - wx * s, oy: cy - wy * s });
      if (t < 1) this.flight = requestAnimationFrame(tick);
      else {
        this.flight = null;
        this.flightTarget = null;
      }
    };
    this.flight = requestAnimationFrame(tick);
  }

  private stopFlight(): void {
    if (this.flight !== null) cancelAnimationFrame(this.flight);
    this.flight = null;
    this.flightTarget = null;
  }

  private apply(view: View, quiet = false): void {
    this.view = view;
    const { w, h } = this.size();
    if (w <= 0 || h <= 0) return;
    const { s, ox, oy } = view;
    this.svg.setAttribute('viewBox', `${r2(-ox / s)} ${r2(-oy / s)} ${r2(w / s)} ${r2(h / s)}`);
    const step = stepFor(s);
    if (step !== this.step) {
      for (let i = 0; i < ZOOM_STEPS.length; i++) this.svg.classList.toggle(`z${i}`, i <= step);
      this.step = step;
    }
    const u = Math.max(0, Math.min(U_COUNT - 1, Math.round(Math.log(s / U_BASE) / Math.log(U_RATIO))));
    if (u !== this.uStep) {
      if (this.uStep >= 0) this.svg.classList.remove(`us-${this.uStep}`);
      this.svg.classList.add(`us-${u}`);
      this.uStep = u;
    }
    const b = (box: Box) => `${r2(box[0] * s + ox)} ${r2(box[1] * s + oy)} ${r2(box[2] * s + ox)} ${r2(box[3] * s + oy)}`;
    this.svg.dataset.nodeBounds = b(this.box());
    this.svg.dataset.scale = s.toFixed(3);
    if (!quiet) this.svg.dataset.frames = String(++this.frames);
  }

  /** A point on the drawing, in its own pixels, as a map point. */
  toMap(sx: number, sy: number): { x: number; y: number } {
    return { x: (sx - this.view.ox) / this.view.s, y: (sy - this.view.oy) / this.view.s };
  }
}

const r2 = (n: number) => Math.round(n * 100) / 100;
