import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createWikiPage, streamMaintainWikiPage } from '../../api/wiki';
import { buildWikiCreatePayload } from '../../utils/wikiCreate';
import { wikiPagePath } from '../../utils/wikiFeatureFlags';
import { Button } from '../ui';

const WikiBuildPageComposer = ({ className = '', compact = false, onBuilt }) => {
  const navigate = useNavigate();
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (event) => {
    event.preventDefault();
    const topic = prompt.trim();
    if (!topic || busy) return;
    setBusy(true);
    setStatus('');
    setError('');
    try {
      const page = await createWikiPage(buildWikiCreatePayload({
        type: 'idea',
        title: topic,
        text: topic,
        pageType: 'overview'
      }));
      const pageId = page?._id || page?.id;
      if (!pageId) throw new Error('Missing created page id');
      setStatus(`Building "${page.title || topic}"...`);
      await streamMaintainWikiPage(pageId, {}, {
        onPage: (updatedPage) => {
          if (updatedPage) onBuilt?.(updatedPage);
        }
      });
      setPrompt('');
      onBuilt?.(page);
      navigate(wikiPagePath(pageId));
    } catch (_error) {
      setError('Failed to build this wiki page.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className={`wiki-build-page${compact ? ' wiki-build-page--compact' : ''}${className ? ` ${className}` : ''}`}
      onSubmit={handleSubmit}
      aria-label="Ask the wiki agent to build a page"
    >
      {!compact ? (
        <div>
          <p className="wiki-index__eyebrow">Build with agent</p>
          <h2>Ask for a wiki page</h2>
        </div>
      ) : null}
      <div className="wiki-build-page__row">
        <input
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="Ask the agent to build a wiki page..."
          aria-label="Wiki page to build"
        />
        <Button type="submit" disabled={busy || !prompt.trim()}>
          {busy ? 'Building...' : 'Build page'}
        </Button>
      </div>
      {status ? <p className="wiki-build-page__status" role="status">{status}</p> : null}
      {error ? <p className="wiki-index__error" role="alert">{error}</p> : null}
    </form>
  );
};

export default WikiBuildPageComposer;
