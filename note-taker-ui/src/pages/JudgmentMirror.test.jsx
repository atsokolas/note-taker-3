import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import * as router from 'react-router-dom';
import JudgmentMirror from './JudgmentMirror';
import { getJudgmentMirror } from '../api/dailyLoop';

jest.mock('../api/dailyLoop', () => ({
  __esModule: true,
  getJudgmentMirror: jest.fn()
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
});
