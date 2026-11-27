// Home page acceptance test 3: which edges are drawn.
import { describe, expect, it } from 'vitest';
import { edgesToDraw, isQuietType, QUIET_EDGE_TYPES } from '../../src/lib/graph/edge-filter';
import type { GraphEdge } from '../../src/lib/graph/model';

const edges: GraphEdge[] = [
  { from: 'a', to: 'b', type: 'mentions' },
  { from: 'b', to: 'c', type: 'mentions' },
  { from: 'a', to: 'folder', type: 'in_folder' },
  { from: 'c', to: 'folder', type: 'in_folder' },
  { from: 'a', to: 'c', type: 'customer' },
  { from: 'folder', to: 'root', type: 'parent' },
  { from: 'skill', to: 'folder', type: 'reads' },
];

const quiet = (list: GraphEdge[]) => list.filter((e) => e.type === 'mentions' || e.type === 'in_folder');

describe('the edge filter', () => {
  it('names "mentions" and "filed in" as the quiet kinds', () => {
    expect([...QUIET_EDGE_TYPES].sort()).toEqual(['in_folder', 'mentions']);
    expect(isQuietType('mentions')).toBe(true);
    expect(isQuietType('in_folder')).toBe(true);
    expect(isQuietType('customer')).toBe(false);
  });

  it('draws no "mentions" or "filed in" edge with nothing selected', () => {
    const drawn = edgesToDraw(edges, { selected: null, hovered: null, showAll: false });
    expect(quiet(drawn)).toEqual([]);
    expect(drawn).toEqual(edges.filter((e) => !isQuietType(e.type)));
  });

  it("draws the selected node's own quiet edges and no others", () => {
    const drawn = edgesToDraw(edges, { selected: 'a', hovered: null, showAll: false });
    expect(quiet(drawn)).toEqual([edges[0], edges[2]]);
    expect(drawn).toContain(edges[4]);
    expect(drawn).toContain(edges[5]);
  });

  it('draws the quiet edges of the node under the pointer too', () => {
    const drawn = edgesToDraw(edges, { selected: 'a', hovered: 'c', showAll: false });
    expect(quiet(drawn)).toEqual([edges[0], edges[1], edges[2], edges[3]]);
  });

  it('draws every edge when the control is on', () => {
    expect(edgesToDraw(edges, { selected: null, hovered: null, showAll: true })).toEqual(edges);
    expect(edgesToDraw(edges, { selected: 'b', hovered: null, showAll: true })).toEqual(edges);
  });

  it('keeps the input order', () => {
    const drawn = edgesToDraw(edges, { selected: 'c', hovered: null, showAll: false });
    expect(drawn.map((e) => edges.indexOf(e))).toEqual([...drawn.map((e) => edges.indexOf(e))].sort((x, y) => x - y));
  });
});
