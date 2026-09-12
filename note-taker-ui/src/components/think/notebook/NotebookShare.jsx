import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  getNotebookShare,
  publishNotebookShare,
  revokeNotebookShare,
  updateNotebookShare
} from '../../../api/notebook';
import { usePrefersReducedMotion } from '../../../hooks/useMotionPreferences';
import NotebookEssay from './NotebookEssay';
import { NOTEBOOK_SHARE_PRIVACY, NOTEBOOK_SHARE_REVOKE } from './notebookShareFixture';

const shareHref = (slug) => (
  typeof window === 'undefined' ? `/share/notebooks/${slug}` : `${window.location.origin}/share/notebooks/${slug}`
);

const actionErrorOf = (error, fallback) => (
  error?.response?.data?.error || error?.message || fallback
);

export function NotebookSharePanel({
  notebookId = 'note',
  status = 'ready',
  share = null,
  busy = '',
  error = '',
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
  const publishable = share?.publishable !== false && Boolean(preview?.blocks?.length);

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
      className="notebook-share"
      aria-label="Share this note"
      data-testid="notebook-share"
    >
      <p className="notebook-share__privacy">{NOTEBOOK_SHARE_PRIVACY}</p>

      {status === 'unavailable' ? (
        <p className="notebook-share__status" role="status">
          Sharing status unavailable
          <button type="button" onClick={onRetry} data-testid="notebook-share-retry">Retry</button>
        </p>
      ) : null}

      {status === 'loading' ? (
        <p className="notebook-share__status" role="status">Checking the share…</p>
      ) : null}

      {status === 'ready' && preview && publishable ? (
        <div className="notebook-share__preview" data-testid="notebook-share-preview">
          <p className="notebook-share__preview-label">What a reader will see</p>
          <NotebookEssay snapshot={preview} compact />
        </div>
      ) : null}

      {status === 'ready' && !publishable ? (
        <p className="notebook-share__hint" data-testid="notebook-share-silence">
          Nothing to share yet.
        </p>
      ) : null}

      {status === 'ready' && share?.shared ? (
        <>
          <label className="notebook-share__url-label" htmlFor={`notebook-share-url-${notebookId}`}>
            Shared link
          </label>
          <input
            id={`notebook-share-url-${notebookId}`}
            ref={urlRef}
            className="notebook-share__url"
            data-testid="notebook-share-url"
            readOnly
            value={href}
            onFocus={(event) => event.target.select()}
          />
          <p className="notebook-share__hint">{NOTEBOOK_SHARE_REVOKE}</p>
          <div className="notebook-share__actions">
            <button type="button" onClick={copyLink} data-testid="notebook-copy-link">
              {copied ? 'Link copied' : 'Copy link'}
            </button>
            {selectHint ? (
              <button
                type="button"
                onClick={() => { urlRef.current?.focus(); urlRef.current?.select(); }}
                data-testid="notebook-select-link"
              >
                Select and copy this link
              </button>
            ) : null}
            <a
              className="notebook-share__open"
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="notebook-open-shared"
            >
              Open shared note
            </a>
            {share.stale ? (
              <button
                type="button"
                onClick={onUpdate}
                disabled={Boolean(busy)}
                data-testid="notebook-update-share"
              >
                {busy === 'update' ? 'Updating…' : 'Update shared version'}
              </button>
            ) : null}
            <button
              type="button"
              onClick={onStop}
              disabled={Boolean(busy)}
              data-testid="notebook-unpublish"
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
            data-testid="notebook-publish"
          >
            {busy === 'create' ? 'Creating…' : 'Create share link'}
          </button>
        </div>
      ) : null}

      {error ? (
        <p className="notebook-share__error" role="status">
          {error}
          <button type="button" onClick={onRetry} data-testid="notebook-share-retry-error">Retry</button>
        </p>
      ) : null}
    </section>
  );
}

export default function NotebookShare({ notebookId }) {
  const [status, setStatus] = useState('loading');
  const [share, setShare] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setStatus('loading');
    setError('');
    try {
      const found = await getNotebookShare(notebookId);
      setShare(found);
      setStatus('ready');
    } catch (_loadError) {
      setShare(null);
      setStatus('unavailable');
    }
  }, [notebookId]);

  useEffect(() => {
    setBusy('');
    load();
  }, [notebookId, load]);

  const run = useCallback(async (label, work) => {
    if (busy) return;
    setBusy(label);
    setError('');
    try {
      const next = await work();
      if (next) setShare(next);
      setStatus('ready');
    } catch (actionError) {
      setError(actionErrorOf(actionError, 'That share did not complete.'));
    } finally {
      setBusy('');
    }
  }, [busy]);

  return (
    <NotebookSharePanel
      notebookId={notebookId}
      status={status}
      share={share}
      busy={busy}
      error={error}
      onRetry={load}
      onCreate={() => run('create', () => publishNotebookShare(notebookId, {
        previewHash: share?.currentHash
      }))}
      onUpdate={() => run('update', () => updateNotebookShare(notebookId, {
        previewHash: share?.currentHash
      }))}
      onStop={() => run('stop', async () => {
        await revokeNotebookShare(notebookId);
        return {
          shared: false,
          slug: '',
          publishable: share?.publishable,
          preview: share?.preview || null,
          currentHash: share?.currentHash || '',
          ownerDisplayName: share?.ownerDisplayName || ''
        };
      })}
    />
  );
}
