const fs = require('fs');
const path = require('path');
const {
  SHARE_ROUTES,
  injectSnapshot,
  renderEditionSnapshot,
  renderWikiCollectionSnapshot,
  renderWikiPageSnapshot
} = require('./shareSnapshot');

const shell = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'index.html'), 'utf8');

const page = {
  title: 'Margin of safety',
  plainText: 'Buy below intrinsic value so errors in the estimate do not lose money.',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  body: {
    type: 'doc',
    content: [
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'The idea' }] },
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Buy below ', marks: [{ type: 'claim', attrs: { citationIndexes: [1] } }] },
          { type: 'text', text: 'intrinsic value', marks: [{ type: 'bold' }, { type: 'claim', attrs: { citationIndexes: [1] } }] },
          { type: 'text', text: ' <so> errors do not lose money.' }
        ]
      }
    ]
  },
  sourceRefs: [{ title: 'The Intelligent Investor', url: 'https://example.com/ii', snippet: 'margin of safety' }]
};

describe('public share snapshots', () => {
  it('renders a wiki page with its citations once per claim and its sources', () => {
    const snapshot = renderWikiPageSnapshot(page, '/share/wiki/margin-of-safety');

    expect(snapshot.title).toBe('Margin of safety | Noeis');
    expect(snapshot.canonical).toBe('https://www.noeis.io/share/wiki/margin-of-safety');
    expect(snapshot.html).toContain('<h2>The idea</h2>');
    expect(snapshot.html).toContain('Buy below <strong>intrinsic value</strong><sup><a href="#source-1">[1]</a></sup>');
    expect(snapshot.html.match(/\[1\]/g)).toHaveLength(1);
    expect(snapshot.html).toContain('&lt;so&gt;');
    expect(snapshot.html).toContain('<li id="source-1"><a href="https://example.com/ii"');
    expect(snapshot.schema.citation).toEqual([{ '@type': 'CreativeWork', name: 'The Intelligent Investor', url: 'https://example.com/ii' }]);
  });

  it('swaps the homepage head and fallback for the page in the real shell', () => {
    const html = injectSnapshot(shell, renderWikiPageSnapshot(page, '/share/wiki/margin-of-safety'));

    expect(html).toContain('<title>Margin of safety | Noeis</title>');
    expect(html).toContain('<link rel="canonical" href="https://www.noeis.io/share/wiki/margin-of-safety"');
    expect(html).toContain('content="Buy below intrinsic value so errors in the estimate do not lose money."');
    expect(html).toContain('"@type":"Article"');
    expect(html).not.toContain('Grow a knowledge base from what you read.');
    expect(html).toMatch(/<div id="root">\s*<main class="seo-page">[\s\S]*<h1>Margin of safety<\/h1>[\s\S]*<\/main><\/div>/);
    expect(html.match(/<div id="root">/g)).toHaveLength(1);
  });

  it('renders a collection with every page', () => {
    const snapshot = renderWikiCollectionSnapshot(
      { name: 'Value Investing', description: 'Moats and margins.', pages: [{ ...page, body: { type: 'doc', content: [{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Margin of safety' }] }, ...page.body.content] } }] },
      '/share/wiki/collection/value-investing'
    );

    expect(snapshot.html).toContain('<h1>Value Investing</h1>');
    expect(snapshot.html.match(/<h2>Margin of safety<\/h2>/g)).toHaveLength(1);
    expect(snapshot.schema['@type']).toBe('CollectionPage');
  });

  it('renders an edition with each finding and what limits it', () => {
    const snapshot = renderEditionSnapshot({
      title: 'This Week in AI',
      issueLabel: 'Issue',
      number: 4,
      windowStart: '2026-10-01',
      windowEnd: '2026-10-07',
      standfirst: 'Agents got cheaper to run.',
      writtenBy: 'Claude',
      items: [{ title: 'A paper', url: 'https://example.com/p', finding: 'Costs fell.', boundary: 'One benchmark.' }]
    }, '/share/editions/twia-4');

    expect(snapshot.title).toBe('This Week in AI, Issue 4 | Noeis');
    expect(snapshot.html).toContain('Costs fell.');
    expect(snapshot.html).toContain('One benchmark.');
    expect(snapshot.html).toContain('Filed by Claude');
  });

  /* The page prints the agent's name, never the label typed for its token. */
  it('names the agent by its runtime, not its token label', () => {
    const named = renderEditionSnapshot({ title: 'This Week in AI', writtenBy: 'My laptop', writtenByRuntime: 'codex', items: [] }, '/share/editions/x');
    expect(named.html).toContain('Filed by Codex');
    expect(named.html).not.toContain('My laptop');
    const legacy = renderEditionSnapshot({ title: 'This Week in AI', writtenBy: 'Codex Wiki account grounding audit', items: [] }, '/share/editions/x');
    expect(legacy.html).toContain('Filed by Codex<');
  });

  /* A crawler reads the second hand too, named the same way. */
  it('prints a second reading under its agent’s name', () => {
    const page = renderEditionSnapshot({
      title: 'This Week in AI',
      items: [{
        title: 'A paper', url: 'https://example.com/p', finding: 'Costs fell.', boundary: 'One benchmark.',
        filedBy: 'OpenClaw', filedByRuntime: 'openclaw',
        readings: [{ filedBy: 'My laptop', filedByRuntime: 'codex', finding: 'Within noise.', boundary: 'Three seeds.' }]
      }]
    }, '/share/editions/x');
    expect(page.html).toContain('OpenClaw’s reading');
    expect(page.html).toContain('Codex’s reading');
    expect(page.html).toContain('Within noise.');
    expect(page.html).toContain('Three seeds.');
    expect(page.html).not.toContain('My laptop');
  });

  it('routes each public address to its API', () => {
    const match = (pathname) => {
      const route = SHARE_ROUTES.find((entry) => entry.pattern.test(pathname));
      return route ? route.api(pathname.match(route.pattern)[1]) : null;
    };
    expect(match('/share/wiki/collection/value-investing')).toBe('/api/public/wiki/collections/value-investing');
    expect(match('/share/wiki/margin-of-safety')).toBe('/api/public/wiki/pages/margin-of-safety');
    expect(match('/share/editions/twia-4')).toBe('/api/public/editions/twia-4');
    expect(match('/share/wiki/margin-of-safety/comparison')).toBeNull();
  });
});
