import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createRepoWikiFromGitHub } from '../../api/wiki';
import { wikiPagePath } from '../../utils/wikiFeatureFlags';
import { Button } from '../ui';
import AgentTicker from '../agent/AgentTicker';

const WikiRepoCreateComposer = ({ className = '', compact = false, onCreated }) => {
  const navigate = useNavigate();
  const [repoUrl, setRepoUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [tickerLines, setTickerLines] = useState([]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const input = repoUrl.trim();
    if (!input || busy) return;
    setBusy(true);
    setStatus('');
    setError('');
    setTickerLines(['validating repository URL', 'creating project wiki']);
    try {
      const result = await createRepoWikiFromGitHub(input);
      const page = result?.page || {};
      const pageId = page?._id || page?.id;
      if (!pageId) throw new Error('Missing created page id');
      const label = page.title || result?.repo?.fullName || input;
      setTickerLines([
        `project wiki created · ${label}`,
        result?.watchResult?.watchError ? 'GitHub watch needs retry' : 'GitHub repo watch armed',
        'opening build workspace'
      ]);
      setStatus(`Opening "${label}"...`);
      navigate(`${wikiPagePath(pageId)}&build=1`, { replace: false });
      setRepoUrl('');
      onCreated?.(page);
      setStatus(result?.watchResult?.watchError
        ? `Opened the repo wiki for ${label}. The GitHub watch can be retried from the page.`
        : `Opened the repo wiki for ${label}.`);
    } catch (submitError) {
      setTickerLines([
        `repo wiki failed · ${input}`,
        'waiting for a retry'
      ]);
      setError(submitError?.message || 'Failed to create repo wiki.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className={`wiki-repo-create${compact ? ' wiki-repo-create--compact' : ''}${className ? ` ${className}` : ''}`}
      onSubmit={handleSubmit}
      aria-label="Create a repo wiki from GitHub"
    >
      {!compact ? (
        <div>
          <p className="wiki-index__eyebrow">Repo wiki</p>
          <h2>Start from a GitHub repository</h2>
          <p className="wiki-repo-create__lede">
            Paste a public repository URL to seed a maintained project wiki with README, docs, and release receipts.
          </p>
        </div>
      ) : null}
      <div className="wiki-repo-create__row">
        <input
          value={repoUrl}
          onChange={(event) => setRepoUrl(event.target.value)}
          placeholder="https://github.com/openai/agents-js"
          aria-label="GitHub repository URL"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          disabled={busy}
        />
        <Button type="submit" variant="secondary" disabled={busy || !repoUrl.trim()}>
          {busy ? 'Creating...' : 'Create repo wiki'}
        </Button>
      </div>
      {(busy || tickerLines.length > 0) ? (
        <AgentTicker
          label="Repo wiki trace"
          className="wiki-repo-create__ticker"
          state={busy ? 'working' : 'idle'}
          lines={tickerLines}
        />
      ) : null}
      {status ? <p className="wiki-repo-create__status" role="status">{status}</p> : null}
      {error ? <p className="wiki-index__error" role="alert">{error}</p> : null}
    </form>
  );
};

export default WikiRepoCreateComposer;
