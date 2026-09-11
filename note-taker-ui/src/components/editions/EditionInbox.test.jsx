import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import EditionInbox from './EditionInbox';
import { getEditionInbox, saveEditionItemLater, setEditionItemState } from '../../api/editions';

jest.mock('../../api/editions', () => ({
  getEditionInbox: jest.fn(),
  saveEditionItemLater: jest.fn(),
  setEditionItemState: jest.fn()
}));

const row = {
  editionId: 'e1',
  itemId: 'item-1',
  title: 'A paper about scaling',
  sourceLabel: 'Lab Blog',
  sourceDate: 'Sep 3',
  profileLabel: 'This Week in AI',
  issueLabel: 'Issue',
  number: 14
};

describe('new arrivals', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getEditionInbox.mockResolvedValue({ items: [row], hasMore: false, remaining: 0 });
  });

  it('offers Read now and Save for later', async () => {
    render(<MemoryRouter><EditionInbox /></MemoryRouter>);
    expect(await screen.findByText('A paper about scaling')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Read now' })).toHaveAttribute('href', '/editions/e1?item=item-1');
    expect(screen.getByRole('link', { name: 'Later' })).toHaveAttribute('href', '/library?scope=later');
  });

  it('dismisses with undo', async () => {
    setEditionItemState.mockResolvedValue({ readerStatus: 'dismissed' });
    render(<MemoryRouter><EditionInbox /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: 'Dismiss' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument());
    expect(screen.queryByText('A paper about scaling')).not.toBeInTheDocument();
    setEditionItemState.mockResolvedValue({ readerStatus: 'new' });
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(screen.getByText('A paper about scaling')).toBeInTheDocument());
  });

  it('saves for later and points at Later', async () => {
    saveEditionItemLater.mockResolvedValue({ placed: true, articleId: 'a1' });
    render(<MemoryRouter><EditionInbox /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: 'Save for later' }));
    expect(await screen.findByRole('link', { name: 'Open Later' })).toHaveAttribute('href', '/library?scope=later');
    expect(screen.queryByText('A paper about scaling')).not.toBeInTheDocument();
  });

  it('says so when nothing is new, without emptying the stand', async () => {
    getEditionInbox.mockResolvedValue({ items: [], hasMore: false, remaining: 0 });
    render(<MemoryRouter><EditionInbox /></MemoryRouter>);
    expect(await screen.findByText('No new items')).toBeInTheDocument();
  });

  it('offers Retry when the list does not load, and does not claim emptiness', async () => {
    getEditionInbox.mockRejectedValue({ response: { data: { error: 'New items did not load.' } } });
    render(<MemoryRouter><EditionInbox /></MemoryRouter>);
    expect(await screen.findByText('New items did not load.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(screen.queryByText('No new items')).not.toBeInTheDocument();
  });
});
