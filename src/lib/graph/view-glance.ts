// At a glance: one mark for every page, grouped and counted, shaded by how
// many named connections it has. It shows honestly where the pack is thin.
//
// Each group is laid out as its own small grid, so the page can set the
// groups in columns that wrap at any width. The shade is carried by fill as
// well as tone: solid for five or more named connections, hatched for at
// least one, an outline for none yet. A mark's shape says what it is: a
// square for a defence page or a folder, a diamond for a skill, a triangle for
// a job, a hexagon for the vault.
import { kindLabel, type Graph, type GraphNode } from './model';
import { byName, defenceFamilies, namedDegree, r1, shadeFor, skillGroups, type Box, type Shade } from './view-common';
import { textWidth, type TextStyle } from './view-text';

export type TileShape = 'square' | 'diamond' | 'triangle' | 'hexagon';

export interface GlanceTile {
  id: string;
  kind: string;
  x: number;
  y: number;
  shade: Shade;
  shape: TileShape;
}

export interface GlanceGroup {
  key: string;
  label: string;
  side: 'defence' | 'business';
  count: number;
  /** How many of its pages have each shade: none yet, at least one, five or more. */
  shades: [number, number, number];
  cols: number;
  width: number;
  height: number;
  tiles: GlanceTile[];
  /** Names set beside the marks, for a group small enough to name them all (the jobs). */
  names: { id: string; text: string; x: number; y: number }[];
  texts: { text: string; box: Box }[];
}

export interface GlanceLayout {
  groups: GlanceGroup[];
  totals: { defence: number; business: number; shades: [number, number, number] };
}

export const GLANCE_STYLE = {
  tile: 18,
  gap: 5,
  heading: { size: 15, weight: 700 } as TextStyle,
  name: { size: 13.5, weight: 400 } as TextStyle,
};

const COLS = 14;
/** Where the tiles start under the group's heading. */
export const GLANCE_TOP = 30;

export function glanceLayout(graph: Graph): GlanceLayout {
  const degree = namedDegree(graph);
  const { tile, gap } = GLANCE_STYLE;
  const pitch = tile + gap;
  const groups: GlanceGroup[] = [];
  const make = (key: string, label: string, side: GlanceGroup['side'], nodes: GraphNode[], shape: (n: GraphNode) => TileShape, named = false) => {
    if (!nodes.length) return;
    const sorted = named ? nodes : [...nodes].sort((a, b) => (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0) || byName(a, b));
    const cols = named ? 1 : Math.min(COLS, sorted.length);
    const tiles = sorted.map((n, k) => ({
      id: n.id,
      kind: n.kind,
      x: (k % cols) * pitch,
      y: GLANCE_TOP + Math.floor(k / cols) * (named ? pitch + 4 : pitch),
      shade: shadeFor(degree.get(n.id) ?? 0),
      shape: shape(n),
    }));
    const texts: { text: string; box: Box }[] = [];
    const head = `${label} ${sorted.length}`;
    texts.push({ text: head, box: [0, 0, r1(textWidth(label, GLANCE_STYLE.heading) + 40), 20] });
    const names = named
      ? tiles.map((t) => {
          const node = graph.byId.get(t.id)!;
          const x = pitch + 6;
          const y = t.y + tile / 2 + 5;
          texts.push({ text: node.name, box: [x, r1(y - 11), r1(x + textWidth(node.name, GLANCE_STYLE.name)), r1(y + 4)] });
          return { id: t.id, text: node.name, x, y: r1(y) };
        })
      : [];
    const shades: [number, number, number] = [0, 0, 0];
    for (const t of tiles) shades[t.shade]++;
    const rows = Math.ceil(sorted.length / cols);
    const width = r1(Math.max(cols * pitch - gap, ...texts.map((t) => t.box[2])));
    const height = r1(GLANCE_TOP + rows * (named ? pitch + 4 : pitch) - gap);
    groups.push({ key, label, side, count: sorted.length, shades, cols, width, height, tiles, names, texts });
  };

  for (const { family, nodes } of defenceFamilies(graph)) make(family.key, family.label, 'defence', nodes, () => 'square');

  const business = graph.nodes.filter((n) => n.layer === 'business');
  make('folders', 'Folders', 'business', business.filter((n) => n.kind === 'folder'), () => 'square');
  for (const { group, nodes } of skillGroups(graph)) make(`skills:${group.key}`, group.label, 'business', nodes, () => 'diamond');
  make('jobs', 'Jobs', 'business', business.filter((n) => n.kind === 'route').sort(byName), () => 'triangle', true);
  make('vault', kindLabel('vault'), 'business', business.filter((n) => n.kind === 'vault'), () => 'hexagon');
  const placed = new Set(groups.flatMap((g) => g.tiles.map((t) => t.id)));
  const rest = business.filter((n) => !placed.has(n.id));
  const kinds = [...new Set(rest.map((n) => n.kind))].sort();
  for (const kind of kinds) make(`kind:${kind}`, kindLabel(kind), 'business', rest.filter((n) => n.kind === kind), () => 'square');

  const shades: [number, number, number] = [0, 0, 0];
  for (const g of groups) for (let i = 0; i < 3; i++) shades[i] += g.shades[i];
  return {
    groups,
    totals: {
      defence: groups.filter((g) => g.side === 'defence').reduce((a, g) => a + g.count, 0),
      business: groups.filter((g) => g.side === 'business').reduce((a, g) => a + g.count, 0),
      shades,
    },
  };
}
