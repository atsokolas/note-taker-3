import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
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
