import fs from 'fs';
import path from 'path';
import { THEME_CATALOG } from './themeCatalog';

const uiRoot = path.join(__dirname, '..', '..');
const css = fs.readFileSync(path.join(uiRoot, 'src', 'styles', 'semantic-theme.css'), 'utf8');
const blockFor = (id) => css.match(new RegExp(`html\\[data-ui-theme='${id}'\\] \\{[\\s\\S]*?\\n\\}`))?.[0] || '';

describe('theme catalog', () => {
  it('gives every named theme its own palette block with the right colour scheme', () => {
    THEME_CATALOG.forEach(({ id, scheme }) => {
      const block = id === 'light' ? css.match(/:root,[\s\S]*?\n\}/)[0] : blockFor(id);
      expect(block).toContain(`color-scheme: ${scheme};`);
    });
  });

  it('draws each community swatch from the palette the theme actually wears', () => {
    THEME_CATALOG.filter((entry) => entry.origin === 'community').forEach(({ id, swatch }) => {
      const block = blockFor(id);
      expect(block).toContain(`--noeis-paper: ${swatch.paper};`);
      expect(block).toContain(`--noeis-action: ${swatch.accent};`);
      expect(block).toContain(`--noeis-ink: ${swatch.ink};`);
      expect(block).toContain(`--noeis-danger: ${swatch.danger};`);
    });
  });

  it('keeps the first-paint script and the saved-settings schema in step with the catalog', () => {
    const html = fs.readFileSync(path.join(uiRoot, 'public', 'index.html'), 'utf8');
    const models = fs.readFileSync(path.join(uiRoot, '..', 'server', 'models', 'index.js'), 'utf8');
    THEME_CATALOG.forEach(({ id, scheme, family }) => {
      expect(html).toContain(`'${id}': ['${scheme}', '${family}', `);
      expect(models).toContain(`'${id}'`);
    });
  });
});
