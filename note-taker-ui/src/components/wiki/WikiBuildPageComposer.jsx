import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createWikiPage } from '../../api/wiki';
import { buildWikiCreatePayload } from '../../utils/wikiCreate';
import { wikiPagePath } from '../../utils/wikiFeatureFlags';
import { AGENT_DISPLAY_NAME } from '../../constants/agentIdentity';
import { Button } from '../ui';
import AgentTicker from '../agent/AgentTicker';

const WikiBuildPageComposer = ({ className = '', compact = false, onBuilt }) => {
  const navigate = useNavigate();
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [tickerLines, setTickerLines] = useState([]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const topic = prompt.trim();
    if (!topic || busy) return;
    setBusy(true);
    setStatus('');
    setError('');
    setTickerLines([
      `capturing topic · ${topic}`,
      'creating overview scaffold'
    ]);
    try {
      const page = await createWikiPage(buildWikiCreatePayload({
        type: 'idea',
        title: topic,
        text: topic,
        pageType: 'overview'
      }));
      const pageId = page?._id || page?.id;
      if (!pageId) throw new Error('Missing created page id');
      setTickerLines([
        `captured topic · ${page.title || topic}`,
        `opening @wiki:${pageId}`,
        'agent drafting from your library'
      ]);
      setStatus(`Building "${page.title || topic}"...`);
      navigate(`${wikiPagePath(pageId)}&build=1`, { replace: false });
      setPrompt('');
      onBuilt?.(page);
      setStatus(`Opened the workspace. ${AGENT_DISPLAY_NAME} is drafting the page there.`);
    } catch (_error) {
      setTickerLines([
        `build failed · ${topic}`,
        'waiting for a retry'
      ]);
      setError('Failed to build this wiki page.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className={`wiki-build-page${compact ? ' wiki-build-page--compact' : ''}${className ? ` ${className}` : ''}`}
      onSubmit={handleSubmit}
      aria-label={`Ask ${AGENT_DISPLAY_NAME.toLowerCase()} to build a page`}
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
          placeholder={`Ask ${AGENT_DISPLAY_NAME.toLowerCase()} to build a wiki page...`}
          aria-label="Wiki page to build"
        />
        <Button type="submit" disabled={busy || !prompt.trim()}>
          {busy ? 'Building...' : 'Build page'}
        </Button>
      </div>
      {(busy || tickerLines.length > 0) ? (
        <AgentTicker
          label="Wiki build trace"
          className="wiki-build-page__ticker"
          state={busy ? 'working' : 'idle'}
          lines={tickerLines}
        />
      ) : null}
      {status ? <p className="wiki-build-page__status" role="status">{status}</p> : null}
      {error ? <p className="wiki-index__error" role="alert">{error}</p> : null}
    </form>
  );
};

export default WikiBuildPageComposer;
