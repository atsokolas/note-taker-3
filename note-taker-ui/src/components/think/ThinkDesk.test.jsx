import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { getLibraryCollection } from '../../api/libraryCollection';
import ThinkDesk from './ThinkDesk';
import { getNotebookCuttings } from '../../api/notebook';

jest.mock('../../api/libraryCollection', () => ({ getLibraryCollection: jest.fn() }));
jest.mock('../../api/notebook', () => ({ getNotebookCuttings: jest.fn() }));

const DAY = 24 * 60 * 60 * 1000;
const ago = days => new Date(Date.now() - days * DAY).toISOString();

it('remembers what you started a year ago this week and lets old ideas fade', async () => {
  getNotebookCuttings.mockResolvedValue([]);
  getLibraryCollection.mockResolvedValue({ items: [] });
  const onOpen = jest.fn();
  const begun = { id: 'essay', kind: 'note', title: 'On slow reading', createdAt: ago(366), updatedAt: ago(200), board: { movedAt: ago(200) } };
  const ideas = [
    { id: 'fresh', kind: 'note', title: 'Margins as memory', updatedAt: ago(2) },
    { id: 'old', kind: 'note', title: 'A shelf for questions', updatedAt: ago(60) }
  ];
  render(<ThinkDesk working={[]} ideas={ideas} closed={[begun]} onOpen={onOpen} onView={jest.fn()} onStart={jest.fn()} />);

  expect(screen.getByText(/A year ago this week you started/)).toHaveTextContent('A year ago this week you started On slow reading.');
  fireEvent.click(screen.getByRole('button', { name: 'On slow reading' }));
  expect(onOpen).toHaveBeenCalledWith(begun);
  expect(screen.getByText('A shelf for questions').closest('li')).toHaveAttribute('data-ink', 'faded');
  expect(screen.getByText('Margins as memory').closest('li')).not.toHaveAttribute('data-ink');
  await screen.findByRole('heading', { name: 'Nothing is underway.' });
});

it('shows a bounded shelf of actual Keepers and links to the source', async () => {
  getNotebookCuttings.mockResolvedValue([]);
  getLibraryCollection.mockResolvedValue({ items: [{ _id: 'source-1', title: 'The craft of attention' }] });
  render(<ThinkDesk working={[]} ideas={[]} closed={[]} />);
  expect(getLibraryCollection).toHaveBeenCalledWith({ scope: 'kept', limit: 4 });
  expect(await screen.findByRole('link', { name: 'The craft of attention' })).toHaveAttribute('href', '/library?articleId=source-1');
  expect(screen.getByRole('link', { name: 'Browse keepers' })).toHaveAttribute('href', '/library?scope=kept');
});
