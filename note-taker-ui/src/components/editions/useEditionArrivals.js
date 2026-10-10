import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getEditionInbox,
  saveEditionItem,
  saveEditionItemLater,
  setEditionItemState
} from '../../api/editions';

const rowKey = (row) => `${row.editionId}:${row.itemId}`;

/**
 * What is new, across every paper or narrowed to one paper and one hand.
 * Every choice is durable on the server, so a finding decided here is decided
 * everywhere, and Seen can be undone.
 */
export default function useEditionArrivals({ limit = 40, paper = '', by = '' } = {}) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [receipt, setReceipt] = useState(null);
  const [undo, setUndo] = useState(null);
  const [more, setMore] = useState(0);
  const nextCursor = useRef('');

  const load = useCallback(async ({ cursor = '', replace = false } = {}) => {
    setError('');
    try {
      const page = await getEditionInbox({ cursor, limit, view: 'power', paper, by });
      nextCursor.current = page.nextCursor || '';
      setMore(page.remaining || 0);
      setItems((current) => {
        const base = replace || !current ? [] : current;
        const held = new Set(base.map(rowKey));
        return [...base, ...(page.items || []).filter(row => !held.has(rowKey(row)))];
      });
    } catch (loadError) {
      setError(loadError?.response?.data?.error || 'New findings did not load.');
      if (!cursor) setItems((current) => current || []);
    }
  }, [limit, paper, by]);

  useEffect(() => { load({ replace: true }); }, [load]);

  const act = async (row, label, work) => {
    if (busy) return false;
    setBusy(`${rowKey(row)}:${label}`);
    setError('');
    try {
      await work();
      setItems(current => (current || []).filter(entry => rowKey(entry) !== rowKey(row)));
      return true;
    } catch (actionError) {
      setError(actionError?.response?.data?.error || actionError?.message || 'That did not complete.');
      return false;
    } finally {
      setBusy('');
    }
  };

  const seen = row => act(row, 'seen', async () => {
    await setEditionItemState(row.editionId, row.itemId, 'opened');
    setUndo({ row });
    setReceipt(null);
  });

  const later = row => act(row, 'later', async () => {
    const result = await saveEditionItemLater(row.editionId, row.itemId);
    if (result?.placed === false) {
      throw new Error(result.error || 'Saved to Library; could not move to Later — Retry');
    }
    setUndo(null);
    setReceipt({ action: 'later', row, fromSetAside: Boolean(result?.fromSetAside) });
  });

  const keep = row => act(row, 'keep', async () => {
    if (!row.savedArticleId) await saveEditionItem(row.editionId, row.itemId);
    try {
      await setEditionItemState(row.editionId, row.itemId, 'opened');
    } catch (_error) {
      throw new Error('Saved to Library, but New could not clear. Choose Seen to finish.');
    }
    setUndo(null);
    setReceipt({ action: 'kept', row });
  });

  const undoChoice = async () => {
    if (!undo || busy) return false;
    const { row } = undo;
    setBusy('undo');
    setError('');
    try {
      await setEditionItemState(row.editionId, row.itemId, 'new');
      setItems(current => [row, ...(current || [])]);
      setUndo(null);
      return true;
    } catch (actionError) {
      setError(actionError?.response?.data?.error || 'That did not save.');
      return false;
    } finally {
      setBusy('');
    }
  };

  return {
    items,
    error,
    busy,
    receipt,
    undo,
    more,
    load,
    loadMore: () => load({ cursor: nextCursor.current }),
    seen,
    later,
    keep,
    undoChoice
  };
}

export { rowKey };
