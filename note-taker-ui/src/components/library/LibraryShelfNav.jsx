import React, { useEffect, useState } from 'react';
import {
  RoomShelf,
  RoomShelfButton,
  RoomShelfList,
  RoomShelfMeta,
  RoomShelfSection
} from '../collection/RoomShelf';

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
  count,
  folders = [],
  folderCounts = {},
  foldersLoading = false,
  foldersError = '',
  scope = 'all',
  folderId = '',
  sourceView = 'recent',
  unfiledCount,
  keptCount,
  laterCount,
  setAsideCount,
  feedTopics = [],
  query = '',
  onQueryChange,
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
  const topics = narrow ? [] : (Array.isArray(feedTopics) ? feedTopics : []).filter((topic) => topic?.id && topic?.name);

  return (
    <RoomShelf
      as="nav"
      className={`library-shelf ${className}`.trim()}
      aria-label="Shelves"
      label="Library"
      count={count}
      search={query}
      searchLabel="Search library"
      searchPlaceholder="Search library"
      onSearchChange={onQueryChange}
    >
      <RoomShelfList className="library-shelf__scopes">
        <li>
          <RoomShelfButton
            active={scope === 'all'}
            onClick={() => onSelectScope?.('all')}
          >
            <span>All sources</span>
            {Number.isFinite(count) ? <RoomShelfMeta>{count}</RoomShelfMeta> : null}
          </RoomShelfButton>
        </li>
        {topics.map((topic) => (
          <li key={topic.id} className="library-shelf__feed">
            <RoomShelfButton
              active={scope === 'feed' && folderId === topic.id}
              onClick={() => onSelectFolder?.(topic.id)}
            >
              <span>{topic.name}</span>
            </RoomShelfButton>
          </li>
        ))}
        {/* Directly under everything, because it is a cut of everything and
            not a folder among folders: what you decided to hold for life.

            It is here even when it is empty. Hiding it until something was
            kept meant the shelf could only be found by someone who had already
            used a control they could not find either — the section taught
            nobody it existed, and the empty shelf is where it explains
            itself. */}
        <li className={`library-shelf__kept${keptCount === 0 ? ' is-empty' : ''}`}>
          <RoomShelfButton
            active={scope === 'kept'}
            onClick={() => onSelectScope?.('kept')}
          >
            <span>Kept</span>
            {Number.isFinite(keptCount) ? (
              <RoomShelfMeta className={keptCount > 0 ? 'is-ticking' : undefined} key={keptCount}>
                {keptCount}
              </RoomShelfMeta>
            ) : null}
          </RoomShelfButton>
        </li>
        {laterCount > 0 ? (
          <li className="library-shelf__later">
            <RoomShelfButton
              active={scope === 'later'}
              onClick={() => onSelectScope?.('later')}
            >
              <span>Later</span>
              <RoomShelfMeta>{laterCount}</RoomShelfMeta>
            </RoomShelfButton>
          </li>
        ) : null}
        {setAsideCount > 0 ? (
          <li className="library-shelf__set-aside">
            <RoomShelfButton
              active={scope === 'set-aside'}
              onClick={() => onSelectScope?.('set-aside')}
            >
              <span>Set aside</span>
              <RoomShelfMeta>{setAsideCount}</RoomShelfMeta>
            </RoomShelfButton>
          </li>
        ) : null}
        <li>
          <RoomShelfButton
            active={scope === 'unfiled'}
            onClick={() => onSelectScope?.('unfiled')}
          >
            <span>Unfiled</span>
            {Number.isFinite(unfiledCount) ? <RoomShelfMeta>{unfiledCount}</RoomShelfMeta> : null}
          </RoomShelfButton>
        </li>
        <li>
          <RoomShelfButton
            active={scope === 'highlights'}
            onClick={() => onSelectScope?.('highlights')}
          >
            <span>Highlights</span>
          </RoomShelfButton>
        </li>
      </RoomShelfList>

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
        <RoomShelfSection className="library-shelf__cabinet" label="Shelves">
          {/* A label rather than a rule. The group needed saying, and a line
              across the column was the product saying it without words. */}
          {foldersLoading ? (
            <p className="library-shelf__status" role="status">Loading shelves…</p>
          ) : null}
          {foldersError ? (
            <p className="library-shelf__status is-error" role="alert">{foldersError}</p>
          ) : null}
          {!foldersLoading && !foldersError && folders.length ? (
            <RoomShelfList className="library-shelf__folders">
              {folders.map(folder => {
                const isNeedsReview = folder.name?.trim().toLowerCase() === 'needs review';
                const active = isNeedsReview
                  ? scope === 'all' && sourceView === 'needs_review'
              : (scope === 'folder' && folderId === folder._id)
                || (scope === 'feed' && folderId === folder._id);
                return (
                  <li key={folder._id}>
                    <RoomShelfButton
                      active={active}
                      nested
                      onClick={() => onSelectFolder?.(folder._id)}
                    >
                      <span>{folder.name}</span>
                      {!isNeedsReview && folderCounts[folder._id] > 0 ? (
                        <RoomShelfMeta>{folderCounts[folder._id]}</RoomShelfMeta>
                      ) : null}
                    </RoomShelfButton>
                  </li>
                );
              })}
            </RoomShelfList>
          ) : null}
          {!foldersLoading && !foldersError && !folders.length ? (
            <p className="library-shelf__status">No shelves yet.</p>
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
        </RoomShelfSection>
      ) : null}
    </RoomShelf>
  );
};

export default LibraryShelfNav;
