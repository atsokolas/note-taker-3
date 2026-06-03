import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import AgentTicker from './AgentTicker';

describe('AgentTicker', () => {
  const originalMatchMedia = window.matchMedia;

  afterEach(() => {
    jest.useRealTimers();
    window.matchMedia = originalMatchMedia;
  });

  it('types the active trace line character by character and expands collapsed history', () => {
    jest.useFakeTimers();
    window.matchMedia = jest.fn().mockReturnValue({ matches: false });

    render(
      <AgentTicker
        label="Trace"
        lines={['scanning library', 'found 3 related', 'linking source']}
        characterDelayMs={10}
      />
    );

    expect(screen.queryByText('linking source')).not.toBeInTheDocument();
    act(() => {
      jest.advanceTimersByTime(40);
    });
    expect(screen.getByText('link')).toBeInTheDocument();

    const ticker = screen.getByLabelText('Trace');
    expect(ticker).toHaveAttribute('data-history-count', '2');
    const historyToggle = screen.getByRole('button', { name: 'Expand 2 trace history lines' });
    expect(historyToggle).not.toBeDisabled();
    expect(screen.queryByLabelText('Trace history')).not.toBeInTheDocument();
    fireEvent.click(historyToggle);
    expect(screen.getByLabelText('Trace history')).toHaveTextContent('scanning library');
    expect(screen.getByLabelText('Trace history')).toHaveTextContent('found 3 related');
  });

  it('renders instantly when reduced motion is preferred', () => {
    jest.useFakeTimers();
    window.matchMedia = jest.fn().mockReturnValue({ matches: true });

    render(<AgentTicker label="Trace" lines={['working trace']} />);

    expect(screen.getByText('working trace')).toBeInTheDocument();
    expect(screen.getByLabelText('Trace')).toHaveAttribute('data-reduced-motion', 'true');
    expect(screen.queryByTestId('agent-ticker-cursor')).toBeNull();
  });

  it('disables the collapsed history strip when there are no prior trace lines', () => {
    window.matchMedia = jest.fn().mockReturnValue({ matches: true });

    render(<AgentTicker label="Trace" lines={['idle']} />);

    const ticker = screen.getByLabelText('Trace');
    expect(ticker).toHaveAttribute('data-history-count', '0');
    expect(screen.getByRole('button', { name: 'Expand 0 trace history lines' })).toBeDisabled();
  });
});
