import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import { Card, Button } from './ui';

const CommandPalette = ({ open, onClose }) => {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [articles, setArticles] = useState([]);
  const [highlights, setHighlights] = useState([]);
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
    { label: 'Settings', path: '/settings' },
    // legacy quick links
    { label: 'Views', path: '/views' },
    { label: 'Tags', path: '/tags' },
    { label: 'Resurface', path: '/resurface' },
    { label: 'Export', path: '/export' }
  ]), []);

  useEffect(() => {
    if (!open) return;
    setQuery('');
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
      if (!query.trim()) {
        setArticles([]);
        setHighlights([]);
        return;
      }
      setLoading(true);
      try {
        const token = localStorage.getItem('token');
        const headers = { Authorization: `Bearer ${token}` };
        const res = await api.get(`/api/search?q=${encodeURIComponent(query.trim())}`, { headers });
        setArticles(res.data?.articles || []);
        setHighlights(res.data?.highlights || []);
      } catch (err) {
        console.error('Palette search failed', err);
      } finally {
        setLoading(false);
      }
    };
    const t = setTimeout(fetchSearch, 200);
    return () => clearTimeout(t);
  }, [query, open]);

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

  const reshuffleToday = useCallback(() => {
    navigate('/today');
    window.setTimeout(() => {
      window.dispatchEvent(new Event('today-reshuffle'));
    }, 50);
  }, [navigate]);

  const items = useMemo(() => {
    const actions = [
      { label: 'New note', run: createNote },
      { label: 'New collection', run: () => navigate('/library?tab=collections') },
      { label: 'Reshuffle resurfaced', run: reshuffleToday }
    ];
    const list = [];
    actions.forEach(a => list.push({ type: 'Action', label: a.label, action: a.run }));
    pages.forEach(p => list.push({ type: 'Page', label: p.label, path: p.path }));
    concepts.slice(0, 8).forEach(c => list.push({ type: 'Concept', label: c.tag, path: `/tags/${encodeURIComponent(c.tag)}` }));
    articles.slice(0, 5).forEach(a => list.push({ type: 'Article', label: a.title || 'Untitled article', path: `/articles/${a._id}` }));
    highlights.slice(0, 5).forEach(h => list.push({ type: 'Highlight', label: h.text, path: `/articles/${h.articleId}` }));
    notebook.slice(0, 5).forEach(n => list.push({ type: 'Notebook', label: n.title || 'Untitled', path: `/think?tab=notebook&entryId=${n._id}` }));
    collections.slice(0, 5).forEach(c => list.push({ type: 'Collection', label: c.name, path: `/collections/${c.slug}` }));
    return list;
  }, [pages, concepts, articles, highlights, notebook, collections, createNote, navigate, reshuffleToday]);

  const handleSelect = (item) => {
    onClose();
    if (item?.action) {
      item.action();
      return;
    }
    if (item?.path) {
      navigate(item.path);
    }
  };

  const handleKeyDown = (e) => {
    if (!open) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) => Math.min(prev + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (items[activeIndex]) handleSelect(items[activeIndex]);
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!open) return null;

  return (
    <div className="palette-overlay" onKeyDown={handleKeyDown} tabIndex={-1}>
      <Card className="palette-card">
        <div className="palette-input-row">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Jump to pages, concepts, notes, highlights…"
            className="palette-input"
          />
          <Button variant="secondary" onClick={onClose}>Close</Button>
        </div>
        <div className="palette-shortcuts">
          <span className="muted small">Cmd/Ctrl+K: Open</span>
          <span className="muted small">g then t: Today</span>
          <span className="muted small">g then b: Brain</span>
          <span className="muted small">g then n: Notebook</span>
          <span className="muted small">g then j: Journey</span>
          <span className="muted small">g then c: Collections</span>
          <span className="muted small">g then v: Views</span>
        </div>
        {loading && <p className="muted small">Searching…</p>}
        <div className="palette-list">
          {items.length === 0 && <p className="muted small">No results.</p>}
          {items.map((item, idx) => (
            <div
              key={`${item.type}-${item.label}-${idx}`}
              className={`palette-item ${idx === activeIndex ? 'active' : ''}`}
              onMouseEnter={() => setActiveIndex(idx)}
              onClick={() => handleSelect(item)}
            >
              <span className="muted small">{item.type}</span>
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
};

export default CommandPalette;
