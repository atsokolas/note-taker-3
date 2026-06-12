const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const screens = [
  { id: 'home', tab: 'Think home', name: 'home.png' },
  { id: 'notebook', tab: 'Notebook', name: 'notebook.png' },
  { id: 'concept', tab: 'Concept', name: 'concept.png' },
  { id: 'library', tab: 'Library', name: 'library.png' },
  { id: 'handoffs', tab: 'Handoffs', name: 'handoffs.png' }
];

const shouldExportScreens = process.env.DESIGN_PREVIEW_EXPORT === '1';
const outputDir = path.resolve(__dirname, '../../output/ui-redesign-v3');

test('renders full redesign preview screens', async ({ page }) => {
  await page.goto('/design-preview');
  await expect(page.locator('.design-preview-shell')).toBeVisible();

  const iframe = page.frameLocator('.design-preview-shell__iframe');

  if (shouldExportScreens) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  for (const screen of screens) {
    await page.getByRole('button', { name: screen.tab }).click();
    const locator = iframe.locator(`.screen.is-active[data-screen="${screen.id}"]`);
    await expect(locator).toBeVisible();
    if (shouldExportScreens) {
      await locator.screenshot({
        path: path.join(outputDir, screen.name)
      });
    }
  }
});
