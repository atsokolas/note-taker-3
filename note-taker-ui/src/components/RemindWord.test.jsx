import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import RemindWord from './RemindWord';
import {
  createReturnQueueEntry,
  listReturnQueue,
  updateReturnQueueEntry
} from '../api/returnQueue';

jest.mock('../api/returnQueue', () => ({
  listReturnQueue: jest.fn(),
  createReturnQueueEntry: jest.fn(),
  updateReturnQueueEntry: jest.fn()
}));

describe('RemindWord', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    listReturnQueue.mockResolvedValue([]);
    createReturnQueueEntry.mockResolvedValue({
      _id: 'q1',
      itemType: 'article',
      itemId: 'a1',
      status: 'pending'
    });
    updateReturnQueueEntry.mockResolvedValue({ _id: 'q1', status: 'completed' });
  });

  it('opens a date strip, not a modal, and upserts Tomorrow', async () => {
    render(<RemindWord articleId="a1" />);
    const word = await screen.findByRole('button', { name: 'Remind me' });
    expect(word).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireEvent.click(word);
    expect(screen.getByRole('group', { name: 'When to ask this back' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Tomorrow' }));

    await waitFor(() => expect(createReturnQueueEntry).toHaveBeenCalledTimes(1));
    expect(createReturnQueueEntry.mock.calls[0][0]).toMatchObject({
      itemType: 'article',
      itemId: 'a1',
      cadence: null
    });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Remind me' })).toHaveAttribute('aria-pressed', 'true'));
    expect(screen.queryByRole('group', { name: 'When to ask this back' })).not.toBeInTheDocument();
  });

  it('clears an active remind and says That did not save when the write fails', async () => {
    listReturnQueue.mockResolvedValue([{
      _id: 'q1',
      itemType: 'article',
      itemId: 'a1',
      status: 'pending'
    }]);
    render(<RemindWord articleId="a1" />);
    const word = await screen.findByRole('button', { name: 'Remind me' });
    await waitFor(() => expect(word).toHaveAttribute('aria-pressed', 'true'));

    updateReturnQueueEntry.mockRejectedValueOnce({ response: { data: { error: 'That did not save.' } } });
    fireEvent.click(word);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('That did not save.'));
    expect(screen.getByRole('button', { name: 'Remind me' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('clears an active remind when the word is pressed again', async () => {
    listReturnQueue.mockResolvedValue([{
      _id: 'q1',
      itemType: 'article',
      itemId: 'a1',
      status: 'pending'
    }]);
    render(<RemindWord articleId="a1" />);
    const word = await screen.findByRole('button', { name: 'Remind me' });
    await waitFor(() => expect(word).toHaveAttribute('aria-pressed', 'true'));
    fireEvent.click(word);
    await waitFor(() => expect(updateReturnQueueEntry).toHaveBeenCalledWith('q1', { action: 'done' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Remind me' })).toHaveAttribute('aria-pressed', 'false'));
  });

  it('asks Every Monday as a weekly cadence', async () => {
    render(<RemindWord articleId="a1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Remind me' }));
    fireEvent.click(screen.getByRole('button', { name: 'Every Monday' }));
    await waitFor(() => expect(createReturnQueueEntry).toHaveBeenCalledWith(
      expect.objectContaining({ cadence: 'weekly', itemId: 'a1' })
    ));
  });
});
