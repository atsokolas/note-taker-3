import React, { useCallback, useMemo, useState } from 'react';
import { Button } from '../ui';
import { armGitHubRepoWatch } from '../../api/wiki';
import {
  formatGitHubRepoWatchReceipt,
  githubWatchState,
  initialRepoValue,
  isRepoDossierPage
} from './wikiRepoDossierModel';

export { formatGitHubRepoWatchReceipt, isRepoDossierPage } from './wikiRepoDossierModel';

const WikiGitHubRepoWatchControl = ({ pageId, page, onPageUpdate }) => {
  const watch = page?.externalWatches?.githubRepo;
  const state = useMemo(() => githubWatchState(watch), [watch]);
  const [repo, setRepo] = useState(() => initialRepoValue(page, state));
  const [submitError, setSubmitError] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSubmit = useCallback(async (event) => {
    event.preventDefault();
    const repoInput = String(repo || '').trim()
      .replace(/^https?:\/\/github\.com\//i, '')
      .replace(/^github\.com\//i, '')
      .replace(/\.git(?:[/?#].*)?$/i, '')
      .replace(/[?#].*$/, '')
      .replace(/\/+$/, '');
    if (!repoInput || !repoInput.includes('/')) {
      setSubmitError('Enter a public GitHub repository as owner/repo.');
      return;
    }
    setBusy(true);
    setSubmitError('');
    try {
      const result = await armGitHubRepoWatch(pageId, { repo: repoInput });
      if (result?.page) onPageUpdate?.(result.page);
    } catch (error) {
      setSubmitError(error?.message || 'Failed to arm GitHub repo watch.');
    } finally {
      setBusy(false);
    }
  }, [onPageUpdate, pageId, repo]);

  if (!isRepoDossierPage(page)) return null;

  const activeError = state.watchError || submitError;
  const syncing = busy;
  const queued = !busy && state.queued;

  return (
    <section
      className={`wiki-read__github-watch${state.armed ? ' is-armed' : ''}${activeError ? ' is-error' : ''}${syncing ? ' is-syncing' : ''}${queued ? ' is-queued' : ''}`}
      aria-label="GitHub repository watch"
    >
      <div className="wiki-read__github-watch-copy">
        <span className="wiki-read__github-watch-kicker">Research connector</span>
        <h4>Track GitHub repo</h4>
        <p className="wiki-read__github-watch-disclaimer">
          Research only. Noeis watches read-only public repository docs, releases, and head changes for this project wiki.
        </p>
        {syncing ? (
          <p className="wiki-read__github-watch-status" role="status">Syncing GitHub watch…</p>
        ) : null}
        {!syncing && state.armed ? (
          <p className="wiki-read__github-watch-receipt" role="status">
            {formatGitHubRepoWatchReceipt(watch)}
          </p>
        ) : null}
        {!syncing && !state.armed ? (
          <p>
            Arm a repo watcher to pull README, docs, architecture notes, changelogs, and latest releases into this wiki as source events.
          </p>
        ) : null}
        {activeError ? (
          <p className="wiki-read__github-watch-error" role="alert">{activeError}</p>
        ) : null}
      </div>
      <form className="wiki-read__github-watch-form" onSubmit={handleSubmit}>
        <label htmlFor={`wiki-github-watch-${pageId}`}>
          Repository
        </label>
        <div className="wiki-read__github-watch-input-row">
          <input
            id={`wiki-github-watch-${pageId}`}
            type="text"
            inputMode="text"
            autoComplete="off"
            spellCheck={false}
            placeholder="openai/agents-js"
            value={repo}
            onChange={(event) => setRepo(event.target.value)}
            disabled={busy}
          />
          <Button type="submit" variant="secondary" disabled={busy}>
            {busy ? 'Arming...' : state.armed ? 'Update watch' : 'Track repo'}
          </Button>
        </div>
      </form>
    </section>
  );
};

export default WikiGitHubRepoWatchControl;
