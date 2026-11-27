// Draws the map on a canvas: the camera, the projection for the flat and 3D
// views, hit-testing and painting. It knows nothing about the page around it;
// viewer.ts tells it what is selected and on the path, and when to draw.
//
// It draws on demand, never in a loop: a frame is asked for when something
// changes, and a camera move is animated only when the visitor has not asked
// for reduced motion. Colours, sizes and the font are literal values from
// src/lib/graph/style.ts, because a canvas cannot read CSS custom properties.
import type { Graph, GraphEdge, GraphNode } from '../../lib/graph/model';
import type { Layout } from '../../lib/graph/layout';
import type { ViewMode } from '../../lib/graph/url-state';
import { edgeStyle, FONT, kindStyle, nodeRadius, PALETTE, PATH_STYLE, type Shape } from '../../lib/graph/style';

interface Point {
  node: GraphNode;
  index: number;
  x: number;
  y: number;
  z: number;
  radius: number;
  degree: number;
  /** Screen position and scale after the last projection. */
  sx: number;
  sy: number;
  depth: number;
  scale: number;
}

export interface Highlight {
  selected: string | null;
  hovered: string | null;
  /** Node ids on the path, in order; empty when there is none. */
  path: string[];
  pathEdges: GraphEdge[];
}

const MIN_ZOOM = 0.12;
const MAX_ZOOM = 4;
const FOV = 1800;

export class MapRenderer {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly points: Point[];
  private readonly byId: Map<string, Point>;
  private readonly edges: { edge: GraphEdge; a: Point; b: Point }[];
  private readonly regions: { label: string; minX: number; minY: number; maxX: number; maxY: number }[];
  private readonly centre: { x: number; y: number };
  private width = 0;
  private height = 0;
  private ratio = 1;
  /** Camera: the map point at the centre of the canvas, and the zoom. */
  private view = { x: 0, y: 0, k: 1 };
  private yaw = 0.5;
  private pitch = -0.45;
  private mode: ViewMode = '2d';
  private highlight: Highlight = { selected: null, hovered: null, path: [], pathEdges: [] };
  private frameRequested = false;
  private flight: number | null = null;
  private frames = 0;
  reducedMotion: boolean;

  constructor(canvas: HTMLCanvasElement, graph: Graph, layout: Layout, reducedMotion: boolean) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('This browser cannot draw on a canvas');
    this.ctx = ctx;
    this.reducedMotion = reducedMotion;
    const degree = new Map<string, number>();
    for (const e of graph.edges) {
      degree.set(e.from, (degree.get(e.from) ?? 0) + 1);
      degree.set(e.to, (degree.get(e.to) ?? 0) + 1);
    }
    this.points = graph.nodes.map((node, index) => {
      const p = layout.positions[index];
      const d = degree.get(node.id) ?? 0;
      return { node, index, x: p.x, y: p.y, z: p.z, radius: nodeRadius(d), degree: d, sx: 0, sy: 0, depth: 0, scale: 1 };
    });
    this.byId = new Map(this.points.map((p) => [p.node.id, p]));
    this.edges = graph.edges.map((edge) => ({ edge, a: this.byId.get(edge.from)!, b: this.byId.get(edge.to)! }));
    this.centre = { x: layout.bounds.width / 2, y: layout.bounds.height / 2 };
    this.regions = (['defence', 'business'] as const).map((layer) => {
      const pts = this.points.filter((p) => p.node.layer === layer);
      const pad = 40;
      return {
        label: layer === 'defence' ? 'DEFENCE REFERENCE' : 'BUSINESS STRUCTURE',
        minX: Math.min(...pts.map((p) => p.x)) - pad,
        minY: Math.min(...pts.map((p) => p.y)) - pad,
        maxX: Math.max(...pts.map((p) => p.x)) + pad,
        maxY: Math.max(...pts.map((p) => p.y)) + pad,
      };
    }).filter((r) => Number.isFinite(r.minX));
    this.resize();
    this.fit();
  }

  get frameCount(): number {
    return this.frames;
  }

  get viewMode(): ViewMode {
    return this.mode;
  }

  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.ratio = Math.min(window.devicePixelRatio || 1, 2);
    this.width = Math.max(1, rect.width);
    this.height = Math.max(1, rect.height);
    this.canvas.width = Math.round(this.width * this.ratio);
    this.canvas.height = Math.round(this.height * this.ratio);
    this.requestDraw();
  }

  /** Shows the whole map. */
  fit(): void {
    this.stopFlight();
    const xs = this.points.map((p) => p.x);
    const ys = this.points.map((p) => p.y);
    const spanX = Math.max(...xs) - Math.min(...xs) + 120;
    const spanY = Math.max(...ys) - Math.min(...ys) + 160;
    this.view = {
      x: (Math.max(...xs) + Math.min(...xs)) / 2 - this.centre.x,
      y: (Math.max(...ys) + Math.min(...ys)) / 2 - this.centre.y,
      k: this.clampZoom(Math.min(this.width / spanX, this.height / spanY)),
    };
    // In 3D the map is turned and seen in perspective, about three quarters
    // of its flat size, around its middle.
    if (this.mode === '3d') this.view = { x: 0, y: 0, k: this.clampZoom(this.view.k * 1.2) };
    this.requestDraw();
  }

  setMode(mode: ViewMode): void {
    this.mode = mode;
    this.fit();
  }

  setHighlight(next: Partial<Highlight>): void {
    this.highlight = { ...this.highlight, ...next };
    this.requestDraw();
  }

  zoomBy(factor: number, sx = this.width / 2, sy = this.height / 2): void {
    this.stopFlight();
    const k2 = this.clampZoom(this.view.k * factor);
    // Keep the point under (sx, sy) where it is.
    this.view.x += (sx - this.width / 2) * (1 / this.view.k - 1 / k2);
    this.view.y += (sy - this.height / 2) * (1 / this.view.k - 1 / k2);
    this.view.k = k2;
    this.requestDraw();
  }

  /** Moves the map by screen pixels. */
  panBy(dx: number, dy: number): void {
    this.stopFlight();
    this.view.x -= dx / this.view.k;
    this.view.y -= dy / this.view.k;
    this.requestDraw();
  }

  /** Turns the 3D view by screen pixels of drag. */
  turnBy(dx: number, dy: number): void {
    this.yaw += dx * 0.006;
    this.pitch = Math.max(-1.3, Math.min(1.3, this.pitch + dy * 0.006));
    this.requestDraw();
  }

  /** Brings a node into view: a short flight, or a jump when motion is reduced. */
  focusOn(id: string, minZoom = 0.55): void {
    const p = this.byId.get(id);
    if (!p) return;
    const target = this.cameraTargetFor(p, Math.max(this.view.k, minZoom));
    this.moveTo(target);
  }

  /** Brings a set of nodes into view together. */
  focusOnAll(ids: string[]): void {
    const pts = ids.map((id) => this.byId.get(id)).filter((p): p is Point => !!p);
    if (!pts.length) return;
    if (this.mode === '3d') {
      this.focusOn(pts[0].node.id);
      return;
    }
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const spanX = Math.max(...xs) - Math.min(...xs) + 240;
    const spanY = Math.max(...ys) - Math.min(...ys) + 240;
    this.moveTo({
      x: (Math.max(...xs) + Math.min(...xs)) / 2 - this.centre.x,
      y: (Math.max(...ys) + Math.min(...ys)) / 2 - this.centre.y,
      k: this.clampZoom(Math.min(this.width / spanX, this.height / spanY, 1.4)),
    });
  }

  /** The node under a point on the canvas, if any. */
  nodeAt(sx: number, sy: number): string | null {
    let best: Point | null = null;
    let bestD = Infinity;
    for (const p of this.points) {
      const r = Math.max(p.radius * this.view.k * p.scale, 4) + 5;
      const d = Math.hypot(p.sx - sx, p.sy - sy);
      if (d < r && d < bestD) {
        best = p;
        bestD = d;
      }
    }
    return best ? best.node.id : null;
  }

  requestDraw(): void {
    if (this.frameRequested) return;
    this.frameRequested = true;
    requestAnimationFrame(() => {
      this.frameRequested = false;
      this.draw();
    });
  }

  /** Draws one frame now and returns how long it took, in milliseconds. */
  draw(): number {
    const start = performance.now();
    this.frames++;
    this.project();
    const { ctx } = this;
    ctx.setTransform(this.ratio, 0, 0, this.ratio, 0, 0);
    ctx.fillStyle = PALETTE.paper;
    ctx.fillRect(0, 0, this.width, this.height);
    if (this.mode === '2d') this.drawRegions();
    this.drawEdges();
    this.drawNodes();
    const ms = performance.now() - start;
    this.canvas.dataset.frames = String(this.frames);
    this.canvas.dataset.drawMs = ms.toFixed(1);
    return ms;
  }

  private clampZoom(k: number): number {
    return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, k));
  }

  private cameraTargetFor(p: Point, k: number) {
    if (this.mode === '2d') return { x: p.x - this.centre.x, y: p.y - this.centre.y, k };
    const r = this.rotate(p);
    return { x: r.x * r.scale, y: r.y * r.scale, k };
  }

  private moveTo(target: { x: number; y: number; k: number }): void {
    this.stopFlight();
    if (this.reducedMotion) {
      this.view = { ...target };
      this.requestDraw();
      return;
    }
    const from = { ...this.view };
    const t0 = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / 450);
      const e = 1 - Math.pow(1 - t, 3);
      this.view = { x: from.x + (target.x - from.x) * e, y: from.y + (target.y - from.y) * e, k: from.k + (target.k - from.k) * e };
      this.draw();
      this.flight = t < 1 ? requestAnimationFrame(step) : null;
    };
    this.flight = requestAnimationFrame(step);
  }

  private stopFlight(): void {
    if (this.flight !== null) cancelAnimationFrame(this.flight);
    this.flight = null;
  }

  /** A map point turned for the 3D view, centred on the map's middle, with its perspective scale. */
  private rotate(p: { x: number; y: number; z: number }) {
    const X = p.x - this.centre.x;
    const Y = p.y - this.centre.y;
    const Z = p.z;
    const cy = Math.cos(this.yaw);
    const sy = Math.sin(this.yaw);
    const cx = Math.cos(this.pitch);
    const sx = Math.sin(this.pitch);
    const x1 = X * cy + Z * sy;
    const z1 = -X * sy + Z * cy;
    const y2 = Y * cx - z1 * sx;
    const z2 = Y * sx + z1 * cx;
    const scale = FOV / (FOV + z2 + 600);
    return { x: x1, y: y2, z: z2, scale };
  }

  private project(): void {
    const { k } = this.view;
    for (const p of this.points) {
      if (this.mode === '2d') {
        p.sx = (p.x - this.centre.x - this.view.x) * k + this.width / 2;
        p.sy = (p.y - this.centre.y - this.view.y) * k + this.height / 2;
        p.depth = 0;
        p.scale = 1;
      } else {
        const r = this.rotate(p);
        p.sx = (r.x * r.scale - this.view.x) * k + this.width / 2;
        p.sy = (r.y * r.scale - this.view.y) * k + this.height / 2;
        p.depth = r.z;
        p.scale = r.scale;
      }
    }
  }

  private toScreen(x: number, y: number) {
    return { x: (x - this.centre.x - this.view.x) * this.view.k + this.width / 2, y: (y - this.centre.y - this.view.y) * this.view.k + this.height / 2 };
  }

  private drawRegions(): void {
    const { ctx } = this;
    this.regions.forEach((r, i) => {
      const a = this.toScreen(r.minX, r.minY);
      const b = this.toScreen(r.maxX, r.maxY);
      ctx.fillStyle = i === 0 ? PALETTE.regionDefence : PALETTE.regionBusiness;
      ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
      ctx.strokeStyle = PALETTE.line;
      ctx.lineWidth = 1;
      ctx.setLineDash([]);
      ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
      ctx.font = `500 11px "Roboto Mono", ui-monospace, Menlo, monospace`;
      ctx.fillStyle = PALETTE.ink3;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(r.label, a.x + 10, a.y + 8);
    });
  }

  private focusSet(): Set<string> | null {
    const { selected } = this.highlight;
    if (!selected) return null;
    const set = new Set([selected]);
    for (const { edge } of this.edges) {
      if (edge.from === selected) set.add(edge.to);
      if (edge.to === selected) set.add(edge.from);
    }
    return set;
  }

  private drawEdges(): void {
    const { ctx } = this;
    const { selected, pathEdges } = this.highlight;
    const onPath = new Set(pathEdges);
    const anyPath = onPath.size > 0;
    ctx.lineCap = 'butt';
    for (const { edge, a, b } of this.edges) {
      if (onPath.has(edge)) continue;
      const near = selected !== null && (edge.from === selected || edge.to === selected);
      const style = edgeStyle(edge.type);
      ctx.globalAlpha = anyPath ? 0.08 : selected ? (near ? 0.95 : 0.06) : edge.type === 'in_folder' || edge.type === 'mentions' ? 0.28 : 0.6;
      ctx.strokeStyle = style.colour;
      ctx.lineWidth = near ? style.width + 0.6 : style.width;
      ctx.setLineDash(style.dash);
      ctx.beginPath();
      ctx.moveTo(a.sx, a.sy);
      ctx.lineTo(b.sx, b.sy);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    if (anyPath) {
      ctx.strokeStyle = PATH_STYLE.colour;
      ctx.lineWidth = PATH_STYLE.width;
      ctx.setLineDash(PATH_STYLE.dash);
      ctx.lineCap = 'round';
      for (const { edge, a, b } of this.edges) {
        if (!onPath.has(edge)) continue;
        ctx.beginPath();
        ctx.moveTo(a.sx, a.sy);
        ctx.lineTo(b.sx, b.sy);
        ctx.stroke();
      }
    }
    ctx.setLineDash([]);
  }

  private drawNodes(): void {
    const { ctx } = this;
    const { selected, hovered, path } = this.highlight;
    const focus = this.focusSet();
    const onPath = new Set(path);
    const order = this.mode === '3d' ? [...this.points].sort((a, b) => b.depth - a.depth || a.index - b.index) : this.points;
    const labels: { p: Point; r: number; priority: number }[] = [];
    for (const p of order) {
      const r = Math.max(p.radius * this.view.k * p.scale, 2.5);
      if (p.sx < -40 || p.sx > this.width + 40 || p.sy < -40 || p.sy > this.height + 40) continue;
      const dim = (onPath.size > 0 && !onPath.has(p.node.id)) || (onPath.size === 0 && focus !== null && !focus.has(p.node.id));
      ctx.globalAlpha = dim ? 0.18 : 1;
      const { colour, shape } = kindStyle(p.node.kind, p.node.layer);
      const defence = p.node.layer === 'defence';
      this.shape(shape, p.sx, p.sy, r);
      ctx.fillStyle = defence ? colour : PALETTE.white;
      ctx.fill();
      ctx.lineWidth = defence ? 1 : Math.max(1.5, Math.min(2.5, r * 0.35));
      ctx.strokeStyle = defence ? PALETTE.white : colour;
      ctx.stroke();
      const isSelected = p.node.id === selected;
      if (isSelected || p.node.id === hovered || onPath.has(p.node.id)) {
        ctx.globalAlpha = 1;
        this.shape(shape, p.sx, p.sy, r + 4);
        ctx.lineWidth = isSelected ? 3 : 2;
        ctx.strokeStyle = PALETTE.ink;
        ctx.stroke();
      }
      if (!dim) {
        let priority = p.degree;
        if (onPath.has(p.node.id)) priority += 1e6;
        if (p.node.id === hovered) priority += 2e6;
        if (isSelected) priority += 3e6;
        if (priority >= 1e6 || r > 7 || (focus && focus.has(p.node.id))) labels.push({ p, r, priority });
      }
    }
    ctx.globalAlpha = 1;
    this.drawLabels(labels);
  }

  private drawLabels(labels: { p: Point; r: number; priority: number }[]): void {
    const { ctx } = this;
    labels.sort((a, b) => b.priority - a.priority || a.p.index - b.p.index);
    const boxes: [number, number, number, number][] = [];
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    for (const { p, r, priority } of labels) {
      const strong = priority >= 1e6;
      ctx.font = `${strong ? 700 : 600} ${strong ? 13 : 11.5}px ${FONT}`;
      const text = p.node.name.length > 48 ? `${p.node.name.slice(0, 46)}...` : p.node.name;
      const w = ctx.measureText(text).width;
      const ty = p.sy - r - 7;
      const box: [number, number, number, number] = [p.sx - w / 2 - 3, ty - 12, p.sx + w / 2 + 3, ty + 4];
      const clash = boxes.some((o) => box[0] < o[2] && box[2] > o[0] && box[1] < o[3] && box[3] > o[1]);
      if (clash && !strong) continue;
      boxes.push(box);
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = PALETTE.paper;
      ctx.lineJoin = 'round';
      ctx.strokeText(text, p.sx, ty);
      ctx.fillStyle = PALETTE.ink;
      ctx.fillText(text, p.sx, ty);
    }
  }

  private shape(shape: Shape, x: number, y: number, r: number): void {
    const { ctx } = this;
    ctx.beginPath();
    if (shape === 'circle') {
      ctx.arc(x, y, r, 0, Math.PI * 2);
      return;
    }
    if (shape === 'square') {
      const s = r * 0.9;
      ctx.rect(x - s, y - s, s * 2, s * 2);
      return;
    }
    if (shape === 'diamond') {
      ctx.moveTo(x, y - r * 1.15);
      ctx.lineTo(x + r * 1.15, y);
      ctx.lineTo(x, y + r * 1.15);
      ctx.lineTo(x - r * 1.15, y);
      ctx.closePath();
      return;
    }
    if (shape === 'triangle') {
      ctx.moveTo(x, y - r * 1.2);
      ctx.lineTo(x + r * 1.1, y + r * 0.8);
      ctx.lineTo(x - r * 1.1, y + r * 0.8);
      ctx.closePath();
      return;
    }
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i;
      const px = x + Math.cos(a) * r * 1.1;
      const py = y + Math.sin(a) * r * 1.1;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }
}
