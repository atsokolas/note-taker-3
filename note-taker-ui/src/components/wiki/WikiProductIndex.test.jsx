import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import WikiProductIndex from './WikiProductIndex';
import { listWikiPages } from '../../api/wiki';

jest.mock('../../api/wiki', () => ({
  listWikiPages: jest.fn()
}));

jest.mock('./WikiBuildPageComposer', () => ({ className = '' }) => (
  <form className={className} aria-label="Ask thought partner to build a page">
    <input aria-label="Build page prompt" />
    <button type="button">Build page</button>
  </form>
));

jest.mock('../../utils/wikiFeatureFlags', () => ({
  wikiPagePath: (pageId) => `/wiki/workspace?page=${pageId}`
}));

const pages = [
  {
    _id: 'wiki-investing',
    title: 'Investing',
    pageType: 'overview',
    summary: 'A source-backed synthesis of investing practice.',
    sourceRefs: [{ _id: 's1' }, { _id: 's2' }],
    claims: [{ _id: 'c1' }, { _id: 'c2' }],
    updatedAt: '2026-05-14T12:00:00.000Z'
  },
  {
    _id: 'wiki-machine',
    title: 'Complementary Machine Thing',
    pageType: 'concept',
    plainText: 'A machine concept.',
    sourceRefs: [{ _id: 's3' }],
    claims: [{ _id: 'c3' }],
    updatedAt: '2026-05-13T12:00:00.000Z'
  }
];

// AT-293: a page with no curated summary/scope falls through to plainText,
// which is the full flattened article body. The card must show a tight,
// cleaned excerpt, not a wall of text with leading title echo + [n] markers.
const LONG_BODY_PAGE = {
  _id: 'wiki-dump',
  title: 'Photosynthesis',
  pageType: 'topic',
  plainText: 'Photosynthesis is the process by which plants convert light energy into chemical energy stored in glucose [1]. It occurs in the chloroplasts of plant cells, primarily within structures called thylakoids [2,3]. The light-dependent reactions capture solar energy and produce ATP and NADPH, which then power the Calvin cycle to fix carbon dioxide into sugars [4-6]. This process is fundamental to life on Earth.',
  sourceRefs: [{ _id: 's4' }],
  claims: [{ _id: 'c4' }],
  updatedAt: '2026-05-12T12:00:00.000Z'
};

describe('WikiProductIndex', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    listWikiPages.mockResolvedValue(pages);
  });

  it('renders a sparse product-facing wiki index', async () => {
    render(
      <MemoryRouter>
        <WikiProductIndex />
      </MemoryRouter>
    );

    expect(screen.getByLabelText('Ask thought partner to build a page')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open workspace' })).toHaveAttribute('href', '/wiki/workspace');
    expect(screen.getByRole('link', { name: 'All pages' })).toHaveAttribute('href', '/wiki/workspace?view=list');
    expect(screen.getByRole('link', { name: 'Knowledge map' })).toHaveAttribute('href', '/wiki/workspace?view=graph');

    expect(await screen.findByRole('heading', { name: 'Key pages' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Your source-backed knowledge base' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Expand 2 trace history lines/ }));
    expect(screen.getByLabelText('Wiki corpus trace')).toHaveTextContent('scanned 2 pages · 3 sources');
    expect(screen.getByLabelText('Wiki corpus trace')).toHaveTextContent('all shown pages have source memory');
    await waitFor(() => {
      expect(screen.getByLabelText('Wiki corpus trace')).toHaveTextContent('latest update · Investing');
    });
    expect(listWikiPages).toHaveBeenCalledWith({ limit: 80 });
    expect(screen.getAllByRole('link', { name: /Investing/ })[0]).toHaveAttribute('href', '/wiki/workspace?page=wiki-investing');
    expect(screen.getByText('A source-backed synthesis of investing practice.')).toBeInTheDocument();

    const overview = screen.getByLabelText('Wiki overview');
    expect(overview).toHaveTextContent('Pages2');
    expect(overview).toHaveTextContent('Sources cited3');
    expect(overview).toHaveTextContent('Top typesConcept, Overview');
  });

  it('derives trust metrics from sources, citations, and claim marks instead of only legacy fields', async () => {
    listWikiPages.mockResolvedValueOnce([{
      _id: 'wiki-cited',
      title: 'Cited page',
      pageType: 'topic',
      summary: 'A page whose backend payload uses citation arrays.',
      sources: [{ _id: 'source-a' }],
      citations: [
        { sourceRefId: 'source-b', claimId: 'claim-a' },
        { sourceRef: { _id: 'source-c' }, claimId: 'claim-b' }
      ],
      body: {
        type: 'doc',
        content: [{
          type: 'paragraph',
          content: [{
            type: 'text',
            text: 'Marked claim.',
            marks: [{ type: 'claim', attrs: { claimId: 'claim-c' } }]
          }]
        }]
      }
    }]);

    render(
      <MemoryRouter>
        <WikiProductIndex />
      </MemoryRouter>
    );

    expect(await screen.findByRole('heading', { name: 'Key pages' })).toBeInTheDocument();
    expect(screen.getByLabelText('Wiki overview')).toHaveTextContent('Sources cited3');
    expect(screen.getByText('3 sources · 3 claims')).toBeInTheDocument();
  });

  it('does not describe source-less scaffold pages as source-backed key pages', async () => {
    listWikiPages.mockResolvedValueOnce([{
      _id: 'wiki-scaffold',
      title: 'Sparse topic',
      pageType: 'topic',
      plainText: 'Sparse topic still needs source-backed development before it becomes useful.'
    }]);

    render(
      <MemoryRouter>
        <WikiProductIndex />
      </MemoryRouter>
    );

    expect(await screen.findByRole('heading', { name: 'Draft pages' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Your wiki workspace' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Key pages' })).not.toBeInTheDocument();
    expect(screen.getByText('Draft scaffold · needs sources')).toBeInTheDocument();
  });

  it('clamps the Key pages excerpt and strips citation markers + title echo (AT-293)', async () => {
    listWikiPages.mockResolvedValueOnce([LONG_BODY_PAGE]);

    render(
      <MemoryRouter>
        <WikiProductIndex />
      </MemoryRouter>
    );

    await screen.findByRole('heading', { name: 'Key pages' });

    const card = screen.getAllByRole('link', { name: /Photosynthesis/ })[0];
    const excerpt = card.querySelector('p');
    expect(excerpt).toBeTruthy();

    const text = excerpt.textContent;
    // Tight excerpt, not the whole body run.
    expect(text.length).toBeLessThanOrEqual(170);
    expect(text.length).toBeLessThan(LONG_BODY_PAGE.plainText.length);
    // Citation markers like [1], [2,3], [4-6] are stripped.
    expect(text).not.toMatch(/\[\s*\d/);
    // Leading title echo is removed: excerpt starts on prose, not "Photosynthesis".
    expect(text.startsWith('Photosynthesis')).toBe(false);
    expect(text).toMatch(/is the process by which plants/);
  });

  it('shows a quiet empty state when there are no pages', async () => {
    listWikiPages.mockResolvedValueOnce([]);

    render(
      <MemoryRouter>
        <WikiProductIndex />
      </MemoryRouter>
    );

    const empty = await screen.findByRole('heading', { name: 'No wiki pages yet' });
    expect(empty).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Expand 1 trace history line/ }));
    expect(screen.getByLabelText('Wiki corpus trace')).toHaveTextContent('wiki corpus empty');
    await waitFor(() => {
      expect(screen.getByLabelText('Wiki corpus trace')).toHaveTextContent('ready to build first page');
    });
    expect(screen.queryByRole('heading', { name: 'Key pages' })).not.toBeInTheDocument();
  });

  it('surfaces load failure without showing graph maintenance UI', async () => {
    listWikiPages.mockRejectedValueOnce(new Error('down'));

    render(
      <MemoryRouter>
        <WikiProductIndex />
      </MemoryRouter>
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to load wiki pages.');
    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'Knowledge map' })).not.toBeInTheDocument();
      expect(screen.queryByText('Feed the wiki')).not.toBeInTheDocument();
    });
  });
});
