import React from 'react';
import { act, render, screen } from '@testing-library/react';
import {
  OPINION_GHOST_FADE_MS,
  OPINION_GHOST_LINGER_MS,
  OpinionGhost,
  ghostOfPreviousOpinion,
  useOpinionGhost
} from './opinionGhost';

const Probe = ({ sentence, identity }) => {
  const { ghost, yielding } = useOpinionGhost(sentence, identity);
  return (
    <div>
      <span data-testid="ghost">{ghost}</span>
      <span data-testid="yielding">{String(yielding)}</span>
    </div>
  );
};

const originalMatchMedia = window.matchMedia;

afterEach(() => {
  window.matchMedia = originalMatchMedia;
  jest.useRealTimers();
});

describe('ghostOfPreviousOpinion', () => {
  it('is silent on first paint, blanks, and the same sentence', () => {
    expect(ghostOfPreviousOpinion(null, 'A claim.')).toBe('');
    expect(ghostOfPreviousOpinion('', 'A claim.')).toBe('');
    expect(ghostOfPreviousOpinion('A claim.', '')).toBe('');
    expect(ghostOfPreviousOpinion('A claim.', 'A claim.')).toBe('');
  });

  it('returns the previous opinion sentence, not a stuffed title', () => {
    expect(ghostOfPreviousOpinion(
      'NVIDIA demand still outruns deliverable capacity.',
      'I am bullish NVIDIA compute.'
    )).toBe('NVIDIA demand still outruns deliverable capacity.');
  });
});

describe('useOpinionGhost', () => {
  it('does not ghost the first sentence it sees', () => {
    render(<Probe sentence="NVIDIA demand still outruns deliverable capacity." />);
    expect(screen.getByTestId('ghost')).toHaveTextContent('');
  });

  it('does not ghost a blank becoming a hold', () => {
    const { rerender } = render(<Probe sentence="" />);
    rerender(<Probe sentence="I am bullish NVIDIA compute." />);
    expect(screen.getByTestId('ghost')).toHaveTextContent('');
  });

  it('lingers the previous opinion, then yields', () => {
    jest.useFakeTimers();
    const { rerender } = render(<Probe sentence="NVIDIA demand still outruns deliverable capacity." />);
    rerender(<Probe sentence="I am bullish NVIDIA compute." />);

    expect(screen.getByTestId('ghost'))
      .toHaveTextContent('NVIDIA demand still outruns deliverable capacity.');
    expect(screen.getByTestId('yielding')).toHaveTextContent('false');

    act(() => { jest.advanceTimersByTime(OPINION_GHOST_LINGER_MS); });
    expect(screen.getByTestId('yielding')).toHaveTextContent('true');
    expect(screen.getByTestId('ghost'))
      .toHaveTextContent('NVIDIA demand still outruns deliverable capacity.');

    act(() => { jest.advanceTimersByTime(OPINION_GHOST_FADE_MS); });
    expect(screen.getByTestId('ghost')).toHaveTextContent('');
    expect(screen.getByTestId('yielding')).toHaveTextContent('false');
  });

  it('keeps ghosting the original sentence through a second change', () => {
    jest.useFakeTimers();
    const { rerender } = render(<Probe sentence="The first hold." />);
    rerender(<Probe sentence="The second hold." />);
    rerender(<Probe sentence="The third hold." />);

    expect(screen.getByTestId('ghost')).toHaveTextContent('The first hold.');
    act(() => { jest.advanceTimersByTime(OPINION_GHOST_LINGER_MS); });
    act(() => { jest.advanceTimersByTime(OPINION_GHOST_FADE_MS); });
    expect(screen.getByTestId('ghost')).toHaveTextContent('');
  });

  it('does not carry a ghost onto a different claim', () => {
    jest.useFakeTimers();
    const { rerender } = render(<Probe sentence="Compute stays scarce." identity="wiki-a" />);
    rerender(<Probe sentence="I am bullish NVIDIA compute." identity="wiki-a" />);
    expect(screen.getByTestId('ghost')).toHaveTextContent('Compute stays scarce.');

    rerender(<Probe sentence="Rates still matter." identity="wiki-b" />);
    expect(screen.getByTestId('ghost')).toHaveTextContent('');
  });

  it('skips the linger when motion is reduced', () => {
    window.matchMedia = jest.fn().mockImplementation((query) => ({
      matches: query === '(prefers-reduced-motion: reduce)'
    }));
    const { rerender } = render(<Probe sentence="The first hold." />);
    rerender(<Probe sentence="The second hold." />);
    expect(screen.getByTestId('ghost')).toHaveTextContent('');
  });
});

describe('OpinionGhost', () => {
  it('renders the previous sentence as a quiet line, then leaves', () => {
    jest.useFakeTimers();
    const { rerender } = render(
      <OpinionGhost sentence="NVIDIA demand still outruns deliverable capacity." identity="wiki-nvidia" />
    );
    expect(screen.queryByTestId('opinion-ghost')).not.toBeInTheDocument();

    rerender(
      <OpinionGhost sentence="I am bullish NVIDIA compute." identity="wiki-nvidia" />
    );
    const ghost = screen.getByTestId('opinion-ghost');
    expect(ghost).toHaveTextContent('NVIDIA demand still outruns deliverable capacity.');
    expect(ghost).toHaveClass('judgment__opinion-ghost');
    expect(ghost).not.toHaveClass('is-yielding');

    act(() => { jest.advanceTimersByTime(OPINION_GHOST_LINGER_MS); });
    expect(screen.getByTestId('opinion-ghost')).toHaveClass('is-yielding');

    act(() => { jest.advanceTimersByTime(OPINION_GHOST_FADE_MS); });
    expect(screen.queryByTestId('opinion-ghost')).not.toBeInTheDocument();
  });
});
