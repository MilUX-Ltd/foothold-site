// The four drawn views in the page: loading a view's drawing when it is first
// chosen, and keeping its marks in step with what the visitor has chosen.
// What a mark shows is a class on it, never a style:
//   is-pt     the page pointed at (by mouse or keyboard focus)
//   is-lit    a named neighbour of that page; the rest are quietened
//   is-sel    the selected page, and is-near for its named neighbours
//   r-strong, r-soft, r-faint   lit by a job, as src/lib/graph/routes.ts says
//   on-path   on the path asked for
// The drawing that holds them carries is-pointing, has-sel, has-route and
// has-path, so the stylesheet can quieten everything else.
//
// Marks in an SVG drawing become buttons named by their <title>, reached by
// one Tab stop per drawing and moved between with the arrow keys.
import { isNamedType } from '../../lib/graph/view-common';
import type { Graph, GraphEdge } from '../../lib/graph/model';
import type { RouteLit } from '../../lib/graph/routes';
import type { DrawnView } from '../../lib/graph/view-common';
import { buildScene } from './scene-dom';

const SVG_NS = 'http://www.w3.org/2000/svg';

interface PaneIndex {
  /** Marks and list buttons by page id. */
  byId: Map<string, Element[]>;
  /** Lines by each of their ends. */
  lines: Map<string, Element[]>;
  /** Elements belonging to a job: cards, steps and their lines. */
  routed: Element[];
  /** Bands, by folder. */
  bands: Map<string, Element>;
  /** The SVG marks, in reading order, for the arrow keys. */
  marks: SVGElement[];
  /** Drawings that carry the quietening classes. */
  roots: Element[];
}

export interface RouteState {
  id: string;
  step: number | null;
  lit: RouteLit;
}

export class Drawings {
  readonly root: HTMLElement;
  private readonly graph: Graph;
  private readonly indexes = new Map<string, PaneIndex>();
  private readonly loading = new Map<string, Promise<void>>();
  /** Elements given a class, by class, so each can be cleared without a search. */
  private readonly given = new Map<string, Set<Element>>();
  private current: string | null = null;

  constructor(root: HTMLElement, graph: Graph) {
    this.root = root;
    this.graph = graph;
  }

  pane(view: string): HTMLElement | null {
    return this.root.querySelector<HTMLElement>(`[data-view-pane="${view}"]`);
  }

  /** Loads a view's drawing if it is not in the page yet. */
  ensure(view: DrawnView): Promise<void> {
    const pane = this.pane(view);
    if (!pane) return Promise.reject(new Error(`No pane for ${view}`));
    if (this.indexes.has(view)) return Promise.resolve();
    const pending = this.loading.get(view);
    if (pending) return pending;
    const load = (async () => {
      const src = pane.dataset.src;
      if (src && !pane.firstElementChild) {
        const response = await fetch(src, { credentials: 'same-origin' });
        if (!response.ok) throw new Error(`The drawing answered ${response.status}`);
        pane.append(buildScene(await response.json()));
      }
      this.indexes.set(view, this.wire(pane));
    })();
    this.loading.set(view, load);
    load.catch(() => this.loading.delete(view));
    return load;
  }

  /** Whether a drawn view holds a page. */
  holds(view: string, id: string): boolean {
    return (this.indexes.get(view)?.byId.get(id)?.length ?? 0) > 0;
  }

  /** The marks a page has in a view. */
  marksOf(view: string, id: string): Element[] {
    return this.indexes.get(view)?.byId.get(id) ?? [];
  }

  private wire(pane: HTMLElement): PaneIndex {
    const byId = new Map<string, Element[]>();
    const lines = new Map<string, Element[]>();
    const bands = new Map<string, Element>();
    const add = (map: Map<string, Element[]>, key: string, el: Element) => {
      const list = map.get(key);
      if (list) list.push(el);
      else map.set(key, [el]);
    };
    const marks: SVGElement[] = [];
    for (const el of pane.querySelectorAll<HTMLElement | SVGElement>('.mk[data-id], .vl-btn[data-id]')) {
      add(byId, el.dataset.id!, el);
      if (el instanceof SVGElement) {
        el.setAttribute('role', 'button');
        el.setAttribute('tabindex', '-1');
        marks.push(el);
      }
    }
    // A page's name on the whole map follows its mark's state.
    for (const el of pane.querySelectorAll<SVGElement>('.lb[data-for]')) add(byId, el.dataset.for!, el);
    // One stop per drawing: the first mark of each takes Tab.
    for (const svg of pane.querySelectorAll('svg')) {
      const first = svg.querySelector('.mk[data-id]');
      if (first) first.setAttribute('tabindex', '0');
    }
    for (const el of pane.querySelectorAll<SVGElement>('.ln[data-from]')) {
      add(lines, el.dataset.from!, el);
      if (el.dataset.to) add(lines, el.dataset.to, el);
    }
    for (const el of pane.querySelectorAll<SVGElement>('.band[data-id]')) bands.set(el.dataset.id!, el);
    const routed = [...pane.querySelectorAll('[data-route]')];
    const roots = [pane, ...pane.querySelectorAll('svg.view-svg, svg.gl-tiles')];
    return { byId, lines, routed, bands, marks, roots };
  }

  /** Makes a view the one shown, and carries the current states across to it. */
  show(view: string): void {
    this.current = view;
  }

  // ---- states ---------------------------------------------------------------------------

  private give(cls: string, els: Iterable<Element>): void {
    let set = this.given.get(cls);
    if (!set) this.given.set(cls, (set = new Set()));
    for (const el of els) {
      el.classList.add(cls);
      set.add(el);
    }
  }

  private clear(...classes: string[]): void {
    for (const cls of classes) {
      const set = this.given.get(cls);
      if (!set) continue;
      for (const el of set) el.classList.remove(cls);
      set.clear();
    }
  }

  private index(): PaneIndex | null {
    return this.current ? (this.indexes.get(this.current) ?? null) : null;
  }

  private neighbours(id: string): Set<string> {
    const out = new Set<string>();
    for (const l of this.graph.links.get(id) ?? []) if (isNamedType(l.edge.type)) out.add(l.other);
    return out;
  }

  private linesBetween(ix: PaneIndex, id: string, others: Set<string>): Element[] {
    return (ix.lines.get(id) ?? []).filter((el) => {
      const e = el as SVGElement;
      const other = e.dataset.from === id ? e.dataset.to : e.dataset.from;
      return other !== undefined && others.has(other);
    });
  }

  /** The page pointed at, by mouse or keyboard, or none. */
  setPointed(id: string | null): void {
    this.clear('is-pt', 'is-lit', 'is-pointing');
    const ix = this.index();
    if (!ix || !id || !ix.byId.has(id)) return;
    const near = this.neighbours(id);
    this.give('is-pt', ix.byId.get(id) ?? []);
    for (const n of near) this.give('is-lit', ix.byId.get(n) ?? []);
    this.give('is-lit', this.linesBetween(ix, id, near));
    if (ix.bands.has(id)) this.give('is-lit', [ix.bands.get(id)!]);
    this.give('is-pointing', ix.roots);
  }

  setSelected(id: string | null): void {
    this.clear('is-sel', 'is-near', 'has-sel');
    const ix = this.index();
    if (!ix || !id || !ix.byId.has(id)) return;
    const near = this.neighbours(id);
    this.give('is-sel', ix.byId.get(id) ?? []);
    for (const n of near) this.give('is-near', ix.byId.get(n) ?? []);
    this.give('is-near', this.linesBetween(ix, id, near));
    if (ix.bands.has(id)) this.give('is-near', [ix.bands.get(id)!]);
    this.give('has-sel', ix.roots);
    // The selected mark takes the drawing's Tab stop, so Tab returns to it.
    for (const el of ix.byId.get(id) ?? []) {
      if (!(el instanceof SVGElement)) continue;
      const svg = el.ownerSVGElement;
      svg?.querySelector('.mk[tabindex="0"]')?.setAttribute('tabindex', '-1');
      el.setAttribute('tabindex', '0');
    }
  }

  setRoute(route: RouteState | null): void {
    this.clear('r-strong', 'r-soft', 'r-faint', 'has-route');
    this.root.dataset.lit = route ? `${route.id} ${route.step ?? 'whole'}` : '';
    const ix = this.index();
    if (!ix || !route) return;
    const { lit } = route;
    const isJobs = this.current === 'jobs';
    if (isJobs) {
      // Here the job's own cards and steps say which step is meant, so a skill used by another job is not lit with it.
      for (const el of ix.routed) {
        const e = el as HTMLElement | SVGElement;
        if (e.dataset.route !== route.id) continue;
        const step = e.dataset.step ? Number(e.dataset.step) : null;
        this.give(route.step === null || step === null || step === route.step ? 'r-strong' : 'r-faint', [el]);
      }
      for (const id of lit.strong) for (const el of ix.byId.get(id) ?? []) if (!(el as HTMLElement).dataset.route) this.give('r-strong', [el]);
      for (const id of lit.faint) for (const el of ix.byId.get(id) ?? []) if (!(el as HTMLElement).dataset.route) this.give('r-faint', [el]);
    } else {
      for (const [tier, ids] of [['r-strong', lit.strong], ['r-soft', lit.soft], ['r-faint', lit.faint]] as const) {
        for (const id of ids) this.give(tier, ix.byId.get(id) ?? []);
      }
      const mark = (edges: GraphEdge[], tier: string) => {
        for (const e of edges) {
          const els = (ix.lines.get(e.from) ?? []).filter((el) => (el as SVGElement).dataset.to === e.to && el.classList.contains(`t-${e.type}`));
          this.give(tier, els);
        }
      };
      mark(lit.strongEdges, 'r-strong');
      mark(lit.faintEdges, 'r-faint');
      // A folder whose pages a step lights has its band lit too.
      if (lit.soft.size) for (const id of lit.strong) if (ix.bands.has(id)) this.give('r-strong', [ix.bands.get(id)!]);
    }
    this.give('has-route', ix.roots);
  }

  setPath(nodes: string[], edges: GraphEdge[]): void {
    this.clear('on-path', 'has-path');
    const ix = this.index();
    const pane = this.current ? this.pane(this.current) : null;
    pane?.querySelectorAll('.path-layer').forEach((layer) => layer.replaceChildren());
    if (!ix || !nodes.length) return;
    for (const id of nodes) this.give('on-path', ix.byId.get(id) ?? []);
    for (const e of edges) {
      const els = (ix.lines.get(e.from) ?? []).filter((el) => (el as SVGElement).dataset.to === e.to);
      this.give('on-path', els);
    }
    this.give('has-path', ix.roots);
    // On the whole map, the path is drawn as its own line through the marks, whichever connections it follows.
    const layer = pane?.querySelector('.path-layer');
    if (!layer) return;
    const at = (id: string) => {
      const el = (ix.byId.get(id) ?? []).find((m) => (m as SVGElement).dataset.x !== undefined) as SVGElement | undefined;
      return el ? { x: Number(el.dataset.x), y: Number(el.dataset.y) } : null;
    };
    const points = nodes.map(at).filter((p): p is { x: number; y: number } => p !== null);
    if (points.length < 2) return;
    const line = document.createElementNS(SVG_NS, 'path');
    line.setAttribute('class', 'path-line');
    line.setAttribute('d', `M${points.map((p) => `${p.x},${p.y}`).join(' L')}`);
    layer.append(line);
  }

  /** The next mark for the arrow keys, skipping marks not on screen. */
  step(from: Element, by: number): SVGElement | null {
    const ix = this.index();
    if (!ix) return null;
    const visible = ix.marks.filter((m) => m.getClientRects().length > 0);
    if (!visible.length) return null;
    const i = visible.indexOf(from as SVGElement);
    if (by === Infinity) return visible[visible.length - 1];
    if (by === -Infinity) return visible[0];
    return visible[(i + by + visible.length) % visible.length];
  }
}
