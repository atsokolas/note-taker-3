import { useCallback, useEffect, useRef, useState } from 'react';
import { getEdition, saveEditionItem, saveEditionItemLater } from '../../api/editions';
import api from '../../api';
import { getAuthHeaders } from '../../hooks/useAuthHeaders';
import { stateOf } from '../../pages/editionModel';

export default function useEditionIssue(id) {
  const [edition, setEdition] = useState(null);
  const [pending, setPending] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [receipts, setReceipts] = useState({});
  const held = useRef(null);
  const readerPatches = useRef(new Map());
  const checkedSources = useRef(new Set());
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    let fetching = false;
    const refresh = async () => {
      if (fetching || document.visibilityState === 'hidden') return;
      fetching = true;
      try {
        const response = await getEdition(id);
        const found = {
          ...response,
          items: response.items.map((item) => ({
            ...item,
            ...readerPatches.current.get(item.itemId)
          }))
        };
        if (!active.current) return;
        if (!held.current) {
          held.current = found;
          setEdition(found);
        } else if (JSON.stringify(found) !== JSON.stringify(held.current)) setPending(found);
        setError('');
      } catch (_) {
        if (active.current) setError('This issue could not refresh. Your reading stays here.');
      } finally {
        fetching = false;
      }
    };
    refresh();
    const interval = window.setInterval(() => {
      if (!held.current || stateOf(held.current) !== 'closed') refresh();
    }, 60000);
    return () => {
      active.current = false;
      window.clearInterval(interval);
    };
  }, [id]);
  useEffect(() => {
    for (const item of edition?.items || []) {
      if (!item.savedArticleId || checkedSources.current.has(item.savedArticleId)) continue;
      checkedSources.current.add(item.savedArticleId);
      api
        .get(`/articles/${encodeURIComponent(item.savedArticleId)}`, getAuthHeaders())
        .then(({ data }) => {
          if (active.current && !String(data?.content || '').trim())
            setReceipts((current) => ({
              ...current,
              [item.itemId]: { ...current[item.itemId], unreadable: true }
            }));
        })
        .catch(() => {
          checkedSources.current.delete(item.savedArticleId);
        });
    }
  }, [edition]);
  const showPending = () => {
    held.current = pending;
    setEdition(pending);
    setPending(null);
  };
  const act = useCallback(
    async (itemId, kind) => {
      if (busy) return false;
      setBusy(`${itemId}:${kind}`);
      setError('');
      try {
        const result = await (kind === 'keep' ? saveEditionItem : saveEditionItemLater)(id, itemId);
        if (!active.current) return false;
        // A save response can include new agent filings. Only absorb the reader's
        // action; the full refreshed paper still waits for an explicit Show.
        const changed = result?.edition?.items?.find((item) => item.itemId === itemId);
        if (changed) {
          const patch = {
            savedArticleId: changed.savedArticleId,
            readerStatus: changed.readerStatus
          };
          readerPatches.current.set(itemId, patch);
          setEdition((current) => {
            const next = {
              ...current,
              items: current.items.map((item) =>
                item.itemId === itemId ? { ...item, ...patch } : item
              )
            };
            held.current = next;
            return next;
          });
          setPending((current) =>
            current
              ? {
                  ...current,
                  items: current.items.map((item) =>
                    item.itemId === itemId ? { ...item, ...patch } : item
                  )
                }
              : current
          );
        }
        setReceipts((current) => ({
          ...current,
          [itemId]: {
            ...current[itemId],
            unreadable: result?.readable === false || current[itemId]?.unreadable,
            kept: kind === 'keep' || current[itemId]?.kept
          }
        }));
        if (result?.placed === false) {
          setError(result.error || 'Saved in Library; Later did not complete. Please retry Later.');
          return false;
        }
        return true;
      } catch (err) {
        if (active.current)
          setError(err?.response?.data?.error || 'That did not save. Please retry.');
        return false;
      } finally {
        if (active.current) setBusy('');
      }
    },
    [id, busy]
  );
  return { edition, pending, error, busy, receipts, act, showPending };
}
