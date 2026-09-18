const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './e2e',
  testMatch: 'settings-redesign-shot.spec.js',
  use: {
    baseURL: 'http://127.0.0.1:3000'
  }
});
