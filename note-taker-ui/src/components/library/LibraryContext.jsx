import React, { Profiler, useEffect, useMemo, useState } from 'react';
import { QuietButton } from '../ui';
import SemanticRelatedPanel from '../retrieval/SemanticRelatedPanel';
import { createProfilerLogger } from '../../utils/perf';

const FEED_EXPANDED_KEY = 'library.context.highlightsFeed.expanded';
const RELATED_EXPANDED_KEY = 'library.context.moreContext.expanded';

const readStoredExpanded = (key, fallback) => {
  if (typeof window === 'undefined') return fallback;
  const stored = window.localStorage.getItem(key);
  if (stored === null) return fallback;
  return stored === 'true';
};

const LibraryContext = ({
  selectedArticleId,
  articleHighlights = [],
  articleLoading,
  references,
  referencesLoading,
  referencesError,
  activeHighlightId,
  onHighlightClick,
  onSelectHighlight,
  onAddConcept,
  onAddNotebook,
  onAddQuestion,
  onDumpToWorkingMemory
}) => {
  const [feedExpanded, setFeedExpanded] = useState(() => readStoredExpanded(FEED_EXPANDED_KEY, true));
  const [relatedExpanded, setRelatedExpanded] = useState(() => readStoredExpanded(RELATED_EXPANDED_KEY, false));
  const [feedFilter, setFeedFilter] = useState('recent');
  const [feedQuery, setFeedQuery] = useState('');

  const semanticHighlightId = activeHighlightId || articleHighlights[0]?._id || '';
  const notebookBlocks = Array.isArray(references?.notebookBlocks) ? references.notebookBlocks : [];
  const normalizedQuery = String(feedQuery || '').trim().toLowerCase();

  const feedItems = useMemo(() => {
    const sorted = [...(articleHighlights || [])].sort((a, b) => (
      new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
    ));
    return sorted.filter((highlight) => {
      const tags = Array.isArray(highlight.tags) ? highlight.tags : [];
      if (feedFilter === 'tagged' && tags.length === 0) return false;
      if (feedFilter === 'untagged' && tags.length > 0) return false;
      if (!normalizedQuery) return true;
      const haystack = `${highlight.text || ''} ${tags.join(' ')}`.toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [articleHighlights, feedFilter, normalizedQuery]);

  const formatDate = (value) => {
    if (!value) return '';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '';
    return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  const summarizeHighlight = (highlight) => {
    const text = String(highlight?.text || '').replace(/\s+/g, ' ').trim();
    if (text.length <= 130) return text;
    return `${text.slice(0, 127)}...`;
  };

  const openNotebookBlock = (block) => {
    const params = new URLSearchParams();
    params.set('entryId', block.notebookEntryId);
    if (block.blockId) params.set('blockId', block.blockId);
    params.set('tab', 'notebook');
    window.location.href = `/think?${params.toString()}`;
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(FEED_EXPANDED_KEY, String(feedExpanded));
  }, [feedExpanded]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(RELATED_EXPANDED_KEY, String(relatedExpanded));
  }, [relatedExpanded]);

  const toggleFeedExpanded = () => {
    setFeedExpanded(prev => !prev);
  };

  const toggleRelatedExpanded = () => {
    setRelatedExpanded(prev => !prev);
  };

  if (!selectedArticleId) {
    return (
      <div className="library-context-feed-panel">
        <div className="library-context-section is-empty">
          <button type="button" className="library-context-section__header" disabled>
            <span className="library-context-section__title">Highlights Feed</span>
            <span className="library-context-section__meta">Select an article</span>
            <span className="library-context-section__chevron" aria-hidden="true">▸</span>
          </button>
          <div className="library-context-section__body">
            <p className="muted small">Open an article to view and organize its highlights.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="library-context-feed-panel">
      <div className={`library-context-section ${feedExpanded ? 'is-expanded' : 'is-collapsed'}`}>
        <button
          type="button"
          className="library-context-section__header"
          onClick={toggleFeedExpanded}
          aria-expanded={feedExpanded}
        >
          <span className="library-context-section__title">Highlights Feed</span>
          <span className="library-context-section__meta">{articleHighlights.length} total</span>
          <span className="library-context-section__chevron" aria-hidden="true">
            {feedExpanded ? '▾' : '▸'}
          </span>
        </button>
        {feedExpanded && (
          <div className="library-context-section__body">
            <div className="library-context-feed__controls">
              <select value={feedFilter} onChange={(event) => setFeedFilter(event.target.value)}>
                <option value="recent">Recent</option>
                <option value="tagged">Tagged</option>
                <option value="untagged">Untagged</option>
              </select>
              <input
                type="text"
                value={feedQuery}
                onChange={(event) => setFeedQuery(event.target.value)}
                placeholder="Search highlights..."
              />
            </div>
            {articleLoading && <p className="muted small">Loading highlights...</p>}
            {!articleLoading && feedItems.length === 0 && (
              <p className="muted small">No highlights match this filter.</p>
            )}
            {!articleLoading && feedItems.length > 0 && (
              <Profiler id="LibraryContextHighlights" onRender={createProfilerLogger('library.context-highlights')}>
                <div className="library-context-feed__list">
                  {feedItems.map((highlight) => {
                    const tags = Array.isArray(highlight.tags) ? highlight.tags : [];
                    const tagLabel = tags.length > 0 ? tags.slice(0, 2).join(', ') : 'untagged';
                    return (
                      <article
                        key={highlight._id}
                        className={`library-context-feed-item ${activeHighlightId === highlight._id ? 'is-active' : ''}`}
                      >
                        <button
                          type="button"
                          className="library-context-feed-item__focus"
                          onClick={() => onHighlightClick(highlight)}
                        >
                          <span className="library-context-feed-item__text">{summarizeHighlight(highlight)}</span>
                          <span className="library-context-feed-item__meta">
                            {formatDate(highlight.createdAt)}
                            {tagLabel ? ` • ${tagLabel}` : ''}
                          </span>
                        </button>
                        <div className="library-context-feed-item__actions">
                          <QuietButton onClick={() => onSelectHighlight(highlight._id)}>Focus</QuietButton>
                          <QuietButton onClick={() => onAddNotebook(highlight)}>Notebook</QuietButton>
                          <QuietButton onClick={() => onAddConcept(highlight)}>Concept</QuietButton>
                          <QuietButton onClick={() => onAddQuestion(highlight)}>Question</QuietButton>
                          <QuietButton onClick={() => onDumpToWorkingMemory(highlight)}>Dump</QuietButton>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </Profiler>
            )}
          </div>
        )}
      </div>

      <div className={`library-context-section ${relatedExpanded ? 'is-expanded' : 'is-collapsed'}`}>
        <button
          type="button"
          className="library-context-section__header"
          onClick={toggleRelatedExpanded}
          aria-expanded={relatedExpanded}
        >
          <span className="library-context-section__title">More Context</span>
          <span className="library-context-section__meta">
            {notebookBlocks.length} notes
          </span>
          <span className="library-context-section__chevron" aria-hidden="true">
            {relatedExpanded ? '▾' : '▸'}
          </span>
        </button>
        {relatedExpanded && (
          <div className="library-context-section__body library-context-section__body--related">
            <div className="library-context-related">
              <div className="library-context-related__title">Used in Notes</div>
              {referencesLoading && <p className="muted small">Loading references...</p>}
              {referencesError && <p className="status-message error-message">{referencesError}</p>}
              {!referencesLoading && !referencesError && (
                <div className="library-references">
                  {notebookBlocks.length === 0 ? (
                    <p className="muted small">No notes yet.</p>
                  ) : (
                    notebookBlocks.slice(0, 6).map((block, idx) => (
                      <button
                        key={`${block.notebookEntryId}-${block.blockId}-${idx}`}
                        className="library-reference-item"
                        onClick={() => openNotebookBlock(block)}
                      >
                        <div className="library-reference-title">{block.notebookTitle || 'Untitled note'}</div>
                        <div className="muted small">{block.blockPreviewText || 'Referenced block'}</div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
            <SemanticRelatedPanel
              sourceType="highlight"
              sourceId={semanticHighlightId}
              title="AI Related Highlights"
              limit={6}
              resultTypes={['highlight']}
              enabled={Boolean(selectedArticleId && semanticHighlightId)}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default React.memo(LibraryContext);
