const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');

const src = path.resolve(__dirname, '../src');
const baseStyles = [
  'index.css', 'styles/theme.css', 'styles/global.css', 'App.css',
  'styles/reading-layout.css', 'styles/think-notes.css', 'styles/semantic-theme.css'
];
const surfaces = [
  { name: 'Work', wrapper: 'work-notes', body: 'work-writing', prose: 'ProseMirror think-notebook-editor-body', styles: ['styles/think-writing.css', 'work/work-notes.css'] },
  { name: 'Think', wrapper: 'think-notes', body: 'think-notes__note think-notebook-editor', prose: 'ProseMirror think-notebook-editor-body', styles: ['styles/think-writing.css'] },
  { name: 'Wiki editor', prose: 'ProseMirror tiptap-editor wiki-editor__body', styles: ['styles/wiki-critical.css', 'styles/wiki.css'] },
  { name: 'Wiki first paint', body: 'wiki-read', prose: 'wiki-read__body', styles: ['styles/wiki-critical.css'] },
  { name: 'Wiki reader', body: 'wiki-read', prose: 'wiki-read__body', styles: ['styles/wiki-critical.css', 'styles/wiki.css'] },
  { name: 'Wiki openable', body: 'wiki-read', prose: 'wiki-read__body', styles: ['styles/wiki-critical.css', 'styles/wiki.css', 'components/wiki/open-sentence/open-sentence.css'], openable: true },
  { name: 'Shared Wiki', wrapper: 'shared-wiki-page', prose: 'shared-wiki-page__body wiki-read', styles: ['styles/wiki.css', 'styles/shared-page-column.css'] },
  { name: 'Shared brief', wrapper: 'shared-wiki-page', prose: 'shared-wiki-page__company-brief wiki-read', styles: ['styles/wiki.css', 'styles/shared-page-column.css'] },
  { name: 'Shared collection', wrapper: 'shared-wiki-collection__page', prose: 'shared-wiki-collection__page-preview wiki-read', styles: ['styles/wiki.css'], compact: true },
  { name: 'Library', prose: 'article-reader-content reader', styles: [] }
];

// Synthetic markup shared by TipTap's editor/HTML and the Wiki JSON renderer.
const writing = `
  <p data-standalone>Notes before the list.</p>
  <ul data-root-list>
    <li><p>Release planning</p><ul>
      <li><p>Review the <strong>new build</strong> and <a href="https://example.test">test plan</a>.</p><ol>
        <li><p>Run the checks.</p><ul><li><p>Record the result.</p></li></ul></li>
        <li><p>Share the findings.</p></li>
      </ol></li>
      <li><p>Prepare the next iteration.</p></li>
    </ul></li>
    <li><p>Two paragraphs belong to this item.</p><p data-continuation>This one still needs breathing room.</p></li>
    <li><p>A quoted passage follows.</p><blockquote><p data-quote>A separate quotation keeps its paragraph rhythm.</p><ul data-quote-list><li><p>One quoted item.</p></li></ul></blockquote></li>
    <li data-empty><p></p></li>
  </ul>
  <ol><li><p>Ordered parent</p><ul><li><p>Unordered child</p></li></ul></li></ol>
  <p data-after>Notes after the list.</p>`;

for (const width of [1440, 1280, 430]) {
  for (const surface of surfaces) {
    test(`${surface.name}: nested lists stay together at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1200 });
      // Font downloads are irrelevant to the em-based spacing contract.
      await page.route('https://**/*', route => route.abort());
      const content = surface.openable ? writing.replace(/<p([^>]*)>(.*?)<\/p>/g, '<div class="open-sentence"><p class="open-sentence__line"$1>$2</p></div>') : writing;
      await page.setContent(`<html data-ui-scheme="light"><body class="noeis-editorial"><div class="app-shell-new__column"><main class="${surface.wrapper || ''}"><div class="${surface.body || ''}"><article data-prose class="${surface.prose}">${content}</article></div></main></div></body></html>`);
      for (const file of [...baseStyles, ...surface.styles]) {
        await page.addStyleTag({ content: fs.readFileSync(path.join(src, file), 'utf8').replace(/@import url\([^)]*\);/g, '') });
      }
      await page.addStyleTag({ content: 'main { padding: 24px; } [data-prose] { min-width: 0; }' });
      const before = await page.locator('[data-prose]').innerHTML();
      const metrics = await page.locator('[data-prose]').evaluate(prose => {
        const margin = node => ({ top: parseFloat(getComputedStyle(node).marginTop), bottom: parseFloat(getComputedStyle(node).marginBottom) });
        return {
          parents: [...prose.querySelectorAll('li > p:has(+ ul, + ol), li > .open-sentence:has(+ ul, + ol) > p')].map(node => {
            const block = node.parentElement.matches('.open-sentence') ? node.parentElement : node;
            return { ...margin(node), gap: block.nextElementSibling.getBoundingClientRect().top - node.getBoundingClientRect().bottom };
          }),
          nestedLists: [...prose.querySelectorAll('li > ul, li > ol')].map(margin),
          standalone: margin(prose.querySelector('[data-standalone]')).bottom,
          continuation: margin(prose.querySelector('[data-continuation]')).top,
          quote: margin(prose.querySelector('[data-quote]')).bottom,
          quoteEm: margin(prose.querySelector('[data-quote]')).bottom / parseFloat(getComputedStyle(prose.querySelector('[data-quote]')).fontSize),
          quoteListEm: margin(prose.querySelector('[data-quote-list]')).bottom / parseFloat(getComputedStyle(prose.querySelector('[data-quote-list]')).fontSize),
          rootList: margin(prose.querySelector('[data-root-list]')).bottom,
          overflows: prose.scrollWidth > prose.clientWidth
        };
      });
      if (process.env.PROSE_SCREENSHOT_DIR) {
        fs.mkdirSync(process.env.PROSE_SCREENSHOT_DIR, { recursive: true });
        await page.screenshot({ path: path.join(process.env.PROSE_SCREENSHOT_DIR, `${surface.name.replaceAll(' ', '-')}-${width}.png`), fullPage: true });
      }
      if (surface.name === 'Work') {
        expect(metrics.quoteEm).toBeCloseTo(0.8);
        expect(metrics.quoteListEm).toBeCloseTo(0.8);
      }
      expect(metrics.parents).toHaveLength(4);
      for (const parent of metrics.parents) {
        expect(parent.top).toBe(0);
        expect(parent.bottom).toBe(0);
        expect(parent.gap).toBeLessThan(10);
      }
      for (const list of metrics.nestedLists) expect(list).toEqual({ top: 0, bottom: 0 });
      expect(metrics.rootList).toBeGreaterThan(10);
      if (surface.compact) {
        expect(metrics.standalone).toBe(0);
        expect(metrics.continuation).toBe(0);
        expect(metrics.quote).toBe(0);
      } else {
        expect(metrics.standalone).toBeGreaterThan(9);
        expect(metrics.continuation).toBeGreaterThan(10);
        expect(metrics.quote).toBeGreaterThan(9);
      }
      expect(metrics.overflows).toBe(false);
      await expect(page.locator('[data-empty] p')).toHaveCount(1);
      expect(await page.locator('[data-prose]').innerHTML()).toBe(before);
    });
  }
}
