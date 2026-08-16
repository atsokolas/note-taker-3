import React from 'react';

// The cabinet, in the column's language.
//
// It is a faint list of names beside the reading — the same shape as the note
// shelf in Think — rather than a filing system you have to open before you can
// read. The shelf you are on is the only one at full weight.

const LibraryShelfNav = ({
  folders = [],
  scope = 'all',
  folderId = '',
  unfiledCount = 0,
  onSelectScope,
  onSelectFolder,
  onReviewFiling,
  filingLaunching = false,
  className = ''
}) => (
  <nav className={`library-shelf ${className}`.trim()} aria-label="Shelves">
    <p className="library-shelf__eyebrow">Shelves</p>
    <ul>
      <li>
        <button
          type="button"
          className={scope === 'all' ? 'is-open' : ''}
          aria-current={scope === 'all' ? 'true' : undefined}
          onClick={() => onSelectScope?.('all')}
        >
          All sources
        </button>
      </li>
      <li>
        <button
          type="button"
          className={scope === 'unfiled' ? 'is-open' : ''}
          aria-current={scope === 'unfiled' ? 'true' : undefined}
          onClick={() => onSelectScope?.('unfiled')}
        >
          Unfiled{unfiledCount ? ` (${unfiledCount})` : ''}
        </button>
      </li>
      <li>
        <button
          type="button"
          className={scope === 'highlights' ? 'is-open' : ''}
          aria-current={scope === 'highlights' ? 'true' : undefined}
          onClick={() => onSelectScope?.('highlights')}
        >
          Highlights
        </button>
      </li>
      {folders.map(folder => (
        <li key={folder._id}>
          <button
            type="button"
            className={scope === 'folder' && folderId === folder._id ? 'is-open' : ''}
            aria-current={scope === 'folder' && folderId === folder._id ? 'true' : undefined}
            onClick={() => onSelectFolder?.(folder._id)}
          >
            {folder.name}
          </button>
        </li>
      ))}
    </ul>

    {/* Filing is the cabinet's own work, so it lives with the cabinet. */}
    {onReviewFiling ? (
      <button
        type="button"
        className="library-shelf__filing"
        onClick={onReviewFiling}
        disabled={filingLaunching}
      >
        {filingLaunching ? 'Starting…' : 'Review filing'}
      </button>
    ) : null}
  </nav>
);

export default LibraryShelfNav;
