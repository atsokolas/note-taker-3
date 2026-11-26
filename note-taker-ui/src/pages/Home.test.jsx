import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Home from './Home';
import { answerThread, keepPassage, readHome } from '../api/home';

jest.mock('../api/home', () => ({ readHome: jest.fn(), keepPassage: jest.fn(), answerThread: jest.fn() }));

const DAY = 24 * 60 * 60 * 1000;
const ago = days => new Date(Date.now() - days * DAY).toISOString();

const shelf = {
  kept: [
    { kind: 'mark', articleId: 'm1', highlightId: 'k1', title: 'Meditations', text: 'The best revenge is not to be like your enemy.', at: ago(300), since: ago(8 * 366) },
    { kind: 'source', book: false, articleId: 's1', title: 'Going Founder Mode On Cancer', at: ago(40) }
  ],
  asks: [{ articleId: 'c1', highlightId: 'h12', book: true, title: "Poor Charlie's Almanack", text: 'Invert, always invert.', opens: 4 }],
  forNow: [
    { articleId: 'c1', title: "Poor Charlie's Almanack", book: true, marks: 1, at: ago(2) },
    { articleId: 'e1', title: 'Escher, Relativity', book: false, marks: 0, at: ago(9) }
  ],
  underneath: { marks: 1204, works: 211, since: ago(7 * 366), glimpse: { articleId: 'z1', highlightId: 'z7', book: true, title: 'Zero to One', text: 'Competition is for losers.', createdAt: '2024-03-01T12:00:00Z' } },
  cameBack: {
    mark: { _id: 'h11', text: 'Pacifism is not free.', createdAt: ago(2), bookId: 'c1', bookTitle: "Poor Charlie's Almanack" },
    echo: { _id: 'k9', text: 'Peace is kept by those ready for war.', createdAt: ago(800), articleId: 'v1', articleTitle: 'Vegetius' }
  }
};

const renderHome = () => render(<MemoryRouter><Home /></MemoryRouter>);

describe('Home', () => {
  beforeEach(() => {
    localStorage.clear();
    readHome.mockReset().mockResolvedValue(shelf);
    keepPassage.mockReset().mockResolvedValue({});
  });

  it('lays out Kept, For now and Underneath, with what came back', async () => {
    renderHome();
    expect(await screen.findByText('The best revenge is not to be like your enemy.')).toBeInTheDocument();
    expect(screen.getByText('The best revenge is not to be like your enemy.').closest('li').style.getPropertyValue('--held')).toBe('6');
    expect(screen.getByRole('link', { name: /Going Founder Mode On Cancer/ })).toBeInTheDocument();
    expect(screen.getByText(/You’re reading/)).toHaveTextContent("You’re reading Poor Charlie's Almanack");
    expect(screen.getByText(/1,204 marks in 211 works, seven years of reading/)).toBeInTheDocument();
    expect(screen.getByRole('figure', { name: 'Came back today' })).toHaveTextContent('two years apart');
    expect(screen.getByRole('link', { name: /Competition is for losers/ })).toHaveAttribute('href', expect.stringContaining('/books/z1'));
  });

  it('keeps the passage you keep opening, or lets it rest', async () => {
    renderHome();
    fireEvent.click(await screen.findByRole('button', { name: 'Keep it' }));
    await waitFor(() => expect(keepPassage).toHaveBeenCalledWith(expect.objectContaining({ articleId: 'c1', highlightId: 'h12' })));
    await waitFor(() => expect(readHome).toHaveBeenCalledTimes(2));

    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(screen.queryByText('Invert, always invert.')).not.toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('noeis.home.notNow'))).toEqual(['h12']);
  });

  it('keeps the old mark that came back', async () => {
    renderHome();
    fireEvent.click(await screen.findByRole('button', { name: 'Keep the old one' }));
    expect(keepPassage).toHaveBeenCalledWith({ articleId: 'v1', highlightId: 'k9' });
  });

  it('shows something forming, rarely, and takes the reader’s answer', async () => {
    readHome.mockResolvedValue({ ...shelf, forming: {
      threadId: 't1', title: 'A thread through Vegetius and Meditations', marks: [
        { articleId: 'v1', highlightId: 'k9', title: 'Vegetius', text: 'Peace is kept by those ready for war.', createdAt: ago(1500) },
        { articleId: 'm1', highlightId: 'k1', title: 'Meditations', text: 'The best revenge.', createdAt: ago(800) },
        { articleId: 'c1', highlightId: 'h11', title: "Poor Charlie's Almanack", text: 'Pacifism is not free.', createdAt: ago(2) }
      ]
    } });
    answerThread.mockResolvedValue({});
    renderHome();
    const forming = await screen.findByRole('region', { name: /Something’s forming/ });
    expect(forming).toHaveTextContent('Three things you read, four years apart, keep saying one thing.');
    fireEvent.click(screen.getByRole('button', { name: 'Not a thing' }));
    expect(answerThread).toHaveBeenCalledWith('t1', 'not a thing');
    await waitFor(() => expect(readHome).toHaveBeenCalledTimes(2));
  });

  it('says plainly when there is nothing yet', async () => {
    readHome.mockResolvedValue({ kept: [], asks: [], forNow: [], underneath: { marks: 0, works: 0, since: null }, cameBack: null });
    renderHome();
    expect(await screen.findByText(/Nothing kept yet/)).toBeInTheDocument();
    expect(screen.getByText(/Nothing lately/)).toBeInTheDocument();
    expect(screen.getByText(/Nothing underneath yet/)).toBeInTheDocument();
  });
});
