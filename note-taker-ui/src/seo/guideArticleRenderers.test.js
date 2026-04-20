const { renderGuidePage } = require('../../scripts/seo/renderers');
const publishingContent = require('./publishingContent.json');

describe('guide article rendering', () => {
  it('renders a longform guide page from the shared guide registry', () => {
    const html = renderGuidePage(publishingContent, 'second-brain-app');

    expect(html).toContain('Best Second Brain App Criteria for Serious Readers | Noeis');
    expect(html).toContain('How to Choose a Second Brain App');
    expect(html).toContain('Written by Anthony Tsokolas');
    expect(html).toContain('How this guide was produced');
    expect(html).toContain('Traditional notes apps');
    expect(html).toContain('href="/ai-second-brain"');
    expect(html).toContain('https://www.noeis.io/second-brain-app');
    expect(html).toContain('"@type":"Article"');
    expect(html).toContain('"@type":"SoftwareApplication"');
  });

  it('renders a new core wedge page from the shared registry', () => {
    const html = renderGuidePage(publishingContent, 'readwise-is-not-a-second-brain');

    expect(html).toContain('Readwise Is Not a Second Brain | Noeis');
    expect(html).toContain('What Readwise does well');
    expect(html).toContain('highlight feed');
    expect(html).toContain('href="/register?via=marketing');
  });

  it('renders a founder-intent page from the shared registry', () => {
    const html = renderGuidePage(publishingContent, 'best-second-brain-app-for-founders');

    expect(html).toContain('Best Second Brain App for Founders | Noeis');
    expect(html).toContain('The best second brain app for founders is one that keeps evidence reachable');
    expect(html).toContain('Claim');
    expect(html).toContain('Evidence');
    expect(html).toContain('Comparison');
    expect(html).toContain('Founder workflows break when evidence is scattered.');
    expect(html).toContain('Create your first concept');
    expect(html).toContain('href="/most-note-apps-solve-capture-not-recall"');
  });

  it('renders a public proof-layer workflow page from the shared registry', () => {
    const html = renderGuidePage(publishingContent, 'source-backed-synthesis-workflow');

    expect(html).toContain('Source-Backed Synthesis Workflow in Noeis | Noeis');
    expect(html).toContain('A source-backed synthesis workflow keeps your draft connected');
    expect(html).toContain('Why this matters');
    expect(html).toContain('What most tools do');
    expect(html).toContain('What stronger workflow looks like');
    expect(html).toContain('A practical source-backed synthesis workflow');
    expect(html).toContain('Build your first synthesis');
    expect(html).toContain('href="/highlights-into-concepts"');
  });

  it('renders the import archive workflow page from the shared registry', () => {
    const html = renderGuidePage(publishingContent, 'import-reading-archive-into-noeis');

    expect(html).toContain('Import Reading Archive into Noeis | Noeis');
    expect(html).toContain('Importing a reading archive only matters if the material becomes reusable proof');
    expect(html).toContain('Imported reading is only valuable when you can point back to it later.');
    expect(html).toContain('What import-heavy users should optimize for');
    expect(html).toContain('A practical path from archive to workspace');
    expect(html).toContain('Import your archive');
    expect(html).toContain('href="/source-backed-synthesis-workflow"');
  });
});
