import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import LibraryPlaces from './LibraryPlaces';

describe('LibraryPlaces', () => {
  it('puts Later, Set aside, and Kept at the top even when they are empty', () => {
    render(
      <MemoryRouter>
        <LibraryPlaces />
      </MemoryRouter>
    );
    const nav = screen.getByRole('navigation', { name: 'Library places' });
    expect(nav).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Later' })).toHaveAttribute('href', '/library?scope=later');
    expect(screen.getByRole('link', { name: 'Set aside' })).toHaveAttribute('href', '/library?scope=set-aside');
    expect(screen.getByRole('link', { name: 'Kept' })).toHaveAttribute('href', '/library?scope=kept');
    expect(screen.queryByText(/On your desk/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Feed/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Feed \(0\)/)).not.toBeInTheDocument();
  });

  it('puts a known nonzero count on the door, never a nought', () => {
    render(
      <MemoryRouter>
        <LibraryPlaces later={1} setAside={2} kept={2} />
      </MemoryRouter>
    );
    expect(screen.getByRole('link', { name: 'Later 1' })).toHaveAttribute('href', '/library?scope=later');
    expect(screen.getByRole('link', { name: 'Set aside 2' })).toHaveAttribute('href', '/library?scope=set-aside');
    expect(screen.getByRole('link', { name: 'Kept 2' })).toHaveAttribute('href', '/library?scope=kept');
    expect(screen.queryByText(/On your desk/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Later 0$/)).not.toBeInTheDocument();
  });

  it('adds screened folder names in living ink, never the word Feed', () => {
    render(
      <MemoryRouter>
        <LibraryPlaces feedTopics={[{ id: 'news', name: 'Newsletters' }]} />
      </MemoryRouter>
    );
    const topic = screen.getByRole('link', { name: 'Newsletters' });
    expect(topic).toHaveAttribute('href', '/library?scope=feed&topic=news');
    expect(topic).toHaveClass('is-living');
    expect(screen.queryByText(/^Feed$/)).not.toBeInTheDocument();
  });
});
