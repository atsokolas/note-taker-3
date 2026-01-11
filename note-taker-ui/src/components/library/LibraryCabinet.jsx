import React from 'react';
import { SectionHeader, QuietButton } from '../ui';
import FolderTree from './FolderTree';

/**
 * @param {{
 *  folders: Array<{ _id: string, name: string }>,
 *  folderCounts: Record<string, number>,
 *  allCount: number,
 *  unfiledCount: number,
 *  scope: string,
 *  selectedFolderId: string,
 *  onSelectScope: (scope: string) => void,
 *  onSelectFolder: (id: string) => void
 * }} props
 */
const LibraryCabinet = ({
  folders,
  folderCounts,
  allCount,
  unfiledCount,
  scope,
  selectedFolderId,
  onSelectScope,
  onSelectFolder
}) => (
  <div className="library-cabinet">
    <SectionHeader title="Cabinet" subtitle="Your filing system." />
    <div className="library-cabinet-actions">
      <QuietButton
        className={scope === 'all' ? 'is-active' : ''}
        onClick={() => onSelectScope('all')}
      >
        <span>All Articles</span>
        {typeof allCount === 'number' && <span className="library-cabinet-count">{allCount}</span>}
      </QuietButton>
      <QuietButton
        className={scope === 'unfiled' ? 'is-active' : ''}
        onClick={() => onSelectScope('unfiled')}
      >
        <span>Unfiled</span>
        {typeof unfiledCount === 'number' && <span className="library-cabinet-count">{unfiledCount}</span>}
      </QuietButton>
      <QuietButton
        className={scope === 'highlights' ? 'is-active' : ''}
        onClick={() => onSelectScope('highlights')}
      >
        <span>Highlights</span>
      </QuietButton>
    </div>
    <FolderTree
      folders={folders}
      counts={folderCounts}
      selectedFolderId={selectedFolderId}
      onSelectFolder={onSelectFolder}
    />
  </div>
);

export default LibraryCabinet;
