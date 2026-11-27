// The map viewer's data: the graph and its positions, settled here at build
// time and written as a static file next to the page (/map/graph.json). The
// viewer fetches it from this site and nowhere else.
import type { APIRoute } from 'astro';
import { loadMap } from '../../lib/map';
import { buildGraph } from '../../lib/graph/model';
import { computeLayout } from '../../lib/graph/layout';
import { toPayload } from '../../lib/graph/payload';

export const GET: APIRoute = () => {
  const graph = buildGraph(loadMap());
  const start = performance.now();
  const layout = computeLayout(graph);
  const ms = Math.round(performance.now() - start);
  console.log(`Map layout: ${graph.nodes.length} nodes, ${graph.edges.length} edges, settled in ${ms} ms.`);
  return new Response(JSON.stringify(toPayload(graph, layout)), { headers: { 'Content-Type': 'application/json' } });
};
