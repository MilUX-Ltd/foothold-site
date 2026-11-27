// The drawings the build writes for the four views: every one passes the
// allow-list (no script, no style attribute, no event handler, no link off
// the site), every mark names a page on the map, and the whole map draws
// every page exactly once.
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { listRoutes, loadMap } from '../../src/lib/map';
import { buildGraph } from '../../src/lib/graph/model';
import { DRAWN_VIEWS } from '../../src/lib/graph/view-common';
import { mapScene, sceneFor } from '../../src/lib/graph/view-scenes';
import { sceneProblems, type SceneChild, type SceneEl } from '../../src/lib/graph/view-scene';

const map = loadMap(resolve(__dirname, '../fixtures/foothold-map.json'));
const graph = buildGraph(map);
const routes = listRoutes(map);

const all = (root: SceneChild, test: (el: SceneEl) => boolean, out: SceneEl[] = []): SceneEl[] => {
  if (typeof root === 'string') return out;
  if (test(root)) out.push(root);
  for (const c of root.c ?? []) all(c, test, out);
  return out;
};
const hasClass = (el: SceneEl, name: string) => String(el.a?.class ?? '').split(' ').includes(name);

describe('the drawings', () => {
  it.each(DRAWN_VIEWS)('%s passes the allow-list, and its marks name pages on the map', (view) => {
    const scene = sceneFor(view, graph, routes);
    expect(sceneProblems(scene)).toEqual([]);
    expect(all(scene, (el) => 'style' in (el.a ?? {}) || Object.keys(el.a ?? {}).some((k) => k.startsWith('on')))).toEqual([]);
    const marks = all(scene, (el) => hasClass(el, 'mk'));
    expect(marks.length).toBeGreaterThan(0);
    for (const m of marks) expect(graph.byId.has(String(m.a!['data-id'])), String(m.a!['data-id'])).toBe(true);
    const ids = all(scene, (el) => el.a?.id !== undefined).map((el) => el.a!.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('the whole map draws every page once, with real text', () => {
    const svg = mapScene(graph, routes);
    const marks = all(svg, (el) => hasClass(el, 'mk')).map((m) => String(m.a!['data-id']));
    expect([...marks].sort()).toEqual(graph.nodes.map((n) => n.id).sort());
    const text = JSON.stringify(svg);
    expect(text).toContain('Ministry of Defence');
    expect(text).toContain('Operations');
  });

  it('refuses what the policy forbids', () => {
    expect(sceneProblems({ t: 'script', c: ['alert(1)'] })).not.toEqual([]);
    expect(sceneProblems({ t: 'svg', c: [{ t: 'foreignObject' }] })).not.toEqual([]);
    expect(sceneProblems({ t: 'div', a: { style: 'color:red' } })).not.toEqual([]);
    expect(sceneProblems({ t: 'div', a: { onclick: 'x()' } })).not.toEqual([]);
    expect(sceneProblems({ t: 'a', a: { href: 'https://example.com/' } })).not.toEqual([]);
    expect(sceneProblems({ t: 'a', a: { href: 'javascript:alert(1)' } })).not.toEqual([]);
    expect(sceneProblems({ t: 'a', a: { href: '//example.com' } })).not.toEqual([]);
    expect(sceneProblems({ t: 'a', a: { href: '#node-list' } })).toEqual([]);
  });
});
