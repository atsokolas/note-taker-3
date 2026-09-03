import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  RoomShelf,
  RoomShelfButton,
  RoomShelfList,
  RoomShelfMeta,
  RoomShelfSection
} from '../collection/RoomShelf';
import { flySentenceInto } from '../../motion/columnMotion';
import { buildFolderTree, folderCountPhrase } from '../../pages/folderTreeModel';
import { isProceduralShelf } from '../../pages/readingDriftModel';

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

const FeedTopic = ({ topic, active, onSelect }) => {
  const labelRef = useRef(null);
  useLayoutEffect(() => {
    flySentenceInto(labelRef.current, topic.name);
  }, [topic.name]);
  return (
    <li className="library-shelf__feed">
      <RoomShelfButton active={active} onClick={() => onSelect?.(topic.id)}>
        <span ref={labelRef}>{topic.name}</span>
      </RoomShelfButton>
    </li>
  );
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
  feedTopics = [],
  query = '',
  onQueryChange,
  onSelectScope,
  onSelectFolder,
  onReviewFiling,
  /* The folder something just landed in, for 250ms. */
  landedFolderId = '',
  filingLaunching = false,
  className = ''
}) => {
  const narrow = useNarrowShelf();
  const [cabinetOpen, setCabinetOpen] = useState(false);
  /* Which drawers are shut. Folded rather than opened, so a cabinet opens
     showing everything it holds — a tree that starts closed makes the reader
     hunt for what they already own. */
  const [folded, setFolded] = useState(() => new Set());
  const toggleFold = (id) => setFolded((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  /* The cabinet is a tree, and the rows are its visible branches: a drawer
     that is folded hides what is inside it, and procedural shelves never
     appear at all. */
  const cabinet = useMemo(() => {
    const visible = (nodes, depth = 0) => nodes.flatMap(node => [
      { ...node, depth },
      ...(folded.has(node.id) ? [] : visible(node.children, depth + 1))
    ]);
    return visible(buildFolderTree(folders, folderCounts));
  }, [folded, folders, folderCounts]);

  /* Procedural shelves are machinery, not places, so they leave the cabinet
     and become one quiet line under it. Needs Review is a queue the product
     keeps, not a drawer the reader filled — filed among their own folders it
     read as one of theirs, and its backlog shouted. */
  const procedural = useMemo(
    () => (Array.isArray(folders) ? folders : []).filter(folder => isProceduralShelf(folder?.name)),
    [folders]
  );
  /* Being on a folder means the cabinet is already where you are. With no
     folders there is no cabinet to fold, and folding one would take the filing
     with it — the one thing that would give you folders in the first place. */
  const showCabinet = !narrow || cabinetOpen || scope === 'folder' || !folders.length;
  /* Screened topics ride in the places strip at every width. Under 900px the
     cabinet folds away, so blanking them here left a scroll with no door on a
     phone — the strip is the only way in, which is exactly when it must
     carry them. A topic with no id or no name is not a door and is dropped. */
  const topics = (Array.isArray(feedTopics) ? feedTopics : []).filter((topic) => topic?.id && topic?.name);

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
            {/* Not all of them. This list is every source that is not in a
                pile and not in a folder you screened as a feed — and its
                count has always been that same set, so only the word was
                wrong. "Home" is what the switch on a source calls this, so
                the room and the control now use one word for one place. */}
            <span>At home</span>
            {Number.isFinite(count) ? <RoomShelfMeta>{count}</RoomShelfMeta> : null}
          </RoomShelfButton>
        </li>
        {topics.map((topic) => (
          <FeedTopic
            key={topic.id}
            topic={topic}
            active={scope === 'feed' && folderId === topic.id}
            onSelect={onSelectFolder}
          />
        ))}
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
          {!foldersLoading && !foldersError && cabinet.length ? (
            <RoomShelfList className="library-shelf__folders">
              {cabinet.map(node => {
                const active = (scope === 'folder' && folderId === node.id)
                  || (scope === 'feed' && folderId === node.id);
                const openable = node.children.length > 0;
                const unfolded = openable && !folded.has(node.id);
                return (
                  <li
                    key={node.id}
                    className={[
                      'library-shelf__branch',
                      node.asFeed ? 'is-living' : '',
                      node.id === landedFolderId ? 'is-landing' : ''
                    ].filter(Boolean).join(' ')}
                    style={{ '--depth': node.depth }}
                  >
                    <RoomShelfButton
                      active={active}
                      nested
                      onClick={() => onSelectFolder?.(node.id)}
                    >
                      {/* A disclosure only where there is something to
                          disclose, and only under a cursor: at rest the tree
                          is names and numbers. */}
                      {openable ? (
                        <span
                          className="library-shelf__disclose"
                          role="button"
                          tabIndex={0}
                          aria-label={unfolded ? `Fold ${node.name}` : `Unfold ${node.name}`}
                          aria-expanded={unfolded}
                          onClick={(event) => { event.stopPropagation(); toggleFold(node.id); }}
                          onKeyDown={(event) => {
                            if (event.key !== 'Enter' && event.key !== ' ') return;
                            event.preventDefault();
                            event.stopPropagation();
                            toggleFold(node.id);
                          }}
                        >
                          {unfolded ? '▾' : '▸'}
                        </span>
                      ) : null}
                      <span>{node.name}</span>
                      {/* Counts roll up the tree; a drawer holding nothing
                          says nothing rather than nought. */}
                      {/* The number is scannable; the sentence is on the
                          tooltip, where a reader who wants to know can find
                          it. No number without a noun and a time. */}
                      {node.total > 0 ? (
                        <RoomShelfMeta title={folderCountPhrase(node)}>{node.total}</RoomShelfMeta>
                      ) : null}
                    </RoomShelfButton>
                  </li>
                );
              })}
            </RoomShelfList>
          ) : null}
          {!foldersLoading && !foldersError && !cabinet.length && !procedural.length ? (
            <p className="library-shelf__status">No shelves yet.</p>
          ) : null}

          {procedural.length ? (
            <p className="library-shelf__procedural">
              {procedural.map(folder => (
                <button
                  key={folder._id}
                  type="button"
                  aria-current={sourceView === 'needs_review' && scope === 'all' ? 'true' : undefined}
                  onClick={() => onSelectFolder?.(folder._id)}
                >
                  {folder.name}
                </button>
              ))}
            </p>
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
