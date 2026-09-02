import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { render } from '@testing-library/react';
import LibraryColumn from './LibraryColumn';

/*
 * Two shelves, two shapes.
 *
 * Later and Set aside are a queue you decide your way down, so they read as a
 * feed — enough of each piece to judge whether it is still worth a morning.
 * Kept is not a queue; nothing on it is owed anything, and you come to it to
 * look across rather than down, so it reads as a gallery.
 *
 * Everything else stays a list, because a list is what you want when you are
 * looking for one known thing.
 */

const shelf = (props) => render(
  <MemoryRouter>
    <LibraryColumn allArticles={[]} keptPages={[]} entering={false} {...props} />
  </MemoryRouter>
);

const source = (id, title, extra = {}) => ({
  _id: id,
  title,
  siteName: 'SemiAnalysis',
  firstGraph: 'A long opening paragraph that says enough about the piece to decide by.',
  createdAt: '2026-08-01T00:00:00.000Z',
  placementAt: '2026-08-01T00:00:00.000Z',
  ...extra
});

const shapeOf = () => {
  const list = document.querySelector('.library-column__shelf');
  return list ? [...list.classList].find(name => name.startsWith('library-column__shelf--')) : null;
};

const deks = () => [...document.querySelectorAll('.library-column__row-dek')].map(n => n.textContent);

describe('the shape of a shelf', () => {
  it('reads Later as a feed', () => {
    shelf({ shelf: 'later', articles: [source('a', 'Owed a move', { placement: 'later' })] });
    expect(shapeOf()).toBe('library-column__shelf--feed');
  });

  it('reads Set aside as a feed', () => {
    shelf({ shelf: 'set-aside', articles: [source('a', 'At hand', { placement: 'setAside' })] });
    expect(shapeOf()).toBe('library-column__shelf--feed');
  });

  it('reads Kept as a gallery', () => {
    shelf({
      shelf: 'kept',
      articles: [source('a', 'Held for life', { evergreen: true, evergreenAt: '2026-01-01T00:00:00.000Z' })]
    });
    expect(shapeOf()).toBe('library-column__shelf--gallery');
  });

  /* Two, because the first source on an ordinary shelf is lifted out as the
     thing to continue and never reaches the list. */
  it('leaves an ordinary shelf a list', () => {
    const rows = [source('a', 'Just a source'), source('b', 'And another')];
    shelf({ shelf: 'all', articles: rows, allArticles: rows });
    expect(shapeOf()).toBe('library-column__shelf--list');
  });
});

describe('what each shape carries', () => {
  it('gives a feed row enough of the piece to judge it by', () => {
    shelf({ shelf: 'later', articles: [source('a', 'Owed a move', { placement: 'later' })] });
    expect(deks()).toHaveLength(1);
    expect(deks()[0]).toMatch(/decide by/);
  });

  /* A gallery card with a paragraph in it is a feed with the rows laid
     sideways, and the point of the gallery is seeing the shelf at once. */
  it('keeps a gallery card to its name', () => {
    shelf({
      shelf: 'kept',
      articles: [source('a', 'Held for life', { evergreen: true, evergreenAt: '2026-01-01T00:00:00.000Z' })]
    });
    expect(deks()).toEqual([]);
  });

  it('says nothing where a source has no opening to show', () => {
    shelf({ shelf: 'later', articles: [source('a', 'Owed a move', { placement: 'later', firstGraph: '' })] });
    expect(deks()).toEqual([]);
  });

  /* The link and the button used to carry two copies of the row body, and the
     copies had drifted: only the link printed the kind. */
  it('prints the same row whether it is reached by link or by press', () => {
    shelf({
      shelf: 'kept',
      articles: [source('a', 'A source on the shelf', { evergreen: true, evergreenAt: '2026-01-01T00:00:00.000Z' })],
      keptPages: [{
        _id: 'p1',
        title: 'A page on the shelf',
        evergreen: true,
        evergreenAt: '2026-02-01T00:00:00.000Z'
      }]
    });
    const rows = [...document.querySelectorAll('.library-column__shelf li')];
    expect(rows).toHaveLength(2);
    rows.forEach(row => {
      expect(row.querySelector('.library-column__row-title')).toBeTruthy();
      expect(row.querySelector('.library-column__row-date')).toBeTruthy();
    });
  });
});
