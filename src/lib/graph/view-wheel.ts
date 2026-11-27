// The defence half of the whole map: a wheel around the Ministry of Defence.
//
// - The ministry is the centre. Its own organisations sit on rings by depth in
//   their parent tree, each within the arc its parent was given, so a branch
//   of the family keeps together.
// - The middle ring holds programmes, frameworks, portals and events; the outer
//   ring holds everyone else, by family. Each family is an arc of its ring,
//   and families never share an angle. The outer ring leaves a gap on the
//   right, where the bands to the business structure leave the wheel.
// - Named connections between defence pages are drawn as lines: the family
//   tree as spokes and elbows, the rest as curves pulled towards the centre.
//
// Positions are in map units with the centre at (0, 0). Mark sizes are in
// screen pixels: the page keeps marks the same size on screen at any zoom.
import { compareText, type Graph, type GraphNode } from './model';
import { byName, defenceFamilies, isNamedType, namedDegree, r1, type Ring } from './view-common';

export interface WheelMark {
  id: string;
  kind: string;
  /** The family's key: mod, programmes, investors and so on. */
  family: string;
  ring: Ring;
  x: number;
  y: number;
  /** Mark radius in screen pixels. */
  r: number;
  /** No named connection: drawn as a small quiet mark. */
  quiet: boolean;
  /** Named connections, which sets the size and the label's priority. */
  degree: number;
  /** For the ministry's family: depth in the parent tree (0 at the centre) and the arc the mark and its children share. */
  depth: number | null;
  arc: [number, number] | null;
  /** The ring band the mark sits in, so the draw-in can bring rings in turn: 0 centre, 1 to 4 the family, 5 middle, 6 outer. */
  band: number;
}

export interface WheelGroup {
  key: string;
  label: string;
  count: number;
  ring: Ring;
  /** The arc the group takes, in radians, a0 < a1. */
  a0: number;
  a1: number;
  /** The inner and outer radius of its marks. */
  r0: number;
  r1: number;
}

export interface WheelEdge {
  from: string;
  to: string;
  type: string;
  d: string;
}

export interface WheelLayout {
  centre: string | null;
  marks: WheelMark[];
  groups: WheelGroup[];
  edges: WheelEdge[];
  /** Faint guide circles behind the marks. */
  guides: number[];
  /** The ministry family's parent of each member, as the layout read it. */
  parents: Record<string, string>;
  /** The outermost mark radius, in map units. */
  radius: number;
  /** The gap in the outer ring the bands leave through, in radians. */
  gap: [number, number];
}

/** Radii of the family's rings by depth. Deeper levels step out more slowly. */
const DEPTH_RADIUS = [0, 76, 124, 160, 186];
const STAGGER = 13;
const MIDDLE_RINGS = [222, 243];
const OUTER_START = 296;
const OUTER_STEP = 18;
const GROUP_GAP = 0.055;
/** Half the width of the gap on the right of the outer ring. */
const BAND_GAP = 0.3;

export function markRadius(degree: number): number {
  if (degree === 0) return 2.6;
  return r1(Math.min(2.9 + Math.sqrt(degree) * 1.2, 9));
}

const TAU = Math.PI * 2;
const polar = (r: number, a: number) => ({ x: r1(r * Math.cos(a)), y: r1(r * Math.sin(a)) });
/** An angle rounded to a thousandth of a radian. */
const ra = (a: number) => Math.round(a * 1000) / 1000;

function depthRadius(depth: number): number {
  return depth < DEPTH_RADIUS.length ? DEPTH_RADIUS[depth] : DEPTH_RADIUS[DEPTH_RADIUS.length - 1] + (depth - DEPTH_RADIUS.length + 1) * 22;
}

export interface WheelOptions {
  /** Where the centre sits; (0, 0) unless given. */
  at?: { x: number; y: number };
}

export function wheelLayout(graph: Graph, options: WheelOptions = {}): WheelLayout {
  const at = options.at ?? { x: 0, y: 0 };
  const degree = namedDegree(graph);
  const families = defenceFamilies(graph);
  const marks: WheelMark[] = [];
  const groups: WheelGroup[] = [];
  const place = (node: GraphNode, family: string, ring: Ring, p: { x: number; y: number }, extra: Partial<WheelMark> & { band: number }) => {
    const d = degree.get(node.id) ?? 0;
    marks.push({ id: node.id, kind: node.kind, family, ring, x: p.x, y: p.y, r: markRadius(d), quiet: d === 0, degree: d, depth: null, arc: null, ...extra });
  };

  // ---- the ministry's family, as a radial tree -----------------------------
  const mod = families.find((f) => f.family.key === 'mod');
  const parents: Record<string, string> = {};
  let centre: string | null = null;
  if (mod) {
    const members = new Set(mod.nodes.map((n) => n.id));
    const written = new Map<string, string>();
    for (const e of graph.edges) {
      if (e.type === 'parent' && members.has(e.from) && members.has(e.to) && e.from !== e.to && !written.has(e.from)) written.set(e.from, e.to);
    }
    // A written parent that would close a loop is ignored.
    const rootOf = (id: string) => {
      const seen = new Set<string>();
      let at = id;
      while (written.has(at) && !seen.has(at)) {
        seen.add(at);
        at = written.get(at)!;
      }
      return seen.has(at) ? null : at;
    };
    const kids = new Map<string, string[]>();
    const tops = mod.nodes.filter((n) => !written.has(n.id) || rootOf(n.id) === null);
    const descendants = (id: string, seen = new Set<string>()): number => {
      let total = 0;
      for (const [child, parent] of written) {
        if (parent === id && !seen.has(child) && rootOf(child) !== null) {
          seen.add(child);
          total += 1 + descendants(child, seen);
        }
      }
      return total;
    };
    // The centre is the busiest member with no parent of its own: the ministry,
    // whose family's other heads are attached to it when no parent is written.
    centre = [...tops].sort((a, b) => (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0) || descendants(b.id) - descendants(a.id) || compareText(a.id, b.id))[0].id;
    for (const n of mod.nodes) {
      if (n.id === centre) continue;
      const p = written.has(n.id) && rootOf(n.id) !== null ? written.get(n.id)! : centre;
      parents[n.id] = p === n.id ? centre : p;
    }
    for (const [child, parent] of Object.entries(parents)) {
      const list = kids.get(parent) ?? [];
      list.push(child);
      kids.set(parent, list);
    }
    const weightMemo = new Map<string, number>();
    const weight = (id: string): number => {
      if (weightMemo.has(id)) return weightMemo.get(id)!;
      const w = 1 + (kids.get(id) ?? []).reduce((sum, k) => sum + weight(k), 0);
      weightMemo.set(id, w);
      return w;
    };
    const centreNode = graph.byId.get(centre)!;
    place(centreNode, 'mod', 'centre', { x: 0, y: 0 }, { depth: 0, arc: [-Math.PI / 2, -Math.PI / 2 + TAU], band: 0 });
    const layoutChildren = (id: string, a0: number, a1: number, depth: number) => {
      const children = (kids.get(id) ?? []).map((k) => graph.byId.get(k)!).sort(byName);
      const total = children.reduce((sum, c) => sum + weight(c.id), 0) || 1;
      let a = a0;
      children.forEach((child, i) => {
        const span = ((a1 - a0) * weight(child.id)) / total;
        const mid = a + span / 2;
        // Leaves alternate between two radii so neighbours on a crowded ring have room.
        const leaf = !(kids.get(child.id) ?? []).length;
        const r = depthRadius(depth) + (leaf && i % 2 === 1 ? STAGGER : 0);
        place(child, 'mod', 'centre', polar(r, mid), { depth, arc: [ra(a), ra(a + span)] as [number, number], band: Math.min(depth, 4) });
        layoutChildren(child.id, a, a + span, depth + 1);
        a += span;
      });
    };
    layoutChildren(centre, -Math.PI / 2, -Math.PI / 2 + TAU, 1);
  }

  // ---- the rings of families ------------------------------------------------
  const ringFamilies = (ring: Ring) => families.filter((f) => f.family.ring === ring);
  const layRing = (ring: 'middle' | 'outer', start: number, end: number, rowsFor: (count: number) => number, radiusOf: (row: number) => number, band: number, centreFirst = false) => {
    const list = ringFamilies(ring);
    if (!list.length) return;
    const cols = list.map((f) => Math.ceil(f.nodes.length / rowsFor(f.nodes.length)));
    const room = end - start - GROUP_GAP * Math.max(0, list.length - 1);
    const unit = room / cols.reduce((a, b) => a + b, 0);
    // A full ring can turn so its first group is centred on the start angle.
    let a = centreFirst ? start - (cols[0] * unit) / 2 : start;
    list.forEach((f, gi) => {
      const rows = rowsFor(f.nodes.length);
      const span = cols[gi] * unit;
      const sorted = [...f.nodes].sort((x, y) => (degree.get(y.id) ?? 0) - (degree.get(x.id) ?? 0) || byName(x, y));
      sorted.forEach((node, k) => {
        const col = Math.floor(k / rows);
        const row = k % rows;
        // Rows are offset by half a column so a group reads as a woven band, not a grid.
        const angle = a + (col + 0.5 + (row % 2 ? 0.25 : -0.25) * (rows > 1 ? 1 : 0)) * unit;
        place(node, f.family.key, ring, polar(radiusOf(row), angle), { band });
      });
      groups.push({ key: f.family.key, label: f.family.label, count: f.nodes.length, ring, a0: ra(a), a1: ra(a + span), r0: radiusOf(0), r1: radiusOf(rows - 1) });
      a += span + GROUP_GAP;
    });
  };
  // The middle ring runs right round, its first group (the programmes) centred at the top.
  layRing('middle', -Math.PI / 2, -Math.PI / 2 + TAU - GROUP_GAP, (n) => (n > 6 ? 2 : 1), (row) => MIDDLE_RINGS[row] ?? MIDDLE_RINGS[0], 5, true);
  // The outer ring runs clockwise from just below the gap on the right to just above it.
  layRing('outer', BAND_GAP, TAU - BAND_GAP, (n) => (n > 60 ? 3 : n > 7 ? 2 : 1), (row) => OUTER_START + row * OUTER_STEP, 6);

  // ---- lines ----------------------------------------------------------------
  // Lines are drawn where the wheel sits; the marks' own places stay relative to its centre.
  const placed = new Map(marks.map((m) => [m.id, { ...m, x: r1(m.x + at.x), y: r1(m.y + at.y) }]));
  const edges: WheelEdge[] = [];
  for (const e of graph.edges) {
    if (!isNamedType(e.type)) continue;
    const a = placed.get(e.from);
    const b = placed.get(e.to);
    if (!a || !b || e.from === e.to) continue;
    let d: string;
    if (e.type === 'parent' && parents[e.from] === e.to && a.family === 'mod') {
      d = treeLink(a, b, at);
    } else {
      // A curve whose middle is pulled towards the centre, so lines bundle through the wheel rather than across it.
      const mx = (a.x + b.x) / 2 - at.x;
      const my = (a.y + b.y) / 2 - at.y;
      const k = a.ring === b.ring && a.family === b.family ? 0.3 : 0.45;
      d = `M${a.x},${a.y} Q${r1(at.x + mx * (1 - k))},${r1(at.y + my * (1 - k))} ${b.x},${b.y}`;
    }
    edges.push({ from: e.from, to: e.to, type: e.type, d });
  }

  const radius = Math.max(0, ...marks.map((m) => Math.hypot(m.x, m.y)));
  const guides = [DEPTH_RADIUS[1], DEPTH_RADIUS[2], DEPTH_RADIUS[3], (MIDDLE_RINGS[0] + MIDDLE_RINGS[1]) / 2];
  return { centre, marks, groups, edges, guides, parents, radius: r1(radius), gap: [-BAND_GAP, BAND_GAP] };
}

/** A family-tree link: a spoke to the centre, or an elbow out from the parent's ring and round to the child. */
function treeLink(child: WheelMark, parent: WheelMark, at: { x: number; y: number }): string {
  const cx = child.x - at.x;
  const cy = child.y - at.y;
  const px = parent.x - at.x;
  const py = parent.y - at.y;
  const rc = Math.hypot(cx, cy);
  const rp = Math.hypot(px, py);
  if (rp < 1) return `M${parent.x},${parent.y} L${child.x},${child.y}`;
  const ac = Math.atan2(cy, cx);
  const ap = Math.atan2(py, px);
  const rm = r1(rp + (rc - rp) * 0.5);
  const q1 = polar(rm, ap);
  const q2 = polar(rm, ac);
  const p1 = { x: r1(q1.x + at.x), y: r1(q1.y + at.y) };
  const p2 = { x: r1(q2.x + at.x), y: r1(q2.y + at.y) };
  let delta = ac - ap;
  while (delta > Math.PI) delta -= TAU;
  while (delta < -Math.PI) delta += TAU;
  const sweep = delta > 0 ? 1 : 0;
  return `M${parent.x},${parent.y} L${p1.x},${p1.y} A${rm},${rm} 0 0 ${sweep} ${p2.x},${p2.y} L${child.x},${child.y}`;
}
