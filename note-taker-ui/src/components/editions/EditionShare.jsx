import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  getEditionShare,
  revokeEditionShare,
  shareEdition,
  updateEditionShare
} from '../../api/editions';
import { datelineLine, issueLine } from '../../pages/editionModel';
import EditionPaper from './EditionPaper';

/**
 * Share, on the newsstand and on the full issue.
 *
 * One panel. The issue id is the whole state: turning to another back issue
 * remounts this, so a previous URL cannot linger. The preview is what a
 * stranger will read; creating the link freezes that version.
 */

const PRIVACY = 'Anyone with the link can read the version you share. Your Library and reading activity stay private.';

const shareHref = (slug) => (
  typeof window === 'undefined' ? `/share/editions/${slug}` : `${window.location.origin}/share/editions/${slug}`
);

const actionErrorOf = (error, fallback) => (
  error?.response?.data?.error || error?.message || fallback
);

const EditionShare = ({ editionId, edition = null }) => {
  const rootRef = useRef(null);
  const urlRef = useRef(null);
  const [status, setStatus] = useState('loading');
  const [share, setShare] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [selectHint, setSelectHint] = useState(false);

  const load = useCallback(async () => {
    setStatus('loading');
    setError('');
    try {
      const found = await getEditionShare(editionId);
      setShare(found);
      setStatus('ready');
    } catch (_loadError) {
      setShare(null);
      setStatus('unavailable');
    }
  }, [editionId]);

  useEffect(() => {
    setCopied(false);
    setSelectHint(false);
    setBusy('');
    load();
  }, [editionId, load]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const close = () => {
      if (!root.open) return;
      root.open = false;
      root.querySelector('summary')?.focus();
    };
    const onKey = (event) => {
      if (event.key === 'Escape') close();
    };
    const onPointer = (event) => {
      if (!root.contains(event.target)) close();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, []);

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

  const create = () => run('create', () => shareEdition(editionId, {
    previewHash: share?.currentHash
  }));

  const update = () => run('update', () => updateEditionShare(editionId, {
    previewHash: share?.currentHash
  }));

  const stop = () => run('stop', async () => {
    await revokeEditionShare(editionId);
    setCopied(false);
    setSelectHint(false);
    return {
      shared: false,
      slug: '',
      preview: share?.preview || null,
      currentHash: share?.currentHash || '',
      ownerDisplayName: share?.ownerDisplayName || ''
    };
  });

  const copyLink = async () => {
    const href = shareHref(share?.slug);
    try {
      await navigator.clipboard.writeText(href);
      setCopied(true);
      setSelectHint(false);
      window.setTimeout(() => setCopied(false), 2200);
    } catch (_copyError) {
      setCopied(false);
      setSelectHint(true);
      urlRef.current?.focus();
      urlRef.current?.select();
    }
  };

  const selectLink = () => {
    urlRef.current?.focus();
    urlRef.current?.select();
  };

  const title = edition?.title || share?.preview?.title || 'This issue';
  const when = [issueLine(edition || share?.preview || {}), datelineLine(edition || share?.preview || {})]
    .filter(Boolean)
    .join(' · ');
  const href = share?.shared && share?.slug ? shareHref(share.slug) : '';
  const preview = share?.preview || share?.snapshot || null;

  return (
    <details ref={rootRef} className="edition-share">
      <summary data-testid="edition-share-open">Share</summary>
      <div className="edition-share__panel" role="group" aria-label="Share this edition">
        <p className="edition-share__kicker">{title}{when ? ` · ${when}` : ''}</p>
        <p className="edition-share__privacy">{PRIVACY}</p>

        {status === 'unavailable' ? (
          <p className="edition-share__status" role="status">
            Sharing status unavailable
            <button type="button" onClick={load} data-testid="edition-share-retry">Retry</button>
          </p>
        ) : null}

        {status === 'loading' ? (
          <p className="edition-share__status" role="status">Checking the share…</p>
        ) : null}

        {status === 'ready' && preview ? (
          <div className="edition-share__preview" data-testid="edition-share-preview">
            <p className="edition-share__preview-label">Preview</p>
            <EditionPaper edition={preview} compact />
          </div>
        ) : null}

        {status === 'ready' && share?.shared ? (
          <>
            <label className="edition-share__url-label" htmlFor={`edition-share-url-${editionId}`}>
              Shared link
            </label>
            <input
              id={`edition-share-url-${editionId}`}
              ref={urlRef}
              className="edition-share__url"
              data-testid="edition-share-url"
              readOnly
              value={href}
              onFocus={event => event.target.select()}
            />
            <div className="edition-share__actions">
              <button
                type="button"
                className="edition__share-copy"
                onClick={copyLink}
                data-testid="edition-copy-link"
              >
                {copied ? 'Link copied' : 'Copy link'}
              </button>
              {selectHint ? (
                <button
                  type="button"
                  className="edition__share-copy"
                  onClick={selectLink}
                  data-testid="edition-select-link"
                >
                  Select and copy this link
                </button>
              ) : null}
              <a
                className="edition-share__open"
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="edition-open-shared"
              >
                Open shared edition
              </a>
              {share.stale ? (
                <button
                  type="button"
                  className="edition__share-copy"
                  onClick={update}
                  disabled={Boolean(busy)}
                  data-testid="edition-update-share"
                >
                  {busy === 'update' ? 'Updating…' : 'Update shared version'}
                </button>
              ) : null}
              <button
                type="button"
                className="edition__share-revoke"
                onClick={stop}
                disabled={Boolean(busy)}
                data-testid="edition-unpublish"
              >
                {busy === 'stop' ? 'Stopping…' : 'Stop sharing'}
              </button>
            </div>
          </>
        ) : null}

        {status === 'ready' && !share?.shared ? (
          <div className="edition-share__actions">
            <button
              type="button"
              className="edition__share-copy"
              onClick={create}
              disabled={Boolean(busy)}
              data-testid="edition-publish"
            >
              {busy === 'create' ? 'Creating…' : 'Create share link'}
            </button>
          </div>
        ) : null}

        {error ? (
          <p className="edition-share__error" role="status">
            {error}
            <button type="button" onClick={load} data-testid="edition-share-retry-error">Retry</button>
          </p>
        ) : null}
      </div>
    </details>
  );
};

export default EditionShare;
