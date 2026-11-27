// The file the viewer fetches from this site: the graph and its settled
// positions, built at build time. Compact (edges as index triples), and checked
// when it is read back, so a damaged file stops the viewer instead of drawing
// nonsense.
import { buildGraph, compareText, type Graph, type GraphEdge, type GraphNode, type Layer } from './model';
import { LAYOUT_BOUNDS, type Layout } from './layout';

export interface PayloadNode extends GraphNode {
  x: number;
  y: number;
  z: number;
}

export interface Payload {
  bounds: typeof LAYOUT_BOUNDS;
  types: string[];
  nodes: PayloadNode[];
  /** [from node index, to node index, type index] */
  edges: [number, number, number][];
}

export function toPayload(graph: Graph, layout: Layout): Payload {
  const index = new Map(graph.nodes.map((n, i) => [n.id, i]));
  const types = [...new Set(graph.edges.map((e) => e.type))].sort(compareText);
  const typeIndex = new Map(types.map((t, i) => [t, i]));
  return {
    bounds: layout.bounds,
    types,
    nodes: graph.nodes.map((node, i) => {
      const p = layout.positions[i];
      return { id: node.id, name: node.name, kind: node.kind, layer: node.layer, x: p.x, y: p.y, z: p.z };
    }),
    edges: graph.edges.map((e) => [index.get(e.from)!, index.get(e.to)!, typeIndex.get(e.type)!]),
  };
}

const isText = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Reads a fetched payload back into a graph and a layout. Throws if it is not well formed. */
export function readPayload(raw: unknown): { graph: Graph; layout: Layout } {
  const p = raw as Partial<Payload> | null;
  if (!p || !Array.isArray(p.nodes) || !Array.isArray(p.edges) || !Array.isArray(p.types)) throw new Error('The map file is not well formed');
  const nodes: GraphNode[] = p.nodes.map((n, i) => {
    if (!n || !isText(n.id) || !isText(n.name) || !isText(n.kind) || !(n.layer === 'defence' || n.layer === 'business')) {
      throw new Error(`Map file node ${i} is not well formed`);
    }
    if (!isNumber(n.x) || !isNumber(n.y) || !isNumber(n.z)) throw new Error(`Map file node ${i} has no position`);
    return { id: n.id, name: n.name, kind: n.kind, layer: n.layer as Layer };
  });
  const types = p.types;
  const edges: GraphEdge[] = p.edges.map((e, i) => {
    if (!Array.isArray(e) || e.length !== 3) throw new Error(`Map file edge ${i} is not well formed`);
    const [a, b, t] = e;
    if (!nodes[a] || !nodes[b] || !isText(types[t])) throw new Error(`Map file edge ${i} points at nothing`);
    return { from: nodes[a].id, to: nodes[b].id, type: types[t] };
  });
  const graph = buildGraph({ nodes, edges });
  const byId = new Map(p.nodes.map((n) => [n.id, n]));
  const positions = graph.nodes.map((node) => {
    const n = byId.get(node.id)!;
    return { id: node.id, x: n.x, y: n.y, z: n.z };
  });
  return { graph, layout: { bounds: LAYOUT_BOUNDS, positions } };
}
