// Draws the map on a canvas: the camera, the projection for the flat and 3D
// views, hit-testing and painting. It knows nothing about the page around it;
// viewer.ts tells it what is selected, on the path or lit by a job, which part
// of the canvas is free of panels, and when to draw. What a job lights is
// worked out by src/lib/graph/routes.ts; the renderer only draws the tiers.
//
// It draws on demand, never in a loop: a frame is asked for when something
// changes, and a camera move is animated only when the visitor has not asked
// for reduced motion. Colours, sizes and the font are literal values from
// src/lib/graph/style.ts, because a canvas cannot read CSS custom properties.
// Which edges to draw, where the drawing fits and where labels go are worked
// out by the tested modules in src/lib/graph/.
import { layerLabel, type Graph, type GraphEdge, type GraphNode } from '../../lib/graph/model';
import type { Layout } from '../../lib/graph/layout';
import type { ViewMode } from '../../lib/graph/url-state';
import { edgesToDraw, isQuietType } from '../../lib/graph/edge-filter';
import { fitToRect, type Circle, type Rect } from '../../lib/graph/fit';
import { placeLabels, type Box, type LabelRequest } from '../../lib/graph/labels';
import type { RouteLit } from '../../lib/graph/routes';
import { edgeStyle, FONT, kindStyle, LABEL_STYLE, LAYER_TITLE_STYLE, nodeRadius, PALETTE, PATH_STYLE, ROUTE_STYLE, screenRadius, type Shape } from '../../lib/graph/style';

type Tier = 'strong' | 'soft' | 'faint' | 'dim';

interface Point {
  node: GraphNode;
  index: number;
  x: number;
  y: number;
  z: number;
  radius: number;
  degree: number;
  /** Screen position, mark radius and depth after the last projection. */
  sx: number;
  sy: number;
  sr: number;
  depth: number;
  scale: number;
}

export interface Highlight {
  selected: string | null;
  hovered: string | null;
  /** Node ids on the path, in order; empty when there is none. */
  path: string[];
  pathEdges: GraphEdge[];
  /** Draw every "mentions" and "filed in" edge, not only those of the selected and pointed-at pages. */
  showAll: boolean;
  /** The job open on the map, whole or at a step; null for the ordinary map. */
  route: RouteLit | null;
}

interface Region {
  label: string;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  fill: string;
  /** The title's width on screen, in pixels, measured once. */
  titleWidth: number;
}

const MIN_ZOOM = 0.08;
const MAX_ZOOM = 4;
const FOV = 1800;
/** Padding around each layer's region, in map units; the top holds the title. */
const REGION_PAD = 46;
/** Room above each region's marks for its title, in screen pixels at any zoom. */
const TITLE_SPACE = 34;

export class MapRenderer {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly points: Point[];
  private readonly byId: Map<string, Point>;
  private readonly edges: { edge: GraphEdge; a: Point; b: Point }[];
  private readonly regions: Region[];
  private readonly centre: { x: number; y: number };
  private readonly labelWidths = new Map<string, number>();
  /** Where the region titles were drawn this frame; labels keep clear of them. */
  private titleBoxes: Box[] = [];
  private width = 0;
  private height = 0;
  private ratio = 1;
  /** The part of the canvas no panel covers, in canvas pixels. */
  private free: Rect = { left: 0, top: 0, width: 1, height: 1 };
  /** Camera: the map point (relative to the map's middle) at the centre of the free area, and the zoom. */
  private view = { x: 0, y: 0, k: 1 };
  private yaw = 0.5;
  private pitch = -0.45;
  private mode: ViewMode = '2d';
  private highlight: Highlight = { selected: null, hovered: null, path: [], pathEdges: [], showAll: false, route: null };
  private frameRequested = false;
  private flight: number | null = null;
  private frames = 0;
  /** Whether the visitor has moved the camera since the last fit; a fitted view refits when the free area changes. */
  private moved = false;
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
      return { node, index, x: p.x, y: p.y, z: p.z, radius: nodeRadius(d), degree: d, sx: 0, sy: 0, sr: 0, depth: 0, scale: 1 };
    });
    this.byId = new Map(this.points.map((p) => [p.node.id, p]));
    this.edges = graph.edges.map((edge) => ({ edge, a: this.byId.get(edge.from)!, b: this.byId.get(edge.to)! }));
    this.centre = { x: layout.bounds.width / 2, y: layout.bounds.height / 2 };
    this.regions = (['defence', 'business'] as const)
      .map((layer) => {
        const pts = this.points.filter((p) => p.node.layer === layer);
        return {
          label: layerLabel(layer).toUpperCase(),
          minX: Math.min(...pts.map((p) => p.x - p.radius)) - REGION_PAD,
          minY: Math.min(...pts.map((p) => p.y - p.radius)) - REGION_PAD,
          maxX: Math.max(...pts.map((p) => p.x + p.radius)) + REGION_PAD,
          maxY: Math.max(...pts.map((p) => p.y + p.radius)) + REGION_PAD,
          fill: layer === 'defence' ? PALETTE.regionDefence : PALETTE.regionBusiness,
          titleWidth: 0,
        };
      })
      .filter((r) => Number.isFinite(r.minX));
    // The layers sit close; split the padding between them so the two
    // regions meet with a gap and never overlap.
    if (this.regions.length === 2) {
      const [d, b] = this.regions;
      const defenceEdge = d.maxX - REGION_PAD;
      const businessEdge = b.minX + REGION_PAD;
      if (d.maxX > b.minX - 12) {
        const mid = (defenceEdge + businessEdge) / 2;
        d.maxX = Math.max(defenceEdge, mid - 6);
        b.minX = Math.min(businessEdge, mid + 6);
      }
    }
    ctx.font = LAYER_TITLE_STYLE.font;
    ctx.letterSpacing = LAYER_TITLE_STYLE.letterSpacing;
    for (const r of this.regions) r.titleWidth = ctx.measureText(r.label).width;
    ctx.letterSpacing = '0px';
    this.resize();
    this.free = { left: 0, top: 0, width: this.width, height: this.height };
    this.fit();
  }

  get frameCount(): number {
    return this.frames;
  }

  get viewMode(): ViewMode {
    return this.mode;
  }

  /** Takes the canvas's new size, keeping the view where it was unless it is still the fitted view. */
  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.ratio = Math.min(window.devicePixelRatio || 1, 2);
    this.width = Math.max(1, rect.width);
    this.height = Math.max(1, rect.height);
    this.canvas.width = Math.round(this.width * this.ratio);
    this.canvas.height = Math.round(this.height * this.ratio);
    this.requestDraw();
  }

  /**
   * Tells the renderer which part of the canvas the panels leave free. A view
   * the visitor has not moved is fitted again into the new area; a moved view
   * stays where it is on screen.
   */
  setFreeArea(area: Rect, options: { animate?: boolean } = {}): void {
    const before = this.free;
    const same = before.left === area.left && before.top === area.top && before.width === area.width && before.height === area.height;
    if (same) return;
    this.free = { ...area };
    if (!this.moved) {
      this.fit({ animate: options.animate });
      return;
    }
    // Keep every mark where it is: shift the camera by the move of the free area's centre.
    const dx = area.left + area.width / 2 - (before.left + before.width / 2);
    const dy = area.top + area.height / 2 - (before.top + before.height / 2);
    this.stopFlight();
    this.view = { x: this.view.x + dx / this.view.k, y: this.view.y + dy / this.view.k, k: this.view.k };
    this.requestDraw();
  }

  /** Shows the whole map in the free area. */
  fit(options: { animate?: boolean } = {}): void {
    this.stopFlight();
    this.moved = false;
    const target = this.fitTarget();
    if (options.animate) this.moveTo(target, { byVisitor: false });
    else {
      this.view = target;
      this.requestDraw();
    }
  }

  setMode(mode: ViewMode): void {
    this.mode = mode;
    this.fit();
  }

  setHighlight(next: Partial<Highlight>): void {
    this.highlight = { ...this.highlight, ...next };
    this.requestDraw();
  }

  zoomBy(factor: number, sx = this.free.left + this.free.width / 2, sy = this.free.top + this.free.height / 2): void {
    this.stopFlight();
    this.moved = true;
    const k2 = this.clampZoom(this.view.k * factor);
    const { fx, fy } = this.frameCentre();
    // Keep the point under (sx, sy) where it is.
    this.view.x += (sx - fx) * (1 / this.view.k - 1 / k2);
    this.view.y += (sy - fy) * (1 / this.view.k - 1 / k2);
    this.view.k = k2;
    this.requestDraw();
  }

  /** Moves the map by screen pixels. */
  panBy(dx: number, dy: number): void {
    this.stopFlight();
    this.moved = true;
    this.view.x -= dx / this.view.k;
    this.view.y -= dy / this.view.k;
    this.requestDraw();
  }

  /** Turns the 3D view by screen pixels of drag. */
  turnBy(dx: number, dy: number): void {
    this.moved = true;
    this.yaw += dx * 0.006;
    this.pitch = Math.max(-1.3, Math.min(1.3, this.pitch + dy * 0.006));
    this.requestDraw();
  }

  /** Brings a node into the middle of the free area: a short flight, or a jump when motion is reduced. */
  focusOn(id: string, minZoom = 0.55): void {
    const p = this.byId.get(id);
    if (!p) return;
    const b = this.base(p);
    this.moveTo({ x: b.x, y: b.y, k: this.clampZoom(Math.max(this.view.k, minZoom)) }, { byVisitor: true });
  }

  /** Brings a set of nodes into view together. */
  focusOnAll(ids: string[]): void {
    const pts = ids.map((id) => this.byId.get(id)).filter((p): p is Point => !!p);
    if (!pts.length) return;
    // A wider margin, so the labels of the ends have room inside the free area.
    const target = this.fitTargetFor(pts, 1.4, false, Math.min(90, Math.min(this.free.width, this.free.height) * 0.18));
    this.moveTo(target, { byVisitor: true });
  }

  /** The node under a point on the canvas, if any. */
  nodeAt(sx: number, sy: number): string | null {
    let best: Point | null = null;
    let bestD = Infinity;
    for (const p of this.points) {
      // A target at least 24 pixels across, whatever the mark's size.
      const r = Math.max(p.sr + 4, 12);
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
    const drawn = this.drawEdges();
    this.drawNodes();
    const ms = performance.now() - start;
    const data = this.canvas.dataset;
    data.frames = String(this.frames);
    data.drawMs = ms.toFixed(1);
    data.edgesDrawn = String(drawn);
    data.zoom = this.view.k.toFixed(3);
    // How many nodes a job lights, strongly and softly; empty on the ordinary map.
    const route = this.activeRoute();
    data.lit = route ? String(route.strong.size + route.soft.size) : '';
    // The flat view's transform from map units to canvas pixels, for anything
    // outside that needs to know where a node is drawn.
    if (this.mode === '2d') {
      const { fx, fy } = this.frameCentre();
      const k = this.view.k;
      data.view = `${k} ${(-this.centre.x - this.view.x) * k + fx} ${(-this.centre.y - this.view.y) * k + fy}`;
    } else data.view = '';
    return ms;
  }

  private clampZoom(k: number): number {
    return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, k));
  }

  private frameCentre() {
    return { fx: this.free.left + this.free.width / 2, fy: this.free.top + this.free.height / 2 };
  }

  /** A map point relative to the map's middle: as laid out in the flat view, turned and in perspective in 3D. */
  private base(p: { x: number; y: number; z: number }): { x: number; y: number; scale: number } {
    if (this.mode === '2d') return { x: p.x - this.centre.x, y: p.y - this.centre.y, scale: 1 };
    const r = this.rotate(p);
    return { x: r.x * r.scale, y: r.y * r.scale, scale: r.scale };
  }

  private fitTarget(): { x: number; y: number; k: number } {
    return this.fitTargetFor(this.points, MAX_ZOOM, true);
  }

  /**
   * The camera that fits these points into the free area. Marks and titles
   * keep their size on screen while the map scales, so the fit is worked out
   * twice: once to find the zoom, then again with their sizes at that zoom.
   */
  private fitTargetFor(pts: Point[], maxZoom: number, withRegions = false, margin?: number): { x: number; y: number; k: number } {
    const fitAt = (k: number) => {
      const circles: Circle[] = pts.map((p) => {
        const b = this.base(p);
        return { x: b.x, y: b.y, r: screenRadius(p.radius * b.scale, k) / k };
      });
      if (withRegions && this.mode === '2d') {
        // The regions and their titles are part of what has to fit.
        for (const r of this.regions) {
          const titleRight = r.minX + (40 + r.titleWidth + 12) / k;
          circles.push(
            { x: r.minX - this.centre.x, y: r.minY - TITLE_SPACE / k - this.centre.y, r: 0 },
            { x: Math.max(r.maxX, titleRight) - this.centre.x, y: r.maxY - this.centre.y, r: 0 },
          );
        }
      }
      return fitToRect(circles, this.free, { minScale: MIN_ZOOM, maxScale: maxZoom, margin });
    };
    // Titles keep their size while the map shrinks, so settle the zoom over a
    // few rounds; it converges from above in a handful.
    let fit = fitAt(this.view.k || 1);
    for (let i = 0; i < 6; i++) fit = fitAt(fit.scale);
    const { fx, fy } = this.frameCentre();
    return { x: (fx - fit.offsetX) / fit.scale, y: (fy - fit.offsetY) / fit.scale, k: fit.scale };
  }

  private moveTo(target: { x: number; y: number; k: number }, options: { byVisitor: boolean }): void {
    this.stopFlight();
    if (options.byVisitor) this.moved = true;
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
    const { fx, fy } = this.frameCentre();
    for (const p of this.points) {
      const b = this.base(p);
      p.sx = (b.x - this.view.x) * k + fx;
      p.sy = (b.y - this.view.y) * k + fy;
      p.scale = b.scale;
      p.depth = this.mode === '2d' ? 0 : this.rotate(p).z;
      p.sr = screenRadius(p.radius * b.scale, k);
    }
  }

  private toScreen(x: number, y: number) {
    const { fx, fy } = this.frameCentre();
    return { x: (x - this.centre.x - this.view.x) * this.view.k + fx, y: (y - this.centre.y - this.view.y) * this.view.k + fy };
  }

  private drawRegions(): void {
    const { ctx } = this;
    this.titleBoxes = [];
    for (const r of this.regions) {
      const a = this.toScreen(r.minX, r.minY);
      a.y -= TITLE_SPACE;
      const b = this.toScreen(r.maxX, r.maxY);
      ctx.fillStyle = r.fill;
      ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
      ctx.strokeStyle = PALETTE.regionEdge;
      ctx.lineWidth = 1;
      ctx.setLineDash([]);
      ctx.strokeRect(Math.round(a.x) + 0.5, Math.round(a.y) + 0.5, Math.round(b.x - a.x), Math.round(b.y - a.y));
      ctx.font = LAYER_TITLE_STYLE.font;
      ctx.letterSpacing = LAYER_TITLE_STYLE.letterSpacing;
      ctx.fillStyle = LAYER_TITLE_STYLE.colour;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      // A short accent rule before the title, as the page's kickers have.
      ctx.fillStyle = PALETTE.signal;
      ctx.fillRect(a.x + 14, a.y + 17, 18, 2);
      ctx.fillStyle = LAYER_TITLE_STYLE.colour;
      ctx.fillText(r.label, a.x + 40, a.y + 12);
      this.titleBoxes.push([a.x + 10, a.y + 6, a.x + 44 + r.titleWidth, a.y + 28]);
      ctx.letterSpacing = '0px';
    }
  }

  /** The job to draw, unless a path is shown, which takes its place. */
  private activeRoute(): RouteLit | null {
    return this.highlight.pathEdges.length > 0 ? null : this.highlight.route;
  }

  private tierOf(route: RouteLit, id: string): Tier {
    if (route.strong.has(id)) return 'strong';
    if (route.soft.has(id)) return 'soft';
    if (route.faint.has(id)) return 'faint';
    return 'dim';
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

  /** Draws the edges and returns how many were drawn. */
  private drawEdges(): number {
    const { ctx } = this;
    const { selected, hovered, pathEdges, showAll } = this.highlight;
    const onPath = new Set(pathEdges);
    const anyPath = onPath.size > 0;
    const shown = edgesToDraw(this.edges.map((e) => e.edge), { selected, hovered, showAll });
    const shownSet = new Set(shown);
    let count = 0;
    ctx.lineCap = 'butt';
    const route = this.activeRoute();
    if (route) return this.drawRouteEdges(route, shownSet);
    for (const { edge, a, b } of this.edges) {
      if (onPath.has(edge) || !shownSet.has(edge)) continue;
      const near = (selected !== null && (edge.from === selected || edge.to === selected)) || (hovered !== null && (edge.from === hovered || edge.to === hovered));
      const quiet = isQuietType(edge.type);
      const style = edgeStyle(edge.type);
      let alpha: number;
      if (anyPath) alpha = 0.07;
      else if (selected) alpha = near ? 0.95 : 0.06;
      else if (near) alpha = 0.9;
      else alpha = quiet ? 0.22 : 0.55;
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = style.colour;
      ctx.lineWidth = near ? style.width + 0.6 : style.width;
      ctx.setLineDash(style.dash);
      ctx.beginPath();
      ctx.moveTo(a.sx, a.sy);
      ctx.lineTo(b.sx, b.sy);
      ctx.stroke();
      count++;
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
        count++;
      }
    }
    ctx.setLineDash([]);
    return count;
  }

  /**
   * The edges with a job open: the rest of the map pale underneath, then the
   * job's other steps and the filing of the defence pages, then the lit step on
   * top in its own line patterns, heavier than usual.
   */
  private drawRouteEdges(route: RouteLit, shown: Set<GraphEdge>): number {
    const { ctx } = this;
    const { selected, hovered } = this.highlight;
    const tiers = new Map<GraphEdge, Tier>();
    for (const e of route.faintEdges) tiers.set(e, 'faint');
    for (const e of route.softEdges) tiers.set(e, 'soft');
    for (const e of route.strongEdges) tiers.set(e, 'strong');
    let count = 0;
    for (const pass of ['dim', 'faint', 'soft', 'strong'] as const) {
      for (const { edge, a, b } of this.edges) {
        const tier = tiers.get(edge) ?? 'dim';
        if (tier !== pass) continue;
        const near = (selected !== null && (edge.from === selected || edge.to === selected)) || (hovered !== null && (edge.from === hovered || edge.to === hovered));
        if (tier === 'dim' && !shown.has(edge)) continue;
        const style = edgeStyle(edge.type);
        const look = ROUTE_STYLE[tier];
        ctx.globalAlpha = tier === 'dim' && near ? 0.8 : look.edgeAlpha;
        ctx.strokeStyle = style.colour;
        ctx.lineWidth = tier === 'strong' ? style.width + ROUTE_STYLE.strong.edgeExtra : near ? style.width + 0.6 : style.width;
        ctx.setLineDash(style.dash);
        ctx.beginPath();
        ctx.moveTo(a.sx, a.sy);
        ctx.lineTo(b.sx, b.sy);
        ctx.stroke();
        count++;
      }
    }
    ctx.globalAlpha = 1;
    ctx.setLineDash([]);
    return count;
  }

  private drawNodes(): void {
    const { ctx } = this;
    const { selected, hovered, path } = this.highlight;
    const focus = this.focusSet();
    const onPath = new Set(path);
    const route = this.activeRoute();
    const order = this.mode === '3d' ? [...this.points].sort((a, b) => b.depth - a.depth || a.index - b.index) : [...this.points];
    // With a job open the dimmed marks go first, so every lit mark is drawn over them.
    if (route && this.mode === '2d') {
      const rank: Record<Tier, number> = { dim: 0, faint: 1, soft: 2, strong: 3 };
      order.sort((a, b) => rank[this.tierOf(route, a.node.id)] - rank[this.tierOf(route, b.node.id)] || a.index - b.index);
    }
    const strong: LabelRequest[] = [];
    const ordinary: LabelRequest[] = [];
    const marks: Box[] = [];
    /** With a job open, the lit marks the job's own labels keep clear of. */
    const litMarks: Box[] = [];
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of order) {
      if (p.sx < -40 || p.sx > this.width + 40 || p.sy < -40 || p.sy > this.height + 40) continue;
      minX = Math.min(minX, p.sx - p.sr * 1.2);
      minY = Math.min(minY, p.sy - p.sr * 1.2);
      maxX = Math.max(maxX, p.sx + p.sr * 1.2);
      maxY = Math.max(maxY, p.sy + p.sr * 1.2);
      const isSelected = p.node.id === selected;
      const isHovered = p.node.id === hovered;
      if (route) {
        this.drawRouteNode(p, route, { isSelected, isHovered, focus }, { strong, ordinary, marks, litMarks });
        continue;
      }
      const r = p.sr;
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
      if (isSelected || isHovered || onPath.has(p.node.id)) {
        ctx.globalAlpha = 1;
        this.shape(shape, p.sx, p.sy, r + 4);
        ctx.lineWidth = isSelected ? 3 : 2;
        ctx.strokeStyle = PALETTE.ink;
        ctx.stroke();
      }
      if (dim) continue;
      if (r >= 4.5) marks.push([p.sx - r, p.sy - r, p.sx + r, p.sy + r]);
      const forced = isSelected || isHovered || onPath.has(p.node.id);
      if (forced) {
        let priority = 1e6 + p.degree;
        if (isHovered) priority += 1e6;
        if (isSelected) priority += 2e6;
        strong.push(this.labelRequest(p, priority, true));
      } else if (r >= LABEL_STYLE.minRadius || (focus && focus.has(p.node.id))) {
        ordinary.push(this.labelRequest(p, p.radius * 1000 + p.degree, false));
      }
    }
    ctx.globalAlpha = 1;
    this.canvas.dataset.nodeBounds = Number.isFinite(minX) ? `${minX.toFixed(1)} ${minY.toFixed(1)} ${maxX.toFixed(1)} ${maxY.toFixed(1)}` : '';
    // The labels the visitor asked for first, clear only of each other; then
    // as many others as fit, clear of those and of the larger marks.
    // Labels stay inside the free area, never under a panel or the headline.
    const f = this.free;
    const bounds: Box = [Math.max(2, f.left), Math.max(2, f.top), Math.min(this.width - 2, f.left + f.width), Math.min(this.height - 2, f.top + f.height)];
    const titles = this.mode === '2d' ? this.titleBoxes : [];
    let placedStrong = placeLabels(strong, { bounds, obstacles: litMarks });
    if (route) {
      // A lit label that finds no place clear of the lit marks is still shown, clear of the other labels.
      const placedIds = new Set(placedStrong.map((l) => l.id));
      const rest = strong.filter((req) => !placedIds.has(req.id));
      if (rest.length) placedStrong = [...placedStrong, ...placeLabels(rest, { bounds, obstacles: placedStrong.map((l) => l.box) })];
    }
    const placed = placeLabels(ordinary, { bounds, obstacles: [...marks, ...titles, ...placedStrong.map((l) => l.box)] });
    this.drawLabels(placedStrong, true);
    this.drawLabels(placed, false);
  }

  /**
   * One mark with a job open. Its tier sets its size, ring and tone; the lit
   * marks are named first, the others only where there is room, the dimmed
   * never. A page chosen while the job is open is drawn as chosen.
   */
  private drawRouteNode(
    p: Point,
    route: RouteLit,
    { isSelected, isHovered, focus }: { isSelected: boolean; isHovered: boolean; focus: Set<string> | null },
    out: { strong: LabelRequest[]; ordinary: LabelRequest[]; marks: Box[]; litMarks: Box[] },
  ): void {
    const { ctx } = this;
    let tier = this.tierOf(route, p.node.id);
    // The chosen page and its neighbours are not dimmed, so a choice made while the job is open can be seen.
    if (tier === 'dim' && (isSelected || isHovered || (focus !== null && focus.has(p.node.id)))) tier = 'faint';
    const look = ROUTE_STYLE[tier];
    const r = p.sr * look.scale;
    const { colour, shape } = kindStyle(p.node.kind, p.node.layer);
    const defence = p.node.layer === 'defence';
    ctx.globalAlpha = look.alpha;
    this.shape(shape, p.sx, p.sy, r);
    ctx.fillStyle = defence ? colour : PALETTE.white;
    ctx.fill();
    ctx.lineWidth = defence ? 1 : Math.max(1.5, Math.min(2.5, r * 0.35));
    ctx.strokeStyle = defence ? PALETTE.white : colour;
    ctx.stroke();
    ctx.globalAlpha = 1;
    if (tier === 'strong') {
      const s = ROUTE_STYLE.strong;
      this.shape(shape, p.sx, p.sy, r + s.ringGap);
      ctx.lineWidth = s.ringWidth;
      ctx.strokeStyle = s.ring;
      ctx.stroke();
    } else if (tier === 'faint') {
      const f = ROUTE_STYLE.faint;
      ctx.globalAlpha = 0.9;
      this.shape(shape, p.sx, p.sy, r + f.ringGap);
      ctx.lineWidth = f.ringWidth;
      ctx.strokeStyle = f.ring;
      ctx.setLineDash([...f.ringDash]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }
    if (isSelected || isHovered) {
      this.shape(shape, p.sx, p.sy, r + (tier === 'strong' ? ROUTE_STYLE.strong.ringGap + 4 : 4));
      ctx.lineWidth = isSelected ? 3 : 2;
      ctx.strokeStyle = PALETTE.ink;
      ctx.stroke();
    }
    if (tier === 'dim') return;
    const ring = tier === 'strong' ? ROUTE_STYLE.strong.ringGap + ROUTE_STYLE.strong.ringWidth : 0;
    const box: Box = [p.sx - r - ring, p.sy - r - ring, p.sx + r + ring, p.sy + r + ring];
    if (r >= 4.5) out.marks.push(box);
    if (tier === 'strong' || tier === 'faint') out.litMarks.push(box);
    if (tier === 'strong' || isSelected || isHovered) {
      let priority = 1e6 + p.degree;
      if (route.labels.has(p.node.id)) priority += 5e5;
      if (isHovered) priority += 1e6;
      if (isSelected) priority += 2e6;
      out.strong.push(this.labelRequest(p, priority, true, r + ring));
    } else if (tier === 'faint' || r >= LABEL_STYLE.minRadius) {
      // The job's other steps are few and always offered a label; the defence
      // pages behind a step can be hundreds, so only the larger are, as on the
      // ordinary map. Faint before soft, larger before smaller.
      out.ordinary.push(this.labelRequest(p, (tier === 'faint' ? 1e5 : 0) + p.radius * 1000 + p.degree, false, r));
    }
  }

  private labelText(p: Point): string {
    // A label the job gives (the example business) is shown whole.
    const given = this.activeRoute()?.labels.get(p.node.id);
    if (given) return given;
    const name = p.node.name;
    return name.length > LABEL_STYLE.maxChars ? `${name.slice(0, LABEL_STYLE.maxChars - 1).trimEnd()}…` : name;
  }

  private labelFont(strong: boolean): string {
    return strong ? `${LABEL_STYLE.strongWeight} ${LABEL_STYLE.strongSize}px ${FONT}` : `${LABEL_STYLE.weight} ${LABEL_STYLE.size}px ${FONT}`;
  }

  private labelRequest(p: Point, priority: number, strong: boolean, radius?: number): LabelRequest {
    const text = this.labelText(p);
    const key = `${strong ? 's' : 'o'}${p.node.id}\u0000${text}`;
    let width = this.labelWidths.get(key);
    if (width === undefined) {
      this.ctx.font = this.labelFont(strong);
      width = this.ctx.measureText(text).width;
      this.labelWidths.set(key, width);
    }
    const size = strong ? LABEL_STYLE.strongSize : LABEL_STYLE.size;
    return { id: p.node.id, x: p.sx, y: p.sy, r: radius ?? p.sr + (strong ? 4 : 0), width: width + LABEL_STYLE.haloWidth, height: size + 4, priority };
  }

  private drawLabels(labels: ReturnType<typeof placeLabels>, strong: boolean): void {
    const { ctx } = this;
    ctx.font = this.labelFont(strong);
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = LABEL_STYLE.haloWidth;
    ctx.strokeStyle = LABEL_STYLE.halo;
    ctx.fillStyle = LABEL_STYLE.colour;
    for (const label of labels) {
      const p = this.byId.get(label.id)!;
      const text = this.labelText(p);
      ctx.textAlign = label.align;
      const x = label.align === 'left' ? label.textX + LABEL_STYLE.haloWidth / 2 : label.align === 'right' ? label.textX - LABEL_STYLE.haloWidth / 2 : label.textX;
      ctx.strokeText(text, x, label.textY);
      ctx.fillText(text, x, label.textY);
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
