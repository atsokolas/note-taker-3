const path = require('path');
const { defineConfig } = require('@playwright/test');

const frontendUrl = process.env.PLAYWRIGHT_BASE_URL || process.env.PLAYWRIGHT_FRONTEND_URL || 'http://127.0.0.1:3000';
const apiUrl = process.env.PLAYWRIGHT_API_BASE_URL || 'http://127.0.0.1:5500';
const frontendPort = new URL(frontendUrl).port || '3000';

module.exports = defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['html', { open: 'never' }], ['list']] : [['list']],
  use: {
    baseURL: frontendUrl,
    viewport: { width: 1728, height: 1117 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  expect: {
    toHaveScreenshot: {
      animations: 'disabled',
      maxDiffPixelRatio: 0.02
    }
  },
  webServer: [
    {
      command: 'npm start',
      cwd: path.resolve(__dirname, '..'),
      url: `${apiUrl}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 180000
    },
    {
      command: `PORT=${frontendPort} npm start`,
      cwd: __dirname,
      url: frontendUrl,
      reuseExistingServer: !process.env.CI,
      timeout: 180000
    }
  ]
});
