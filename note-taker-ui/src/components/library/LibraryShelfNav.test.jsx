import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import {
  clearSentenceHandoff,
  handOffSentence
} from '../../motion/columnMotion';
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
      expect(screen.getByRole('button', { name: 'At home' })).toBeInTheDocument();
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

    /* Still the calm door, in its new place. Needs Review is a queue the
       product keeps rather than a drawer the reader filled, so it leaves the
       cabinet and becomes one mono line under it — filed among their own
       folders it read as one of theirs. The backlog still never shouts. */
    it('makes Needs Review the calm door to triage instead of shouting the backlog', () => {
      const onSelectFolder = jest.fn();
      renderNav({
        folders: [{ _id: 'review', name: 'Needs Review' }],
        folderCounts: { review: 149 },
        sourceView: 'needs_review',
        onSelectFolder
      });

      const review = screen.getByRole('button', { name: 'Needs Review' });
      expect(review).toHaveAttribute('aria-current', 'true');
      expect(review.closest('.library-shelf__procedural')).not.toBeNull();
      expect(review.closest('.library-shelf__folders')).toBeNull();
      expect(screen.queryByText('149')).not.toBeInTheDocument();
      fireEvent.click(review);
      expect(onSelectFolder).toHaveBeenCalledWith('review');
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
      expect(screen.getByRole('button', { name: 'At home' })).toBeInTheDocument();
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

    it('does not carry the three places, at any width', () => {
      renderNav({});
      expect(screen.queryByRole('button', { name: /^Later/ })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^Set aside/ })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^Kept/ })).not.toBeInTheDocument();
    });
  });

  /* Later, Set aside and Kept used to stand in the cabinet among the folders
     as well as in the strip at the head of the room, so every one of them was
     named twice on the same screen. They are not folders — they are where a
     source stands — and the strip is where they live. */
  describe('the three places', () => {
    beforeEach(() => setViewport(false));

    it('is not in the cabinet', () => {
      renderNav({});
      const labels = [...document.querySelectorAll('.library-shelf__scopes button')].map(b => b.textContent);
      expect(labels).toEqual(['At home', 'Unfiled6', 'Highlights']);
    });

    it('leaves the cabinet to the shelves and the ways of narrowing', () => {
      renderNav({});
      expect(screen.getByRole('button', { name: 'At home' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Unfiled 6' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Highlights' })).toBeInTheDocument();
    });

    it('keeps counts silent until the Library has actually answered', () => {
      renderNav({ count: undefined, unfiledCount: undefined });

      expect(screen.getByRole('button', { name: 'At home' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Unfiled' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /At home 0/ })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Unfiled 0/ })).not.toBeInTheDocument();
    });
  });

  describe('screened topics', () => {
    beforeEach(() => setViewport(false));

    it('prints the folder name in living ink under At home, never the word Feed', () => {
      const onSelectFolder = jest.fn();
      renderNav({
        feedTopics: [{ id: 'news', name: 'Newsletters' }],
        onSelectFolder
      });
      const labels = [...document.querySelectorAll('.library-shelf__scopes button')].map(b => b.textContent);
      expect(labels[0]).toBe('At home');
      expect(labels[1]).toBe('Newsletters');
      expect(screen.queryByText(/^Feed/)).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Newsletters' }));
      expect(onSelectFolder).toHaveBeenCalledWith('news');
    });

    it('is silent when nothing is screened', () => {
      renderNav({ feedTopics: [] });
      expect(screen.queryByRole('button', { name: 'Newsletters' })).not.toBeInTheDocument();
      expect(screen.queryByText(/Feed \(0\)/)).not.toBeInTheDocument();
    });

    /* Reversed deliberately. This once asserted that a phone showed no topic
       rows, on the reasoning that the strip should stay short. But under 900px
       the cabinet folds away and the strip is the only door into a screened
       folder, so the old rule left a scroll unreachable on a phone — short and
       useless. The strip carries them at every width now. */
    it('carries a screened topic on a phone, where it is the only door in', () => {
      setViewport(true);
      renderNav({ feedTopics: [{ id: 'news', name: 'Newsletters' }] });
      expect(screen.getByRole('button', { name: 'Newsletters' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'At home' })).toBeInTheDocument();
    });

    it('flies the screened name onto the rail', () => {
      const origin = {
        getBoundingClientRect: () => ({ top: 20, left: 40, width: 120, height: 20 })
      };
      jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
        top: 80, left: 12, width: 160, height: 22, right: 172, bottom: 102
      });
      HTMLElement.prototype.animate = jest.fn(() => ({ finished: Promise.resolve() }));
      handOffSentence('Newsletters', origin);
      renderNav({ feedTopics: [{ id: 'news', name: 'Newsletters' }] });
      const label = screen.getByRole('button', { name: 'Newsletters' }).querySelector('span');
      expect(label.animate).toHaveBeenCalledTimes(1);
      clearSentenceHandoff();
      delete HTMLElement.prototype.animate;
      jest.restoreAllMocks();
    });
  });
});

/* Under 900px the cabinet folds away, and the places strip at the top of the
   Library column becomes the only door into a screened folder. Blanking the
   topics there left a scroll with no way in on a phone. */
describe('screened topics on a narrow viewport', () => {
  const realMatchMedia = window.matchMedia;
  afterEach(() => { window.matchMedia = realMatchMedia; });

  const TOPICS = [
    { id: 't1', name: 'Costco' },
    { id: 't2', name: 'Macro' }
  ];

  it('carries screened topics in the places strip when the cabinet has folded', () => {
    setViewport(true);
    renderNav({ feedTopics: TOPICS });

    expect(screen.getByRole('button', { name: /Costco/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Macro/ })).toBeInTheDocument();
  });

  it('keeps carrying them on a wide viewport, where they always worked', () => {
    setViewport(false);
    renderNav({ feedTopics: TOPICS });

    expect(screen.getByRole('button', { name: /Costco/ })).toBeInTheDocument();
  });

  it('adds nothing to the strip when no folder is screened', () => {
    setViewport(true);
    renderNav({ feedTopics: [] });

    expect(screen.queryByRole('button', { name: /Costco/ })).toBeNull();
  });

  it('ignores a topic with nothing to name it, rather than printing a blank door', () => {
    setViewport(true);
    renderNav({ feedTopics: [{ id: 't1', name: '' }, { id: '', name: 'Nameless' }] });

    expect(screen.queryByRole('button', { name: /Nameless/ })).toBeNull();
  });
});

/* The cabinet is a tree. */
describe('the cabinet', () => {
  const nested = [
    { _id: 'investing', name: 'Investing' },
    { _id: 'costco', name: 'Costco', parentFolderId: 'investing', asFeed: true },
    { _id: 'macro', name: 'Macro' }
  ];

  it('hangs a folder inside the drawer it belongs to', () => {
    renderNav({ folders: nested, folderCounts: { costco: 5, macro: 2 } });
    const costco = screen.getByRole('button', { name: /Costco/ }).closest('li');
    expect(costco).toHaveStyle('--depth: 1');
  });

  const branchNamed = (name) => [...document.querySelectorAll('.library-shelf__branch')]
    .find(row => row.querySelector('.room-shelf__item')?.textContent.includes(name));

  it('rolls counts up the tree', () => {
    renderNav({ folders: nested, folderCounts: { investing: 2, costco: 5 } });
    // Investing holds two of its own and five in Costco.
    expect(branchNamed('Investing')).toHaveTextContent('7');
  });

  it('does not glow a parent because a child is screened', () => {
    renderNav({ folders: nested, folderCounts: {} });
    expect(branchNamed('Costco')).toHaveClass('is-living');
    expect(branchNamed('Investing')).not.toHaveClass('is-living');
  });

  it('folds a drawer away and brings it back', () => {
    renderNav({ folders: nested, folderCounts: {} });
    expect(screen.getByRole('button', { name: /Costco/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Fold Investing' }));
    expect(screen.queryByRole('button', { name: /Costco/ })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Unfold Investing' }));
    expect(screen.getByRole('button', { name: /Costco/ })).toBeInTheDocument();
  });

  it('opens showing everything it holds, rather than making you hunt', () => {
    renderNav({ folders: nested, folderCounts: {} });
    expect(screen.getByRole('button', { name: /Costco/ })).toBeInTheDocument();
  });

  it('offers a disclosure only where there is something to disclose', () => {
    renderNav({ folders: nested, folderCounts: {} });
    expect(screen.queryByRole('button', { name: /Fold Macro/ })).toBeNull();
  });
});
