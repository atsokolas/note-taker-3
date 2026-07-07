import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createRepoWikiFromGitHub } from '../../api/wiki';
import { wikiPagePath } from '../../utils/wikiFeatureFlags';
import { Button } from '../ui';
import AgentTicker from '../agent/AgentTicker';

const REPO_BUILD_STAGES = [
  {
    label: 'Validate repository',
    trace: 'validating repository URL',
    detail: 'Checking owner, repo name, and public GitHub access.'
  },
  {
    label: 'Attach evidence',
    trace: 'fetching README, package files, workflows, and key paths',
    detail: 'Pulling read-only repository sources into the page ledger.'
  },
  {
    label: 'Select developer paths',
    trace: 'selecting run commands and code ownership paths',
    detail: 'Finding package scripts, API routes, services, models, and UI entrypoints.'
  },
  {
    label: 'Draft handoff',
    trace: 'drafting developer handoff from cited repo evidence',
    detail: 'Writing the practical setup, architecture map, and change playbooks.'
  },
  {
    label: 'Quality gate',
    trace: 'checking claims, commands, and unsupported repo assumptions',
    detail: 'Rejecting scaffold copy, stale docs, unsupported CI claims, and vague file references.'
  },
  {
    label: 'Open workspace',
    trace: 'opening the maintained repo wiki',
    detail: 'Taking you to the page as soon as the first maintained version is ready.'
  }
];

const stageIndexForElapsed = (elapsedSeconds = 0) => {
  if (elapsedSeconds >= 105) return 4;
  if (elapsedSeconds >= 60) return 3;
  if (elapsedSeconds >= 24) return 2;
  if (elapsedSeconds >= 6) return 1;
  return 0;
};

const WikiRepoCreateComposer = ({ className = '', compact = false, onCreated }) => {
  const navigate = useNavigate();
  const [repoUrl, setRepoUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [startedAt, setStartedAt] = useState(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [tickerLines, setTickerLines] = useState([]);
  const activeStageIndex = busy ? stageIndexForElapsed(elapsedSeconds) : -1;
  const activeStage = activeStageIndex >= 0 ? REPO_BUILD_STAGES[activeStageIndex] : null;
  const progressPercent = busy
    ? Math.min(92, Math.max(10, Math.round(((activeStageIndex + 1) / REPO_BUILD_STAGES.length) * 100)))
    : 0;
  const elapsedLabel = useMemo(() => {
    const minutes = Math.floor(elapsedSeconds / 60);
    const seconds = elapsedSeconds % 60;
    return minutes > 0 ? `${minutes}m ${String(seconds).padStart(2, '0')}s` : `${seconds}s`;
  }, [elapsedSeconds]);

  useEffect(() => {
    if (!busy || !startedAt) return undefined;
    const updateElapsed = () => {
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    };
    updateElapsed();
    const timer = window.setInterval(updateElapsed, 1000);
    return () => window.clearInterval(timer);
  }, [busy, startedAt]);

  useEffect(() => {
    if (!busy || activeStageIndex < 0) return;
    setTickerLines(REPO_BUILD_STAGES.slice(0, activeStageIndex + 1).map(stage => stage.trace));
  }, [activeStageIndex, busy]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const input = repoUrl.trim();
    if (!input || busy) return;
    setBusy(true);
    setStartedAt(Date.now());
    setElapsedSeconds(0);
    setStatus('');
    setError('');
    setTickerLines([REPO_BUILD_STAGES[0].trace]);
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
      setStartedAt(null);
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
          {busy ? 'Building...' : 'Create repo wiki'}
        </Button>
      </div>
      {busy ? (
        <section className="wiki-repo-create__progress" aria-label="Repo wiki build progress" aria-live="polite">
          <div className="wiki-repo-create__progress-head">
            <div>
              <span className="wiki-repo-create__progress-kicker">Live build</span>
              <strong>{activeStage?.label || 'Working'}</strong>
              <p>{activeStage?.detail || 'Building the maintained project wiki.'}</p>
            </div>
            <span className="wiki-repo-create__elapsed">{elapsedLabel}</span>
          </div>
          <div className="wiki-repo-create__progress-track" aria-hidden="true">
            <span style={{ width: `${progressPercent}%` }} />
          </div>
          <ol className="wiki-repo-create__steps">
            {REPO_BUILD_STAGES.map((stage, index) => (
              <li
                key={stage.label}
                className={[
                  index < activeStageIndex ? 'is-done' : '',
                  index === activeStageIndex ? 'is-active' : ''
                ].filter(Boolean).join(' ')}
              >
                <span aria-hidden="true" />
                <div>
                  <strong>{stage.label}</strong>
                  <p>{stage.detail}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
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
