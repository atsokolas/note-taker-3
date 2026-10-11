import fs from 'fs';
import path from 'path';

describe('Library Source Memory composition', () => {
  const css = fs.readFileSync(path.join(__dirname, 'library-source-memory.css'), 'utf8');

  it('sets the source record and where the piece went in one quiet register', () => {
    expect(css).toMatch(/library-source-trace__facts, \.library-source-trace__author[\s\S]*?\.article-whereabouts \{[\s\S]*?font-family: var\(--noeis-ui-font\);/);
    expect(css).toMatch(/\.article-whereabouts \{[\s\S]*?list-style: none;/);
    expect(css).toMatch(/library-source-trace__uses \{[\s\S]*?flex-wrap: wrap;/);
  });

  it('keeps row relevance links wrapping', () => {
    expect(css).toMatch(/library-article-row-relevance \{[\s\S]*?display: flex;[\s\S]*?flex-wrap: wrap;[\s\S]*?gap: 7px 12px;/);
    expect(css).toMatch(/library-article-row-relevance a \{[\s\S]*?display: inline-flex;[\s\S]*?gap: 5px;/);
  });
});
