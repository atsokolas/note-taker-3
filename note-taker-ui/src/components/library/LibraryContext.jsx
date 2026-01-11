import React from 'react';
import { Link } from 'react-router-dom';
import { SectionHeader, QuietButton, TagChip } from '../ui';

const LibraryContext = ({
  selectedArticleId,
  articleHighlights,
  articleLoading,
  references,
  referencesLoading,
  referencesError,
  highlightGroups,
  groupedHighlights,
  activeHighlightId,
  onHighlightClick,
  onSelectHighlight
}) => {
  if (!selectedArticleId) {
    return (
      <div className="section-stack">
        <SectionHeader title="Context" subtitle="Select an article to see highlights." />
      </div>
    );
  }

  return (
    <div className="section-stack">
      <SectionHeader title="Highlights" subtitle="Grouped by concept." />
      {articleHighlights.length === 0 && !articleLoading && (
        <p className="muted small">No highlights saved for this article yet.</p>
      )}
      {highlightGroups.map(tag => (
        <div key={tag} className="library-highlight-group">
          <div className="library-highlight-group-header">
            <span className="library-highlight-group-title">{tag}</span>
            {tag !== 'Untagged' && (
              <Link to={`/tags/${encodeURIComponent(tag)}`} className="muted small">Open concept</Link>
            )}
          </div>
          <div className="library-highlight-list">
            {groupedHighlights[tag].map(highlight => (
              <div
                key={highlight._id}
                className={`library-highlight-item ${activeHighlightId === highlight._id ? 'is-active' : ''}`}
                role="button"
                tabIndex={0}
                onClick={() => onHighlightClick(highlight)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onHighlightClick(highlight);
                }}
              >
                <div className="library-highlight-text">{highlight.text}</div>
                <div className="library-highlight-tags">
                  {(highlight.tags || []).length > 0 ? (
                    highlight.tags.map(tagName => (
                      <TagChip key={`${highlight._id}-${tagName}`} to={`/tags/${encodeURIComponent(tagName)}`}>
                        {tagName}
                      </TagChip>
                    ))
                  ) : (
                    <span className="muted small">Untagged</span>
                  )}
                </div>
                <div className="library-highlight-actions">
                  <QuietButton
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectHighlight(highlight._id);
                    }}
                  >
                    Select
                  </QuietButton>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
      <SectionHeader title="Used in Notes" subtitle="Backlinks for this article." />
      {referencesLoading && <p className="muted small">Loading references…</p>}
      {referencesError && <p className="status-message error-message">{referencesError}</p>}
      {!referencesLoading && !referencesError && (
        <div className="library-references">
          {references.notebookBlocks.length === 0 ? (
            <p className="muted small">No notes yet.</p>
          ) : (
            references.notebookBlocks.slice(0, 6).map((block, idx) => (
              <button
                key={`${block.notebookEntryId}-${block.blockId}-${idx}`}
                className="library-reference-item"
                onClick={() => {
                  const params = new URLSearchParams();
                  params.set('entryId', block.notebookEntryId);
                  if (block.blockId) params.set('blockId', block.blockId);
                  window.location.href = `/notebook?${params.toString()}`;
                }}
              >
                <div className="library-reference-title">{block.notebookTitle || 'Untitled note'}</div>
                <div className="muted small">{block.blockPreviewText || 'Referenced block'}</div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default LibraryContext;
