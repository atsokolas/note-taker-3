import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import NotebookFolderTree from './NotebookFolderTree';

describe('NotebookFolderTree', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('renders the full folder hierarchy and auto-expands the active path', () => {
    const onSelectEntry = jest.fn();
    window.localStorage.setItem(
      'think.notebook.folderTree.open',
      JSON.stringify({ root: false, child: false, grandchild: false, empty: false })
    );

    render(
      <NotebookFolderTree
        folders={[
          { _id: 'root', name: 'Product HQ', parentFolderId: null, sortOrder: 0 },
          { _id: 'child', name: 'Projects', parentFolderId: 'root', sortOrder: 0 },
          { _id: 'grandchild', name: 'Roadmap', parentFolderId: 'child', sortOrder: 0 },
          { _id: 'empty', name: 'Archive', parentFolderId: null, sortOrder: 1 }
        ]}
        entries={[
          { _id: 'note-1', title: 'Q2 priorities', folder: 'grandchild', updatedAt: '2026-04-19T12:00:00.000Z' },
          { _id: 'note-2', title: 'Scratch pad', folder: null, updatedAt: '2026-04-18T12:00:00.000Z' }
        ]}
        activeEntryId="note-1"
        onSelectEntry={onSelectEntry}
      />
    );

    expect(screen.getByRole('button', { name: /Product HQ/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Projects/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Roadmap/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Archive/i })).toBeInTheDocument();
    expect(screen.getByText('Loose pages')).toBeInTheDocument();

    const activeEntry = screen.getByRole('button', { name: /Q2 priorities/i });
    expect(activeEntry).toHaveAttribute('aria-current', 'page');

    fireEvent.click(screen.getByRole('button', { name: /Scratch pad/i }));
    expect(onSelectEntry).toHaveBeenCalledWith('note-2');
  });

  it('opens the move action for a note and supports dropping into folders or loose pages', () => {
    const onRequestMoveEntry = jest.fn();
    const onMoveEntry = jest.fn();
    const dataTransfer = {
      data: {},
      dropEffect: 'move',
      effectAllowed: 'all',
      setData(type, value) {
        this.data[type] = value;
      },
      getData(type) {
        return this.data[type] || '';
      }
    };

    render(
      <NotebookFolderTree
        folders={[
          { _id: 'folder-1', name: 'Projects', parentFolderId: null, sortOrder: 0 },
          { _id: 'folder-2', name: 'Archive', parentFolderId: null, sortOrder: 1 }
        ]}
        entries={[
          { _id: 'note-1', title: 'Weekly synthesis', folder: 'folder-1', updatedAt: '2026-04-19T12:00:00.000Z' },
          { _id: 'note-2', title: 'Imported scratch', folder: null, updatedAt: '2026-04-18T12:00:00.000Z' }
        ]}
        onSelectEntry={jest.fn()}
        onRequestMoveEntry={onRequestMoveEntry}
        onMoveEntry={onMoveEntry}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Move Weekly synthesis/i }));
    expect(onRequestMoveEntry).toHaveBeenCalledWith(expect.objectContaining({ _id: 'note-1' }));

    const draggableEntry = screen.getByTestId('notebook-entry-select-note-1');
    fireEvent.dragStart(draggableEntry, { dataTransfer });
    fireEvent.dragOver(screen.getByTestId('folder-drop-target-folder-2'), { dataTransfer });
    fireEvent.drop(screen.getByTestId('folder-drop-target-folder-2'), { dataTransfer });
    expect(onMoveEntry).toHaveBeenCalledWith(expect.objectContaining({ _id: 'note-1' }), 'folder-2');

    fireEvent.dragStart(draggableEntry, { dataTransfer });
    fireEvent.dragOver(screen.getByTestId('folder-drop-target-root'), { dataTransfer });
    fireEvent.drop(screen.getByTestId('folder-drop-target-root'), { dataTransfer });
    expect(onMoveEntry).toHaveBeenCalledWith(expect.objectContaining({ _id: 'note-1' }), null);
  });

  it('creates a folder from the left rail toolbar', async () => {
    const onCreateFolder = jest.fn().mockResolvedValue({ _id: 'folder-new', name: 'Drafts' });

    render(
      <NotebookFolderTree
        folders={[
          { _id: 'folder-1', title: 'Projects', name: 'Projects', parentFolderId: null, sortOrder: 0 }
        ]}
        entries={[
          { _id: 'note-1', title: 'Weekly synthesis', folder: 'folder-1', updatedAt: '2026-04-19T12:00:00.000Z' }
        ]}
        activeEntryId="note-1"
        onSelectEntry={jest.fn()}
        onCreateFolder={onCreateFolder}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /New folder/i }));
    fireEvent.change(screen.getByPlaceholderText(/Name a folder/i), { target: { value: 'Drafts' } });
    fireEvent.click(screen.getByRole('button', { name: /^Create$/i }));

    await waitFor(() => {
      expect(onCreateFolder).toHaveBeenCalledWith('Drafts', { parentFolderId: 'folder-1' });
    });
  });

  it('keeps the folder composer available when the tree is empty', async () => {
    const onCreateFolder = jest.fn().mockResolvedValue({ _id: 'folder-new', name: 'Archive' });

    render(
      <NotebookFolderTree
        folders={[]}
        entries={[]}
        onSelectEntry={jest.fn()}
        onCreateFolder={onCreateFolder}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /New folder/i }));
    fireEvent.change(screen.getByPlaceholderText(/Name a folder/i), { target: { value: 'Archive' } });
    fireEvent.click(screen.getByRole('button', { name: /^Create$/i }));

    await waitFor(() => {
      expect(onCreateFolder).toHaveBeenCalledWith('Archive', { parentFolderId: null });
    });
  });
});
