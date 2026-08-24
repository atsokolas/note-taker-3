import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import JudgmentShelf from './JudgmentShelf';

const items = [
  {
    id: 'claim-1',
    sentence: 'AI compute remains scarce.',
    state: 'arrived',
    decisionCount: 2,
    outcomeCount: 1,
    lessons: [{ id: 'lesson-1' }]
  },
  {
    id: 'claim-2',
    sentence: 'Member surplus supports renewal.',
    decisionCount: 1,
    outcomeCount: 0,
    lessons: []
  }
];

const renderShelf = (props = {}) => render(
  <MemoryRouter>
    <JudgmentShelf items={items} {...props} />
  </MemoryRouter>
);

describe('JudgmentShelf', () => {
  it('uses the shared shelf grammar for cases and casebook counts', () => {
    renderShelf({ activeId: 'claim-1' });

    expect(screen.getByRole('navigation', { name: 'Judgments' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /AI compute remains scarce/i })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByText('Claims').parentElement).toHaveTextContent('2');
    expect(screen.getByText('Decisions').parentElement).toHaveTextContent('3');
    expect(screen.getByText('Outcomes').parentElement).toHaveTextContent('1');
    expect(screen.getByText('Lessons').parentElement).toHaveTextContent('1');
  });

  it('searches the visible cases without mutating the casebook', () => {
    renderShelf();

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search judgments' }), {
      target: { value: 'member' }
    });

    expect(screen.queryByRole('link', { name: /AI compute remains scarce/i })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Member surplus supports renewal/i })).toBeInTheDocument();
    expect(screen.getByText('Claims').parentElement).toHaveTextContent('2');
  });
});
