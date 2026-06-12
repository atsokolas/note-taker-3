import React, { useEffect, useRef, useState } from 'react';
import { AGENT_DISPLAY_NAME } from '../../constants/agentIdentity';
import { searchConnectableItems } from '../../api/connections';

const TYPE_LABELS = {
  notebook: 'Notebook',
  concept: 'Concept',
  question: 'Question',
  article: 'Article',
  highlight: 'Highlight',
  wiki: 'Wiki',
  wiki_page: 'Wiki'
};

const normalizeReferenceItem = (item = {}) => {
  const rawType = String(item.itemType || item.type || '').trim();
  const id = String(item.itemId || item.id || item._id || '').trim();
  if (!rawType || !id) return null;
  const type = rawType === 'wiki_page' ? 'wiki' : rawType;
  const title = String(item.title || item.name || item.url || item.snippet || TYPE_LABELS[rawType] || 'Reference').trim();
  return {
    key: `${type}:${id}`,
    type,
    id,
    articleId: String(item.articleId || item.metadata?.articleId || '').trim(),
    title,
    label: `${TYPE_LABELS[rawType] || TYPE_LABELS[type] || type} · ${title}`,
    snippet: String(item.snippet || item.text || item.description || item.quote || '').trim()
  };
};

const buildHomeCommandContext = (references = []) => ({
  references,
  sourceContext: references.length > 0 ? 'home_reference_tray' : '',
  provenancePending: references.length > 0
});

const ThinkHomeUniversalCommand = ({ onUniversalCommand = null }) => {
  const [commandDraft, setCommandDraft] = useState('');
  const [commandStatus, setCommandStatus] = useState('');
  const [commandBusy, setCommandBusy] = useState(false);
  const [referenceQuery, setReferenceQuery] = useState('');
  const [referenceResults, setReferenceResults] = useState([]);
  const [referenceLoading, setReferenceLoading] = useState(false);
  const [referenceError, setReferenceError] = useState('');
  const [pulledReferences, setPulledReferences] = useState([]);
  const commandInputRef = useRef(null);
  const trimmedReferenceQuery = referenceQuery.trim();

  useEffect(() => {
    let cancelled = false;
    const timeoutId = window.setTimeout(async () => {
      setReferenceLoading(true);
      setReferenceError('');
      try {
        const results = await searchConnectableItems({
          q: trimmedReferenceQuery,
          limit: 6
        });
        if (!cancelled) setReferenceResults(Array.isArray(results) ? results : []);
      } catch (error) {
        if (!cancelled) setReferenceError(error?.response?.data?.error || 'Could not search references.');
      } finally {
        if (!cancelled) setReferenceLoading(false);
      }
    }, trimmedReferenceQuery ? 180 : 320);
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [trimmedReferenceQuery]);

  const pullHomeReference = (item = {}) => {
    const reference = normalizeReferenceItem(item);
    if (!reference?.key) return;
    setPulledReferences((current) => [
      reference,
      ...current.filter((existing) => existing.key !== reference.key)
    ].slice(0, 5));
    setReferenceQuery('');
    setReferenceResults([]);
    setCommandStatus(`${reference.label} is in the command context.`);
  };

  const removeHomeReference = (key = '') => {
    setPulledReferences((current) => current.filter((reference) => reference.key !== key));
  };

  const handleUniversalCommand = async (event) => {
    event.preventDefault();
    const text = commandDraft.trim();
    if (!text || commandBusy) return;
    setCommandBusy(true);
    setCommandStatus(`${AGENT_DISPLAY_NAME} is routing this…`);
    try {
      const status = typeof onUniversalCommand === 'function'
        ? await onUniversalCommand(text, buildHomeCommandContext(pulledReferences))
        : '';
      setCommandStatus(status || `${AGENT_DISPLAY_NAME} opened the right workspace.`);
      setCommandDraft('');
    } catch (error) {
      setCommandStatus(error?.message || `${AGENT_DISPLAY_NAME} could not route that yet.`);
    } finally {
      setCommandBusy(false);
    }
  };

  return (
    <>
      <form
        className="think-home-editorial__universal-command"
        aria-label="Universal command"
        onSubmit={handleUniversalCommand}
      >
        <label className="think-home-editorial__command-label" htmlFor="think-home-universal-command">
          Ask, think, or build
        </label>
        <div className="think-home-editorial__command-row">
          <input
            ref={commandInputRef}
            id="think-home-universal-command"
            value={commandDraft}
            onChange={(event) => setCommandDraft(event.target.value)}
            placeholder="Think, ask, or build..."
            disabled={commandBusy}
          />
          <button type="submit" disabled={!commandDraft.trim() || commandBusy}>
            {commandBusy ? 'Routing' : 'Start'}
          </button>
        </div>
        <p className="think-home-editorial__command-hint" aria-live="polite">
          {commandStatus || `${AGENT_DISPLAY_NAME} will send this to a note, concept, question, source search, or wiki build.`}
        </p>
      </form>

      <section className="think-home-editorial__reference-tray" aria-label="Home reference tray">
        <div className="think-home-editorial__reference-head">
          <span>reference...</span>
          <p>Pull Library highlights, sources, Wiki pages, or Think work into the next command.</p>
        </div>
        <div className="think-home-editorial__reference-search">
          <input
            type="search"
            value={referenceQuery}
            onChange={(event) => setReferenceQuery(event.target.value)}
            placeholder="Search highlights, sources, Wiki, concepts, notes..."
            aria-label="Search Home references"
          />
        </div>
        {referenceLoading ? <p className="muted small">Searching corpus...</p> : null}
        {referenceError ? <p className="status-message error-message">{referenceError}</p> : null}
        {referenceResults.length ? (
          <div className="think-home-editorial__reference-results">
            {referenceResults.map((item) => {
              const reference = normalizeReferenceItem(item);
              if (!reference) return null;
              return (
                <button
                  type="button"
                  key={reference.key}
                  className="think-home-editorial__reference-result"
                  onClick={() => pullHomeReference(item)}
                >
                  <span>{TYPE_LABELS[item.itemType] || TYPE_LABELS[reference.type] || reference.type}</span>
                  <strong>{reference.title}</strong>
                  {reference.snippet ? <small>{reference.snippet}</small> : null}
                </button>
              );
            })}
          </div>
        ) : null}
        {pulledReferences.length ? (
          <div className="think-home-editorial__reference-strip" aria-label="Pulled Home references">
            <span>Context</span>
            {pulledReferences.map((reference) => (
              <button
                type="button"
                key={reference.key}
                onClick={() => removeHomeReference(reference.key)}
                aria-label={`Remove ${reference.label}`}
              >
                {reference.label}
                <span aria-hidden="true">×</span>
              </button>
            ))}
          </div>
        ) : null}
      </section>
    </>
  );
};

export default ThinkHomeUniversalCommand;
