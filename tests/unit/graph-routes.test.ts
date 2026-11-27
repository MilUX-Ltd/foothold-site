// Acceptance tests 1 to 5 for the job routes on the map: the route view, what
// a job and a step light, the whole vault, the example business, and the
// address. Each expectation is worked out here from the fixture's own edges,
// not from the module under test.
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { listRoutes, loadMap, type FootholdMap } from '../../src/lib/map';
import { buildGraph, type Graph } from '../../src/lib/graph/model';
import { routeLit, routeView } from '../../src/lib/graph/routes';
import { DEFAULT_STATE, queryToState, stateToQuery, type MapState } from '../../src/lib/graph/url-state';

const map = loadMap(resolve(__dirname, '../fixtures/foothold-map.json'));
const graph = buildGraph(map);
const routes = listRoutes(map);
const TENDER = 'Skills/Routes/A tender lands';
const DATA = 'Skills/Routes/A customer asks about your data handling';

const sorted = (ids: Iterable<string>) => [...ids].sort();
const targets = (m: FootholdMap, skill: string, type: 'reads' | 'writes') =>
  sorted(m.edges.filter((e) => e.from === skill && e.type === type).map((e) => e.to));
const nodeOf = (m: FootholdMap, id: string) => m.nodes.find((n) => n.id === id)!;
/** Defence pages filed directly in any of these folders. */
const filedIn = (m: FootholdMap, folders: string[]) =>
  sorted(new Set(m.edges.filter((e) => e.type === 'in_folder' && folders.includes(e.to) && nodeOf(m, e.from).layer === 'defence').map((e) => e.from)));
const folderTargets = (m: FootholdMap, skill: string) =>
  [...targets(m, skill, 'reads'), ...targets(m, skill, 'writes')].filter((id) => nodeOf(m, id).kind === 'folder');

describe('route view', () => {
  it('1. lists each route\'s steps in the pack\'s order, each with its skill, its reads and its writes', () => {
    expect(routes.length).toBeGreaterThan(1);
    for (const route of routes) {
      const view = routeView(graph, route);
      expect(view.id).toBe(route.id);
      expect(view.name).toBe(route.name);
      expect(view.steps.map((s) => s.skillId)).toEqual(route.steps.map((s) => s.skillId));
      expect(view.steps.map((s) => s.does)).toEqual(route.steps.map((s) => s.does));
      expect(view.steps.map((s) => s.number)).toEqual(route.steps.map((_, i) => i + 1));
      view.steps.forEach((step) => {
        expect(step.skill).toBe(graph.byId.get(step.skillId)!.name);
        expect(sorted(step.reads.map((n) => n.id))).toEqual(targets(map, step.skillId, 'reads'));
        expect(sorted(step.writes.map((n) => n.id))).toEqual(targets(map, step.skillId, 'writes'));
      });
    }
    const tender = routeView(graph, routes.find((r) => r.id === TENDER)!);
    expect(tender.steps.map((s) => s.skill)).toEqual(['bid-response', 'cyber-essentials-ready', 'build-dpia']);
    expect(tender.steps[0].reads.map((n) => n.id)).toEqual(['Context', 'Operations']);
    expect(tender.steps[0].writes.map((n) => n.id)).toEqual(['Customer Engagements']);
    expect(tender.steps[1].reads).toEqual([]);
  });
});

describe('what a job and a step light', () => {
  it('2. a step lights the route, the skill, its folders and the defence pages filed in them; the whole job is the union without the defence pages', () => {
    for (const route of routes) {
      const view = routeView(graph, route);
      const union = new Set<string>();
      for (const step of view.steps) {
        const folders = folderTargets(map, step.skillId);
        const pages = filedIn(map, folders);
        const lit = routeLit(graph, view, step.number);
        const expected = sorted(new Set([route.id, step.skillId, ...folders, ...pages]));
        expect(sorted([...lit.strong, ...lit.soft]), `${route.name}, step ${step.number}`).toEqual(expected);
        // Strong and soft never overlap, and the defence pages are the soft group
        // (the example business, when there is one, is lit strongly so it can be named).
        expect([...lit.strong].filter((id) => lit.soft.has(id))).toEqual([]);
        expect(sorted(step.defencePages.map((n) => n.id))).toEqual(pages);
        expect(lit.counts.defencePages).toBe(pages.length);
        for (const id of lit.soft) expect(graph.byId.get(id)!.layer).toBe('defence');
        // The job's other steps stay faintly visible, and only them.
        const others = view.steps.filter((s) => s.number !== step.number).flatMap((s) => [s.skillId, ...folderTargets(map, s.skillId)]);
        expect(sorted(lit.faint)).toEqual(sorted(new Set(others.filter((id) => !expected.includes(id)))));
        for (const id of [step.skillId, ...folders]) union.add(id);
      }
      const whole = routeLit(graph, view, null);
      expect(sorted(whole.strong)).toEqual(sorted(new Set([route.id, ...union])));
      expect(whole.soft.size).toBe(0);
      expect(whole.faint.size).toBe(0);
      expect(whole.counts.steps).toBe(route.steps.length);
    }
  });

  it('2. lights the edges that join what is lit: the step, the reads and writes, and the filing of the defence pages', () => {
    const view = routeView(graph, routes.find((r) => r.id === TENDER)!);
    const lit = routeLit(graph, view, 1);
    const describe = (edges: { from: string; to: string; type: string }[]) => sorted(edges.map((e) => `${e.from} ${e.type} ${e.to}`));
    expect(describe(lit.strongEdges)).toEqual(
      describe([
        { from: TENDER, to: 'Skills/business-skills/bid-response', type: 'step' },
        { from: 'Skills/business-skills/bid-response', to: 'Context', type: 'reads' },
        { from: 'Skills/business-skills/bid-response', to: 'Operations', type: 'reads' },
        { from: 'Skills/business-skills/bid-response', to: 'Customer Engagements', type: 'writes' },
      ]),
    );
    expect(describe(lit.softEdges)).toEqual(describe([{ from: 'Context/Example Defence Business', to: 'Context', type: 'in_folder' }]));
    for (const e of lit.faintEdges) expect(e.from === TENDER || e.from !== 'Skills/business-skills/bid-response').toBe(true);
  });
});

describe('the whole vault', () => {
  it('3. a skill that reads the whole vault gives the vault node and no folders', () => {
    // The fixture keeps the vault without edges (the path tests rely on it), so
    // this case adds a made-up skill that reads the whole vault and writes Operations.
    const copy = structuredClone(map);
    const sweep = 'Skills/meta-skills/example-sweep';
    copy.nodes.push({ id: sweep, kind: 'skill', layer: 'business', name: 'example-sweep', path: `${sweep}/SKILL.md` });
    copy.edges.push({ from: sweep, to: '.', type: 'reads', origin: 'skill' }, { from: sweep, to: 'Operations', type: 'writes', origin: 'skill' });
    const g: Graph = buildGraph(copy);
    const view = routeView(g, { id: 'Example month end', name: 'Example month end', steps: [{ skill: 'example-sweep', skillId: sweep, does: 'Sweeps the vault.' }] });
    const [step] = view.steps;
    expect(step.wholeVault).toBe(true);
    expect(step.reads.map((n) => n.id)).toEqual(['.']);
    expect(step.reads.filter((n) => n.kind === 'folder')).toEqual([]);
    expect(step.defencePages).toEqual([]);
    const lit = routeLit(g, view, 1);
    expect(lit.strong.has('.')).toBe(true);
    // Only the folder it writes; nothing it reads is a folder.
    expect([...lit.strong].filter((id) => g.byId.get(id)?.kind === 'folder')).toEqual(['Operations']);
    expect(lit.soft.size).toBe(0);

    const tender = routeView(graph, routes.find((r) => r.id === TENDER)!);
    expect(tender.steps.every((s) => !s.wholeVault)).toBe(true);
  });
});

describe('the example business', () => {
  it('4. is flagged on a step only when that step reads or writes the folder it is filed in', () => {
    const business = map.nodes.filter((n) => n.kind === 'example-business');
    expect(business).toHaveLength(1);
    const home = map.edges.filter((e) => e.from === business[0].id && e.type === 'in_folder').map((e) => e.to);
    expect(home.length).toBeGreaterThan(0);
    let flagged = 0;
    let unflagged = 0;
    for (const route of routes) {
      const view = routeView(graph, route);
      for (const step of view.steps) {
        const touches = folderTargets(map, step.skillId).some((id) => home.includes(id));
        const lit = routeLit(graph, view, step.number);
        if (touches) {
          flagged++;
          expect(step.exampleBusiness?.id).toBe(business[0].id);
          expect(lit.exampleBusiness?.id).toBe(business[0].id);
          expect(lit.strong.has(business[0].id)).toBe(true);
          expect(lit.labels.get(business[0].id)).toBe(`${business[0].name}, the example business`);
        } else {
          unflagged++;
          expect(step.exampleBusiness).toBeNull();
          expect(lit.exampleBusiness).toBeNull();
          expect(lit.labels.size).toBe(0);
        }
      }
      expect(routeLit(graph, view, null).exampleBusiness).toBeNull();
    }
    expect(flagged).toBeGreaterThan(0);
    expect(unflagged).toBeGreaterThan(0);
    expect(routeView(graph, routes.find((r) => r.id === DATA)!).steps.every((s) => s.exampleBusiness === null)).toBe(true);
  });
});

describe('the address', () => {
  const stepsIn = (id: string) => routes.find((r) => r.id === id)?.steps.length ?? null;
  const has = (id: string) => graph.byId.has(id);
  const read = (search: string) => queryToState(search, has, stepsIn);

  it.each<MapState>([
    { ...DEFAULT_STATE, route: TENDER, step: null },
    { ...DEFAULT_STATE, route: TENDER, step: 1 },
    { ...DEFAULT_STATE, route: TENDER, step: 3 },
    { ...DEFAULT_STATE, node: 'CRM', view: 'network', mode: '3d', route: DATA, step: 2 },
  ])('5. round-trips route and step: %o', (state) => {
    expect(read(stateToQuery(state))).toEqual(state);
  });

  it('5. writes the route and step beside the existing state', () => {
    const query = stateToQuery({ ...DEFAULT_STATE, node: 'CRM', route: TENDER, step: 2 });
    const params = new URLSearchParams(query);
    expect(params.get('node')).toBe('CRM');
    expect(params.get('route')).toBe(TENDER);
    expect(params.get('step')).toBe('2');
    expect(stateToQuery({ ...DEFAULT_STATE, route: null, step: 2 })).toBe('');
  });

  it('5. drops an unknown route, and its step with it', () => {
    expect(read('?route=No%2Fsuch%2Froute&step=1&node=CRM')).toEqual({ ...DEFAULT_STATE, node: 'CRM' });
    // A node that is not a route is not a route either.
    expect(read('?route=CRM&step=1')).toEqual(DEFAULT_STATE);
  });

  it('5. drops a step outside the route\'s range and keeps the route', () => {
    for (const step of ['0', '4', '-1', '1.5', 'two', '', '01x']) {
      expect(read(`?route=${encodeURIComponent(TENDER)}&step=${step}`), step).toEqual({ ...DEFAULT_STATE, route: TENDER, step: null });
    }
    expect(read(`?route=${encodeURIComponent(DATA)}&step=3`)).toEqual({ ...DEFAULT_STATE, route: DATA, step: null });
  });

  it('5. drops a step with no route', () => {
    expect(read('?step=1')).toEqual(DEFAULT_STATE);
  });

  it('5. drops the route when the address also holds a path, since asking for a path closes the job', () => {
    expect(read(`?from=CRM&to=.&route=${encodeURIComponent(TENDER)}&step=1`)).toEqual({ ...DEFAULT_STATE, from: 'CRM', to: '.' });
  });

  it('5. ignores route and step when no routes are known', () => {
    expect(queryToState(`?route=${encodeURIComponent(TENDER)}&step=1`, has)).toEqual(DEFAULT_STATE);
  });
});
