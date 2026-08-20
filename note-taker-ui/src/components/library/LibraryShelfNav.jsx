import React, { useEffect, useState } from 'react';

// The cabinet, in the column's language.
//
// It is a faint list of names beside the reading — the same shape as the note
// shelf in Think — rather than a filing system you have to open before you can
// read. The shelf you are on is the only one at full weight.
//
// On a phone there is no beside. The rail stacks, and a person with fourteen
// folders met four rows of folder names and a filing chore before they met a
// single sentence they had saved. So the folders and the filing fold shut
// there: the three ways of moving stay out, and the cabinet opens on request.
// Nothing is hidden on the desktop rail, where the reading was never displaced.

const NARROW_SHELF = '(max-width: 900px)';

const useNarrowShelf = () => {
  const read = () => (
    typeof window !== 'undefined'
      ? Boolean(window.matchMedia?.(NARROW_SHELF)?.matches)
      : false
  );
  const [narrow, setNarrow] = useState(read);

  useEffect(() => {
    const query = window.matchMedia?.(NARROW_SHELF);
    if (!query) return undefined;
    const handleChange = () => setNarrow(Boolean(query.matches));
    handleChange();
    query.addEventListener?.('change', handleChange);
    return () => query.removeEventListener?.('change', handleChange);
  }, []);

  return narrow;
};

const LibraryShelfNav = ({
  folders = [],
  scope = 'all',
  folderId = '',
  unfiledCount = 0,
  keptCount = 0,
  onSelectScope,
  onSelectFolder,
  onReviewFiling,
  filingLaunching = false,
  className = ''
}) => {
  const narrow = useNarrowShelf();
  const [cabinetOpen, setCabinetOpen] = useState(false);
  /* Being on a folder means the cabinet is already where you are. With no
     folders there is no cabinet to fold, and folding one would take the filing
     with it — the one thing that would give you folders in the first place. */
  const showCabinet = !narrow || cabinetOpen || scope === 'folder' || !folders.length;

  return (
    <nav className={`library-shelf ${className}`.trim()} aria-label="Shelves">
      <p className="library-shelf__eyebrow">Shelves</p>
      <ul className="library-shelf__scopes">
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
        {/* Directly under everything, because it is a cut of everything and
            not a folder among folders: what you decided to hold for life. It
            appears only once there is something on it. */}
        {keptCount ? (
          <li className="library-shelf__kept">
            <button
              type="button"
              className={scope === 'kept' ? 'is-open' : ''}
              aria-current={scope === 'kept' ? 'true' : undefined}
              onClick={() => onSelectScope?.('kept')}
            >
              Kept ({keptCount})
            </button>
          </li>
        ) : null}
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
      </ul>

      {narrow && !showCabinet && folders.length ? (
        <button
          type="button"
          className="library-shelf__cabinet-toggle"
          aria-expanded="false"
          onClick={() => setCabinetOpen(true)}
        >
          {folders.length} {folders.length === 1 ? 'shelf' : 'shelves'}
        </button>
      ) : null}

      {showCabinet ? (
        <div className="library-shelf__cabinet">
          {folders.length ? (
            <ul className="library-shelf__folders">
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
          ) : null}

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

          {narrow && cabinetOpen ? (
            <button
              type="button"
              className="library-shelf__cabinet-toggle"
              aria-expanded="true"
              onClick={() => setCabinetOpen(false)}
            >
              Close the cabinet
            </button>
          ) : null}
        </div>
      ) : null}
    </nav>
  );
};

export default LibraryShelfNav;
