import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import LibraryNotebookModal from './LibraryNotebookModal';
import useNotebookEntries from '../../hooks/useNotebookEntries';

jest.mock('../../hooks/useNotebookEntries', () => jest.fn());

describe('LibraryNotebookModal', () => {
  beforeEach(() => {
    useNotebookEntries.mockReturnValue({
      entries: [{ _id: 'note-1', title: 'Durable thought' }],
      loading: false,
      error: ''
    });
  });

  it('sends the exact highlight and waits while opening its notebook page', async () => {
    let finish;
    const onSend = jest.fn(() => new Promise(resolve => { finish = resolve; }));
    render(
      <LibraryNotebookModal
        open
        highlight={{ _id: 'highlight-1', text: 'A saved passage' }}
        onClose={jest.fn()}
        onSend={onSend}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Durable thought' }));
    fireEvent.click(screen.getByRole('button', { name: 'Send and open' }));

    expect(onSend).toHaveBeenCalledWith(
      expect.objectContaining({ _id: 'highlight-1' }),
      'note-1'
    );
    expect(screen.getByRole('button', { name: 'Opening…' })).toBeDisabled();

    finish();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Send and open' })).toBeEnabled());
  });
});
