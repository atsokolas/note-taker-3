import React, { useState } from 'react';
import { Link } from 'react-router-dom';
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

const Search = () => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState({ articles: [], highlights: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const getAuthHeaders = () => {
    const token = localStorage.getItem('token');
    if (!token) throw new Error("Authentication token not found.");
    return { headers: { Authorization: `Bearer ${token}` } };
  };

  const doSearch = async (e) => {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    setLoading(true);
    setError('');
    try {
      const res = await api.get(`/api/search?q=${encodeURIComponent(q)}`, getAuthHeaders());
      setResults(res.data || { articles: [], highlights: [] });
    } catch (err) {
      console.error('Error searching:', err);
      setError(err.response?.data?.error || 'Search failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Page>
      <div className="page-header">
        <p className="muted-label">Universal search</p>
        <h1>Search</h1>
        <p className="muted">Find articles and highlights by title, text, notes, or tags.</p>
      </div>
      <Card className="highlight-tag-card">
        <form onSubmit={doSearch} style={{ display: 'flex', gap: '10px', marginBottom: '14px' }}>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search everything..."
            style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)' }}
          />
          <Button type="submit" disabled={loading}>
            {loading ? 'Searching...' : 'Search'}
          </Button>
        </form>
        {error && <p className="status-message error-message">{error}</p>}

        <div className="section-stack">
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
        </div>
      </Card>
    </Page>
  );
};

export default Search;
