import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import MorningCheckIn from './MorningCheckIn';
import { recordClaimCheckIn, recordClaimFalsifiability } from '../../api/dailyLoop';
import { fileSentenceAway } from '../../motion/columnMotion';

jest.mock('../../api/dailyLoop', () => ({
  recordClaimCheckIn: jest.fn(),
  recordClaimFalsifiability: jest.fn()
}));

jest.mock('../../motion/columnMotion', () => ({
  ENTER_DURATION_MS: 220,
  fileSentenceAway: jest.fn(() => true),
  prefersReducedMotion: () => false
}));

jest.mock('../../hooks/useMotionPreferences', () => ({
  usePrefersReducedMotion: () => false
}));

const checkIn = {
  pageId: 'wiki-nvda',
  claimId: 'c1',
  text: 'Integration retains pricing power.',
  adoptedAt: '2025-12-30T12:00:00.000Z'
};

describe('MorningCheckIn', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('inks Still hold and ticks the tally in place', async () => {
    recordClaimCheckIn.mockResolvedValue({
      claim: {
        createdAt: checkIn.adoptedAt,
        history: [
          { action: 'reaffirmed' },
          { action: 'reaffirmed' },
          { action: 'reaffirmed' },
          { action: 'reaffirmed' }
        ]
      }
    });

    render(<MorningCheckIn checkIn={checkIn} pulse />);

    expect(screen.getByLabelText('Morning check-in')).toHaveClass('is-morning-pulse');
    fireEvent.click(screen.getByRole('button', { name: 'Still hold' }));

    await waitFor(() => expect(recordClaimCheckIn).toHaveBeenCalledWith({
      pageId: 'wiki-nvda',
      claimId: 'c1',
      action: 'reaffirmed'
    }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Still hold' })).toHaveClass('is-inked'));
    expect(screen.getByText(/reaffirmed · 4th · held/)).toBeInTheDocument();
    expect(screen.getByLabelText('Morning check-in')).toHaveClass('is-settled');
  });

  it('strikes the claim and files it toward the casebook on Retire', async () => {
    recordClaimCheckIn.mockResolvedValue({ claim: { history: [] } });
    const onRetired = jest.fn();
    render(<MorningCheckIn checkIn={checkIn} onRetired={onRetired} />);

    fireEvent.click(screen.getByRole('button', { name: 'Retire' }));

    await waitFor(() => expect(recordClaimCheckIn).toHaveBeenCalledWith({
      pageId: 'wiki-nvda',
      claimId: 'c1',
      action: 'retired'
    }));
    expect(fileSentenceAway).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByLabelText('Morning check-in')).not.toBeInTheDocument());
    expect(onRetired).toHaveBeenCalled();
  });

  it('lets you name a test without blocking Still hold', async () => {
    recordClaimFalsifiability.mockResolvedValue({ claim: { resolutionCriteria: 'Utilisation falls.' } });
    recordClaimCheckIn.mockResolvedValue({
      claim: { bornAt: checkIn.adoptedAt, history: [{ action: 'reaffirmed' }] }
    });
    render(<MorningCheckIn checkIn={checkIn} />);

    fireEvent.click(screen.getByText('What would change your mind — and by when?'));
    fireEvent.change(screen.getByPlaceholderText('The test, in a sentence.'), {
      target: { value: 'Utilisation falls two quarters.' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Keep' }));
    await waitFor(() => expect(recordClaimFalsifiability).toHaveBeenCalledWith({
      pageId: 'wiki-nvda',
      claimId: 'c1',
      resolutionCriteria: 'Utilisation falls two quarters.',
      horizon: null
    }));
    expect(await screen.findByText('Noted.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Still hold' }));
    await waitFor(() => expect(recordClaimCheckIn).toHaveBeenCalledWith({
      pageId: 'wiki-nvda',
      claimId: 'c1',
      action: 'reaffirmed'
    }));
  });
});
