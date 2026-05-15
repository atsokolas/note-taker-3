import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import WikiPageReadView from './WikiPageReadView';
import { askWikiPage, getWikiAutolinkSuggestions, getWikiBacklinks, getWikiPage, maintainWikiPage, promoteWikiDiscussion } from '../../api/wiki';

jest.mock('../../api/wiki', () => ({
  askWikiPage: jest.fn(),
  getWikiAutolinkSuggestions: jest.fn(),
  getWikiBacklinks: jest.fn(),
  getWikiPage: jest.fn(),
  maintainWikiPage: jest.fn(),
  promoteWikiDiscussion: jest.fn()
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
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
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
    window.localStorage.clear();
  });

  afterEach(() => {
    jest.useRealTimers();
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
    expect(screen.getAllByText('Overview').length).toBeGreaterThan(0);
    expect(screen.getByText('2 sources')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Page sections' })).toHaveTextContent('Core idea');
    expect(screen.getByRole('navigation', { name: 'Page sections' })).toHaveTextContent('Open questions');
    expect(screen.getByRole('link', { name: 'Core idea' })).toHaveClass('is-active');
    expect(screen.getByRole('link', { name: 'Compounding interest' })).toHaveAttribute('href', '/wiki/workspace?page=wiki-related');
    expect(screen.getByRole('tab', { name: 'Article' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Talk' })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('tabpanel', { name: 'Article' })).toHaveTextContent('Enterprise AI Memory depends on');
    expect(screen.getByText('Claim health')).toBeInTheDocument();
    expect(screen.getByText('1 supported')).toBeInTheDocument();
    expect(screen.getByText('1 unsupported')).toBeInTheDocument();
    expect(screen.getByText('1 conflicted')).toBeInTheDocument();
    expect(screen.getAllByText('Sources').length).toBeGreaterThan(0);
    expect(screen.getByText('Memory article')).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: /Adjacent Memory/ })).toHaveAttribute('href', '/wiki/workspace?page=wiki-backlink');

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(onEdit).toHaveBeenCalledTimes(1);
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

  it('keeps discussions and the ask composer inside the Talk tab in read mode', async () => {
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
        <WikiPageReadView pageId="wiki-1" onEdit={jest.fn()} />
      </MemoryRouter>
    );

    expect(await screen.findByRole('tab', { name: 'Article' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByText('What changed after review?')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Ask this page')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /Talk/ }));

    expect(screen.getByRole('tab', { name: /Talk/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel', { name: /Talk/ })).toHaveTextContent('What changed after review?');
    expect(screen.getByLabelText('Ask this page')).toBeInTheDocument();
  });

  it('shows linkable page fallback in read mode when prose has no inline wiki links', async () => {
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

    const fallback = await screen.findByTestId('wiki-autolinks');
    expect(fallback).toHaveTextContent('Linkable pages here');
    expect(fallback).toHaveTextContent('Compounding interest');
    expect(within(fallback).getByRole('link', { name: /Compounding interest/ })).toHaveAttribute('href', '/wiki/workspace?page=wiki-related');
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
      expectedText.forEach(text => expect(rail).toHaveTextContent(text));
      unmount();
    }
  });

  it('surfaces non-blocking rebuild state from page API quality issues and weak claim health', async () => {
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

    const quality = await screen.findByLabelText('Wiki page quality');
    expect(quality).toHaveTextContent('Needs review');
    expect(quality).toHaveTextContent('The article is usable, but new signals or weak claims should be reviewed.');
    expect(quality).toHaveTextContent('Maintenance generated a claim without usable evidence.');
    expect(quality).toHaveTextContent('2 of 3 claims need stronger support.');
    expect(screen.getByRole('tab', { name: 'Article' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel', { name: 'Article' })).toHaveTextContent('Enterprise AI Memory depends on');
  });

  it('keeps read-mode source rail cards concise with evidence counts and collapsed long text', async () => {
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
    const sourceSection = rail.querySelector('.wiki-read__source-list');
    const sourceList = sourceSection.querySelector('ol');
    expect(sourceList).toHaveTextContent('Long maintenance source');
    expect(sourceList).toHaveTextContent('This source contains a concise front-loaded passage');
    expect(sourceList).toHaveTextContent('1 citation / 2 claims');
    const details = sourceList.querySelector('details');
    expect(details).toBeInTheDocument();
    expect(details).not.toHaveAttribute('open');
    expect(details.querySelector('summary')).toHaveTextContent('More');
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
});
