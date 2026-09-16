import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import LibraryCollection from './LibraryCollection';
import {
  getLibraryCollection,
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
  fireEvent.keyDown(window, { key: 'Escape' });
  expect(trigger).toHaveFocus();
  expect(
    screen.queryByRole('button', { name: 'Read from here →' })
  ).not.toBeInTheDocument();
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
  fireEvent.keyDown(window, { key: '/' });
  expect(screen.getByRole('searchbox')).toHaveFocus();
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
