import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import * as router from 'react-router-dom';
import WikiPageReadView from './WikiPageReadView';
import {
  askWikiPage,
  createWikiPage,
  getWikiAutolinkSuggestions,
  getWikiBacklinks,
  getWikiPage,
  getWikiPageMarkdown,
  maintainWikiPage,
  promoteWikiDiscussion,
  streamAskWikiPage,
  streamMaintainWikiPage,
  updateWikiPage
} from '../../api/wiki';
import { getConnectionsForItem } from '../../api/connections';

jest.mock('../../api/wiki', () => ({
  askWikiPage: jest.fn(),
  createWikiPage: jest.fn(),
  getWikiAutolinkSuggestions: jest.fn(),
  getWikiBacklinks: jest.fn(),
  getWikiPage: jest.fn(),
  getWikiPageMarkdown: jest.fn(),
  maintainWikiPage: jest.fn(),
  promoteWikiDiscussion: jest.fn(),
  streamAskWikiPage: jest.fn(),
  streamMaintainWikiPage: jest.fn(),
  updateWikiPage: jest.fn()
}));

jest.mock('../../api/connections', () => ({
  getConnectionsForItem: jest.fn()
}));

jest.mock('../../utils/wikiAnalytics', () => ({
  trackWikiQaPromoted: jest.fn(),
  trackWikiReadModePageView: jest.fn()
}));

const page = {
  _id: 'wiki-1',
  title: 'Enterprise AI Memory',
  pageType: 'overview',
  status: 'published',
  visibility: 'private',
  body: {
    type: 'doc',
    content: [
      {
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: 'Core idea' }]
      },
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Enterprise AI Memory depends on ' },
          {
            type: 'text',
            text: 'Compounding interest',
            marks: [{ type: 'wikiLink', attrs: { pageId: 'wiki-related', title: 'Compounding interest' } }]
          },
          { type: 'text', text: '.' }
        ]
      },
      {
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: 'Open questions' }]
      },
      {
        type: 'paragraph',
        content: [{
          type: 'text',
          text: 'Memory compounds with review.',
          marks: [{
            type: 'claim',
            attrs: {
              claimId: 'claim-1',
              support: 'supported',
              citationIndexes: [1],
              contradictionIndexes: []
            }
          }]
        }]
      }
    ]
  },
  sourceRefs: [
    { _id: 'source-1', title: 'Memory article', snippet: 'Source snippet' },
    { _id: 'source-2', title: 'Agent article', snippet: 'Agent source snippet' }
  ],
  claims: [
    { claimId: 'claim-1', text: 'Memory compounds with review.', support: 'supported' },
    { claimId: 'claim-2', text: 'Weak claim.', support: 'unsupported' },
    { claimId: 'claim-3', text: 'Conflicted claim.', support: 'conflicted' }
  ],
  citations: [],
  aiState: {
    draftStatus: 'ready',
    health: {
      newItems: [],
      unsupportedClaims: [],
      missingCitations: [],
      staleSections: [],
      contradictions: []
    }
  }
};

const emptyAnswer = () => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Answer pending.' }] }]
});

describe('WikiPageReadView', () => {
  const originalWorkspaceFlag = process.env.REACT_APP_WIKI_WORKSPACE_V1;
  const originalScrollIntoView = window.HTMLElement.prototype.scrollIntoView;
  const originalMatchMedia = window.matchMedia;

  const flushDeferredWikiReadWork = async () => {
    await act(async () => {
      jest.advanceTimersByTime(300);
    });
    await act(async () => {});
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    process.env.REACT_APP_WIKI_WORKSPACE_V1 = 'false';
    getWikiPage.mockResolvedValue(page);
    getWikiBacklinks.mockResolvedValue({
      backlinks: [{
        pageId: 'wiki-backlink',
        title: 'Adjacent Memory',
        mentionCount: 1,
        snippet: 'Mentions Enterprise AI Memory.'
      }],
      scanned: 3
    });
    getWikiAutolinkSuggestions.mockResolvedValue({ suggestions: [], scanned: 0 });
    getConnectionsForItem.mockResolvedValue({ outgoing: [], incoming: [] });
    maintainWikiPage.mockResolvedValue(page);
    getWikiPageMarkdown.mockResolvedValue('---\ntitle: "Enterprise AI Memory"\n---\n\n## Core idea\n');
    askWikiPage.mockResolvedValue(page);
    streamAskWikiPage.mockResolvedValue(page);
    createWikiPage.mockResolvedValue({ _id: 'wiki-new', title: 'Portfolio Concentration' });
    streamMaintainWikiPage.mockResolvedValue({ _id: 'wiki-new', title: 'Portfolio Concentration' });
    updateWikiPage.mockResolvedValue({ ...page, visibility: 'shared' });
    window.HTMLElement.prototype.scrollIntoView = jest.fn();
    window.matchMedia = jest.fn().mockReturnValue({ matches: false });
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
    if (originalWorkspaceFlag === undefined) delete process.env.REACT_APP_WIKI_WORKSPACE_V1;
    else process.env.REACT_APP_WIKI_WORKSPACE_V1 = originalWorkspaceFlag;
    window.HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
    window.matchMedia = originalMatchMedia;
    window.sessionStorage.clear();
    window.history.pushState({}, '', '/');
  });

  it('opens a wiki page as an article with no editor input until edit is requested', async () => {
    const onEdit = jest.fn();
    render(
      <MemoryRouter>
        <WikiPageReadView pageId="wiki-1" onEdit={onEdit} />
      </MemoryRouter>
    );

    expect(await screen.findByRole('heading', { name: 'Enterprise AI Memory' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Enterprise AI Memory' }).querySelector('em')).toHaveTextContent('Memory');
    expect(screen.queryByLabelText('Wiki page title')).not.toBeInTheDocument();
    expect(screen.queryByTestId('wiki-editor-content')).not.toBeInTheDocument();
    expect(document.querySelector('[contenteditable="true"]')).not.toBeInTheDocument();
    // AT-22: rail starts collapsed; expand it so the infobox (which renders the page-type header) is in the DOM.
    await flushDeferredWikiReadWork();
    const railEl = await screen.findByRole('complementary', { name: 'Page context' });
    const showContextBtn = within(railEl).queryByRole('button', { name: /show context/i });
    if (showContextBtn) await act(async () => { fireEvent.click(showContextBtn); });
    expect(screen.getAllByText('Overview').length).toBeGreaterThan(0);
    await waitFor(() => expect(railEl).toHaveTextContent(/Sources\s*2/));
    expect(railEl).toHaveTextContent(/Claims\s*[1-9]\d*/);
    expect(railEl).toHaveTextContent(/Words\s*[1-9]\d*/);
    expect(screen.getByRole('navigation', { name: 'Page sections' })).toHaveTextContent('Core idea');
    expect(screen.getByRole('navigation', { name: 'Page sections' })).toHaveTextContent('Open questions');
    expect(screen.getByRole('link', { name: 'Core idea' })).toHaveClass('is-active');
    expect(screen.getByRole('link', { name: 'Compounding interest' })).toHaveAttribute('href', '/wiki/wiki-related');
    expect(screen.getByRole('tab', { name: 'Article' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Talk' })).toBeInTheDocument();
    expect(screen.queryByText('Claim health')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'References' })).toBeInTheDocument();
    expect(screen.getByText('Memory article')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Enterprise AI Memory' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it('shares the current wiki page from the read surface without exposing private graph affordances', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      writable: true,
      value: { writeText }
    });

    render(
      <MemoryRouter>
        <WikiPageReadView pageId="wiki-1" onEdit={jest.fn()} workspaceMode />
      </MemoryRouter>
    );

    expect(await screen.findByRole('heading', { name: 'Enterprise AI Memory' })).toBeInTheDocument();
    const shareRegion = screen.getByRole('region', { name: 'Share this wiki page' });
    expect(shareRegion).toHaveTextContent('Private page');
    expect(shareRegion).toHaveTextContent('Create a safe public page with the article and references only.');
    expect(shareRegion).toHaveTextContent('backlinks, highlights, source notes, and agent work stay private');

    await act(async () => {
      fireEvent.click(within(shareRegion).getByRole('button', { name: 'Share' }));
    });

    expect(updateWikiPage).toHaveBeenCalledWith('wiki-1', { visibility: 'shared' });
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/share/wiki/wiki-1`);
    expect(await within(shareRegion).findByRole('status')).toHaveTextContent('Copied safe public link.');
    expect(within(shareRegion).getByRole('link', { name: 'Open public page' })).toHaveAttribute('href', `${window.location.origin}/share/wiki/wiki-1`);
  });

  it('lets a shared wiki page stop exposing its public link from the read surface', async () => {
    getWikiPage.mockResolvedValueOnce({ ...page, visibility: 'shared' });
    updateWikiPage.mockResolvedValueOnce({ ...page, visibility: 'private' });

    render(
      <MemoryRouter>
        <WikiPageReadView pageId="wiki-1" onEdit={jest.fn()} workspaceMode />
      </MemoryRouter>
    );

    expect(await screen.findByRole('heading', { name: 'Enterprise AI Memory' })).toBeInTheDocument();
    const shareRegion = screen.getByRole('region', { name: 'Share this wiki page' });
    expect(shareRegion).toHaveTextContent('Public link ready');
    expect(within(shareRegion).getByRole('link', { name: 'Open public page' })).toHaveAttribute('href', `${window.location.origin}/share/wiki/wiki-1`);

    await act(async () => {
      fireEvent.click(within(shareRegion).getByRole('button', { name: 'Stop sharing' }));
    });

    expect(updateWikiPage).toHaveBeenCalledWith('wiki-1', { visibility: 'private' });
    expect(await within(shareRegion).findByRole('status')).toHaveTextContent('Public link turned off.');
    expect(within(shareRegion).queryByRole('link', { name: 'Open public page' })).not.toBeInTheDocument();
  });

  it('does not present a public link for blocked review pages even if visibility is shared', async () => {
    getWikiPage.mockResolvedValueOnce({
      ...page,
      visibility: 'shared',
      qualityReview: {
        status: 'needs_review',
        severity: 'blocked',
        surfaceEligible: false,
        reasons: [{ code: 'known_qa_junk_title', message: 'Page title matches a known malformed QA fixture.' }]
      }
    });

    render(
      <MemoryRouter>
        <WikiPageReadView pageId="wiki-1" onEdit={jest.fn()} workspaceMode />
      </MemoryRouter>
    );

    expect(await screen.findByRole('heading', { name: 'Enterprise AI Memory' })).toBeInTheDocument();
    const shareRegion = screen.getByRole('region', { name: 'Share this wiki page' });
    expect(shareRegion).toHaveTextContent('Needs review before sharing');
    expect(shareRegion).toHaveTextContent('hidden from public sharing until the review items are fixed or archived');
    expect(within(shareRegion).queryByRole('link', { name: 'Open public page' })).not.toBeInTheDocument();
    expect(within(shareRegion).getByRole('button', { name: 'Share' })).toBeDisabled();
    expect(within(shareRegion).getByRole('button', { name: 'Stop sharing' })).toBeInTheDocument();
  });

  it('keeps the article title as the only h1 even when stored body content includes h1 headings', async () => {
    getWikiPage.mockResolvedValueOnce({
      ...page,
      body: {
        type: 'doc',
        content: [
          { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Enterprise AI Memory' }] },
          { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Model Section Title' }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'The body remains readable.' }] }
        ]
      }
    });

    const { container } = render(
      <MemoryRouter>
        <WikiPageReadView pageId="wiki-1" onEdit={jest.fn()} />
      </MemoryRouter>
    );

    expect(await screen.findByRole('heading', { level: 1, name: 'Enterprise AI Memory' })).toBeInTheDocument();
    expect(container.querySelectorAll('h1')).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 2, name: 'Model Section Title' })).toBeInTheDocument();
  });

  it('renders citation marginalia on wide readers without replacing references', async () => {
    window.matchMedia = jest.fn().mockReturnValue({
      matches: true,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn()
    });

    render(
      <MemoryRouter>
        <WikiPageReadView pageId="wiki-1" onEdit={jest.fn()} />
      </MemoryRouter>
    );

    const marginalia = await screen.findByLabelText('Citation previews');
    expect(within(marginalia).getByRole('link', { name: /\[1\].*Memory article/s })).toHaveAttribute('href', '#wiki-ref-1');
    expect(screen.getByRole('heading', { name: 'References' })).toBeInTheDocument();
  });

  it('witnesses a Think promotion as the page changes into the Wiki register', async () => {
    jest.spyOn(router, 'useLocation').mockReturnValue({
      pathname: '/wiki/workspace',
      search: '?page=wiki-1&promoted=concept&from=think&sourceId=concept-1&sourceTitle=Enterprise%20AI',
      hash: '',
      state: null,
      key: 'promotion-test'
    });

    render(
      <MemoryRouter>
        <WikiPageReadView pageId="wiki-1" onEdit={jest.fn()} workspaceMode />
      </MemoryRouter>
    );

    const title = await screen.findByRole('heading', { name: 'Enterprise AI Memory' });
    expect(title).toHaveClass('wiki-read__title');
    expect(title).toHaveAttribute('data-view-transition-name', 'wiki-read-title');
    const witness = screen.getByLabelText('Thought promoted to Wiki');
    expect(witness).toHaveAttribute('data-register-transition', 'register');
    expect(witness).toHaveAttribute('data-promotion-receipt', 'settled');
    expect(witness).toHaveAttribute('data-promoted-type', 'concept');
    expect(witness).toHaveTextContent('Think -> Wiki');
    expect(witness).toHaveTextContent('Concept registered as a sourced wiki page from Enterprise AI.');
    expect(within(witness).getByLabelText('Promotion receipt')).toHaveTextContent('Draft captured');
    expect(within(witness).getByLabelText('Promotion receipt')).toHaveTextContent('Graph edge written');
    expect(within(witness).getByLabelText('Promotion receipt')).toHaveTextContent('Wiki register settled');
    expect(within(witness).getByRole('link', { name: 'Return to source' })).toHaveAttribute('href', '/think?tab=concepts&concept=Enterprise+AI');
  });

  it('surfaces persisted graph traces in the page context rail', async () => {
    getConnectionsForItem.mockResolvedValueOnce({
      outgoing: [{
        _id: 'edge-related',
        toType: 'wiki_page',
        toId: 'wiki-related',
        relationType: 'related',
        target: {
          title: 'Compounding Interest',
          snippet: 'A related wiki page.',
          openPath: '/wiki/wiki-related',
          exists: true
        }
      }],
      incoming: [
        {
          _id: 'edge-mentioned',
          fromType: 'wiki_page',
          fromId: 'wiki-source-page',
          relationType: 'related',
          source: {
            title: 'Research Taste',
            snippet: 'This page mentions Enterprise AI Memory.',
            exists: true
          }
        },
        {
          _id: 'edge-supported',
          fromType: 'article',
          fromId: 'article-1',
          relationType: 'supports',
          source: {
            title: 'Memory Systems Memo',
            snippet: 'Library source supporting the page.',
            openPath: '/library?articleId=article-1',
            exists: true
          }
        }
      ]
    });

    render(
      <MemoryRouter>
        <WikiPageReadView pageId="wiki-1" onEdit={jest.fn()} />
      </MemoryRouter>
    );

    await screen.findByRole('heading', { name: 'Enterprise AI Memory' });
    await flushDeferredWikiReadWork();
    const railEl = await screen.findByRole('complementary', { name: 'Page context' });
    const showContextBtn = within(railEl).queryByRole('button', { name: /show context/i });
    if (showContextBtn) await act(async () => { fireEvent.click(showContextBtn); });

    const traces = await screen.findByLabelText('Graph traces');
    expect(within(traces).getByRole('heading', { name: 'Related to' })).toBeInTheDocument();
    expect(within(traces).getByRole('link', { name: /Compounding Interest/ })).toHaveAttribute('href', '/wiki/wiki-related');
    expect(within(traces).getByRole('heading', { name: 'Mentioned by' })).toBeInTheDocument();
    expect(within(traces).getByRole('link', { name: /Research Taste/ })).toHaveAttribute('href', '/wiki/wiki-source-page');
    expect(within(traces).getByRole('heading', { name: 'Supported by' })).toBeInTheDocument();
    expect(within(traces).getByRole('link', { name: /Memory Systems Memo/ })).toHaveAttribute('href', '/library?articleId=article-1');
  });

  it('opens and focuses graph traces when routed from the agent receipt', async () => {
    window.localStorage.setItem('noeis.wiki.read.rail_collapsed', '1');
    window.history.pushState({}, '', '/wiki/workspace?page=wiki-1&pane=wiki&trace=1');
    getConnectionsForItem.mockResolvedValueOnce({
      outgoing: [{
        _id: 'edge-related',
        toType: 'wiki_page',
        toId: 'wiki-related',
        relationType: 'related',
        target: {
          title: 'Compounding Interest',
          snippet: 'A related wiki page.',
          exists: true
        }
      }],
      incoming: []
    });

    render(
      <MemoryRouter initialEntries={[{ pathname: '/wiki/workspace', search: '?page=wiki-1&pane=wiki&trace=1' }]}>
        <WikiPageReadView pageId="wiki-1" onEdit={jest.fn()} />
      </MemoryRouter>
    );

    await screen.findByRole('heading', { name: 'Enterprise AI Memory' });
    await flushDeferredWikiReadWork();

    const rail = await screen.findByRole('complementary', { name: 'Page context' });
    await waitFor(() => expect(rail).not.toHaveClass('wiki-read__rail--collapsed'));
    const traces = await screen.findByLabelText('Graph traces');
    expect(traces).toHaveAttribute('tabindex', '-1');
    expect(within(traces).getByRole('link', { name: /Compounding Interest/ })).toBeInTheDocument();
  });

  it('collapses overflowing citation marginalia until the reader expands it', async () => {
    window.matchMedia = jest.fn().mockReturnValue({
      matches: true,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn()
    });
    getWikiPage.mockResolvedValueOnce({
      ...page,
      body: {
        type: 'doc',
        content: [{
          type: 'paragraph',
          content: [{
            type: 'text',
            text: 'This paragraph cites a dense run of sources.',
            marks: [{
              type: 'claim',
              attrs: {
                claimId: 'claim-many',
                support: 'supported',
                citationIndexes: [1, 2, 3, 4, 5, 6],
                contradictionIndexes: []
              }
            }]
          }]
        }]
      },
      sourceRefs: Array.from({ length: 6 }, (_, index) => ({
        _id: `source-${index + 1}`,
        title: `Source ${index + 1}`,
        snippet: `Snippet ${index + 1}`
      }))
    });

    render(
      <MemoryRouter>
        <WikiPageReadView pageId="wiki-1" onEdit={jest.fn()} />
      </MemoryRouter>
    );

    const marginalia = await screen.findByLabelText('Citation previews');
    expect(within(marginalia).getByText('Source 1')).toBeInTheDocument();
    expect(within(marginalia).getByText('Source 4')).toBeInTheDocument();
    expect(within(marginalia).queryByText('Source 5')).not.toBeInTheDocument();

    fireEvent.click(within(marginalia).getByRole('button', { name: 'Show 2 more citation previews' }));

    expect(within(marginalia).getByText('Source 6')).toBeInTheDocument();
    expect(within(marginalia).getByRole('button', { name: 'Show fewer citation previews' })).toBeInTheDocument();
  });

  it('renders pullquote blocks in read mode', async () => {
    getWikiPage.mockResolvedValueOnce({
      ...page,
      body: {
        ...page.body,
        content: [
          ...page.body.content,
          {
            type: 'pullquote',
            attrs: { attribution: 'Research memo' },
            content: [{
              type: 'paragraph',
              content: [{ type: 'text', text: 'Memory is a compounding asset.' }]
            }]
          }
        ]
      }
    });

    render(
      <MemoryRouter>
        <WikiPageReadView pageId="wiki-1" onEdit={jest.fn()} />
      </MemoryRouter>
    );

    const quote = (await screen.findByText('Memory is a compounding asset.')).closest('blockquote');
    expect(quote).toHaveClass('wiki-read-pullquote');
    expect(screen.getByText('Research memo').tagName.toLowerCase()).toBe('cite');
  });

  it('keeps standalone reader presentational even when workspace routing is canonical', async () => {
    process.env.REACT_APP_WIKI_WORKSPACE_V1 = 'true';

    render(
      <MemoryRouter>
        <WikiPageReadView pageId="wiki-1" onEdit={jest.fn()} />
      </MemoryRouter>
    );

    expect(await screen.findByRole('heading', { name: 'Enterprise AI Memory' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
  });

  it('marks the reader by page type and renders an article progress hairline', async () => {
    render(
      <MemoryRouter>
        <WikiPageReadView pageId="wiki-1" onEdit={jest.fn()} />
      </MemoryRouter>
    );

    expect(await screen.findByRole('heading', { name: 'Enterprise AI Memory' })).toBeInTheDocument();
    expect(document.querySelector('.wiki-read')).toHaveClass('wiki-read--type-overview');
    expect(document.querySelector('.wiki-read__progress span')).toBeInTheDocument();
  });

  it('keeps the mounted article visible while a new page is loading', async () => {
    let resolveNextPage;
    getWikiPage
      .mockResolvedValueOnce(page)
      .mockImplementationOnce(() => new Promise(resolve => {
        resolveNextPage = resolve;
      }));

    const { rerender } = render(
      <MemoryRouter>
        <WikiPageReadView pageId="wiki-1" onEdit={jest.fn()} />
      </MemoryRouter>
    );

    expect(await screen.findByRole('heading', { name: 'Enterprise AI Memory' })).toBeInTheDocument();

    rerender(
      <MemoryRouter>
        <WikiPageReadView pageId="wiki-2" onEdit={jest.fn()} />
      </MemoryRouter>
    );

    expect(screen.queryByText('Loading Wiki page...')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Enterprise AI Memory' })).toBeInTheDocument();
    expect(document.querySelector('.wiki-read__body')).toHaveAttribute('data-state', 'exiting');
    expect(document.querySelector('.wiki-read__body')).toHaveClass('wiki-read__body--transitioning');

    await act(async () => {
      resolveNextPage({
        ...page,
        _id: 'wiki-2',
        title: 'Systems Thinking',
        body: {
          type: 'doc',
          content: [
            { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Feedback loops' }] },
            { type: 'paragraph', content: [{ type: 'text', text: 'Systems thinking keeps the page shell mounted.' }] }
          ]
        }
      });
    });

    expect(await screen.findByRole('heading', { name: 'Systems Thinking' })).toBeInTheDocument();
    expect(screen.getByText('Systems thinking keeps the page shell mounted.')).toBeInTheDocument();
    expect(document.querySelector('.wiki-read__body')).toHaveAttribute('data-state', 'entering');
  });

  it('shows recovery actions instead of a dead page when a wiki page cannot load', async () => {
    getWikiPage.mockRejectedValueOnce(new Error('missing'));

    render(
      <MemoryRouter>
        <WikiPageReadView pageId="legacy-page-id" onEdit={jest.fn()} workspaceMode />
      </MemoryRouter>
    );

    expect(await screen.findByRole('heading', { name: 'This wiki page could not be opened.' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Open the wiki list to find the current page');
    expect(screen.getByRole('link', { name: 'Open wiki list' })).toHaveAttribute('href', '/wiki/workspace?view=list');
    expect(screen.getByRole('link', { name: 'Open knowledge map' })).toHaveAttribute('href', '/wiki/workspace?view=graph');
    expect(screen.getByRole('link', { name: 'Build a page' })).toHaveAttribute('href', '/wiki');
  });

  it('AT-46 — exposes copy and download markdown actions for a standalone page', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    URL.createObjectURL = jest.fn().mockReturnValue('blob:wiki-markdown');
    URL.revokeObjectURL = jest.fn();
    const click = jest.fn();
    const appendChild = jest.spyOn(document.body, 'appendChild');
    const createElement = jest.spyOn(document, 'createElement').mockImplementation((tagName) => {
      const element = document.createElementNS('http://www.w3.org/1999/xhtml', tagName);
      if (tagName === 'a') {
        element.click = click;
        element.remove = jest.fn();
      }
      return element;
    });

    try {
      render(
        <MemoryRouter>
          <WikiPageReadView pageId="wiki-1" onEdit={jest.fn()} />
        </MemoryRouter>
      );

      await screen.findByRole('heading', { name: 'Enterprise AI Memory' });
      fireEvent.click(screen.getByRole('button', { name: 'Copy markdown' }));
      await waitFor(() => expect(getWikiPageMarkdown).toHaveBeenCalledWith('wiki-1'));
      await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringContaining('## Core idea')));
      expect(screen.getByRole('status')).toHaveTextContent('Markdown copied.');

      fireEvent.click(screen.getByRole('button', { name: 'Download .md' }));
      await waitFor(() => expect(getWikiPageMarkdown).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:wiki-markdown'));
      expect(appendChild).toHaveBeenLastCalledWith(expect.objectContaining({
        download: 'enterprise-ai-memory.md',
        href: 'blob:wiki-markdown'
      }));
      expect(click).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('status')).toHaveTextContent('Markdown downloaded.');
    } finally {
      if (originalCreateObjectURL) URL.createObjectURL = originalCreateObjectURL;
      else delete URL.createObjectURL;
      if (originalRevokeObjectURL) URL.revokeObjectURL = originalRevokeObjectURL;
      else delete URL.revokeObjectURL;
      appendChild.mockRestore();
      createElement.mockRestore();
    }
  });

  it('updates the left contents rail as the reader scrolls through sections', async () => {
    getWikiPage.mockResolvedValueOnce({
      ...page,
      body: {
        type: 'doc',
        content: [
          { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Core idea' }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'Core section.' }] },
          { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'How it works' }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'Mechanism section.' }] },
          { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Evidence' }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'Evidence section.' }] }
        ]
      }
    });
    const originalInnerHeight = window.innerHeight;
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 900 });
    let positions = { 'core-idea': 160, 'how-it-works': 500, evidence: 900 };
    const rectSpy = jest.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function getRect() {
      if (this.classList?.contains('wiki-workspace__right-pane')) {
        return { top: 100, bottom: 700, left: 0, right: 0, width: 900, height: 600, x: 0, y: 100, toJSON: () => ({}) };
      }
      const top = positions[this.getAttribute('id')] ?? 0;
      return { top, bottom: top + 32, left: 0, right: 0, width: 0, height: 32, x: 0, y: top, toJSON: () => ({}) };
    });

    try {
      render(
        <MemoryRouter>
          <div className="wiki-workspace__right-pane">
            <WikiPageReadView pageId="wiki-1" onEdit={jest.fn()} />
          </div>
        </MemoryRouter>
      );

      expect(await screen.findByRole('link', { name: 'Core idea' })).toHaveClass('is-active');

      const pane = document.querySelector('.wiki-workspace__right-pane');
      positions = { 'core-idea': -450, 'how-it-works': 260, evidence: 640 };
      fireEvent.scroll(pane);
      await act(async () => {
        jest.advanceTimersByTime(20);
      });
      expect(screen.getByRole('link', { name: 'How it works' })).toHaveClass('is-active');

      positions = { 'core-idea': -900, 'how-it-works': -260, evidence: 250 };
      fireEvent.scroll(pane);
      await act(async () => {
        jest.advanceTimersByTime(20);
      });
      expect(screen.getByRole('link', { name: 'Evidence' })).toHaveClass('is-active');

      positions = { 'core-idea': -1200, 'how-it-works': -760, evidence: -320, 'wiki-read-references-title': 230 };
      fireEvent.scroll(pane);
      await act(async () => {
        jest.advanceTimersByTime(20);
      });
      expect(screen.getByRole('link', { name: 'References' })).toHaveClass('is-active');
    } finally {
      rectSpy.mockRestore();
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: originalInnerHeight });
    }
  });

  it('shows discussions and ask composer chrome in workspace read mode', async () => {
    getWikiPage.mockResolvedValueOnce({
      ...page,
      discussions: [{
        _id: 'discussion-1',
        question: 'What changed after review?',
        answer: {
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'The source mix changed.' }] }]
        },
        status: 'answered',
        askedAt: new Date().toISOString()
      }]
    });

    render(
      <MemoryRouter>
        <WikiPageReadView pageId="wiki-1" onEdit={jest.fn()} workspaceMode />
      </MemoryRouter>
    );

    expect(await screen.findByRole('heading', { name: 'Enterprise AI Memory' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Article' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: /Talk/ }));
    expect(await screen.findByText('What changed after review?')).toBeInTheDocument();
    expect(await screen.findByLabelText('Ask this page')).toBeInTheDocument();
    expect(screen.queryByLabelText('Ask thought partner to build a page')).not.toBeInTheDocument();
    await flushDeferredWikiReadWork();
    expect(screen.queryByLabelText('Ask thought partner to build a page')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Markdown export')).not.toBeInTheDocument();
  });

  it('opens the Talk panel from the tab query parameter', async () => {
    jest.spyOn(router, 'useLocation').mockReturnValue({
      pathname: '/wiki/workspace',
      search: '?page=wiki-1&tab=talk',
      hash: '',
      state: null,
      key: 'talk-route-test'
    });
    getWikiPage.mockResolvedValueOnce({
      ...page,
      discussions: [{
        _id: 'discussion-from-route',
        question: 'Can this answer become a page?',
        answer: {
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Yes, it can be promoted.' }] }]
        },
        status: 'answered',
        askedAt: new Date().toISOString()
      }]
    });

    render(
      <MemoryRouter>
        <WikiPageReadView pageId="wiki-1" onEdit={jest.fn()} workspaceMode />
      </MemoryRouter>
    );

    expect(await screen.findByRole('tab', { name: /Talk/ })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByText('Can this answer become a page?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save as wiki page' })).toBeInTheDocument();
  });

  it('streams ask-this-page answers in the Talk panel before final discussion hydration', async () => {
    const updatedPage = {
      ...page,
      discussions: [{
        _id: 'discussion-streamed',
        question: 'What matters?',
        answer: {
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'The streamed answer matters.' }] }]
        },
        status: 'answered',
        askedAt: new Date().toISOString()
      }]
    };
    let finishStream;
    streamAskWikiPage.mockImplementationOnce((_pageId, _question, handlers = {}) => new Promise((resolve) => {
      handlers.onDelta?.('The streamed ');
      handlers.onDelta?.('answer');
      finishStream = () => {
        handlers.onPage?.(updatedPage);
        resolve(updatedPage);
      };
    }));

    render(
      <MemoryRouter>
        <WikiPageReadView pageId="wiki-1" onEdit={jest.fn()} workspaceMode />
      </MemoryRouter>
    );

    expect(await screen.findByRole('heading', { name: 'Enterprise AI Memory' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: /Talk/ }));
    fireEvent.change(screen.getByTestId('wiki-ask-composer-input'), { target: { value: 'What matters?' } });
    fireEvent.click(screen.getByTestId('wiki-ask-composer-submit'));

    expect(await screen.findByLabelText('Streaming answer')).toHaveTextContent('The streamed answer');
    expect(streamAskWikiPage).toHaveBeenCalledWith('wiki-1', 'What matters?', expect.objectContaining({
      onDelta: expect.any(Function),
      onPage: expect.any(Function)
    }));

    await act(async () => {
      finishStream();
    });
    expect(await screen.findByText('The streamed answer matters.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Streaming answer')).not.toBeInTheDocument();
  });

  it('does not show legacy linkable page fallback in read mode when prose has no inline wiki links', async () => {
    getWikiPage.mockResolvedValueOnce({
      ...page,
      body: {
        type: 'doc',
        content: [
          { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Core idea' }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'Enterprise memory mentions Compounding interest without a mark.' }] }
        ]
      }
    });
    getWikiAutolinkSuggestions.mockResolvedValueOnce({
      scanned: 3,
      suggestions: [{
        pageId: 'wiki-related',
        title: 'Compounding interest',
        mentionCount: 1,
        snippet: 'Enterprise memory mentions Compounding interest.'
      }]
    });

    render(
      <MemoryRouter>
        <WikiPageReadView pageId="wiki-1" onEdit={jest.fn()} />
      </MemoryRouter>
    );

    expect(await screen.findByRole('heading', { name: 'Enterprise AI Memory' })).toBeInTheDocument();
    await act(async () => {
      jest.advanceTimersByTime(400);
    });

    expect(screen.queryByTestId('wiki-autolinks')).not.toBeInTheDocument();
  });

  it('keeps Talk controls and mentioned-in backlinks available when workspace v1 is active', async () => {
    delete process.env.REACT_APP_WIKI_WORKSPACE_V1;

    render(
      <MemoryRouter>
        <WikiPageReadView pageId="wiki-1" onEdit={jest.fn()} workspaceMode />
      </MemoryRouter>
    );

    expect(await screen.findByRole('heading', { name: 'Enterprise AI Memory' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Article' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Talk' })).toBeInTheDocument();
    expect(screen.queryByText('Claim health')).not.toBeInTheDocument();
    expect(await screen.findByText('Mentioned in')).toBeInTheDocument();
    expect(screen.getByText('Adjacent Memory')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Compounding interest' })).toHaveAttribute('href', '/wiki/workspace?page=wiki-related');
  });

  it('renders structured infobox rows for each supported read-mode page type', async () => {
    const cases = [
      ['entity', { metadata: { role: 'Research lab', born: 'Q1 2024' } }, ['Role', 'Research lab', 'Born', 'Q1 2024']],
      ['concept', { metadata: { definition: 'Durable knowledge from repeated review.', firstSeen: '2024-02-01' } }, ['Definition', 'Durable knowledge from repeated review.', 'First seen']],
      ['source', { metadata: { author: 'Ada Lovelace', url: 'https://example.com/source', takeaways: ['Keep citations close'] } }, ['Author', 'Ada Lovelace', 'URL', 'https://example.com/source', 'Takeaways']],
      ['question', { discussions: [{ _id: 'd1', question: 'Why?', answer: emptyAnswer(), status: 'answered' }] }, ['Question', 'Enterprise AI Memory', 'Answered', '1 discussion']],
      ['overview', { metadata: { scope: 'Workspace-wide memory system' } }, ['Scope', 'Workspace-wide memory system', 'Sections']],
      ['topic', { metadata: { summary: 'A broad research topic.' } }, ['Kind', 'Topic', 'Summary', 'A broad research topic.']]
    ];

    for (const [pageType, overrides, expectedText] of cases) {
      getWikiPage.mockResolvedValueOnce({ ...page, ...overrides, pageType });
      const { unmount } = render(
        <MemoryRouter>
          <WikiPageReadView pageId={`wiki-${pageType}`} onEdit={jest.fn()} />
        </MemoryRouter>
      );

      const rail = await screen.findByRole('complementary', { name: 'Page context' });
      // AT-22: rail starts collapsed by default — open it before asserting on infobox content.
      await flushDeferredWikiReadWork();
      const showContext = within(rail).queryByRole('button', { name: /show context/i });
      if (showContext) {
        await act(async () => { fireEvent.click(showContext); });
      }
      expectedText.forEach(text => expect(rail).toHaveTextContent(text));
      unmount();
    }
  });

  it('caps the right-rail scope summary instead of dumping the whole lead paragraph', async () => {
    const longLead = 'Investing is the disciplined allocation of capital to assets that are expected to generate cash flows exceeding their purchase price over a horizon that matches the investor time preference while navigating behavioral pressure and market uncertainty.';
    getWikiPage.mockResolvedValueOnce({
      ...page,
      pageType: 'overview',
      metadata: {},
      body: {
        type: 'doc',
        content: [{
          type: 'paragraph',
          content: [{ type: 'text', text: longLead }]
        }]
      }
    });

    render(
      <MemoryRouter>
        <WikiPageReadView pageId="wiki-summary-cap" onEdit={jest.fn()} />
      </MemoryRouter>
    );

    const rail = await screen.findByRole('complementary', { name: 'Page context' });
    await flushDeferredWikiReadWork();
    const showContext = within(rail).queryByRole('button', { name: /show context/i });
    if (showContext) {
      await act(async () => { fireEvent.click(showContext); });
    }

    expect(rail).toHaveTextContent('No explicit scope yet.');
    expect(rail).not.toHaveTextContent('Investing is the disciplined allocation of capital');
    expect(rail).not.toHaveTextContent('while navigating behavioral pressure and market uncertainty');
  });

  it('renders infobox numeric counts on load and live source or claim count changes', async () => {
    const { rerender } = render(
      <MemoryRouter>
        <WikiPageReadView pageId="wiki-1" onEdit={jest.fn()} />
      </MemoryRouter>
    );

    const rail = await screen.findByRole('complementary', { name: 'Page context' });
    await flushDeferredWikiReadWork();
    await act(async () => {
      fireEvent.click(within(rail).getByRole('button', { name: /show context/i }));
    });

    const sourceValue = () => rail.querySelector('[data-infobox-row="sources"] dd');
    const claimValue = () => rail.querySelector('[data-infobox-row="claims"] dd');
    expect(sourceValue()).toHaveTextContent('2');
    expect(claimValue()).toHaveTextContent('3');

    getWikiPage.mockResolvedValueOnce({
      ...page,
      title: 'Enterprise AI Memory refreshed',
      sourceRefs: [
        ...page.sourceRefs,
        { _id: 'source-3', title: 'Fresh source', snippet: 'New source evidence.' }
      ],
      claims: [
        ...page.claims,
        { claimId: 'claim-4', text: 'Fresh claim.', support: 'partial' }
      ]
    });

    rerender(
      <MemoryRouter>
        <WikiPageReadView pageId="wiki-1" onEdit={jest.fn()} refreshNonce={1} />
      </MemoryRouter>
    );
    await waitFor(() => expect(getWikiPage).toHaveBeenCalledTimes(2));
    await screen.findByRole('heading', { name: 'Enterprise AI Memory refreshed' });

    expect(sourceValue().querySelector('[data-animated-number="true"]')).toHaveClass('is-counting');
    expect(claimValue().querySelector('[data-animated-number="true"]')).toHaveClass('is-counting');

    await act(async () => {
      jest.advanceTimersByTime(400);
    });

    expect(sourceValue()).toHaveTextContent('3');
    expect(claimValue()).toHaveTextContent('4');
    expect(sourceValue().querySelector('[data-animated-number="true"]')).not.toHaveClass('is-counting');
  });

  it('uses plainText as the word-count fallback when the body payload is not renderable', async () => {
    window.localStorage.setItem('noeis.wiki.read.rail_collapsed', '0');
    getWikiPage.mockResolvedValueOnce({
      ...page,
      body: null,
      plainText: 'One two three four five six.',
      sourceRefs: [],
      claims: []
    });

    render(
      <MemoryRouter>
        <WikiPageReadView pageId="wiki-plain-text" onEdit={jest.fn()} />
      </MemoryRouter>
    );

    const rail = await screen.findByRole('complementary', { name: 'Page context' });
    await flushDeferredWikiReadWork();
    await act(async () => {
      jest.advanceTimersByTime(820);
    });
    const words = rail.querySelector('[data-infobox-row="words"] dd');
    expect(words).toHaveTextContent('6');
  });

  it('AT-22 — defaults the page-context rail to collapsed and toggles via Show/Hide', async () => {
    render(
      <MemoryRouter>
        <WikiPageReadView pageId="wiki-1" onEdit={jest.fn()} />
      </MemoryRouter>
    );

    const rail = await screen.findByRole('complementary', { name: 'Page context' });
    expect(rail).toHaveClass('wiki-read__rail--collapsed');
    expect(within(rail).getByRole('button', { name: /show context/i })).toHaveAttribute('aria-expanded', 'false');
    // Collapsed: infobox content is not in the DOM.
    expect(rail.querySelector('.wiki-read__infobox')).not.toBeInTheDocument();

    await flushDeferredWikiReadWork();
    await act(async () => { fireEvent.click(within(rail).getByRole('button', { name: /show context/i })); });
    expect(rail).not.toHaveClass('wiki-read__rail--collapsed');
    expect(rail.querySelector('.wiki-read__infobox')).toBeInTheDocument();
    const hideButton = within(rail).getByRole('button', { name: /hide/i });
    expect(hideButton).toHaveAttribute('aria-expanded', 'true');
    expect(hideButton).toHaveTextContent('›');
    expect(window.localStorage.getItem('noeis.wiki.read.rail_collapsed')).toBe('0');

    await act(async () => { fireEvent.click(within(rail).getByRole('button', { name: /hide/i })); });
    expect(rail).toHaveClass('wiki-read__rail--collapsed');
    expect(window.localStorage.getItem('noeis.wiki.read.rail_collapsed')).toBe('1');
  });

  it('AT-249 — opens a previously expanded context rail even when idle callbacks never fire', async () => {
    const originalRequestAnimationFrame = window.requestAnimationFrame;
    const originalCancelAnimationFrame = window.cancelAnimationFrame;
    const originalRequestIdleCallback = window.requestIdleCallback;
    const originalCancelIdleCallback = window.cancelIdleCallback;
    window.localStorage.setItem('noeis.wiki.read.rail_collapsed', '0');
    window.requestAnimationFrame = jest.fn(() => 1);
    window.cancelAnimationFrame = jest.fn();
    window.requestIdleCallback = jest.fn(() => 1);
    window.cancelIdleCallback = jest.fn();

    try {
      render(
        <MemoryRouter>
          <WikiPageReadView pageId="wiki-1" onEdit={jest.fn()} />
        </MemoryRouter>
      );

      expect(await screen.findByRole('heading', { name: 'Enterprise AI Memory' })).toBeInTheDocument();
      const rail = await screen.findByRole('complementary', { name: 'Page context' });
      expect(rail).not.toHaveClass('wiki-read__rail--collapsed');
      expect(within(rail).getByRole('status')).toHaveTextContent(/loading context/i);

      await act(async () => {
        jest.advanceTimersByTime(3000);
      });

      expect(within(rail).queryByRole('status')).not.toBeInTheDocument();
      expect(rail.querySelector('.wiki-read__infobox')).toBeInTheDocument();
      expect(rail).toHaveTextContent('Overview');
    } finally {
      window.requestAnimationFrame = originalRequestAnimationFrame;
      window.cancelAnimationFrame = originalCancelAnimationFrame;
      window.requestIdleCallback = originalRequestIdleCallback;
      window.cancelIdleCallback = originalCancelIdleCallback;
    }
  });

  it('AT-19 — renders the article before the since-last-visit banner mounts', async () => {
    window.localStorage.setItem('noeis.wiki.visit.wiki-1', JSON.stringify({
      lastViewedAt: new Date(Date.now() - 60_000).toISOString(),
      claimSnapshot: [],
      ledgerSnapshot: []
    }));

    render(
      <MemoryRouter>
        <WikiPageReadView pageId="wiki-1" onEdit={jest.fn()} />
      </MemoryRouter>
    );

    expect(await screen.findByRole('heading', { name: 'Enterprise AI Memory' })).toBeInTheDocument();
    expect(screen.getByText('Memory compounds with review.')).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: 'Changes since your last visit' })).not.toBeInTheDocument();

    await flushDeferredWikiReadWork();

    expect(screen.getByRole('status', { name: 'Changes since your last visit' })).toHaveTextContent('1 new claim');
  });

  it('keeps pending signal state out of the page-level ambient presence', async () => {
    getWikiPage.mockResolvedValueOnce({
      ...page,
      aiState: {
        ...page.aiState,
        health: {
          ...page.aiState.health,
          unsupportedClaims: [{ text: 'Maintenance generated a claim without usable evidence.' }],
          missingCitations: [{ text: 'One paragraph has no citation.' }]
        }
      }
    });

    render(
      <MemoryRouter>
        <WikiPageReadView pageId="wiki-1" onEdit={jest.fn()} />
      </MemoryRouter>
    );

    const presenceRail = await screen.findByRole('complementary', { name: 'Page context' });
    await flushDeferredWikiReadWork();
    const presenceToggle = within(presenceRail).queryByRole('button', { name: /show context/i });
    if (presenceToggle) await act(async () => { fireEvent.click(presenceToggle); });
    expect(screen.queryByRole('status', { name: 'Thought partner status' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Maintain page' })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Article' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getAllByText(/Enterprise AI Memory depends on/).length).toBeGreaterThan(0);
  });

  it('hides legacy source rail cards in read mode', async () => {
    const longSnippet = [
      'This source contains a concise front-loaded passage about memory systems and recurring review.',
      'It then keeps going with low-insight maintenance output that should not dominate the read rail.',
      'The remaining diagnostic transcript is useful only on demand and should stay behind expansion.'
    ].join(' ');
    getWikiPage.mockResolvedValueOnce({
      ...page,
      sourceRefs: [
        { _id: 'source-1', title: 'Long maintenance source', snippet: longSnippet },
        { _id: 'source-2', title: 'Agent article', summary: 'Short source summary.' }
      ],
      claims: [
        { claimId: 'claim-1', text: 'Memory compounds with review.', support: 'supported', sourceRefIds: ['source-1'] },
        { claimId: 'claim-2', text: 'Agentic memory needs sources.', support: 'partial', sourceRefIds: ['source-1'] }
      ],
      citations: [{ _id: 'citation-1', sourceRefId: 'source-1' }]
    });

    render(
      <MemoryRouter>
        <WikiPageReadView pageId="wiki-1" onEdit={jest.fn()} />
      </MemoryRouter>
    );

    const rail = await screen.findByRole('complementary', { name: 'Page context' });
    expect(rail.querySelector('.wiki-read__source-list')).not.toBeInTheDocument();
    const references = screen.getByRole('heading', { name: 'References' }).closest('section');
    expect(within(references).getByText('Long maintenance source')).toBeInTheDocument();
  });

  it('routes article and highlight references back to internal Library provenance', async () => {
    getWikiPage.mockResolvedValueOnce({
      ...page,
      sourceRefs: [
        {
          _id: 'source-article',
          type: 'article',
          objectId: 'article-1',
          title: 'Internal article',
          snippet: 'Article provenance.'
        },
        {
          _id: 'source-highlight',
          type: 'highlight',
          objectId: 'highlight-1',
          parentObjectId: 'article-1',
          title: 'Internal highlight',
          snippet: 'Highlight provenance.'
        },
        {
          _id: 'source-external',
          type: 'external',
          title: 'External source',
          url: 'https://example.com/source',
          snippet: 'External provenance.'
        }
      ]
    });

    render(
      <MemoryRouter>
        <WikiPageReadView pageId="wiki-1" onEdit={jest.fn()} />
      </MemoryRouter>
    );

    const references = (await screen.findByRole('heading', { name: 'References' })).closest('section');
    expect(within(references).getAllByRole('link', { name: 'Open in Library' })[0]).toHaveAttribute('href', '/library?articleId=article-1');
    expect(within(references).getAllByRole('link', { name: 'Open in Library' })[1]).toHaveAttribute('href', '/library?articleId=article-1&highlightId=highlight-1');
    expect(within(references).getByRole('link', { name: 'Open source' })).toHaveAttribute('href', 'https://example.com/source');
  });

  it('automatically starts one rebuild when backend quality marks the page as needing rebuild', async () => {
    const rebuiltPage = {
      ...page,
      aiState: {
        ...page.aiState,
        quality: { ok: true, status: 'pass', failures: [], rebuiltAutomatically: true }
      }
    };
    getWikiPage.mockResolvedValueOnce({
      ...page,
      aiState: {
        ...page.aiState,
        quality: {
          ok: false,
          status: 'needs_rebuild',
          failures: ['Article contains instructional scaffold.']
        }
      }
    });
    maintainWikiPage.mockResolvedValueOnce(rebuiltPage);

    render(
      <MemoryRouter>
        <WikiPageReadView pageId="wiki-1" onEdit={jest.fn()} />
      </MemoryRouter>
    );

    expect(await screen.findByRole('heading', { name: 'Enterprise AI Memory' })).toBeInTheDocument();
    await flushDeferredWikiReadWork();
    await waitFor(() => {
      expect(maintainWikiPage).toHaveBeenCalledTimes(1);
      expect(maintainWikiPage).toHaveBeenCalledWith('wiki-1');
    });
    const receipt = await screen.findByLabelText('Wiki maintenance receipt');
    expect(receipt).toHaveAttribute('data-maintenance-state', 'settled');
    await waitFor(() => {
      expect(within(receipt).getByLabelText('Wiki maintenance trace')).toHaveTextContent('page settled');
    });
    expect(receipt).toHaveTextContent('2 sources');
    expect(receipt).toHaveTextContent('3 claims');
    expect(within(receipt).getByRole('button', { name: 'Run again' })).toBeInTheDocument();
  });

  it('lets the reader run page maintenance and keeps the agent trace visible', async () => {
    const reviewedPage = {
      ...page,
      aiState: {
        ...page.aiState,
        maintenanceQualityIssues: ['Weak support for the claim.']
      },
      sourceRefs: [{ _id: 'source-1', title: 'Memory article' }, { _id: 'source-2', title: 'Second source' }],
      claims: [{ claimId: 'claim-1' }, { claimId: 'claim-2' }]
    };
    let resolveMaintenance;
    maintainWikiPage.mockImplementationOnce(() => new Promise((resolve) => {
      resolveMaintenance = resolve;
    }));
    window.matchMedia = jest.fn().mockReturnValue({ matches: true });

    render(
      <MemoryRouter>
        <WikiPageReadView pageId="wiki-1" onEdit={jest.fn()} />
      </MemoryRouter>
    );

    expect(await screen.findByRole('heading', { name: 'Enterprise AI Memory' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Run again' }));

    const receipt = await screen.findByLabelText('Wiki maintenance receipt');
    expect(receipt).toHaveTextContent('Checking this page against your corpus');
    const trace = within(receipt).getByLabelText('Wiki maintenance trace');
    await waitFor(() => {
      expect(trace).toHaveTextContent('reading sources and claims');
    });
    fireEvent.click(within(trace).getByRole('button', { name: /Expand 2 trace history lines/ }));
    expect(within(trace).getByRole('list', { name: 'Trace history' })).toHaveTextContent('checking @wiki:wiki-1');
    await act(async () => {
      resolveMaintenance(reviewedPage);
    });
    await waitFor(() => {
      expect(receipt).toHaveAttribute('data-maintenance-state', 'review');
    });
    await waitFor(() => {
      expect(within(receipt).getByLabelText('Wiki maintenance trace')).toHaveTextContent('1 issue surfaced');
    });
    expect(receipt).toHaveTextContent('2 sources');
    expect(receipt).toHaveTextContent('2 claims');
  });

  it('shows a hover preview after the PRD 250ms delay for an internal wiki link', async () => {
    getWikiPage
      .mockResolvedValueOnce(page)
      .mockResolvedValueOnce({
        _id: 'wiki-related',
        title: 'Compounding interest',
        body: {
          type: 'doc',
          content: [{
            type: 'paragraph',
            content: [{ type: 'text', text: 'Small gains compound into durable knowledge.' }]
          }]
        },
        sourceRefs: [{ _id: 'source-1' }]
      });

    render(
      <MemoryRouter>
        <WikiPageReadView pageId="wiki-1" onEdit={jest.fn()} />
      </MemoryRouter>
    );

    const link = await screen.findByRole('link', { name: 'Compounding interest' });
    fireEvent.mouseEnter(link);
    await act(async () => {
      jest.advanceTimersByTime(249);
    });
    expect(getWikiPage).toHaveBeenCalledTimes(1);

    await act(async () => {
      jest.advanceTimersByTime(1);
    });

    await waitFor(() => {
      expect(getWikiPage).toHaveBeenCalledWith('wiki-related');
      const tooltip = screen.getByRole('tooltip');
      expect(tooltip).toHaveClass('wiki-read-link-preview');
      expect(tooltip).toHaveTextContent('Small gains compound into durable knowledge.');
      expect(tooltip).toHaveTextContent('1 source');
    });
  });

  it('keeps a wiki link hover preview open during the mouseout grace period into the preview', async () => {
    getWikiPage
      .mockResolvedValueOnce(page)
      .mockResolvedValueOnce({
        _id: 'wiki-related',
        title: 'Compounding interest',
        body: {
          type: 'doc',
          content: [{
            type: 'paragraph',
            content: [{ type: 'text', text: 'Small gains compound into durable knowledge.' }]
          }]
        },
        sourceRefs: [{ _id: 'source-1' }]
      });

    render(
      <MemoryRouter>
        <WikiPageReadView pageId="wiki-1" onEdit={jest.fn()} />
      </MemoryRouter>
    );

    const link = await screen.findByRole('link', { name: 'Compounding interest' });
    fireEvent.mouseEnter(link);
    await act(async () => {
      jest.advanceTimersByTime(250);
    });
    const tooltip = await screen.findByRole('tooltip');

    fireEvent.mouseOut(link, { relatedTarget: tooltip });
    await act(async () => {
      jest.advanceTimersByTime(150);
    });
    expect(screen.getByRole('tooltip')).toHaveTextContent('Compounding interest');

    fireEvent.mouseLeave(tooltip);
    await act(async () => {
      jest.advanceTimersByTime(99);
    });
    expect(screen.getByRole('tooltip')).toBeInTheDocument();

    await act(async () => {
      jest.advanceTimersByTime(1);
    });
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('opens claim citation popovers from read-mode claim marks', async () => {
    render(
      <MemoryRouter>
        <WikiPageReadView pageId="wiki-1" onEdit={jest.fn()} />
      </MemoryRouter>
    );

    const citation = await screen.findByRole('button', { name: 'Backlink to source 1' });
    fireEvent.mouseOver(citation);

    const dialog = await screen.findByRole('dialog', { name: 'Claim citations' });
    expect(dialog).toHaveTextContent('Supported');
    expect(within(dialog).getByText('Memory article')).toBeInTheDocument();
    expect(within(dialog).getByText('Source snippet')).toBeInTheDocument();
  });

  it('renders source references and round-trips between claim footnotes and the reference list', async () => {
    render(
      <MemoryRouter>
        <WikiPageReadView pageId="wiki-1" onEdit={jest.fn()} />
      </MemoryRouter>
    );

    const citation = await screen.findByRole('button', { name: 'Backlink to source 1' });
    expect(citation).toHaveAttribute('id', 'wiki-cite-claim-1-ref-1');
    expect(citation).toHaveAttribute('data-footnote-target', 'wiki-ref-1');

    const references = screen.getByRole('heading', { name: 'References' }).closest('section');
    expect(within(references).getByText('Memory article')).toBeInTheDocument();
    expect(within(references).getByText('Source snippet')).toBeInTheDocument();

    fireEvent.click(citation);
    const ref = document.getElementById('wiki-ref-1');
    expect(ref.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
    expect(ref).toHaveClass('is-highlighted');

    fireEvent.click(within(ref).getByRole('link', { name: 'Jump back to citation 1' }));
    expect(citation.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
  });

  it('highlights a live edited paragraph and marks its table of contents section until clicked', async () => {
    const { rerender } = render(
      <MemoryRouter>
        <WikiPageReadView pageId="wiki-1" onEdit={jest.fn()} />
      </MemoryRouter>
    );
    await screen.findByRole('heading', { name: 'Core idea' });

    rerender(
      <MemoryRouter>
        <WikiPageReadView
          pageId="wiki-1"
          onEdit={jest.fn()}
          liveUpdate={{ pageId: 'wiki-1', anchorId: 'wiki-block-1' }}
        />
      </MemoryRouter>
    );
    await act(async () => {
      jest.advanceTimersByTime(20);
    });

    const paragraph = document.getElementById('wiki-block-1');
    expect(paragraph).toHaveClass('wiki-read__paragraph--recent');
    const toc = screen.getByRole('navigation', { name: 'Page sections' });
    expect(within(toc).getByLabelText('Recently updated')).toBeInTheDocument();

    fireEvent.click(within(toc).getByRole('link', { name: /Core idea/i }));
    expect(within(toc).queryByLabelText('Recently updated')).not.toBeInTheDocument();

    await act(async () => {
      jest.advanceTimersByTime(2000);
    });
    expect(paragraph).not.toHaveClass('wiki-read__paragraph--recent');
  });
});
