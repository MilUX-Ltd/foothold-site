// Acceptance tests 1 to 6 and 8 for the four views: the pure layouts behind
// the whole map, who buys, how a job runs and at a glance. Test 7, the
// address, is in graph-url-state.test.ts. Each expectation is worked out here
// from the edges themselves, not from the module under test.
//
// The fixture is small, so two made-up graphs below add the structure it lacks
// (a family tree three levels deep, folders nested three deep). Every name in
// them is invented for the test.
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { listRoutes, loadMap } from '../../src/lib/map';
import { buildGraph, type Graph, type GraphInput } from '../../src/lib/graph/model';
import { routeView, type RouteInput } from '../../src/lib/graph/routes';
import { overlaps, shadeFor, skillGroupOf, ZOOM_STEPS, type Box } from '../../src/lib/graph/view-common';
import { wheelLayout } from '../../src/lib/graph/view-wheel';
import { treeLayout } from '../../src/lib/graph/view-tree';
import { wholeMapLayout, labelBoxesAt } from '../../src/lib/graph/view-whole-map';
import { buyersLayout } from '../../src/lib/graph/view-buyers';
import { jobsLayout } from '../../src/lib/graph/view-jobs';
import { glanceLayout } from '../../src/lib/graph/view-glance';

const map = loadMap(resolve(__dirname, '../fixtures/foothold-map.json'));
const fixture = buildGraph(map);
const fixtureRoutes: RouteInput[] = listRoutes(map);

const MOD = 'CRM/organisations/mod/';
/** A made-up defence family and business structure, deeper than the fixture's. */
const madeUp: GraphInput = {
  nodes: [
    { id: `${MOD}Root Body`, name: 'Root Body', kind: 'organisation', layer: 'defence' },
    { id: `${MOD}Arm One`, name: 'Arm One', kind: 'organisation', layer: 'defence' },
    { id: `${MOD}Arm Two`, name: 'Arm Two', kind: 'organisation', layer: 'defence' },
    { id: `${MOD}Arm One Unit`, name: 'Arm One Unit', kind: 'organisation', layer: 'defence' },
    { id: `${MOD}Arm One Unit Cell`, name: 'Arm One Unit Cell', kind: 'organisation', layer: 'defence' },
    { id: `${MOD}Loose Office`, name: 'Loose Office', kind: 'organisation', layer: 'defence' },
    { id: 'CRM/organisations/investors/Made-up Fund', name: 'Made-up Fund', kind: 'organisation', layer: 'defence' },
    { id: 'CRM/organisations/government/Made-up Department', name: 'Made-up Department', kind: 'organisation', layer: 'defence' },
    { id: 'Somewhere/Odd Organisation', name: 'Odd Organisation', kind: 'organisation', layer: 'defence' },
    { id: 'Intelligence/defence-landscape/Programmes/Made-up Programme', name: 'Made-up Programme', kind: 'programme', layer: 'defence' },
    { id: 'Intelligence/defence-landscape/Programmes/Second Programme', name: 'Second Programme', kind: 'programme', layer: 'defence' },
    { id: 'Intelligence/defence-landscape/Frameworks/Made-up Framework', name: 'Made-up Framework', kind: 'framework', layer: 'defence' },
    { id: 'Intelligence/defence-landscape/Portals/Made-up Portal', name: 'Made-up Portal', kind: 'portal', layer: 'defence' },
    { id: 'Intelligence/events/Made-up Expo', name: 'Made-up Expo', kind: 'event-series', layer: 'defence' },
    { id: 'CRM/networks/Made-up Cluster', name: 'Made-up Cluster', kind: 'cluster', layer: 'defence' },
    { id: '.', name: 'The whole vault', kind: 'vault', layer: 'business' },
    { id: 'Top', name: 'Top', kind: 'folder', layer: 'business' },
    { id: 'Top/Middle', name: 'Middle', kind: 'folder', layer: 'business' },
    { id: 'Top/Middle/Bottom', name: 'Bottom', kind: 'folder', layer: 'business' },
    { id: 'Another', name: 'Another', kind: 'folder', layer: 'business' },
    { id: 'Skills/business-skills/write-a-thing', name: 'write-a-thing', kind: 'skill', layer: 'business' },
    { id: 'Skills/crm-skills/find-a-thing', name: 'find-a-thing', kind: 'skill', layer: 'business' },
    { id: 'Skills/brand-new-skills/new-thing', name: 'new-thing', kind: 'skill', layer: 'business' },
    { id: 'Skills/Routes/A made-up job', name: 'A made-up job', kind: 'route', layer: 'business' },
  ],
  edges: [
    { from: `${MOD}Arm One`, to: `${MOD}Root Body`, type: 'parent' },
    { from: `${MOD}Arm Two`, to: `${MOD}Root Body`, type: 'parent' },
    { from: `${MOD}Arm One Unit`, to: `${MOD}Arm One`, type: 'parent' },
    { from: `${MOD}Arm One Unit Cell`, to: `${MOD}Arm One Unit`, type: 'parent' },
    { from: 'Intelligence/defence-landscape/Programmes/Made-up Programme', to: `${MOD}Arm Two`, type: 'customer' },
    { from: 'Intelligence/defence-landscape/Programmes/Made-up Programme', to: `${MOD}Root Body`, type: 'service' },
    { from: 'Intelligence/defence-landscape/Frameworks/Made-up Framework', to: `${MOD}Root Body`, type: 'customer' },
    { from: 'Intelligence/defence-landscape/Frameworks/Made-up Framework', to: 'CRM/organisations/government/Made-up Department', type: 'operator' },
    { from: 'Intelligence/defence-landscape/Portals/Made-up Portal', to: 'CRM/organisations/government/Made-up Department', type: 'operator' },
    { from: 'Intelligence/events/Made-up Expo', to: 'CRM/networks/Made-up Cluster', type: 'operator' },
    { from: 'Intelligence/defence-landscape/Programmes/Second Programme', to: `${MOD}Root Body`, type: 'mentions' },
    { from: `${MOD}Root Body`, to: 'Top/Middle', type: 'in_folder' },
    { from: `${MOD}Arm One`, to: 'Top/Middle', type: 'in_folder' },
    { from: 'CRM/organisations/investors/Made-up Fund', to: 'Top/Middle', type: 'in_folder' },
    { from: 'Intelligence/defence-landscape/Programmes/Made-up Programme', to: 'Another', type: 'in_folder' },
    { from: 'Top/Middle', to: 'Top', type: 'parent' },
    { from: 'Top/Middle/Bottom', to: 'Top/Middle', type: 'parent' },
    { from: 'Skills/business-skills/write-a-thing', to: 'Top/Middle', type: 'reads' },
    { from: 'Skills/business-skills/write-a-thing', to: 'Another', type: 'writes' },
    { from: 'Skills/crm-skills/find-a-thing', to: '.', type: 'reads' },
    { from: 'Skills/crm-skills/find-a-thing', to: 'Top/Middle/Bottom', type: 'writes' },
    { from: 'Skills/Routes/A made-up job', to: 'Skills/crm-skills/find-a-thing', type: 'step' },
    { from: 'Skills/Routes/A made-up job', to: 'Skills/business-skills/write-a-thing', type: 'step' },
  ],
};
const deep = buildGraph(madeUp);
const deepRoutes: RouteInput[] = [
  {
    id: 'Skills/Routes/A made-up job',
    name: 'A made-up job',
    steps: [
      { skill: 'find-a-thing', skillId: 'Skills/crm-skills/find-a-thing', does: 'Finds a thing.' },
      { skill: 'write-a-thing', skillId: 'Skills/business-skills/write-a-thing', does: 'Writes a thing.' },
    ],
  },
];

const cases: [string, Graph, RouteInput[]][] = [
  ['the fixture', fixture, fixtureRoutes],
  ['a made-up deeper map', deep, deepRoutes],
];

const RELATIONS = ['customer', 'operator', 'service'];
const ids = (g: Graph, test: (n: Graph['nodes'][number]) => boolean) => g.nodes.filter(test).map((n) => n.id).sort();
/** Angle in [0, 2π). */
const norm = (a: number) => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
/** Whether angle a lies in the arc from a0 to a1 (a1 > a0, possibly wrapping). */
const inArc = (a: number, a0: number, a1: number) => {
  const span = a1 - a0;
  if (span >= 2 * Math.PI - 1e-9) return true;
  const d = norm(a - a0);
  return d <= span + 1e-9;
};
const noneOverlap = (boxes: { box: Box; text?: string }[]) => {
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      if (overlaps(boxes[i].box, boxes[j].box)) return `${boxes[i].text ?? i} overlaps ${boxes[j].text ?? j}`;
    }
  }
  return null;
};

describe.each(cases)('views drawn from %s', (_label, graph, routes) => {
  it('1. wheel: every defence page has a place; the ministry is at the centre; a child sits further out than its parent and within its arc; groups do not overlap in angle; two runs agree', () => {
    const wheel = wheelLayout(graph);
    const defence = ids(graph, (n) => n.layer === 'defence');
    expect(wheel.marks.map((m) => m.id).sort()).toEqual(defence);
    for (const m of wheel.marks) {
      expect(Number.isFinite(m.x) && Number.isFinite(m.y)).toBe(true);
      expect(m.r).toBeGreaterThan(0);
    }
    const byId = new Map(wheel.marks.map((m) => [m.id, m]));
    // The centre is the ministry: the family's root, with no parent of its own.
    expect(wheel.centre).not.toBeNull();
    expect(wheel.centre!.startsWith(MOD)).toBe(true);
    const centre = byId.get(wheel.centre!)!;
    expect([centre.x, centre.y]).toEqual([0, 0]);
    const parentEdges = graph.edges.filter((e) => e.type === 'parent' && e.from.startsWith(MOD) && e.to.startsWith(MOD));
    for (const m of wheel.marks.filter((mk) => mk.family === 'mod' && mk.id !== wheel.centre)) {
      const written = parentEdges.find((e) => e.from === m.id)?.to;
      const parent = byId.get(written ?? wheel.centre!)!;
      expect(Math.hypot(m.x, m.y), `${m.id} is further out than ${parent.id}`).toBeGreaterThan(Math.hypot(parent.x, parent.y));
      expect(parent.arc).not.toBeNull();
      expect(inArc(Math.atan2(m.y, m.x), parent.arc![0], parent.arc![1]), `${m.id} sits within the arc of ${parent.id}`).toBe(true);
    }
    for (const ring of ['middle', 'outer'] as const) {
      const groups = wheel.groups.filter((g) => g.ring === ring).sort((a, b) => a.a0 - b.a0);
      for (let i = 1; i < groups.length; i++) expect(groups[i].a0, `${groups[i].key} starts after ${groups[i - 1].key} ends`).toBeGreaterThanOrEqual(groups[i - 1].a1);
      if (groups.length > 1) expect(groups[groups.length - 1].a1 - groups[0].a0).toBeLessThanOrEqual(2 * Math.PI);
      for (const g of groups) {
        for (const m of wheel.marks.filter((mk) => mk.family === g.key)) expect(inArc(Math.atan2(m.y, m.x), g.a0, g.a1), `${m.id} sits in its group's arc`).toBe(true);
      }
    }
    expect(JSON.stringify(wheelLayout(graph))).toBe(JSON.stringify(wheel));
    const shuffled = buildGraph({ nodes: [...graph.nodes].reverse(), edges: [...graph.edges].reverse() });
    expect(JSON.stringify(wheelLayout(shuffled))).toBe(JSON.stringify(wheel));
  });

  it('2. tree: every folder is below and indented from its parent; rows do not overlap; every skill is placed in its group', () => {
    const tree = treeLayout(graph, routes);
    const folders = ids(graph, (n) => n.kind === 'folder');
    expect(tree.rows.map((r) => r.id).sort()).toEqual(folders);
    const rows = new Map(tree.rows.map((r) => [r.id, r]));
    for (const e of graph.edges.filter((ed) => ed.type === 'parent' && rows.has(ed.from) && rows.has(ed.to))) {
      const child = rows.get(e.from)!;
      const parent = rows.get(e.to)!;
      expect(child.y, `${child.id} is below ${parent.id}`).toBeGreaterThan(parent.y);
      expect(child.x, `${child.id} is indented from ${parent.id}`).toBeGreaterThan(parent.x);
    }
    const sorted = [...tree.rows].sort((a, b) => a.top - b.top);
    for (let i = 1; i < sorted.length; i++) expect(sorted[i].top).toBeGreaterThanOrEqual(sorted[i - 1].bottom);
    const skills = graph.nodes.filter((n) => n.kind === 'skill');
    const placed = tree.groups.flatMap((g) => g.marks.map((m) => ({ id: m.id, group: g.key })));
    expect(placed.map((p) => p.id).sort()).toEqual(skills.map((s) => s.id).sort());
    for (const p of placed) expect(p.group).toBe(skillGroupOf(graph.byId.get(p.id)!).key);
    expect(JSON.stringify(treeLayout(graph, routes))).toBe(JSON.stringify(tree));
  });

  it('3. bands: one per folder that holds defence pages, with the right count and a width that grows with it', () => {
    const whole = wholeMapLayout(graph, routes);
    const expected = new Map<string, number>();
    for (const e of graph.edges) {
      if (e.type === 'in_folder' && graph.byId.get(e.from)!.layer === 'defence' && graph.byId.get(e.to)!.kind === 'folder') {
        expected.set(e.to, (expected.get(e.to) ?? 0) + 1);
      }
    }
    expect(whole.bands.map((b) => b.folder).sort()).toEqual([...expected.keys()].sort());
    for (const band of whole.bands) {
      expect(band.count).toBe(expected.get(band.folder));
      expect(band.width).toBeGreaterThan(0);
    }
    const bySize = [...whole.bands].sort((a, b) => a.count - b.count);
    for (let i = 1; i < bySize.length; i++) {
      if (bySize[i].count > bySize[i - 1].count) expect(bySize[i].width).toBeGreaterThanOrEqual(bySize[i - 1].width);
    }
    if (bySize.length > 1 && bySize[bySize.length - 1].count > bySize[0].count * 4) {
      expect(bySize[bySize.length - 1].width).toBeGreaterThan(bySize[0].width);
    }
  });

  it('4. who buys: the three columns hold exactly the pages with a customer, operator or service connection; every line joins rows that exist; the order is the same every time', () => {
    const buyers = buyersLayout(graph);
    const related = graph.edges.filter((e) => RELATIONS.includes(e.type));
    const expected = [...new Set(related.flatMap((e) => [e.from, e.to]))].sort();
    const rows = [...buyers.left, ...buyers.middle, ...buyers.right];
    expect(rows.map((r) => r.id).sort()).toEqual(expected);
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
    for (const r of buyers.left) expect(graph.byId.get(r.id)!.kind).toBe('programme');
    const targets = new Set(related.map((e) => e.to));
    for (const r of buyers.middle) expect(targets.has(r.id)).toBe(true);
    const rowIds = new Set(rows.map((r) => r.id));
    expect(buyers.links.length).toBe(related.length);
    for (const link of buyers.links) {
      expect(rowIds.has(link.from) && rowIds.has(link.to)).toBe(true);
      expect(related.some((e) => e.from === link.from && e.to === link.to && e.type === link.type)).toBe(true);
    }
    expect(buyers.leftOut).toBe(graph.nodes.filter((n) => n.layer === 'defence' && !rowIds.has(n.id)).length);
    expect(JSON.stringify(buyersLayout(graph))).toBe(JSON.stringify(buyers));
  });

  it('5. how a job runs: for each route, the steps, folders and counts match the route module', () => {
    const jobs = jobsLayout(graph, routes);
    expect(jobs.jobs.map((j) => j.id)).toEqual(routes.map((r) => r.id));
    const filedCount = (folder: string) => graph.edges.filter((e) => e.type === 'in_folder' && e.to === folder && graph.byId.get(e.from)!.layer === 'defence').length;
    for (const route of routes) {
      const view = routeView(graph, route);
      const steps = jobs.steps.filter((s) => s.route === route.id);
      expect(steps.map((s) => s.skillId)).toEqual(view.steps.map((s) => s.skillId));
      expect(steps.map((s) => s.number)).toEqual(view.steps.map((s) => s.number));
      for (const step of view.steps) {
        const links = jobs.links.filter((l) => l.route === route.id && l.step === step.number);
        expect(links.filter((l) => l.type === 'reads').map((l) => l.folder).sort()).toEqual(step.reads.map((n) => n.id).sort());
        expect(links.filter((l) => l.type === 'writes').map((l) => l.folder).sort()).toEqual(step.writes.map((n) => n.id).sort());
      }
    }
    for (const folder of jobs.folders) expect(folder.count, folder.id).toBe(filedCount(folder.id));
    const used = new Set(jobs.links.map((l) => l.folder));
    expect(jobs.folders.map((f) => f.id).sort()).toEqual([...used].sort());
    expect(JSON.stringify(jobsLayout(graph, routes))).toBe(JSON.stringify(jobs));
  });

  it('6. at a glance: every page appears exactly once, in one group, shaded by its count of named connections', () => {
    const glance = glanceLayout(graph);
    const tiles = glance.groups.flatMap((g) => g.tiles.map((t) => ({ ...t, group: g.key })));
    expect(tiles.map((t) => t.id).sort()).toEqual(graph.nodes.map((n) => n.id).sort());
    for (const g of glance.groups) expect(g.count).toBe(g.tiles.length);
    const named = (id: string) => graph.edges.filter((e) => (e.from === id || e.to === id) && !['mentions', 'in_folder'].includes(e.type)).length;
    for (const t of tiles) expect(t.shade, t.id).toBe(shadeFor(named(t.id)));
    expect(JSON.stringify(glanceLayout(graph))).toBe(JSON.stringify(glance));
  });

  it('8. labels: no two overlap in any view, at any step of the whole map\'s zoom', () => {
    const whole = wholeMapLayout(graph, routes);
    for (let step = 0; step < ZOOM_STEPS.length; step++) {
      // A curved label takes a run of boxes along its arc; boxes of one label may touch each other.
      const shown = whole.labels.filter((l) => l.tier <= step);
      const boxes = shown.map((l) => labelBoxesAt(l, ZOOM_STEPS[step]));
      for (let i = 0; i < shown.length; i++) {
        for (let j = i + 1; j < shown.length; j++) {
          const clash = boxes[i].some((a) => boxes[j].some((b) => overlaps(a, b)));
          expect(clash, `whole map at step ${step}: ${shown[i].text} overlaps ${shown[j].text}`).toBe(false);
        }
      }
    }
    // The centre is always named.
    expect(whole.labels.find((l) => l.id === whole.wheel.centre)?.tier).toBe(0);
    expect(noneOverlap(whole.tree.texts), 'the business tree').toBeNull();
    expect(noneOverlap(buyersLayout(graph).texts), 'who buys').toBeNull();
    expect(noneOverlap(jobsLayout(graph, routes).texts), 'how a job runs').toBeNull();
    for (const group of glanceLayout(graph).groups) expect(noneOverlap(group.texts), `at a glance, ${group.label}`).toBeNull();
  });
});
