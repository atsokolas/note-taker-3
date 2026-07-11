import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '../ui';
import { armGitHubRepoWatch } from '../../api/wiki';
import { useSystemStatusControls } from '../../system/SystemStatusContext';
import {
  formatGitHubRepoWatchReceipt,
  githubWatchState,
  initialRepoValue,
  isRepoDossierPage
} from './wikiRepoDossierModel';

export { formatGitHubRepoWatchReceipt, isRepoDossierPage } from './wikiRepoDossierModel';

const BUILD_STATUS_LABELS = {
  idle: 'Current',
  queued: 'Queued',
  building: 'Rebuilding',
  ready: 'Ready',
  needs_review: 'Needs review',
  error: 'Error'
};

const normalizeSha = (value = '') => String(value || '').trim();

export const shortHeadSha = (sha = '') => normalizeSha(sha).slice(0, 7);

export const formatRepoWatchCheckedAgo = (iso) => {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const diff = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

export const countRepoWatchSources = (page = {}, watch = {}) => {
  const fromWatch = Number(watch?.sourceCount);
  if (Number.isFinite(fromWatch) && fromWatch > 0) return fromWatch;
  const refs = page?.sourceRefs;
  return Array.isArray(refs) ? refs.length : 0;
};

export const repoWatchBuildStatusLabel = (buildStatus = 'idle') => (
  BUILD_STATUS_LABELS[String(buildStatus || 'idle').toLowerCase()] || 'Current'
);

/**
 * @typedef {'current' | 'rebuilding' | 'failed_candidate' | 'superseded'} RepoWatchPublicationState
 */

/**
 * @param {Record<string, any>} watch
 * @returns {RepoWatchPublicationState}
 */
export const repoWatchPublicationState = (watch = {}) => {
  const observed = normalizeSha(watch.lastHeadSha);
  const published = normalizeSha(watch.publishedHeadSha) || observed;
  const candidate = normalizeSha(watch.candidateHeadSha);
  const buildStatus = String(watch.buildStatus || 'idle').toLowerCase();

  if (
    candidate
    && observed
    && candidate !== observed
    && (buildStatus === 'queued' || buildStatus === 'building')
  ) {
    return 'superseded';
  }

  if (buildStatus === 'needs_review') {
    return 'failed_candidate';
  }

  if (
    buildStatus === 'queued'
    || buildStatus === 'building'
    || buildStatus === 'ready'
    || (observed && published && observed !== published)
  ) {
    return 'rebuilding';
  }

  return 'current';
};

/**
 * @param {Record<string, any>} watch
 * @param {Record<string, any>} page
 * @param {RepoWatchPublicationState} publicationState
 */
export const formatRepoWatchPublicationMessage = (watch = {}, page = {}, publicationState = 'current') => {
  const observed = shortHeadSha(watch.lastHeadSha);
  const published = shortHeadSha(watch.publishedHeadSha || watch.lastHeadSha);
  const checked = formatRepoWatchCheckedAgo(watch.lastCheckedAt);
  const sourceCount = countRepoWatchSources(page, watch);

  switch (publicationState) {
    case 'current':
      return `${published ? `Page current through ${published}` : 'Page current'}${checked ? ` · checked ${checked}` : ''}`;
    case 'rebuilding':
      return `New commits detected at ${observed || shortHeadSha(watch.candidateHeadSha)} · rebuilding from ${sourceCount} repository source${sourceCount === 1 ? '' : 's'}`;
    case 'failed_candidate':
      return `The latest update did not pass the evidence bar. Showing the last trusted version from ${published}.`;
    case 'superseded':
      return 'A newer commit arrived while this page was rebuilding. Continuing with the latest head.';
    default:
      return '';
  }
};

export const formatRepoWatchPublicationFacts = (watch = {}) => {
  const observed = shortHeadSha(watch.lastHeadSha);
  const published = shortHeadSha(watch.publishedHeadSha || watch.lastHeadSha);
  const buildStatus = String(watch.buildStatus || 'idle').toLowerCase();
  return {
    observedHead: observed || 'unknown',
    publishedHead: published || 'unknown',
    checkedAgo: formatRepoWatchCheckedAgo(watch.lastCheckedAt) || 'not yet',
    buildStateLabel: repoWatchBuildStatusLabel(buildStatus)
  };
};

const repoWatchFailureReceipt = (pageId, message) => ({
  id: `repo-watch-review-${pageId}`,
  title: 'Repo wiki update needs review',
  summary: message,
  status: 'needs_review',
  href: `/wiki/workspace?page=${encodeURIComponent(pageId)}`
});

const WikiGitHubRepoWatchControl = ({ pageId, page, onPageUpdate }) => {
  const watch = page?.externalWatches?.githubRepo;
  const state = useMemo(() => githubWatchState(watch), [watch]);
  const publicationState = useMemo(() => repoWatchPublicationState(watch), [watch]);
  const publicationMessage = useMemo(
    () => formatRepoWatchPublicationMessage(watch, page, publicationState),
    [watch, page, publicationState]
  );
  const publicationFacts = useMemo(() => formatRepoWatchPublicationFacts(watch), [watch]);
  const systemStatus = useSystemStatusControls();
  const lastPublicationStateRef = useRef('');
  const [repo, setRepo] = useState(() => initialRepoValue(page, state));
  const [submitError, setSubmitError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!state.armed || busy) return undefined;

    if (publicationState === 'rebuilding' || publicationState === 'superseded') {
      systemStatus.clearRecoverableFailure();
      systemStatus.setBackgroundWork({
        label: 'Repo wiki rebuild',
        stage: publicationState === 'superseded'
          ? `Continuing with latest head for ${state.fullName || 'repository'}`
          : `Rebuilding ${state.fullName || 'repository'} from repository sources`
      });
      return () => {
        systemStatus.setBackgroundWork(null);
      };
    }

    systemStatus.setBackgroundWork(null);

    if (publicationState === 'failed_candidate' && lastPublicationStateRef.current !== 'failed_candidate') {
      systemStatus.setLatestReceipt(repoWatchFailureReceipt(pageId, publicationMessage));
    }

    if (publicationState === 'current') {
      systemStatus.clearRecoverableFailure();
    }

    lastPublicationStateRef.current = publicationState;
    return undefined;
  }, [
    busy,
    pageId,
    publicationMessage,
    publicationState,
    state.armed,
    state.fullName,
    systemStatus
  ]);

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
    systemStatus.setBackgroundWork({ label: 'GitHub repo watch', stage: `Arming ${repoInput}` });
    try {
      const result = await armGitHubRepoWatch(pageId, { repo: repoInput });
      if (result?.page) onPageUpdate?.(result.page);
    } catch (error) {
      setSubmitError(error?.message || 'Failed to arm GitHub repo watch.');
      systemStatus.setRecoverableFailure({
        stage: 'GitHub repo watch',
        message: error?.message || 'Failed to arm GitHub repo watch.',
        retryable: true
      });
    } finally {
      systemStatus.setBackgroundWork(null);
      setBusy(false);
    }
  }, [onPageUpdate, pageId, repo, systemStatus]);

  if (!isRepoDossierPage(page)) return null;

  const activeError = state.watchError || submitError;
  const syncing = busy;
  const queued = !busy && state.queued;
  const showPublicationPanel = state.armed && !syncing && !queued;
  const publicationModifier = showPublicationPanel
    ? (
      publicationState === 'failed_candidate' ? ' is-error'
        : publicationState === 'superseded' ? ' is-syncing is-queued'
          : publicationState === 'rebuilding' ? ' is-syncing'
            : ''
    )
    : '';

  return (
    <section
      className={`wiki-read__github-watch${state.armed ? ' is-armed' : ''}${activeError ? ' is-error' : ''}${syncing ? ' is-syncing' : ''}${queued ? ' is-queued' : ''}${publicationModifier}`}
      aria-label="GitHub repository watch"
      data-repo-watch-state={showPublicationPanel ? publicationState : undefined}
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
        {!syncing && queued ? (
          <p className="wiki-read__github-watch-receipt" role="status">
            {formatGitHubRepoWatchReceipt(watch)}
          </p>
        ) : null}
        {showPublicationPanel ? (
          <>
            <p className="wiki-read__github-watch-receipt" role="status">
              {publicationMessage}
            </p>
            <div className="wiki-read__github-watch-version" aria-label="Repository publication status">
              <p>
                <span className="wiki-read__github-watch-kicker">Repository checked</span>
                {' '}
                {publicationFacts.observedHead}
                {' '}
                ·
                {' '}
                {publicationFacts.checkedAgo}
              </p>
              <p>
                <span className="wiki-read__github-watch-kicker">Page current through</span>
                {' '}
                {publicationFacts.publishedHead}
              </p>
              <p>
                <span className="wiki-read__github-watch-kicker">Build state</span>
                {' '}
                {publicationFacts.buildStateLabel}
              </p>
            </div>
          </>
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
            title={repo || 'GitHub repository owner and name'}
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
