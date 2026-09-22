import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState
} from 'react';
import { Link } from 'react-router-dom';
import {
  getLibraryCollection,
  getLibraryCollectionTraces,
  getLibraryPeek
} from '../../api/libraryCollection';
import LibrarySourcePeek, { sourcePassage } from './LibrarySourcePeek';
import { LibraryMenu } from './LibraryActions';
import { sourceLabel } from './libraryColumnModel';
import {
  buildEvergreenIndex,
  evergreenHref,
  EVERGREEN_KIND_LABEL
} from '../../pages/evergreenModel';
import { scopedKey, currentAccountId } from '../../utils/browserScope';
import { beginArticleDrag } from '../../pages/dragGrammar';

const LABELS = {
  all: 'Library',
  unfiled: 'Unfiled',
  later: 'Later',
  'set-aside': 'On the desk',
  kept: 'Keepers'
};
const MATCH_LABELS = {
  title: 'Matched title',
  thought: 'Matched your thought',
  passage: 'Matched passage',
  body: 'Matched source text',
  record: 'Matched source record'
};
const TRACE_LABELS = {
  thought: 'Your thought',
  continue: 'Continue',
  passage: 'Marked passage'
};
const SORT_OPTIONS = [
  { value: 'recent', label: 'Recently saved' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'title', label: 'Title A–Z' }
];
const scrollerFor = (node) => {
  let parent = node?.parentElement;
  while (
    parent &&
    !(
      parent.scrollHeight > parent.clientHeight &&
      /(auto|scroll)/.test(getComputedStyle(parent).overflowY)
    )
  )
    parent = parent.parentElement;
  return parent || window;
};
const getSaved = (key) => {
  try {
    return JSON.parse(sessionStorage.getItem(key)) || {};
  } catch (_) {
    return {};
  }
};

export default function LibraryCollection({
  scope,
  revision = 0,
  folderId,
  folderName,
  query,
  sort = 'recent',
  onQueryChange,
  onSortChange,
  showSuppressed,
  selectedArticleId,
  onSelectArticle,
  onPlace,
  onMove,
  keptPages,
  letGo,
  onUndoLetGo,
  tools
}) {
  const root = useRef(null),
    request = useRef(0),
    search = useRef(null),
    previousArticle = useRef('');
  const identity = JSON.stringify({
    scope,
    folderId,
    query,
    sort,
    showSuppressed
  });
  const storageKey = currentAccountId()
    ? scopedKey(`library.return:${identity}`)
    : '';
  const [state, setState] = useState({
    items: [],
    loading: true,
    total: 0,
    nextOffset: null,
    error: ''
  });
  const [peekId, setPeekId] = useState(() => getSaved(storageKey).peekId || '');
  const [returned, setReturned] = useState('');
  const [opening, setOpening] = useState('');
  const placeRef = useRef(getSaved(storageKey));
  const loaded = useRef(40);
  const restore = useRef(false);
  const fetchPage = useCallback(
    async (offset = 0, refreshCount = 40) => {
      const generation = ++request.current;
      setState((current) => ({ ...current, loading: true, error: '' }));
      try {
        let items = [],
          payload,
          next = offset;
        do {
          payload = await getLibraryCollection({
            ...JSON.parse(identity),
            showSuppressed: showSuppressed ? '1' : '0',
            offset: next,
            limit: Math.min(100, refreshCount - items.length)
          });
          items.push(...payload.items);
          next = payload.nextOffset;
        } while (next != null && items.length < refreshCount);
        if (request.current !== generation) return;
        setState((current) => ({
          items: offset ? [...current.items, ...items] : items,
          loading: false,
          error: '',
          total: payload.total,
          nextOffset: next
        }));
        loaded.current = offset + items.length;
        const traceGeneration = generation;
        getLibraryCollectionTraces(items.filter(item => !item.trace).map(item => item._id))
          .then((traces) => {
            if (request.current !== traceGeneration || !traces.length) return;
            const byId = new Map(traces.map(row => [String(row.articleId), row.trace]));
            setState(current => ({
              ...current,
              items: current.items.map(item => (
                byId.has(String(item._id)) ? { ...item, trace: byId.get(String(item._id)) } : item
              ))
            }));
          })
          .catch(() => {});
      } catch (_) {
        if (request.current === generation)
          setState((current) => ({
            ...current,
            loading: false,
            error: 'Your collection could not load. Please retry.'
          }));
      }
    },
    [identity, showSuppressed]
  );
  useEffect(() => {
    const saved = getSaved(storageKey);
    placeRef.current = saved;
    setPeekId(saved.peekId || '');
    restore.current = Boolean(saved.focusId);
    const timer = window.setTimeout(
      () => fetchPage(0, Math.max(40, Math.min(saved.loaded || 40, 1000))),
      query ? 250 : 0
    );
    return () => {
      window.clearTimeout(timer);
      request.current += 1;
    };
  }, [fetchPage, query, storageKey]);
  useEffect(() => {
    if (previousArticle.current && !selectedArticleId) {
      restore.current = true;
      fetchPage(0, Math.max(40, loaded.current));
    }
    previousArticle.current = selectedArticleId;
  }, [selectedArticleId, fetchPage]);
  const lastRevision = useRef(revision);
  useEffect(() => {
    if (lastRevision.current === revision) return;
    lastRevision.current = revision;
    fetchPage(0, Math.max(40, loaded.current));
  }, [revision, fetchPage]);
  useLayoutEffect(() => {
    if (selectedArticleId || state.loading || !restore.current) return;
    restore.current = false;
    const held = placeRef.current;
    const frame = requestAnimationFrame(() => {
      scrollerFor(root.current).scrollTo?.({
        top: held.top || 0,
        behavior: 'instant'
      });
      const node = root.current?.querySelector(
        `[data-source-id="${held.focusId}"] .library-source-title`
      );
      node?.focus({ preventScroll: true });
      setReturned(held.focusId || '');
    });
    const timer = setTimeout(() => setReturned(''), 2200);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, [selectedArticleId, state.loading]);
  useEffect(() => {
    const key = (event) => {
      if (
        selectedArticleId ||
        document.querySelector('[role="dialog"][aria-modal="true"]')
      )
        return;
      if (event.key === 'Escape' && peekId) {
        event.preventDefault();
        event.stopPropagation();
        closePeek();
      }
      if (
        event.key === '/' &&
        !event.target.closest?.('input,textarea,[contenteditable="true"]')
      ) {
        event.preventDefault();
        search.current?.focus();
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });
  const closePeek = () => {
    const id = peekId;
    setPeekId('');
    root.current
      ?.querySelector(`[data-source-id="${id}"] .library-peek-trigger`)
      ?.focus({ preventScroll: true });
  };
  const open = async (row, destination = null) => {
    const scroller = scrollerFor(root.current);
    placeRef.current = {
      top: scroller === window ? window.scrollY : scroller.scrollTop,
      peekId,
      focusId: row._id,
      loaded: loaded.current
    };
    try {
      if (storageKey)
        sessionStorage.setItem(storageKey, JSON.stringify(placeRef.current));
    } catch (_) {}
    if (!destination && row.match?.kind === 'body') {
      setOpening(row._id);
      try {
        const article = await getLibraryPeek(row._id);
        const { anchor } = sourcePassage(article, row);
        destination = anchor ? { anchor } : { searchMissing: true };
      } catch (_) {
        destination = { searchMissing: true };
      }
      setOpening('');
    }
    const match = row.match;
    onSelectArticle(
      row._id,
      destination ||
        (match?.highlightId
          ? {
              highlightId: match.highlightId,
              thought: match.kind === 'thought'
            }
          : {})
    );
  };
  const pages =
    scope === 'kept'
      ? buildEvergreenIndex({ articles: [], pages: keptPages || [] }).filter(
          (row) =>
            !query || row.title.toLowerCase().includes(query.toLowerCase())
        )
      : [];
  return (
    <section
      ref={root}
      className="library-collection"
      hidden={Boolean(selectedArticleId)}
      aria-label="Source collection"
    >
      <header className="library-collection-head">
        <h1>{LABELS[scope] || folderName || 'Library'}</h1>
        <div>
          <LibraryMenu
            className="library-sort"
            label={SORT_OPTIONS.find(option => option.value === sort)?.label || 'Sort sources'}
            menuLabel="Sort sources"
            actions={SORT_OPTIONS.map(option => ({
              id: option.value,
              label: option.label,
              current: option.value === sort,
              onSelect: () => onSortChange(option.value)
            }))}
          />
          {tools}
        </div>
      </header>
      <label className="library-collection-search">
        <span className="sr-only">Find a title, passage, or thought</span>
        <input
          ref={search}
          aria-label="Find a title, passage, or thought"
          type="search"
          value={query}
          maxLength={200}
          placeholder="Find a title, a passage, a thought…"
          onChange={(event) => onQueryChange(event.target.value)}
        />
        <kbd>/</kbd>
      </label>
      {query ? (
        <p className="library-search-coverage">
          {state.loading
            ? 'Searching saved sources…'
            : `${state.total} matching sources in ${scope === 'all' ? 'your Library' : 'this collection'}.`}{' '}
          Searches saved titles, source text, and passage notes.
        </p>
      ) : null}
      {state.error ? (
        <p role="alert">
          {state.error} <button onClick={() => fetchPage()}>Retry</button>
        </p>
      ) : null}
      {!state.items.length && state.loading ? (
        <p role="status">Opening your collection…</p>
      ) : null}
      {!state.loading &&
      !state.items.length &&
      !pages.length &&
      !state.error &&
      (scope !== 'kept' || keptPages !== null) ? (
        <p className="library-collection-empty">
          {query
            ? 'Nothing matches that yet.'
            : scope === 'set-aside'
              ? 'A clear desk.'
              : 'Nothing here yet.'}
        </p>
      ) : null}
      {scope === 'kept' && letGo ? (
        <p className="library-placement-receipt">
          Let go of {letGo.title || 'a source'}.{' '}
          <button onClick={() => onUndoLetGo(letGo).then(() => fetchPage())}>
            Undo
          </button>
        </p>
      ) : null}
      <ul className="library-source-collection">
        {state.items.map((row) => {
          const trace = row.match || row.trace;
          return (
            <li
              key={row._id}
              data-source-id={row._id}
              className={`library-collection-row${returned === row._id ? ' is-returned' : ''}`}
              draggable
              onDragStart={(event) => beginArticleDrag(event, row._id)}
            >
              <div className="library-source-face">
                <div>
                  <button
                    className="library-source-title"
                    disabled={opening === row._id}
                    onClick={() => open(row)}
                  >
                    {row.title || 'Untitled source'}
                  </button>
                  <p className="library-source-meta">
                    {[
                      sourceLabel(row),
                      row.folder?.name,
                      row.placement === 'later'
                        ? 'In Later'
                        : row.placement === 'setAside'
                          ? 'On the desk'
                          : '',
                      row.createdAt
                        ? new Date(row.createdAt).toLocaleDateString(
                            undefined,
                            { month: 'short', day: 'numeric', year: 'numeric' }
                          )
                        : ''
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                  {trace && trace.kind !== 'title' ? (
                    <p
                      className={`library-personal-trace${trace.kind === 'continue' ? ' is-continuation' : ''}`}
                    >
                      <span>
                        {(row.match ? MATCH_LABELS : TRACE_LABELS)[trace.kind]}
                      </span>
                      {trace.text}
                    </p>
                  ) : row.match ? (
                    <p className="library-row-label">Matched title</p>
                  ) : null}
                </div>
                <button
                  className="library-peek-trigger"
                  aria-expanded={peekId === row._id}
                  aria-controls={`peek-${row._id}`}
                  aria-label={`${peekId === row._id ? 'Close Peek' : 'Peek'}: ${row.title}`}
                  onClick={() =>
                    peekId === row._id ? closePeek() : setPeekId(row._id)
                  }
                >
                  Peek {peekId === row._id ? '−' : '+'}
                </button>
              </div>
              {peekId === row._id ? (
                <LibrarySourcePeek
                  key={`${row._id}:${query}`}
                  row={row}
                  onRead={open}
                  onPlace={onPlace}
                  onMove={onMove}
                />
              ) : null}
            </li>
          );
        })}
        {pages.map((row) => (
          <li
            className={`library-collection-row${row.retiredAt ? ' is-retired' : ''}`}
            key={`${row.kind}:${row.targetId}`}
          >
            <Link className="library-source-title" to={evergreenHref(row)}>
              {row.title}
            </Link>
            <p className="library-source-meta">
              {EVERGREEN_KIND_LABEL[row.kind]}
              {row.retiredAt ? ' · retired' : ''}
            </p>
          </li>
        ))}
      </ul>
      {state.nextOffset != null ? (
        <button
          className="library-load-more"
          disabled={state.loading}
          onClick={() => fetchPage(state.nextOffset)}
        >
          {' '}
          {state.loading ? 'Opening…' : 'More sources'}{' '}
        </button>
      ) : null}
    </section>
  );
}
