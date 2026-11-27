// Acceptance tests 9 to 20 for the four views of the pack, against the fixture
// build (FOOTHOLD_DATA_SOURCE=fixture). Tests 1 to 8 are unit tests in
// tests/unit/views.test.ts and tests/unit/graph-url-state.test.ts.
//
// What the tests read: #explorer carries the view shown (data-view) and says
// when the viewer is ready (data-ready). Each view's drawing sits in a pane
// marked data-view-pane; every page in it is a mark (.mk) carrying its id
// (data-id). A mark's state is a class: is-sel (selected), is-pt (pointed at),
// is-lit (a named neighbour of the page pointed at), r-strong (lit by a job).
import { execFileSync } from 'node:child_process';
import { expect, test, type Page } from '@playwright/test';
import fixture from '../fixtures/foothold-map.json' with { type: 'json' };
import { expectNoAxeViolations } from '../support/axe';
import { syntheticMap } from '../support/synthetic-map';
import { buildGraph } from '../../src/lib/graph/model';
import { computeLayout } from '../../src/lib/graph/layout';
import { toPayload } from '../../src/lib/graph/payload';
import { sceneFor } from '../../src/lib/graph/view-scenes';
import type { RouteInput } from '../../src/lib/graph/routes';

const FRAMEWORK = 'Intelligence/defence-landscape/Frameworks/Example Supplier Framework';
const MOD = 'CRM/organisations/mod/Ministry of Defence';
const DSTL = 'CRM/organisations/mod/Defence Science and Technology Laboratory';
const PORTAL = 'Intelligence/defence-landscape/Portals/Find a Tender';
const CLUSTER = 'CRM/networks/Example Regional Defence Cluster';
const OPERATIONS = 'Operations';
const TENDER = 'Skills/Routes/A tender lands';
const tender = fixture.routes.find((r) => r.id === TENDER)!;

const VIEWS = [
  { view: 'map', name: 'The whole map' },
  { view: 'buyers', name: 'Who buys' },
  { view: 'jobs', name: 'How a job runs' },
  { view: 'glance', name: 'At a glance' },
] as const;
type View = (typeof VIEWS)[number]['view'] | 'network';

async function open(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator('#explorer')).toHaveAttribute('data-ready', 'true');
}

/** Opens the list of every page, which starts folded beside the drawing. */
async function unfoldList(page: Page) {
  const toggle = page.getByRole('button', { name: 'Every page on the map', exact: true });
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
}

const param = (page: Page, key: string) => new URL(page.url()).searchParams.get(key);
const switcher = (page: Page) => page.getByRole('group', { name: 'Views of the pack' });
const viewButton = (page: Page, name: string) => switcher(page).getByRole('button', { name, exact: true });
const pane = (page: Page, view: View) => page.locator(`[data-view-pane="${view}"]`);
const mark = (page: Page, view: View, id: string) => pane(page, view).locator(`.mk[data-id="${id}"]`).first();
const status = (page: Page) => page.getByRole('status');

async function choose(page: Page, view: View) {
  if (view === 'network') {
    await viewButton(page, 'More').click();
    await page.getByRole('button', { name: 'Network', exact: true }).click();
  } else {
    await viewButton(page, VIEWS.find((v) => v.view === view)!.name).click();
  }
  await expect(page.locator('#explorer')).toHaveAttribute('data-view', view);
  await expect(page.locator('#explorer')).toHaveAttribute('data-ready', 'true');
}

async function expectShowing(page: Page, view: View) {
  await expect(page.locator('#explorer')).toHaveAttribute('data-view', view);
  await expect(pane(page, view)).toBeVisible();
  for (const other of [...VIEWS.map((v) => v.view), 'network'] as View[]) if (other !== view) await expect(pane(page, other)).toBeHidden();
}

const noSidewaysScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

test.describe('four views of the pack', () => {
  test('9. the switcher lists the four views and "More"; choosing each by mouse shows that view and puts it in the address', async ({ page }) => {
    await open(page, '/map/');
    const group = switcher(page);
    await expect(group).toBeVisible();
    for (const { name } of VIEWS) await expect(viewButton(page, name)).toBeVisible();
    await expect(viewButton(page, 'More')).toBeVisible();
    await expect(viewButton(page, 'The whole map')).toHaveAttribute('aria-pressed', 'true');
    await expectShowing(page, 'map');

    for (const { view, name } of [...VIEWS.slice(1), VIEWS[0]]) {
      await viewButton(page, name).click();
      await expectShowing(page, view);
      await expect(viewButton(page, name)).toHaveAttribute('aria-pressed', 'true');
      await expect(group.locator('[aria-pressed="true"]')).toHaveCount(1);
      await expect.poll(() => param(page, 'view')).toBe(view === 'map' ? null : view);
    }

    await choose(page, 'network');
    await expectShowing(page, 'network');
    await expect.poll(() => param(page, 'view')).toBe('network');
    await expect(page.locator('#map-canvas')).toBeVisible();
  });

  test('10. by keyboard alone the arrow keys move between views, and the change is announced', async ({ page }) => {
    await open(page, '/map/');
    const first = viewButton(page, 'The whole map');
    for (let i = 0; i < 30 && !(await first.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press('Tab');
    await expect(first).toBeFocused();

    await page.keyboard.press('ArrowRight');
    await expectShowing(page, 'buyers');
    await expect(viewButton(page, 'Who buys')).toBeFocused();
    await expect(status(page)).toContainText('Who buys');
    await expect.poll(() => param(page, 'view')).toBe('buyers');

    await page.keyboard.press('ArrowRight');
    await expectShowing(page, 'jobs');
    await expect(status(page)).toContainText('How a job runs');
    await page.keyboard.press('ArrowRight');
    await expectShowing(page, 'glance');
    await expect(status(page)).toContainText('At a glance');
    // The row wraps round at either end.
    await page.keyboard.press('ArrowRight');
    await expectShowing(page, 'map');
    await expect(status(page)).toContainText('The whole map');
    await page.keyboard.press('ArrowLeft');
    await expectShowing(page, 'glance');
    await expect(viewButton(page, 'At a glance')).toBeFocused();
  });

  test('11. a page selected in one view is still selected after switching, in every pair of views that both hold it', async ({ page }) => {
    // The ministry is in the whole map, who buys and at a glance; a folder is
    // in the whole map, how a job runs and at a glance. Between them they
    // cover every pair of views that share a page.
    for (const [id, views] of [
      [MOD, ['map', 'buyers', 'glance', 'map', 'glance', 'buyers']],
      [OPERATIONS, ['map', 'jobs', 'glance', 'map', 'glance', 'jobs']],
    ] as [string, View[]][]) {
      await open(page, '/map/');
      await unfoldList(page);
      await page.getByRole('region', { name: 'Every page on the map' }).locator(`button[data-id="${id}"]`).click();
      for (const view of views) {
        if ((await page.locator('#explorer').getAttribute('data-view')) !== view) await choose(page, view);
        await expect(mark(page, view, id), `${id} selected in ${view}`).toHaveClass(/\bis-sel\b/);
        await expect(pane(page, view).locator('.mk.is-sel').first()).toHaveAttribute('data-id', id);
        await expect(page.getByRole('region', { name: 'Selected page' }).getByRole('heading', { level: 3 })).toHaveText(fixture.nodes.find((n) => n.id === id)!.name);
        await expect.poll(() => param(page, 'node')).toBe(id);
        await expect(page.locator('#view-note')).toBeHidden();
      }
    }
  });

  test('12. selecting a page the next view does not hold shows the "not in this view" line with a working link', async ({ page }) => {
    await open(page, `/map/?node=${encodeURIComponent(CLUSTER)}`);
    await expect(mark(page, 'map', CLUSTER)).toHaveClass(/\bis-sel\b/);
    for (const view of ['buyers', 'jobs'] as View[]) {
      await choose(page, view);
      const note = page.locator('#view-note');
      await expect(note).toBeVisible();
      await expect(note).toContainText('This page is not in this view.');
      await expect(note.getByRole('link', { name: 'See it on the whole map.' })).toBeVisible();
      await expect.poll(() => param(page, 'node')).toBe(CLUSTER);
    }
    await page.locator('#view-note').getByRole('link', { name: 'See it on the whole map.' }).click();
    await expectShowing(page, 'map');
    await expect(mark(page, 'map', CLUSTER)).toHaveClass(/\bis-sel\b/);
    await expect(page.locator('#view-note')).toBeHidden();
    await expect.poll(() => [param(page, 'view'), param(page, 'node')]).toEqual([null, CLUSTER]);
  });

  test('13. an open job and step stay open across the whole map and how a job runs', async ({ page }) => {
    await open(page, `/map/?route=${encodeURIComponent(TENDER)}&step=1`);
    const panel = page.getByRole('region', { name: 'Jobs the pack already knows how to do' });
    const skill = tender.steps[0].skill_id;
    const check = async (view: View) => {
      await expect(panel).toContainText(`Step 1 of ${tender.steps.length}`);
      await expect.poll(() => [param(page, 'route'), param(page, 'step')]).toEqual([TENDER, '1']);
      await expect(page.locator('#map-views')).not.toHaveAttribute('data-lit', '');
      if (view === 'jobs') await expect(pane(page, 'jobs').locator(`.mk[data-route="${TENDER}"][data-step="1"]`)).toHaveClass(/\br-strong\b/);
      else await expect(mark(page, view, skill)).toHaveClass(/\br-strong\b/);
    };
    await check('map');
    await choose(page, 'jobs');
    await check('jobs');
    // A step chosen in the drawing moves the job on, here and in the panel.
    await pane(page, 'jobs').locator(`.mk[data-route="${TENDER}"][data-step="2"]`).click();
    await expect(panel).toContainText(`Step 2 of ${tender.steps.length}`);
    await expect.poll(() => param(page, 'step')).toBe('2');
    await panel.getByRole('button', { name: 'Previous step', exact: true }).click();
    await check('jobs');
    await choose(page, 'map');
    await check('map');
  });

  test('14. an address for each view restores it, and view=3d opens the network view in 3D', async ({ page }) => {
    for (const { view, name } of VIEWS) {
      await open(page, view === 'map' ? '/map/' : `/map/?view=${view}`);
      await expectShowing(page, view);
      await expect(viewButton(page, name)).toHaveAttribute('aria-pressed', 'true');
    }
    await open(page, `/map/?view=glance&node=${encodeURIComponent(FRAMEWORK)}`);
    await expectShowing(page, 'glance');
    await expect(mark(page, 'glance', FRAMEWORK)).toHaveClass(/\bis-sel\b/);

    await open(page, '/map/?view=3d');
    await expectShowing(page, 'network');
    await expect(page.locator('#map-canvas')).toHaveAttribute('data-ready', 'true');
    await expect(page.getByRole('button', { name: '3D view', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => param(page, 'view')).toBe('3d');
    await open(page, '/map/?view=2d');
    await expectShowing(page, 'network');
    await expect(page.getByRole('button', { name: '3D view', exact: true })).toHaveAttribute('aria-pressed', 'false');
    await open(page, '/map/?view=nonsense');
    await expectShowing(page, 'map');
  });

  test.describe('with script off', () => {
    test.use({ javaScriptEnabled: false });
    test('15. the home page shows the whole map as a drawing with real text, and the list of every page', async ({ page }) => {
      await page.goto('/');
      const drawing = page.locator('#map-drawing');
      await expect(drawing).toBeVisible();
      expect((await drawing.boundingBox())!.height).toBeGreaterThan(200);
      for (const name of ['Ministry of Defence', 'Operations']) await expect(drawing.locator('text', { hasText: name }).first()).toBeAttached();
      expect(await drawing.locator('.mk[data-id]').count()).toBe(fixture.nodes.length);
      const list = page.getByRole('region', { name: 'Every page on the map' });
      await expect(list).toBeVisible();
      await expect(list.locator('button[data-id]')).toHaveCount(fixture.nodes.length);
    });
  });

  test('16. pointing at a page marks it and its named neighbours and quietens the rest', async ({ page }) => {
    await open(page, '/map/');
    const svg = pane(page, 'map').locator('svg#map-drawing');
    await mark(page, 'map', FRAMEWORK).hover();
    await expect(mark(page, 'map', FRAMEWORK)).toHaveClass(/\bis-pt\b/);
    for (const id of [MOD, DSTL]) await expect(mark(page, 'map', id), id).toHaveClass(/\bis-lit\b/);
    // The portal is only mentioned, which is not a named connection.
    await expect(mark(page, 'map', PORTAL)).not.toHaveClass(/\bis-lit\b/);
    await expect(svg).toHaveClass(/\bis-pointing\b/);
    const quiet = await mark(page, 'map', PORTAL).evaluate((el) => Number(getComputedStyle(el).opacity));
    const lit = await mark(page, 'map', MOD).evaluate((el) => Number(getComputedStyle(el).opacity));
    expect(quiet).toBeLessThan(lit);
    await page.mouse.move(2, 2);
    await expect(svg).not.toHaveClass(/\bis-pointing\b/);

    // The same in another view, and by keyboard focus as well as the pointer.
    await choose(page, 'glance');
    await mark(page, 'glance', FRAMEWORK).focus();
    await expect(mark(page, 'glance', FRAMEWORK)).toHaveClass(/\bis-pt\b/);
    await expect(mark(page, 'glance', MOD)).toHaveClass(/\bis-lit\b/);
    await expect(mark(page, 'glance', PORTAL)).not.toHaveClass(/\bis-lit\b/);
  });

  test('17. at 375 pixels wide there is no sideways scroll in any view, and who buys and how a job runs are lists', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await open(page, '/map/');
    for (const view of ['map', 'buyers', 'jobs', 'glance', 'network'] as View[]) {
      if (view !== 'map') await choose(page, view);
      expect(await noSidewaysScroll(page), view).toBe(true);
      expect(await switcher(page).evaluate((el) => el.scrollWidth <= el.clientWidth || getComputedStyle(el).overflowX !== 'visible')).toBe(true);
    }
    for (const view of ['buyers', 'jobs'] as View[]) {
      await choose(page, view);
      const list = pane(page, view).locator('.view-list');
      await expect(list).toBeVisible();
      await expect(pane(page, view).locator('svg.view-svg')).toBeHidden();
      expect(await list.locator('li').count()).toBeGreaterThan(2);
    }
    const programme = pane(page, 'buyers').locator('.view-list');
    await choose(page, 'buyers');
    await expect(programme).toContainText('Example Innovation Programme');
    await expect(programme).toContainText('Ministry of Defence');
    await choose(page, 'jobs');
    await expect(pane(page, 'jobs').locator('.view-list')).toContainText(tender.name);
    await expect(pane(page, 'jobs').locator('.view-list')).toContainText('bid-response');
  });

  test('18. no automated accessibility violations in any view, in the landing state, and with a page selected', async ({ page }) => {
    await open(page, '/');
    await expect(page.locator('#explorer')).toHaveAttribute('data-state', 'landing');
    await expectNoAxeViolations(page);
    for (const view of ['map', 'buyers', 'jobs', 'glance', 'network'] as View[]) {
      await open(page, view === 'map' ? '/map/' : `/map/?view=${view}`);
      await expectNoAxeViolations(page);
      await open(page, `/map/?view=${view}&node=${encodeURIComponent(view === 'jobs' ? OPERATIONS : MOD)}`);
      await expect(page.getByRole('region', { name: 'Selected page' })).toBeVisible();
      await expectNoAxeViolations(page);
    }
    await open(page, `/map/?view=buyers&node=${encodeURIComponent(CLUSTER)}`);
    await expect(page.locator('#view-note')).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test.describe('with reduced motion requested', () => {
    test.use({ reducedMotion: 'reduce' });
    test('19. nothing animates on arrival or on switching', async ({ page }) => {
      await open(page, '/');
      await expect(page.locator('#map-views')).toHaveAttribute('data-motion', 'reduced');
      await expect(page.locator('#map-drawing')).not.toHaveClass(/\bdrawing\b/);
      expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
      const frames = async () => Number(await page.locator('#map-drawing').getAttribute('data-frames'));
      const settled = await frames();
      await page.waitForTimeout(600);
      expect(await frames()).toBe(settled);
      await page.getByRole('button', { name: 'Explore the map', exact: true }).click();
      for (const view of ['buyers', 'jobs', 'glance', 'map'] as View[]) {
        await choose(page, view);
        expect(await page.evaluate(() => document.getAnimations().length), view).toBe(0);
      }
      await unfoldList(page);
      const before = await frames();
      await page.getByRole('region', { name: 'Every page on the map' }).locator(`button[data-id="${FRAMEWORK}"]`).click();
      await page.waitForTimeout(150);
      const after = await frames();
      // A jump to the page, not a flight: a frame or two, then nothing moves.
      expect(after - before).toBeLessThanOrEqual(2);
      await page.waitForTimeout(600);
      expect(await frames()).toBe(after);
      expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
    });
  });

  test('20. script stays under 300 KB compressed, and switching views and selecting redraw in 200 ms or less at the real data size', async ({ page }) => {
    const out = execFileSync('node', ['scripts/check-bundle-size.mjs'], { encoding: 'utf8' });
    expect(out).toContain('Bundle-size check passed');
    expect(out).toContain('budget 300000 bytes');

    // The pipeline never fetches the real data, so the viewer is fed a
    // made-up map of the same size (461 pages, 1,344 connections) in place of
    // its data file and the drawings of the other views.
    const graph = buildGraph(syntheticMap(461, 1344));
    const routes: RouteInput[] = graph.nodes
      .filter((n) => n.kind === 'route')
      .map((n) => ({
        id: n.id,
        name: n.name,
        steps: (graph.links.get(n.id) ?? [])
          .filter((l) => l.direction === 'outgoing' && l.edge.type === 'step' && graph.byId.get(l.other)!.kind === 'skill')
          .slice(0, 3)
          .map((l) => ({ skill: graph.byId.get(l.other)!.name, skillId: l.other, does: 'A made-up step.' })),
      }))
      .filter((r) => r.steps.length > 0)
      .slice(0, 4);
    const payload = toPayload(graph, computeLayout(graph));
    await page.route('**/map/graph.json', (route) => route.fulfill({ json: payload }));
    for (const view of ['buyers', 'jobs', 'glance'] as const) {
      const scene = sceneFor(view, graph, routes);
      await page.route(`**/map/views/${view}.json`, (route) => route.fulfill({ json: scene }));
    }
    await open(page, '/map/');
    const timeSwitch = (name: string, view: string) =>
      page.evaluate(
        async ([label, v]) => {
          const button = [...document.querySelectorAll<HTMLButtonElement>('[data-view-button]')].find((b) => b.textContent?.trim() === label);
          if (!button) throw new Error(`no button ${label}`);
          const explorer = document.getElementById('explorer')!;
          const start = performance.now();
          button.click();
          for (;;) {
            await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
            if (explorer.dataset.view === v && explorer.dataset.ready === 'true') break;
            if (performance.now() - start > 5000) throw new Error(`view ${v} never drew`);
          }
          return performance.now() - start;
        },
        [name, view],
      );
    const times: Record<string, number> = {};
    for (const { view, name } of [...VIEWS.slice(1), VIEWS[0], VIEWS[1]]) {
      times[`${view}${times[view] === undefined ? '' : ' again'}`] = await timeSwitch(name, view);
    }
    // Selecting a mark in the drawing of real size.
    await choose(page, 'glance');
    const target = graph.nodes[200].id;
    const select = await page.evaluate(async (id) => {
      const el = document.querySelector<SVGElement>(`[data-view-pane="glance"] .mk[data-id="${CSS.escape(id)}"]`);
      if (!el) throw new Error(`no mark for ${id}`);
      const start = performance.now();
      el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
      return performance.now() - start;
    }, target);
    await expect(mark(page, 'glance', target)).toHaveClass(/\bis-sel\b/);
    const summary = `${Object.entries(times).map(([k, v]) => `${k} ${v.toFixed(1)} ms`).join(', ')}, select ${select.toFixed(1)} ms`;
    test.info().annotations.push({ type: 'switch', description: summary });
    console.log(`Switching at real size: ${summary}`);
    for (const [view, ms] of Object.entries(times)) expect(ms, view).toBeLessThanOrEqual(200);
    expect(select).toBeLessThanOrEqual(200);
  });
});
