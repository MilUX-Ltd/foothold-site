// Acceptance tests 7 to 15 for the map page, against the fixture build
// (FOOTHOLD_DATA_SOURCE=fixture). Tests 1 to 6 are unit tests in tests/unit.
//
// Since the four views, the canvas these tests were written for is the
// network view, under "More" (view=network); the page is ready when
// #explorer says so, and tests of the canvas itself open that view.
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import fixture from '../fixtures/foothold-map.json' with { type: 'json' };
import { expectNoAxeViolations } from '../support/axe';
import { syntheticMap } from '../support/synthetic-map';
import { buildGraph } from '../../src/lib/graph/model';
import { computeLayout } from '../../src/lib/graph/layout';
import { toPayload } from '../../src/lib/graph/payload';

const FRAMEWORK = 'Intelligence/defence-landscape/Frameworks/Example Supplier Framework';
const CLUSTER = 'CRM/networks/Example Regional Defence Cluster';
const VAULT = '.';

/** Opens the map and waits until the viewer is ready; for the network view, until the canvas has drawn its first frame. */
async function openMap(page: Page, query = '') {
  await page.goto(`/map/${query}`);
  await expect(page.locator('#explorer')).toHaveAttribute('data-ready', 'true');
  if (query.includes('view=network')) await expect(page.locator('#map-canvas')).toHaveAttribute('data-ready', 'true');
}

/** Opens the list of every page, which starts folded beside the drawing. */
async function unfoldList(page: Page) {
  const toggle = page.getByRole('button', { name: 'Every page on the map', exact: true });
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
}

const stateParam = (page: Page, key: string) => new URL(page.url()).searchParams.get(key);

test.describe('the map page', () => {
  test('7. shows a canvas and a list holding every node in the fixture', async ({ page }) => {
    await openMap(page, '?view=network');
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(page.locator('#map-canvas')).toBeVisible();
    const list = page.getByRole('region', { name: 'Every page on the map' });
    const buttons = list.locator('button[data-id]');
    await expect(buttons).toHaveCount(fixture.nodes.length);
    const ids = await buttons.evaluateAll((els) => els.map((el) => el.getAttribute('data-id')));
    expect([...ids].sort()).toEqual(fixture.nodes.map((n) => n.id).sort());
    for (const node of fixture.nodes) await expect(list).toContainText(node.name);
  });

  test('8. choosing a node in the list by keyboard alone selects it, lists its connections and puts it in the address', async ({ page }) => {
    await openMap(page);
    await unfoldList(page);
    const search = page.getByRole('searchbox', { name: 'Find a page on the map' });
    await search.focus();
    await page.keyboard.type('Supplier');
    await page.keyboard.press('Tab');
    const choice = page.getByRole('region', { name: 'Every page on the map' }).getByRole('button', { name: /Example Supplier Framework/ });
    await expect(choice).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(choice).toHaveAttribute('aria-current', 'true');
    const panel = page.getByRole('region', { name: 'Selected page' });
    await expect(panel.getByRole('heading', { name: 'Example Supplier Framework' })).toBeVisible();
    const outgoing = panel.locator('[data-direction="outgoing"]');
    await expect(outgoing).toContainText('the work is for');
    await expect(outgoing).toContainText('Ministry of Defence');
    await expect(outgoing).toContainText('run by');
    await expect(outgoing).toContainText('Defence Science and Technology Laboratory');
    await expect(panel.locator('[data-direction="incoming"]')).toContainText('Example Innovation Programme');
    await expect.poll(() => stateParam(page, 'node')).toBe(FRAMEWORK);
    await expect(page.getByRole('status')).toContainText('Example Supplier Framework');
  });

  test('9. loading an address with a selected node restores that selection, and an unknown id is ignored', async ({ page }) => {
    await openMap(page, `?node=${encodeURIComponent(FRAMEWORK)}`);
    const panel = page.getByRole('region', { name: 'Selected page' });
    await expect(panel.getByRole('heading', { name: 'Example Supplier Framework' })).toBeVisible();
    await expect(page.locator(`button[data-id="${FRAMEWORK}"]`)).toHaveAttribute('aria-current', 'true');

    await openMap(page, '?node=No%2Fsuch%2Fnode');
    await expect(page.locator('button[aria-current="true"]')).toHaveCount(0);
    await expect.poll(() => stateParam(page, 'node')).toBeNull();
  });

  test('10. a path between two nodes is listed in text, and the page says when there is none', async ({ page }) => {
    await openMap(page);
    // The path finder is a panel over the map that opens from the map's controls.
    await page.getByRole('button', { name: 'Find a path', exact: true }).click();
    await page.getByLabel('From').selectOption(FRAMEWORK);
    await page.getByLabel('To', { exact: true }).selectOption(CLUSTER);
    await page.getByRole('button', { name: 'Find the path' }).focus();
    await page.keyboard.press('Enter');
    const result = page.getByRole('region', { name: 'Path' });
    await expect(result.locator('ol > li')).toHaveText([/Example Supplier Framework/, /Ministry of Defence/, /CRM/, /Example Regional Defence Cluster/]);
    await expect(result).toContainText('3 steps');
    await expect.poll(() => [stateParam(page, 'from'), stateParam(page, 'to')]).toEqual([FRAMEWORK, CLUSTER]);
    await expect(page.getByRole('status')).toContainText('3 steps');

    await page.getByLabel('To', { exact: true }).selectOption(VAULT);
    await page.getByRole('button', { name: 'Find the path' }).click();
    await expect(result).toContainText('No path joins Example Supplier Framework and The whole vault');
    await expect(result.locator('ol > li')).toHaveCount(0);
    await expect(page.getByRole('status')).toContainText('No path');
  });

  test('10. a path in the address is restored on load', async ({ page }) => {
    await openMap(page, `?from=${encodeURIComponent(FRAMEWORK)}&to=${encodeURIComponent(CLUSTER)}`);
    await expect(page.getByRole('region', { name: 'Path' }).locator('ol > li')).toHaveCount(4);
    await expect(page.getByLabel('From')).toHaveValue(FRAMEWORK);
  });

  test('11. no automated accessibility violations in the default, selected and path states', async ({ page }) => {
    await openMap(page);
    await expectNoAxeViolations(page);
    await openMap(page, `?node=${encodeURIComponent(FRAMEWORK)}`);
    await expect(page.getByRole('region', { name: 'Selected page' }).getByRole('heading', { name: 'Example Supplier Framework' })).toBeVisible();
    await expectNoAxeViolations(page);
    await openMap(page, `?from=${encodeURIComponent(FRAMEWORK)}&to=${encodeURIComponent(CLUSTER)}`);
    await expect(page.getByRole('region', { name: 'Path' }).locator('ol > li')).toHaveCount(4);
    await expectNoAxeViolations(page);
  });

  test.describe('with reduced motion requested', () => {
    test.use({ reducedMotion: 'reduce' });
    test('12. nothing animates', async ({ page }) => {
      await openMap(page, '?view=network');
      const canvas = page.locator('#map-canvas');
      await expect(canvas).toHaveAttribute('data-motion', 'reduced');
      await unfoldList(page);
      const frames = async () => Number(await canvas.getAttribute('data-frames'));
      const before = await frames();
      await page.locator(`button[data-id="${FRAMEWORK}"]`).click();
      await expect(page.getByRole('region', { name: 'Selected page' }).getByRole('heading', { name: 'Example Supplier Framework' })).toBeVisible();
      await page.waitForTimeout(150);
      const after = await frames();
      // A jump, not a flight: the selection is drawn in a frame or two, then nothing moves.
      expect(after - before).toBeLessThanOrEqual(2);
      await page.waitForTimeout(700);
      expect(await frames()).toBe(after);
      expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
    });
  });

  test('13. makes no request to another host and breaks no security rule', async ({ page, baseURL }) => {
    const outside: string[] = [];
    const problems: string[] = [];
    const requests: string[] = [];
    page.on('request', (request) => {
      requests.push(request.url());
      if (!request.url().startsWith(baseURL ?? '')) outside.push(request.url());
    });
    page.on('console', (message) => {
      if (['error', 'warning'].includes(message.type())) problems.push(message.text());
    });
    page.on('pageerror', (error) => problems.push(error.message));
    await page.addInitScript(() => {
      document.addEventListener('securitypolicyviolation', (event) => {
        (window as unknown as { violations: string[] }).violations ??= [];
        (window as unknown as { violations: string[] }).violations.push(`${event.violatedDirective} ${event.blockedURI}`);
      });
    });
    const response = await page.goto(`/map/?node=${encodeURIComponent(FRAMEWORK)}`);
    await expect(page.locator('#explorer')).toHaveAttribute('data-ready', 'true');
    await page.waitForLoadState('networkidle');
    expect(outside).toEqual([]);
    expect(problems).toEqual([]);
    expect(await page.evaluate(() => (window as unknown as { violations?: string[] }).violations ?? [])).toEqual([]);
    expect(requests.some((url) => url.includes('/map/graph.json'))).toBe(true);
    const csp = response?.headers()['content-security-policy'] ?? '';
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("connect-src 'self'");
    expect(csp).not.toContain('unsafe-inline');
    expect(await page.locator('script:not([src])').count()).toBe(0);
  });

  test('works at 375px wide with no sideways scroll', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await openMap(page);
    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
    await expectNoAxeViolations(page);
  });

  test('selecting a node or a path redraws in 200 ms or less at the real data size', async ({ page }) => {
    // The constraint is set on the real data (461 nodes, 1,344 edges). The
    // pipeline never fetches it, so the viewer is fed a made-up map of the same
    // size in place of its data file.
    const graph = buildGraph(syntheticMap(461, 1344));
    const payload = toPayload(graph, computeLayout(graph));
    await page.route('**/map/graph.json', (route) => route.fulfill({ json: payload }));
    const [a, b] = [graph.nodes[3].id, graph.nodes[400].id];
    await openMap(page, `?view=network&node=${encodeURIComponent(a)}`);
    const timeClick = (selector: string) =>
      page.evaluate(async (sel) => {
        const target = document.querySelector<HTMLElement>(sel);
        if (!target) throw new Error(`nothing matches ${sel}`);
        const start = performance.now();
        target.click();
        await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
        return { total: performance.now() - start, draw: Number(document.getElementById('map-canvas')?.dataset.drawMs) };
      }, selector);
    // Select another node from the selected node's connections.
    const select = await timeClick('#selection-body button[data-id]');
    expect(select.draw).toBeLessThanOrEqual(200);
    expect(select.total).toBeLessThanOrEqual(200);
    // Ask for a path.
    await page.evaluate(([from, to]) => {
      for (const id of ['path-from', 'path-to']) {
        const option = document.createElement('option');
        option.value = id === 'path-from' ? from : to;
        option.textContent = option.value;
        document.getElementById(id)?.append(option);
        (document.getElementById(id) as HTMLSelectElement).value = option.value;
      }
    }, [a, b]);
    const path = await timeClick('#path-go');
    await expect(page.getByRole('region', { name: 'Path' })).toContainText(/steps? from|No path/);
    expect(path.draw).toBeLessThanOrEqual(200);
    expect(path.total).toBeLessThanOrEqual(200);
    test.info().annotations.push({ type: 'redraw', description: `select ${select.total.toFixed(1)} ms (draw ${select.draw} ms), path ${path.total.toFixed(1)} ms (draw ${path.draw} ms)` });
    console.log(`Redraw at real size: select ${select.total.toFixed(1)} ms (draw ${select.draw} ms), path ${path.total.toFixed(1)} ms (draw ${path.draw} ms)`);
  });

  test('the home page links to the map', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('navigation', { name: 'Site' }).getByRole('link', { name: 'Map' })).toHaveAttribute('href', '/map/');
  });
});

test.describe('the built site', () => {
  const dist = new URL('../../dist/', import.meta.url).pathname;

  test('14. the script-size check passes at 300 KB compressed', () => {
    const out = execFileSync('node', ['scripts/check-bundle-size.mjs'], { encoding: 'utf8' });
    expect(out).toContain('Bundle-size check passed');
    expect(out).toContain('budget 300000 bytes');
  });

  test('15. the name of the earlier product does not appear in the built site', () => {
    // Built from parts so this file does not carry the name either.
    const earlier = new RegExp(['Van', 'tage'].join(''), 'i');
    const walk = (dir: string): string[] => readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? walk(path) : [path];
    });
    const files = walk(dist).filter((f) => /\.(html|js|css|json|svg|txt|xml)$/.test(f));
    expect(files.length).toBeGreaterThan(0);
    const found = files.filter((f) => earlier.test(readFileSync(f, 'utf8')));
    expect(found).toEqual([]);
  });
});
