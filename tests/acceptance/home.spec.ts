// Acceptance tests 4 to 13 for the home page and the map's landing and
// exploring states, against the fixture build (FOOTHOLD_DATA_SOURCE=fixture).
// Tests 1 to 3 are unit tests in tests/unit (fit, labels, edge filter).
import { expect, test, type Page } from '@playwright/test';
import fixture from '../fixtures/foothold-map.json' with { type: 'json' };
import { expectNoAxeViolations } from '../support/axe';

const FRAMEWORK = 'Intelligence/defence-landscape/Frameworks/Example Supplier Framework';

/** Opens a page holding the map and waits until the viewer has drawn. */
async function openMap(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator('#map-canvas')).toHaveAttribute('data-ready', 'true');
}

const explorer = (page: Page) => page.locator('#explorer');
const headline = (page: Page) => page.locator('#lead');

/** Where a node is drawn, in page coordinates, read from the flat view's published transform. */
async function nodeOnPage(page: Page, id: string) {
  const payload = (await (await page.request.get('/map/graph.json')).json()) as { nodes: { id: string; x: number; y: number }[] };
  const node = payload.nodes.find((n) => n.id === id);
  if (!node) throw new Error(`no node ${id} in the map data`);
  const view = (await page.locator('#map-canvas').getAttribute('data-view')) ?? '';
  const [scale, offsetX, offsetY] = view.split(' ').map(Number);
  const box = (await page.locator('#map-canvas').boundingBox())!;
  return { x: box.x + node.x * scale + offsetX, y: box.y + node.y * scale + offsetY };
}

test.describe('the home page', () => {
  test('4. shows one level-one heading, the canvas, the facts and a button named "Explore the map"', async ({ page }) => {
    await openMap(page, '/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.locator('#map-canvas')).toBeVisible();
    const facts = page.locator('dl.facts');
    await expect(facts).toBeVisible();
    for (const label of ['Defence pages', 'Skills', 'Folders', 'Job routes', 'Pack version']) await expect(facts).toContainText(label);
    await expect(page.getByRole('button', { name: 'Explore the map', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Get the pack on GitHub' })).toHaveAttribute('href', 'https://github.com/MilUX-Ltd/foothold');
    await expect(explorer(page)).toHaveAttribute('data-state', 'landing');
  });

  test('5. at 1280 pixels wide, no node is drawn underneath the headline panel', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openMap(page, '/');
    const lead = (await headline(page).boundingBox())!;
    const canvas = (await page.locator('#map-canvas').boundingBox())!;
    const bounds = (await page.locator('#map-canvas').getAttribute('data-node-bounds')) ?? '';
    const [left, top, right, bottom] = bounds.split(' ').map(Number);
    for (const v of [left, top, right, bottom]) expect(Number.isFinite(v)).toBe(true);
    const drawn = { left: canvas.x + left, top: canvas.y + top, right: canvas.x + right, bottom: canvas.y + bottom };
    const overlap = drawn.left < lead.x + lead.width && drawn.right > lead.x && drawn.top < lead.y + lead.height && drawn.bottom > lead.y;
    expect(overlap, `nodes drawn in ${JSON.stringify(drawn)}, headline panel at ${JSON.stringify(lead)}`).toBe(false);
    // And the drawing is not shrunk to nothing to get there.
    expect(drawn.right - drawn.left).toBeGreaterThan((canvas.width - lead.width) * 0.5);
  });

  test('6. pressing "Explore the map" hides the headline, focuses the search box and leaves the list reachable by keyboard', async ({ page }) => {
    await openMap(page, '/');
    await page.getByRole('button', { name: 'Explore the map', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(headline(page)).toBeHidden();
    await expect(explorer(page)).toHaveAttribute('data-state', 'exploring');
    await expect(page.getByRole('searchbox', { name: 'Find a page on the map' })).toBeFocused();
    await page.keyboard.press('Tab');
    const list = page.getByRole('region', { name: 'Every page on the map' });
    const focusedInList = await list.evaluate((region) => region.contains(document.activeElement) && document.activeElement?.matches('button[data-id]'));
    expect(focusedInList).toBe(true);
    await page.keyboard.press('Enter');
    await expect(page.getByRole('region', { name: 'Selected page' }).getByRole('heading', { level: 3 })).toBeVisible();
  });

  test('7. /map/ opens in the exploring state with no headline panel', async ({ page }) => {
    await openMap(page, '/map/');
    await expect(explorer(page)).toHaveAttribute('data-state', 'exploring');
    await expect(headline(page)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Explore the map', exact: true })).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Every page on the map' })).toBeVisible();
  });

  test('8. choosing a node on the home page puts the page into the exploring state and selects that node', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openMap(page, '/');
    const at = await nodeOnPage(page, FRAMEWORK);
    await page.mouse.click(at.x, at.y);
    await expect(explorer(page)).toHaveAttribute('data-state', 'exploring');
    await expect(headline(page)).toBeHidden();
    await expect(page.getByRole('region', { name: 'Selected page' }).getByRole('heading', { name: 'Example Supplier Framework' })).toBeVisible();
    await expect.poll(() => new URL(page.url()).searchParams.get('node')).toBe(FRAMEWORK);
  });

  test('9. the key turns the "mentions" and "filed in" lines on and off, and says so', async ({ page }) => {
    await openMap(page, '/map/');
    const canvas = page.locator('#map-canvas');
    const keyButton = page.getByRole('button', { name: 'Key', exact: true });
    await expect(keyButton).toHaveAttribute('aria-expanded', 'false');
    await keyButton.click();
    await expect(keyButton).toHaveAttribute('aria-expanded', 'true');
    const key = page.getByRole('region', { name: 'Key' });
    await expect(key).toBeVisible();
    await expect(key).toContainText('hidden until you point at a page or choose one');
    const quietTypes = new Set(['mentions', 'in_folder']);
    const quietCount = fixture.edges.filter((e) => quietTypes.has(e.type)).length;
    expect(quietCount).toBeGreaterThan(0);
    await expect(canvas).toHaveAttribute('data-edges-drawn', String(fixture.edges.length - quietCount));

    const toggle = key.getByRole('button', { name: /mentions.*filed in/i });
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('status')).toContainText('shown');
    await expect(canvas).toHaveAttribute('data-edges-drawn', String(fixture.edges.length));
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByRole('status')).toContainText('hidden');
    await expect(canvas).toHaveAttribute('data-edges-drawn', String(fixture.edges.length - quietCount));
  });

  test('10. at 375 pixels wide the home page has no sideways scroll and the heading comes before the canvas', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await openMap(page, '/');
    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
    const before = await page.evaluate(() => {
      const h1 = document.querySelector('h1')!;
      const canvas = document.getElementById('map-canvas')!;
      return Boolean(h1.compareDocumentPosition(canvas) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    expect(before).toBe(true);
    const h1 = (await page.getByRole('heading', { level: 1 }).boundingBox())!;
    const canvas = (await page.locator('#map-canvas').boundingBox())!;
    expect(h1.y + h1.height).toBeLessThanOrEqual(canvas.y);
  });

  test('11. no automated accessibility violations on / landing and exploring, and on /map/ with each panel open', async ({ page }) => {
    await openMap(page, '/');
    await expectNoAxeViolations(page);
    await page.getByRole('button', { name: 'Explore the map', exact: true }).click();
    await expect(explorer(page)).toHaveAttribute('data-state', 'exploring');
    await expectNoAxeViolations(page);

    await openMap(page, `/map/?node=${encodeURIComponent(FRAMEWORK)}`);
    await expect(page.getByRole('region', { name: 'Selected page' })).toBeVisible();
    for (const name of ['Key', 'Find a path', 'How to use the map']) {
      const button = page.getByRole('button', { name, exact: true });
      if ((await button.getAttribute('aria-expanded')) !== 'true') await button.click();
      await expect(button).toHaveAttribute('aria-expanded', 'true');
      await expect(page.getByRole('region', { name, exact: true })).toBeVisible();
      await expectNoAxeViolations(page);
    }
  });

  test.describe('with script off', () => {
    test.use({ javaScriptEnabled: false });
    test('12. the home page still shows the heading, the facts and the list of every page', async ({ page }) => {
      await page.goto('/');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(page.locator('dl.facts')).toBeVisible();
      const list = page.getByRole('region', { name: 'Every page on the map' });
      await expect(list).toBeVisible();
      await expect(list.locator('button[data-id]')).toHaveCount(fixture.nodes.length);
      for (const node of fixture.nodes) await expect(list).toContainText(node.name);
      await expect(page.getByText('The drawing needs script.')).toBeVisible();
      // A button that would do nothing without script is not offered.
      await expect(page.getByRole('button', { name: 'Explore the map', exact: true })).toHaveCount(0);
    });
  });

  test.describe('with reduced motion requested', () => {
    test.use({ reducedMotion: 'reduce' });
    test('13. the change from landing to exploring does not animate', async ({ page }) => {
      await openMap(page, '/');
      const canvas = page.locator('#map-canvas');
      const frames = async () => Number(await canvas.getAttribute('data-frames'));
      const before = await frames();
      const after = await page.evaluate(() => {
        document.querySelector<HTMLButtonElement>('#explore')!.click();
        const lead = document.getElementById('lead')!;
        return { animations: document.getAnimations().length, visibility: getComputedStyle(lead).visibility, opacity: getComputedStyle(lead).opacity };
      });
      expect(after.animations).toBe(0);
      expect(after.visibility).toBe('hidden');
      await expect(page.locator('#explorer')).toHaveAttribute('data-state', 'exploring');
      await page.waitForTimeout(150);
      const settled = await frames();
      // A jump to the new fit, not a flight: a frame or two, then nothing moves.
      expect(settled - before).toBeLessThanOrEqual(2);
      await page.waitForTimeout(700);
      expect(await frames()).toBe(settled);
      expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
    });
  });
});
