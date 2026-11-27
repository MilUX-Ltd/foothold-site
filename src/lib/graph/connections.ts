// A node's connections, grouped by edge type, with edges leaving the node kept
// apart from edges arriving at it. This is what the page lists in text.
import { compareText, type Graph, type GraphNode } from './model';

export interface ConnectionGroup {
  type: string;
  nodes: GraphNode[];
}

export interface Connections {
  outgoing: ConnectionGroup[];
  incoming: ConnectionGroup[];
  /** Every connection, counted once per edge. */
  total: number;
}

function group(entries: { type: string; node: GraphNode }[]): ConnectionGroup[] {
  const groups = new Map<string, Map<string, GraphNode>>();
  for (const { type, node } of entries) {
    const g = groups.get(type) ?? new Map<string, GraphNode>();
    g.set(node.id, node);
    groups.set(type, g);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => compareText(a, b))
    .map(([type, nodes]) => ({
      type,
      nodes: [...nodes.values()].sort((a, b) => compareText(a.name.toLowerCase(), b.name.toLowerCase()) || compareText(a.id, b.id)),
    }));
}

/** Throws if the id is not a node on the map. */
export function connectionsOf(graph: Graph, id: string): Connections {
  const links = graph.links.get(id);
  if (!links) throw new Error(`No node with id "${id}"`);
  const out: { type: string; node: GraphNode }[] = [];
  const inc: { type: string; node: GraphNode }[] = [];
  for (const link of links) {
    const node = graph.byId.get(link.other)!;
    (link.direction === 'outgoing' ? out : inc).push({ type: link.edge.type, node });
  }
  return { outgoing: group(out), incoming: group(inc), total: links.length };
}

/** Plain words for an edge type, read from the node whose connections are shown. */
export function typeLabel(type: string, direction: 'outgoing' | 'incoming'): string {
  const words: Record<string, [string, string]> = {
    parent: ['part of', 'has part'],
    in_folder: ['filed in', 'holds page'],
    mentions: ['mentions', 'mentioned by'],
    customer: ['customer', 'customer of'],
    operator: ['operator', 'operates'],
    service: ['service', 'service for'],
    member_of: ['member of', 'has member'],
    listed_on: ['listed on', 'lists'],
    reads: ['reads', 'read by'],
    writes: ['writes to', 'written by'],
    step: ['step', 'step in job'],
  };
  const pair = words[type];
  return pair ? pair[direction === 'outgoing' ? 0 : 1] : type.replace(/_/g, ' ');
}
