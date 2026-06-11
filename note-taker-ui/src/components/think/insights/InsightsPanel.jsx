import React from 'react';
import HighlightCard from '../../blocks/HighlightCard';
import { QuietButton, SectionHeader, TagChip } from '../../ui';

const InsightsPanel = ({
  aiHealthStatus,
  aiHealthError,
  insightsTab,
  onInsightsTabChange,
  themesRange,
  onThemesRangeChange,
  themes,
  themesLoading,
  themesError,
  connections,
  connectionsLoading,
  connectionsError,
  connectionScope,
  cardsExpanded,
  cardsExpandVersion,
  onDumpToWorkingMemory,
  onAddNotebook,
  onAddConcept,
  onAddQuestion,
  onSelectView
}) => {
  const renderHighlight = (key, highlightData) => (
    <HighlightCard
      key={key}
      highlight={highlightData}
      compact
      organizable
      connectionScopeType={connectionScope.scopeType}
      connectionScopeId={connectionScope.scopeId}
      forceExpandedState={cardsExpanded}
      forceExpandedVersion={cardsExpandVersion}
      onDumpToWorkingMemory={(item) => onDumpToWorkingMemory(item?.text || '')}
      onAddNotebook={(item) => onAddNotebook({ open: true, highlight: item })}
      onAddConcept={(item) => onAddConcept({ open: true, highlight: item })}
      onAddQuestion={(item) => onAddQuestion({ open: true, highlight: item })}
    />
  );

  return (
    <div className="section-stack">
      <SectionHeader title="Insights" subtitle="Themes and connections across your thinking." />
      {aiHealthStatus === 'loading' && (
        <p className="muted small">Checking partner service...</p>
      )}
      {(aiHealthStatus === 'error' || aiHealthStatus === 'disabled') && (
        <p className="status-message error-message">{aiHealthError}</p>
      )}
      {aiHealthStatus === 'disabled' && (
        <div className="think-insights-fallback">
          <div className="think-insights-fallback__copy">
            <span className="think-insights-fallback__eyebrow">Insights paused</span>
            <h3>Keep the work moving in the core surfaces.</h3>
            <p>
              The partner insight layer is offline right now, so this tab stays read-only instead of pretending to be live.
              Use concept pressure, notebook handoffs, and question tracking until the service comes back.
            </p>
          </div>
          <div className="think-insights-fallback__actions">
            <QuietButton type="button" onClick={() => onSelectView('concepts')}>Open concepts</QuietButton>
            <QuietButton type="button" onClick={() => onSelectView('notebook')}>Open notebook</QuietButton>
            <QuietButton type="button" onClick={() => onSelectView('questions')}>Open questions</QuietButton>
          </div>
        </div>
      )}
      {aiHealthStatus === 'disabled' ? null : (
        <>
          <div className="library-highlight-filters">
            <button
              type="button"
              className={`ui-quiet-button ${insightsTab === 'themes' ? 'is-active' : ''}`}
              onClick={() => onInsightsTabChange('themes')}
            >
              Themes
            </button>
            <button
              type="button"
              className={`ui-quiet-button ${insightsTab === 'connections' ? 'is-active' : ''}`}
              onClick={() => onInsightsTabChange('connections')}
            >
              Connections
            </button>
          </div>

          {insightsTab === 'themes' && (
            <>
              <div className="library-highlight-filters">
                <select value={themesRange} onChange={(event) => onThemesRangeChange(event.target.value)}>
                  <option value="7d">Last 7 days</option>
                  <option value="30d">Last 30 days</option>
                  <option value="90d">Last 90 days</option>
                </select>
              </div>
              {themesLoading && <p className="muted small">Finding themes...</p>}
              {themesError && <p className="status-message error-message">{themesError}</p>}
              {!themesLoading && !themesError && (
                <div className="related-embed-list">
                  {themes.length === 0 ? (
                    <p className="muted small">No themes yet.</p>
                  ) : (
                    themes.map((cluster, idx) => (
                      <div key={`${cluster.title}-${idx}`} className="concept-highlight-card">
                        <div className="related-embed-title">{cluster.title || 'Theme'}</div>
                        {cluster.topTags?.length > 0 && (
                          <div className="concept-related-tags" style={{ marginTop: 6 }}>
                            {cluster.topTags.slice(0, 4).map(tag => (
                              <TagChip key={`${cluster.title}-${tag}`} to={`/tags/${encodeURIComponent(tag)}`}>
                                {tag}
                              </TagChip>
                            ))}
                          </div>
                        )}
                        <div className="concept-note-grid" style={{ marginTop: 10 }}>
                          {(cluster.representativeHighlights || []).map(highlight => (
                            renderHighlight(
                              highlight.id,
                              {
                                _id: highlight.id,
                                text: highlight.text,
                                tags: highlight.tags || [],
                                articleId: highlight.articleId,
                                articleTitle: highlight.articleTitle || ''
                              }
                            )
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </>
          )}

          {insightsTab === 'connections' && (
            <>
              {connectionsLoading && <p className="muted small">Mapping connections...</p>}
              {connectionsError && <p className="status-message error-message">{connectionsError}</p>}
              {!connectionsLoading && !connectionsError && (
                <div className="related-embed-list">
                  {connections.length === 0 ? (
                    <p className="muted small">No connections yet.</p>
                  ) : (
                    connections.map((pair, idx) => (
                      <div key={`${pair.conceptA?.id}-${pair.conceptB?.id}-${idx}`} className="concept-highlight-card">
                        <div className="related-embed-title">
                          {pair.conceptA?.name || 'Concept'} {'<->'} {pair.conceptB?.name || 'Concept'}
                        </div>
                        {pair.sharedSuggestedHighlights?.length > 0 ? (
                          <div className="concept-note-grid" style={{ marginTop: 10 }}>
                            {pair.sharedSuggestedHighlights.map(highlight => (
                              renderHighlight(
                                highlight.objectId,
                                {
                                  _id: highlight.objectId,
                                  text: highlight.title,
                                  tags: highlight.metadata?.tags || [],
                                  articleId: highlight.metadata?.articleId,
                                  articleTitle: highlight.metadata?.articleTitle || ''
                                }
                              )
                            ))}
                          </div>
                        ) : (
                          <p className="muted small" style={{ marginTop: 8 }}>No shared highlights yet.</p>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
};

export default InsightsPanel;
