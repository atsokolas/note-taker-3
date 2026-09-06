const path = require('path');
const { defineConfig } = require('@playwright/test');

const frontendUrl = 'http://127.0.0.1:3000';

module.exports = defineConfig({
  testDir: './e2e',
  testMatch: 'open-sentence-s1-frames.spec.js',
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: frontendUrl,
    viewport: { width: 1600, height: 1100 },
    trace: 'off',
    screenshot: 'off'
  },
  webServer: {
    command: 'PORT=3000 BROWSER=none npm start',
    cwd: __dirname,
    url: frontendUrl,
    reuseExistingServer: true,
    timeout: 180000
  }
});
