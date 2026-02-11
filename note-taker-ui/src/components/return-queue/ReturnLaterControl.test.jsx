import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ReturnLaterControl from './ReturnLaterControl';

jest.mock('../../api/returnQueue', () => ({
  createReturnQueueEntry: jest.fn().mockResolvedValue({ _id: 'rq-1' })
}));

const { createReturnQueueEntry } = require('../../api/returnQueue');

describe('ReturnLaterControl', () => {
  beforeEach(() => {
    createReturnQueueEntry.mockClear();
  });

  it('creates a return queue entry with a preset due date', async () => {
    render(
      <ReturnLaterControl
        itemType="highlight"
        itemId="h-1"
        defaultReason="A short reason"
      />
    );

    fireEvent.click(screen.getByText('Return later'));
    fireEvent.click(screen.getByText('Add'));

    await waitFor(() => {
      expect(createReturnQueueEntry).toHaveBeenCalledTimes(1);
    });
    const payload = createReturnQueueEntry.mock.calls[0][0];
    expect(payload.itemType).toBe('highlight');
    expect(payload.itemId).toBe('h-1');
    expect(payload.reason).toBe('A short reason');
    expect(payload.dueAt).toBeTruthy();
  });

  it('requires custom date when custom preset is selected', async () => {
    render(<ReturnLaterControl itemType="notebook" itemId="n-1" />);

    fireEvent.click(screen.getByText('Return later'));
    fireEvent.click(screen.getByLabelText('Custom date'));
    fireEvent.click(screen.getByText('Add'));

    expect(createReturnQueueEntry).toHaveBeenCalledTimes(0);
  });
});
