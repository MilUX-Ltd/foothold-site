import { expect, test } from '@playwright/test';
import { expectNoAxeViolations } from '../support/axe';

test('an address that does not exist shows the 404 page', async ({ page }) => {
  const response = await page.goto('/no-such-page/');
  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Page not found');
  await expect(page.getByRole('link', { name: 'Back to the Foothold home page' })).toHaveAttribute('href', '/');
  await expectNoAxeViolations(page);
});

test('the 404 page has no script', async ({ page }) => {
  await page.goto('/no-such-page/');
  expect(await page.locator('script').count()).toBe(0);
});
