import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import * as router from 'react-router-dom';
import WikiList from './WikiList';
import { listWikiPages } from '../../api/wiki';

jest.mock('../../api/wiki', () => ({
  createWikiPage: jest.fn(),
  deleteWikiPage: jest.fn(),
  listWikiPages: jest.fn()
}));

jest.mock('../../utils/wikiCreate', () => ({
  buildWikiCreatePayload: jest.fn(payload => payload),
  openWikiDraft: jest.fn()
}));

jest.mock('./WikiBriefing', () => function MockWikiBriefing() {
  return <div data-testid="wiki-briefing" />;
});

jest.mock('./WikiEmergingProposals', () => function MockWikiEmergingProposals() {
  return <div data-testid="wiki-emerging-proposals" />;
});

jest.mock('./WikiInbox', () => function MockWikiInbox() {
  return <div data-testid="wiki-inbox" />;
});

let mockSearchParams = new URLSearchParams('view=list');
let rerenderList = () => {};

const renderWikiList = (search = 'view=list', { compact = true, onOpenPage } = {}) => {
  mockSearchParams = new URLSearchParams(search);
  const mockSetSearchParams = jest.fn((next) => {
    mockSearchParams = typeof next === 'function'
      ? next(new URLSearchParams(mockSearchParams.toString()))
      : new URLSearchParams(next);
    rerenderList();
  });
  jest.spyOn(router, 'useSearchParams').mockImplementation(() => [mockSearchParams, mockSetSearchParams]);

  const view = render(
    <MemoryRouter>
      <WikiList compact={compact} onOpenPage={onOpenPage} />
    </MemoryRouter>
  );
  rerenderList = () => view.rerender(
    <MemoryRouter>
      <WikiList compact={compact} onOpenPage={onOpenPage} />
    </MemoryRouter>
  );
  return view;
};

describe('WikiList', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
    listWikiPages.mockResolvedValue([
      {
        _id: 'wiki-1',
        title: 'Investing - Concepts, Ideas, and Strategies',
        pageType: 'overview',
        status: 'draft',
        sourceRefs: [{ _id: 'source-1' }],
        updatedAt: '2026-05-01T12:00:00.000Z'
      }
    ]);
  });

  it('loads an unfiltered catalog for compact facet counts', async () => {
    listWikiPages.mockResolvedValueOnce([
      {
        _id: 'wiki-1',
        title: 'Investing - Concepts, Ideas, and Strategies',
        pageType: 'overview',
        status: 'draft',
        visibility: 'private',
        updatedAt: '2026-05-01T12:00:00.000Z'
      },
      {
        _id: 'wiki-2',
        title: 'Systems Thinking',
        pageType: 'concept',
        status: 'published',
        visibility: 'shared',
        qualityReview: { status: 'needs_review' },
        updatedAt: '2026-05-02T12:00:00.000Z'
      }
    ]);

    renderWikiList();

    expect(await screen.findByTestId('wiki-facet-rail')).toBeInTheDocument();
    expect(await screen.findByTestId('wiki-facet-rail-deep')).toBeInTheDocument();
    expect(await screen.findByLabelText('Wiki pages')).toHaveClass('wiki-index__list');
    await waitFor(() => {
      expect(listWikiPages).toHaveBeenCalled();
    });
    expect(screen.getByTestId('wiki-facet-all-pages')).toHaveTextContent('2');
    expect(screen.getByTestId('wiki-facet-needs-review')).toHaveTextContent('1');

    const deepRail = screen.getByTestId('wiki-facet-rail-deep');
    fireEvent.click(within(deepRail).getByRole('button', { name: 'By type' }));
    expect(within(deepRail).getByTestId('wiki-facet-type-overview')).toHaveTextContent('1');
    expect(within(deepRail).getByTestId('wiki-facet-type-concept')).toHaveTextContent('1');
    expect(screen.queryByLabelText('Page type')).not.toBeInTheDocument();
  });

  it('renders wiki rows as real page links instead of button-only cards', async () => {
    renderWikiList('view=list', { compact: false });

    const link = await screen.findByRole('link', { name: 'Open Investing - Concepts, Ideas, and Strategies' });
    expect(link).toHaveAttribute('href', '/wiki/workspace?page=wiki-1');
    expect(screen.queryByRole('button', { name: 'Open Investing - Concepts, Ideas, and Strategies' })).not.toBeInTheDocument();
  });

  it('keeps archive actions out of the list card at rest', async () => {
    renderWikiList();

    const card = await screen.findByRole('article', { name: 'Investing - Concepts, Ideas, and Strategies' });

    expect(within(card).queryByRole('button', { name: /archive investing/i })).not.toBeInTheDocument();

    fireEvent.click(within(card).getByRole('button', { name: /more actions for investing/i }));

    expect(within(card).getByRole('button', { name: /archive investing/i })).toBeInTheDocument();
  });

  it('labels source-less scaffold pages as drafts instead of implying source-backed knowledge', async () => {
    listWikiPages.mockResolvedValueOnce([
      {
        _id: 'wiki-scaffold',
        title: 'Thin Strategy',
        pageType: 'topic',
        status: 'draft',
        sourceCount: 0,
        plainText: 'Thin Strategy still needs source-backed development before it becomes useful.',
        updatedAt: '2026-05-01T12:00:00.000Z'
      }
    ]);

    renderWikiList();

    const card = await screen.findByRole('article', { name: 'Thin Strategy' });

    expect(within(card).getByText('Draft scaffold · needs sources')).toBeInTheDocument();
    expect(within(card).queryByText('0 sources')).not.toBeInTheDocument();
    expect(within(card).getByText(/still needs source-backed development/).textContent.length).toBeLessThan(130);
  });

  it('requests needs-review pages when the quality filter is enabled', async () => {
    renderWikiList('view=list&quality=needs_review');

    await waitFor(() => {
      expect(listWikiPages).toHaveBeenCalledWith(expect.objectContaining({ quality: 'needs_review' }));
    });
    expect(screen.getByTestId('wiki-facet-needs-review')).toHaveAttribute('aria-pressed', 'true');
  });

  it('renders blocked-page reasons and surface explanation in needs-review mode', async () => {
    listWikiPages.mockResolvedValueOnce([
      {
        _id: 'wiki-blocked',
        title: 'Complementary Machine Thing',
        pageType: 'topic',
        status: 'draft',
        updatedAt: '2026-05-01T12:00:00.000Z',
        qualityReview: {
          status: 'needs_review',
          severity: 'blocked',
          surfaceEligible: false,
          reasons: [{ code: 'known_qa_junk_title', message: 'Page title matches a known malformed QA fixture.' }]
        }
      }
    ]);

    renderWikiList('view=list&quality=needs_review');

    const card = await screen.findByRole('article', { name: 'Complementary Machine Thing' });

    expect(within(card).getByText('Blocked')).toBeInTheDocument();
    expect(within(card).getByText(/Hidden from Explore, public sharing, and agent retrieval/i)).toBeInTheDocument();
    expect(within(card).getByText(/known malformed QA fixture/i)).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: /open complementary machine thing/i })).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: /archive complementary machine thing/i })).toBeInTheDocument();
  });

  it('toggles the needs-review filter through the URL query param', async () => {
    renderWikiList();

    await screen.findByRole('article', { name: 'Investing - Concepts, Ideas, and Strategies' });

    fireEvent.click(screen.getByTestId('wiki-facet-needs-review'));

    await waitFor(() => {
      expect(listWikiPages).toHaveBeenLastCalledWith(expect.objectContaining({ quality: 'needs_review' }));
    });
  });

  it('filters compact list results when a type facet is selected', async () => {
    renderWikiList();

    await screen.findByRole('article', { name: 'Investing - Concepts, Ideas, and Strategies' });
    const deepRail = screen.getByTestId('wiki-facet-rail-deep');
    fireEvent.click(within(deepRail).getByRole('button', { name: 'By type' }));
    fireEvent.click(within(deepRail).getByTestId('wiki-facet-type-overview'));

    await waitFor(() => {
      expect(listWikiPages).toHaveBeenLastCalledWith(expect.objectContaining({ pageType: 'overview' }));
    });
  });

  it('searches from the facet rail in compact mode', async () => {
    renderWikiList();

    await screen.findByRole('article', { name: 'Investing - Concepts, Ideas, and Strategies' });
    fireEvent.change(screen.getByTestId('wiki-facet-search'), { target: { value: 'systems' } });

    await waitFor(() => {
      expect(listWikiPages).toHaveBeenLastCalledWith(expect.objectContaining({ q: 'systems' }));
    });
  });

  it('renders library-style row metadata with date lead, kicker, and source counts', async () => {
    listWikiPages.mockResolvedValueOnce([
      {
        _id: 'wiki-shared',
        title: 'Public Concept Page',
        pageType: 'concept',
        status: 'published',
        visibility: 'shared',
        sourceRefs: [{ _id: 'source-1' }, { _id: 'source-2' }],
        claimCount: 3,
        lastReviewedAt: '2026-04-19T12:00:00.000Z',
        updatedAt: '2026-05-01T12:00:00.000Z',
        plainText: 'A published concept with sources and claims.'
      }
    ]);

    renderWikiList();

    const row = await screen.findByRole('article', { name: 'Public Concept Page' });

    expect(row).toHaveClass('library-article-row');
    expect(within(row).getByText('May 1, 2026')).toBeInTheDocument();
    expect(within(row).getByText('Concept')).toBeInTheDocument();
    expect(within(row).getByText('Published')).toBeInTheDocument();
    expect(within(row).getByText('Shared')).toBeInTheDocument();
    expect(within(row).getByText('2 sources · 3 claims · reviewed Apr 19, 2026')).toBeInTheDocument();
  });

  it('uses library row action for More and keeps archive in the menu', async () => {
    renderWikiList();

    const row = await screen.findByRole('article', { name: 'Investing - Concepts, Ideas, and Strategies' });
    const moreButton = within(row).getByRole('button', { name: /more actions for investing/i });

    expect(moreButton).toHaveClass('library-article-row-action');
    expect(within(row).queryByRole('button', { name: /archive investing/i })).not.toBeInTheDocument();

    fireEvent.click(moreButton);

    expect(within(row).getByRole('button', { name: /archive investing/i })).toBeInTheDocument();
  });

  it('shows a brief row receipt when opening through the workspace callback', async () => {
    const onOpenPage = jest.fn();
    renderWikiList('view=list', { onOpenPage });

    const openLink = await screen.findByRole('link', { name: /open investing/i });
    fireEvent.click(openLink);

    expect(onOpenPage).toHaveBeenCalledWith('wiki-1');
    expect(screen.getByRole('status')).toHaveTextContent('Opening');
  });

  it('dedupes duplicate repo wiki rows in the compact list', async () => {
    listWikiPages.mockResolvedValueOnce([
      {
        _id: 'repo-old',
        title: 'Atsokolas/Note-Taker-3 Repo Wiki',
        pageType: 'repo',
        status: 'published',
        updatedAt: '2026-06-01T12:00:00.000Z',
        externalWatches: {
          githubRepo: {
            owner: 'atsokolas',
            repo: 'note-taker-3',
            status: 'active',
            lastCheckedAt: '2026-06-02T12:00:00.000Z'
          }
        }
      },
      {
        _id: 'repo-new',
        title: 'Atsokolas/Note-Taker-3 Repo Wiki',
        pageType: 'repo',
        status: 'published',
        updatedAt: '2026-07-09T12:00:00.000Z',
        externalWatches: {
          githubRepo: {
            owner: 'atsokolas',
            repo: 'note-taker-3',
            status: 'active',
            lastCheckedAt: '2026-07-09T08:00:00.000Z'
          }
        }
      },
      {
        _id: 'wiki-topic',
        title: 'Margin of Safety',
        pageType: 'topic',
        status: 'published',
        updatedAt: '2026-06-10T12:00:00.000Z'
      }
    ]);

    renderWikiList();

    expect(await screen.findByRole('article', { name: 'note-taker-3 — repo wiki' }))
      .toBeInTheDocument();
    expect(screen.getAllByRole('article', { name: 'note-taker-3 — repo wiki' })).toHaveLength(1);
    expect(screen.getByRole('article', { name: 'Margin of Safety' })).toBeInTheDocument();
    expect(screen.getByTestId('wiki-facet-all-pages')).toHaveTextContent('2');
  });
});
