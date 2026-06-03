import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import AgentTicker from './AgentTicker';

describe('AgentTicker', () => {
  const originalMatchMedia = window.matchMedia;

  beforeEach(() => {
    window.sessionStorage.clear();
  });

  afterEach(() => {
    jest.useRealTimers();
    window.matchMedia = originalMatchMedia;
    window.sessionStorage.clear();
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

  it('carries recent shared trace memory into the next surface ticker', () => {
    window.matchMedia = jest.fn().mockReturnValue({ matches: true });

    const { rerender } = render(
      <AgentTicker
        label="Home trace"
        lines={['routing source to wiki']}
        sharedMemory
        surface="Home"
      />
    );

    rerender(
      <AgentTicker
        label="Wiki trace"
        lines={['reading target page']}
        sharedMemory
        surface="Wiki"
      />
    );

    const ticker = screen.getByLabelText('Wiki trace');
    expect(ticker).toHaveAttribute('data-shared-history-count', '1');
    expect(screen.getByRole('button', { name: 'Expand 1 trace history line' })).not.toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Expand 1 trace history line' }));
    expect(screen.getByLabelText('Trace history')).toHaveTextContent('Home: routing source to wiki');
    expect(screen.getByText('reading target page')).toBeInTheDocument();
  });
});
