import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { countByKind, edgesFor, facts, listRoutes, loadMap } from '../../src/lib/map';

const map = loadMap(resolve(__dirname, '../fixtures/foothold-map.json'));

describe('countByKind', () => {
  it('counts nodes by kind, with keys in a fixed order', () => {
    const counts = countByKind(map);
    expect(counts).toMatchObject({ organisation: 2, programme: 1, framework: 1, portal: 1, 'event-series': 1, cluster: 1, 'example-business': 1, folder: 4, skill: 3, route: 2 });
    expect(Object.keys(counts)).toEqual([...Object.keys(counts)].sort());
    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(map.nodes.length);
  });
});

describe('facts', () => {
  it('draws the fact strip from the data', () => {
    expect(facts(map)).toEqual({ defencePages: 8, skills: 3, folders: 4, routes: 2, packVersion: '0.0.0' });
  });
});

describe('listRoutes', () => {
  it('resolves each step to its skill name and keeps the pack order', () => {
    const routes = listRoutes(map);
    expect(routes.map((r) => r.name)).toEqual(['A customer asks about your data handling', 'A tender lands']);
    expect(routes[1].steps.map((s) => s.skill)).toEqual(['bid-response', 'cyber-essentials-ready', 'build-dpia']);
    expect(routes[0].steps[0].does).toContain('data protection impact assessment');
  });

  it('falls back to the pack name for a skill that is not a node', () => {
    const copy = structuredClone(map);
    copy.nodes = copy.nodes.filter((n) => n.id !== 'Skills/business-skills/build-dpia');
    expect(listRoutes(copy)[0].steps[0].skill).toBe('build-dpia');
  });
});

describe('edgesFor', () => {
  it('groups outgoing and incoming edges by type', () => {
    const edges = edgesFor(map, 'Intelligence/defence-landscape/Frameworks/Example Supplier Framework');
    expect(edges.outgoing.map((g) => g.type)).toEqual(['customer', 'mentions', 'operator']);
    expect(edges.outgoing.find((g) => g.type === 'customer')?.items.map((i) => i.node.name)).toEqual(['Ministry of Defence']);
    expect(edges.incoming.map((g) => g.type)).toEqual(['mentions']);
    expect(edges.incoming[0].items[0].node.name).toBe('Example Innovation Programme');
  });

  it('returns empty groups for a node with no edges of a direction', () => {
    const edges = edgesFor(map, 'Skills/Routes/A tender lands');
    expect(edges.incoming).toEqual([]);
    expect(edges.outgoing.map((g) => g.type)).toEqual(['step']);
    expect(edges.outgoing[0].items).toHaveLength(3);
  });

  it('throws for a node that is not in the map', () => {
    expect(() => edgesFor(map, 'nope')).toThrow(/No node/);
  });
});

describe('loadMap', () => {
  it('says what to do when the file is missing', () => {
    expect(() => loadMap('/nonexistent/foothold-map.json')).toThrow(/npm run data/);
  });
});
