import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SystemInventoryCard from './SystemInventoryCard';

const Card = ({ children, className = '' }) => <section className={className}>{children}</section>;

describe('SystemInventoryCard', () => {
  it('shows the current room, persistent contextual agent, and theme', () => {
    render(
      <MemoryRouter initialEntries={['/library']}>
        <SystemInventoryCard Card={Card} theme="light" pathname="/library" />
      </MemoryRouter>
    );

    const active = screen.getByLabelText('Active system items');
    expect(within(active).getByText('Library')).toBeInTheDocument();
    expect(within(active).getByText('Context partner')).toBeInTheDocument();
    expect(within(active).getByText('Light editorial theme')).toBeInTheDocument();
    expect(screen.getByText('3 active now')).toBeInTheDocument();
  });

  it('keeps technical inventory behind disclosure and labels readiness limits', () => {
    render(
      <MemoryRouter initialEntries={['/settings']}>
        <SystemInventoryCard Card={Card} theme="auto" />
      </MemoryRouter>
    );

    expect(screen.getByText('Inspect the registered system')).toBeInTheDocument();
    expect(screen.getByText(/connector readiness and durable background-loop state use the same stable identities/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Inspect connection readiness' })).toHaveAttribute('href', '/connections#sources');
  });
});
