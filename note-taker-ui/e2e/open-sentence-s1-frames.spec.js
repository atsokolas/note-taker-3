const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const framesDir = path.resolve(__dirname, '../../docs/open-sentence-s1-frames');
const artifactsDir = '/opt/cursor/artifacts/open-sentence-s1';

const saveStage = async (page, name) => {
  const stage = page.locator('.open-sentence-storyboard__stage');
  await expect(stage).toBeVisible();
  fs.mkdirSync(framesDir, { recursive: true });
  fs.mkdirSync(artifactsDir, { recursive: true });
  const file = `${name}.png`;
  await stage.screenshot({ path: path.join(framesDir, file) });
  await stage.screenshot({ path: path.join(artifactsDir, file) });
};

test.describe('Open a sentence S1 frames', () => {
  test('saves the Parenting journey at desktop, sidebar, and mobile', async ({ page }) => {
    await page.goto('/design-preview/open-sentence');
    await expect(page.getByRole('heading', { name: 'Parenting' })).toBeVisible();
    await saveStage(page, '1440-read');

    await page.getByRole('button', { name: 'Open', exact: true }).click();
    await expect(page.getByText(/The article still reads/)).toBeVisible();
    await expect(page.getByText('Illustrated source · not live retrieval')).toBeVisible();
    await saveStage(page, '1440-open');

    await page.getByRole('button', { name: 'Wording' }).click();
    await expect(page.getByLabel('Try a narrower wording')).toHaveValue(
      'Children need room to make recoverable mistakes.'
    );
    await saveStage(page, '1440-wording');

    await page.getByRole('button', { name: 'Leave open' }).click();
    await expect(page.getByLabel('Leave this open')).toBeVisible();
    await saveStage(page, '1440-leave-open');

    await page.getByRole('button', { name: 'Sidebar 1320' }).click();
    await expect(page.locator('.open-sentence-storyboard__stage')).toHaveAttribute('data-width', '1320');
    await saveStage(page, '1320-leave-open');

    await page.getByRole('button', { name: 'Mobile 430' }).click();
    await expect(page.locator('.open-sentence-storyboard__stage')).toHaveAttribute('data-width', '430');
    await expect(page.getByRole('button', { name: 'Companion' })).toBeVisible();
    await saveStage(page, '430-leave-open');

    await page.getByRole('button', { name: 'Desktop 1440' }).click();
    await page.getByRole('button', { name: /Source condition/ }).click();
    await expect(page.getByText('Nothing beside this sentence yet.')).toBeVisible();
    await saveStage(page, '1440-silence');
  });
});
