import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import JudgmentMirror from './JudgmentMirror';
import { getJudgmentMirror } from '../api/dailyLoop';

jest.mock('../api/dailyLoop', () => ({
  getJudgmentMirror: jest.fn()
}));

jest.mock('../motion/columnMotion', () => ({
  takeFirstPaint: () => false
}));

const mirror = {
  userId: 'user-a',
  stats: {
    held: { id: 'held', label: 'Claims held', display: '2', href: '/judgment/mirror?stat=held' },
    holdTime: { id: 'hold-time', label: 'Average hold time', display: '120 days', href: '/judgment/mirror?stat=hold-time' },
    revisions: { id: 'revisions', label: 'Revision rate', display: '50%', href: '/judgment/mirror?stat=revisions' },
    verdicts: {
      id: 'verdicts',
      label: 'Verdict record',
      display: '1 held up · 1 broke · 0 partly · 0 unresolvable',
      href: '/judgment/mirror?stat=verdicts'
    },
    counterEvidence: {
      id: 'counter-evidence',
      label: 'Time from counter-evidence to revision',
      display: '10 days',
      href: '/judgment/mirror?stat=counter-evidence'
    }
  },
  stat: 'held',
  claims: [{
    pageId: 'p1',
    claimId: 'c1',
    text: 'Compute is scarce.',
    href: '/judgment/p1'
  }]
};

describe('The Mirror', () => {
  beforeEach(() => {
    getJudgmentMirror.mockResolvedValue(mirror);
  });

  it('renders the ledger as typography and click-through, never a score', async () => {
    render(
      <MemoryRouter initialEntries={['/judgment/mirror?stat=held']}>
        <JudgmentMirror />
      </MemoryRouter>
    );

    expect(await screen.findByRole('heading', { name: 'How good is my judgment?' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Claims held 2/ })).toHaveAttribute('href', '/judgment/mirror?stat=held');
    expect(screen.getByRole('link', { name: 'Compute is scarce.' })).toHaveAttribute('href', '/judgment/p1');
    expect(screen.getByText(/held up/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/strongest|confetti|score|toast|streak/i);
  });
});
