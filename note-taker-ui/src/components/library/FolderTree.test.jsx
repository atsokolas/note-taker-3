import React from 'react';
import { render, screen } from '@testing-library/react';
import FolderTree from './FolderTree';

describe('FolderTree', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('keeps low-signal QA shelves out of the default cabinet', () => {
    render(
      <FolderTree
        folders={[
          { _id: 'folder-real', name: 'Transportation' },
          { _id: 'folder-test', name: 'TEST' },
          { _id: 'folder-blah', name: 'Blah' }
        ]}
        counts={{ 'folder-real': 1, 'folder-test': 8, 'folder-blah': 2 }}
        selectedFolderId=""
        onSelectFolder={() => {}}
      />
    );

    expect(screen.getByText('Transportation')).toBeInTheDocument();
    expect(screen.queryByText('TEST')).not.toBeInTheDocument();
    expect(screen.queryByText('Blah')).not.toBeInTheDocument();
  });
});
