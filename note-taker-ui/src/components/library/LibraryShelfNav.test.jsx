import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import LibraryShelfNav from './LibraryShelfNav';

const FOLDERS = ['Investing', 'Macro', 'Biology'].map((name, index) => ({ _id: `f${index}`, name }));

const setViewport = (narrow) => {
  window.matchMedia = () => ({
    matches: narrow,
    addEventListener() {},
    removeEventListener() {}
  });
};

const renderNav = (props = {}) => render(
  <LibraryShelfNav
    folders={FOLDERS}
    scope="all"
    unfiledCount={6}
    onReviewFiling={() => {}}
    {...props}
  />
);

describe('LibraryShelfNav', () => {
  const realMatchMedia = window.matchMedia;
  afterEach(() => { window.matchMedia = realMatchMedia; });

  describe('on the desktop rail', () => {
    beforeEach(() => setViewport(false));

    it('is one faint list: the ways of moving, the shelves, and the filing', () => {
      renderNav();
      expect(screen.getByRole('button', { name: 'All sources' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Unfiled 6' })).toBeInTheDocument();
      expect(screen.getByRole('searchbox', { name: 'Search library' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Investing' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Review filing' })).toBeInTheDocument();
      // Nothing is folded away where the reading was never displaced.
      expect(screen.queryByRole('button', { name: /shelves$/ })).not.toBeInTheDocument();
    });

    it('keeps every existing shelf in the cabinet, even for a large library', () => {
      const manyFolders = Array.from({ length: 32 }, (_, index) => ({
        _id: `folder-${index}`,
        name: `Shelf ${String(index + 1).padStart(2, '0')}`
      }));
      renderNav({ folders: manyFolders });

      expect(screen.getAllByRole('button', { name: /^Shelf / })).toHaveLength(32);
      expect(screen.getByRole('button', { name: 'Shelf 32' })).toBeInTheDocument();
    });

    it('states whether the cabinet is still loading or failed to load', () => {
      const { rerender } = renderNav({ folders: [], foldersLoading: true });
      expect(screen.getByRole('status')).toHaveTextContent('Loading shelves');

      rerender(
        <LibraryShelfNav
          folders={[]}
          foldersError="Failed to load folders."
          scope="all"
          unfiledCount={6}
          onReviewFiling={() => {}}
        />
      );
      expect(screen.getByRole('alert')).toHaveTextContent('Failed to load folders.');
      expect(screen.queryByText('No shelves yet.')).not.toBeInTheDocument();
    });
  });

  describe('on a phone', () => {
    beforeEach(() => setViewport(true));

    it('keeps the three ways of moving out and folds the cabinet shut', () => {
      renderNav();
      expect(screen.getByRole('button', { name: 'All sources' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Highlights' })).toBeInTheDocument();
      // The folder names and the filing chore no longer sit above the reading.
      expect(screen.queryByRole('button', { name: 'Investing' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Review filing' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: '3 shelves' })).toHaveAttribute('aria-expanded', 'false');
    });

    it('opens the cabinet on request, and closes it again', () => {
      renderNav();
      fireEvent.click(screen.getByRole('button', { name: '3 shelves' }));

      expect(screen.getByRole('button', { name: 'Investing' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Review filing' })).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Close the cabinet' }));
      expect(screen.queryByRole('button', { name: 'Investing' })).not.toBeInTheDocument();
    });

    it('leaves the cabinet open when a folder is the shelf you are on', () => {
      renderNav({ scope: 'folder', folderId: 'f1' });
      expect(screen.getByRole('button', { name: 'Macro' })).toHaveAttribute('aria-current', 'true');
      expect(screen.queryByRole('button', { name: '3 shelves' })).not.toBeInTheDocument();
    });

    it('says nothing about a cabinet that has no shelves in it', () => {
      renderNav({ folders: [] });
      expect(screen.queryByRole('button', { name: /shelves$/ })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Review filing' })).toBeInTheDocument();
    });
  });

  describe('the kept shelf', () => {
    beforeEach(() => setViewport(false));

    /* It used to hide until something was kept, so the only way to find the
       shelf was to have already used a control you could not find either. The
       empty shelf is where the idea explains itself. */
    it('is there even when nothing is kept, and counts once something is', () => {
      const { unmount } = renderNav({ keptCount: 0 });
      expect(screen.getByRole('button', { name: 'Kept 0' })).toBeInTheDocument();
      unmount();

      renderNav({ keptCount: 3 });
      expect(screen.getByRole('button', { name: 'Kept 3' })).toBeInTheDocument();
    });

    it('sits directly under All sources, above the ways of narrowing', () => {
      renderNav({ keptCount: 2 });
      const labels = [...document.querySelectorAll('.library-shelf__scopes button')].map(b => b.textContent);
      expect(labels).toEqual(['All sources', 'Kept2', 'Unfiled6', 'Highlights']);
    });

    it('is a way of moving, so it stays out on a phone', () => {
      setViewport(true);
      renderNav({ keptCount: 2 });
      expect(screen.getByRole('button', { name: 'Kept 2' })).toBeInTheDocument();
    });
  });
});
