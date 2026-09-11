import { useCallback, useEffect, useRef, useState } from 'react';
import authoredExplorations, { authoredWorkError as messageFor } from '../../../api/authoredExplorations';
import { keepsClosedDraft } from './openSentenceModel';

const mutationId = () => window.crypto?.randomUUID?.()
  || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const itemIdOf = row => row?.highlightId || row?.claimId;
const cacheKey = (owner, scopeId) => `noeis.open-sentence.account.${owner}.${scopeId}`;

// Every mutation offers the same review path for an authoritative version.
const conflictFrom = (error, itemId) => {
  const current = error?.response?.data?.current;
  return error?.response?.status === 409 && itemIdOf(current) === itemId
    && Number.isInteger(current.revision) && current.revision > 0 && current.draft
    ? current : null;
};

// Keep the authored fields together. Source snapshots and temporary reading
// controls come from their own authorities, not a second copy of the Wiki.
// Empty optional fields match the server's omission; opening is not an edit.
export const explorationDraft = (value = {}) => ({ ...Object.fromEntries([
  'title', 'writing', 'originalText', 'provisionalText', 'question', 'returnNote',
  'mark', 'placed', 'pressure', 'meet', 'essay', 'proposal', 'selectedSource',
  'distinction', 'distinctionAt', 'distinctionAgainst', 'instrument', 'exhibit', 'rehearsal', 'unwritten', 'carry', 'contributions', 'rearranged', 'without', 'withoutSource'
].filter(key => value[key] !== undefined && value[key] !== null && (!['distinction', 'distinctionAt', 'distinctionAgainst', 'rearranged', 'without', 'withoutSource'].includes(key) || Boolean(value[key]))).map(key => [key, value[key]])),
  ...(value.authoredAgainst ? { originalText: value.authoredAgainst } : {})
});

const readCache = (key) => {
  try {
    const cached = JSON.parse(window.localStorage.getItem(key) || '{}');
    return cached && typeof cached === 'object' && !Array.isArray(cached) ? cached : {};
  }
  catch { return {}; }
};

export default function useAuthoredExplorations({ scopeId, cacheScope = scopeId, enabled, api = authoredExplorations }) {
  const [view, setView] = useState({ loading: Boolean(enabled), owner: '', records: {}, error: '' });
  const session = useRef(null);
  const [loadAttempt, setLoadAttempt] = useState(0);

  const publish = useCallback((current) => {
    const records = { ...current.records };
    if (current.owner) {
      try {
        // The server owns saved copies. Keep only unsaved words and the exact
        // request needed to recover an uncertain save, even after more typing.
        const drafts = Object.fromEntries(Object.entries(records)
          .filter(([, record]) => record.dirty)
          .map(([itemId, { draft, revision, pending, keepIds }]) => [itemId, {
            draft, revision, dirty: true,
            ...(pending ? { pending } : {}),
            ...(keepIds ? { keepIds } : {})
          }]));
        const key = cacheKey(current.owner, current.cacheScope);
        if (Object.keys(drafts).length) window.localStorage.setItem(key, JSON.stringify(drafts));
        else window.localStorage.removeItem(key);
        current.deviceSaved = true;
      } catch {
        current.deviceSaved = false;
      }
    }
    if (session.current !== current) return;
    setView({ loading: current.loading, owner: current.owner, records, error: current.error, deviceSaved: current.deviceSaved });
  }, []);

  const flush = useCallback(async (current, itemId) => {
    const record = current.records[itemId];
    if (!record || current.loading || record.saving || record.conflict || !record.dirty) return;
    const sent = record.pending || {
      expectedRevision: record.revision || 0,
      mutationId: mutationId(),
      draft: record.draft
    };
    record.pending = sent;
    record.saving = true;
    record.error = '';
    publish(current);
    try {
      const saved = await api.save(current.scopeId, itemId, sent);
      const unchanged = JSON.stringify(record.draft) === JSON.stringify(sent.draft);
      record.revision = saved.revision;
      record.saved = saved;
      record.pending = null;
      record.dirty = !unchanged;
      if (unchanged) record.draft = saved.draft;
    } catch (error) {
      record.error = messageFor(error);
      const status = error?.response?.status;
      record.conflict = conflictFrom(error, itemId);
      // A rejected validation did not write. A transport/server failure may
      // have written, so its exact mutation remains available for replay.
      if (status >= 400 && status < 500) record.pending = null;
    } finally {
      record.saving = false;
      publish(current);
    }
    if (record.dirty && !record.error && !record.conflict) {
      return flush(current, itemId);
    }
    return record;
  }, [api, publish]);

  useEffect(() => {
    const current = { scopeId, cacheScope, owner: '', loading: Boolean(enabled), records: {}, error: '', timers: new Map() };
    session.current = current;
    publish(current);
    if (enabled && scopeId) {
      api.load(scopeId).then(({ explorations = [], userId }) => {
        if (session.current !== current) return;
        if (!userId) throw new Error('The saved work could not be bound to your account.');
        current.owner = String(userId);
        const cached = readCache(cacheKey(current.owner, cacheScope));
        for (const saved of explorations) {
          current.records[itemIdOf(saved)] = { draft: saved.draft, revision: saved.revision, saved, dirty: false };
        }
        for (const [itemId, local] of Object.entries(cached)) {
          if (!local?.dirty || !local?.draft) continue;
          const serverRecord = current.records[itemId];
          current.records[itemId] = {
            ...local,
            // The local draft keeps its own revision so a later save still
            // conflicts honestly. Server-known Keep reservations remain
            // available for recovery even while those local words are dirty.
            ...(serverRecord?.saved ? { saved: serverRecord.saved } : {}),
            saving: false,
            error: '',
            conflict: null
          };
        }
        current.loading = false;
        publish(current);
        Object.keys(current.records).forEach(itemId => { void flush(current, itemId); });
      }).catch(error => {
        if (session.current !== current) return;
        current.loading = false;
        current.error = error.message || messageFor(error);
        publish(current);
      });
    }
    return () => {
      current.timers.forEach(clearTimeout);
      // Finish an already authored change even when the reader leaves. Its
      // account and page stay captured; it cannot update the next page's view.
      Object.keys(current.records).forEach(itemId => { void flush(current, itemId); });
      if (session.current === current) session.current = null;
    };
  }, [api, cacheScope, enabled, flush, loadAttempt, scopeId, publish]);

  const change = useCallback((itemId, exploration) => {
    const current = session.current;
    if (!current?.owner || current.loading) return;
    const draft = explorationDraft(exploration);
    const prior = current.records[itemId];
    if (!prior && !keepsClosedDraft(exploration, { preserveAuthorship: true })) return;
    if (prior && JSON.stringify(prior.draft) === JSON.stringify(draft)) return;
    const record = prior || { revision: 0 };
    record.draft = draft;
    record.dirty = true;
    current.records[itemId] = record;
    clearTimeout(current.timers.get(itemId));
    current.timers.set(itemId, setTimeout(() => { void flush(current, itemId); }, 450));
    publish(current);
  }, [flush, publish]);

  const retry = useCallback((itemId) => {
    const current = session.current;
    if (current) void flush(current, itemId);
  }, [flush]);

  const keep = useCallback(async (itemId, destination) => {
    const current = session.current;
    const record = current?.records[itemId];
    if (!record) throw new Error('Write something to keep first.');
    if (record.saving) throw new Error('Your words are still saving. Try Keep when saving finishes.');
    const reserved = record.saved?.keeps?.find(item => (
      item.destination === destination && item.mutationId
    ));
    // A fresh Keep never races ahead of its words. A server-known reservation
    // already owns an immutable click-time snapshot, so recovering it must not
    // attempt to save or replace newer local/conflicted writing first.
    if (!reserved) {
      await flush(current, itemId);
      if (record.dirty || record.error || record.conflict) throw new Error(record.error || 'Save this version before keeping it.');
    }
    record.keepIds = record.keepIds || {};
    record.keepIds[destination] = reserved?.mutationId || record.keepIds[destination] || mutationId();
    publish(current);
    const savedDraftBeforeKeep = JSON.stringify(record.saved?.draft || {});
    let result;
    try {
      result = await api.keep(current.scopeId, itemId, {
        expectedRevision: record.revision,
        mutationId: record.keepIds[destination],
        destination
      });
    } catch (error) {
      const failure = error?.response?.data;
      if (failure?.code === 'keep_pending' && itemIdOf(failure.current) === itemId) {
        // The server has acknowledged a reserved copy, even though finishing
        // it failed. Keep that recovery door without granting newer save authority.
        record.saved = failure.current;
        publish(current);
      } else {
        const conflict = conflictFrom(error, itemId);
        if (conflict) {
          record.conflict = conflict;
          publish(current);
        }
      }
      throw error;
    }
    if (result.exploration) {
      const preserveLocal = Boolean(record.dirty || record.error || record.conflict || record.pending);
      const returnedDraftChanged = JSON.stringify(result.exploration.draft || {}) !== savedDraftBeforeKeep;
      record.saved = result.exploration;
      if (preserveLocal) {
        if (returnedDraftChanged && !record.conflict) record.conflict = result.exploration;
      } else {
        record.revision = result.exploration.revision;
        record.draft = result.exploration.draft;
      }
    }
    publish(current);
    return result;
  }, [api, flush, publish]);

  const discard = useCallback(async (itemId) => {
    const current = session.current;
    const record = current?.records[itemId];
    if (!record) return;
    clearTimeout(current.timers.get(itemId));
    if (record.saving) throw new Error('Wait for the current save before discarding this exploration.');
    if (record.conflict) throw new Error('Review the saved version before discarding this exploration.');
    // Revision zero with no ambiguous mutation exists only on this device.
    // Clearing it locally avoids sending a wildcard-like delete that could
    // remove a server version created concurrently in another session.
    if (!record.revision && !record.pending) {
      delete current.records[itemId];
      publish(current);
      return;
    }
    if (record.pending) {
      await flush(current, itemId);
      if (record.error) throw new Error(record.error);
    }
    try {
      await api.discard(current.scopeId, itemId, record.revision || 0);
    } catch (error) {
      const conflict = conflictFrom(error, itemId);
      if (conflict) {
        record.conflict = conflict;
        publish(current);
      }
      throw error;
    }
    delete current.records[itemId];
    publish(current);
  }, [api, flush, publish]);

  const resolveConflict = useCallback((itemId, useLocal) => {
    const current = session.current;
    const record = current?.records[itemId];
    const saved = record?.conflict;
    if (!saved?.revision || !saved?.draft) return;
    record.revision = saved.revision;
    record.saved = saved;
    record.pending = null;
    record.conflict = null;
    record.error = '';
    record.dirty = Boolean(useLocal);
    if (!useLocal) record.draft = saved.draft;
    publish(current);
    if (useLocal) void flush(current, itemId);
  }, [flush, publish]);

  const retryLoad = useCallback(() => setLoadAttempt(value => value + 1), []);
  const restoreWriting = useCallback((itemId, { fields, revision }) => {
    const current = session.current;
    const record = current?.records[itemId];
    if (!record?.saved || record.dirty || record.saving || record.error || record.conflict) {
      throw new Error('Finish saving and resolve changes before bringing another version in.');
    }
    const draft = { ...record.draft, ...fields };
    if (revision !== record.revision) {
      record.conflict = record.saved;
      record.draft = draft;
      record.dirty = true;
      record.revision = revision;
      publish(current);
    } else change(itemId, draft);
  }, [change, publish]);
  return { ...view, change, retry, retryLoad, keep, discard, resolveConflict, restoreWriting };
}

export const authorshipFor = (work, itemId) => ({
  owner: work.owner,
  ready: Boolean(work.owner) && !work.loading,
  error: work.error,
  deviceSaved: work.deviceSaved,
  record: work.records[itemId],
  retry: () => work.retry(itemId),
  retryLoad: work.retryLoad,
  keep: destination => work.keep(itemId, destination),
  discard: () => work.discard(itemId),
  restoreWriting: version => work.restoreWriting(itemId, version),
  resolveConflict: useLocal => work.resolveConflict(itemId, useLocal)
});
