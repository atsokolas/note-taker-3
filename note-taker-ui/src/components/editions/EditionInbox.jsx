import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { getEditionInbox, saveEditionItemLater, setEditionItemState } from '../../api/editions';
import { issueLine } from '../../pages/editionModel';

/**
 * What arrived, before the papers themselves.
 *
 * Compact rows, not a second broadsheet. The finding and its boundary live
 * in the issue; this only asks what to do with the arrival.
 */

const LATER = '/library?scope=later';
const rowKey = (row) => `${row.editionId}:${row.itemId}`;

const filedLine = (row) => {
  if (!row.filedAt) return '';
  const date = new Date(row.filedAt);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

const metaLine = (row) => [
  row.sourceLabel,
  row.sourceDate || filedLine(row),
  row.profileLabel,
  issueLine(row)
].filter(Boolean).join(' · ');

const Head = () => (
  <header className="edition-inbox__head">
    <h2>New</h2>
    <Link to={LATER}>Later</Link>
  </header>
);

const EditionInbox = () => {
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(0);
  const [busy, setBusy] = useState('');
  const [receipt, setReceipt] = useState(null);
  const [undo, setUndo] = useState(null);
  const [more, setMore] = useState(0);
  const held = useRef(new Set());
  const nextCursor = useRef('');

  const absorb = useCallback((page, { replace = false } = {}) => {
    const incoming = page.items || [];
    nextCursor.current = page.nextCursor || '';
    setMore(page.remaining || 0);
    setItems((current) => {
      const base = replace || !current ? [] : current;
      const seen = new Set(base.map(rowKey));
      const added = incoming.filter(row => !seen.has(rowKey(row)));
      added.forEach(row => held.current.add(rowKey(row)));
      return replace ? incoming : [...base, ...added];
    });
  }, []);

  const load = useCallback(async ({ cursor = '', replace = false } = {}) => {
    setError('');
    try {
      absorb(await getEditionInbox({ cursor }), { replace });
    } catch (loadError) {
      setError(loadError?.response?.data?.error || 'New items did not load.');
      if (!cursor) setItems((current) => current || []);
    }
  }, [absorb]);

  useEffect(() => { load({ replace: true }); }, [load]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      getEditionInbox()
        .then((page) => {
          const unseen = (page.items || []).filter(row => !held.current.has(rowKey(row)));
          if (unseen.length) setPending(unseen.length);
        })
        .catch(() => {});
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  const act = async (row, label, work) => {
    const key = `${rowKey(row)}:${label}`;
    if (busy) return;
    setBusy(key);
    setError('');
    try {
      await work();
      held.current.delete(rowKey(row));
      setItems(current => (current || []).filter(entry => rowKey(entry) !== rowKey(row)));
    } catch (actionError) {
      setError(actionError?.response?.data?.error || actionError?.message || 'That did not complete.');
    } finally {
      setBusy('');
    }
  };

  const dismiss = (row) => act(row, 'dismiss', async () => {
    await setEditionItemState(row.editionId, row.itemId, 'dismissed');
    setUndo(row);
    setReceipt(null);
  });

  const undoDismiss = async () => {
    if (!undo || busy) return;
    const row = undo;
    setBusy('undo');
    try {
      await setEditionItemState(row.editionId, row.itemId, 'new');
      held.current.add(rowKey(row));
      setItems(current => [row, ...(current || [])]);
      setUndo(null);
    } catch (actionError) {
      setError(actionError?.response?.data?.error || 'Could not restore that item.');
    } finally {
      setBusy('');
    }
  };

  const later = (row) => act(row, 'later', async () => {
    const result = await saveEditionItemLater(row.editionId, row.itemId);
    if (result?.placed === false) {
      throw new Error(result.error || 'Saved to Library; could not move to Later — Retry');
    }
    setUndo(null);
    setReceipt({ fromSetAside: Boolean(result?.fromSetAside) });
  });

  return (
    <section className="edition-inbox" aria-label="New">
      <Head />

      {error ? (
        <p className="edition-inbox__status">
          {error}
          <button type="button" onClick={() => load({ replace: true })}>Retry</button>
        </p>
      ) : null}

      {pending ? (
        <p className="edition-inbox__status">
          <button type="button" onClick={() => { setPending(0); load({ replace: true }); }}>
            {`Show ${pending} new item${pending === 1 ? '' : 's'}`}
          </button>
        </p>
      ) : null}

      {receipt ? (
        <p className="edition-inbox__status">
          {receipt.fromSetAside ? 'Moved to Later' : 'Saved for later'}
          {' · '}
          <Link to={LATER}>Open Later</Link>
        </p>
      ) : null}

      {undo ? (
        <p className="edition-inbox__status">
          Dismissed.
          <button type="button" onClick={undoDismiss} disabled={Boolean(busy)}>Undo</button>
        </p>
      ) : null}

      {error || items === null ? null : items.length === 0 ? (
        <p className="edition-inbox__empty">No new items</p>
      ) : (
        <ul className="edition-inbox__list">
          {items.map((row) => {
            const key = rowKey(row);
            const meta = metaLine(row);
            return (
              <li key={key} className="edition-inbox__row">
                <p className="edition-inbox__title">{row.title}</p>
                {meta ? <p className="edition-inbox__meta">{meta}</p> : null}
                <p className="edition-inbox__actions">
                  <Link to={`/editions/${row.editionId}?item=${encodeURIComponent(row.itemId)}`}>
                    Read now
                  </Link>
                  <button type="button" onClick={() => later(row)} disabled={Boolean(busy)}>
                    {busy === `${key}:later` ? 'Saving…' : 'Save for later'}
                  </button>
                  <button
                    type="button"
                    className="edition-inbox__dismiss"
                    onClick={() => dismiss(row)}
                    disabled={Boolean(busy)}
                  >
                    Dismiss
                  </button>
                </p>
              </li>
            );
          })}
        </ul>
      )}

      {more && !pending ? (
        <p className="edition-inbox__status">
          <button type="button" onClick={() => load({ cursor: nextCursor.current })}>
            {`Show ${more} new items`}
          </button>
        </p>
      ) : null}
    </section>
  );
};

export default EditionInbox;
