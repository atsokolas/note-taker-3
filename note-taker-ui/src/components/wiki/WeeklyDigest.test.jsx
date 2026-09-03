import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { act, render, screen } from '@testing-library/react';
import WeeklyDigest from './WeeklyDigest';
import { getWeeklyMovements } from '../../api/knowledgeMovements';
import { getWikiBriefing, listWikiPages, listWikiSourceEvents } from '../../api/wiki';
import { getArticles } from '../../api/articles';

jest.mock('../../api/wiki', () => ({
  getWikiBriefing: jest.fn(), listWikiPages: jest.fn(), listWikiSourceEvents: jest.fn()
}));
jest.mock('../../api/articles', () => ({ getArticles: jest.fn() }));

jest.mock('../../api/knowledgeMovements', () => ({
  getWeeklyMovements: jest.fn()
}));

const renderDigest = async () => {
  let view;
  await act(async () => {
    view = render(<MemoryRouter><WeeklyDigest /></MemoryRouter>);
    await Promise.resolve();
  });
  return view;
};

beforeEach(() => {
  jest.clearAllMocks();
  getWikiBriefing.mockResolvedValue({ consequentialReturn: null });
  listWikiPages.mockResolvedValue([]);
  listWikiSourceEvents.mockResolvedValue([]);
  getArticles.mockResolvedValue([]);
});

const acceptedReturn = {
  id: 'receipt-1', label: 'Judgment reviewed', title: 'Costco',
  summary: 'You kept the judgment after reviewing the new filing.',
  href: '/judgment/6a63fee69c9bc637c19109c6', linkLabel: 'See the decision'
};

test.each(['quiet', 'failed'])('accepted consequence survives a %s movement feed', async state => {
  getWikiBriefing.mockResolvedValue({ consequentialReturn: acceptedReturn });
  if (state === 'failed') getWeeklyMovements.mockRejectedValue(new Error('offline'));
  else getWeeklyMovements.mockResolvedValue({ quiet: true, groups: [] });
  await renderDigest();
  expect(getWikiBriefing).toHaveBeenCalledWith({ windowDays: 7 });
  expect(screen.getByRole('article', { name: 'Judgment reviewed' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'See the decision' })).toHaveAttribute('href', acceptedReturn.href);
  expect(screen.queryByText('Nothing has needed you this week.')).not.toBeInTheDocument();
});

test('failed receipt lookup does not manufacture a consequence', async () => {
  getWikiBriefing.mockRejectedValue(new Error('offline'));
  getWeeklyMovements.mockResolvedValue({ quiet: true, groups: [] });
  const { container } = await renderDigest();
  expect(container.firstChild).toBeNull();
});

test('a quiet week renders nothing at all — an empty room on a full page is noise', async () => {
  getWeeklyMovements.mockResolvedValue({
    weekStart: '2026-08-15T00:00:00.000Z',
    weekEnd: '2026-08-22T00:00:00.000Z',
    totals: {},
    total: 0,
    groups: [],
    quiet: true
  });
  const { container } = await renderDigest();
  expect(container.firstChild).toBeNull();
});

test('the week renders grouped by the page it happened to', async () => {
  getWeeklyMovements.mockResolvedValue({
    weekStart: '2026-08-15T00:00:00.000Z',
    weekEnd: '2026-08-22T00:00:00.000Z',
    totals: { contradiction: 1, new_evidence: 1 },
    total: 2,
    quiet: false,
    groups: [
      {
        subject: { type: 'wiki_page', id: 'p1', title: 'Nvidia dossier', href: '/wiki/workspace?page=p1' },
        items: [
          { kind: 'contradiction', label: 'contradiction', title: 'A filing contradicted the margin claim.', whyItMatters: '', occurredAt: '2026-08-21T06:00:00.000Z', href: '/think?tab=concepts' },
          { kind: 'new_evidence', label: 'new evidence', title: 'Transcript supports the pricing claim.', whyItMatters: '', occurredAt: '2026-08-20T10:00:00.000Z', href: '/wiki/workspace?page=p1&claimId=c1' }
        ],
        worstMateriality: 'critical',
        lastOccurredAt: '2026-08-21T06:00:00.000Z'
      }
    ]
  });
  await renderDigest();

  expect(await screen.findByRole('heading', { name: 'The weekend' })).toBeInTheDocument();
  expect(screen.getByText('Nvidia dossier')).toBeInTheDocument();
  expect(screen.getByText('A filing contradicted the margin claim.')).toBeInTheDocument();
  expect(screen.getByText('Transcript supports the pricing claim.')).toBeInTheDocument();
  // The range is formatted in the viewer's timezone, so the expectation is
  // computed the same way rather than pinned to UTC strings.
  const expectedRange = [
    new Date('2026-08-15T00:00:00.000Z').toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    new Date('2026-08-22T00:00:00.000Z').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  ].join(' – ');
  expect(screen.getByText(expectedRange)).toBeInTheDocument();
  const pageLink = screen.getAllByRole('link', { name: 'Nvidia dossier' })[0];
  expect(pageLink).toHaveAttribute('href', '/wiki/workspace?page=p1');
});

test('a failed check renders nothing rather than an error room', async () => {
  getWeeklyMovements.mockRejectedValue(new Error('down'));
  const { container } = await renderDigest();
  expect(container.firstChild).toBeNull();
});
