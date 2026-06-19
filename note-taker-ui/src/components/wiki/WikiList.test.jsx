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

const renderWikiList = (search = 'view=list', { compact = true } = {}) => {
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
      <WikiList compact={compact} />
    </MemoryRouter>
  );
  rerenderList = () => view.rerender(
    <MemoryRouter>
      <WikiList compact={compact} />
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
    expect(screen.getByRole('button', { name: /show pages that need quality review/i }))
      .toHaveAttribute('aria-pressed', 'true');
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

    fireEvent.click(screen.getByRole('button', { name: /show pages that need quality review/i }));

    await waitFor(() => {
      expect(listWikiPages).toHaveBeenLastCalledWith(expect.objectContaining({ quality: 'needs_review' }));
    });
  });
});
