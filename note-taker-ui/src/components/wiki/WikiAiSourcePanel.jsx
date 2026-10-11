import React, { useState } from 'react';
import { Button, SurfaceCard } from '../ui';
import { buildSourceOpenPath } from '../../utils/sourceRoutes';

const emptySourceForm = {
  type: 'external',
  title: '',
  snippet: '',
  url: ''
};

export const buildWikiSourceOpenHref = buildSourceOpenPath;

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

/* The sources behind the page being edited: open one, remove one, attach one. */
const WikiAiSourcePanel = ({
  id,
  page,
  onAddSource,
  onRemoveSource,
  activeSourceIndex = null
}) => {
  const sources = Array.isArray(page?.sourceRefs) ? page.sourceRefs : [];
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
    <aside id={id} className="wiki-source-panel" aria-label="Sources">
      <SurfaceCard className="wiki-source-panel__section">
        <div className="wiki-source-panel__header">
          <div>
            <h2>Sources</h2>
            <p>{sources.length} attached</p>
          </div>
        </div>
        {sources.length === 0 ? <p className="wiki-source-panel__note">No sources attached yet.</p> : null}
        <div className="wiki-source-panel__list">
          {sources.map((source, index) => {
            const citationIndex = index + 1;
            const openHref = buildWikiSourceOpenHref(source);
            return (
              <article
                key={source._id || `${source.type}-${source.objectId}-${source.title}`}
                id={`wiki-source-ref-${citationIndex}`}
                data-testid={`wiki-source-ref-${citationIndex}`}
                className={`wiki-source-panel__source ${activeSourceIndex === citationIndex ? 'wiki-source-panel__source--active' : ''}`}
                tabIndex={-1}
              >
                <div className="wiki-source-panel__source-type">[{citationIndex}] {source.type || 'source'}</div>
                <h3>{cleanPanelText(source.title || 'Untitled source')}</h3>
                {source.snippet ? <p>{cleanPanelText(source.snippet)}</p> : null}
                <div className="wiki-source-panel__actions">
                  {openHref ? (
                    <a
                      href={openHref}
                      target={openHref.startsWith('/') ? undefined : '_blank'}
                      rel={openHref.startsWith('/') ? undefined : 'noreferrer'}
                      className="wiki-source-panel__link"
                    >
                      Open
                    </a>
                  ) : null}
                  {source._id ? (
                    <Button type="button" variant="secondary" onClick={() => onRemoveSource?.(source._id)}>
                      Remove
                    </Button>
                  ) : null}
                </div>
              </article>
            );
          })}
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
