// The whole map: the defence wheel on the left, the business tree on the
// right, and the bands between them.
//
// A band runs from the wheel to each folder that holds defence pages, as wide
// as the number of pages (one width unit per page, with a floor so a single
// page still shows). It leaves the wheel through the gap in the outer ring,
// swells from nothing to its full width, and narrows again into the folder's
// mark, so it reads as the pages flowing into the folder that holds them.
//
// Labels on the wheel are placed once for every step of the zoom ladder
// (ZOOM_STEPS). Each label is given the first step at which it fits beside
// its mark without covering another label or mark at that step or any later
// one, so zooming in only ever adds labels. Marks and labels keep their size
// on screen, so their boxes are worked out in screen pixels and turned into
// map units at each step's scale.
import type { Graph } from './model';
import type { RouteInput } from './routes';
import { overlaps, r1, ZOOM_STEPS, type Box } from './view-common';
import { fitText, textWidth, type TextStyle } from './view-text';
import { treeLayout, type TreeLayout } from './view-tree';
import { wheelLayout, type WheelLayout, type WheelMark } from './view-wheel';

export interface Band {
  folder: string;
  count: number;
  width: number;
  /** The filled outline, in map units. */
  d: string;
  /** The centre line's ends. */
  start: { x: number; y: number };
  end: { x: number; y: number };
}

export interface TieredLabel {
  /** The mark it names, or the group's key for a group label. */
  id: string;
  /** A mark's name; a group's name set straight outside the outer ring; or a group's name set along its arc in the middle ring. */
  kind: 'hub' | 'group' | 'arc';
  text: string;
  /** The anchor, in map units: the mark's centre, or a point just outside a group's arc. */
  x: number;
  y: number;
  /** Where the text sits relative to the anchor, in screen pixels, and how it is aligned. */
  tx: number;
  ty: number;
  align: 'start' | 'middle' | 'end';
  /** The box it takes relative to the anchor, in screen pixels: [left, top, right, bottom]. */
  box: Box;
  /** The first step of the zoom ladder at which it is shown. */
  tier: number;
  /** For text along an arc: the path it follows, in map units, centred on the label's middle. */
  arc?: { r: number; a0: number; a1: number; d: string; width: number };
}

export interface WholeMap {
  width: number;
  height: number;
  wheel: WheelLayout;
  /** Where the wheel's centre sits on the map. */
  wheelAt: { x: number; y: number };
  tree: TreeLayout;
  treeAt: { x: number; y: number };
  bands: Band[];
  labels: TieredLabel[];
  /** The tree for phone width, set beneath the wheel rather than beside it. */
  narrowTree: TreeLayout;
}

export const HUB_STYLE: TextStyle = { size: 12, weight: 600 };
export const GROUP_STYLE: TextStyle = { size: 10.5, mono: true, tracking: 0.12 };
const LABEL_HEIGHT = 15;
const ARC_HEIGHT = 14;
/** How many of the busiest hubs may label over minor marks. */
const MAJOR_HUBS = 14;
const LABEL_GAP = 4;
const LABEL_MAX = 190;
const PER_PAGE = 0.115;
const BAND_FLOOR = 1.6;

/** The boxes a label takes in map units at a scale (screen pixels per map unit): one for straight text, a run along the arc for curved text. */
export function labelBoxesAt(label: Pick<TieredLabel, 'x' | 'y' | 'box' | 'arc'>, scale: number): Box[] {
  if (!label.arc) return [[label.x + label.box[0] / scale, label.y + label.box[1] / scale, label.x + label.box[2] / scale, label.y + label.box[3] / scale]];
  const { r, a0, a1, width } = label.arc;
  const mid = (a0 + a1) / 2;
  const half = width / 2 / scale / r;
  const size = ARC_HEIGHT / scale;
  const n = Math.max(2, Math.ceil((2 * half * r) / size) + 1);
  const boxes: Box[] = [];
  for (let i = 0; i < n; i++) {
    const a = mid - half + (2 * half * i) / (n - 1);
    const x = label.x + r * Math.cos(a);
    const y = label.y + r * Math.sin(a);
    boxes.push([x - size / 2, y - size / 2, x + size / 2, y + size / 2]);
  }
  return boxes;
}

/** Whether curved text fits its arc at a scale, with room at each end. */
function arcFits(arc: NonNullable<TieredLabel['arc']>, scale: number): boolean {
  return (arc.a1 - arc.a0) * arc.r * scale >= arc.width + 24;
}

export function bandWidth(count: number): number {
  return r1(Math.max(BAND_FLOOR, count * PER_PAGE));
}

/** The group label's text: its name and count, as the drawing sets it. */
export function groupLabelText(label: string, count: number): string {
  return `${label} · ${count}`.toUpperCase();
}

export function wholeMapLayout(graph: Graph, routes: readonly RouteInput[]): WholeMap {
  const wheel = wheelLayout(graph);
  const tree = treeLayout(graph, routes);
  const narrowTree = treeLayout(graph, routes, { narrow: true });
  const outer = Math.max(wheel.radius, 120);
  const wheelAt = { x: r1(outer + 90), y: r1(Math.max(outer + 60, tree.height / 2)) };
  const treeAt = { x: r1(wheelAt.x + outer + 200), y: r1(Math.max(10, wheelAt.y - tree.height / 2)) };
  const width = r1(treeAt.x + tree.width + 20);
  const height = r1(Math.max(wheelAt.y + outer + 60, treeAt.y + tree.height + 20));
  // The wheel's lines, drawn where the wheel sits.
  wheel.edges = wheelLayout(graph, { at: wheelAt }).edges;
  const bands = bandsLayout(graph, wheel, wheelAt, tree, treeAt);
  const labels = placeLabels(graph, wheel, wheelAt, [[treeAt.x - 16, treeAt.y - 20, treeAt.x + tree.width, treeAt.y + tree.height]]);
  return { width, height, wheel, wheelAt, tree, treeAt, bands, labels, narrowTree };
}

// ---- bands --------------------------------------------------------------------

function bandsLayout(graph: Graph, wheel: WheelLayout, wheelAt: { x: number; y: number }, tree: TreeLayout, treeAt: { x: number; y: number }): Band[] {
  const counts = new Map<string, number>();
  for (const e of graph.edges) {
    if (e.type !== 'in_folder') continue;
    if (graph.byId.get(e.from)?.layer !== 'defence' || graph.byId.get(e.to)?.kind !== 'folder') continue;
    counts.set(e.to, (counts.get(e.to) ?? 0) + 1);
  }
  const rows = new Map(tree.rows.map((r) => [r.id, r]));
  const folders = [...counts.keys()].filter((f) => rows.has(f)).sort((a, b) => rows.get(a)!.y - rows.get(b)!.y);
  const widths = folders.map((f) => bandWidth(counts.get(f)!));
  const gap = 5;
  const stack = widths.reduce((a, b) => a + b, 0) + gap * Math.max(0, folders.length - 1);
  // The bands leave from the inside edge of the outer ring's gap, stacked about the wheel's centre line.
  const x0 = wheelAt.x + Math.min(wheel.radius - 30, 290);
  let y = wheelAt.y - stack / 2;
  return folders.map((folder, i) => {
    const w = widths[i];
    const row = rows.get(folder)!;
    const start = { x: r1(x0), y: r1(y + w / 2) };
    const end = { x: r1(treeAt.x + row.x - 9), y: r1(treeAt.y + row.y) };
    y += w + gap;
    return { folder, count: counts.get(folder)!, width: w, d: ribbon(start, end, w, Math.min(w, 9)), start, end };
  });
}

/** A filled ribbon along a smooth S from start to end: from nothing, to its width, to the end width. */
function ribbon(start: { x: number; y: number }, end: { x: number; y: number }, width: number, endWidth: number): string {
  const n = 28;
  const dx = (end.x - start.x) * 0.5;
  const p = (t: number) => {
    const u = 1 - t;
    const x = u * u * u * start.x + 3 * u * u * t * (start.x + dx) + 3 * u * t * t * (end.x - dx) + t * t * t * end.x;
    const y = u * u * u * start.y + 3 * u * u * t * start.y + 3 * u * t * t * end.y + t * t * t * end.y;
    return { x, y };
  };
  const smooth = (v: number) => v * v * (3 - 2 * v);
  const half = (t: number) => {
    if (t < 0.24) return (width / 2) * smooth(t / 0.24);
    if (t > 0.86) return endWidth / 2 + (width / 2 - endWidth / 2) * smooth((1 - t) / 0.14);
    return width / 2;
  };
  const top: string[] = [];
  const bottom: string[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = p(Math.max(0, t - 0.01));
    const b = p(Math.min(1, t + 0.01));
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const nx = -(b.y - a.y) / len;
    const ny = (b.x - a.x) / len;
    const c = p(t);
    const h = half(t);
    top.push(`${r1(c.x + nx * h)},${r1(c.y + ny * h)}`);
    bottom.push(`${r1(c.x - nx * h)},${r1(c.y - ny * h)}`);
  }
  return `M${top.join(' L')} L${bottom.reverse().join(' L')} Z`;
}

// ---- labels -------------------------------------------------------------------

interface Request {
  id: string;
  kind: TieredLabel['kind'];
  text: string;
  x: number;
  y: number;
  priority: number;
  forced: boolean;
  /** Candidate placements, best first: text position, alignment and box, in screen pixels from the anchor, or an arc to follow. */
  options: { tx: number; ty: number; align: TieredLabel['align']; box: Box; arc?: TieredLabel['arc'] }[];
  /** The mark this labels, which its own box may touch. */
  own: number;
  /** One of the busiest hubs, whose label may lie over a minor mark (fewer than three named connections) but never over another. */
  major?: boolean;
  /** Named connections, for a mark's label: the fewer it has, the further in it is first named. */
  degree: number;
}

/** The fewest named connections a page needs to be named at each step of the zoom, so the overview names only the hubs. */
const MIN_DEGREE = [8, 6, 5, 4, 3, 2, 1, 0, 0, 0];

function hubOptions(m: WheelMark, w: number): Request['options'] {
  const g = m.r + LABEL_GAP;
  const h = LABEL_HEIGHT;
  const right = { tx: g, ty: 4, align: 'start' as const, box: [g - 2, -h / 2, g + w + 2, h / 2] as Box };
  const left = { tx: -g, ty: 4, align: 'end' as const, box: [-g - w - 2, -h / 2, -g + 2, h / 2] as Box };
  const above = { tx: 0, ty: -g - 4, align: 'middle' as const, box: [-w / 2 - 2, -g - h, w / 2 + 2, -g] as Box };
  const below = { tx: 0, ty: g + 11, align: 'middle' as const, box: [-w / 2 - 2, g, w / 2 + 2, g + h] as Box };
  // Away from the centre first, so labels fan outwards.
  const order = m.x >= 0 ? [right, above, below, left] : [left, above, below, right];
  return order.map((o) => ({ ...o, box: o.box.map(r1) as Box }));
}

function placeLabels(graph: Graph, wheel: WheelLayout, at: { x: number; y: number }, worldObstacles: Box[]): TieredLabel[] {
  const marks = wheel.marks;
  const requests: Request[] = [];
  marks.forEach((m, i) => {
    const node = graph.byId.get(m.id)!;
    const text = fitText(node.name, LABEL_MAX, HUB_STYLE);
    const w = textWidth(text, HUB_STYLE);
    const forced = m.id === wheel.centre;
    const priority = forced ? 1e7 : m.kind === 'example-business' ? 5e5 : m.degree * 10 + (m.quiet ? 0 : 5);
    requests.push({ id: m.id, kind: 'hub', text, x: r1(at.x + m.x), y: r1(at.y + m.y), priority, forced, options: hubOptions(m, w), own: i, degree: forced || m.kind === 'example-business' ? Infinity : m.degree });
  });
  const outerInner = Math.min(...wheel.groups.filter((g) => g.ring === 'outer').map((g) => g.r0), Infinity);
  for (const g of wheel.groups) {
    const text = groupLabelText(g.label, g.count);
    const w = textWidth(text, GROUP_STYLE);
    if (g.ring === 'middle') {
      // Along the arc, in the band between the middle and the outer ring.
      const r = r1(Number.isFinite(outerInner) ? (g.r1 + outerInner) / 2 : g.r1 + 24);
      const mid = (g.a0 + g.a1) / 2;
      const p = (a: number) => `${r1(at.x + r * Math.cos(a))},${r1(at.y + r * Math.sin(a))}`;
      const large = g.a1 - g.a0 > Math.PI ? 1 : 0;
      // Upright either way: clockwise across the top, anticlockwise across the bottom.
      const d = Math.sin(mid) <= 0 ? `M${p(g.a0)} A${r},${r} 0 ${large} 1 ${p(g.a1)}` : `M${p(g.a1)} A${r},${r} 0 ${large} 0 ${p(g.a0)}`;
      requests.push({ id: g.key, kind: 'arc', text, x: at.x, y: at.y, priority: 3e6 + g.count, forced: false, options: [{ tx: 0, ty: 0, align: 'middle', box: [0, 0, 0, 0], arc: { r, a0: g.a0, a1: g.a1, d, width: r1(w) } }], own: -1, degree: Infinity });
      continue;
    }
    const mid = (g.a0 + g.a1) / 2;
    const c = Math.cos(mid);
    const s = Math.sin(mid);
    const rr = g.r1 + 9;
    const off = 6;
    const align: TieredLabel['align'] = c > 0.34 ? 'start' : c < -0.34 ? 'end' : 'middle';
    const ox = c * off;
    const oy = s * off;
    const left = align === 'start' ? ox : align === 'end' ? ox - w : ox - w / 2;
    // Above the anchor in the top half, below it in the bottom half, centred on it at the sides.
    const top = align === 'middle' ? (s < 0 ? oy - 13 : oy) : oy - 7;
    requests.push({
      id: g.key,
      kind: 'group',
      text,
      x: r1(at.x + rr * c),
      y: r1(at.y + rr * s),
      priority: 2e6 + g.count,
      forced: false,
      options: [{ tx: r1(align === 'start' ? left : align === 'end' ? left + w : left + w / 2), ty: r1(top + 10), align, box: [left - 2, top - 1, left + w + 2, top + 13].map(r1) as Box }],
      own: -1,
      degree: Infinity,
    });
  }
  requests.sort((a, b) => b.priority - a.priority || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  requests.filter((r) => r.kind === 'hub').slice(0, MAJOR_HUBS).forEach((r) => (r.major = true));

  const steps = ZOOM_STEPS;
  const markBoxes = steps.map((s) => marks.map((m) => [at.x + m.x - m.r / s, at.y + m.y - m.r / s, at.x + m.x + m.r / s, at.y + m.y + m.r / s] as Box));
  const placedBoxes: Box[][] = steps.map(() => []);
  const result: TieredLabel[] = [];
  const fits = (req: Request, option: Request['options'][number], from: number) => {
    for (let j = from; j < steps.length; j++) {
      const s = steps[j];
      if (option.arc && !arcFits(option.arc, s)) return false;
      for (const b of labelBoxesAt({ x: req.x, y: req.y, box: option.box, arc: option.arc }, s)) {
        for (const o of worldObstacles) if (overlaps(b, o)) return false;
        const pb = placedBoxes[j];
        for (let k = 0; k < pb.length; k++) if (overlaps(b, pb[k])) return false;
        if (req.forced) continue;
        const mb = markBoxes[j];
        for (let k = 0; k < mb.length; k++) if (k !== req.own && !(req.major && marks[k].degree < 3) && overlaps(b, mb[k])) return false;
      }
    }
    return true;
  };
  // In order of priority, each label takes the earliest step at which it fits,
  // so a label never loses its place to a less important one.
  for (const req of requests) {
    placing: for (let step = 0; step < steps.length; step++) {
      if (req.degree < MIN_DEGREE[Math.min(step, MIN_DEGREE.length - 1)]) continue;
      for (const option of req.options) {
        if (!fits(req, option, step)) continue;
        for (let j = step; j < steps.length; j++) placedBoxes[j].push(...labelBoxesAt({ x: req.x, y: req.y, box: option.box, arc: option.arc }, steps[j]));
        const label: TieredLabel = { id: req.id, kind: req.kind, text: req.text, x: req.x, y: req.y, tx: r1(option.tx), ty: r1(option.ty), align: option.align, box: option.box, tier: step };
        if (option.arc) label.arc = option.arc;
        result.push(label);
        break placing;
      }
    }
  }
  return result;
}
