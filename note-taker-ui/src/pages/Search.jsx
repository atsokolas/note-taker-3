import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../api';
import { searchKeyword } from '../api/retrieval';
import { Page, Card, TagChip, Button } from '../components/ui';

const stripHtml = (input = '') => {
  if (!input) return '';
  const tmp = document.createElement('div');
  tmp.innerHTML = input;
  return tmp.textContent || tmp.innerText || '';
};

const snippet = (text = '', q = '') => {
  const clean = stripHtml(text);
  if (!clean) return '';
  const lower = clean.toLowerCase();
  const idx = q ? lower.indexOf(q.toLowerCase()) : -1;
  if (idx === -1) return clean.slice(0, 160) + (clean.length > 160 ? '…' : '');
  const start = Math.max(0, idx - 60);
  const end = Math.min(clean.length, idx + q.length + 80);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < clean.length ? '…' : '';
  return prefix + clean.slice(start, end) + suffix;
};

const typeLabel = (type) => {
  if (type === 'article') return 'Articles';
  if (type === 'highlight') return 'Highlights';
  if (type === 'concept') return 'Concepts';
  if (type === 'notebook' || type === 'notebook_entry' || type === 'notebook_block') return 'Notebook';
  if (type === 'question') return 'Questions';
  return 'Other';
};

const typeIcon = (type) => {
  if (type === 'article') return '📰';
  if (type === 'highlight') return '✨';
  if (type === 'concept') return '🧠';
  if (type === 'notebook' || type === 'notebook_entry' || type === 'notebook_block') return '📝';
  if (type === 'question') return '❓';
  return '•';
};

const formatApiError = (err, fallback = 'Request failed.') => {
  const status = err?.response?.status;
  const data = err?.response?.data;
  const bodySnippet = typeof data === 'string'
    ? data.slice(0, 300)
    : data
      ? JSON.stringify(data).slice(0, 300)
      : '';
  const output = status
    ? `HTTP ${status} — ${bodySnippet || fallback}`
    : `${err?.name || 'Error'}: ${err?.message || fallback}`;
  console.error('Request failed', {
    url: err?.config?.url,
    method: err?.config?.method,
    status,
    bodySnippet,
    thrownName: err?.name,
    thrownMessage: err?.message
  });
  return output;
};

const KEYWORD_TYPES = ['note', 'highlight', 'claim', 'evidence', 'article'];

const parseCsvParam = (value = '') => (
  String(value || '')
    .split(',')
    .map(part => part.trim())
    .filter(Boolean)
);

const Search = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const mode = searchParams.get('mode') || 'keyword';
  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [scope, setScope] = useState(searchParams.get('scope') || 'all');
  const [tagInput, setTagInput] = useState(searchParams.get('tags') || '');
  const [selectedTypes, setSelectedTypes] = useState(() => parseCsvParam(searchParams.get('type') || ''));
  const [results, setResults] = useState({
    articles: [],
    highlights: [],
    notebook: [],
    groups: { notes: [], highlights: [], claims: [], evidence: [] },
    semantic: []
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const getAuthHeaders = () => {
    const token = localStorage.getItem('token');
    if (!token) throw new Error('Authentication token not found.');
    return { headers: { Authorization: `Bearer ${token}` } };
  };

  useEffect(() => {
    setQuery((searchParams.get('q') || '').trim());
    setScope(searchParams.get('scope') || 'all');
    setTagInput(searchParams.get('tags') || '');
    setSelectedTypes(parseCsvParam(searchParams.get('type') || ''));
  }, [searchParams]);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults({
        articles: [],
        highlights: [],
        notebook: [],
        groups: { notes: [], highlights: [], claims: [], evidence: [] },
        semantic: []
      });
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      setError('');
      try {
        if (mode === 'semantic') {
          const res = await api.post('/api/search/semantic', { query: q, limit: 24 }, getAuthHeaders());
          if (!cancelled) {
            setResults(prev => ({ ...prev, semantic: res.data?.results || [] }));
          }
        } else {
          const data = await searchKeyword({
            q,
            scope,
            tags: parseCsvParam(tagInput),
            type: selectedTypes
          });
          if (!cancelled) {
            setResults({
              articles: data?.articles || [],
              highlights: data?.highlights || [],
              notebook: data?.notebook || [],
              groups: {
                notes: data?.groups?.notes || [],
                highlights: data?.groups?.highlights || [],
                claims: data?.groups?.claims || [],
                evidence: data?.groups?.evidence || []
              },
              semantic: []
            });
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(formatApiError(err, 'Search failed.'));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 220);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [mode, query, scope, selectedTypes, tagInput]);

  const groupedSemantic = useMemo(() => {
    const groups = {};
    (results.semantic || []).forEach(item => {
      const type = item.objectType || item.type || 'other';
      if (!groups[type]) groups[type] = [];
      groups[type].push(item);
    });
    const order = ['article', 'highlight', 'concept', 'notebook', 'notebook_entry', 'notebook_block', 'question', 'other'];
    return order
      .filter(type => groups[type]?.length)
      .map(type => [type, groups[type]]);
  }, [results.semantic]);

  const keywordSections = useMemo(() => ([
    { title: 'Notes', items: results.groups.notes || [] },
    { title: 'Highlights', items: results.groups.highlights || [] },
    { title: 'Claims', items: results.groups.claims || [] },
    { title: 'Evidence', items: results.groups.evidence || [] }
  ]), [results.groups]);

  const toggleType = (type) => {
    setSelectedTypes(prev => (
      prev.includes(type)
        ? prev.filter(item => item !== type)
        : [...prev, type]
    ));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    const q = query.trim();
    if (!q) return;
    const params = new URLSearchParams(searchParams);
    params.set('q', q);
    params.set('mode', mode);
    if (mode === 'keyword') {
      params.set('scope', scope);
      const tags = parseCsvParam(tagInput).join(',');
      if (tags) params.set('tags', tags);
      else params.delete('tags');
      if (selectedTypes.length > 0) params.set('type', selectedTypes.join(','));
      else params.delete('type');
    }
    setSearchParams(params);
  };

  const handleModeChange = (nextMode) => {
    const params = new URLSearchParams(searchParams);
    params.set('mode', nextMode);
    if (query.trim()) params.set('q', query.trim());
    if (nextMode !== 'keyword') {
      params.delete('scope');
      params.delete('tags');
      params.delete('type');
    } else {
      params.set('scope', scope);
      const tags = parseCsvParam(tagInput).join(',');
      if (tags) params.set('tags', tags);
      if (selectedTypes.length > 0) params.set('type', selectedTypes.join(','));
    }
    setSearchParams(params);
  };

  return (
    <Page>
      <div className="page-header">
        <p className="muted-label">Universal search</p>
        <h1>Search</h1>
        <p className="muted">Fast retrieval across notes and highlights without external AI calls.</p>
      </div>
      <Card className="highlight-tag-card">
        <form onSubmit={handleSubmit} className="search-form">
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search everything..."
            className="search-input"
          />
          <Button type="submit" disabled={loading}>
            {loading ? 'Searching...' : 'Search'}
          </Button>
        </form>

        <div className="search-mode-toggle">
          <span className="muted small">Mode</span>
          <div className="search-mode-buttons">
            <button
              type="button"
              className={`ui-quiet-button ${mode === 'semantic' ? 'is-active' : ''}`}
              onClick={() => handleModeChange('semantic')}
            >
              Meaning
            </button>
            <button
              type="button"
              className={`ui-quiet-button ${mode === 'keyword' ? 'is-active' : ''}`}
              onClick={() => handleModeChange('keyword')}
            >
              Keyword
            </button>
          </div>
        </div>

        {mode === 'keyword' && (
          <div className="search-filter-grid">
            <label className="search-filter-field">
              <span className="muted small">Scope</span>
              <select value={scope} onChange={(event) => setScope(event.target.value)}>
                <option value="all">All</option>
                <option value="notebook">Notebook</option>
                <option value="highlights">Highlights</option>
                <option value="articles">Articles</option>
              </select>
            </label>

            <label className="search-filter-field search-filter-field--wide">
              <span className="muted small">Tags</span>
              <input
                type="text"
                value={tagInput}
                onChange={(event) => setTagInput(event.target.value)}
                placeholder="e.g. philosophy,systems"
              />
            </label>

            <div className="search-filter-field search-filter-field--wide">
              <span className="muted small">Type</span>
              <div className="search-filter-chip-row">
                {KEYWORD_TYPES.map(type => (
                  <button
                    key={type}
                    type="button"
                    className={`ui-quiet-button ${selectedTypes.includes(type) ? 'is-active' : ''}`}
                    onClick={() => toggleType(type)}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {error && <p className="status-message error-message">{error}</p>}

        <div className="section-stack">
          {mode === 'semantic' ? (
            groupedSemantic.length > 0 ? (
              groupedSemantic.map(([type, items]) => (
                <div key={type} className="semantic-group">
                  <div className="search-section-header">
                    <span className="eyebrow">{typeIcon(type)} {typeLabel(type)}</span>
                    <span className="muted small">{items.length} results</span>
                  </div>
                  <div className="semantic-list">
                    {items.map(item => {
                      const resolvedType = item.objectType || item.type || 'other';
                      const metadata = item.metadata || {};
                      const to = (() => {
                        if (resolvedType === 'article') return `/articles/${item.objectId}`;
                        if (resolvedType === 'highlight') return `/articles/${metadata.articleId || item.objectId}`;
                        if (resolvedType === 'notebook' || resolvedType === 'notebook_entry' || resolvedType === 'notebook_block') {
                          const blockId = metadata.blockId ? `&blockId=${encodeURIComponent(metadata.blockId)}` : '';
                          return `/think?tab=notebook&entryId=${item.objectId}${blockId}`;
                        }
                        if (resolvedType === 'concept') {
                          const conceptName = metadata.name || item.title || '';
                          return `/think?tab=concepts&concept=${encodeURIComponent(conceptName)}`;
                        }
                        if (resolvedType === 'question') return `/think?tab=questions&questionId=${item.objectId}`;
                        return '/search';
                      })();
                      return (
                        <Link key={`${type}-${item.objectId}`} to={to} className="semantic-row">
                          <div className="semantic-title">{item.title || 'Untitled'}</div>
                          <div className="semantic-snippet muted small">{item.snippet || '—'}</div>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))
            ) : (
              !loading && <p className="muted small">No semantic results yet.</p>
            )
          ) : (
            <>
              {keywordSections.map(section => (
                <Card key={section.title} className="search-section">
                  <div className="search-section-header">
                    <span className="eyebrow">{section.title}</span>
                    <span className="muted small">{section.items.length} results</span>
                  </div>
                  {section.items.length > 0 ? (
                    <div className="search-card-grid">
                      {section.items.map(item => (
                        <div key={`${section.title}-${item._id}-${item.sourceType || ''}`} className="search-card">
                          <Link to={item.openPath || '/search'} className="article-title-link">
                            {item.title || item.text || `Untitled ${section.title.slice(0, -1).toLowerCase()}`}
                          </Link>
                          <p className="search-snippet">{snippet(item.snippet || item.content || item.text || '', query)}</p>
                          {Array.isArray(item.tags) && item.tags.length > 0 && (
                            <div className="highlight-tag-chips" style={{ marginTop: 8 }}>
                              {item.tags.slice(0, 4).map(tag => (
                                <TagChip key={`${item._id}-${tag}`} to={`/tags/${encodeURIComponent(tag)}`}>{tag}</TagChip>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="muted small">No {section.title.toLowerCase()} match.</p>
                  )}
                </Card>
              ))}

              <Card className="search-section">
                <div className="search-section-header">
                  <span className="eyebrow">Articles</span>
                  <span className="muted small">{results.articles.length} results</span>
                </div>
                {results.articles.length > 0 ? (
                  <div className="search-card-grid">
                    {results.articles.map(article => (
                      <div key={article._id} className="search-card">
                        <Link to={`/articles/${article._id}`} className="article-title-link">
                          {article.title || 'Untitled article'}
                        </Link>
                        <p className="search-snippet">{snippet(article.content || '', query)}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="muted small">No articles match.</p>
                )}
              </Card>
            </>
          )}
        </div>
      </Card>
    </Page>
  );
};

export default Search;
