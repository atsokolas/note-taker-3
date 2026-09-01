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
