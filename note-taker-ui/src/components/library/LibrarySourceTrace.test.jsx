import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import LibrarySourceTrace, { authorLine } from './LibrarySourceTrace';

const source = {
  createdAt: '2026-07-27T12:00:00.000Z',
  authorPieces: 4,
  provenance: {
    sourceLabel: 'Readwise Reader',
    author: 'Ada Example',
    publicationDate: '2026-07-20',
    importedAt: '2026-07-27T12:00:00.000Z'
  },
  relevance: {
    connected: [
      { type: 'concept', id: 'concept-1', title: 'Inference economics', href: '/think?tab=concepts&concept=Inference%20economics' },
      { type: 'concept', id: 'concept-2', title: 'Unsafe', href: '//example.com' },
      { type: 'wiki_page', id: 'page-1', title: 'Said by the reader instead', href: '/wiki/workspace?page=page-1' }
    ]
  }
};

const renderTrace = (props) => render(<MemoryRouter><LibrarySourceTrace {...props} /></MemoryRouter>);

describe('LibrarySourceTrace', () => {
  it('records who wrote it, when it was published and saved, and its concepts', () => {
    renderTrace({ source });
    expect(screen.getByText('Source record')).toBeInTheDocument();
    expect(screen.getByText('Ada Example · Published Jul 20, 2026 · Saved Jul 27, 2026 · Readwise Reader')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Inference economics' }))
      .toHaveAttribute('href', '/think?tab=concepts&concept=Inference%20economics');
    expect(screen.queryByText('Unsafe')).not.toBeInTheDocument();
    expect(screen.queryByText('Said by the reader instead')).not.toBeInTheDocument();
  });

  it('recognises an author you keep returning to, from the third piece on', () => {
    renderTrace({ source });
    expect(screen.getByRole('link', { name: 'Your fourth piece by Ada Example.' }))
      .toHaveAttribute('href', '/library?aq=Ada%20Example');
    expect(authorLine('Ada Example', 2)).toBe('');
    expect(authorLine('Ada Example', 3)).toBe('Your third piece by Ada Example.');
    expect(authorLine('', 9)).toBe('');
  });

  it('is quiet when nothing links, and honest while loading or failing', () => {
    const { rerender } = renderTrace({ source: { provenance: {}, relevance: { connected: [] } } });
    expect(screen.queryByText(/Not used/)).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    rerender(<MemoryRouter><LibrarySourceTrace source={null} loading /></MemoryRouter>);
    expect(screen.getByText('Finding where this piece went…')).toBeInTheDocument();
    rerender(<MemoryRouter><LibrarySourceTrace source={null} error="network" /></MemoryRouter>);
    expect(screen.getByText('The piece is here, but where it is used could not be loaded.')).toBeInTheDocument();
  });
});
