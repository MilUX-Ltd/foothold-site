// Acceptance tests 3 to 13 for the install page. Tests 1 and 2 are unit tests
// in tests/unit/release.test.ts.
//
// The page has two states, so it is tested against two fixture builds:
// - the committed state, "no release yet" (data/release.json), on the usual
//   server (FOOTHOLD_DATA_SOURCE=fixture);
// - a release, from tests/fixtures/release.json, on the second server the
//   Playwright config starts (FOOTHOLD_RELEASE_SOURCE=fixture).
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import release from '../fixtures/release.json' with { type: 'json' };
import { expectNoAxeViolations } from '../support/axe';

const RELEASE_SERVER = 'http://127.0.0.1:4342';
const PROMPT = `Download ${release.zip}. Check that its SHA-256 checksum is ${release.sha256}. If it is not, stop and tell me. If it is, unzip it and read Start Here.md inside.`;
const NOT_YET = 'The first release is on its way. Until then you can look around the map.';
const COMMITTED_CSP = readFileSync(new URL('../../public/_headers', import.meta.url), 'utf8')
  .split('\n')
  .find((l) => l.trim().startsWith('Content-Security-Policy:'))!
  .trim()
  .slice('Content-Security-Policy:'.length)
  .trim();

const main = (page: Page) => page.getByRole('main');
const downloadButton = (page: Page) => main(page).getByRole('link', { name: `Download Foothold ${release.version}`, exact: true });
const copyButton = (page: Page) => main(page).getByRole('button', { name: 'Copy the prompt', exact: true });
const prompt = (page: Page) => page.locator('#install-prompt');
const siteNav = (page: Page) => page.getByRole('navigation', { name: 'Site' });

/** Every address a link on the page points at, and the prompt's text, for the branch check. */
async function addresses(page: Page): Promise<string[]> {
  const hrefs = await page.locator('a[href]').evaluateAll((links) => links.map((a) => (a as HTMLAnchorElement).href));
  const promptText = (await prompt(page).count()) ? [(await prompt(page).textContent()) ?? ''] : [];
  return [...hrefs, ...promptText];
}

/** True if a text names a branch, a commit tree or raw file of the pack rather than a tagged release. */
function pointsAtBranch(text: string): boolean {
  return /github\.com\/MilUX-Ltd\/foothold\/(tree|blob|raw|archive|commits?|compare)\b/i.test(text) || /raw\.githubusercontent\.com\/MilUX-Ltd\/foothold\//i.test(text) || /codeload\.github\.com/i.test(text);
}

async function noSidewaysScroll(page: Page) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
}

/** Loads a page while recording every script request, console problem and policy violation. */
async function loadWatched(page: Page, path: string, origin: string) {
  const scripts: string[] = [];
  const outside: string[] = [];
  const problems: string[] = [];
  page.on('request', (request) => {
    if (request.resourceType() === 'script') scripts.push(request.url());
    if (!request.url().startsWith(origin)) outside.push(request.url());
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
  const response = await page.goto(path);
  await page.waitForLoadState('networkidle');
  const violations = await page.evaluate(() => (window as unknown as { violations?: string[] }).violations ?? []);
  return { response, scripts, outside, problems, violations, origin };
}

test.describe('the install page, with a release (fixture)', () => {
  test.use({ baseURL: RELEASE_SERVER });

  test('3. has one level-one heading, both routes, and no form or input other than the copy button', async ({ page }) => {
    await page.goto('/install/');
    await expect(page).toHaveTitle('Foothold: install');
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Make it yours.');
    await expect(main(page).getByRole('heading', { name: 'Download the zip', exact: true })).toBeVisible();
    await expect(main(page).getByRole('heading', { name: 'Or ask your AI tool to fetch it', exact: true })).toBeVisible();
    await expect(page.locator('form')).toHaveCount(0);
    await expect(page.locator('input, textarea, select, [contenteditable]')).toHaveCount(0);
    await expect(page.getByRole('button')).toHaveCount(1);
    await expect(copyButton(page)).toBeVisible();
  });

  test('4. the download button points at the zip in the release file, and the version and checksum shown are the file\'s', async ({ page }) => {
    await page.goto('/install/');
    await expect(downloadButton(page)).toHaveAttribute('href', release.zip);
    await expect(page.locator('#install-zip-note')).toHaveText(`1.8 MB · SHA-256 ${release.sha256}`);
  });

  test('5. the prompt holds the same address and checksum', async ({ page }) => {
    await page.goto('/install/');
    await expect(prompt(page)).toHaveText(PROMPT);
    await expect(prompt(page)).toContainText(release.zip);
    await expect(prompt(page)).toContainText(release.sha256);
  });

  test('6. by keyboard alone, the copy button puts the prompt on the clipboard, says "Copied" and announces it', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: RELEASE_SERVER });
    await page.goto('/install/');
    await expect(copyButton(page)).toBeVisible();
    let reached = false;
    for (let i = 0; i < 30 && !reached; i++) {
      await page.keyboard.press('Tab');
      reached = await page.evaluate(() => document.activeElement?.id === 'install-copy');
    }
    expect(reached, 'the copy button is reached by Tab').toBe(true);
    await page.keyboard.press('Enter');
    const button = page.locator('#install-copy');
    await expect(button).toHaveText('Copied');
    await expect(page.getByRole('status')).toHaveText('Copied');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(PROMPT);
    await expect(button).toBeFocused();
  });

  test.describe('with script off', () => {
    test.use({ javaScriptEnabled: false });
    test('7. the prompt is still on the page as text and the copy button is not offered', async ({ page }) => {
      await page.goto('/install/');
      await expect(prompt(page)).toBeVisible();
      await expect(prompt(page)).toHaveText(PROMPT);
      await expect(page.getByRole('button', { name: 'Copy the prompt' })).toHaveCount(0);
      await expect(page.locator('#install-copy')).toBeHidden();
    });
  });

  test('8. no link on the page, and nothing in the prompt, points at a branch of the pack repository', async ({ page }) => {
    await page.goto('/install/');
    await expect(downloadButton(page)).toHaveAttribute('href', /\/releases\/download\/v\d+\.\d+\.\d+\//);
    const found = await addresses(page);
    expect(found.length).toBeGreaterThan(0);
    expect(found.filter(pointsAtBranch)).toEqual([]);
    // The routes name the tagged release.
    expect(release.zip).toMatch(/\/releases\/download\/v\d+\.\d+\.\d+\//);
    // The check itself would catch a branch address.
    expect(pointsAtBranch('https://github.com/MilUX-Ltd/foothold/archive/refs/heads/main.zip')).toBe(true);
    expect(pointsAtBranch('https://raw.githubusercontent.com/MilUX-Ltd/foothold/main/README.md')).toBe(true);
  });

  test('10. the top bar shows "Install" on every page and marks it current here; the home page\'s second button leads here', async ({ page }) => {
    for (const path of ['/', '/map/', '/install/', '/no-such-page/']) {
      await page.goto(path);
      const link = siteNav(page).getByRole('link', { name: 'Install', exact: true });
      await expect(link, path).toHaveAttribute('href', '/install/');
      if (path === '/install/') await expect(link).toHaveAttribute('aria-current', 'page');
      else await expect(link, path).not.toHaveAttribute('aria-current', 'page');
    }
    await page.goto('/');
    const lead = page.locator('#lead');
    await expect(lead.getByRole('link', { name: 'Get Foothold', exact: true })).toHaveAttribute('href', '/install/');
    await expect(lead.getByRole('link', { name: 'Get the pack on GitHub' })).toHaveCount(0);
    await lead.getByRole('link', { name: 'Get Foothold', exact: true }).click();
    await expect(page).toHaveURL(/\/install\/$/);
    // The footer keeps its GitHub link.
    await expect(page.getByRole('contentinfo').getByRole('link', { name: 'Foothold pack on GitHub' })).toHaveAttribute('href', 'https://github.com/MilUX-Ltd/foothold');
  });

  test('11. no sideways scroll at 375 pixels wide', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/install/');
    await noSidewaysScroll(page);
    await expect(downloadButton(page)).toBeVisible();
    await expect(prompt(page)).toBeVisible();
  });

  test('12. no automated accessibility violations, at desktop and phone width and with the prompt copied', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: RELEASE_SERVER });
    await page.goto('/install/');
    await expectNoAxeViolations(page);
    await copyButton(page).click();
    await expect(page.getByRole('status')).toHaveText('Copied');
    await expectNoAxeViolations(page);
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/install/');
    await expectNoAxeViolations(page);
  });

  test('13. the page loads no script from anywhere but the site, and the content security policy is unchanged', async ({ page }) => {
    const watched = await loadWatched(page, '/install/', RELEASE_SERVER);
    expect(watched.scripts.length).toBeGreaterThan(0);
    for (const url of watched.scripts) expect(url.startsWith(`${watched.origin}/_astro/`), url).toBe(true);
    expect(await page.locator('script:not([src])').count()).toBe(0);
    expect(watched.problems).toEqual([]);
    expect(watched.violations).toEqual([]);
    expect(watched.outside).toEqual([]);
    expect(watched.response?.headers()['content-security-policy']).toBe(COMMITTED_CSP);
    expect(COMMITTED_CSP).toContain("script-src 'self'");
  });
});

test.describe('the install page, with no release yet (committed state)', () => {
  test('9. neither button nor prompt is shown, and the page says so', async ({ page }) => {
    await page.goto('/install/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Make it yours.');
    await expect(main(page)).toContainText(NOT_YET);
    await expect(main(page).getByRole('link', { name: 'look around the map' })).toHaveAttribute('href', '/map/');
    await expect(main(page).getByRole('link', { name: /^Download Foothold/ })).toHaveCount(0);
    await expect(prompt(page)).toHaveCount(0);
    await expect(page.getByRole('button')).toHaveCount(0);
    await expect(main(page)).not.toContainText('SHA-256');
    await expect(page.locator('a[href*="/releases/download/"]')).toHaveCount(0);
    await expect(page.locator('form, input, textarea, select')).toHaveCount(0);
    expect((await addresses(page)).filter(pointsAtBranch)).toEqual([]);
  });

  test('10. the top bar does not show "Install", and the home page\'s second button is unchanged', async ({ page }) => {
    for (const path of ['/', '/map/', '/install/', '/no-such-page/']) {
      await page.goto(path);
      await expect(siteNav(page).getByRole('link', { name: 'Install' }), path).toHaveCount(0);
      await expect(siteNav(page).getByRole('link', { name: 'Map', exact: true }), path).toHaveAttribute('href', '/map/');
    }
    await page.goto('/');
    await expect(page.locator('#lead').getByRole('link', { name: 'Get the pack on GitHub' })).toHaveAttribute('href', 'https://github.com/MilUX-Ltd/foothold');
    await expect(page.getByRole('link', { name: 'Get Foothold', exact: true })).toHaveCount(0);
  });

  test('11. no sideways scroll at 375 pixels wide', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/install/');
    await expect(main(page)).toContainText(NOT_YET);
    await noSidewaysScroll(page);
  });

  test('12. no automated accessibility violations, at desktop and phone width', async ({ page }) => {
    await page.goto('/install/');
    await expect(main(page)).toContainText(NOT_YET);
    await expectNoAxeViolations(page);
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/install/');
    await expectNoAxeViolations(page);
  });

  test('13. the page makes no request outside the site and the content security policy is unchanged', async ({ page, baseURL }) => {
    const watched = await loadWatched(page, '/install/', baseURL!);
    for (const url of watched.scripts) expect(url.startsWith(`${watched.origin}/_astro/`), url).toBe(true);
    expect(await page.locator('script:not([src])').count()).toBe(0);
    expect(watched.problems).toEqual([]);
    expect(watched.violations).toEqual([]);
    expect(watched.outside).toEqual([]);
    expect(watched.response?.headers()['content-security-policy']).toBe(COMMITTED_CSP);
  });
});
