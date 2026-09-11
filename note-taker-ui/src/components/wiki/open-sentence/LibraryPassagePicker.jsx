import React, { useEffect, useMemo, useRef, useState } from 'react';
import api from '../../../api';
import { getArticles } from '../../../api/articles';
import { getFolders } from '../../../api/folders';
import { searchKeyword } from '../../../api/retrieval';
import { getAuthHeaders } from '../../../hooks/useAuthHeaders';
import { buildFolderTree, flattenFolderTree } from '../../../pages/folderTreeModel';
import { buildArticlePassageHref } from '../../../utils/articlePassageAnchor';
import { buildCanonicalArticlePath, buildCanonicalHighlightPath } from '../../../utils/sourceRoutes';
import { cleanSourceTextForDisplay } from '../../../utils/sourceDisplayText';
import { alreadyUsedHere } from '../../../utils/libraryPassageUse';
import { surroundingFromArticle } from './openSentenceJourney';
import './library-passage-picker.css';

const SEARCH_PAUSE_MS = 220;
const ARTICLE_SELECTION_LIMIT = 6000;
const BROWSE_LIMIT = 1000;
const AROUND_WINDOW = 240;

const idOf = (value) => String(value?._id || value?.id || value || '').trim();
const clean = (value) => cleanSourceTextForDisplay(value || '');

export const loadOwnedArticle = async (articleId) => {
  const [articleResponse, highlightResponse] = await Promise.all([
    api.get(`/articles/${encodeURIComponent(articleId)}`, getAuthHeaders()),
    api.get(`/api/articles/${encodeURIComponent(articleId)}/highlights`, getAuthHeaders())
  ]);
  return {
    article: articleResponse.data || null,
    highlights: Array.isArray(highlightResponse.data) ? highlightResponse.data : []
  };
};

const resultRows = (payload = {}) => {
  const seen = new Set();
  const rows = [];
  const add = (row) => {
    const key = row.kind === 'highlight'
      ? `highlight:${row.articleId}:${row.highlightId}`
      : `article:${row.articleId}`;
    if (!row.articleId || seen.has(key)) return;
    seen.add(key);
    rows.push({ ...row, key });
  };
  (Array.isArray(payload?.highlights) ? payload.highlights : []).forEach((highlight) => add({
    kind: 'highlight',
    articleId: idOf(highlight.articleId),
    highlightId: idOf(highlight),
    title: String(highlight.articleTitle || '').trim() || 'Untitled source',
    passage: clean(highlight.text || highlight.anchor?.text),
    highlight
  }));
  (Array.isArray(payload?.articles) ? payload.articles : []).forEach((article) => add({
    kind: 'article',
    articleId: idOf(article),
    highlightId: '',
    title: String(article.title || '').trim() || 'Untitled source',
    passage: clean(article.content || article.firstGraph),
    article
  }));
  return rows;
};

const excludedPassage = (candidate, excluded = []) => alreadyUsedHere(candidate, excluded);

const passageFromHighlight = ({ article, highlight }) => {
  const articleId = idOf(article);
  const highlightId = idOf(highlight);
  const passage = clean(highlight?.text || highlight?.anchor?.text);
  const around = surroundingFromArticle({ article, highlight });
  return {
    title: String(article?.title || highlight?.articleTitle || '').trim() || 'Untitled source',
    passage,
    aroundBefore: around.aroundBefore,
    aroundAfter: around.aroundAfter,
    qualification: 'Saved passage · chosen from Library',
    available: Boolean(passage),
    stale: false,
    href: buildCanonicalHighlightPath({ articleId, highlightId }),
    originalHref: String(article?.url || '').trim(),
    isLibrary: true,
    here: false,
    articleId,
    highlightId,
    owned: true,
    anchor: highlight?.anchor || { text: passage }
  };
};

export const passageFromSelection = ({ article, text, start, end }) => {
  const passage = text.slice(start, end).trim();
  const first = text.indexOf(passage, start);
  const offset = first >= 0 ? first : start;
  const articleId = idOf(article);
  const anchor = {
    text: passage,
    prefix: text.slice(Math.max(0, offset - AROUND_WINDOW), offset),
    suffix: text.slice(offset + passage.length, offset + passage.length + AROUND_WINDOW),
    startOffsetApprox: offset
  };
  return {
    title: String(article?.title || '').trim() || 'Untitled source',
    passage,
    aroundBefore: text.slice(Math.max(0, offset - AROUND_WINDOW), offset).trim(),
    aroundAfter: text.slice(offset + passage.length, offset + passage.length + AROUND_WINDOW).trim(),
    qualification: 'Owned article passage · chosen from Library',
    available: Boolean(passage),
    stale: false,
    href: buildArticlePassageHref({ articleId, anchor }) || buildCanonicalArticlePath(articleId),
    originalHref: String(article?.url || '').trim(),
    isLibrary: true,
    here: false,
    articleId,
    highlightId: '',
    owned: true,
    anchor
  };
};

const LibraryPassagePicker = ({
  open = false,
  excluded = [],
  onDismiss = () => {},
  onPlace = () => {},
  search = searchKeyword,
  loadFolders = getFolders,
  loadArticles = getArticles,
  loadArticle = loadOwnedArticle
}) => {
  const [mode, setMode] = useState('search');
  const [query, setQuery] = useState('');
  const [folders, setFolders] = useState([]);
  const [folderId, setFolderId] = useState('');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(null);
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const requestId = useRef(0);
  const previewEntry = useRef(null);
  const resultButtons = useRef(new Map());
  const returnFocusKey = useRef('');
  const focusPreviewOnOpen = useRef(false);
  const focusResultOnBack = useRef(false);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key !== 'Escape' || event.isComposing || event.keyCode === 229) return;
      event.preventDefault();
      event.stopPropagation();
      onDismiss();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [onDismiss, open]);

  useEffect(() => {
    if (!open) {
      requestId.current += 1;
      setLoading(false);
      focusPreviewOnOpen.current = false;
      focusResultOnBack.current = false;
    }
    return () => { requestId.current += 1; };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (preview && focusPreviewOnOpen.current) {
      focusPreviewOnOpen.current = false;
      previewEntry.current?.focus();
    } else if (!preview && focusResultOnBack.current) {
      focusResultOnBack.current = false;
      resultButtons.current.get(returnFocusKey.current)?.focus();
    }
  }, [open, preview]);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    loadFolders()
      .then((items) => { if (!cancelled) setFolders(Array.isArray(items) ? items : []); })
      .catch(() => { if (!cancelled) setFolders([]); });
    return () => { cancelled = true; };
  }, [loadFolders, open]);

  useEffect(() => {
    if (!open || mode !== 'search') return undefined;
    const needle = query.trim();
    if (needle.length < 3) {
      requestId.current += 1;
      setRows([]);
      setLoading(false);
      setError('');
      return undefined;
    }
    const active = ++requestId.current;
    setRows([]);
    setLoading(true);
    setError('');
    const timer = window.setTimeout(async () => {
      try {
        const payload = await search({ q: needle, type: ['article', 'highlight'] });
        if (requestId.current === active) setRows(resultRows(payload));
      } catch (_failure) {
        if (requestId.current === active) {
          setRows([]);
          setError('Library search could not finish.');
        }
      } finally {
        if (requestId.current === active) setLoading(false);
      }
    }, SEARCH_PAUSE_MS);
    return () => {
      window.clearTimeout(timer);
      if (requestId.current === active) requestId.current += 1;
    };
  }, [mode, open, query, search]);

  useEffect(() => {
    if (!open || mode !== 'browse') return undefined;
    const active = ++requestId.current;
    setLoading(true);
    setError('');
    loadArticles({
      scope: folderId ? 'folder' : 'all',
      folderId,
      includePreview: true,
      limit: BROWSE_LIMIT
    }).then((articles) => {
      if (requestId.current !== active) return;
      setRows(resultRows({ articles }));
    }).catch(() => {
      if (requestId.current !== active) return;
      setRows([]);
      setError('This shelf could not be opened.');
    }).finally(() => {
      if (requestId.current === active) setLoading(false);
    });
    return () => {
      if (requestId.current === active) requestId.current += 1;
    };
  }, [folderId, loadArticles, mode, open]);

  const cabinet = useMemo(() => flattenFolderTree(buildFolderTree(
    folders,
    Object.fromEntries(folders.map((folder) => [idOf(folder), Number(folder.articleCount || 0)]))
  )), [folders]);

  const openPreview = async (row, trigger) => {
    const active = ++requestId.current;
    returnFocusKey.current = row.key;
    setLoading(true);
    setError('');
    setSelection({ start: 0, end: 0 });
    try {
      const loaded = await loadArticle(row.articleId);
      if (requestId.current !== active) return;
      const article = loaded?.article || null;
      if (!article) throw new Error('missing');
      const highlights = Array.isArray(loaded?.highlights) ? loaded.highlights : [];
      const selectedHighlight = row.kind === 'highlight'
        ? highlights.find((item) => idOf(item) === row.highlightId)
        : null;
      if (row.kind === 'highlight' && !selectedHighlight) {
        throw new Error('highlight missing');
      }
      focusPreviewOnOpen.current = document.activeElement === trigger;
      setPreview({ article, highlights, selectedHighlight });
    } catch (_failure) {
      if (requestId.current === active) setError('This source is no longer available in your Library.');
    } finally {
      if (requestId.current === active) setLoading(false);
    }
  };

  if (!open) return null;

  const articleText = clean(preview?.article?.content);
  const chosen = preview?.selectedHighlight
    ? passageFromHighlight({ article: preview.article, highlight: preview.selectedHighlight })
    : passageFromSelection({ article: preview?.article, text: articleText, ...selection });
  const selectionTooLong = !preview?.selectedHighlight && chosen.passage.length > ARTICLE_SELECTION_LIMIT;
  const mayPlace = Boolean(chosen.passage)
    && !selectionTooLong
    && !excludedPassage(chosen, excluded);
  const browseName = folderId
    ? (folders.find((folder) => idOf(folder) === folderId)?.name || 'this shelf')
    : 'all Library sources';

  return (
    <section className="library-passage-picker" role="dialog" aria-label="Find what I already have">
      <header className="library-passage-picker__head">
        <div>
          <p className="library-passage-picker__eyebrow">Your Library</p>
          <h3>Find what I already have</h3>
        </div>
        <button type="button" onClick={onDismiss}>Close</button>
      </header>

      {preview ? (
        <div className="library-passage-picker__preview">
          <button ref={previewEntry} type="button" className="library-passage-picker__back" onClick={() => {
            focusResultOnBack.current = true;
            setPreview(null);
          }}>
            Back to Library
          </button>
          <h4>{preview.article.title || 'Untitled source'}</h4>
          {preview.highlights.length ? (
            <div className="library-passage-picker__highlights" aria-label="Saved passages">
              {preview.highlights.map((highlight) => {
                const candidate = passageFromHighlight({ article: preview.article, highlight });
                return (
                  <button
                    key={idOf(highlight)}
                    type="button"
                    className={idOf(preview.selectedHighlight) === idOf(highlight) ? 'is-selected' : ''}
                    disabled={!candidate.passage || excludedPassage(candidate, excluded)}
                    onClick={() => {
                      setPreview((current) => ({ ...current, selectedHighlight: highlight }));
                      setSelection({ start: 0, end: 0 });
                    }}
                  >
                    {candidate.passage || 'Passage unavailable'}
                  </button>
                );
              })}
            </div>
          ) : null}
          {preview.selectedHighlight ? (
            <blockquote className="library-passage-picker__chosen">
              {chosen.aroundBefore ? <span>{chosen.aroundBefore} </span> : null}
              <mark>{chosen.passage}</mark>
              {chosen.aroundAfter ? <span> {chosen.aroundAfter}</span> : null}
            </blockquote>
          ) : (
            <label className="library-passage-picker__article">
              <span>Select the exact words to bring · up to 6,000 characters</span>
              <textarea
                aria-label="Article text"
                readOnly
                value={articleText}
                onSelect={(event) => setSelection({
                  start: event.currentTarget.selectionStart,
                  end: event.currentTarget.selectionEnd
                })}
              />
            </label>
          )}
          {!mayPlace && chosen.passage ? (
            <p className="library-passage-picker__quiet">
              {selectionTooLong
                ? `Choose a shorter passage. This selection is ${chosen.passage.length.toLocaleString()} characters.`
                : 'You already used this here.'}
            </p>
          ) : null}
          <div className="library-passage-picker__actions">
            {preview.selectedHighlight ? (
              <button type="button" onClick={() => setPreview((current) => ({ ...current, selectedHighlight: null }))}>
                Select other words
              </button>
            ) : null}
            <button type="button" disabled={!mayPlace} onClick={() => onPlace(chosen)}>Place here</button>
          </div>
        </div>
      ) : (
        <>
          <div className="library-passage-picker__modes" aria-label="Find a passage">
            <button
              type="button"
              aria-pressed={mode === 'search'}
              onClick={() => {
                requestId.current += 1;
                setRows([]);
                setLoading(false);
                setError('');
                setMode('search');
              }}
            >
              Search
            </button>
            <button
              type="button"
              aria-pressed={mode === 'browse'}
              onClick={() => {
                requestId.current += 1;
                setRows([]);
                setLoading(false);
                setError('');
                setMode('browse');
              }}
            >
              Browse shelves
            </button>
          </div>
          {mode === 'search' ? (
            <label className="library-passage-picker__search">
              <span>Search passages and articles</span>
              <input
                autoFocus
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="A title or phrase…"
              />
            </label>
          ) : (
            <nav className="library-passage-picker__folders" aria-label="Library shelves">
              <button type="button" className={!folderId ? 'is-selected' : ''} onClick={() => setFolderId('')}>All sources</button>
              {cabinet.map((folder) => (
                <button
                  key={folder.id}
                  type="button"
                  className={folderId === folder.id ? 'is-selected' : ''}
                  style={{ '--folder-depth': folder.depth }}
                  onClick={() => setFolderId(folder.id)}
                >
                  {folder.name}
                </button>
              ))}
            </nav>
          )}
          <ul className="library-passage-picker__results" aria-label="Library results">
            {rows.map((row) => (
              <li key={row.key}>
                <button
                  ref={(node) => {
                    if (node) resultButtons.current.set(row.key, node);
                    else resultButtons.current.delete(row.key);
                  }}
                  type="button"
                  onClick={(event) => openPreview(row, event.currentTarget)}
                >
                  <strong>{row.title}</strong>
                  <span>{row.kind === 'highlight' ? row.passage : (row.passage || 'Open to choose exact words')}</span>
                  {excludedPassage(row, excluded) ? (
                    <span className="library-passage-picker__quiet">You already used this here.</span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
          {loading ? <p className="library-passage-picker__quiet">Looking…</p> : null}
          {error ? <p className="library-passage-picker__quiet" role="alert">{error}</p> : null}
          {!loading && !error && mode === 'search' && query.trim().length < 3 ? (
            <p className="library-passage-picker__quiet">Type three letters to search your Library.</p>
          ) : null}
          {!loading && !error && !rows.length && (mode === 'browse' || query.trim().length >= 3) ? (
            <p className="library-passage-picker__quiet">
              {mode === 'browse' ? `No sources are filed in ${browseName}.` : `Nothing in your Library matches “${query.trim()}”.`}
            </p>
          ) : null}
          {!loading && !error && mode === 'browse' && rows.length ? (
            <p className="library-passage-picker__quiet">
              {rows.length >= BROWSE_LIMIT
                ? `Showing the newest ${BROWSE_LIMIT.toLocaleString()} sources in ${browseName}. Search can reach older sources.`
                : `${rows.length.toLocaleString()} ${rows.length === 1 ? 'source' : 'sources'} in ${browseName}.`}
            </p>
          ) : null}
        </>
      )}
    </section>
  );
};

export default LibraryPassagePicker;
