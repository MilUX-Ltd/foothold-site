// Acceptance test 1: the graph model built from the fixture.
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadMap } from '../../src/lib/map';
import { buildGraph, countByLayerAndKind, groupByKind } from '../../src/lib/graph/model';

const map = loadMap(resolve(__dirname, '../fixtures/foothold-map.json'));

describe('graph model', () => {
  it('has the expected nodes per layer and kind', () => {
    const graph = buildGraph(map);
    expect(countByLayerAndKind(graph)).toEqual({
      business: { folder: 4, route: 2, skill: 3, vault: 1 },
      defence: { cluster: 1, 'event-series': 1, 'example-business': 1, framework: 1, organisation: 2, portal: 1, programme: 1 },
    });
    expect(graph.nodes).toHaveLength(18);
  });

  it('resolves every edge to two nodes it holds', () => {
    const graph = buildGraph(map);
    expect(graph.edges).toHaveLength(22);
    for (const edge of graph.edges) {
      expect(graph.byId.get(edge.from), edge.from).toBeDefined();
      expect(graph.byId.get(edge.to), edge.to).toBeDefined();
    }
  });

  it('looks nodes up by id', () => {
    const graph = buildGraph(map);
    expect(graph.byId.get('CRM/organisations/mod/Ministry of Defence')?.kind).toBe('organisation');
    expect(graph.byId.get('nope')).toBeUndefined();
  });

  it('holds nodes in sorted id order whatever order they arrive in', () => {
    const reversed = { ...map, nodes: [...map.nodes].reverse(), edges: [...map.edges].reverse() };
    const a = buildGraph(map);
    const b = buildGraph(reversed);
    expect(b.nodes.map((n) => n.id)).toEqual(a.nodes.map((n) => n.id));
    expect(b.edges).toEqual(a.edges);
    const ids = a.nodes.map((n) => n.id);
    expect(ids).toEqual([...ids].sort((x, y) => (x < y ? -1 : x > y ? 1 : 0)));
  });

  it('refuses an edge that points at a missing node', () => {
    const bad = { ...map, edges: [...map.edges, { from: 'CRM', to: 'No/such/node', type: 'mentions', origin: 'body' }] };
    expect(() => buildGraph(bad)).toThrow(/No\/such\/node/);
  });

  it('groups nodes by kind, defence first, names in order', () => {
    const groups = groupByKind(buildGraph(map));
    expect(groups.map((g) => g.kind)).toEqual(['cluster', 'event-series', 'example-business', 'framework', 'organisation', 'portal', 'programme', 'folder', 'route', 'skill', 'vault']);
    const orgs = groups.find((g) => g.kind === 'organisation');
    expect(orgs?.layer).toBe('defence');
    expect(orgs?.nodes.map((n) => n.name)).toEqual(['Defence Science and Technology Laboratory', 'Ministry of Defence']);
  });
});

describe('graph modules', () => {
  it('touch no browser and no file system, so they run anywhere', () => {
    const dir = resolve(__dirname, '../../src/lib/graph');
    for (const file of readdirSync(dir)) {
      const text = readFileSync(resolve(dir, file), 'utf8');
      expect(text, file).not.toMatch(/\b(document|window|localStorage|navigator)\./);
      expect(text, file).not.toMatch(/from ['"]node:/);
      expect(text, file).not.toMatch(/Math\.random/);
    }
  });
});

describe('labels', () => {
  it('names kinds in the plural for headings and the singular for one node', async () => {
    const { kindLabel, kindName } = await import('../../src/lib/graph/model');
    expect(kindLabel('event-series')).toBe('Event series');
    expect(kindName('event-series')).toBe('event series');
    expect(kindName('organisation')).toBe('organisation');
    expect(kindLabel('something-new')).toBe('Something new');
  });
});
