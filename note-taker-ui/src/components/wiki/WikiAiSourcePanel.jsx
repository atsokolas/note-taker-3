import React, { useState } from 'react';
import { Button, SurfaceCard } from '../ui';

const sourceScopeCopy = {
  entire_library: 'Drafting uses your entire library.',
  current_item: 'Drafting is limited to the current item.',
  selected_sources: 'Drafting is limited to selected sources.'
};

const statusCopy = {
  idle: 'Not drafted',
  drafting: 'Drafting now',
  ready: 'Draft ready',
  error: 'Draft failed'
};

const suggestionCopy = {
  outline: 'Suggested outline',
  claim: 'Claim to cite',
  gap: 'Gap',
  edit: 'Next edit'
};

const emptySourceForm = {
  type: 'external',
  title: '',
  snippet: '',
  url: ''
};

const WikiAiSourcePanel = ({
  id,
  page,
  drafting,
  onDraft,
  onAddSource,
  onRemoveSource,
  onApplySuggestion
}) => {
  const sources = Array.isArray(page?.sourceRefs) ? page.sourceRefs : [];
  const aiState = page?.aiState || {};
  const suggestions = Array.isArray(aiState.suggestions) ? aiState.suggestions : [];
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
            <h2>AI draft</h2>
            <p>{drafting ? statusCopy.drafting : (statusCopy[aiState.draftStatus] || statusCopy.idle)}</p>
          </div>
          <Button type="button" variant="secondary" onClick={onDraft} disabled={drafting}>
            {drafting ? 'Drafting...' : aiState.draftStatus === 'ready' ? 'Regenerate' : 'Generate draft'}
          </Button>
        </div>
        {aiState.lastError ? <p className="wiki-source-panel__error">{aiState.lastError}</p> : null}
        <p className="wiki-source-panel__note">
          {sourceScopeCopy[page?.sourceScope] || 'Drafting uses the selected source scope.'}
        </p>
        {aiState.lastDraftedAt ? (
          <p className="wiki-source-panel__note">Last drafted {new Date(aiState.lastDraftedAt).toLocaleString()}</p>
        ) : null}
      </SurfaceCard>

      <SurfaceCard className="wiki-source-panel__section">
        <div className="wiki-source-panel__header">
          <div>
            <h2>AI suggestions</h2>
            <p>{suggestions.length} available</p>
          </div>
        </div>
        {suggestions.length === 0 ? (
          <p className="wiki-source-panel__note">Generate a draft to get outline, gap, and next-edit suggestions.</p>
        ) : null}
        <div className="wiki-source-panel__list">
          {suggestions.map(suggestion => (
            <article key={suggestion.id || `${suggestion.type}-${suggestion.title}`} className="wiki-source-panel__source">
              <div className="wiki-source-panel__source-type">
                {suggestionCopy[suggestion.type] || 'Suggestion'}
              </div>
              <h3>{suggestion.title || suggestionCopy[suggestion.type] || 'Suggestion'}</h3>
              {suggestion.text ? <p>{suggestion.text}</p> : null}
              <div className="wiki-source-panel__actions">
                <Button type="button" variant="secondary" onClick={() => onApplySuggestion?.(suggestion)}>
                  Insert
                </Button>
              </div>
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
              <h3>{source.title || 'Untitled source'}</h3>
              {source.snippet ? <p>{source.snippet}</p> : null}
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
