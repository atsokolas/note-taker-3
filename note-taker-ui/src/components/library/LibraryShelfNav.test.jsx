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
      expect(screen.getByRole('button', { name: 'Unfiled (6)' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Investing' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Review filing' })).toBeInTheDocument();
      // Nothing is folded away where the reading was never displaced.
      expect(screen.queryByRole('button', { name: /shelves$/ })).not.toBeInTheDocument();
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

    it('appears only once something has been kept', () => {
      renderNav({ keptCount: 0 });
      expect(screen.queryByRole('button', { name: /^Kept/ })).not.toBeInTheDocument();

      renderNav({ keptCount: 3 });
      expect(screen.getByRole('button', { name: 'Kept (3)' })).toBeInTheDocument();
    });

    it('is a way of moving, so it stays out on a phone', () => {
      setViewport(true);
      renderNav({ keptCount: 2 });
      expect(screen.getByRole('button', { name: 'Kept (2)' })).toBeInTheDocument();
    });
  });
});
