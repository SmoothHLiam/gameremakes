import { expect, test } from '@playwright/test';

test('page boots and shows the game canvas', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/');
  await expect(page.locator('#game')).toBeVisible();
  await page.waitForTimeout(500);
  expect(errors).toEqual([]);
});
