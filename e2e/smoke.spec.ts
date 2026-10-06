import { expect, type Page, test } from '@playwright/test';

/** Collects uncaught page errors so every test can assert there were none. */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  return errors;
}

async function start(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await page.getByTestId('splash').click();
}

test('completes the cube test level from its recorded replay', async ({ page }) => {
  const errors = watchErrors(page);
  await start(page, '/?level=test-cube&replay');
  await expect(page.getByTestId('hud')).toBeVisible();
  await expect(page.getByTestId('level-complete')).toBeVisible({ timeout: 60_000 });
  const result = await page.evaluate(() => {
    const s = (window as any).__app.current.session;
    return { phase: s.phase, attempts: s.attempts, percent: s.percent };
  });
  expect(result).toEqual({ phase: 'complete', attempts: 1, percent: 100 });
  await expect(page.getByTestId('level-complete')).toContainText('Level Complete!');
  expect(errors).toEqual([]);
});

test('menu: level select, icon kit and settings persist', async ({ page }) => {
  const errors = watchErrors(page);
  await start(page, '/');
  await expect(page.getByTestId('menu')).toBeVisible();
  expect(await page.evaluate(() => (window as any).__audio.playingId)).toBe('menu');

  // level select carousel: 8 shipped levels, keyboard navigation
  await page.getByTestId('play').click({ force: true });
  await expect(page.locator('.level-card')).toHaveCount(8);
  await expect(page.locator('.level-card.active .card-name')).toHaveText('Neon Footsteps');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.level-card.active .card-name')).toHaveText('Pocket Orbit');
  await page.keyboard.press('Escape');

  // icon kit: pick a cube design and a primary color
  await page.locator('.menu-side .btn').first().click();
  await page.locator('.kit-icon').nth(2).click();
  await page.locator('.kit-swatches').first().locator('.swatch').nth(4).click();
  const icons = await page.evaluate(() => JSON.parse(localStorage.getItem('superdash.icons') ?? 'null'));
  expect(icons.designs.cube).toBe(2);
  expect(icons.p1).toBe('#ff7a3d');
  await page.keyboard.press('Escape');

  // settings: toggle the FPS counter and check it survives a reload
  await page.locator('.menu-top-right .btn').nth(1).click();
  await expect(page.getByTestId('settings')).toBeVisible();
  await page.locator('label', { hasText: 'Show FPS' }).click();
  await page.getByText('Done').click();
  await page.reload();
  const settings = await page.evaluate(() => JSON.parse(localStorage.getItem('superdash.settings') ?? 'null'));
  expect(settings.showFps).toBe(true);
  expect(errors).toEqual([]);
});

test('death records progress and restarts without a menu', async ({ page }) => {
  const errors = watchErrors(page);
  await start(page, '/?level=test-cube');
  await expect(page.getByTestId('hud')).toBeVisible();
  // never jump: the first spike ends attempt 1 and attempt 2 starts on its own
  await expect.poll(() => page.evaluate(() => (window as any).__app.current.session.attempts), { timeout: 20_000 }).toBeGreaterThanOrEqual(2);
  const progress = await page.evaluate(() => JSON.parse(localStorage.getItem('superdash.progress') ?? '{}'));
  expect(progress['test-cube'].normal).toBeGreaterThan(0);
  await expect(page.getByTestId('pause-menu')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('practice mode places and removes checkpoints', async ({ page }) => {
  const errors = watchErrors(page);
  await start(page, '/?level=test-cube&practice');
  await expect(page.locator('.practice-bar')).toBeVisible();
  await page.waitForTimeout(800);
  const count = () => page.evaluate(() => (window as any).__app.current.session.checkpointCount);
  const before = await count();
  await page.keyboard.press('KeyZ');
  await expect.poll(count).toBe(before + 1);
  await page.keyboard.press('KeyX');
  await expect.poll(count).toBe(before);
  expect(errors).toEqual([]);
});

test('editor: build, save, playtest and come back', async ({ page }) => {
  const errors = watchErrors(page);
  await start(page, '/?editor');
  await expect(page.getByTestId('editor')).toBeVisible();
  await page.keyboard.press('Digit1');
  await page.mouse.click(700, 400);
  const objects = await page.evaluate(() => (window as any).__app.current.model.objs.length);
  expect(objects).toBeGreaterThan(0);
  await page.keyboard.press('Control+KeyS');
  await expect.poll(() => page.evaluate(() => (JSON.parse(localStorage.getItem('superdash.customLevels') ?? '[]') as unknown[]).length)).toBe(1);
  await page.locator('.ed-top .btn', { hasText: 'Start' }).click();
  await expect(page.getByTestId('hud')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('editor')).toBeVisible();
  expect(errors).toEqual([]);
});
