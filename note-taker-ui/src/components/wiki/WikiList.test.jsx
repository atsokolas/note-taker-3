import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
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

describe('WikiList', () => {
  beforeEach(() => {
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
    render(
      <MemoryRouter>
        <WikiList />
      </MemoryRouter>
    );

    const link = await screen.findByRole('link', { name: 'Open Investing - Concepts, Ideas, and Strategies' });
    expect(link).toHaveAttribute('href', '/wiki/workspace?page=wiki-1');
    expect(screen.queryByRole('button', { name: 'Open Investing - Concepts, Ideas, and Strategies' })).not.toBeInTheDocument();
  });

  it('keeps archive actions out of the list card at rest', async () => {
    render(
      <MemoryRouter>
        <WikiList compact />
      </MemoryRouter>
    );

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

    render(
      <MemoryRouter>
        <WikiList compact />
      </MemoryRouter>
    );

    const card = await screen.findByRole('article', { name: 'Thin Strategy' });

    expect(within(card).getByText('Draft scaffold · needs sources')).toBeInTheDocument();
    expect(within(card).queryByText('0 sources')).not.toBeInTheDocument();
    expect(within(card).getByText(/still needs source-backed development/).textContent.length).toBeLessThan(130);
  });
});
