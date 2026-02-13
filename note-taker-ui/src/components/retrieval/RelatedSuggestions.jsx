import React, { useEffect, useMemo, useState } from 'react';
import { fetchRelatedItems, recordItemView } from '../../api/retrieval';

const LAST_VIEWED_KEY = 'retrieval:last-viewed-item.v1';

const reasonLabel = (reason) => {
  if (reason === 'connection') return 'connection';
  if (reason === 'tag') return 'tag overlap';
  if (reason === 'coview') return 'co-viewed';
  return reason;
};

const readLastViewed = () => {
  try {
    const raw = localStorage.getItem(LAST_VIEWED_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.itemType || !parsed?.itemId) return null;
    return parsed;
  } catch (error) {
    return null;
  }
};

const writeLastViewed = (itemType, itemId) => {
  try {
    localStorage.setItem(LAST_VIEWED_KEY, JSON.stringify({ itemType, itemId, at: Date.now() }));
  } catch (error) {
    // ignore storage failures
  }
};

const buildFallbackPath = (itemType, itemId) => {
  if (itemType === 'highlight') return `/library?focus=highlight:${encodeURIComponent(itemId)}`;
  if (itemType === 'notebook') return `/think?tab=notebook&entryId=${encodeURIComponent(itemId)}`;
  if (itemType === 'article') return `/articles/${encodeURIComponent(itemId)}`;
  if (itemType === 'concept') return `/think?tab=concepts&conceptId=${encodeURIComponent(itemId)}`;
  if (itemType === 'question') return `/think?tab=questions&questionId=${encodeURIComponent(itemId)}`;
  return '/search';
};

const RelatedSuggestions = ({
  itemType,
  itemId,
  enabled = true,
  limit = 6,
  title = 'Related'
}) => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const safeItemType = String(itemType || '').trim().toLowerCase();
  const safeItemId = String(itemId || '').trim();

  useEffect(() => {
    if (!enabled || !safeItemType || !safeItemId) return;
    let cancelled = false;

    const run = async () => {
      setLoading(true);
      setError('');
      const previous = readLastViewed();

      try {
        await recordItemView({
          itemType: safeItemType,
          itemId: safeItemId,
          previousItemType: previous?.itemType || '',
          previousItemId: previous?.itemId || ''
        });
      } catch (err) {
        // recording failure should not block related retrieval
      }

      try {
        const response = await fetchRelatedItems({
          itemType: safeItemType,
          itemId: safeItemId,
          limit
        });
        if (cancelled) return;
        setItems(Array.isArray(response?.items) ? response.items : []);
      } catch (err) {
        if (!cancelled) {
          setError(err?.response?.data?.error || 'Failed to load related items.');
        }
      } finally {
        if (!cancelled) {
          writeLastViewed(safeItemType, safeItemId);
          setLoading(false);
        }
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [enabled, limit, safeItemId, safeItemType]);

  const content = useMemo(() => {
    if (loading) {
      return <p className="muted small">Finding related items...</p>;
    }
    if (error) {
      return <p className="muted small">{error}</p>;
    }
    if (!items.length) {
      return <p className="muted small">No related items yet.</p>;
    }
    return (
      <div className="related-suggestions-list">
        {items.map(item => (
          <a
            key={`${item.itemType}-${item.itemId}`}
            className="related-suggestion-item"
            href={item.openPath || buildFallbackPath(item.itemType, item.itemId)}
          >
            <div className="related-suggestion-title-row">
              <span className="related-suggestion-title">{item.title || 'Untitled'}</span>
              <span className="related-suggestion-type">{item.itemType}</span>
            </div>
            <p className="related-suggestion-snippet">{item.snippet || ''}</p>
            {Array.isArray(item.reasons) && item.reasons.length > 0 && (
              <div className="related-suggestion-reasons">
                {item.reasons.slice(0, 3).map(reason => (
                  <span key={`${item.itemId}-${reason}`} className="related-suggestion-reason-chip">
                    {reasonLabel(reason)}
                  </span>
                ))}
              </div>
            )}
          </a>
        ))}
      </div>
    );
  }, [error, items, loading]);

  if (!enabled || !safeItemType || !safeItemId) return null;

  return (
    <div className="related-suggestions-panel">
      <div className="related-suggestions-header">{title}</div>
      {content}
    </div>
  );
};

export default RelatedSuggestions;
