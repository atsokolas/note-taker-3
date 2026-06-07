import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import { searchKeyword } from '../api/retrieval';
import { createWikiPage, listWikiPages } from '../api/wiki';
import { Card, Button } from './ui';
import { buildCanonicalArticlePath } from '../utils/firstInsight';
import { getNotebookSummaries } from '../api/notebook';
import { buildWikiCreatePayload, openWikiDraft } from '../utils/wikiCreate';
import { buildReferenceHandoffPath } from '../navigation/referenceHandoff';

const EMPTY_GROUPS = {
  notes: [],
  highlights: [],
  claims: [],
  evidence: []
};

const buildResultLabel = (item = {}, fallback = '') => {
  const primary = String(item.title || item.text || fallback || '').trim();
  const secondary = String(item.snippet || item.content || item.articleTitle || '').trim();
  if (!secondary) return primary || 'Untitled';
  if (!primary) return secondary;
  return `${primary} — ${secondary.slice(0, 90)}`;
};

const normalizeSearchText = (value = '') => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/[\s\p{Punctuation}]+/gu, ' ')
  .trim();

const scoreLocalMatch = (label = '', query = '') => {
  const normalizedLabel = normalizeSearchText(label);
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedLabel || !normalizedQuery) return 0;
  if (normalizedLabel === normalizedQuery) return 100;
  if (normalizedLabel.startsWith(normalizedQuery)) return 90;
  const words = normalizedLabel.split(/\s+/).filter(Boolean);
  if (words.some(word => word === normalizedQuery)) return 86;
  if (words.some(word => word.startsWith(normalizedQuery))) return 82;
  if (normalizedLabel.includes(normalizedQuery)) return 50;
  return 0;
};

const rankLocalItems = (items = [], query = '') => (
  items
    .map((item, index) => ({ item, index, score: scoreLocalMatch(item.label, query) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ item }) => ({ ...item, immediate: true }))
);

const currentPathname = () => (
  typeof window === 'undefined' ? '' : window.location?.pathname || ''
);

const currentLocationSearch = () => (
  typeof window === 'undefined' ? '' : window.location?.search || ''
);

const CommandPalette = ({ open, onClose }) => {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [articles, setArticles] = useState([]);
  const [searchGroups, setSearchGroups] = useState(EMPTY_GROUPS);
  const [notebook, setNotebook] = useState([]);
  const [collections, setCollections] = useState([]);
  const [concepts, setConcepts] = useState([]);
  const [wikiPages, setWikiPages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const isWikiSurface = currentPathname().startsWith('/wiki');
  const pullReferencePath = buildReferenceHandoffPath({
    pathname: currentPathname(),
    search: currentLocationSearch()
  });

  const pages = useMemo(() => ([
    { label: 'Today', path: '/today' },
    { label: 'Library', path: '/library' },
    { label: 'Think', path: '/think' },
    { label: 'Review', path: '/review' },
    { label: 'Map', path: '/map' },
    { label: 'Marketing Analytics', path: '/marketing-analytics' },
    { label: 'Search Console Opportunities', path: '/search-console-opportunities' },
    { label: 'Settings', path: '/settings' }
  ]), []);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setArticles([]);
    setSearchGroups(EMPTY_GROUPS);
    setWikiPages([]);
    setActiveIndex(0);
    const fetchBase = async () => {
      try {
        const token = localStorage.getItem('token');
        const headers = { Authorization: `Bearer ${token}` };
        const [notebookRows, colRes, tagRes, wikiRows] = await Promise.allSettled([
          getNotebookSummaries(),
          api.get('/api/collections', { headers }),
          api.get('/api/tags', { headers }),
          listWikiPages({ limit: 12 })
        ]);
        setNotebook(notebookRows.status === 'fulfilled' ? notebookRows.value || [] : []);
        setCollections(colRes.status === 'fulfilled' ? colRes.value?.data || [] : []);
        setConcepts(tagRes.status === 'fulfilled' ? tagRes.value?.data || [] : []);
        setWikiPages(wikiRows.status === 'fulfilled' && Array.isArray(wikiRows.value) ? wikiRows.value : []);
      } catch (err) {
        console.error('Palette preload failed', err);
      }
    };
    fetchBase();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const fetchSearch = async () => {
      const q = query.trim();
      if (!q) {
        setArticles([]);
        setSearchGroups(EMPTY_GROUPS);
        return;
      }
      setLoading(true);
      try {
        const [searchResult, wikiResult] = await Promise.allSettled([
          searchKeyword({ q, scope: 'all' }),
          listWikiPages({ q, limit: 8 })
        ]);
        const data = searchResult.status === 'fulfilled' ? searchResult.value : {};
        setArticles(Array.isArray(data?.articles) ? data.articles : []);
        setSearchGroups({
          notes: Array.isArray(data?.groups?.notes) ? data.groups.notes : [],
          highlights: Array.isArray(data?.groups?.highlights) ? data.groups.highlights : [],
          claims: Array.isArray(data?.groups?.claims) ? data.groups.claims : [],
          evidence: Array.isArray(data?.groups?.evidence) ? data.groups.evidence : []
        });
        setWikiPages(wikiResult.status === 'fulfilled' && Array.isArray(wikiResult.value) ? wikiResult.value : []);
      } catch (err) {
        console.error('Palette search failed', err);
      } finally {
        setLoading(false);
      }
    };
    const timer = setTimeout(fetchSearch, 180);
    return () => clearTimeout(timer);
  }, [query, open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  const createNote = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      const res = await api.post('/api/notebook', { title: 'Untitled', content: '', blocks: [] }, { headers });
      if (res.data?._id) {
        navigate(`/think?tab=notebook&entryId=${res.data._id}`);
      } else {
        navigate('/think?tab=notebook');
      }
    } catch (err) {
      console.error('Palette new note failed', err);
      navigate('/think?tab=notebook');
    }
  }, [navigate]);

  const createWiki = useCallback(async () => {
    const seed = query.trim();
    try {
      const page = await createWikiPage(buildWikiCreatePayload({
        type: seed ? 'search' : 'wiki_index',
        title: seed || 'Untitled Wiki Page',
        text: seed,
        label: seed || 'Command palette'
      }));
      onClose?.();
      openWikiDraft({ navigate, pageId: page._id });
    } catch (err) {
      console.error('Palette new wiki page failed', err);
      onClose?.();
      navigate('/wiki');
    }
  }, [navigate, onClose, query]);

  const sections = useMemo(() => {
    const q = query.trim();
    const list = [];

    const actionSection = {
      title: 'Actions',
      items: [
        { type: 'Action', label: 'New Think note', action: createNote },
        { type: 'Action', label: 'Pull reference into current surface', path: pullReferencePath },
        { type: 'Action', label: q ? `New Wiki page from "${q.slice(0, 48)}"` : 'New Wiki page', action: createWiki },
        { type: 'Action', label: 'New collection', path: '/library?tab=collections' }
      ]
    };

    const pagesSection = {
      title: 'Pages',
      items: pages.map(page => ({ type: 'Page', label: page.label, path: page.path }))
    };
    const wikiDestinationsSection = {
      title: 'Wiki',
      items: [
        { type: 'Wiki', label: 'Wiki home', path: '/wiki' },
        { type: 'Wiki', label: 'Wiki workspace', path: '/wiki/workspace' },
        { type: 'Wiki', label: 'Wiki pages', path: '/wiki/workspace?view=list' },
        { type: 'Wiki', label: 'Knowledge map', path: '/wiki/workspace?view=graph' }
      ]
    };
    const wikiPagesSection = {
      title: 'Wiki pages',
      items: wikiPages.slice(0, q ? 8 : 6).map(page => {
        const pageId = page._id || page.id;
        return pageId ? {
          type: 'Wiki',
          label: page.title || 'Untitled wiki page',
          path: `/wiki/workspace?page=${pageId}`
        } : null;
      })
    };

    if (!q) {
      if (isWikiSurface) {
        list.push(wikiPagesSection);
        list.push(wikiDestinationsSection);
      }
      list.push(actionSection);
      list.push(pagesSection);
      if (!isWikiSurface) list.push(wikiDestinationsSection);
    }

    if (q) {
      const rankedWikiPages = rankLocalItems(wikiPagesSection.items, q);
      const wikiPageMatches = rankedWikiPages.length ? rankedWikiPages : wikiPagesSection.items;
      if (isWikiSurface && wikiPageMatches.length) {
        list.push({
          title: 'Wiki pages',
          items: wikiPageMatches
        });
      }
      const rankedPages = rankLocalItems(pagesSection.items, q);
      if (rankedPages.length) {
        list.push({
          title: 'Pages',
          items: rankedPages
        });
      }
      list.push({
        title: 'Notes',
        items: (searchGroups.notes || []).slice(0, 6).map(item => ({
          type: 'Note',
          label: buildResultLabel(item, 'Note'),
          path: item.openPath || `/think?tab=notebook&entryId=${item._id}`
        }))
      });
      list.push({
        title: 'Highlights',
        items: (searchGroups.highlights || []).slice(0, 6).map(item => ({
          type: 'Highlight',
          label: buildResultLabel(item, 'Highlight'),
          path: item.openPath || buildCanonicalArticlePath(item.articleId || '')
        }))
      });
      list.push({
        title: 'Claims',
        items: (searchGroups.claims || []).slice(0, 6).map(item => ({
          type: 'Claim',
          label: buildResultLabel(item, 'Claim'),
          path: item.openPath || (item.articleId ? buildCanonicalArticlePath(item.articleId) : `/think?tab=notebook&entryId=${item._id}`)
        }))
      });
      list.push({
        title: 'Evidence',
        items: (searchGroups.evidence || []).slice(0, 6).map(item => ({
          type: 'Evidence',
          label: buildResultLabel(item, 'Evidence'),
          path: item.openPath || (item.articleId ? buildCanonicalArticlePath(item.articleId) : `/think?tab=notebook&entryId=${item._id}`)
        }))
      });
      list.push({
        title: 'Articles',
        items: articles.slice(0, 5).map(item => ({
          type: 'Article',
          label: buildResultLabel(item, item.title || 'Article'),
          path: buildCanonicalArticlePath(item._id)
        }))
      });
      list.push(actionSection);
      if (!isWikiSurface && wikiPageMatches.length) {
        list.push({
          title: 'Wiki pages',
          items: wikiPageMatches
        });
      }
      const rankedWikiDestinations = rankLocalItems(wikiDestinationsSection.items, q);
      if (rankedWikiDestinations.length) {
        list.push({
          title: 'Wiki',
          items: rankedWikiDestinations
        });
      }
    } else {
      list.push({
        title: 'Think concepts',
        items: concepts.slice(0, 8).map(item => ({
          type: 'Think',
          label: item.tag,
          path: `/think?tab=concepts&concept=${encodeURIComponent(item.tag)}`
        }))
      });
      list.push({
        title: 'Think notebook',
        items: notebook.slice(0, 6).map(item => ({
          type: 'Think',
          label: item.title || 'Untitled note',
          path: `/think?tab=notebook&entryId=${item._id}`
        }))
      });
      list.push({
        title: 'Collections',
        items: collections.slice(0, 6).map(item => ({
          type: 'Collection',
          label: item.name,
          path: `/collections/${item.slug}`
        }))
      });
    }

    return list
      .map(section => ({ ...section, items: section.items.filter(Boolean) }))
      .filter(section => section.items.length > 0);
  }, [articles, collections, concepts, createNote, createWiki, isWikiSurface, notebook, pages, pullReferencePath, query, searchGroups, wikiPages]);

  const selectableItems = useMemo(
    () => sections.flatMap(section => section.items),
    [sections]
  );

  useEffect(() => {
    if (selectableItems.length === 0) {
      setActiveIndex(0);
      return;
    }
    setActiveIndex(prev => Math.min(prev, selectableItems.length - 1));
  }, [selectableItems]);

  const handleSelect = (item) => {
    if (!item) return;
    if (item.action) {
      onClose();
      item.action();
      return;
    }
    if (item.path) {
      navigate(item.path);
      onClose();
      return;
    }
    onClose();
  };

  const handleResultClick = (item) => (event) => {
    event.preventDefault();
    handleSelect(item);
  };

  const handleResultMouseDown = (event) => {
    // Keep focus in the palette input long enough for click selection to commit.
    event.preventDefault();
  };

  const handleResultKeyDown = (item) => (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleSelect(item);
    }
  };

  const handleKeyDown = (event) => {
    if (!open) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex(prev => Math.min(prev + 1, Math.max(selectableItems.length - 1, 0)));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex(prev => Math.max(prev - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const selectedItem = selectableItems[activeIndex];
      if (loading && !selectedItem?.immediate) return;
      handleSelect(selectedItem);
    } else if (event.key === 'Escape') {
      onClose();
    }
  };

  if (!open) return null;

  let renderedIndex = -1;

  return (
    <div className="palette-overlay" onKeyDown={handleKeyDown} tabIndex={-1}>
      <Card className="palette-card">
        <div className="palette-input-row">
          <input
            autoFocus
            value={query}
            onChange={(event) => {
              const nextQuery = event.target.value;
              setQuery(nextQuery);
              setLoading(Boolean(nextQuery.trim()));
            }}
            placeholder={isWikiSurface ? 'Quick open wiki pages, notes, sources...' : 'Quick open notes, highlights, claims, evidence...'}
            className="palette-input"
          />
          <Button variant="secondary" onClick={onClose}>Close</Button>
        </div>
        <div className="palette-shortcuts">
          <span className="muted small">Cmd/Ctrl+K: Open</span>
          <span className="muted small">Arrows + Enter: Navigate</span>
        </div>
        {loading && <p className="muted small">Searching…</p>}
        <div className="palette-list">
          {!loading && selectableItems.length === 0 && <p className="muted small">No results.</p>}
          {sections.map(section => (
            <div key={section.title} className="palette-group">
              <div className="palette-group-title">{section.title}</div>
              {section.items.map(item => {
                renderedIndex += 1;
                const rowIndex = renderedIndex;
                const isActive = rowIndex === activeIndex;
                return (
                  <button
                    type="button"
                    key={`${section.title}-${item.type}-${item.label}`}
                    className={`palette-item ${isActive ? 'active' : ''}`}
                    onMouseEnter={() => setActiveIndex(rowIndex)}
                    onMouseDown={handleResultMouseDown}
                    onClick={handleResultClick(item)}
                    onKeyDown={handleResultKeyDown(item)}
                  >
                    <span className="muted small">{item.type}</span>
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
};

export default CommandPalette;
