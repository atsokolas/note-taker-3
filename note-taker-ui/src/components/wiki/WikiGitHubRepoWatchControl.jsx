import React, { useCallback, useMemo, useState } from 'react';
import { Button } from '../ui';
import { armGitHubRepoWatch } from '../../api/wiki';

const normalizeText = (value = '') => String(value || '').trim();

const pageMeta = (page = {}) => {
  const value = page || {};
  return (
    value.infobox && typeof value.infobox === 'object' ? value.infobox :
      value.metadata && typeof value.metadata === 'object' ? value.metadata :
        value.meta && typeof value.meta === 'object' ? value.meta :
        {}
  );
};

const formatWatchDate = (value) => {
  if (!value) return 'not yet';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'not yet';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

const normalizeRepoInput = (value = '') => normalizeText(value)
  .replace(/^https?:\/\/github\.com\//i, '')
  .replace(/^github\.com\//i, '')
  .replace(/\.git(?:[/?#].*)?$/i, '')
  .replace(/[?#].*$/, '')
  .replace(/\/+$/, '');

const githubWatchState = (watch = {}) => {
  const value = watch && typeof watch === 'object' ? watch : {};
  const owner = normalizeText(value.owner);
  const repo = normalizeText(value.repo);
  const status = String(value.status || '').toLowerCase();
  const errorMessage = normalizeText(value.errorMessage);
  const fullName = owner && repo ? `${owner}/${repo}` : '';
  const armed = Boolean(fullName) && status !== 'error';
  const queued = armed && !value.lastCheckedAt;
  return {
    owner,
    repo,
    fullName,
    defaultBranch: normalizeText(value.defaultBranch),
    status,
    errorMessage,
    lastCheckedAt: value.lastCheckedAt || null,
    lastHeadSha: normalizeText(value.lastHeadSha),
    lastReleaseTag: normalizeText(value.lastReleaseTag),
    armed,
    queued,
    watchError: status === 'error' ? (errorMessage || 'GitHub repo watch failed.') : ''
  };
};

export const isRepoDossierPage = (page = {}) => {
  const type = String(page?.pageType || '').toLowerCase();
  const watch = githubWatchState(page?.externalWatches?.githubRepo);
  if (watch.owner || watch.repo) return true;
  if (type === 'project' || type === 'log') return true;
  const meta = pageMeta(page);
  return Boolean(normalizeText(meta.githubRepo || meta.repo || meta.repository || meta.githubUrl || meta.repoUrl));
};

export const formatGitHubRepoWatchReceipt = (watch = {}) => {
  const state = githubWatchState(watch);
  const label = state.fullName || 'repository';
  if (state.queued) {
    return `GitHub watcher queued for ${label} · first sync pending`;
  }
  const checked = formatWatchDate(state.lastCheckedAt);
  const sha = state.lastHeadSha ? ` · head ${state.lastHeadSha.slice(0, 7)}` : '';
  const release = state.lastReleaseTag ? ` · latest release ${state.lastReleaseTag}` : '';
  return `GitHub watcher armed for ${label} · last checked ${checked}${sha}${release}`;
};

const initialRepoValue = (page = {}, state = {}) => {
  if (state.fullName) return state.fullName;
  const meta = pageMeta(page);
  return normalizeRepoInput(meta.githubRepo || meta.repo || meta.repository || meta.githubUrl || meta.repoUrl || '');
};

const WikiGitHubRepoWatchControl = ({ pageId, page, onPageUpdate }) => {
  const watch = page?.externalWatches?.githubRepo;
  const state = useMemo(() => githubWatchState(watch), [watch]);
  const [repo, setRepo] = useState(() => initialRepoValue(page, state));
  const [submitError, setSubmitError] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSubmit = useCallback(async (event) => {
    event.preventDefault();
    const repoInput = normalizeRepoInput(repo);
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
