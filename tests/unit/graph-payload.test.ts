// The file the viewer fetches: the graph and its settled positions, built at
// build time and read back in the browser.
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadMap } from '../../src/lib/map';
import { buildGraph } from '../../src/lib/graph/model';
import { computeLayout } from '../../src/lib/graph/layout';
import { readPayload, toPayload } from '../../src/lib/graph/payload';

const map = loadMap(resolve(__dirname, '../fixtures/foothold-map.json'));
const graph = buildGraph(map);
const layout = computeLayout(graph);

describe('payload', () => {
  it('round-trips the graph and positions through JSON', () => {
    const back = readPayload(JSON.parse(JSON.stringify(toPayload(graph, layout))));
    expect(back.graph.nodes).toEqual(graph.nodes);
    expect(back.graph.edges).toEqual(graph.edges);
    expect(back.layout).toEqual(layout);
  });

  it('carries only the fields the viewer draws', () => {
    const payload = toPayload(graph, layout);
    expect(Object.keys(payload.nodes[0]).sort()).toEqual(['id', 'kind', 'layer', 'name', 'x', 'y', 'z']);
  });

  it('refuses a malformed file', () => {
    expect(() => readPayload({})).toThrow();
    expect(() => readPayload({ ...toPayload(graph, layout), edges: [[0, 999, 0]] })).toThrow();
    const bad = toPayload(graph, layout);
    bad.nodes[0] = { ...bad.nodes[0], x: Number.NaN };
    expect(() => readPayload(bad)).toThrow();
  });
});
