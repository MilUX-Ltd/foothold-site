// The home page, built from tests/fixtures/foothold-map.json (fixture mode).
import { expect, test } from '@playwright/test';
import { expectNoAxeViolations } from '../support/axe';

test('has exactly one h1 and the proposition', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('A ready-to-go structure for your defence business, with AI built in');
  await expect(page.locator('.lede')).toContainText('free pack of notes and AI skills for founders of small UK defence businesses');
});

test('has the landmarks, a skip link and the mark', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('banner')).toBeVisible();
  await expect(page.getByRole('main')).toBeVisible();
  await expect(page.getByRole('contentinfo')).toBeVisible();
  const skip = page.getByRole('link', { name: 'Skip to content' });
  await page.keyboard.press('Tab');
  await expect(skip).toBeFocused();
  await expect(page.getByRole('banner').getByRole('link', { name: 'Foothold, home' })).toBeVisible();
});

test('the fact strip is drawn from the data', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('dl.facts')).toContainText('Pages on the defence map');
  const value = (label: string) => page.locator('dl.facts div', { hasText: label }).locator('dd');
  await expect(value('Pages on the defence map')).toHaveText('7');
  await expect(value('Skills')).toHaveText('3');
  await expect(value('Folders')).toHaveText('3');
  await expect(value('Routes')).toHaveText('2');
  await expect(value('Pack version')).toHaveText('0.0.0');
});

test('shows the fixture routes with their ordered steps', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 3 })).toHaveText(['A customer asks about your data handling', 'A tender lands']);
  const tender = page.locator('article', { has: page.getByRole('heading', { name: 'A tender lands' }) });
  await expect(tender.locator('.route-skill')).toHaveText(['bid-response', 'cyber-essentials-ready', 'build-dpia']);
  await expect(tender.locator('.route-does').first()).toContainText('Drafts a response to the tender');
  const data = page.locator('article', { has: page.getByRole('heading', { name: 'A customer asks about your data handling' }) });
  await expect(data.locator('.route-does').first()).toContainText('data protection impact assessment');
});

test('says this is an early build and links to the pack', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('This is an early build.')).toBeVisible();
  const footer = page.getByRole('contentinfo');
  await expect(footer).toContainText('This was built with AI.');
  await expect(footer.getByRole('link', { name: 'Foothold pack on GitHub' })).toHaveAttribute('href', 'https://github.com/MilUX-Ltd/foothold');
});

test('has no accessibility violations at WCAG 2.2 AA', async ({ page }) => {
  await page.goto('/');
  await expectNoAxeViolations(page);
});

test('loads no script and breaks no content security rule', async ({ page }) => {
  const scripts: string[] = [];
  const problems: string[] = [];
  page.on('request', (request) => {
    if (request.resourceType() === 'script') scripts.push(request.url());
  });
  page.on('console', (message) => {
    if (['error', 'warning'].includes(message.type())) problems.push(message.text());
  });
  page.on('pageerror', (error) => problems.push(error.message));
  const response = await page.goto('/');
  await page.waitForLoadState('networkidle');
  expect(scripts).toEqual([]);
  expect(problems).toEqual([]);
  expect(await page.locator('script').count()).toBe(0);
  const csp = response?.headers()['content-security-policy'] ?? '';
  expect(csp).toContain("script-src 'none'");
});

test('makes requests to this site only', async ({ page, baseURL }) => {
  const outside: string[] = [];
  page.on('request', (request) => {
    if (!request.url().startsWith(baseURL ?? '')) outside.push(request.url());
  });
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  expect(outside).toEqual([]);
});

test('works at 375px wide with no sideways scroll', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expectNoAxeViolations(page);
});

