import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import * as Router from 'react-router-dom';
import Underneath from './Underneath';
import { keepPassage, readUnderneath } from '../api/home';

jest.mock('../api/home', () => ({ readUnderneath: jest.fn(), keepPassage: jest.fn() }));

const issue = {
  month: '2026-11',
  cameBack: [
    { relation: 'argues', says: 'Munger prices deterrence; Aurelius refuses to become the enemy.', at: '2026-11-24T00:00:00Z',
      source: { articleId: 'c', title: "Poor Charlie's Almanack" },
      old: { articleId: 'm', highlightId: 'h1', book: true, title: 'Meditations', text: 'The best revenge is not to be like your enemy.', createdAt: '2024-09-01T00:00:00Z', kept: false } },
    { relation: 'bears', says: '', at: '2026-11-25T00:00:00Z',
      source: { articleId: 's', title: "Peter Thiel's CS183, class 11" },
      old: { articleId: 'z', highlightId: 'h2', book: false, title: 'Zero to One', text: 'Competition is for losers.', createdAt: '2024-03-01T00:00:00Z', kept: true } }
  ],
  formed: [{ threadId: 't1', answer: 'kept', title: 'A thread through Meditations and Zero to One', marks: [
    { articleId: 'm', highlightId: 'h1', createdAt: '2024-09-01T00:00:00Z' }, { articleId: 'z', highlightId: 'h2', createdAt: '2024-03-01T00:00:00Z' }] }],
  collided: [{ articleId: 'm', highlightId: 'h1', book: true, title: 'Meditations', text: 'The best revenge is not to be like your enemy.', times: 2 }]
};

describe('Underneath', () => {
  beforeEach(() => jest.spyOn(Router, 'useParams').mockReturnValue({ month: '2026-11' }));

  it('reads a month from underneath: what came back, what formed, what collided most', async () => {
    readUnderneath.mockResolvedValue(issue);
    render(<Underneath />);
    expect(await screen.findByRole('heading', { level: 1, name: /^Underneath, November/ })).toBeInTheDocument();
    const back = within(screen.getByRole('region', { name: /What came back/ }));
    expect(back.getByRole('link', { name: /best revenge/ })).toHaveAttribute('href', '/books/m?highlight=h1');
    expect(back.getByText(/Munger prices deterrence/)).toHaveClass('home__says');
    expect(within(screen.getByRole('region', { name: 'What formed' })).getByRole('link', { name: /A thread through/ })).toHaveAttribute('href', '/threads/t1');
    expect(within(screen.getByRole('region', { name: 'What collided most' })).getByText('2 times')).toBeInTheDocument();
    expect(readUnderneath).toHaveBeenCalledWith('2026-11');
  });

  it('keeps an old mark from the issue, and one already kept says so', async () => {
    readUnderneath.mockResolvedValue(issue);
    keepPassage.mockResolvedValue({});
    render(<Underneath />);
    const back = within(await screen.findByRole('region', { name: /What came back/ }));
    expect(back.getAllByRole('button', { name: 'Keep it' })).toHaveLength(1);
    fireEvent.click(back.getByRole('button', { name: 'Keep it' }));
    expect(keepPassage).toHaveBeenCalledWith(expect.objectContaining({ articleId: 'm', highlightId: 'h1' }));
    await waitFor(() => expect(back.queryByRole('button', { name: 'Keep it' })).not.toBeInTheDocument());
    expect(back.getAllByText('Kept')).toHaveLength(2);
  });

  it('says so when a month has no issue', async () => {
    readUnderneath.mockRejectedValue({ response: { data: { error: 'Nothing came back that month.' } } });
    render(<Underneath />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Nothing came back that month.');
  });
});
