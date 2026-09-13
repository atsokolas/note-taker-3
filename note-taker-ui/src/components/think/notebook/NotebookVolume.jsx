import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getNotebookVolume,
  publishNotebookVolume,
  revokeNotebookVolume,
  updateNotebookVolume
} from '../../../api/notebook';
import { usePrefersReducedMotion } from '../../../hooks/useMotionPreferences';
import NotebookVolumePage from './NotebookVolumePage';
import {
  VOLUME_SHARE_PRIVACY,
  VOLUME_SHARE_REVOKE,
  VOLUME_SHARE_SILENCE
} from './notebookShareFixture';

const shareHref = (slug) => (
  typeof window === 'undefined' ? `/share/volumes/${slug}` : `${window.location.origin}/share/volumes/${slug}`
);

const actionErrorOf = (error, fallback) => (
  error?.response?.data?.error || error?.message || fallback
);

const toggleId = (ids, id) => {
  if (ids.includes(id)) return ids.filter((item) => item !== id);
  return [...ids, id];
};

const moveId = (ids, id, delta) => {
  const index = ids.indexOf(id);
  if (index < 0) return ids;
  const next = index + delta;
  if (next < 0 || next >= ids.length) return ids;
  const copy = ids.slice();
  const [item] = copy.splice(index, 1);
  copy.splice(next, 0, item);
  return copy;
};

export function NotebookVolumePanel({
  notebookId = '',
  status = 'ready',
  share = null,
  title = '',
  introduction = '',
  selection = [],
  busy = '',
  error = '',
  onTitle,
  onIntroduction,
  onToggle,
  onMove,
  onRetry,
  onCreate,
  onUpdate,
  onStop
}) {
  const reduced = usePrefersReducedMotion();
  const urlRef = useRef(null);
  const [copied, setCopied] = useState(false);
  const [selectHint, setSelectHint] = useState(false);
  const href = share?.shared && share?.slug ? shareHref(share.slug) : '';
  const preview = share?.preview || null;
  const snapshot = share?.snapshot || null;
  const liveLink = Boolean(share?.shared);
  const stale = Boolean(liveLink && share?.stale);
  const readerVolume = liveLink ? (snapshot || (stale ? null : preview)) : preview;
  const pendingVolume = stale ? preview : null;
  const catalog = Array.isArray(share?.catalog) ? share.catalog : [];
  const publishable = catalog.length >= 2
    && selection.length >= 2
    && Boolean(String(title || '').trim())
    && Boolean(String(introduction || '').trim());

  const copyLink = async () => {
    if (!href) return;
    try {
      await navigator.clipboard.writeText(href);
      setCopied(true);
      setSelectHint(false);
      if (!reduced) window.setTimeout(() => setCopied(false), 2200);
    } catch (_copyError) {
      setCopied(false);
      setSelectHint(true);
      urlRef.current?.focus();
      urlRef.current?.select();
    }
  };

  return (
    <section
      className="notebook-share notebook-volume"
      aria-label="Collect these notes"
      data-testid="notebook-volume"
    >
      <p className="notebook-share__privacy">{VOLUME_SHARE_PRIVACY}</p>

      {status === 'unavailable' ? (
        <p className="notebook-share__status" role="status">
          Volume status unavailable
          <button type="button" onClick={onRetry} data-testid="notebook-volume-retry">Retry</button>
        </p>
      ) : null}

      {status === 'loading' ? (
        <p className="notebook-share__status" role="status">Checking the volume…</p>
      ) : null}

      {status === 'ready' && catalog.length ? (
        <div className="notebook-volume__catalog" data-testid="notebook-volume-catalog">
          <p className="notebook-share__preview-label">Published notes</p>
          <ul>
            {catalog.map((entry) => {
              const checked = selection.includes(entry.notebookId);
              const order = checked ? selection.indexOf(entry.notebookId) + 1 : 0;
              return (
                <li key={entry.notebookId}>
                  <label>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => onToggle?.(entry.notebookId)}
                    />
                    <span>{entry.title}</span>
                    {entry.notebookId === notebookId ? (
                      <span className="notebook-share__hint"> This note</span>
                    ) : null}
                  </label>
                  {checked && selection.length > 1 ? (
                    <span className="notebook-volume__order">
                      <span>{order}</span>
                      <button type="button" onClick={() => onMove?.(entry.notebookId, -1)} aria-label={`Move ${entry.title} earlier`}>
                        Up
                      </button>
                      <button type="button" onClick={() => onMove?.(entry.notebookId, 1)} aria-label={`Move ${entry.title} later`}>
                        Down
                      </button>
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {status === 'ready' ? (
        <div className="notebook-share__note">
          <label className="notebook-share__url-label" htmlFor="notebook-volume-title">
            Volume title
          </label>
          <input
            id="notebook-volume-title"
            className="notebook-share__url"
            data-testid="notebook-volume-title"
            value={title}
            maxLength={300}
            onChange={(event) => onTitle?.(event.target.value)}
          />
          <label className="notebook-share__url-label" htmlFor="notebook-volume-intro">
            Introduction
          </label>
          <textarea
            id="notebook-volume-intro"
            className="notebook-share__correction"
            data-testid="notebook-volume-intro"
            value={introduction}
            maxLength={800}
            rows={4}
            onChange={(event) => onIntroduction?.(event.target.value)}
          />
          <p className="notebook-share__hint">The through-line a reader meets before the notes.</p>
        </div>
      ) : null}

      {status === 'ready' && readerVolume?.pieces?.length ? (
        <div className="notebook-share__preview" data-testid="notebook-volume-preview">
          <p className="notebook-share__preview-label">What a reader will see</p>
          <NotebookVolumePage snapshot={readerVolume} compact />
        </div>
      ) : null}

      {status === 'ready' && pendingVolume?.pieces?.length ? (
        <div
          className="notebook-share__preview notebook-share__preview--pending"
          data-testid="notebook-volume-pending"
        >
          <p className="notebook-share__preview-label">Pending an update</p>
          <NotebookVolumePage snapshot={pendingVolume} compact />
        </div>
      ) : null}

      {status === 'ready' && catalog.length < 2 ? (
        <p className="notebook-share__hint" data-testid="notebook-volume-silence">
          {VOLUME_SHARE_SILENCE}
        </p>
      ) : null}

      {status === 'ready' && share?.shared ? (
        <>
          <label className="notebook-share__url-label" htmlFor="notebook-volume-url">
            Shared link
          </label>
          <input
            id="notebook-volume-url"
            ref={urlRef}
            className="notebook-share__url"
            data-testid="notebook-volume-url"
            readOnly
            value={href}
            onFocus={(event) => event.target.select()}
          />
          <p className="notebook-share__hint">{VOLUME_SHARE_REVOKE}</p>
          <div className="notebook-share__actions">
            <button type="button" onClick={copyLink} data-testid="notebook-volume-copy-link">
              {copied ? 'Link copied' : 'Copy link'}
            </button>
            {selectHint ? (
              <button
                type="button"
                onClick={() => { urlRef.current?.focus(); urlRef.current?.select(); }}
                data-testid="notebook-volume-select-link"
              >
                Select and copy this link
              </button>
            ) : null}
            <a
              className="notebook-share__open"
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="notebook-volume-open"
            >
              Open shared volume
            </a>
            {share.stale ? (
              <button
                type="button"
                onClick={onUpdate}
                disabled={Boolean(busy)}
                data-testid="notebook-volume-update"
              >
                {busy === 'update' ? 'Updating…' : 'Update shared version'}
              </button>
            ) : null}
            <button
              type="button"
              onClick={onStop}
              disabled={Boolean(busy)}
              data-testid="notebook-volume-unpublish"
            >
              {busy === 'stop' ? 'Stopping…' : 'Stop sharing'}
            </button>
          </div>
        </>
      ) : null}

      {status === 'ready' && !share?.shared && publishable ? (
        <div className="notebook-share__actions">
          <button
            type="button"
            onClick={onCreate}
            disabled={Boolean(busy)}
            data-testid="notebook-volume-publish"
          >
            {busy === 'create' ? 'Creating…' : 'Create volume link'}
          </button>
        </div>
      ) : null}

      {error ? (
        <p className="notebook-share__error" role="status">
          {error}
          <button type="button" onClick={onRetry} data-testid="notebook-volume-retry-error">Retry</button>
        </p>
      ) : null}
    </section>
  );
}

export default function NotebookVolume({ notebookId, revision = 0 }) {
  const [status, setStatus] = useState('loading');
  const [share, setShare] = useState(null);
  const [title, setTitle] = useState('');
  const [introduction, setIntroduction] = useState('');
  const [selection, setSelection] = useState([]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const seenRevision = useRef(revision);
  const hydrated = useRef('');

  const draft = useMemo(() => ({ notebookIds: selection, title, introduction }), [
    selection,
    title,
    introduction
  ]);

  const load = useCallback(async (nextDraft = draft) => {
    setError('');
    try {
      const found = await getNotebookVolume(nextDraft);
      setShare(found);
      setStatus('ready');
      return found;
    } catch (_loadError) {
      setShare(null);
      setStatus('unavailable');
      return null;
    }
  }, [draft]);

  useEffect(() => {
    setBusy('');
    setStatus('loading');
    hydrated.current = '';
    getNotebookVolume()
      .then((found) => {
        const catalog = Array.isArray(found?.catalog) ? found.catalog : [];
        const stored = Array.isArray(found?.selection) ? found.selection : [];
        const nextSelection = stored.length
          ? stored
          : (catalog.some((entry) => entry.notebookId === notebookId) ? [notebookId] : []);
        const nextTitle = found?.shared ? (found.title || '') : '';
        const nextIntro = found?.shared ? (found.introduction || '') : '';
        setSelection(nextSelection);
        setTitle(nextTitle);
        setIntroduction(nextIntro);
        hydrated.current = notebookId;
        return getNotebookVolume({
          notebookIds: nextSelection,
          title: nextTitle,
          introduction: nextIntro
        });
      })
      .then((found) => {
        if (found) {
          setShare(found);
          setStatus('ready');
        }
      })
      .catch(() => {
        setShare(null);
        setStatus('unavailable');
      });
  }, [notebookId]);

  useEffect(() => {
    if (seenRevision.current === revision) return;
    seenRevision.current = revision;
    load();
  }, [revision, load]);

  useEffect(() => {
    if (hydrated.current !== notebookId || status !== 'ready') return undefined;
    const timer = window.setTimeout(() => {
      load(draft);
    }, 280);
    return () => window.clearTimeout(timer);
  }, [draft, load, notebookId, status]);

  const run = useCallback(async (label, work) => {
    if (busy) return;
    setBusy(label);
    setError('');
    try {
      const next = await work();
      if (next) setShare(next);
      setStatus('ready');
    } catch (actionError) {
      setError(actionErrorOf(actionError, 'That volume did not complete.'));
    } finally {
      setBusy('');
    }
  }, [busy]);

  return (
    <NotebookVolumePanel
      notebookId={notebookId}
      status={status}
      share={share}
      title={title}
      introduction={introduction}
      selection={selection}
      busy={busy}
      error={error}
      onTitle={setTitle}
      onIntroduction={setIntroduction}
      onToggle={(id) => setSelection((current) => toggleId(current, id))}
      onMove={(id, delta) => setSelection((current) => moveId(current, id, delta))}
      onRetry={() => load()}
      onCreate={() => run('create', async () => {
        const preview = await getNotebookVolume(draft);
        return publishNotebookVolume({
          ...draft,
          previewHash: preview?.currentHash
        });
      })}
      onUpdate={() => run('update', async () => {
        const preview = await getNotebookVolume(draft);
        return updateNotebookVolume({
          ...draft,
          previewHash: preview?.currentHash
        });
      })}
      onStop={() => run('stop', async () => {
        await revokeNotebookVolume();
        const next = await getNotebookVolume(draft);
        return next || {
          shared: false,
          publishable: false,
          preview: null,
          catalog: share?.catalog || []
        };
      })}
    />
  );
}
