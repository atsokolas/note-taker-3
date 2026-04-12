const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const shots = [
  { name: '01-think-home-full.png', selector: '.dp-shot--home' },
  { name: '02-notebook-full.png', selector: '.dp-shot--notebook' },
  { name: '03-concept-full.png', selector: '.dp-shot--concept' },
  { name: '04-library-full.png', selector: '.dp-shot--library' },
  { name: '05-handoffs-full.png', selector: '.dp-shot--handoffs' }
];

test('renders full redesign preview screens', async ({ page }) => {
  const outputDir = path.resolve(__dirname, '../../output/ui-redesign-v2');
  fs.mkdirSync(outputDir, { recursive: true });

  await page.goto('/design-preview');
  await expect(page.locator('.dp-page')).toBeVisible();

  for (const shot of shots) {
    const locator = page.locator(shot.selector);
    await locator.scrollIntoViewIfNeeded();
    await expect(locator).toBeVisible();
    await locator.screenshot({
      path: path.join(outputDir, shot.name)
    });
  }
});
