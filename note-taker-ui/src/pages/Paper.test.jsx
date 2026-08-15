import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import Paper from './Paper';
import {
  dismissReadingLoopThread,
  getReadingLoop,
  refreshReadingLoopConnection,
  runReadingLoopMechanic
} from '../api/readingLoop';
import { recordClaimCheckIn } from '../api/dailyLoop';

jest.mock('../api/readingLoop', () => ({
  getReadingLoop: jest.fn(),
  runReadingLoopMechanic: jest.fn(),
  refreshReadingLoopConnection: jest.fn(),
  dismissReadingLoopThread: jest.fn()
}));

jest.mock('../api/dailyLoop', () => ({
  recordClaimCheckIn: jest.fn()
}));

jest.mock('../api/questions', () => ({
  updateQuestion: jest.fn()
}));

jest.mock('../api/wiki', () => ({
  createWikiPage: jest.fn()
}));

const idleMechanic = (kind) => ({
  kind,
  status: 'idle',
  reason: '',
  card: null,
  generatedAt: null,
  runsUsedToday: 0,
  dailyRunCap: 4
});

const connectionCard = {
  kind: 'connection',
  relation: 'fills_gap',
  relationLabel: 'fills a gap in',
  lines: [
    'The January piece said grading rubrics decay but could not say why.',
    'Tuesday gives the mechanism: judge models drift toward their own priors.'
  ],
  recent: {
    type: 'article',
    id: 'r1',
    title: 'Anthropic eval harness paper',
    at: '2026-08-11T00:00:00.000Z',
    href: '/articles/r1',
    quote: 'The judge model drifts toward its own priors.'
  },
  dormant: {
    type: 'article',
    id: 'd1',
    title: 'Measuring What Matters',
    at: '2026-01-14T00:00:00.000Z',
    href: '/articles/d1',
    quote: 'Rubrics decay, and we do not know the mechanism.'
  },
  pairKey: 'article:d1|article:r1',
  generatedAt: '2026-08-13T00:00:00.000Z'
};

const baseEdition = (overrides = {}) => ({
  generatedAt: '2026-08-13T12:00:00.000Z',
  coldStart: null,
  connection: { ...idleMechanic('connection'), status: 'ready', card: connectionCard, generatedAt: '2026-08-13T00:00:00.000Z' },
  collision: idleMechanic('collision'),
  resolution: idleMechanic('resolution'),
  convergence: idleMechanic('convergence'),
  thread: idleMechanic('thread'),
  ...overrides
});

const renderPaper = () => render(<MemoryRouter><Paper /></MemoryRouter>);

beforeEach(() => {
  jest.clearAllMocks();
});

test('the lead names both ends, dates them, and quotes them', async () => {
  getReadingLoop.mockResolvedValue({ edition: baseEdition(), connectionRefreshing: false });
  renderPaper();

  expect(await screen.findByText('Anthropic eval harness paper')).toBeInTheDocument();
  expect(screen.getByText('Measuring What Matters')).toBeInTheDocument();
  expect(screen.getByText('The judge model drifts toward its own priors.')).toBeInTheDocument();
  expect(screen.getByText('Rubrics decay, and we do not know the mechanism.')).toBeInTheDocument();
  expect(screen.getByText(/said grading rubrics decay but could not say why/)).toBeInTheDocument();
  expect(screen.getAllByText(/^You read/).length).toBeGreaterThan(0);
  expect(screen.getAllByText(/^From your library/).length).toBeGreaterThan(0);
  // Both ends carry a date — an undated pairing is not a discovery. Asserted
  // structurally rather than on the rendered string, which is relative to now
  // and would rot the day after it was written.
  expect(document.querySelectorAll('.paper__end-date').length).toBeGreaterThanOrEqual(2);
});

test('the lead renders without any user action, and the four sections do not', async () => {
  getReadingLoop.mockResolvedValue({ edition: baseEdition(), connectionRefreshing: false });
  renderPaper();

  await screen.findByText('Anthropic eval harness paper');
  expect(runReadingLoopMechanic).not.toHaveBeenCalled();
  expect(screen.getAllByRole('button', { name: /^run$/i })).toHaveLength(4);
  expect(screen.getAllByText(/not run yet/)).toHaveLength(4);
});

test('an empty week says so plainly instead of showing a card', async () => {
  getReadingLoop.mockResolvedValue({
    edition: baseEdition({
      connection: {
        ...idleMechanic('connection'),
        status: 'empty',
        reason: 'Nothing worth connecting yet.',
        generatedAt: '2026-08-13T00:00:00.000Z'
      }
    }),
    connectionRefreshing: false
  });
  renderPaper();

  expect(await screen.findByRole('heading', { name: 'Nothing worth connecting yet.' })).toBeInTheDocument();
  expect(screen.queryByText('Anthropic eval harness paper')).not.toBeInTheDocument();
  expect(screen.queryByRole('blockquote')).not.toBeInTheDocument();
});

test('a cold-start corpus is told the truth and offered somewhere to go', async () => {
  getReadingLoop.mockResolvedValue({
    edition: baseEdition({
      coldStart: {
        oldestAt: '2026-07-01T00:00:00.000Z',
        readyAt: '2026-10-29T00:00:00.000Z',
        reason: 'The loop needs four months of library behind it before a dormant connection means anything.'
      }
    }),
    connectionRefreshing: false
  });
  renderPaper();

  expect(await screen.findByText(/The loop isn’t running yet/)).toBeInTheDocument();
  expect(screen.getByText(/needs four months of library/)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /open your library/i })).toBeInTheDocument();
  // Running a mechanic against a corpus too young to produce one is not offered.
  screen.getAllByRole('button', { name: /^run$/i }).forEach(button => {
    expect(button).toBeDisabled();
  });
});

test('running a mechanic surfaces its card', async () => {
  getReadingLoop.mockResolvedValue({ edition: baseEdition(), connectionRefreshing: false });
  runReadingLoopMechanic.mockResolvedValue({
    kind: 'collision',
    status: 'ready',
    reason: '',
    generatedAt: '2026-08-13T12:00:00.000Z',
    runsUsedToday: 1,
    dailyRunCap: 4,
    card: {
      ...connectionCard,
      kind: 'collision',
      relation: 'contradicts',
      dormant: { ...connectionCard.dormant, type: 'claim', title: 'Retrieval', quote: 'Large context windows make retrieval unnecessary.' },
      claim: { pageId: 'p1', claimId: 'c1', pageTitle: 'Retrieval', text: 'Large context windows make retrieval unnecessary.', sourceCount: 2, href: '/wiki/workspace?page=p1&claimId=c1' }
    }
  });
  renderPaper();

  await screen.findByText('Anthropic eval harness paper');
  fireEvent.click(screen.getAllByRole('button', { name: /^run$/i })[0]);

  await waitFor(() => expect(runReadingLoopMechanic).toHaveBeenCalledWith('collision'));
  expect(await screen.findByText('Large context windows make retrieval unnecessary.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /still hold/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /retire/i })).toBeInTheDocument();
});

test('a collision writes through the existing claim check-in', async () => {
  getReadingLoop.mockResolvedValue({
    edition: baseEdition({
      collision: {
        kind: 'collision',
        status: 'ready',
        reason: '',
        generatedAt: '2026-08-13T12:00:00.000Z',
        runsUsedToday: 1,
        dailyRunCap: 4,
        card: {
          ...connectionCard,
          kind: 'collision',
          claim: { pageId: 'p1', claimId: 'c1', pageTitle: 'Retrieval', text: 'A claim', sourceCount: 2, href: '/wiki/workspace?page=p1&claimId=c1' }
        }
      }
    }),
    connectionRefreshing: false
  });
  recordClaimCheckIn.mockResolvedValue({ acknowledgment: 'reaffirmed · 3rd time · held 212 days' });
  renderPaper();

  fireEvent.click(await screen.findByRole('button', { name: /still hold/i }));

  await waitFor(() => expect(recordClaimCheckIn).toHaveBeenCalledWith({
    pageId: 'p1',
    claimId: 'c1',
    action: 'reaffirmed'
  }));
  expect(await screen.findByText('reaffirmed · 3rd time · held 212 days')).toBeInTheDocument();
});

test('a thread names every source behind its count and can be rejected', async () => {
  getReadingLoop.mockResolvedValue({
    edition: baseEdition({
      thread: {
        kind: 'thread',
        status: 'ready',
        reason: '',
        generatedAt: '2026-08-13T12:00:00.000Z',
        runsUsedToday: 1,
        dailyRunCap: 4,
        card: {
          kind: 'thread',
          name: 'Eval harness reliability',
          line: 'How grading systems lose their calibration.',
          threadKey: 'thread:a,b,c,d',
          sources: [
            { type: 'article', id: 'a', title: 'Source one', at: '2026-08-01T00:00:00.000Z', href: '/articles/a' },
            { type: 'article', id: 'b', title: 'Source two', at: '2026-08-02T00:00:00.000Z', href: '/articles/b' },
            { type: 'article', id: 'c', title: 'Source three', at: '2026-08-03T00:00:00.000Z', href: '/articles/c' },
            { type: 'article', id: 'd', title: 'Source four', at: '2026-08-04T00:00:00.000Z', href: '/articles/d' }
          ],
          generatedAt: '2026-08-13T12:00:00.000Z'
        }
      }
    }),
    connectionRefreshing: false
  });
  dismissReadingLoopThread.mockResolvedValue({ ...idleMechanic('thread'), status: 'empty', reason: 'Dismissed. Not resurfacing for 60 days.' });
  renderPaper();

  expect(await screen.findByText('Eval harness reliability')).toBeInTheDocument();
  expect(screen.getByText('4 sources, no page')).toBeInTheDocument();
  ['Source one', 'Source two', 'Source three', 'Source four'].forEach(title => {
    expect(screen.getByText(title)).toBeInTheDocument();
  });

  fireEvent.click(screen.getByRole('button', { name: /not a thing/i }));
  await waitFor(() => expect(dismissReadingLoopThread).toHaveBeenCalledWith('thread:a,b,c,d'));
  expect(await screen.findByText('Dismissed. Not resurfacing for 60 days.')).toBeInTheDocument();
});

// "Nothing to connect" and "the model never answered" produced an identical
// calm page. The reader has to be able to tell a quiet week from a fault.
test('a broken model reads as a fault, not as a quiet week', async () => {
  getReadingLoop.mockResolvedValue({
    edition: baseEdition({
      connection: {
        ...idleMechanic('connection'),
        status: 'error',
        reason: 'The model did not answer on any of 6 attempts. This is not "nothing to connect" — it is unknown.',
        generatedAt: '2026-08-14T12:00:00.000Z'
      }
    }),
    connectionRefreshing: false
  });
  renderPaper();

  expect(await screen.findByRole('heading', { name: /could not be read today/i })).toBeInTheDocument();
  expect(screen.getByText(/did not answer on any of 6 attempts/)).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Nothing worth connecting yet.' })).not.toBeInTheDocument();
  expect(document.querySelector('.paper__degraded')).toBeTruthy();
});

test('an honest empty week says how much it looked at, and is not styled as a fault', async () => {
  getReadingLoop.mockResolvedValue({
    edition: baseEdition({
      connection: {
        ...idleMechanic('connection'),
        status: 'empty',
        reason: 'Nothing worth connecting yet. Examined 6 pairs — 4 found no real relation, 2 did not survive the quality gates.',
        generatedAt: '2026-08-14T12:00:00.000Z'
      }
    }),
    connectionRefreshing: false
  });
  renderPaper();

  expect(await screen.findByText(/Examined 6 pairs/)).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Nothing worth connecting yet.' })).toBeInTheDocument();
  expect(document.querySelector('.paper__degraded')).toBeNull();
});

test('a section that failed shows its reason rather than the invitation', async () => {
  getReadingLoop.mockResolvedValue({
    edition: baseEdition({
      collision: {
        ...idleMechanic('collision'),
        status: 'error',
        reason: 'The model that reads your pairs is not configured, so nothing could be checked.',
        generatedAt: '2026-08-14T12:00:00.000Z'
      }
    }),
    connectionRefreshing: false
  });
  renderPaper();

  expect(await screen.findByText(/is not configured, so nothing could be checked/)).toBeInTheDocument();
  expect(screen.queryByText('Check this week’s reading against the claims you hold.')).not.toBeInTheDocument();
});

test('hitting the daily cap is reported honestly rather than as a failure', async () => {
  getReadingLoop.mockResolvedValue({ edition: baseEdition(), connectionRefreshing: false });
  const capError = new Error('cap');
  capError.response = { status: 429 };
  runReadingLoopMechanic.mockRejectedValue(capError);
  renderPaper();

  await screen.findByText('Anthropic eval harness paper');
  fireEvent.click(screen.getAllByRole('button', { name: /^run$/i })[0]);

  expect(await screen.findByText('Daily limit reached. Resets tomorrow.')).toBeInTheDocument();
});

test('the lead can be refreshed by the reader', async () => {
  getReadingLoop.mockResolvedValue({ edition: baseEdition(), connectionRefreshing: false });
  refreshReadingLoopConnection.mockResolvedValue({
    ...idleMechanic('connection'),
    status: 'ready',
    generatedAt: '2026-08-13T13:00:00.000Z',
    card: { ...connectionCard, recent: { ...connectionCard.recent, title: 'A different recent piece' } }
  });
  renderPaper();

  fireEvent.click(await screen.findByRole('button', { name: /refresh/i }));

  await waitFor(() => expect(refreshReadingLoopConnection).toHaveBeenCalled());
  expect(await screen.findByText('A different recent piece')).toBeInTheDocument();
});
