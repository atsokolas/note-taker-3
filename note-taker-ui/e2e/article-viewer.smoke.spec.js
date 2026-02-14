const { test, expect } = require('@playwright/test');

const articleFixture = {
  _id: 'article-1',
  title: 'Sacred reading test article',
  url: 'https://example.com/story',
  folder: null,
  highlights: [],
  pdfs: [],
  content: `
    <p>This is a smoke test for the sacred reading surface layout.</p>
    <img src="https://picsum.photos/2800/1600" width="2800" height="1600" alt="Large illustration" />
    <p>Embedded media should remain contained inside the reading surface.</p>
    <iframe src="https://example.com/embed" width="1600" height="900" title="Demo embed"></iframe>
  `
};

test('article reading layout is bounded and expands after context collapse', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('token', 'test-token');
    window.localStorage.removeItem('ui.rightPanelCollapsed');
    window.localStorage.setItem('hasSeenLanding', 'true');
  });

  await page.route('**/articles/article-1', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(articleFixture)
    });
  });

  await page.route('**/folders', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([])
    });
  });

  await page.goto('/articles/article-1');

  const readingSurface = page.getByTestId('article-reading-surface');
  await expect(readingSurface).toBeVisible();

  const surfaceBox = await readingSurface.boundingBox();
  expect(surfaceBox).toBeTruthy();
  expect(surfaceBox.width).toBeLessThanOrEqual(820);

  const imageBox = await page.locator('[data-testid="article-content-body"] img').first().boundingBox();
  expect(imageBox).toBeTruthy();
  expect(imageBox.x).toBeGreaterThanOrEqual(surfaceBox.x - 1);
  expect(imageBox.x + imageBox.width).toBeLessThanOrEqual(surfaceBox.x + surfaceBox.width + 1);

  const mainRegion = page.getByTestId('reading-main-region');
  const before = await mainRegion.boundingBox();
  expect(before).toBeTruthy();

  await page.getByTestId('reading-layout-toggle').click();

  const after = await mainRegion.boundingBox();
  expect(after).toBeTruthy();
  expect(after.width).toBeGreaterThan(before.width);
});
