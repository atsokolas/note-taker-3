import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { render, screen, within } from '@testing-library/react';
import LibraryColumn from './LibraryColumn';

/* The shelf reaches outside the article store, so every render here says what
   it knows about kept pages — [] for "read, and there are none", null for
   "not read yet". The distinction is load-bearing: see the last two cases. */
const shelf = ({ articles: rows = [], pages = [], ...rest }) => render(
  <MemoryRouter>
    <LibraryColumn
      shelf="kept"
      articles={rows}
      allArticles={rows}
      keptPages={pages}
      entering={false}
      {...rest}
    />
  </MemoryRouter>
);

const titlesOf = () => [...document.querySelectorAll('.library-column__row-title')].map(n => n.textContent);

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
    shelf({ articles });
    expect(titlesOf()).toEqual(['Kept longest ago', 'Kept in between', 'Kept most recently']);
  });

  it('says how many and how long, instead of a generic subtitle', () => {
    shelf({ articles });
    expect(screen.getByText('3 things you decided to keep. The oldest since November 2025.')).toBeInTheDocument();
  });

  it('does not lead with something to continue — you came here on purpose', () => {
    shelf({ articles });
    expect(screen.queryByText('Continue')).not.toBeInTheDocument();
  });

  it('teaches itself when nothing is kept yet', () => {
    shelf({ articles: [] });
    expect(screen.getByText(/press Keep for good/)).toBeInTheDocument();
  });

  it('leaves the ordinary shelf newest first', () => {
    render(
      <MemoryRouter>
        <LibraryColumn shelf="all" articles={articles} allArticles={articles} entering={false} />
      </MemoryRouter>
    );
    expect(titlesOf()[0]).not.toBe('Kept longest ago');
  });
});

/* The canon: a source you read, a page you built and a belief you hold as
   peers. Modelled and tested months ago, and until now never rendered. */
describe('the canon', () => {
  const pages = [
    { _id: 'p1', title: 'Reflexivity', evergreen: true, evergreenAt: '2026-06-02T12:00:00.000Z' },
    {
      _id: 'p2',
      title: 'Compute',
      evergreen: true,
      evergreenAt: '2025-01-15T12:00:00.000Z',
      judgment: { currentJudgment: 'Compute stays scarce.' }
    }
  ];

  it('stands all three kinds together, oldest decision first', () => {
    shelf({ articles, pages });
    expect(titlesOf()).toEqual([
      'Compute stays scarce.',
      'Kept longest ago',
      'Kept in between',
      'Reflexivity',
      'Kept most recently'
    ]);
  });

  it('names each kind in the reader’s language, not the schema’s', () => {
    shelf({ articles, pages });
    expect(screen.getByText('A belief you hold')).toBeInTheDocument();
    expect(screen.getByText('A page you built')).toBeInTheDocument();
    expect(screen.getAllByText('Something you read')).toHaveLength(3);
  });

  it('counts every kind in the line, not only the sources', () => {
    shelf({ articles, pages });
    expect(screen.getByText(/5 things you decided to keep/)).toBeInTheDocument();
  });

  it('dates a row by the decision, never by the last touch', () => {
    shelf({
      articles: [{ ...kept('a', 'Touched since', '2026-03-04T12:00:00.000Z'), updatedAt: '2026-08-30T12:00:00.000Z' }],
      pages: []
    });
    const row = screen.getByText('Touched since').closest('li');
    expect(within(row).getByText(/Mar/)).toBeInTheDocument();
    expect(within(row).queryByText(/Aug/)).toBeNull();
  });

  it('signs itself once it holds something', () => {
    shelf({ articles, pages });
    expect(screen.getByText('μνήμη · κρίσις')).toBeInTheDocument();
  });

  it('keeps its errata: a retired belief stays, struck, with the day it went', () => {
    shelf({
      articles: [],
      pages: [{
        ...pages[1],
        claims: [{ claimId: 'c1', checkInStatus: 'retired', retiredAt: '2026-09-06T12:00:00.000Z' }]
      }]
    });
    const row = screen.getByText('Compute stays scarce.').closest('li');
    expect(row).toHaveClass('is-retired');
    expect(within(row).getByText(/retired Sep 6/)).toBeInTheDocument();
  });

  it('says nothing about the canon until the canon has been read', () => {
    shelf({ articles: [], pages: null, loading: true });
    expect(screen.queryByText(/you decided to keep/)).toBeNull();
    expect(screen.queryByText(/press Keep for good/)).toBeNull();
    expect(screen.queryByText('μνήμη · κρίσις')).toBeNull();
  });

  it('will not count what it could not read, but still shows what it has', () => {
    // The pages request failed. The sources are known; the total is not.
    shelf({ articles, pages: null, loading: false });
    expect(titlesOf()).toHaveLength(3);
    expect(screen.queryByText(/things you decided to keep/)).toBeNull();
  });
});
