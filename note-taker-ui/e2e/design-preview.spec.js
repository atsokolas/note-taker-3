const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const screens = [
  { id: 'home', tab: 'Think home', name: '01-think-home-full.png' },
  { id: 'notebook', tab: 'Notebook', name: '02-notebook-full.png' },
  { id: 'concept', tab: 'Concept', name: '03-concept-full.png' },
  { id: 'library', tab: 'Library', name: '04-library-full.png' },
  { id: 'handoffs', tab: 'Handoffs', name: '05-handoffs-full.png' }
];

test('renders full redesign preview screens', async ({ page }) => {
  const outputDir = path.resolve(__dirname, '../../output/ui-redesign-v2');
  fs.mkdirSync(outputDir, { recursive: true });

  await page.goto('/design-preview');
  await expect(page.locator('.design-preview-shell')).toBeVisible();

  const iframe = page.frameLocator('.design-preview-shell__iframe');

  for (const screen of screens) {
    await page.getByRole('button', { name: screen.tab }).click();
    const locator = iframe.locator(`.screen.is-active[data-screen="${screen.id}"]`);
    await expect(locator).toBeVisible();
    await locator.screenshot({
      path: path.join(outputDir, screen.name)
    });
  }
});
