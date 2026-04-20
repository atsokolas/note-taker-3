import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
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
});
