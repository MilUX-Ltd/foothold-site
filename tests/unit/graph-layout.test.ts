// Acceptance tests 2 and 3: the build-time layout.
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadMap } from '../../src/lib/map';
import { buildGraph, type Graph } from '../../src/lib/graph/model';
import { computeLayout, LAYOUT_BOUNDS, type Layout } from '../../src/lib/graph/layout';
import { syntheticMap } from '../support/synthetic-map';

const fixture = buildGraph(loadMap(resolve(__dirname, '../fixtures/foothold-map.json')));

function expectWellFormed(graph: Graph, layout: Layout) {
  expect(layout.positions.map((p) => p.id)).toEqual(graph.nodes.map((n) => n.id));
  const seen = new Set<string>();
  for (const p of layout.positions) {
    for (const v of [p.x, p.y, p.z]) expect(Number.isFinite(v), p.id).toBe(true);
    expect(p.x).toBeGreaterThanOrEqual(0);
    expect(p.x).toBeLessThanOrEqual(LAYOUT_BOUNDS.width);
    expect(p.y).toBeGreaterThanOrEqual(0);
    expect(p.y).toBeLessThanOrEqual(LAYOUT_BOUNDS.height);
    const key = `${p.x},${p.y}`;
    expect(seen.has(key), `two nodes at ${key}`).toBe(false);
    seen.add(key);
  }
  expect(layout.bounds).toEqual(LAYOUT_BOUNDS);
}

describe('layout', () => {
  it('gives identical positions on two runs over the same input', () => {
    expect(computeLayout(fixture)).toEqual(computeLayout(fixture));
  });

  it('gives the same positions whatever order the data arrives in', () => {
    const map = loadMap(resolve(__dirname, '../fixtures/foothold-map.json'));
    const shuffled = buildGraph({ ...map, nodes: [...map.nodes].reverse(), edges: [...map.edges].reverse() });
    expect(computeLayout(shuffled)).toEqual(computeLayout(fixture));
  });

  it('puts every node at its own finite position inside the bounds', () => {
    expectWellFormed(fixture, computeLayout(fixture));
  });

  it('places the two layers as two regions, defence to the left of business', () => {
    const layout = computeLayout(fixture);
    const mean = (layer: string) => {
      const xs = layout.positions.filter((p) => fixture.byId.get(p.id)?.layer === layer).map((p) => p.x);
      return xs.reduce((a, b) => a + b, 0) / xs.length;
    };
    expect(mean('defence')).toBeLessThan(mean('business'));
  });

  it('completes on real-size data in under 30 seconds, well formed', () => {
    const graph = buildGraph(syntheticMap(461, 1344));
    const start = performance.now();
    const layout = computeLayout(graph);
    const ms = performance.now() - start;
    expect(ms).toBeLessThan(30_000);
    expectWellFormed(graph, layout);
    expect(computeLayout(graph)).toEqual(layout);
  }, 60_000);
});
