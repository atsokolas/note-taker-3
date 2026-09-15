const fs = require('fs');
const path = require('path');
const css = fs.readFileSync(path.join(__dirname, 'edition-reading.css'), 'utf8');
it('uses a readable sequence and a margin, never one physical column per section', () => {
  expect(css).toContain('grid-template-columns: minmax(0,720px) minmax(0,1fr)');
  expect(css).not.toContain('--edition-columns');
});
it('preserves geometry in Just read and respects reduced motion', () => {
  expect(css).toMatch(/is-focused[^}]+visibility: hidden/s);
  expect(css).toMatch(/prefers-reduced-motion: reduce[^}]+animation: none/s);
});
it('switches the source to a full focused sheet on smaller screens', () => {
  expect(css).toMatch(/max-width: 1199px[\s\S]*?\.edition-peek \{ inset: 0; width: 100%/);
});
