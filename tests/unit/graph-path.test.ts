// Acceptance test 4: route-finding.
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadMap } from '../../src/lib/map';
import { buildGraph } from '../../src/lib/graph/model';
import { shortestPath } from '../../src/lib/graph/path';

const graph = buildGraph(loadMap(resolve(__dirname, '../fixtures/foothold-map.json')));
const FRAMEWORK = 'Intelligence/defence-landscape/Frameworks/Example Supplier Framework';
const CLUSTER = 'CRM/networks/Example Regional Defence Cluster';
const MOD = 'CRM/organisations/mod/Ministry of Defence';

describe('shortestPath', () => {
  it('returns the shortest path between two connected nodes, crossing layers', () => {
    const path = shortestPath(graph, FRAMEWORK, CLUSTER);
    expect(path.nodes).toEqual([FRAMEWORK, MOD, 'CRM', CLUSTER]);
    expect(path.edges.map((e) => e.type)).toEqual(['customer', 'in_folder', 'in_folder']);
  });

  it('treats edges as two-way', () => {
    // Every edge on this path runs against the direction of travel.
    const path = shortestPath(graph, CLUSTER, FRAMEWORK);
    expect(path.nodes).toEqual([CLUSTER, 'CRM', MOD, FRAMEWORK]);
    const back = shortestPath(graph, 'Operations', 'Skills/Routes/A tender lands');
    expect(back.nodes).toHaveLength(3);
  });

  it('returns an empty result for nodes that are not connected', () => {
    expect(shortestPath(graph, FRAMEWORK, '.')).toEqual({ nodes: [], edges: [] });
    expect(shortestPath(graph, FRAMEWORK, 'Operations')).toEqual({ nodes: [], edges: [] });
  });

  it('returns an empty result for an id that is not on the map', () => {
    expect(shortestPath(graph, FRAMEWORK, 'nope')).toEqual({ nodes: [], edges: [] });
  });

  it('returns the node alone when both ends are the same', () => {
    expect(shortestPath(graph, MOD, MOD)).toEqual({ nodes: [MOD], edges: [] });
  });

  it('picks the same path every time when two are equally short', () => {
    const a = shortestPath(graph, 'Skills/Routes/A tender lands', 'Operations');
    const b = shortestPath(graph, 'Skills/Routes/A tender lands', 'Operations');
    expect(a).toEqual(b);
    expect(a.nodes).toHaveLength(3);
  });
});
