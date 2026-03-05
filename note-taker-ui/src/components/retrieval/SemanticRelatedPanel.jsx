import React from 'react';
import { Link } from 'react-router-dom';
import useSemanticRelated from '../../hooks/useSemanticRelated';

const buildOpenPath = (item) => {
  if (!item) return '/search';
  if (item.objectType === 'highlight') {
    const articleId = item.metadata?.articleId;
    if (articleId) return `/articles/${encodeURIComponent(articleId)}`;
    return '/library?scope=highlights';
  }
  if (item.objectType === 'concept') {
    const name = item.metadata?.name || item.title || '';
    if (name) return `/think?tab=concepts&concept=${encodeURIComponent(name)}`;
    return '/think?tab=concepts';
  }
  return '/search';
};

const formatBandLabel = (value) => {
  const safe = String(value || '').trim().toLowerCase();
  if (safe === 'high') return 'High';
  if (safe === 'medium') return 'Medium';
  return 'Low';
};

const SemanticRelatedPanel = ({
  sourceType,
  sourceId,
  limit = 6,
  resultTypes = ['highlight'],
  title = 'AI Related Highlights',
  enabled = true,
  renderAction
}) => {
  const { results, meta, loading, error } = useSemanticRelated({
    sourceType,
    sourceId,
    limit,
    resultTypes,
    enabled
  });
  const show = enabled && String(sourceType || '').trim() && String(sourceId || '').trim();
  if (!show) return null;

  return (
    <div className="semantic-related-panel">
      <div className="semantic-related-header">{title}</div>

      <div className="semantic-related-explain">
        <div className="semantic-related-explain-title">How similarity works</div>
        <p className="semantic-related-explain-body">
          We convert text into numeric embeddings and compare angle distance (cosine similarity). Higher
          similarity means ideas are closer, even if wording differs.
        </p>
        <p className="semantic-related-explain-note">Matches are AI suggestions, not exact duplicates.</p>
      </div>

      {loading && <p className="muted small">Finding AI-related highlights...</p>}
      {error && <p className="status-message error-message">{error}</p>}
      {!loading && !error && meta?.modelAvailable === false && (
        <p className="muted small">AI suggestions unavailable right now.</p>
      )}
      {!loading && !error && meta?.modelAvailable !== false && results.length === 0 && (
        <p className="muted small">No semantic matches yet.</p>
      )}
      {!loading && !error && meta?.modelAvailable !== false && results.length > 0 && (
        <div className="semantic-related-list">
          {results.map(item => (
            <div key={`${item.objectType}-${item.objectId}`} className="semantic-related-item">
              <Link to={buildOpenPath(item)} className="semantic-related-item-link">
                <div className="semantic-related-item-top">
                  <span className="semantic-related-item-title">{item.title || 'Untitled'}</span>
                  <span
                    className={`semantic-related-band is-${String(item.similarityBand || 'Low').toLowerCase()}`}
                    title="Similarity band based on cosine similarity."
                  >
                    {formatBandLabel(item.similarityBand)}
                  </span>
                </div>
                <div className="semantic-related-item-subtitle">
                  {item.metadata?.articleTitle || item.snippet || ''}
                </div>
              </Link>
              {typeof renderAction === 'function' && (
                <div className="semantic-related-item-action">
                  {renderAction(item)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default SemanticRelatedPanel;
