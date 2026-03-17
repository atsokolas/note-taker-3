import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import DataIntegrations from './DataIntegrations';
import api from '../api';
import { updateConcept } from '../api/concepts';
import { createReturnQueueEntry } from '../api/returnQueue';

jest.mock('../api', () => ({
  __esModule: true,
  default: {
    post: jest.fn()
  }
}));

jest.mock('../api/concepts', () => ({
  updateConcept: jest.fn()
}));

jest.mock('../api/returnQueue', () => ({
  createReturnQueueEntry: jest.fn()
}));

describe('DataIntegrations first insight workflow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
  });

  it('creates a note, then lets the user create a concept and schedule a revisit', async () => {
    api.post.mockResolvedValueOnce({
      data: {
        _id: 'note-1',
        title: 'My working note'
      }
    });
    updateConcept.mockResolvedValue({
      _id: 'concept-1',
      name: 'Retrieval systems'
    });
    createReturnQueueEntry.mockResolvedValue({
      _id: 'rq-1'
    });

    render(
      <MemoryRouter>
        <DataIntegrations />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'My working note' } });
    fireEvent.change(screen.getByLabelText('Note text'), { target: { value: 'A useful capture that should become an insight.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create note' }));

    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    expect(api.post).toHaveBeenCalledWith(
      '/api/notebook',
      expect.objectContaining({
        title: 'My working note',
        source: 'manual-note'
      }),
      expect.any(Object)
    );

    await waitFor(() => expect(screen.getByTestId('first-insight-card')).toBeInTheDocument());

    fireEvent.change(screen.getByTestId('first-insight-concept-input'), { target: { value: 'Retrieval systems' } });
    fireEvent.click(screen.getByTestId('first-insight-create-concept'));

    await waitFor(() => expect(updateConcept).toHaveBeenCalledWith('Retrieval systems', { description: '' }));

    fireEvent.click(screen.getByTestId('first-insight-schedule-3d'));

    await waitFor(() => expect(createReturnQueueEntry).toHaveBeenCalledTimes(1));
    expect(createReturnQueueEntry).toHaveBeenCalledWith(expect.objectContaining({
      itemType: 'concept',
      itemId: 'concept-1',
      reason: 'First insight follow-up'
    }));
  });
});
