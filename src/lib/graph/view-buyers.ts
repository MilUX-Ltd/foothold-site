// Who buys, and how you reach them: three columns.
//
// - On the left, programmes. In the middle, the bodies the work is for or that
//   run it. On the right, frameworks, portals and anything else that reaches
//   them (an event series run by a body sits here too).
// - Only pages with at least one customer, operator or service connection
//   appear; the rest are counted, so the page can say how many it leaves out.
// - The middle column puts the busiest bodies in the centre. The side columns
//   are then ordered by where their lines land, and neighbouring bodies swap
//   places while that removes crossings, so lines cross as little as the data
//   allows without moving the busiest bodies away from the centre.
//
// Every name is set at a readable size. A long name is cut with an ellipsis;
// the full name stays on the mark for assistive technology and on pointing.
import { compareText, type Graph, type GraphNode } from './model';
import { byName, r1, type Box } from './view-common';
import { fitText, textWidth, type TextStyle } from './view-text';

export const RELATION_TYPES = ['customer', 'operator', 'service'] as const;
export type Relation = (typeof RELATION_TYPES)[number];

export interface BuyerRow {
  id: string;
  name: string;
  /** The name as drawn, cut short if it is long. */
  text: string;
  kind: string;
  x: number;
  y: number;
  /** The middle column's boxes: their height, and how many lines arrive. */
  height: number;
  count: number;
}

export interface BuyerLink {
  from: string;
  to: string;
  type: Relation;
  d: string;
}

export interface BuyersLayout {
  width: number;
  height: number;
  left: BuyerRow[];
  middle: BuyerRow[];
  right: BuyerRow[];
  links: BuyerLink[];
  /** Defence pages with no such connection, left out of this view. */
  leftOut: number;
  /** The columns' x positions: the left marks, the middle box's edges and the right marks. */
  columns: { left: number; middleLeft: number; middleRight: number; right: number };
  /** Where the column headings sit. */
  headingY: number;
  texts: { text: string; box: Box }[];
}

export const BUYERS_STYLE = {
  name: { size: 13, weight: 400 } as TextStyle,
  body: { size: 13.5, weight: 700 } as TextStyle,
  count: { size: 11, mono: true } as TextStyle,
  heading: { size: 10.5, mono: true, tracking: 0.14 } as TextStyle,
  pitch: 21,
};

const PX = 340;
const OL = 480;
const OR = 760;
const FX = 900;
const TOP = 62;
const NAME_MAX = 318;
const BODY_MAX = OR - OL - 58;

function isRelation(type: string): type is Relation {
  return (RELATION_TYPES as readonly string[]).includes(type);
}

/** Crossings between lines joining two columns, given each end's position. */
function crossings(pairs: [number, number][]): number {
  let n = 0;
  for (let i = 0; i < pairs.length; i++) {
    for (let j = i + 1; j < pairs.length; j++) {
      if ((pairs[i][0] - pairs[j][0]) * (pairs[i][1] - pairs[j][1]) < 0) n++;
    }
  }
  return n;
}

export function buyersLayout(graph: Graph): BuyersLayout {
  const related = graph.edges.filter((e) => isRelation(e.type));
  const targets = new Set(related.map((e) => e.to));
  const sources = new Set(related.map((e) => e.from).filter((id) => !targets.has(id)));
  const count = new Map<string, number>();
  for (const e of related) count.set(e.to, (count.get(e.to) ?? 0) + 1);
  const node = (id: string) => graph.byId.get(id)!;

  // The middle: busiest in the centre, alternating outwards.
  const bodies = [...targets].map(node).sort((a, b) => (count.get(b.id) ?? 0) - (count.get(a.id) ?? 0) || byName(a, b));
  let middle: GraphNode[] = [];
  bodies.forEach((b, i) => (i % 2 ? middle.push(b) : middle.unshift(b)));
  const leftNodes = [...sources].map(node).filter((n) => n.kind === 'programme');
  const rightNodes = [...sources].map(node).filter((n) => n.kind !== 'programme');

  const order = (side: GraphNode[], mid: GraphNode[]) => {
    const at = new Map(mid.map((m, i) => [m.id, i]));
    const centre = (id: string) => {
      const ends = related.filter((e) => e.from === id && at.has(e.to)).map((e) => at.get(e.to)!);
      return ends.length ? ends.reduce((a, b) => a + b, 0) / ends.length : mid.length;
    };
    return [...side].sort((a, b) => centre(a.id) - centre(b.id) || byName(a, b));
  };
  const pairsFor = (side: GraphNode[], mid: GraphNode[]) => {
    const s = new Map(side.map((n, i) => [n.id, i / Math.max(1, side.length - 1)]));
    const m = new Map(mid.map((n, i) => [n.id, i / Math.max(1, mid.length - 1)]));
    return related.filter((e) => s.has(e.from) && m.has(e.to)).map((e) => [s.get(e.from)!, m.get(e.to)!] as [number, number]);
  };
  let left = order(leftNodes, middle);
  let right = order(rightNodes, middle);
  const total = () => crossings(pairsFor(left, middle)) + crossings(pairsFor(right, middle));
  const half = (middle.length - 1) / 2;
  for (let pass = 0; pass < 4; pass++) {
    let improved = false;
    for (let i = 0; i + 1 < middle.length; i++) {
      const a = middle[i];
      const b = middle[i + 1];
      // A swap may not move the busier body further from the centre.
      const busier = (count.get(a.id) ?? 0) >= (count.get(b.id) ?? 0) ? i : i + 1;
      const moved = busier === i ? i + 1 : i;
      if (Math.abs(moved - half) > Math.abs(busier - half) && (count.get(middle[busier].id) ?? 0) !== (count.get(middle[moved].id) ?? 0)) continue;
      const before = total();
      middle = [...middle.slice(0, i), b, a, ...middle.slice(i + 2)];
      if (total() < before) improved = true;
      else middle = [...middle.slice(0, i), a, b, ...middle.slice(i + 2)];
    }
    left = order(leftNodes, middle);
    right = order(rightNodes, middle);
    if (!improved) break;
  }

  const texts: { text: string; box: Box }[] = [];
  const addText = (text: string, x: number, baseline: number, style: TextStyle, anchor: 'start' | 'end' | 'middle') => {
    const w = textWidth(text, style);
    const l = anchor === 'start' ? x : anchor === 'end' ? x - w : x - w / 2;
    texts.push({ text, box: [r1(l), r1(baseline - style.size * 0.8), r1(l + w), r1(baseline + style.size * 0.25)] });
  };

  const rowsHeight = Math.max(left.length, right.length, middle.length * 2, 1) * BUYERS_STYLE.pitch;
  const spread = (list: GraphNode[], x: number, style: TextStyle, max: number, anchor: 'start' | 'end'): BuyerRow[] =>
    list.map((n, i) => {
      const y = r1(TOP + (i + 0.5) * (rowsHeight / list.length));
      const text = fitText(n.name, max, style);
      addText(text, anchor === 'end' ? x - 12 : x + 12, y + 4.5, style, anchor);
      return { id: n.id, name: n.name, text, kind: n.kind, x, y, height: 0, count: 0 };
    });
  const leftRows = spread(left, PX, BUYERS_STYLE.name, NAME_MAX, 'end');
  const rightRows = spread(right, FX, BUYERS_STYLE.name, NAME_MAX, 'start');
  const slot = rowsHeight / Math.max(1, middle.length);
  const middleRows: BuyerRow[] = middle.map((n, i) => {
    const c = count.get(n.id) ?? 0;
    const y = r1(TOP + (i + 0.5) * slot);
    const height = r1(Math.min(slot - 8, 20 + Math.sqrt(c) * 1.6));
    const text = fitText(n.name, BODY_MAX, BUYERS_STYLE.body);
    addText(text, OL + 16, y + 5, BUYERS_STYLE.body, 'start');
    addText(String(c), OR - 10, y + 4, BUYERS_STYLE.count, 'end');
    return { id: n.id, name: n.name, text, kind: n.kind, x: OL, y, height, count: c };
  });

  const at = new Map([...leftRows, ...rightRows, ...middleRows].map((r) => [r.id, r]));
  const links: BuyerLink[] = related
    .map((e) => {
      const a = at.get(e.from)!;
      const b = at.get(e.to)!;
      const fromLeft = a.x === PX;
      const x0 = fromLeft ? PX + 6 : FX - 6;
      const x1 = fromLeft ? OL : OR;
      const bend = (x1 - x0) * 0.5;
      return { from: e.from, to: e.to, type: e.type as Relation, d: `M${x0},${a.y} C${r1(x0 + bend)},${a.y} ${r1(x1 - bend)},${b.y} ${x1},${b.y}` };
    })
    .sort((a, b) => compareText(a.type, b.type) || compareText(a.from, b.from) || compareText(a.to, b.to));

  const headingY = 24;
  addText(`Programmes · ${leftRows.length}`.toUpperCase(), PX, headingY, BUYERS_STYLE.heading, 'end');
  addText(`Who the work is for, and who runs it · ${middleRows.length}`.toUpperCase(), (OL + OR) / 2, headingY, BUYERS_STYLE.heading, 'middle');
  addText(`Frameworks and portals · ${rightRows.length}`.toUpperCase(), FX, headingY, BUYERS_STYLE.heading, 'start');

  const shown = new Set(at.keys());
  const leftOut = graph.nodes.filter((n) => n.layer === 'defence' && !shown.has(n.id)).length;
  const width = r1(Math.max(FX + NAME_MAX + 30, ...texts.map((t) => t.box[2] + 10)));
  const height = r1(TOP + rowsHeight + 16);
  return { width, height, left: leftRows, middle: middleRows, right: rightRows, links, leftOut, columns: { left: PX, middleLeft: OL, middleRight: OR, right: FX }, headingY, texts };
}
