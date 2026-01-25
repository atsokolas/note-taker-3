import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../api';
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
  console.error('AI request failed', {
    url: err?.config?.url,
    method: err?.config?.method,
    status,
    bodySnippet,
    thrownName: err?.name,
    thrownMessage: err?.message
  });
  return output;
};

const Search = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const mode = searchParams.get('mode') || 'semantic';
  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [results, setResults] = useState({ articles: [], highlights: [], semantic: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const getAuthHeaders = () => {
    const token = localStorage.getItem('token');
    if (!token) throw new Error("Authentication token not found.");
    return { headers: { Authorization: `Bearer ${token}` } };
  };

  useEffect(() => {
    const q = (searchParams.get('q') || '').trim();
    setQuery(q);
  }, [searchParams]);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults({ articles: [], highlights: [], semantic: [] });
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
          const res = await api.get(`/api/search?q=${encodeURIComponent(q)}`, getAuthHeaders());
          if (!cancelled) {
            setResults({
              articles: res.data?.articles || [],
              highlights: res.data?.highlights || [],
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
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, mode]);

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

  const handleSubmit = (e) => {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    const params = new URLSearchParams(searchParams);
    params.set('q', q);
    if (!params.get('mode')) params.set('mode', 'semantic');
    setSearchParams(params);
  };

  const handleModeChange = (nextMode) => {
    const params = new URLSearchParams(searchParams);
    params.set('mode', nextMode);
    if (query.trim()) params.set('q', query.trim());
    setSearchParams(params);
  };

  return (
    <Page>
      <div className="page-header">
        <p className="muted-label">Universal search</p>
        <h1>Search</h1>
        <p className="muted">Find ideas by meaning across your library.</p>
      </div>
      <Card className="highlight-tag-card">
        <form onSubmit={handleSubmit} className="search-form">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
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
              <Card className="search-section">
                <div className="search-section-header">
                  <span className="eyebrow">Articles</span>
                  <span className="muted small">{results.articles?.length || 0} results</span>
                </div>
                {results.articles && results.articles.length > 0 ? (
                  <div className="search-card-grid">
                    {results.articles.map((a) => (
                      <div key={a._id} className="search-card">
                        <Link to={`/articles/${a._id}`} className="article-title-link">{a.title || 'Untitled article'}</Link>
                        <p className="search-snippet">{snippet(a.content || '', query)}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="muted small">No articles match.</p>
                )}
              </Card>

              <Card className="search-section">
                <div className="search-section-header">
                  <span className="eyebrow">Highlights</span>
                  <span className="muted small">{results.highlights?.length || 0} results</span>
                </div>
                {results.highlights && results.highlights.length > 0 ? (
                  <div className="search-card-grid">
                    {results.highlights.map((h) => (
                      <div key={h._id} className="search-card">
                        <div className="search-card-top">
                          <Link to={`/articles/${h.articleId}`} className="article-title-link">{h.articleTitle || 'Untitled article'}</Link>
                          <span className="feedback-date">{new Date(h.createdAt).toLocaleString()}</span>
                        </div>
                        <p className="highlight-text" style={{ margin: '6px 0', fontWeight: 600 }}>{h.text}</p>
                        <div className="highlight-tag-chips" style={{ marginBottom: '6px' }}>
                          {h.tags && h.tags.length > 0 ? h.tags.map(tag => (
                            <TagChip key={tag} to={`/tags/${encodeURIComponent(tag)}`}>{tag}</TagChip>
                          )) : <span className="muted small">No tags</span>}
                        </div>
                        <p className="search-snippet">{snippet(h.note || '', query)}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="muted small">No highlights match.</p>
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
