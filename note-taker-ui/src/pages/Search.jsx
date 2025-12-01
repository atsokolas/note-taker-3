import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';

const snippet = (text = '', q = '') => {
  if (!text) return '';
  const lower = text.toLowerCase();
  const idx = q ? lower.indexOf(q.toLowerCase()) : -1;
  if (idx === -1) return text.slice(0, 140) + (text.length > 140 ? '…' : '');
  const start = Math.max(0, idx - 40);
  const end = Math.min(text.length, idx + q.length + 60);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < text.length ? '…' : '';
  return prefix + text.slice(start, end) + suffix;
};

const Search = () => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState({ articles: [], highlights: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const doSearch = async (e) => {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    setLoading(true);
    setError('');
    try {
      const res = await api.get(`/api/search?q=${encodeURIComponent(q)}`);
      setResults(res.data || { articles: [], highlights: [] });
    } catch (err) {
      console.error('Error searching:', err);
      setError(err.response?.data?.error || 'Search failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="content-viewer">
      <div className="article-content" style={{ maxWidth: '960px' }}>
        <h1>Search</h1>
        <p className="muted">Find articles and highlights by title, text, notes, or tags.</p>
        <form onSubmit={doSearch} style={{ display: 'flex', gap: '10px', marginBottom: '14px' }}>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search everything..."
            style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)' }}
          />
          <button className="notebook-button primary" type="submit" disabled={loading}>
            {loading ? 'Searching...' : 'Search'}
          </button>
        </form>
        {error && <p className="status-message error-message">{error}</p>}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '12px' }}>
          <div className="feedback-list">
            <div className="feedback-list-header">
              <span className="eyebrow">Articles</span>
              <span className="muted small">{results.articles?.length || 0} results</span>
            </div>
            {results.articles && results.articles.length > 0 ? (
              <ul>
                {results.articles.map((a) => (
                  <li key={a._id} className="feedback-list-item">
                    <Link to={`/articles/${a._id}`} className="article-title-link">{a.title || 'Untitled article'}</Link>
                    <p className="feedback-message">{snippet(a.content || '', query)}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted small">No articles match.</p>
            )}
          </div>

          <div className="feedback-list">
            <div className="feedback-list-header">
              <span className="eyebrow">Highlights</span>
              <span className="muted small">{results.highlights?.length || 0} results</span>
            </div>
            {results.highlights && results.highlights.length > 0 ? (
              <ul>
                {results.highlights.map((h) => (
                  <li key={h._id} className="feedback-list-item">
                    <div className="feedback-list-top">
                      <Link to={`/articles/${h.articleId}`} className="article-title-link">{h.articleTitle || 'Untitled article'}</Link>
                      <span className="feedback-date">{new Date(h.createdAt).toLocaleString()}</span>
                    </div>
                    <p className="highlight-text" style={{ margin: '6px 0', fontWeight: 600 }}>{h.text}</p>
                    <p className="feedback-meta" style={{ marginBottom: '6px' }}>
                      {h.tags && h.tags.length > 0 ? h.tags.map(tag => (
                        <span key={tag} className="highlight-tag" style={{ marginRight: 6 }}>{tag}</span>
                      )) : <span className="muted small">No tags</span>}
                    </p>
                    <p className="feedback-message">{snippet(h.note || '', query)}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted small">No highlights match.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Search;
