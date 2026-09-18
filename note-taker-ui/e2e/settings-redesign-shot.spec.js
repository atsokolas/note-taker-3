const { test } = require('@playwright/test');
const jwt = require('jsonwebtoken');
const path = require('path');

const outDir = '/cursor/stores/bc-11d5713c-06e7-4c29-b501-20f9dce73015/media/settings-redesign';
const token = jwt.sign({ id: '507f1f77bcf86cd799439011' }, 'dev', { expiresIn: '2d' });

test('settings redesign screenshots', async ({ page }) => {
  test.setTimeout(120000);
  await page.addInitScript((value) => {
    localStorage.setItem('token', value);
    localStorage.setItem('authToken', value);
    localStorage.setItem('jwt', value);
  }, token);

  await page.route('**/api/**', async (route) => {
    const url = route.request().url();
    if (url.includes('/api/ui-settings')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          typographyScale: 'default',
          density: 'comfortable',
          theme: 'auto',
          accent: 'electric',
          brandEnergy: true,
          motion: 'system'
        })
      });
    }
    if (url.includes('/api/morning-paper/settings')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          settings: {
            enabled: false,
            email: 'reader@example.com',
            emailConfirmed: true,
            timezone: 'America/Chicago',
            sendHourLocal: 7,
            configuration: { ready: false, missing: ['RESEND_API_KEY'] }
          }
        })
      });
    }
    if (url.includes('/api/wiki/schema')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ content: '# Wiki instructions\n\nSample', snapshots: [] })
      });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`http://localhost:3000/settings?devToken=${encodeURIComponent(token)}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.settings-redesign__title');
  await page.screenshot({ path: path.join(outDir, 'appearance-desktop.png'), fullPage: true });

  await page.locator('input[name="typographyScale"][value="large"]').click({ force: true });
  await page.screenshot({ path: path.join(outDir, 'appearance-draft.png'), fullPage: true });

  await page.getByRole('button', { name: 'Delivery' }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(outDir, 'delivery-desktop.png'), fullPage: true });

  await page.getByRole('button', { name: 'Your data' }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(outDir, 'export-desktop.png'), fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Appearance' }).click();
  await page.screenshot({ path: path.join(outDir, 'appearance-mobile.png'), fullPage: true });
});
