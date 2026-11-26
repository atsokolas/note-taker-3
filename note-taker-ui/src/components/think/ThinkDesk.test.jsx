import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { readKept, readThread, readWorld } from '../../api/home';
import ThinkDesk from './ThinkDesk';
import { getNotebookCuttings, quoteIntoNote } from '../../api/notebook';

jest.mock('../../api/home', () => ({ readKept: jest.fn(), readThread: jest.fn(), readWorld: jest.fn() }));
jest.mock('../../api/notebook', () => ({ getNotebookCuttings: jest.fn(), quoteIntoNote: jest.fn() }));

beforeEach(() => { readWorld.mockResolvedValue([]); });

const DAY = 24 * 60 * 60 * 1000;
const ago = days => new Date(Date.now() - days * DAY).toISOString();

it('remembers what you started a year ago this week, and lets old ideas fade and then sink', async () => {
  getNotebookCuttings.mockResolvedValue([]);
  readKept.mockResolvedValue([]);
  const onOpen = jest.fn();
  const begun = { id: 'essay', kind: 'note', title: 'On slow reading', createdAt: ago(366), updatedAt: ago(200), board: { movedAt: ago(200) } };
  const ideas = [
    { id: 'fresh', kind: 'note', title: 'Margins as memory', updatedAt: ago(2) },
    { id: 'settling', kind: 'note', title: 'A shelf for questions', updatedAt: ago(20) },
    { id: 'old', kind: 'note', title: 'Escher and software layers', updatedAt: ago(60) }
  ];
  const onView = jest.fn();
  render(<ThinkDesk working={[]} ideas={ideas} closed={[begun]} onOpen={onOpen} onView={onView} onStart={jest.fn()} />);

  expect(screen.getByText(/A year ago this week you started/)).toHaveTextContent('A year ago this week you started On slow reading.');
  fireEvent.click(screen.getByRole('button', { name: 'On slow reading' }));
  expect(onOpen).toHaveBeenCalledWith(begun);
  expect(screen.getByText('A shelf for questions').closest('li')).toHaveAttribute('data-ink', 'settled');
  expect(screen.getByText('Margins as memory').closest('li')).not.toHaveAttribute('data-ink');
  expect(screen.queryByText('Escher and software layers')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '1 more sank underneath. See all' }));
  expect(onView).toHaveBeenCalledWith('ideas');
  await screen.findByRole('heading', { name: 'Nothing is underway.' });
});

it('keeps what you kept beside the paragraph you stopped in, or else the latest you kept', async () => {
  getNotebookCuttings.mockResolvedValue([]);
  readKept.mockResolvedValue([
    { kind: 'mark', articleId: 'm1', highlightId: 'h1', title: 'Meditations', text: 'The best revenge is not to be like your enemy.' },
    { kind: 'mark', articleId: 'c1', highlightId: 'h2', title: "Poor Charlie's Almanack", text: 'Patience is the float that funds the moat.' },
    { kind: 'source', articleId: 's1', title: 'Going Founder Mode On Cancer' }
  ]);
  const draft = { id: 'moat', kind: 'note', title: 'On patience', updatedAt: ago(2), lastLine: 'Float is money that arrives early, and the moat is patience.' };
  const { unmount } = render(<ThinkDesk working={[draft]} ideas={[]} closed={[]} onOpen={jest.fn()} onView={jest.fn()} onStart={jest.fn()} />);
  expect(await screen.findByRole('heading', { name: 'Kept, for this paragraph' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /Patience is the float/ })).toHaveAttribute('href', expect.stringContaining('h2'));
  expect(screen.queryByText(/best revenge/)).not.toBeInTheDocument();
  unmount();

  render(<ThinkDesk working={[]} ideas={[]} closed={[]} />);
  expect(await screen.findByRole('heading', { name: 'Kept' })).toBeInTheDocument();
  expect(screen.getAllByRole('link').map(link => link.textContent)[0]).toBe('Going Founder Mode On Cancer');
  expect(screen.getByRole('link', { name: /Everything you keep/ })).toHaveAttribute('href', '/');
});

it('opens on the last thing you wrote, and the line below it is for the next sentence', async () => {
  getNotebookCuttings.mockResolvedValue([]);
  readKept.mockResolvedValue([]);
  const onOpen = jest.fn();
  const draft = {
    id: 'moat', kind: 'note', title: 'On patience', updatedAt: ago(2),
    lastLine: 'Float is money that arrives early. So Buffett could wait. Stripe sees the payment first.',
    nextTimeLine: 'Say why patience is the moat.'
  };
  render(<ThinkDesk working={[draft]} ideas={[]} closed={[]} onOpen={onOpen} onView={jest.fn()} onStart={jest.fn()} />);

  expect(screen.getByText('Stripe sees the payment first.').closest('p')).toHaveTextContent(/^So Buffett could wait\. Stripe sees the payment first\.$/);
  expect(screen.getByText('Say why patience is the moat.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Write the next sentence' }));
  expect(onOpen).toHaveBeenCalledWith(draft, { write: true });
  await screen.findByText('Where you stopped, 2 days ago');
});

it('brings a kept thread that bears on your paragraph into the note, and shows one page from the world in blue', async () => {
  getNotebookCuttings.mockResolvedValue([]);
  readKept.mockResolvedValue([
    { kind: 'thread', threadId: 't1', title: 'A thread through Meditations and Zero to One', text: 'Retaliate once, then forgive. The best revenge is not to be like your enemy.', marks: 2 }
  ]);
  readThread.mockResolvedValue({ marks: [{ highlightId: 'h1' }, { highlightId: 'h2' }] });
  quoteIntoNote.mockResolvedValue({});
  readWorld.mockResolvedValue([{ title: 'Tit for tat', url: 'https://www.example.org/tit-for-tat' }]);
  const onOpen = jest.fn();
  const draft = { id: 'suppliers', kind: 'note', title: 'Why I trust some suppliers', updatedAt: ago(1), lastLine: 'Maybe you retaliate once, then forgive.' };
  render(<ThinkDesk working={[draft]} ideas={[]} closed={[]} onOpen={onOpen} onView={jest.fn()} onStart={jest.fn()} />);

  expect(await screen.findByRole('link', { name: 'Tit for tat' })).toHaveAttribute('href', 'https://www.example.org/tit-for-tat');
  expect(readWorld).toHaveBeenCalledWith('Why I trust some suppliers');
  fireEvent.click(screen.getByRole('button', { name: /Bring in the thread/ }));
  await waitFor(() => expect(onOpen).toHaveBeenCalledWith(draft));
  expect(quoteIntoNote.mock.calls).toEqual([['suppliers', 'h1'], ['suppliers', 'h2']]);
});
