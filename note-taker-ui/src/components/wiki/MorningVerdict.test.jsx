import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import MorningVerdict from './MorningVerdict';
import { recordClaimVerdict } from '../../api/dailyLoop';

jest.mock('../../api/dailyLoop', () => ({
  recordClaimVerdict: jest.fn()
}));

const horizonAsk = {
  pageId: 'wiki-nvda',
  claimId: 'c1',
  text: 'Compute stays scarce through 2027.',
  trigger: 'horizon',
  horizon: '2026-08-15T00:00:00.000Z',
  resolutionCriteria: 'Utilisation falls two quarters.'
};

const evidenceAsk = {
  pageId: 'wiki-nvda',
  claimId: 'c1',
  text: 'Compute stays scarce through 2027.',
  trigger: 'evidence',
  sourceEventId: 'evt-1'
};

describe('MorningVerdict', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('inks a horizon tap in the same grammar as check-in', async () => {
    recordClaimVerdict.mockResolvedValue({
      claim: { verdicts: [{ verdict: 'held_up' }] }
    });
    render(<MorningVerdict ask={horizonAsk} pulse />);

    expect(screen.getByLabelText('Morning verdict')).toHaveClass('is-morning-pulse');
    expect(screen.getByText('The horizon you named has arrived.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Held up' }));

    await waitFor(() => expect(recordClaimVerdict).toHaveBeenCalledWith({
      pageId: 'wiki-nvda',
      claimId: 'c1',
      verdict: 'held_up',
      trigger: 'horizon',
      sourceEventId: ''
    }));
    expect(screen.getByRole('button', { name: 'Held up' })).toHaveClass('is-inked');
    expect(screen.getByText(/held up · 1st · horizon/)).toBeInTheDocument();
  });

  it('asks when evidence landed, with the same four verbs', async () => {
    recordClaimVerdict.mockResolvedValue({
      claim: { verdicts: [{ verdict: 'broke' }, { verdict: 'broke' }] }
    });
    render(<MorningVerdict ask={evidenceAsk} />);

    expect(screen.getByText('A watcher landed evidence.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Broke' }));
    await waitFor(() => expect(recordClaimVerdict).toHaveBeenCalledWith({
      pageId: 'wiki-nvda',
      claimId: 'c1',
      verdict: 'broke',
      trigger: 'evidence',
      sourceEventId: 'evt-1'
    }));
    expect(screen.getByRole('button', { name: 'Partly' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Unresolvable' })).toBeInTheDocument();
  });
});
