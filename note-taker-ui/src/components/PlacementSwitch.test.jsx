import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import PlacementSwitch from './PlacementSwitch';
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

const NOW = new Date('2026-10-01T12:00:00.000Z').getTime();

const parked = (props = {}) => render(
  <PlacementSwitch articleId="a1" placement="later" onChange={jest.fn()} now={NOW} {...props} />
);

describe('the switch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    listReturnQueue.mockResolvedValue([]);
    createReturnQueueEntry.mockResolvedValue({ _id: 'q1', itemType: 'article', itemId: 'a1', status: 'pending' });
    updateReturnQueueEntry.mockResolvedValue({ _id: 'q1', status: 'completed' });
  });

  it('is one instrument with three positions, and never two facts at once', () => {
    parked();
    const group = screen.getByRole('radiogroup', { name: 'Where this sits' });
    expect(within(group).getAllByRole('radio')).toHaveLength(3);
    expect(within(group).getAllByRole('radio').filter(r => r.getAttribute('aria-checked') === 'true'))
      .toHaveLength(1);
  });

  it('names the home it would return to', () => {
    parked({ folderName: 'Costco', asFeed: true });
    expect(screen.getByRole('radio', { name: 'COSTCO' })).toBeInTheDocument();
  });

  /* A folder you have not screened is not a home of its own, so the way back
     is simply home — not a place name borrowed from another product. */
  it('calls it home when the folder is not screened', () => {
    parked({ folderName: 'Investing', asFeed: false });
    expect(screen.getByRole('radio', { name: 'HOME' })).toBeInTheDocument();
  });
});

describe('the clock cap and its strip', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    listReturnQueue.mockResolvedValue([]);
    createReturnQueueEntry.mockResolvedValue({ _id: 'q1', status: 'pending' });
    updateReturnQueueEntry.mockResolvedValue({ _id: 'q1', status: 'completed' });
  });

  it('grows a cap only while the piece is parked', () => {
    const { rerender } = parked({ placement: 'stream' });
    expect(document.querySelector('.placement-switch__cap')).toBeNull();

    rerender(<PlacementSwitch articleId="a1" placement="later" onChange={jest.fn()} now={NOW} />);
    expect(document.querySelector('.placement-switch__cap')).not.toBeNull();
  });

  it('unfolds a strip rather than opening a modal', () => {
    parked();
    fireEvent.click(document.querySelector('.placement-switch__cap'));

    expect(screen.getByLabelText('When to bring it back')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('writes the promise the reader chose', async () => {
    parked();
    fireEvent.click(document.querySelector('.placement-switch__cap'));
    fireEvent.click(screen.getByRole('button', { name: 'Tomorrow' }));

    await waitFor(() => expect(createReturnQueueEntry).toHaveBeenCalledWith(
      expect.objectContaining({ itemType: 'article', itemId: 'a1', cadence: null })
    ));
  });

  it('keeps a recurring promise recurring', async () => {
    parked();
    fireEvent.click(document.querySelector('.placement-switch__cap'));
    fireEvent.click(screen.getByRole('button', { name: 'Every Monday' }));

    await waitFor(() => expect(createReturnQueueEntry).toHaveBeenCalledWith(
      expect.objectContaining({ cadence: 'weekly' })
    ));
  });

  it('clears a promise without moving the piece', async () => {
    listReturnQueue.mockResolvedValue([
      { _id: 'q1', itemType: 'article', itemId: 'a1', status: 'pending', dueAt: '2026-10-06T12:00:00.000Z' }
    ]);
    parked();
    await waitFor(() => expect(document.querySelector('.placement-switch__cap').textContent).toBe('TUE'));

    fireEvent.click(document.querySelector('.placement-switch__cap'));
    fireEvent.click(screen.getByRole('button', { name: 'No clock' }));

    await waitFor(() => expect(updateReturnQueueEntry).toHaveBeenCalledWith('q1', { action: 'done' }));
  });

  it('prints the promised day in the product’s one time word', async () => {
    listReturnQueue.mockResolvedValue([
      { _id: 'q1', itemType: 'article', itemId: 'a1', status: 'pending', dueAt: '2026-11-01T12:00:00.000Z' }
    ]);
    parked();
    await waitFor(() => expect(document.querySelector('.placement-switch__cap').textContent).toBe('NOV 1'));
  });

  it('says the same thing Keep says when the write does not land', async () => {
    createReturnQueueEntry.mockRejectedValue(new Error('nope'));
    parked();
    fireEvent.click(document.querySelector('.placement-switch__cap'));
    fireEvent.click(screen.getByRole('button', { name: 'Tomorrow' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('That did not save.');
  });
});
