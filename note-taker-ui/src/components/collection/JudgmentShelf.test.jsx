import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import JudgmentShelf from './JudgmentShelf';

const items = [
  { id: 'claim-1', headline: 'Compute', sentence: 'AI compute remains scarce.', state: 'arrived', decisionCount: 2 },
  { id: 'claim-2', headline: 'Renewal', sentence: 'Member surplus supports renewal.', state: 'parked', decisionCount: 1 }
];

describe('JudgmentShelf', () => {
  it('keeps navigation compact while the main page owns the one case list', () => {
    render(
      <MemoryRouter>
        <JudgmentShelf items={items} collectionView="open" />
      </MemoryRouter>
    );

    expect(screen.getByRole('navigation', { name: 'Judgment' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open cases 1' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Set aside 1' })).toHaveAttribute('href', '/judgment?view=parked');
    expect(screen.getByRole('link', { name: 'Decisions 3' })).toHaveAttribute('href', '/judgment/mirror#decisions');
    expect(screen.getByRole('link', { name: 'The Mirror' })).toHaveAttribute('href', '/judgment/mirror');
    expect(screen.queryByText('Compute')).not.toBeInTheDocument();
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
  });
});
