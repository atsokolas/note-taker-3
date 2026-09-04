import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import {
  clearSentenceHandoff,
  handOffSentence
} from '../../motion/columnMotion';
import LibraryFeedColumn from './LibraryFeedColumn';
import { listReturnQueue } from '../../api/returnQueue';

jest.mock('../../api/returnQueue', () => ({
  listReturnQueue: jest.fn(),
  createReturnQueueEntry: jest.fn(),
  updateReturnQueueEntry: jest.fn()
}));

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
  beforeEach(() => {
    jest.clearAllMocks();
    listReturnQueue.mockResolvedValue([]);
  });
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
      />
    );

    const titles = [...document.querySelectorAll('.library-feed__title')].map((node) => node.textContent);
    expect(titles).toEqual(['August letter', 'January letter']);
    expect(screen.getByText('A finished sentence about power.')).toBeInTheDocument();
    expect(screen.getAllByText('Stratechery').length).toBeGreaterThan(0);
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(screen.queryByText(/Feed/i)).not.toBeInTheDocument();
    expect(document.querySelector('.library-feed')).toHaveClass('noeis-meander');
    expect(document.querySelector('.wfp-anim')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /August letter/ }));
    expect(onSelect).toHaveBeenCalledWith('new');
  });

  it('explains an empty topic a person went looking for, without a zero', () => {
    render(
      <LibraryFeedColumn
        folder={{ _id: 'news', name: 'Newsletters', asFeed: true }}
        articles={[]}
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
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Keep in Library' }));
    expect(onScreen).toHaveBeenCalledWith(false);
  });

  it('flies the topic name into the masthead', () => {
    const origin = {
      getBoundingClientRect: () => ({ top: 20, left: 40, width: 120, height: 20 })
    };
    jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      top: 90, left: 24, width: 200, height: 22, right: 224, bottom: 112
    });
    HTMLElement.prototype.animate = jest.fn(() => ({ finished: Promise.resolve() }));
    handOffSentence('Newsletters', origin);
    render(
      <LibraryFeedColumn
        folder={{ _id: 'news', name: 'Newsletters', asFeed: true }}
        articles={[]}
      />
    );
    const name = document.querySelector('.library-column__eyebrow');
    expect(name.animate).toHaveBeenCalledTimes(1);
    clearSentenceHandoff();
    delete HTMLElement.prototype.animate;
    jest.restoreAllMocks();
  });
});

/* Screening is a decision, so it leaves a date — Pass 1's item 8, which was
   blocked until the cabinet's schema was in scope. */
describe('the screening receipt', () => {
  it('says the day this folder became a scroll', () => {
    render(
      <LibraryFeedColumn
        folder={{ _id: 'f1', name: 'Costco', asFeed: true, asFeedAt: '2026-08-03T12:00:00.000Z' }}
        folios={[]}
        onScreen={jest.fn()}
      />
    );
    expect(screen.getByText(/screened Aug 3/)).toBeInTheDocument();
  });

  it('says nothing for a folder screened before the product started recording it', () => {
    render(
      <LibraryFeedColumn
        folder={{ _id: 'f1', name: 'Costco', asFeed: true, asFeedAt: null }}
        folios={[]}
        onScreen={jest.fn()}
      />
    );
    expect(screen.queryByText(/screened/)).toBeNull();
  });
});

/* The switch travels onto the scroll in its compact form — one per folio,
   revealed on hover and on focus, with the same keys as the piles. */
describe('the folio switch', () => {
  const scroll = (props = {}) => render(
    <LibraryFeedColumn
      folder={{ _id: 'news', name: 'Newsletters', asFeed: true }}
      articles={[
        letter({ _id: 'new', title: 'August letter', updatedAt: '2026-08-20T00:00:00.000Z' })
      ]}
      onSelectArticle={() => {}}
      {...props}
    />
  );

  it('parks a folio from its own switch', async () => {
    const onPlace = jest.fn().mockResolvedValue({});
    scroll({ onPlace });
    const folio = document.querySelector('.library-feed__folio');
    const group = within(folio).getByRole('group', { name: 'Where this sits' });
    fireEvent.click(within(group).getByRole('button', { name: 'Put it in later' }));
    await waitFor(() => expect(onPlace).toHaveBeenCalledWith('new', 'later'));
  });

  it('parks a folio from its keys, the way the piles do', () => {
    const onPlace = jest.fn();
    scroll({ onPlace });
    const folio = document.querySelector('.library-feed__folio');
    fireEvent.keyDown(folio, { key: 's' });
    expect(onPlace).toHaveBeenCalledWith('new', 'setAside');
  });

  it('names the dragged folio on the gesture', () => {
    scroll({ onPlace: jest.fn() });
    const folio = document.querySelector('.library-feed__folio');
    expect(folio.getAttribute('draggable')).toBe('true');
    const setData = jest.fn();
    fireEvent.dragStart(folio, { dataTransfer: { setData } });
    expect(setData).toHaveBeenCalledWith('application/x-noeis-article-id', 'new');
  });

  it('a scroll without a parking verb shows no switch', () => {
    scroll();
    expect(document.querySelector('.library-feed__folio-switch')).toBeNull();
    expect(document.querySelector('.library-feed__folio').getAttribute('draggable')).toBe('true');
  });
});
