import React, { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import api from '../api';
import AllHighlights from './AllHighlights';
import TagBrowser from './TagBrowser';
import Views from './Views';
import Collections from './Collections';
import { Page, Card, Button, TagChip } from '../components/ui';
import { fetchWithCache, getCached, setCached } from '../utils/cache';

const LibraryMode = () => {
  const tabs = [
    { key: 'articles', label: 'Articles' },
    { key: 'highlights', label: 'Highlights' },
    { key: 'concepts', label: 'Concepts' },
    { key: 'views', label: 'Saved Views' },
    { key: 'collections', label: 'Collections' }
  ];
  const [active, setActive] = useState('articles');
  const [filters, setFilters] = useState({
    query: '',
    tags: [],
    dateFrom: '',
    dateTo: '',
    sort: 'recent'
  });
  const [tagOptions, setTagOptions] = useState([]);
  const [tagsLoading, setTagsLoading] = useState(false);
  const [showSaveView, setShowSaveView] = useState(false);
  const [savingView, setSavingView] = useState(false);
  const [saveViewForm, setSaveViewForm] = useState({ name: '', description: '' });
  const [saveViewError, setSaveViewError] = useState('');
  const location = useLocation();

  const authHeaders = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });

  useEffect(() => {
    const loadTags = async () => {
      setTagsLoading(true);
      try {
        const data = await fetchWithCache('tags.list', async () => {
          const res = await api.get('/api/tags', authHeaders());
          return res.data || [];
        });
        setTagOptions(data);
      } catch (err) {
        console.error('Failed to load tags for filters:', err);
      } finally {
        setTagsLoading(false);
      }
    };
    loadTags();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tab = params.get('tab');
    if (tab && tabs.some(t => t.key === tab)) {
      setActive(tab);
    }
    const tag = params.get('tag');
    const from = params.get('from');
    const to = params.get('to');
    const q = params.get('q');
    if (tag || from || to || q) {
      setFilters((prev) => ({
        ...prev,
        tags: tag ? [tag] : prev.tags,
        dateFrom: from || prev.dateFrom,
        dateTo: to || prev.dateTo,
        query: q || prev.query
      }));
    }
  }, [location.search]);

  const toggleFilterTag = (tag) => {
    setFilters((prev) => {
      const nextTags = prev.tags.includes(tag)
        ? prev.tags.filter(t => t !== tag)
        : [...prev.tags, tag];
      return { ...prev, tags: nextTags };
    });
  };

  const clearFilters = () => {
    setFilters({ query: '', tags: [], dateFrom: '', dateTo: '', sort: 'recent' });
  };

  const applyView = (view) => {
    const filtersFromView = view.filters || {};
    setFilters({
      query: filtersFromView.textQuery || '',
      tags: Array.isArray(filtersFromView.tags) ? filtersFromView.tags : [],
      dateFrom: filtersFromView.dateFrom ? String(filtersFromView.dateFrom).slice(0, 10) : '',
      dateTo: filtersFromView.dateTo ? String(filtersFromView.dateTo).slice(0, 10) : '',
      sort: filtersFromView.sort || 'recent'
    });
    if (view.targetType === 'articles') {
      setActive('articles');
    } else {
      setActive('highlights');
    }
  };

  const openSaveView = () => {
    setSaveViewForm({ name: '', description: '' });
    setSaveViewError('');
    setShowSaveView(true);
  };

  const saveCurrentView = async () => {
    setSavingView(true);
    setSaveViewError('');
    try {
      const payload = {
        name: saveViewForm.name.trim(),
        description: saveViewForm.description.trim(),
        targetType: active === 'articles' ? 'articles' : 'highlights',
        filters: {
          tags: filters.tags,
          textQuery: filters.query,
          dateFrom: filters.dateFrom || null,
          dateTo: filters.dateTo || null,
          sort: filters.sort
        }
      };
      const res = await api.post('/api/views', payload, authHeaders());
      const existing = getCached('views.list');
      setCached('views.list', Array.isArray(existing) ? [res.data, ...existing] : [res.data]);
      setShowSaveView(false);
    } catch (err) {
      setSaveViewError(err.response?.data?.error || 'Failed to save view.');
    } finally {
      setSavingView(false);
    }
  };

  const canSaveView = active === 'articles' || active === 'highlights';

  const filteredTagOptions = useMemo(() => {
    const query = filters.query.trim().toLowerCase();
    if (!query) return tagOptions;
    return tagOptions.filter(t => t.tag.toLowerCase().includes(query));
  }, [tagOptions, filters.query]);

  const LibraryArticlesPanel = () => {
    const [articles, setArticles] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
      const loadArticles = async () => {
        setLoading(true);
        setError('');
        try {
          const res = await api.get('/get-articles', authHeaders());
          setArticles(res.data || []);
        } catch (err) {
          setError(err.response?.data?.error || 'Failed to load articles.');
        } finally {
          setLoading(false);
        }
      };
      loadArticles();
    }, []);

    const filtered = useMemo(() => {
      let next = articles;
      const query = filters.query.trim().toLowerCase();
      if (query) {
        next = next.filter(a => `${a.title || ''} ${a.content || ''}`.toLowerCase().includes(query));
      }
      if (filters.tags.length > 0) {
        next = next.filter(a => {
          const tags = new Set();
          (a.highlights || []).forEach(h => (h.tags || []).forEach(t => tags.add(t)));
          return filters.tags.some(tag => tags.has(tag));
        });
      }
      if (filters.dateFrom) {
        const from = new Date(filters.dateFrom);
        next = next.filter(a => a.createdAt && new Date(a.createdAt) >= from);
      }
      if (filters.dateTo) {
        const to = new Date(filters.dateTo);
        next = next.filter(a => a.createdAt && new Date(a.createdAt) <= to);
      }
      if (filters.sort === 'most-highlighted') {
        next = [...next].sort((a, b) => (b.highlights?.length || 0) - (a.highlights?.length || 0));
      } else {
        next = [...next].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      }
      return next;
    }, [articles, filters.query, filters.tags, filters.dateFrom, filters.dateTo, filters.sort]);

    return (
      <div className="section-stack">
        {loading && <p className="status-message">Loading articles…</p>}
        {error && <p className="status-message error-message">{error}</p>}
        {filtered.length === 0 && !loading && !error && (
          <p className="muted small">No articles match your filters yet.</p>
        )}
        {filtered.map(article => (
          <Card key={article._id} className="search-card">
            <div className="search-card-top">
              <span className="article-title-link">{article.title || 'Untitled article'}</span>
              <span className="muted small">{article.createdAt ? new Date(article.createdAt).toLocaleDateString() : ''}</span>
            </div>
            <p className="muted small">{article.url || ''}</p>
            <p className="muted small" style={{ marginTop: 6 }}>
              {(article.highlights || []).length} highlights
            </p>
          </Card>
        ))}
      </div>
    );
  };

  const renderTab = () => {
    switch (active) {
      case 'highlights':
        return <AllHighlights embedded filters={filters} />;
      case 'concepts':
        return <TagBrowser embedded filters={filters} />;
      case 'views':
        return <Views embedded filters={filters} onSelectView={applyView} />;
      case 'collections':
        return <Collections embedded filters={filters} />;
      default:
        return <LibraryArticlesPanel />;
    }
  };

  return (
    <Page>
      <div className="page-header">
        <p className="muted-label">Mode</p>
        <h1>Library</h1>
        <p className="muted">Browse everything you’ve saved—articles, highlights, concepts, and smart views.</p>
      </div>
      <Card className="tab-card">
        <div className="tab-bar">
          {tabs.map(t => (
            <Button
              key={t.key}
              variant={active === t.key ? 'primary' : 'secondary'}
              onClick={() => setActive(t.key)}
            >
              {t.label}
            </Button>
          ))}
        </div>
        <div className="library-filter-bar">
          <label className="feedback-field" style={{ flex: 1 }}>
            <span>Search</span>
            <input
              type="text"
              value={filters.query}
              onChange={(e) => setFilters(prev => ({ ...prev, query: e.target.value }))}
              placeholder="Search titles, text, notes, or tags"
            />
          </label>
          <label className="feedback-field" style={{ minWidth: 180 }}>
            <span>Sort</span>
            <select
              value={filters.sort}
              onChange={(e) => setFilters(prev => ({ ...prev, sort: e.target.value }))}
              className="compact-select"
            >
              <option value="recent">Most recent</option>
              <option value="most-highlighted">Most highlighted</option>
            </select>
          </label>
          <label className="feedback-field" style={{ minWidth: 160 }}>
            <span>From</span>
            <input
              type="date"
              value={filters.dateFrom}
              onChange={(e) => setFilters(prev => ({ ...prev, dateFrom: e.target.value }))}
            />
          </label>
          <label className="feedback-field" style={{ minWidth: 160 }}>
            <span>To</span>
            <input
              type="date"
              value={filters.dateTo}
              onChange={(e) => setFilters(prev => ({ ...prev, dateTo: e.target.value }))}
            />
          </label>
          <Button variant="secondary" onClick={clearFilters}>Clear</Button>
          <Button onClick={openSaveView} disabled={!canSaveView}>Save view</Button>
        </div>
        <div className="library-tag-filters">
          {tagsLoading && <span className="muted small">Loading tags…</span>}
          {!tagsLoading && filteredTagOptions.map(t => (
            <TagChip
              key={t.tag}
              className={filters.tags.includes(t.tag) ? 'ui-tag-chip-selected' : ''}
              onClick={() => toggleFilterTag(t.tag)}
            >
              {t.tag} <span className="tag-count">{t.count}</span>
            </TagChip>
          ))}
          {!tagsLoading && filteredTagOptions.length === 0 && (
            <span className="muted small">No tags match that search.</span>
          )}
        </div>
        <div className="tab-body">
          {renderTab()}
        </div>
      </Card>
      {showSaveView && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: 520 }}>
            <div className="modal-header">
              <h3>Save this view</h3>
              <button className="icon-button" onClick={() => setShowSaveView(false)}>×</button>
            </div>
            <label className="feedback-field">
              <span>Name</span>
              <input
                type="text"
                value={saveViewForm.name}
                onChange={(e) => setSaveViewForm(f => ({ ...f, name: e.target.value }))}
              />
            </label>
            <label className="feedback-field">
              <span>Description</span>
              <textarea
                rows={3}
                value={saveViewForm.description}
                onChange={(e) => setSaveViewForm(f => ({ ...f, description: e.target.value }))}
              />
            </label>
            {saveViewError && <p className="status-message error-message">{saveViewError}</p>}
            <div className="modal-actions" style={{ justifyContent: 'flex-end', gap: 8 }}>
              <Button variant="secondary" onClick={() => setShowSaveView(false)}>Cancel</Button>
              <Button onClick={saveCurrentView} disabled={savingView || !saveViewForm.name.trim()}>
                {savingView ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Page>
  );
};

export default LibraryMode;
