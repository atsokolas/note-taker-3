import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import JudgmentShelf from './JudgmentShelf';

const items = [
  { id: 'claim-1', headline: 'Compute', sentence: 'AI compute remains scarce.', state: 'open' },
  { id: 'claim-2', headline: 'Renewal', sentence: 'Member surplus supports renewal.', state: 'parked' }
];

describe('JudgmentShelf', () => {
  it('names the room’s four places in plain words', () => {
    render(
      <MemoryRouter>
        <JudgmentShelf items={items} />
      </MemoryRouter>
    );

    expect(screen.getByRole('navigation', { name: 'Judgment' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Views 1' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Set aside 1' })).toHaveAttribute('href', '/judgment?view=parked');
    expect(screen.getByRole('link', { name: 'Record' })).toHaveAttribute('href', '/judgment/mirror#record');
    expect(screen.getByRole('link', { name: 'The Mirror' })).toHaveAttribute('href', '/judgment/mirror');
    expect(screen.queryByText(/μνήμη/)).not.toBeInTheDocument();
    expect(screen.queryByText('Compute')).not.toBeInTheDocument();
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
  });
});
