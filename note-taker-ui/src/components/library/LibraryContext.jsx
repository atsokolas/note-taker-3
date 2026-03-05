import React, { Profiler, useState } from 'react';
import { Link } from 'react-router-dom';
import { SectionHeader, QuietButton, TagChip } from '../ui';
import HighlightCard from '../blocks/HighlightCard';
import SemanticRelatedPanel from '../retrieval/SemanticRelatedPanel';
import { createProfilerLogger } from '../../utils/perf';

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
  onSelectHighlight,
  onAddConcept,
  onAddNotebook,
  onAddQuestion,
  onDumpToWorkingMemory
}) => {
  const [cardsExpanded, setCardsExpanded] = useState(false);
  const [cardsExpandVersion, setCardsExpandVersion] = useState(0);

  const handleToggleExpandAll = () => {
    const next = !cardsExpanded;
    setCardsExpanded(next);
    setCardsExpandVersion(prev => prev + 1);
  };

  const semanticHighlightId = activeHighlightId || articleHighlights[0]?._id || '';

  if (!selectedArticleId) {
    return (
      <div className="section-stack">
        <SectionHeader title="Context" subtitle="Select an article to see highlights." />
      </div>
    );
  }

  return (
    <div className="section-stack">
      <SectionHeader
        title="Highlights"
        subtitle="Grouped by concept."
        className="library-section-head is-highlights"
        action={(
          <QuietButton onClick={handleToggleExpandAll}>
            {cardsExpanded ? 'Collapse all' : 'Expand all'}
          </QuietButton>
        )}
      />
      {articleHighlights.length === 0 && !articleLoading && (
        <p className="muted small">No highlights saved for this article yet.</p>
      )}
      <Profiler id="LibraryContextHighlights" onRender={createProfilerLogger('library.context-highlights')}>
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
                  <HighlightCard
                    highlight={highlight}
                    compact
                    organizable
                    forceExpandedState={cardsExpanded}
                    forceExpandedVersion={cardsExpandVersion}
                    onDumpToWorkingMemory={onDumpToWorkingMemory}
                    onAddNotebook={onAddNotebook}
                    onAddConcept={onAddConcept}
                    onAddQuestion={onAddQuestion}
                  />
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
                      Focus
                    </QuietButton>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </Profiler>
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
                  params.set('tab', 'notebook');
                  window.location.href = `/think?${params.toString()}`;
                }}
              >
                <div className="library-reference-title">{block.notebookTitle || 'Untitled note'}</div>
                <div className="muted small">{block.blockPreviewText || 'Referenced block'}</div>
              </button>
            ))
          )}
        </div>
      )}
      <SemanticRelatedPanel
        sourceType="highlight"
        sourceId={semanticHighlightId}
        title="AI Related Highlights"
        limit={6}
        resultTypes={['highlight']}
        enabled={Boolean(selectedArticleId && semanticHighlightId)}
      />
    </div>
  );
};

export default React.memo(LibraryContext);
