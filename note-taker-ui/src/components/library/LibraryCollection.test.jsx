import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import LibraryCollection from './LibraryCollection';
import {
  getLibraryCollection,
  getLibraryCollectionTraces,
  getLibraryPeek
} from '../../api/libraryCollection';
import { saveArticleReadingState } from '../../api/articleReadingState';
jest.mock('../../api/libraryCollection');
jest.mock('../../api/articleReadingState');
const row = {
  _id: 'a',
  title: 'A quiet reading',
  placement: 'later',
  evergreen: true
};
const renderCollection = (extra) =>
  render(
    <MemoryRouter>
      <LibraryCollection
        scope="all"
        query=""
        keptPages={[]}
        onQueryChange={jest.fn()}
        onSortChange={jest.fn()}
        {...extra}
      />
    </MemoryRouter>
  );
beforeEach(() => {
  jest.clearAllMocks();
  getLibraryCollection.mockResolvedValue({
    items: [row],
    total: 1,
    nextOffset: null
  });
  getLibraryCollectionTraces.mockResolvedValue([]);
  getLibraryPeek.mockResolvedValue({
    ...row,
    content: '<p>The real passage that the reader can return to.</p>',
    highlights: []
  });
});
test('a title opens directly while Peek never saves a reading position and Escape restores focus', async () => {
  const onSelectArticle = jest.fn();
  renderCollection({ onSelectArticle });
  fireEvent.click(
    await screen.findByRole('button', { name: 'A quiet reading' })
  );
  expect(onSelectArticle).toHaveBeenCalledWith('a', {});
  const trigger = screen.getByRole('button', { name: 'Peek: A quiet reading' });
  fireEvent.click(trigger);
  fireEvent.click(
    await screen.findByRole('button', { name: 'Read from here →' })
  );
  expect(onSelectArticle).toHaveBeenLastCalledWith(
    'a',
    expect.objectContaining({
      anchor: expect.objectContaining({
        text: 'The real passage that the reader can return to.'
      })
    })
  );
  expect(saveArticleReadingState).not.toHaveBeenCalled();
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(trigger).toHaveFocus();
  expect(
    screen.queryByRole('button', { name: 'Read from here →' })
  ).not.toBeInTheDocument();
});

test('paints the collection before personal traces finish enriching it', async () => {
  let resolveTraces;
  getLibraryCollectionTraces.mockReturnValue(new Promise(resolve => { resolveTraces = resolve; }));
  renderCollection();

  expect(await screen.findByRole('button', { name: 'A quiet reading' })).toBeInTheDocument();
  expect(screen.queryByText('A thought already held')).not.toBeInTheDocument();

  await act(async () => {
    resolveTraces([{ articleId: 'a', trace: { kind: 'thought', text: 'A thought already held' } }]);
  });
  expect(screen.getByText('A thought already held')).toBeInTheDocument();
});
test('one Peek at a time, including keyboard search access', async () => {
  getLibraryCollection.mockResolvedValue({
    items: [row, { ...row, _id: 'b', title: 'Another reading' }],
    total: 2,
    nextOffset: null
  });
  renderCollection({});
  await screen.findByText('A quiet reading');
  fireEvent.click(
    screen.getByRole('button', { name: 'Peek: A quiet reading' })
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Peek: Another reading' })
  );
  await waitFor(() =>
    expect(document.querySelectorAll('.library-inline-peek')).toHaveLength(1)
  );
  expect(document.getElementById('peek-b')).toBeInTheDocument();
  fireEvent.keyDown(document, { key: '/' });
  expect(screen.getByRole('searchbox')).toHaveFocus();
});
test('a row opens its peek when tapped, without a label to aim at', async () => {
  renderCollection({});
  await screen.findByText('A quiet reading');
  expect(screen.queryByText(/Peek \+/)).not.toBeInTheDocument();
  fireEvent.click(document.querySelector('.library-source-meta'));
  expect(document.getElementById('peek-a')).toBeInTheDocument();
  fireEvent.click(document.querySelector('.library-source-meta'));
  expect(document.getElementById('peek-a')).not.toBeInTheDocument();
});
test('sort uses the same disclosure menu as the rest of Library tools', async () => {
  const onSortChange = jest.fn();
  renderCollection({ onSortChange });

  await screen.findByText('A quiet reading');
  const summary = document.querySelector('.library-sort summary');
  fireEvent.click(summary);
  fireEvent.click(screen.getByRole('button', { name: 'Oldest first' }));

  expect(onSortChange).toHaveBeenCalledWith('oldest');
  expect(summary.closest('details').open).toBe(false);
});
test('Keepers retains pages and beliefs alongside sources, including retired beliefs and undo', async () => {
  const undo = jest.fn(async () => {});
  renderCollection({
    scope: 'kept',
    onUndoLetGo: undo,
    letGo: { id: 'old', title: 'Let go source' },
    keptPages: [
      { _id: 'p1', title: 'A useful page', evergreen: true },
      {
        _id: 'p2',
        title: 'A belief',
        evergreen: true,
        judgment: { currentJudgment: 'The belief I hold.' },
        claims: [
          { claimId: 'c1', checkInStatus: 'retired', retiredAt: '2026-09-06' }
        ]
      }
    ]
  });
  await screen.findByText('A quiet reading');
  expect(screen.getByRole('link', { name: 'A useful page' })).toHaveAttribute(
    'href',
    '/wiki/p1'
  );
  expect(
    screen.getByRole('link', { name: 'The belief I hold.' }).closest('li')
  ).toHaveClass('is-retired');
  fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
  expect(undo).toHaveBeenCalledWith({ id: 'old', title: 'Let go source' });
});
test('missing kept pages are not claimed to be an empty canon', async () => {
  getLibraryCollection.mockResolvedValue({
    items: [],
    total: 0,
    nextOffset: null
  });
  renderCollection({ scope: 'kept', keptPages: null });
  await waitFor(() => expect(getLibraryCollection).toHaveBeenCalled());
  expect(screen.queryByText('Nothing here yet.')).not.toBeInTheDocument();
});

test('a search offers a trail on the same words', async () => {
  renderCollection({ query: 'attention ' });
  expect(await screen.findByRole('link', { name: 'What to read next on it →' }))
    .toHaveAttribute('href', '/library/trail?subject=attention');
});

test('the nightstand reads by the evening: minutes, why, tonight, and a month asked about', async () => {
  const daysAgo = n => new Date(Date.now() - n * 86400000).toISOString();
  getLibraryCollection.mockResolvedValue({
    items: [
      { _id: 'old', title: 'Waited A Month', placement: 'later', placementAt: daysAgo(40), minutes: 30 },
      { _id: 'short', title: 'The Shape of Attention', placement: 'later', placementAt: daysAgo(3), minutes: 12, placementReason: 'Sam sent this' },
      { _id: 'long', title: 'The Long Read on Chips', placement: 'later', placementAt: daysAgo(5), minutes: 45 }
    ],
    total: 3,
    nextOffset: null
  });
  const onPlace = jest.fn().mockResolvedValue({});
  const onSelectArticle = jest.fn();
  renderCollection({ scope: 'later', onPlace, onSelectArticle });

  const line = await screen.findByText(/^Tonight:/);
  expect(line).toHaveTextContent('Tonight: The Shape of Attention (12 min). For the weekend: Waited A Month (30 min).');
  fireEvent.click(screen.getAllByRole('button', { name: 'The Shape of Attention' })[0]);
  expect(onSelectArticle).toHaveBeenCalledWith('short', {});
  expect(screen.getByText('Sam sent this')).toBeInTheDocument();
  expect(screen.getByText('12 min')).toBeInTheDocument();

  // The month-old piece waits at the bottom, asked about, never removed.
  const titles = [...document.querySelectorAll('.library-collection-row .library-source-title')].map(node => node.textContent);
  expect(titles).toEqual(['The Shape of Attention', 'The Long Read on Chips', 'Waited A Month']);
  expect(screen.getByText('Been waiting a while')).toBeInTheDocument();
  expect(screen.getAllByText(/Still want this\?/)).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: 'Keep it' }));
  expect(onPlace).toHaveBeenCalledWith('old', 'later');
  fireEvent.click(screen.getByRole('button', { name: 'Let it go' }));
  expect(onPlace).toHaveBeenCalledWith('old', 'stream');
  expect(await screen.findByText(/It stays in your Library\./)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
  expect(onPlace).toHaveBeenLastCalledWith('old', 'later');
});
