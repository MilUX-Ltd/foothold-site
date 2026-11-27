// Route-finding: the shortest path between two nodes, treating every edge as
// two-way. Breadth-first over the model's fixed link order, so when two paths
// are equally short the same one is chosen every time.
import type { Graph, GraphEdge } from './model';

export interface PathResult {
  /** The nodes from the start to the end, both included. Empty when there is no path. */
  nodes: string[];
  /** The edge used for each step, one fewer than the nodes. */
  edges: GraphEdge[];
}

export function shortestPath(graph: Graph, from: string, to: string): PathResult {
  if (!graph.byId.has(from) || !graph.byId.has(to)) return { nodes: [], edges: [] };
  if (from === to) return { nodes: [from], edges: [] };
  const previous = new Map<string, { node: string; edge: GraphEdge } | null>([[from, null]]);
  const queue = [from];
  for (let head = 0; head < queue.length; head++) {
    const current = queue[head];
    for (const link of graph.links.get(current) ?? []) {
      if (previous.has(link.other)) continue;
      previous.set(link.other, { node: current, edge: link.edge });
      if (link.other === to) {
        const nodes = [to];
        const edges: GraphEdge[] = [];
        let step = previous.get(to);
        while (step) {
          edges.unshift(step.edge);
          nodes.unshift(step.node);
          step = previous.get(step.node);
        }
        return { nodes, edges };
      }
      queue.push(link.other);
    }
  }
  return { nodes: [], edges: [] };
}
