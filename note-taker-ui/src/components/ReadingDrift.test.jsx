import React from 'react';
import { render, screen } from '@testing-library/react';
import ReadingDrift from './ReadingDrift';

const NOW = new Date('2026-08-18T12:00:00.000Z').getTime();
const DAY = 24 * 60 * 60 * 1000;
const daysAgo = days => new Date(NOW - days * DAY).toISOString();

const many = (topic, days, count) => Array.from({ length: count }, (_, index) => ({
  _id: `${topic}-${days}-${index}`,
  createdAt: daysAgo(days),
  folder: { _id: topic, name: topic }
}));

describe('ReadingDrift', () => {
  it('notices out loud, and draws one line per topic', () => {
    render(<ReadingDrift now={NOW} articles={[
      ...many('Capacity', 70, 4), ...many('Capacity', 56, 3),
      ...many('Power', 10, 4), ...many('Power', 3, 4)
    ]} />);

    expect(screen.getByText('You are reading less about Capacity and more about Power.')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    // The line carries its own reading for anyone who cannot see it.
    expect(screen.getByRole('img', { name: /Power: rising, 8 sources over three months/ })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Capacity: fading/ })).toBeInTheDocument();
  });

  it('says what is missing rather than drawing a line through noise', () => {
    render(<ReadingDrift now={NOW} articles={many('Capacity', 3, 2)} />);
    expect(screen.getByText(/not enough to call it a direction yet/)).toBeInTheDocument();
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
  });

  it('explains where the signal comes from when there is none at all', () => {
    render(<ReadingDrift now={NOW} articles={[{ _id: 'x', createdAt: daysAgo(2) }]} />);
    expect(screen.getByText(/read from the shelves you file things on/)).toBeInTheDocument();
  });

  it('asks nothing of the reader', () => {
    const { container } = render(<ReadingDrift now={NOW} articles={[
      ...many('Capacity', 70, 4), ...many('Power', 3, 5)
    ]} />);
    // No decisions, no controls, nothing to dismiss. It is only interesting.
    expect(container.querySelectorAll('button')).toHaveLength(0);
    expect(container.querySelectorAll('a')).toHaveLength(0);
  });
});
