import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import NotebookMoveEntryModal from './NotebookMoveEntryModal';

describe('NotebookMoveEntryModal', () => {
  it('does not render when closed', () => {
    const { container } = render(
      <NotebookMoveEntryModal
        open={false}
        entry={null}
        folders={[]}
        onClose={jest.fn()}
        onMove={jest.fn()}
      />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('moves a note into a selected folder', () => {
    const onMove = jest.fn();

    render(
      <NotebookMoveEntryModal
        open
        entry={{ _id: 'entry-1', title: 'Weekly synthesis', folder: null }}
        folders={[
          { _id: 'folder-1', name: 'Projects', parentFolderId: null, sortOrder: 0 },
          { _id: 'folder-2', name: 'Roadmap', parentFolderId: 'folder-1', sortOrder: 0 }
        ]}
        onClose={jest.fn()}
        onMove={onMove}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Roadmap/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Move$/i }));

    expect(onMove).toHaveBeenCalledWith('folder-2');
  });

  it('allows moving a note back to loose pages', () => {
    const onMove = jest.fn();

    render(
      <NotebookMoveEntryModal
        open
        entry={{ _id: 'entry-2', title: 'Imported note', folder: 'folder-1' }}
        folders={[
          { _id: 'folder-1', name: 'Archive', parentFolderId: null, sortOrder: 0 }
        ]}
        onClose={jest.fn()}
        onMove={onMove}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Loose pages/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Move$/i }));

    expect(onMove).toHaveBeenCalledWith(null);
  });

  it('creates a folder from search text and moves the note there', async () => {
    const onMove = jest.fn().mockResolvedValue(undefined);
    const onCreateFolder = jest.fn().mockResolvedValue({ _id: 'folder-new', name: 'Drafts' });

    render(
      <NotebookMoveEntryModal
        open
        entry={{ _id: 'entry-3', title: 'Imported note', folder: null }}
        folders={[
          { _id: 'folder-1', name: 'Archive', parentFolderId: null, sortOrder: 0 }
        ]}
        onClose={jest.fn()}
        onMove={onMove}
        onCreateFolder={onCreateFolder}
      />
    );

    fireEvent.change(screen.getByPlaceholderText(/Search folders/i), { target: { value: 'Drafts' } });
    fireEvent.change(screen.getByLabelText(/Parent folder/i), { target: { value: 'folder-1' } });
    fireEvent.click(screen.getByTestId('notebook-move-entry-create-folder'));

    await waitFor(() => {
      expect(onCreateFolder).toHaveBeenCalledWith('Drafts', { parentFolderId: 'folder-1' });
      expect(onMove).toHaveBeenCalledWith('folder-new');
    });
  });

  it('allows the same folder name in a different branch', async () => {
    const onMove = jest.fn().mockResolvedValue(undefined);
    const onCreateFolder = jest.fn().mockResolvedValue({ _id: 'folder-new', name: 'Drafts' });

    render(
      <NotebookMoveEntryModal
        open
        entry={{ _id: 'entry-4', title: 'Imported note', folder: null }}
        folders={[
          { _id: 'folder-1', name: 'Archive', parentFolderId: null, sortOrder: 0 },
          { _id: 'folder-2', name: 'Drafts', parentFolderId: null, sortOrder: 1 }
        ]}
        onClose={jest.fn()}
        onMove={onMove}
        onCreateFolder={onCreateFolder}
      />
    );

    fireEvent.change(screen.getByPlaceholderText(/Search folders/i), { target: { value: 'Drafts' } });
    fireEvent.change(screen.getByLabelText(/Parent folder/i), { target: { value: 'folder-1' } });

    expect(screen.getByTestId('notebook-move-entry-create-folder')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('notebook-move-entry-create-folder'));

    await waitFor(() => {
      expect(onCreateFolder).toHaveBeenCalledWith('Drafts', { parentFolderId: 'folder-1' });
      expect(onMove).toHaveBeenCalledWith('folder-new');
    });
  });

  it('uses the selected destination as the create parent after a manual override', async () => {
    const onMove = jest.fn().mockResolvedValue(undefined);
    const onCreateFolder = jest.fn().mockResolvedValue({ _id: 'folder-new', name: 'Subdrafts' });

    render(
      <NotebookMoveEntryModal
        open
        entry={{ _id: 'entry-5', title: 'Imported note', folder: null }}
        folders={[
          { _id: 'folder-1', name: 'Archive', parentFolderId: null, sortOrder: 0 },
          { _id: 'folder-2', name: 'Projects', parentFolderId: null, sortOrder: 1 }
        ]}
        onClose={jest.fn()}
        onMove={onMove}
        onCreateFolder={onCreateFolder}
      />
    );

    const searchInput = screen.getByPlaceholderText(/Search folders/i);

    fireEvent.change(searchInput, { target: { value: 'Subdrafts' } });
    fireEvent.change(screen.getByLabelText(/Parent folder/i), { target: { value: 'folder-1' } });
    fireEvent.change(searchInput, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /Projects/i }));
    fireEvent.change(searchInput, { target: { value: 'Subdrafts' } });
    fireEvent.click(screen.getByTestId('notebook-move-entry-create-folder'));

    await waitFor(() => {
      expect(onCreateFolder).toHaveBeenCalledWith('Subdrafts', { parentFolderId: 'folder-2' });
      expect(onMove).toHaveBeenCalledWith('folder-new');
    });
  });

  it('resets nested creation to top level when loose pages is selected', async () => {
    const onMove = jest.fn().mockResolvedValue(undefined);
    const onCreateFolder = jest.fn().mockResolvedValue({ _id: 'folder-new', name: 'Inbox' });

    render(
      <NotebookMoveEntryModal
        open
        entry={{ _id: 'entry-6', title: 'Imported note', folder: 'folder-1' }}
        folders={[
          { _id: 'folder-1', name: 'Archive', parentFolderId: null, sortOrder: 0 }
        ]}
        onClose={jest.fn()}
        onMove={onMove}
        onCreateFolder={onCreateFolder}
      />
    );

    const searchInput = screen.getByPlaceholderText(/Search folders/i);

    fireEvent.change(searchInput, { target: { value: 'Inbox' } });
    fireEvent.change(screen.getByLabelText(/Parent folder/i), { target: { value: 'folder-1' } });
    fireEvent.change(searchInput, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /Loose pages/i }));
    fireEvent.change(searchInput, { target: { value: 'Inbox' } });
    fireEvent.click(screen.getByTestId('notebook-move-entry-create-folder'));

    await waitFor(() => {
      expect(onCreateFolder).toHaveBeenCalledWith('Inbox', { parentFolderId: null });
      expect(onMove).toHaveBeenCalledWith('folder-new');
    });
  });
});
