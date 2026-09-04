import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import {
  clearSentenceHandoff,
  handOffSentence
} from '../../motion/columnMotion';
import LibraryPiles from './LibraryPiles';

const later = (id, at) => ({
  _id: id,
  title: id,
  placement: 'later',
  placementAt: at
});

const aside = (id, at) => ({
  _id: id,
  title: id,
  placement: 'setAside',
  placementAt: at
});

const piece = (id) => ({
  dataTransfer: {
    types: ['application/x-noeis-article-id'],
    getData: () => id,
    setData: () => {},
    dropEffect: ''
  }
});

describe('LibraryPiles', () => {
  it('is absent when nothing is parked', () => {
    const { container } = render(<LibraryPiles articles={[{ _id: 'open', placement: 'stream' }]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('lists Later oldest owed first and fans Set aside newest on top', () => {
    const onSelect = jest.fn();
    const onDone = jest.fn();
    render(
      <LibraryPiles
        articles={[
          later('new-later', '2026-08-20T00:00:00.000Z'),
          later('old-later', '2026-06-01T00:00:00.000Z'),
          aside('old-aside', '2026-06-01T00:00:00.000Z'),
          aside('new-aside', '2026-08-20T00:00:00.000Z'),
          { _id: 'stream', placement: 'stream' }
        ]}
        onSelect={onSelect}
        onDone={onDone}
      />
    );

    const laterTitles = [...document.querySelectorAll('.library-pile--later .library-pile__title')]
      .map((button) => button.textContent);
    expect(laterTitles).toEqual(['old-later', 'new-later']);
    expect(screen.queryByRole('button', { name: 'new-aside' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Open the stack' }));
    const asideTitles = [...document.querySelectorAll('.library-pile--setAside .library-pile__title')]
      .map((button) => button.textContent);
    expect(asideTitles).toEqual(['new-aside', 'old-aside']);

    fireEvent.click(screen.getByRole('button', { name: 'old-later' }));
    expect(onSelect).toHaveBeenCalledWith('old-later');
    fireEvent.click(screen.getAllByRole('button', { name: 'Done' })[0]);
    expect(onDone).toHaveBeenCalledWith('old-later');
  });

  it('never prints a zero for an empty pile', () => {
    render(<LibraryPiles articles={[later('only', '2026-08-20T00:00:00.000Z')]} />);
    expect(screen.getByLabelText('Later')).toBeInTheDocument();
    expect(screen.queryByLabelText('Set aside')).not.toBeInTheDocument();
    expect(screen.queryByText(/Later \(0\)/)).not.toBeInTheDocument();
  });
});

describe('sentence-flight onto the piles', () => {
  const origin = {
    getBoundingClientRect: () => ({ top: 20, left: 40, width: 180, height: 24 })
  };
  const originalMatchMedia = window.matchMedia;

  beforeEach(() => {
    clearSentenceHandoff();
    jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      top: 400, left: 80, width: 240, height: 28, right: 320, bottom: 428
    });
    HTMLElement.prototype.animate = jest.fn(() => ({ finished: Promise.resolve() }));
  });

  afterEach(() => {
    clearSentenceHandoff();
    window.matchMedia = originalMatchMedia;
    jest.restoreAllMocks();
    delete HTMLElement.prototype.animate;
  });

  it('flies the matching Later title from where it was handed off', () => {
    handOffSentence('old-later', origin);
    render(
      <LibraryPiles
        articles={[
          later('new-later', '2026-08-20T00:00:00.000Z'),
          later('old-later', '2026-06-01T00:00:00.000Z')
        ]}
      />
    );
    const title = screen.getByRole('button', { name: 'old-later' });
    expect(title.animate).toHaveBeenCalledTimes(1);
    expect(title.closest('.library-pile')).toHaveClass('is-warm');
  });

  it('opens the Set aside fan so the matching title can land', () => {
    handOffSentence('new-aside', origin);
    render(
      <LibraryPiles articles={[aside('new-aside', '2026-08-20T00:00:00.000Z')]} />
    );
    const title = screen.getByRole('button', { name: 'new-aside' });
    expect(screen.queryByRole('button', { name: 'Open the stack' })).not.toBeInTheDocument();
    expect(title.animate).toHaveBeenCalledTimes(1);
    expect(title.closest('.library-pile')).toHaveClass('noeis-meander', 'is-open', 'is-warm');
    expect(title.closest('.library-pile__sheet')).not.toBeNull();
  });

  it('lets you close the stack', () => {
    render(
      <LibraryPiles articles={[aside('new-aside', '2026-08-20T00:00:00.000Z')]} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Open the stack' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close the stack' }));
    expect(screen.getByRole('button', { name: 'Open the stack' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'new-aside' })).not.toBeInTheDocument();
  });

  it('lands in place when motion is reduced', () => {
    window.matchMedia = jest.fn().mockImplementation((query) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      addEventListener() {},
      removeEventListener() {}
    }));
    handOffSentence('old-later', origin);
    render(<LibraryPiles articles={[later('old-later', '2026-06-01T00:00:00.000Z')]} />);
    const title = screen.getByRole('button', { name: 'old-later' });
    expect(title.animate).not.toHaveBeenCalled();
    expect(title.closest('.library-pile')).toHaveClass('is-warm');
  });
});

/* The stack counts materially: one drawn folio edge per piece up to five,
   then 5+, because a pile that looks the same at six as at sixty is lying
   about its weight. */
describe('the Set aside stack', () => {
  const parked = (n) => Array.from({ length: n }, (_, i) => ({
    _id: `s${i}`,
    title: `Piece ${i}`,
    placement: 'setAside',
    placementAt: `2026-09-0${(i % 9) + 1}T12:00:00.000Z`
  }));

  const edges = () => document.querySelectorAll('.library-pile__leaf').length;

  it('draws one edge per piece', () => {
    render(<LibraryPiles articles={parked(3)} />);
    expect(edges()).toBe(3);
    expect(screen.queryByText('5+')).toBeNull();
  });

  it('stops drawing at five and says how it stopped', () => {
    render(<LibraryPiles articles={parked(9)} />);
    expect(edges()).toBe(5);
    expect(screen.getByText('5+')).toBeInTheDocument();
  });

  it('does not say 5+ at exactly five', () => {
    render(<LibraryPiles articles={parked(5)} />);
    expect(edges()).toBe(5);
    expect(screen.queryByText('5+')).toBeNull();
  });

  it('parks a piece dropped onto a pile, in the pile’s own terms', () => {
    const onPlace = jest.fn();
    render(
      <LibraryPiles
        articles={[
          later('old-later', '2026-06-01T00:00:00.000Z'),
          aside('new-aside', '2026-08-20T00:00:00.000Z')
        ]}
        onPlace={onPlace}
      />
    );
    const laterPile = screen.getByLabelText('Later');
    fireEvent.dragOver(laterPile, piece('a1'));
    expect(laterPile.classList.contains('is-drop-target')).toBe(true);
    expect(screen.getByRole('status')).toHaveTextContent('park it here');
    fireEvent.drop(laterPile, piece('a1'));
    expect(onPlace).toHaveBeenCalledWith('a1', 'later');

    fireEvent.click(screen.getByRole('button', { name: 'Open the stack' }));
    const asidePile = screen.getByLabelText('Set aside');
    fireEvent.drop(asidePile, piece('a2'));
    expect(onPlace).toHaveBeenCalledWith('a2', 'setAside');
  });

  it('a parked row travels: onto the other pile re-parks it', () => {
    const onPlace = jest.fn();
    render(
      <LibraryPiles
        articles={[later('old-later', '2026-06-01T00:00:00.000Z')]}
        onPlace={onPlace}
      />
    );
    const row = screen.getByRole('button', { name: 'old-later' }).closest('li');
    expect(row.getAttribute('draggable')).toBe('true');
  });

  it('a display-only pile invites no drop', () => {
    render(<LibraryPiles articles={[later('old-later', '2026-06-01T00:00:00.000Z')]} />);
    const laterPile = screen.getByLabelText('Later');
    fireEvent.dragOver(laterPile, piece('a1'));
    expect(laterPile.classList.contains('is-drop-target')).toBe(false);
    fireEvent.drop(laterPile, piece('a1'));
  });

  it('prints appointed mornings at the foot of Later, and silence without them', () => {
    const onSelect = jest.fn();
    const ledger = [
      { key: 'q1', articleId: 'a1', title: 'The Costco 10-K', href: '/library?articleId=a1', day: 'TUE' },
      { key: 'q2', articleId: 'a2', title: 'Berkshire letter', href: '/library?articleId=a2', day: '' }
    ];
    render(
      <LibraryPiles
        articles={[later('old-later', '2026-06-01T00:00:00.000Z')]}
        ledger={ledger}
        onSelect={onSelect}
      />
    );
    const list = screen.getByLabelText('Promised returns');
    expect(list).toHaveTextContent('asked back —');
    expect(list).toHaveTextContent('TUE');
    fireEvent.click(screen.getByRole('button', { name: 'The Costco 10-K' }));
    expect(onSelect).toHaveBeenCalledWith('a1');
  });

  it('omits the ledger when nothing is appointed', () => {
    render(<LibraryPiles articles={[later('old-later', '2026-06-01T00:00:00.000Z')]} />);
    expect(screen.queryByLabelText('Promised returns')).not.toBeInTheDocument();
  });
});
