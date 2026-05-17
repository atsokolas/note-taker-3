import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import WikiPageReadView from './WikiPageReadView';
import {
  askWikiPage,
  createWikiPage,
  getWikiAutolinkSuggestions,
  getWikiBacklinks,
  getWikiPage,
  maintainWikiPage,
  promoteWikiDiscussion,
  streamMaintainWikiPage
} from '../../api/wiki';

jest.mock('../../api/wiki', () => ({
  askWikiPage: jest.fn(),
  createWikiPage: jest.fn(),
  getWikiAutolinkSuggestions: jest.fn(),
  getWikiBacklinks: jest.fn(),
  getWikiPage: jest.fn(),
  maintainWikiPage: jest.fn(),
  promoteWikiDiscussion: jest.fn(),
  streamMaintainWikiPage: jest.fn()
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
    maintainWikiPage.mockResolvedValue(page);
    askWikiPage.mockResolvedValue(page);
    createWikiPage.mockResolvedValue({ _id: 'wiki-new', title: 'Portfolio Concentration' });
    streamMaintainWikiPage.mockResolvedValue({ _id: 'wiki-new', title: 'Portfolio Concentration' });
    window.HTMLElement.prototype.scrollIntoView = jest.fn();
    window.matchMedia = jest.fn().mockReturnValue({ matches: false });
    window.localStorage.clear();
  });

  afterEach(() => {
    jest.useRealTimers();
    if (originalWorkspaceFlag === undefined) delete process.env.REACT_APP_WIKI_WORKSPACE_V1;
    else process.env.REACT_APP_WIKI_WORKSPACE_V1 = originalWorkspaceFlag;
    window.HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
    window.matchMedia = originalMatchMedia;
  });

  it('opens a wiki page as an article with no editor input until edit is requested', async () => {
    const onEdit = jest.fn();
    render(
      <MemoryRouter>
        <WikiPageReadView pageId="wiki-1" onEdit={onEdit} />
      </MemoryRouter>
    );

    expect(await screen.findByRole('heading', { name: 'Enterprise AI Memory' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Wiki page title')).not.toBeInTheDocument();
    expect(screen.queryByTestId('wiki-editor-content')).not.toBeInTheDocument();
    expect(document.querySelector('[contenteditable="true"]')).not.toBeInTheDocument();
    // AT-22: rail starts collapsed; expand it so the infobox (which renders the page-type header) is in the DOM.
    const railEl = await screen.findByRole('complementary', { name: 'Page context' });
    const showContextBtn = within(railEl).queryByRole('button', { name: /show context/i });
    if (showContextBtn) await act(async () => { fireEvent.click(showContextBtn); });
    expect(screen.getAllByText('Overview').length).toBeGreaterThan(0);
    expect(screen.getByRole('navigation', { name: 'Page sections' })).toHaveTextContent('Core idea');
    expect(screen.getByRole('navigation', { name: 'Page sections' })).toHaveTextContent('Open questions');
    expect(screen.getByRole('link', { name: 'Core idea' })).toHaveClass('is-active');
    expect(screen.getByRole('link', { name: 'Compounding interest' })).toHaveAttribute('href', '/wiki/wiki-related');
    expect(screen.queryByRole('tab', { name: 'Article' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Talk' })).not.toBeInTheDocument();
    expect(screen.queryByText('Claim health')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'References' })).toBeInTheDocument();
    expect(screen.getByText('Memory article')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Enterprise AI Memory' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it('redirects the standalone reader into the workspace when workspace is canonical', async () => {
    process.env.REACT_APP_WIKI_WORKSPACE_V1 = 'true';

    render(
      <MemoryRouter>
        <WikiPageReadView pageId="wiki-1" onEdit={jest.fn()} />
      </MemoryRouter>
    );

    expect(await screen.findByText('Opening Wiki workspace...')).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Article' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
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
    let positions = { 'core-idea': 80, 'how-it-works': 500, evidence: 900 };
    const rectSpy = jest.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function getRect() {
      const top = positions[this.getAttribute('id')] ?? 0;
      return { top, bottom: top + 32, left: 0, right: 0, width: 0, height: 32, x: 0, y: top, toJSON: () => ({}) };
    });

    try {
      render(
        <MemoryRouter>
          <WikiPageReadView pageId="wiki-1" onEdit={jest.fn()} />
        </MemoryRouter>
      );

      expect(await screen.findByRole('link', { name: 'Core idea' })).toHaveClass('is-active');

      positions = { 'core-idea': -450, 'how-it-works': 220, evidence: 640 };
      fireEvent.scroll(window);
      await act(async () => {
        jest.advanceTimersByTime(20);
      });
      expect(screen.getByRole('link', { name: 'How it works' })).toHaveClass('is-active');

      positions = { 'core-idea': -900, 'how-it-works': -260, evidence: 210 };
      fireEvent.scroll(window);
      await act(async () => {
        jest.advanceTimersByTime(20);
      });
      expect(screen.getByRole('link', { name: 'Evidence' })).toHaveClass('is-active');
    } finally {
      rectSpy.mockRestore();
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: originalInnerHeight });
    }
  });

  it('hides legacy discussions and ask composer chrome in read mode', async () => {
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
    expect(screen.queryByRole('tab', { name: 'Article' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /Talk/ })).not.toBeInTheDocument();
    expect(screen.queryByText('What changed after review?')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Ask this page')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Ask the wiki agent to build a page')).toBeInTheDocument();
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

  it('hides legacy Talk controls and utility rail cards when workspace v1 is active', async () => {
    delete process.env.REACT_APP_WIKI_WORKSPACE_V1;

    render(
      <MemoryRouter>
        <WikiPageReadView pageId="wiki-1" onEdit={jest.fn()} workspaceMode />
      </MemoryRouter>
    );

    expect(await screen.findByRole('heading', { name: 'Enterprise AI Memory' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Article' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Talk' })).not.toBeInTheDocument();
    expect(screen.queryByText('Claim health')).not.toBeInTheDocument();
    expect(screen.queryByText('Mentioned in')).not.toBeInTheDocument();
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
      const showContext = within(rail).queryByRole('button', { name: /show context/i });
      if (showContext) {
        await act(async () => { fireEvent.click(showContext); });
      }
      expectedText.forEach(text => expect(rail).toHaveTextContent(text));
      unmount();
    }
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

    await act(async () => { fireEvent.click(within(rail).getByRole('button', { name: /show context/i })); });
    expect(rail).not.toHaveClass('wiki-read__rail--collapsed');
    expect(rail.querySelector('.wiki-read__infobox')).toBeInTheDocument();
    expect(within(rail).getByRole('button', { name: /hide/i })).toHaveAttribute('aria-expanded', 'true');
    expect(window.localStorage.getItem('noeis.wiki.read.rail_collapsed')).toBe('0');

    await act(async () => { fireEvent.click(within(rail).getByRole('button', { name: /hide/i })); });
    expect(rail).toHaveClass('wiki-read__rail--collapsed');
    expect(window.localStorage.getItem('noeis.wiki.read.rail_collapsed')).toBe('1');
  });

  it('surfaces pending signal state from page API quality issues and weak claim health', async () => {
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

    // AT-22: rail starts collapsed; expand it so WikiAgentPresence (and its 'Agent status' role) is in the DOM.
    const presenceRail = await screen.findByRole('complementary', { name: 'Page context' });
    const presenceToggle = within(presenceRail).queryByRole('button', { name: /show context/i });
    if (presenceToggle) await act(async () => { fireEvent.click(presenceToggle); });
    const status = await screen.findByRole('status', { name: 'Agent status' });
    expect(status).toHaveTextContent('2 signals pending review');
    expect(status).toHaveTextContent('New material may affect this page.');
    expect(screen.queryByRole('tab', { name: 'Article' })).not.toBeInTheDocument();
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
    await waitFor(() => {
      expect(maintainWikiPage).toHaveBeenCalledTimes(1);
      expect(maintainWikiPage).toHaveBeenCalledWith('wiki-1');
    });
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
      expect(screen.getByRole('tooltip')).toHaveTextContent('Small gains compound into durable knowledge.');
      expect(screen.getByRole('tooltip')).toHaveTextContent('1 source');
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
});
