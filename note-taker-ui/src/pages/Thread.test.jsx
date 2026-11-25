import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Thread from './Thread';
import { answerThread, readThread } from '../api/home';

jest.mock('../api/home', () => ({ readThread: jest.fn(), answerThread: jest.fn() }));

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
});
