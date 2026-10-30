const { defineConfig } = require('@playwright/test');

// CSS fixtures need a browser, but no API, account, or saved notes.
module.exports = defineConfig({
  testDir: './e2e',
  testMatch: 'prose-list-spacing.spec.js',
  outputDir: '../tmp/prose-playwright',
  workers: 2,
  reporter: 'list',
  use: { browserName: 'chromium' }
});
