import React, { useState } from 'react';
import { Button, SurfaceCard } from '../ui';

const sourceScopeCopy = {
  entire_library: 'Maintenance uses your entire library.',
  current_item: 'Maintenance will expand beyond the seed item when relevant.',
  selected_sources: 'Maintenance uses attached sources and relevant library items.'
};

const statusCopy = {
  idle: 'Not maintained',
  drafting: 'Maintaining now',
  maintaining: 'Maintaining now',
  ready: 'Page maintained',
  error: 'Maintenance failed'
};

const suggestionCopy = {
  outline: 'Structure update',
  claim: 'Claim update',
  gap: 'Health flag',
  edit: 'Applied edit'
};

const healthCopy = {
  newItems: 'New items affecting this page',
  unsupportedClaims: 'Unsupported claims',
  missingCitations: 'Missing citations',
  staleSections: 'Stale sections',
  contradictions: 'Contradictions',
  relatedPages: 'Related pages'
};

const emptySourceForm = {
  type: 'external',
  title: '',
  snippet: '',
  url: ''
};

const cleanPanelText = (value = '') => String(value || '')
  .replace(/&lt;/gi, '<')
  .replace(/&gt;/gi, '>')
  .replace(/<\/(p|div|li|br)>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/&quot;/gi, '"')
  .replace(/&#39;/gi, "'")
  .replace(/\s+/g, ' ')
  .trim();

const WikiAiSourcePanel = ({
  id,
  page,
  maintaining,
  onMaintain,
  onAddSource,
  onRemoveSource
}) => {
  const sources = Array.isArray(page?.sourceRefs) ? page.sourceRefs : [];
  const aiState = page?.aiState || {};
  const changeLog = Array.isArray(aiState.changeLog) && aiState.changeLog.length > 0
    ? aiState.changeLog
    : Array.isArray(aiState.suggestions)
      ? aiState.suggestions
      : [];
  const health = aiState.health || {};
  const healthEntries = Object.entries(healthCopy).map(([key, label]) => ({
    key,
    label,
    items: Array.isArray(health[key]) ? health[key] : []
  }));
  const issueCount = healthEntries.reduce((count, entry) => count + entry.items.length, 0);
  const [sourceForm, setSourceForm] = useState(emptySourceForm);
  const [adding, setAdding] = useState(false);

  const handleSubmitSource = async (event) => {
    event.preventDefault();
    const title = sourceForm.title.trim();
    const snippet = sourceForm.snippet.trim();
    const url = sourceForm.url.trim();
    if (!title && !snippet && !url) return;
    setAdding(true);
    try {
      await onAddSource?.({
        type: sourceForm.type,
        title,
        snippet,
        url
      });
      setSourceForm(emptySourceForm);
    } finally {
      setAdding(false);
    }
  };

  return (
    <aside id={id} className="wiki-source-panel" aria-label="Wiki AI and sources">
      <SurfaceCard className="wiki-source-panel__section">
        <div className="wiki-source-panel__header">
          <div>
            <h2>Maintenance</h2>
            <p>{maintaining ? statusCopy.maintaining : (statusCopy[aiState.draftStatus] || statusCopy.idle)}</p>
          </div>
        </div>
        {aiState.lastError ? <p className="wiki-source-panel__error">{aiState.lastError}</p> : null}
        {aiState.maintenanceSummary ? (
          <p className="wiki-source-panel__note">{cleanPanelText(aiState.maintenanceSummary)}</p>
        ) : null}
        {changeLog.length > 0 ? (
          <div className="wiki-source-panel__list">
            <article className="wiki-source-panel__source">
              <div className="wiki-source-panel__source-type">What changed this run</div>
              {changeLog.slice(0, 3).map((item, index) => (
                <p key={`change-summary-${item.id || index}`}>{cleanPanelText(item.text || item.title)}</p>
              ))}
            </article>
          </div>
        ) : null}
        <p className="wiki-source-panel__note">
          {sourceScopeCopy[page?.sourceScope] || 'Maintenance uses relevant library material.'}
        </p>
        {aiState.lastDraftedAt ? (
          <p className="wiki-source-panel__note">Last maintained {new Date(aiState.lastDraftedAt).toLocaleString()}</p>
        ) : null}
        {aiState.model ? (
          <p className="wiki-source-panel__note">Model {aiState.model}</p>
        ) : null}
      </SurfaceCard>

      <SurfaceCard className="wiki-source-panel__section">
        <div className="wiki-source-panel__header">
          <div>
            <h2>Page health</h2>
            <p>{issueCount} signal{issueCount === 1 ? '' : 's'}</p>
          </div>
        </div>
        {issueCount === 0 ? (
          <p className="wiki-source-panel__note">Run maintenance to check new material, support, citations, staleness, contradictions, and related pages.</p>
        ) : null}
        <div className="wiki-source-panel__list">
          {healthEntries.map(entry => entry.items.length > 0 ? (
            <article key={entry.key} className="wiki-source-panel__source">
              <div className="wiki-source-panel__source-type">{entry.label}</div>
              {entry.items.slice(0, 5).map((item, index) => (
                <p key={`${entry.key}-${index}`}>
                  {cleanPanelText(item.text || item.title || item.summary)}
                  {item.sourceTitle ? ` - ${cleanPanelText(item.sourceTitle)}` : ''}
                </p>
              ))}
            </article>
          ) : null)}
        </div>
      </SurfaceCard>

      <SurfaceCard className="wiki-source-panel__section">
        <div className="wiki-source-panel__header">
          <div>
            <h2>Changelog</h2>
            <p>{changeLog.length} recorded</p>
          </div>
        </div>
        {changeLog.length === 0 ? (
          <p className="wiki-source-panel__note">Maintenance updates will appear here after the page is rebuilt.</p>
        ) : null}
        <div className="wiki-source-panel__list">
          {changeLog.map(suggestion => (
            <article key={suggestion.id || `${suggestion.type}-${suggestion.title}`} className="wiki-source-panel__source">
              <div className="wiki-source-panel__source-type">
                {suggestionCopy[suggestion.type] || 'Applied update'}
              </div>
              <h3>{cleanPanelText(suggestion.title || suggestionCopy[suggestion.type] || 'Applied update')}</h3>
              {suggestion.text ? <p>{cleanPanelText(suggestion.text)}</p> : null}
            </article>
          ))}
        </div>
      </SurfaceCard>

      <SurfaceCard className="wiki-source-panel__section">
        <div className="wiki-source-panel__header">
          <div>
            <h2>Sources</h2>
            <p>{sources.length} attached</p>
          </div>
        </div>
        {sources.length === 0 ? <p className="wiki-source-panel__note">No sources attached yet.</p> : null}
        <div className="wiki-source-panel__list">
          {sources.map(source => (
            <article key={source._id || `${source.type}-${source.objectId}-${source.title}`} className="wiki-source-panel__source">
              <div className="wiki-source-panel__source-type">{source.type || 'source'}</div>
              <h3>{cleanPanelText(source.title || 'Untitled source')}</h3>
              {source.snippet ? <p>{cleanPanelText(source.snippet)}</p> : null}
              <div className="wiki-source-panel__actions">
                {source.url ? (
                  <a href={source.url} target="_blank" rel="noreferrer" className="wiki-source-panel__link">Open</a>
                ) : null}
                {source._id ? (
                  <Button type="button" variant="secondary" onClick={() => onRemoveSource?.(source._id)}>
                    Remove
                  </Button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
        <form className="wiki-source-panel__form" onSubmit={handleSubmitSource}>
          <label>
            <span>Type</span>
            <select
              value={sourceForm.type}
              onChange={(event) => setSourceForm(current => ({ ...current, type: event.target.value }))}
            >
              <option value="external">External</option>
              <option value="article">Article</option>
              <option value="highlight">Highlight</option>
              <option value="notebook">Notebook</option>
              <option value="concept">Concept</option>
              <option value="question">Question</option>
            </select>
          </label>
          <input
            value={sourceForm.title}
            onChange={(event) => setSourceForm(current => ({ ...current, title: event.target.value }))}
            placeholder="Source title"
            aria-label="Source title"
          />
          <textarea
            value={sourceForm.snippet}
            onChange={(event) => setSourceForm(current => ({ ...current, snippet: event.target.value }))}
            placeholder="Relevant excerpt or note"
            aria-label="Source excerpt"
            rows={3}
          />
          <input
            value={sourceForm.url}
            onChange={(event) => setSourceForm(current => ({ ...current, url: event.target.value }))}
            placeholder="https://..."
            aria-label="Source URL"
          />
          <Button type="submit" disabled={adding}>{adding ? 'Attaching...' : 'Attach source'}</Button>
        </form>
      </SurfaceCard>
    </aside>
  );
};

export default WikiAiSourcePanel;
