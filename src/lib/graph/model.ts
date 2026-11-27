// The graph model: the map's nodes and edges with look-ups by id. Pure
// TypeScript with no browser and no file system, so the build, the viewer and
// the tests share it.
//
// Order is part of the contract. Nodes are held sorted by id and edges by
// (from, to, type), compared by code unit rather than by locale, so every build
// and every browser walks them in the same order whatever order the file gave.

export type Layer = 'defence' | 'business';

export interface GraphNode {
  id: string;
  name: string;
  kind: string;
  layer: Layer;
}

export interface GraphEdge {
  from: string;
  to: string;
  type: string;
}

/** What the model is built from: the checked map file has these fields and more. */
export interface GraphInput {
  nodes: readonly GraphNode[];
  edges: readonly GraphEdge[];
}

export interface Link {
  edge: GraphEdge;
  /** The node at the other end. */
  other: string;
  /** Whether the edge leaves this node or arrives at it. */
  direction: 'outgoing' | 'incoming';
}

export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  byId: Map<string, GraphNode>;
  /** Every node's links, in a fixed order: other end's id, then type, then direction. */
  links: Map<string, Link[]>;
}

/** The layers in the order the page and the map show them. */
export const LAYERS: readonly Layer[] = ['defence', 'business'];

/** Compares two strings by code unit, the same on every machine. */
export function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function compareEdges(a: GraphEdge, b: GraphEdge): number {
  return compareText(a.from, b.from) || compareText(a.to, b.to) || compareText(a.type, b.type);
}

/** Builds the model. Throws if an edge points at a node that is not there. */
export function buildGraph(input: GraphInput): Graph {
  const nodes = input.nodes
    .map(({ id, name, kind, layer }) => ({ id, name, kind, layer }))
    .sort((a, b) => compareText(a.id, b.id));
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const edges = input.edges.map(({ from, to, type }) => ({ from, to, type })).sort(compareEdges);
  const links = new Map<string, Link[]>(nodes.map((n) => [n.id, []]));
  for (const edge of edges) {
    for (const end of [edge.from, edge.to]) {
      if (!byId.has(end)) throw new Error(`An edge points at "${end}", which is not a node on the map`);
    }
    links.get(edge.from)!.push({ edge, other: edge.to, direction: 'outgoing' });
    links.get(edge.to)!.push({ edge, other: edge.from, direction: 'incoming' });
  }
  for (const list of links.values()) {
    list.sort((a, b) => compareText(a.other, b.other) || compareText(a.edge.type, b.edge.type) || compareText(a.direction, b.direction));
  }
  return { nodes, edges, byId, links };
}

/** How many nodes there are of each kind in each layer, keys sorted. */
export function countByLayerAndKind(graph: Graph): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  for (const node of graph.nodes) {
    const layer = (out[node.layer] ??= {});
    layer[node.kind] = (layer[node.kind] ?? 0) + 1;
  }
  const sorted = (o: Record<string, number>) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => compareText(a, b)));
  return Object.fromEntries(
    Object.entries(out)
      .sort(([a], [b]) => compareText(a, b))
      .map(([layer, kinds]) => [layer, sorted(kinds)]),
  );
}

export interface KindGroup {
  kind: string;
  layer: Layer;
  nodes: GraphNode[];
}

/** Nodes grouped by kind: defence kinds first, then business, kinds in name order, nodes by name then id. */
export function groupByKind(graph: Graph): KindGroup[] {
  const groups = new Map<string, KindGroup>();
  for (const node of graph.nodes) {
    const key = `${LAYERS.indexOf(node.layer)}\u0000${node.kind}`;
    const group = groups.get(key) ?? { kind: node.kind, layer: node.layer, nodes: [] };
    group.nodes.push(node);
    groups.set(key, group);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => compareText(a, b))
    .map(([, g]) => ({ ...g, nodes: [...g.nodes].sort((a, b) => compareText(a.name.toLowerCase(), b.name.toLowerCase()) || compareText(a.id, b.id)) }));
}

/** A plain label for a kind, as a heading for its group. */
export function kindLabel(kind: string): string {
  const known: Record<string, string> = {
    organisation: 'Organisations',
    programme: 'Programmes',
    framework: 'Frameworks',
    portal: 'Portals',
    'event-series': 'Event series',
    network: 'Networks',
    cluster: 'Clusters',
    'example-business': 'Example business',
    folder: 'Folders',
    skill: 'Skills',
    route: 'Jobs',
    vault: 'The whole vault',
  };
  return known[kind] ?? kind.charAt(0).toUpperCase() + kind.slice(1).replace(/-/g, ' ');
}

/** A plain name for one node of a kind, lower case: "organisation", "event series". */
export function kindName(kind: string): string {
  const known: Record<string, string> = { 'example-business': 'example business', 'event-series': 'event series', vault: 'vault', route: 'job' };
  return known[kind] ?? kind.replace(/[-_]/g, ' ');
}

/** A plain label for a layer. */
export function layerLabel(layer: Layer): string {
  return layer === 'defence' ? 'Defence reference' : 'Your business structure';
}
