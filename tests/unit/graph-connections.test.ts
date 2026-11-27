// Acceptance test 5: a node's connections, grouped by type, direction kept apart.
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadMap } from '../../src/lib/map';
import { buildGraph } from '../../src/lib/graph/model';
import { connectionsOf } from '../../src/lib/graph/connections';

const graph = buildGraph(loadMap(resolve(__dirname, '../fixtures/foothold-map.json')));
const names = (group?: { nodes: { name: string }[] }) => group?.nodes.map((n) => n.name);

describe('connectionsOf', () => {
  it('groups outgoing and incoming connections by edge type, apart', () => {
    const c = connectionsOf(graph, 'Intelligence/defence-landscape/Frameworks/Example Supplier Framework');
    expect(c.outgoing.map((g) => g.type)).toEqual(['customer', 'mentions', 'operator']);
    expect(names(c.outgoing.find((g) => g.type === 'customer'))).toEqual(['Ministry of Defence']);
    expect(names(c.outgoing.find((g) => g.type === 'operator'))).toEqual(['Defence Science and Technology Laboratory']);
    expect(c.incoming.map((g) => g.type)).toEqual(['mentions']);
    expect(names(c.incoming[0])).toEqual(['Example Innovation Programme']);
    expect(c.total).toBe(4);
  });

  it('keeps the same type apart by direction', () => {
    const c = connectionsOf(graph, 'Operations');
    expect(c.outgoing).toEqual([]);
    expect(c.incoming.map((g) => g.type)).toEqual(['parent', 'reads', 'writes']);
    expect(names(c.incoming.find((g) => g.type === 'reads'))).toEqual(['bid-response', 'build-dpia']);
  });

  it('gives empty groups for a node with no connections', () => {
    expect(connectionsOf(graph, '.')).toEqual({ outgoing: [], incoming: [], total: 0 });
  });

  it('throws for an id that is not on the map', () => {
    expect(() => connectionsOf(graph, 'nope')).toThrow(/nope/);
  });
});
