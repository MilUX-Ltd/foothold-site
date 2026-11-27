// A made-up map the size of the real one, for timing the layout without the
// network. Every name is generated ("Node 17"); nothing is copied from the pack.
// Seeded, so it is the same graph on every run.
import type { GraphEdge, GraphInput } from '../../src/lib/graph/model';

const DEFENCE_KINDS = ['organisation', 'programme', 'framework', 'portal', 'cluster', 'network', 'event-series'];
const BUSINESS_KINDS = ['folder', 'skill', 'route'];
const TYPES_WITHIN = ['mentions', 'customer', 'operator', 'service', 'parent', 'reads', 'writes', 'step'];

export function syntheticMap(nodeCount = 461, edgeCount = 1344, seed = 7): GraphInput {
  let s = seed;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const nodes = Array.from({ length: nodeCount }, (_, i) => {
    const defence = i < Math.round(nodeCount * 0.78);
    const kinds = defence ? DEFENCE_KINDS : BUSINESS_KINDS;
    return {
      id: `synthetic/${String(i).padStart(4, '0')}`,
      name: `Node ${i}`,
      layer: defence ? ('defence' as const) : ('business' as const),
      kind: kinds[Math.floor(rnd() * kinds.length)],
    };
  });
  const edges: GraphEdge[] = [];
  while (edges.length < edgeCount) {
    const a = nodes[Math.floor(rnd() * nodeCount)];
    const b = nodes[Math.floor(rnd() * nodeCount)];
    if (a.id === b.id) continue;
    const cross = a.layer !== b.layer;
    edges.push({ from: a.id, to: b.id, type: cross ? 'in_folder' : TYPES_WITHIN[Math.floor(rnd() * TYPES_WITHIN.length)] });
  }
  return { nodes, edges };
}
