import fs from 'fs';
import path from 'path';

describe('Library Source Memory composition', () => {
  const css = fs.readFileSync(path.join(__dirname, 'library-source-memory.css'), 'utf8');

  it('keeps provenance labels and values in distinct readable columns', () => {
    expect(css).toMatch(/library-source-trace__provenance li,[\s\S]*?library-source-trace__uses nav a[\s\S]*?display: grid;[\s\S]*?grid-template-columns: minmax\(76px, max-content\) minmax\(0, 1fr\);/);
    expect(css).toMatch(/library-source-trace__provenance li > :last-child,[\s\S]*?overflow-wrap: anywhere;/);
  });

  it('separates connected knowledge destinations and source actions', () => {
    expect(css).toMatch(/library-source-trace__uses nav a \{[\s\S]*?padding: 7px 0;[\s\S]*?border-bottom:/);
    expect(css).toMatch(/library-source-trace__actions \{[\s\S]*?display: flex;[\s\S]*?flex-wrap: wrap;[\s\S]*?gap: 10px 16px;/);
    expect(css).toMatch(/library-article-row-relevance \{[\s\S]*?display: flex;[\s\S]*?flex-wrap: wrap;[\s\S]*?gap: 7px 12px;/);
    expect(css).toMatch(/library-article-row-relevance a \{[\s\S]*?display: inline-flex;[\s\S]*?gap: 5px;/);
  });
});
