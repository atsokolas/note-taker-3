import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Thread from './Thread';
import { answerThread, growThread, readThread } from '../api/home';

jest.mock('../api/home', () => ({ readThread: jest.fn(), answerThread: jest.fn(), growThread: jest.fn() }));

const thread = answer => ({
  threadId: 't1',
  answer,
  title: "A thread through De Re Militari, Meditations and Poor Charlie's Almanack",
  marks: [
    { articleId: 'v', highlightId: 'h1', book: false, title: 'De Re Militari', text: 'Let him who desires peace prepare for war.', createdAt: '2022-10-01T00:00:00Z' },
    { articleId: 'm', highlightId: 'h2', book: true, title: 'Meditations', text: 'The best revenge is not to be like your enemy.', createdAt: '2024-09-01T00:00:00Z' },
    { articleId: 'c', highlightId: 'h3', book: true, title: "Poor Charlie's Almanack", text: 'Pacifism is not free.', createdAt: '2026-11-23T00:00:00Z' }
  ]
});

const open = () => render(<MemoryRouter><Thread /></MemoryRouter>);

describe('Thread', () => {
  it('reads a thread in the order it formed, and how long it took', async () => {
    readThread.mockResolvedValue(thread('kept'));
    open();
    expect(await screen.findByRole('heading', { name: /A thread through De Re Militari/ })).toBeInTheDocument();
    expect(screen.getByText('Three things you read, four years apart.')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem').map(item => item.textContent)).toEqual([
      expect.stringContaining('peace'), expect.stringContaining('revenge'), expect.stringContaining('Pacifism')
    ]);
    expect(screen.getByRole('link', { name: /revenge/ })).toHaveAttribute('href', '/books/m?highlight=h2');
    expect(screen.getByText(/Kept for good/)).toBeInTheDocument();
  });

  it('asks, when it is not answered yet', async () => {
    readThread.mockResolvedValue(thread(null));
    answerThread.mockResolvedValue(thread('kept'));
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Keep it' }));
    expect(answerThread).toHaveBeenCalledWith(undefined, 'kept');
    expect(await screen.findByText(/Kept for good/)).toBeInTheDocument();
  });

  it('offers, in pencil, what you marked since that may belong, and adds it only when you say', async () => {
    const offered = { articleId: 's', highlightId: 'h4', book: true, title: 'Letters from a Stoic', text: 'We suffer more in imagination than in reality.', createdAt: new Date().toISOString() };
    readThread.mockResolvedValue({ ...thread('kept'), offered });
    growThread.mockResolvedValue({ ...thread('kept'), offered: null, marks: [...thread('kept').marks, offered] });
    open();
    const pencil = await screen.findByRole('complementary', { name: 'It may belong here' });
    expect(pencil).toHaveTextContent('Marked today, and it may belong here');
    expect(screen.getByRole('link', { name: /imagination/ })).toHaveAttribute('href', '/books/s?highlight=h4');
    fireEvent.click(screen.getByRole('button', { name: 'Add it to the thread' }));
    expect(growThread).toHaveBeenCalledWith(undefined, offered, true);
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(4));
    expect(screen.queryByRole('complementary', { name: 'It may belong here' })).not.toBeInTheDocument();
  });
});
