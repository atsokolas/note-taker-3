import React from 'react';
import { render, screen } from '@testing-library/react';
import LibraryColumn from './LibraryColumn';

const kept = (id, title, at) => ({
  _id: id, title, siteName: 'Somewhere', evergreen: true, evergreenAt: at, createdAt: at
});

const articles = [
  kept('new', 'Kept most recently', '2026-08-01T00:00:00.000Z'),
  kept('old', 'Kept longest ago', '2025-11-04T00:00:00.000Z'),
  kept('mid', 'Kept in between', '2026-03-01T00:00:00.000Z')
];

describe('the kept shelf', () => {
  it('leads with what you have held longest, which no other list here does', () => {
    render(<LibraryColumn shelf="kept" articles={articles} allArticles={articles} entering={false} />);
    const titles = [...document.querySelectorAll('.library-column__row-title')].map(n => n.textContent);
    expect(titles).toEqual(['Kept longest ago', 'Kept in between', 'Kept most recently']);
  });

  it('says how many and how long, instead of a generic subtitle', () => {
    render(<LibraryColumn shelf="kept" articles={articles} allArticles={articles} entering={false} />);
    expect(screen.getByText('3 things you decided to keep. The oldest since November 2025.')).toBeInTheDocument();
  });

  it('does not lead with something to continue — you came here on purpose', () => {
    render(<LibraryColumn shelf="kept" articles={articles} allArticles={articles} entering={false} />);
    expect(screen.queryByText('Continue')).not.toBeInTheDocument();
  });

  it('teaches itself when nothing is kept yet', () => {
    render(<LibraryColumn shelf="kept" articles={[]} allArticles={[]} entering={false} />);
    expect(screen.getByText(/press Keep for good/)).toBeInTheDocument();
  });

  it('leaves the ordinary shelf newest first', () => {
    render(<LibraryColumn shelf="all" articles={articles} allArticles={articles} entering={false} />);
    const titles = [...document.querySelectorAll('.library-column__row-title')].map(n => n.textContent);
    expect(titles[0]).not.toBe('Kept longest ago');
  });
});
