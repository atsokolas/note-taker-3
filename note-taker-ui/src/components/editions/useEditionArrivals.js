import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getEditionInbox,
  saveEditionItem,
  saveEditionItemLater,
  setEditionItemState
} from '../../api/editions';

const rowKey = (row) => `${row.editionId}:${row.itemId}`;

/** One durable queue, shared by the compact inbox and Power through. */
export default function useEditionArrivals({ limit, view = '' } = {}) {
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
      absorb(await getEditionInbox({ cursor, limit, view }), { replace });
    } catch (loadError) {
      setError(loadError?.response?.data?.error || 'New items did not load.');
      if (!cursor) setItems((current) => current || []);
    }
  }, [absorb, limit, view]);

  useEffect(() => { load({ replace: true }); }, [load]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      getEditionInbox({ limit, view })
        .then((page) => {
          const unseen = (page.items || []).filter(row => !held.current.has(rowKey(row)));
          if (unseen.length) setPending(unseen.length);
        })
        .catch(() => {});
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [limit, view]);

  const act = async (row, label, work) => {
    const key = `${rowKey(row)}:${label}`;
    if (busy) return false;
    setBusy(key);
    setError('');
    try {
      await work();
      held.current.delete(rowKey(row));
      setItems(current => (current || []).filter(entry => rowKey(entry) !== rowKey(row)));
      return true;
    } catch (actionError) {
      setError(actionError?.response?.data?.error || actionError?.message || 'That did not complete.');
      return false;
    } finally {
      setBusy('');
    }
  };

  const mark = (row, status, label) => act(row, label, async () => {
    await setEditionItemState(row.editionId, row.itemId, status);
    setUndo({ row, label });
    setReceipt(null);
  });

  const dismiss = row => mark(row, 'dismissed', 'dismiss');
  const seen = row => mark(row, 'opened', 'seen');

  const later = row => act(row, 'later', async () => {
    const result = await saveEditionItemLater(row.editionId, row.itemId);
    if (result?.placed === false) {
      throw new Error(result.error || 'Saved to Library; could not move to Later — Retry');
    }
    setUndo(null);
    setReceipt({ action: 'later', fromSetAside: Boolean(result?.fromSetAside) });
  });

  const keep = row => act(row, 'keep', async () => {
    if (!row.savedArticleId) await saveEditionItem(row.editionId, row.itemId);
    try {
      await setEditionItemState(row.editionId, row.itemId, 'opened');
    } catch (_error) {
      throw new Error('Saved to Library, but New could not clear. Choose Seen to finish.');
    }
    setUndo(null);
    setReceipt({ action: 'kept' });
  });

  const undoChoice = async () => {
    if (!undo || busy) return false;
    const { row } = undo;
    setBusy('undo');
    setError('');
    try {
      await setEditionItemState(row.editionId, row.itemId, 'new');
      held.current.add(rowKey(row));
      setItems(current => [row, ...(current || [])]);
      setUndo(null);
      return true;
    } catch (actionError) {
      setError(actionError?.response?.data?.error || 'Could not restore that item.');
      return false;
    } finally {
      setBusy('');
    }
  };

  return {
    items,
    error,
    pending,
    busy,
    receipt,
    undo,
    more,
    load,
    loadMore: () => load({ cursor: nextCursor.current }),
    showPending: () => { setPending(0); load({ replace: true }); },
    dismiss,
    seen,
    later,
    keep,
    undoChoice
  };
}

export { rowKey };
