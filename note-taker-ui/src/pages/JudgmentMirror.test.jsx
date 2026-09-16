import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import * as router from 'react-router-dom';
import JudgmentMirror from './JudgmentMirror';
import { getJudgmentMirror } from '../api/dailyLoop';
import { getDecisions } from '../api/decisions';

jest.mock('../api/dailyLoop', () => ({
  __esModule: true,
  getJudgmentMirror: jest.fn()
}));
jest.mock('../api/decisions', () => ({
  __esModule: true,
  getDecisions: jest.fn()
}));

const doors = {
  stats: {
    held: {
      id: 'held',
      label: 'Claims held',
      value: 2,
      display: '2',
      href: '/judgment/mirror?stat=held'
    },
    holdTime: {
      id: 'hold-time',
      label: 'Average hold time',
      value: 12,
      display: '12 days',
      href: '/judgment/mirror?stat=hold-time'
    },
    revisions: {
      id: 'revisions',
      label: 'Revision rate',
      value: 0.5,
      display: '50%',
      href: '/judgment/mirror?stat=revisions'
    },
    verdicts: {
      id: 'verdicts',
      label: 'Verdict record',
      value: { held_up: 1, broke: 0, partly: 0, unresolvable: 0 },
      display: '1 held up · 0 broke · 0 partly · 0 unresolvable',
      href: '/judgment/mirror?stat=verdicts'
    },
    counterEvidence: {
      id: 'counter-evidence',
      label: 'Time from counter-evidence to revision',
      value: 3,
      display: '3 days',
      href: '/judgment/mirror?stat=counter-evidence'
    }
  },
  claims: [
    {
      pageId: 'p1',
      claimId: 'c1',
      text: 'Compute is scarce.',
      href: '/wiki/workspace?page=p1'
    }
  ]
};

describe('JudgmentMirror', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getDecisions.mockResolvedValue({ items: [], nextCursor: null, coverage: { truncated: false } });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders typographic stats that click through to claims', async () => {
    jest.spyOn(router, 'useSearchParams').mockReturnValue([
      new URLSearchParams('stat=held'),
      jest.fn()
    ]);
    getJudgmentMirror.mockResolvedValue(doors);
    render(
      <router.MemoryRouter>
        <JudgmentMirror />
      </router.MemoryRouter>
    );
    expect(await screen.findByRole('link', { name: /Claims held/ })).toHaveAttribute(
      'href',
      '/judgment/mirror?stat=held'
    );
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Claims held' })).toBeInTheDocument();
    });
    expect(screen.getByRole('link', { name: 'Compute is scarce.' })).toHaveAttribute(
      'href',
      '/wiki/workspace?page=p1'
    );
  });

  it('renders a calm, honest mirror without gamification or invented response time', async () => {
    getJudgmentMirror.mockResolvedValue({
      metrics: {
        claimsHeld: 3,
        averageHoldDays: 42,
        revisionRate: 0.33,
        verdictRecord: { held_up: 1, broke: 0, partly: 0, unresolvable: 0 },
        counterevidenceResponseDays: null
      },
      coverage: { storedBirthDates: 2, totalClaims: 3, responseTimeClaims: 0 },
      due: [],
      verdicts: []
    });
    render(
      <router.MemoryRouter>
        <JudgmentMirror />
      </router.MemoryRouter>
    );
    expect(await screen.findByRole('heading', { name: 'The Mirror' })).toBeInTheDocument();
    expect(await screen.findByText('42 days')).toBeInTheDocument();
    expect(screen.getByText('No verdicts yet. The Mirror is allowed to be empty.')).toBeInTheDocument();
    expect(screen.getByText(/counterevidence response time stays blank/i)).toBeInTheDocument();
  });

  it('shows private calibration copy without a leaderboard', async () => {
    getJudgmentMirror.mockResolvedValue({
      metrics: { claimsHeld: 1, verdictRecord: {} },
      coverage: { storedBirthDates: 1, totalClaims: 1, responseTimeClaims: 0 },
      due: [],
      verdicts: [],
      calibration: {
        private: true,
        selection: 'These are the cases you chose to keep and later named an outcome. They are not a sample of everything you thought.',
        overall: { sufficient: false, silence: 'Too few named outcomes (1) to speak. Silence until 8.' },
        byConfidence: [{
          confidence: 'certain',
          sufficient: false,
          silence: 'Too few named outcomes (1) to speak. Silence until 8.'
        }]
      }
    });
    render(
      <router.MemoryRouter>
        <JudgmentMirror />
      </router.MemoryRouter>
    );
    expect(await screen.findByText(/not a sample of everything you thought/)).toBeInTheDocument();
    expect(screen.getByText(/Too few named outcomes/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/leaderboard|rank|shame/i);
  });

  it('replays the retained decision before revealing its verified outcome', async () => {
    getJudgmentMirror.mockResolvedValue({ metrics: { verdictRecord: {} }, coverage: {}, due: [], verdicts: [] });
    getDecisions.mockResolvedValue({
      nextCursor: null,
      coverage: { truncated: false },
      items: [{
        id: 'decision:page:one',
        decision: {
          status: 'reviewed',
          summary: 'Wait for the second cohort.',
          expectedOutcome: 'The pattern repeats without assistance.',
          acceptedAt: '2026-08-01T12:00:00.000Z'
        },
        basis: {
          heldView: 'The cue improves retrieval.',
          criterion: 'The second cohort cannot find the source.',
          objection: 'The first cohort received help.',
          attachedSources: [{
            sourceRefId: 'source-1',
            title: 'First cohort notes',
            snippet: 'Four readers asked for help.',
            attachedAt: '2026-07-31T12:00:00.000Z'
          }],
          laterSources: []
        },
        outcome: { state: 'observed', result: 'mixed', summary: 'Two readers still needed help.' },
        subject: { href: '/wiki/workspace?page=page-1#decision-one' },
        continuity: { complete: true, missing: [] }
      }]
    });
    render(<router.MemoryRouter><JudgmentMirror /></router.MemoryRouter>);

    expect(await screen.findByRole('heading', { name: 'Wait for the second cohort.' })).toBeInTheDocument();
    expect(screen.getByText('Four readers asked for help.')).toBeInTheDocument();
    expect(screen.queryByText(/Two readers still needed help/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show what happened' }));
    expect(screen.getByText(/Two readers still needed help/)).toBeInTheDocument();
    expect(screen.getByText(/changes no view, action, test, or assessment/i)).toBeInTheDocument();
  });
});
