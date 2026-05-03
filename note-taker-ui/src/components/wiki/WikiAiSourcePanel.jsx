import React from 'react';
import { Button, SurfaceCard } from '../ui';

const sourceScopeCopy = {
  entire_library: 'Drafting uses your entire library.',
  current_item: 'Drafting is limited to the current item.',
  selected_sources: 'Drafting is limited to selected sources.'
};

const WikiAiSourcePanel = ({ page, drafting, onDraft }) => {
  const sources = Array.isArray(page?.sourceRefs) ? page.sourceRefs : [];
  const aiState = page?.aiState || {};

  return (
    <aside className="wiki-source-panel" aria-label="Wiki AI and sources">
      <SurfaceCard className="wiki-source-panel__section">
        <div className="wiki-source-panel__header">
          <div>
            <h2>AI draft</h2>
            <p>{aiState.draftStatus || 'idle'}</p>
          </div>
          <Button type="button" variant="secondary" onClick={onDraft} disabled={drafting}>
            {drafting ? 'Drafting...' : 'Refresh'}
          </Button>
        </div>
        {aiState.lastError ? <p className="wiki-source-panel__error">{aiState.lastError}</p> : null}
        <p className="wiki-source-panel__note">
          {sourceScopeCopy[page?.sourceScope] || 'Drafting uses the selected source scope.'}
        </p>
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
            </article>
          ))}
        </div>
      </SurfaceCard>
    </aside>
  );
};

export default WikiAiSourcePanel;
