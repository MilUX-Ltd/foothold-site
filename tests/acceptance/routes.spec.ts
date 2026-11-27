// Acceptance tests 6 to 14 for the job routes on the map, against the fixture
// build (FOOTHOLD_DATA_SOURCE=fixture). Tests 1 to 5 are unit tests in
// tests/unit/graph-routes.test.ts.
import { expect, test, type Locator, type Page } from '@playwright/test';
import fixture from '../fixtures/foothold-map.json' with { type: 'json' };
import { expectNoAxeViolations } from '../support/axe';

const TENDER = 'Skills/Routes/A tender lands';
const tender = fixture.routes.find((r) => r.id === TENDER)!;
const PANEL = 'Jobs the pack already knows how to do';

async function openMap(page: Page, query = '') {
  await page.goto(`/map/${query}`);
  await expect(page.locator('#map-canvas')).toHaveAttribute('data-ready', 'true');
}

const param = (page: Page, key: string) => new URL(page.url()).searchParams.get(key);
const jobsControl = (page: Page) => page.getByRole('button', { name: 'Jobs', exact: true });
const jobsPanel = (page: Page) => page.getByRole('region', { name: PANEL });
const status = (page: Page) => page.getByRole('status');

/** Presses Tab (or Shift+Tab) until the target has focus, or fails after a few presses. */
async function tabTo(page: Page, target: Locator, max = 12, key: 'Tab' | 'Shift+Tab' = 'Tab') {
  for (let i = 0; i < max; i++) {
    if (await target.evaluate((el) => el === document.activeElement)) return;
    await page.keyboard.press(key);
  }
  await expect(target).toBeFocused();
}

/** The panel and the address agree that this step of the tender job is shown. */
async function expectTenderStep(page: Page, n: number) {
  const panel = jobsPanel(page);
  await expect(panel).toContainText(`Step ${n} of ${tender.steps.length}`);
  await expect(panel.locator('.job-step-detail')).toContainText(tender.steps[n - 1].does);
  await expect(panel.locator('.job-steps button[aria-current="step"]')).toHaveText(tender.steps[n - 1].skill);
  await expect(panel.locator('.job-steps button[aria-current="step"]')).toHaveCount(1);
  await expect.poll(() => [param(page, 'route'), param(page, 'step')]).toEqual([TENDER, String(n)]);
}

test.describe('job routes on the map', () => {
  test('6. the "Jobs" control opens a panel listing every route by name', async ({ page }) => {
    await openMap(page);
    const control = jobsControl(page);
    await expect(control).toHaveAttribute('aria-expanded', 'false');
    await expect(jobsPanel(page)).toBeHidden();
    await control.click();
    await expect(control).toHaveAttribute('aria-expanded', 'true');
    const panel = jobsPanel(page);
    await expect(panel).toBeVisible();
    await expect(panel).toContainText('Pick a job to see which skills do it and what they read and write.');
    for (const route of fixture.routes) await expect(panel.getByRole('button', { name: route.name, exact: true })).toBeVisible();
    await expect(panel.locator('.job-list button')).toHaveCount(fixture.routes.length);
  });

  test('7. by mouse: choose a job, step forwards and back, and the panel and address follow', async ({ page }) => {
    await openMap(page);
    await jobsControl(page).click();
    const panel = jobsPanel(page);
    await panel.getByRole('button', { name: tender.name, exact: true }).click();
    await expect(panel.getByRole('heading', { name: tender.name, level: 3 })).toBeVisible();
    await expect(panel.locator('.job-steps button')).toHaveText(tender.steps.map((s) => s.skill));
    await expect.poll(() => [param(page, 'route'), param(page, 'step')]).toEqual([TENDER, null]);
    await expect(page.locator('#map-canvas')).not.toHaveAttribute('data-lit', '');

    await panel.getByRole('button', { name: 'Next step', exact: true }).click();
    await expectTenderStep(page, 1);
    await panel.getByRole('button', { name: 'Next step', exact: true }).click();
    await expectTenderStep(page, 2);
    await panel.getByRole('button', { name: 'Previous step', exact: true }).click();
    await expectTenderStep(page, 1);

    await panel.getByRole('button', { name: 'Show the whole job', exact: true }).click();
    await expect(panel.locator('.job-steps button[aria-current="step"]')).toHaveCount(0);
    await expect.poll(() => [param(page, 'route'), param(page, 'step')]).toEqual([TENDER, null]);
  });

  test('8. by keyboard alone, with the arrow keys, each change announced', async ({ page }) => {
    await openMap(page);
    await jobsControl(page).focus();
    await page.keyboard.press('Enter');
    const panel = jobsPanel(page);
    await expect(panel).toBeVisible();
    // Focus moves into the panel when it opens.
    expect(await panel.evaluate((el) => el.contains(document.activeElement))).toBe(true);

    await tabTo(page, panel.getByRole('button', { name: tender.name, exact: true }));
    await page.keyboard.press('Enter');
    await expect(panel.getByRole('heading', { name: tender.name, level: 3 })).toBeFocused();
    await expect(status(page)).toContainText(tender.name);

    await page.keyboard.press('ArrowRight');
    await expectTenderStep(page, 1);
    await expect(status(page)).toContainText('Step 1 of 3');
    await page.keyboard.press('ArrowRight');
    await expectTenderStep(page, 2);
    await expect(status(page)).toContainText('Step 2 of 3');
    await page.keyboard.press('ArrowLeft');
    await expectTenderStep(page, 1);
    await expect(status(page)).toContainText('Step 1 of 3');

    const next = panel.getByRole('button', { name: 'Next step', exact: true });
    await tabTo(page, next);
    await page.keyboard.press('Enter');
    await expectTenderStep(page, 2);
    await expect(status(page)).toContainText('Step 2 of 3');
    // Focus stays on the button, so it can be pressed again.
    await expect(next).toBeFocused();
    await page.keyboard.press('Enter');
    await expectTenderStep(page, 3);
    await expect(status(page)).toContainText('Step 3 of 3');

    // A step chosen from the list moves focus to that step.
    const first = panel.locator('.job-steps button').first();
    await tabTo(page, first, 20, 'Shift+Tab');
    await page.keyboard.press('Enter');
    await expectTenderStep(page, 1);
    expect(await panel.locator('.job-step-detail').evaluate((el) => el.contains(document.activeElement))).toBe(true);

    await tabTo(page, panel.getByRole('button', { name: 'Close the job', exact: true }), 20);
    await page.keyboard.press('Enter');
    await expect(status(page)).toContainText('closed');
    await expect.poll(() => param(page, 'route')).toBeNull();
  });

  for (const route of fixture.routes) {
    test(`9. "${route.name}" opens and steps to its last step`, async ({ page }) => {
      await openMap(page);
      await jobsControl(page).click();
      const panel = jobsPanel(page);
      await panel.getByRole('button', { name: route.name, exact: true }).click();
      const next = panel.getByRole('button', { name: 'Next step', exact: true });
      for (let n = 1; n <= route.steps.length; n++) {
        await next.click();
        await expect(panel).toContainText(`Step ${n} of ${route.steps.length}`);
        await expect(panel.locator('.job-step-detail')).toContainText(route.steps[n - 1].does);
        await expect.poll(() => param(page, 'step')).toBe(String(n));
      }
      await expect(next).toHaveAttribute('aria-disabled', 'true');
      // Pressing it at the last step does nothing. Playwright will not press an
      // aria-disabled button unless told to.
      await next.click({ force: true });
      await expect.poll(() => param(page, 'step')).toBe(String(route.steps.length));
    });
  }

  test('10. an address with a route and step restores that job and step; an unknown route loads the ordinary map', async ({ page }) => {
    await openMap(page, `?route=${encodeURIComponent(TENDER)}&step=2`);
    await expect(jobsControl(page)).toHaveAttribute('aria-expanded', 'true');
    await expect(jobsPanel(page).getByRole('heading', { name: tender.name, level: 3 })).toBeVisible();
    await expectTenderStep(page, 2);

    await openMap(page, '?route=No%2Fsuch%2Froute&step=1');
    await expect(jobsControl(page)).toHaveAttribute('aria-expanded', 'false');
    await expect(jobsPanel(page)).toBeHidden();
    await expect(page.locator('#map-canvas')).toHaveAttribute('data-lit', '');
    await expect.poll(() => [param(page, 'route'), param(page, 'step')]).toEqual([null, null]);
  });

  test('11. each job on the home page has a "See it on the map" link that opens it', async ({ page }) => {
    await page.goto('/');
    for (const route of fixture.routes) {
      const card = page.locator('article', { has: page.getByRole('heading', { name: route.name, exact: true }) });
      const link = card.getByRole('link', { name: 'See it on the map', exact: true });
      await expect(link).toBeVisible();
      const href = (await link.getAttribute('href')) ?? '';
      expect(new URL(href, 'http://x').searchParams.get('route')).toBe(route.id);
    }
    const card = page.locator('article', { has: page.getByRole('heading', { name: tender.name, exact: true }) });
    await card.getByRole('link', { name: 'See it on the map', exact: true }).click();
    await expect(page.locator('#map-canvas')).toHaveAttribute('data-ready', 'true');
    await expect(jobsPanel(page).getByRole('heading', { name: tender.name, level: 3 })).toBeVisible();
    await expect.poll(() => param(page, 'route')).toBe(TENDER);
  });

  test('12. "Close the job" clears route and step from the address and returns the ordinary map', async ({ page }) => {
    await openMap(page, `?route=${encodeURIComponent(TENDER)}&step=1`);
    await expectTenderStep(page, 1);
    const canvas = page.locator('#map-canvas');
    await expect(canvas).not.toHaveAttribute('data-lit', '');
    await jobsPanel(page).getByRole('button', { name: 'Close the job', exact: true }).click();
    await expect.poll(() => [param(page, 'route'), param(page, 'step')]).toEqual([null, null]);
    await expect(canvas).toHaveAttribute('data-lit', '');
    await expect(jobsPanel(page).getByRole('heading', { name: tender.name, level: 3 })).toHaveCount(0);
  });

  test('12. a path asked for while a job is open closes the job', async ({ page }) => {
    await openMap(page, `?route=${encodeURIComponent(TENDER)}&step=1`);
    await page.getByRole('button', { name: 'Find a path', exact: true }).click();
    await page.getByLabel('From').selectOption('Operations');
    await page.getByLabel('To', { exact: true }).selectOption(TENDER);
    await page.getByRole('button', { name: 'Find the path' }).click();
    await expect.poll(() => [param(page, 'route'), param(page, 'step')]).toEqual([null, null]);
    await expect(page.locator('#map-canvas')).toHaveAttribute('data-lit', '');
  });

  test('13. no automated accessibility violations with a job open and with a step open', async ({ page }) => {
    await openMap(page, `?route=${encodeURIComponent(TENDER)}`);
    await expect(jobsPanel(page).getByRole('heading', { name: tender.name, level: 3 })).toBeVisible();
    await expectNoAxeViolations(page);
    await openMap(page, `?route=${encodeURIComponent(TENDER)}&step=1`);
    await expectTenderStep(page, 1);
    await expectNoAxeViolations(page);
  });

  test('13. no automated accessibility violations at 375 pixels wide, with no sideways scroll', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await openMap(page, `?route=${encodeURIComponent(TENDER)}`);
    await expect(jobsPanel(page).getByRole('heading', { name: tender.name, level: 3 })).toBeVisible();
    await expectNoAxeViolations(page);
    await openMap(page, `?route=${encodeURIComponent(TENDER)}&step=1`);
    await expectTenderStep(page, 1);
    await expectNoAxeViolations(page);
    const { scrollWidth, clientWidth } = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });

  test('every control in the panel is at least 24 by 24 pixels', async ({ page }) => {
    await openMap(page, `?route=${encodeURIComponent(TENDER)}&step=1`);
    await expectTenderStep(page, 1);
    const sizes = await jobsPanel(page).locator('button').evaluateAll((els) =>
      els.filter((el) => (el as HTMLElement).offsetParent !== null).map((el) => {
        const r = el.getBoundingClientRect();
        return { name: el.textContent?.trim() || el.getAttribute('aria-label'), width: r.width, height: r.height };
      }),
    );
    expect(sizes.length).toBeGreaterThan(4);
    for (const s of sizes) {
      expect(s.width, String(s.name)).toBeGreaterThanOrEqual(24);
      expect(s.height, String(s.name)).toBeGreaterThanOrEqual(24);
    }
  });

  test.describe('with reduced motion requested', () => {
    test.use({ reducedMotion: 'reduce' });
    test('14. moving between steps does not animate', async ({ page }) => {
      await openMap(page, `?route=${encodeURIComponent(TENDER)}`);
      await expect(jobsPanel(page).getByRole('heading', { name: tender.name, level: 3 })).toBeVisible();
      const canvas = page.locator('#map-canvas');
      await expect(canvas).toHaveAttribute('data-motion', 'reduced');
      await page.waitForTimeout(300);
      const frames = async () => Number(await canvas.getAttribute('data-frames'));
      for (const button of ['Next step', 'Next step', 'Previous step']) {
        const before = await frames();
        await jobsPanel(page).getByRole('button', { name: button, exact: true }).click();
        await page.waitForTimeout(150);
        const after = await frames();
        // A jump to the fitted view, not a flight: a frame or two, then nothing moves.
        expect(after - before).toBeLessThanOrEqual(2);
        await page.waitForTimeout(500);
        expect(await frames()).toBe(after);
        expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
      }
    });
  });
});
