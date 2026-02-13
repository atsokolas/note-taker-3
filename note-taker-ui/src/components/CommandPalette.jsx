import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import { searchKeyword } from '../api/retrieval';
import { Card, Button } from './ui';

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

const CommandPalette = ({ open, onClose }) => {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [articles, setArticles] = useState([]);
  const [searchGroups, setSearchGroups] = useState(EMPTY_GROUPS);
  const [notebook, setNotebook] = useState([]);
  const [collections, setCollections] = useState([]);
  const [concepts, setConcepts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const pages = useMemo(() => ([
    { label: 'Today', path: '/today' },
    { label: 'Library', path: '/library' },
    { label: 'Think', path: '/think' },
    { label: 'Review', path: '/review' },
    { label: 'Map', path: '/map' },
    { label: 'Settings', path: '/settings' }
  ]), []);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setArticles([]);
    setSearchGroups(EMPTY_GROUPS);
    setActiveIndex(0);
    const fetchBase = async () => {
      try {
        const token = localStorage.getItem('token');
        const headers = { Authorization: `Bearer ${token}` };
        const [nbRes, colRes, tagRes] = await Promise.all([
          api.get('/api/notebook', { headers }),
          api.get('/api/collections', { headers }),
          api.get('/api/tags', { headers })
        ]);
        setNotebook(nbRes.data || []);
        setCollections(colRes.data || []);
        setConcepts(tagRes.data || []);
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
        const data = await searchKeyword({ q, scope: 'all' });
        setArticles(Array.isArray(data?.articles) ? data.articles : []);
        setSearchGroups({
          notes: Array.isArray(data?.groups?.notes) ? data.groups.notes : [],
          highlights: Array.isArray(data?.groups?.highlights) ? data.groups.highlights : [],
          claims: Array.isArray(data?.groups?.claims) ? data.groups.claims : [],
          evidence: Array.isArray(data?.groups?.evidence) ? data.groups.evidence : []
        });
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
        navigate('/notebook');
      }
    } catch (err) {
      console.error('Palette new note failed', err);
      navigate('/notebook');
    }
  }, [navigate]);

  const sections = useMemo(() => {
    const q = query.trim();
    const list = [];

    list.push({
      title: 'Actions',
      items: [
        { type: 'Action', label: 'New note', action: createNote },
        { type: 'Action', label: 'New collection', path: '/library?tab=collections' }
      ]
    });

    list.push({
      title: 'Pages',
      items: pages.map(page => ({ type: 'Page', label: page.label, path: page.path }))
    });

    if (q) {
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
          path: item.openPath || `/articles/${item.articleId || ''}`
        }))
      });
      list.push({
        title: 'Claims',
        items: (searchGroups.claims || []).slice(0, 6).map(item => ({
          type: 'Claim',
          label: buildResultLabel(item, 'Claim'),
          path: item.openPath || (item.articleId ? `/articles/${item.articleId}` : `/think?tab=notebook&entryId=${item._id}`)
        }))
      });
      list.push({
        title: 'Evidence',
        items: (searchGroups.evidence || []).slice(0, 6).map(item => ({
          type: 'Evidence',
          label: buildResultLabel(item, 'Evidence'),
          path: item.openPath || (item.articleId ? `/articles/${item.articleId}` : `/think?tab=notebook&entryId=${item._id}`)
        }))
      });
      list.push({
        title: 'Articles',
        items: articles.slice(0, 5).map(item => ({
          type: 'Article',
          label: buildResultLabel(item, item.title || 'Article'),
          path: `/articles/${item._id}`
        }))
      });
    } else {
      list.push({
        title: 'Concepts',
        items: concepts.slice(0, 8).map(item => ({
          type: 'Concept',
          label: item.tag,
          path: `/tags/${encodeURIComponent(item.tag)}`
        }))
      });
      list.push({
        title: 'Notebook',
        items: notebook.slice(0, 6).map(item => ({
          type: 'Notebook',
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
  }, [articles, collections, concepts, createNote, notebook, pages, query, searchGroups]);

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
    onClose();
    if (item.action) {
      item.action();
      return;
    }
    if (item.path) {
      navigate(item.path);
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
      handleSelect(selectableItems[activeIndex]);
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
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Quick open notes, highlights, claims, evidence..."
            className="palette-input"
          />
          <Button variant="secondary" onClick={onClose}>Close</Button>
        </div>
        <div className="palette-shortcuts">
          <span className="muted small">Cmd/Ctrl+K: Open</span>
          <span className="muted small">Arrows + Enter: Navigate</span>
          <span className="muted small">Cmd/Ctrl+Shift+D: Dump to memory</span>
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
                  <div
                    key={`${section.title}-${item.type}-${item.label}`}
                    className={`palette-item ${isActive ? 'active' : ''}`}
                    onMouseEnter={() => setActiveIndex(rowIndex)}
                    onClick={() => handleSelect(item)}
                  >
                    <span className="muted small">{item.type}</span>
                    <span>{item.label}</span>
                  </div>
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
