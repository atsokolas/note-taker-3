const { defineConfig } = require('@playwright/test');

// Read-only smoke against an already running frontend (local, preview or production).
module.exports = defineConfig({
  testDir: './e2e',
  testMatch: 'shared-wiki-collections.smoke.spec.js',
  timeout: 180000,
  outputDir: '../tmp/shared-wiki-smoke',
  workers: 2,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3016',
    storageState: { cookies: [], origins: [] },
    trace: 'retain-on-failure'
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
    { name: 'phone', use: { viewport: { width: 430, height: 900 } } }
  ]
});
