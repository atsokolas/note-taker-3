import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import MorningConsequence from './MorningConsequence';
import { disposeConsequence } from '../../api/dailyLoop';
import { usePrefersReducedMotion } from '../../hooks/useMotionPreferences';

jest.mock('../../api/dailyLoop', () => ({
  disposeConsequence: jest.fn()
}));

jest.mock('../../hooks/useMotionPreferences', () => ({
  usePrefersReducedMotion: jest.fn(() => false),
  useFinePointer: jest.fn(() => false)
}));

jest.mock('../../hooks/useMagneticRow', () => () => ({
  rowRef: { current: null },
  onPointerMove: jest.fn(),
  onPointerLeave: jest.fn()
}));

const preview = {
  eventId: 'evt-sec-1',
  pageId: 'page-nvda',
  claimId: 'claim-nvda',
  eventTitle: 'NVIDIA 10-Q',
  whatChanged: 'NVIDIA 10-Q',
  whatItAffects: 'NVIDIA demand still outruns deliverable capacity.',
  whatINeed: 'Accept, narrow, preserve, reject, or defer.',
  prior: 'NVIDIA demand still outruns deliverable capacity.',
  proposed: 'NVIDIA demand still outruns deliverable capacity. 2026-08-28: Confirmed signed capacity converts within 90 days.',
  passage: 'Confirmed signed capacity converts within 90 days.',
  passageHref: 'https://www.sec.gov/Archives/edgar/nvda.htm',
  dependents: [{ pageId: 'page-cw', claim: 'CoreWeave is cheap if compute stays scarce.' }]
};

describe('MorningConsequence', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    usePrefersReducedMotion.mockReturnValue(false);
    disposeConsequence.mockResolvedValue({
      receipt: { id: 'consequence:user-a:evt-sec-1:claim-nvda:accept', status: 'accepted' },
      preview: { ...preview, disposition: 'accept' },
      replay: false
    });
  });

  it('shows the fold, prior and proposed together, and a one-click passage', () => {
    render(
      <MemoryRouter>
        <MorningConsequence consequence={preview} pulse />
      </MemoryRouter>
    );
    expect(screen.getByText('What changed')).toBeInTheDocument();
    expect(screen.getByText('What it affects')).toBeInTheDocument();
    expect(screen.getByText('What I need from you')).toBeInTheDocument();
    expect(screen.getByText('Prior')).toBeInTheDocument();
    expect(screen.getByText('Proposed')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'The passage' })).toHaveAttribute(
      'href',
      preview.passageHref
    );
    expect(screen.getByText(/CoreWeave is cheap/)).toBeInTheDocument();
    expect(screen.queryByTestId('ariadne-thread')).not.toBeInTheDocument();
  });

  it('accepts the reversible diff, then shows Ariadne after persist', async () => {
    render(
      <MemoryRouter>
        <MorningConsequence consequence={preview} pulse />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
    await waitFor(() => {
      expect(disposeConsequence).toHaveBeenCalledWith({
        preview,
        action: 'accept',
        narrowedText: ''
      });
    });
    expect(await screen.findByText('accepted · prior kept')).toBeInTheDocument();
    expect(await screen.findByTestId('ariadne-thread')).toBeInTheDocument();
    expect(document.querySelector('.morning-consequence')).toHaveClass('consequence-ripple');
  });

  it('keeps Ariadne still under reduced motion', async () => {
    usePrefersReducedMotion.mockReturnValue(true);
    render(
      <MemoryRouter>
        <MorningConsequence consequence={preview} />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
    expect(await screen.findByTestId('ariadne-thread')).toHaveClass('ariadne-thread--reduced');
    expect(document.querySelector('.morning-consequence')).not.toHaveClass('consequence-ripple');
  });

  it('stays silent without a qualified preview', () => {
    const { container } = render(<MemoryRouter><MorningConsequence consequence={null} /></MemoryRouter>);
    expect(container).toBeEmptyDOMElement();
  });
});
