import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import LibraryFeedColumn from './LibraryFeedColumn';

const letter = (overrides = {}) => ({
  _id: 'n1',
  title: 'The letter',
  siteName: 'Stratechery',
  firstGraph: 'A finished sentence about power.',
  folder: { _id: 'news', name: 'Newsletters', asFeed: true },
  updatedAt: '2026-08-20T00:00:00.000Z',
  ...overrides
});

describe('LibraryFeedColumn', () => {
  it('is a stacked scroll of folios, not a title list, newest on top', () => {
    const onSelect = jest.fn();
    render(
      <LibraryFeedColumn
        folder={{ _id: 'news', name: 'Newsletters', asFeed: true }}
        articles={[
          letter({ _id: 'old', title: 'January letter', updatedAt: '2026-01-01T00:00:00.000Z', firstGraph: 'Old graph.' }),
          letter({ _id: 'new', title: 'August letter', updatedAt: '2026-08-20T00:00:00.000Z' }),
          letter({ _id: 'parked', title: 'Parked', placement: 'later', updatedAt: '2026-08-31T00:00:00.000Z' })
        ]}
        onSelectArticle={onSelect}
        entering={false}
      />
    );

    const titles = [...document.querySelectorAll('.library-feed__title')].map((node) => node.textContent);
    expect(titles).toEqual(['August letter', 'January letter']);
    expect(screen.getByText('A finished sentence about power.')).toBeInTheDocument();
    expect(screen.getAllByText('Stratechery').length).toBeGreaterThan(0);
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(screen.queryByText(/Feed/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /August letter/ }));
    expect(onSelect).toHaveBeenCalledWith('new');
  });

  it('explains an empty topic a person went looking for, without a zero', () => {
    render(
      <LibraryFeedColumn
        folder={{ _id: 'news', name: 'Newsletters', asFeed: true }}
        articles={[]}
        entering={false}
      />
    );
    expect(screen.getByRole('heading', { name: 'Newsletters' })).toBeInTheDocument();
    expect(screen.getByText(/Nothing open in Newsletters/)).toBeInTheDocument();
    expect(screen.queryByText(/Feed \(0\)/)).not.toBeInTheDocument();
  });

  it('lets you unscreen from the masthead', () => {
    const onScreen = jest.fn();
    render(
      <LibraryFeedColumn
        folder={{ _id: 'news', name: 'Newsletters', asFeed: true }}
        articles={[letter()]}
        onScreen={onScreen}
        entering={false}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Keep in Library' }));
    expect(onScreen).toHaveBeenCalledWith(false);
  });
});
