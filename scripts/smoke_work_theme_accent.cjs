// Browser-level CSS contract: run after building the UI. No account or network is used.
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const { chromium } = require('../note-taker-ui/node_modules/playwright');
const ui = path.resolve(__dirname, '../note-taker-ui');
const catalog = fs.readFileSync(path.join(ui, 'src/settings/themeCatalog.js'), 'utf8');
const themes = [...catalog.matchAll(/theme\('([^']+)', '[^']+', '([^']+)', '([^']+)'/g)].map(([, id, scheme, family]) => ({ id, scheme, family }));
const build = path.join(ui, 'build');
const manifest = JSON.parse(fs.readFileSync(path.join(build, 'asset-manifest.json'), 'utf8'));
const css = [...new Set(Object.values(manifest.files).filter(file => file.endsWith('.css')))];
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent('<body class="noeis-editorial"><main class="work-notes"><section class="work-weekly"><button class="work-weekly-add-trigger">Add priority</button><button class="work-priority-toggle"><span class="work-weekly-number">01</span></button></section></main></body>');
    for (const file of css) await page.addStyleTag({ content: fs.readFileSync(path.join(build, file), 'utf8') });
    await page.addStyleTag({ content: '* { transition: none !important; }' });
    for (const theme of themes) {
      await page.evaluate(({ id, scheme, family }) => {
        const root = document.documentElement;
        root.dataset.uiTheme = id; root.dataset.uiScheme = scheme; root.dataset.uiFamily = family;
      }, theme);
      const colors = await page.evaluate(() => {
        const probe = document.createElement('span'); probe.style.color = 'var(--noeis-action)'; document.querySelector('.work-notes').append(probe);
        const expected = getComputedStyle(probe).color; probe.remove();
        return { expected, button: getComputedStyle(document.querySelector('.work-weekly-add-trigger')).color, number: getComputedStyle(document.querySelector('.work-weekly-number')).color };
      });
      assert.equal(colors.button, colors.expected, `${theme.id}: Add priority`);
      assert.equal(colors.number, colors.expected, `${theme.id}: priority number`);
      console.log(`${theme.id}: ${colors.expected}`);
    }
    // Imported Omarchy accents must propagate without changing a room palette.
    await page.evaluate(() => document.documentElement.style.setProperty('--omarchy-accent', '#b4d273'));
    for (const selector of ['.work-weekly-add-trigger', '.work-weekly-number']) assert.equal(await page.locator(selector).evaluate(el => getComputedStyle(el).color), 'rgb(180, 210, 115)');
    console.log(`PASS: ${themes.length} themes plus a custom Omarchy accent`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
