import apiClient from '../api';
import { plainTextFrom } from '../utils/editorialText';

export const workAccount = token => {
  try { return String(JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).id || ''); }
  catch (_) { return ''; }
};
export const localDay = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
export const draftKey = account => `noeis:work-drafts:${account}`;
export const operationId = () => window.crypto?.randomUUID?.() || `work-${Date.now()}-${Math.random().toString(36).slice(2)}`;
export const noteTitle = note => note?.title?.trim() || 'Untitled note';
export const noteDate = note => note?.occurredOn || '';
export const noteWords = note => note?.blocks?.length ? note.blocks.map(block => block.text || '').join('\n') : plainTextFrom(note?.content);
const body = note => ({ title: note.title || '', content: note.content || '', blocks: note.blocks || [], folder: note.folder?._id || note.folder || null, occurredOn: note.occurredOn, withText: note.withText || '' });
const message = error => error?.response?.data?.error || 'Sync paused. Retry when you are connected.';

// The server owns notes. This session holds only unacknowledged edits beside them.
export function createWorkSession({ token, api = apiClient, storage = localStorage }) {
  const account = workAccount(token), key = draftKey(account);
  let abort = new AbortController();
  const continuationKey = `${key}:continuation`;
  let continuation = null;
  const options = { skipAuthHandling: true, headers: { Authorization: `Bearer ${token}` }, signal: abort.signal };
  let saved = {}, drafts = {}, folders = [], disposed = false, tick = 0, loadError = '', loading = true;
  const listeners = new Set(), flights = new Map();
  try {
    const stored = JSON.parse(storage.getItem(key) || '{}');
    drafts = Object.fromEntries(Object.entries(stored).map(([id, draft]) => [draft.note._id || id, draft]));
    continuation = JSON.parse(storage.getItem(continuationKey) || 'null');
  } catch (_) { loadError = 'Device drafts could not be read. Keep this page open until your writing is saved.'; }
  const isCurrent = () => !disposed && Boolean(account) && workAccount(storage.getItem('token') || '') === account;
  const emit = () => { tick += 1; listeners.forEach(listener => listener()); };
  const persist = () => {
    try {
      storage.setItem(key, JSON.stringify(Object.fromEntries(Object.entries(drafts).filter(([, draft]) => draft.dirty))));
      Object.values(drafts).forEach(draft => { draft.durable = true; });
      return true;
    } catch (_) { Object.values(drafts).forEach(draft => { draft.durable = false; }); return false; }
  };
  Object.values(drafts).forEach(draft => { draft.durable = true; draft.saving = false; });
  const entry = id => drafts[id]?.note || saved[id];
  const edit = (id, patch) => {
    if (!isCurrent()) return;
    const current = entry(id); if (!current) return;
    const previous = drafts[id];
    drafts[id] = { ...previous, note: { ...current, ...patch }, version: (previous?.version || 0) + 1, dirty: true, error: '' };
    persist(); emit();
  };
  const capture = (values = {}) => {
    const id = `local-${operationId()}`;
    saved[id] = { title: '', content: '', blocks: [], folder: null, occurredOn: localDay(), withText: '', ...values };
    drafts[id] = { note: saved[id], operationId: operationId(), version: 0, dirty: false, durable: false };
    emit(); return id;
  };
  const flush = id => {
    if (flights.has(id)) return flights.get(id);
    const run = async () => {
      while (isCurrent() && drafts[id]?.dirty && !drafts[id].conflict) {
        const draft = drafts[id], version = draft.version, sent = draft.note, request = { ...options };
        draft.saving = true; draft.error = ''; emit();
        try {
          const creating = !sent._id;
          if (creating && !draft.createBody) { draft.createBody = body(sent); persist(); }
          const { data } = creating
            ? await api.post('/api/work-notes', { ...draft.createBody, operationId: draft.operationId }, request)
            : await api.put(`/api/work-notes/${sent._id}`, { ...body(sent), expectedRevision: sent.revision, ...(sent.workingState ? { workingState: { nextTimeLine: sent.workingState.nextTimeLine } } : {}) }, request);
          if (!isCurrent() || request.signal.aborted) return false;
          const latest = drafts[id];
          if (creating && data.revision > 0) {
            latest.conflict = data; latest.saving = false; persist(); emit(); return false;
          }
          saved[id] = data;
          if (latest.version === version && !creating) delete drafts[id];
          else latest.note = { ...data, ...latest.note, _id: data._id, revision: data.revision };
          persist(); emit();
        } catch (error) {
          if (!isCurrent() || request.signal.aborted) return false;
          const latest = drafts[id]; latest.saving = false;
          if (error?.response?.status === 409 && error.response.data?.current) latest.conflict = error.response.data.current;
          latest.error = error?.response?.status === 401 ? 'Sign in to sync.' : message(error);
          persist(); emit(); return false;
        }
      }
      return !drafts[id]?.dirty;
    };
    const promise = run().finally(() => flights.delete(id)); flights.set(id, promise); return promise;
  };
  return {
    account, entry, edit, capture, flush, isCurrent,
    resume() { if (disposed) { disposed = false; abort = new AbortController(); options.signal = abort.signal; } },
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); },
    snapshot: () => tick,
    entries: () => Object.entries({ ...saved, ...Object.fromEntries(Object.entries(drafts).map(([id, draft]) => [id, draft.note])) }).map(([id, note]) => ({ ...note, clientId: id })),
    folders: () => folders,
    loading: () => loading,
    error: () => loadError,
    async load() {
      const request = { ...options };
      loading = true; loadError = ''; emit();
      try {
        const { data } = await api.get('/api/work-notes', request); if (!isCurrent() || request.signal.aborted) return;
        for (const note of data.entries) {
          const id = Object.keys(saved).find(key => saved[key]._id === note._id) || note._id;
          if (!saved[id] || saved[id].revision < note.revision) saved[id] = note;
        }
        folders = data.folders;
      } catch (error) { if (isCurrent() && !request.signal.aborted) loadError = message(error); }
      finally { if (isCurrent() && !request.signal.aborted) { loading = false; emit(); } }
    },
    async addFolder(name) {
      if (!isCurrent()) return null;
      const { data } = await api.post('/api/work-notes/folders', { name }, options);
      if (!isCurrent()) return null; folders = [...folders, data]; emit(); return data;
    },
    continuation: () => continuation,
    async continueFrom(source, intent) {
      if (!isCurrent()) throw new Error('The account changed.');
      const request = { ...options };
      const pending = continuation?.operationId === intent ? continuation : { source, operationId: intent, occurredOn: localDay() };
      try { storage.setItem(continuationKey, JSON.stringify(pending)); }
      catch (_) { throw new Error('This device could not keep the continuation request. Free storage and retry.'); }
      continuation = pending;
      try {
        const { data } = await api.post(`/api/work-notes/${source._id}/continue`, {
          operationId: intent, expectedRevision: source.revision,
          ...(Number.isInteger(source.workingState?.revision) ? { expectedWorkbenchRevision: source.workingState.revision } : {}), occurredOn: pending.occurredOn
        }, request);
        if (!isCurrent() || request.signal.aborted) return null;
        saved[source._id] = source; saved[data._id] = data; continuation = null; storage.removeItem(continuationKey); emit(); return data._id;
      } catch (error) {
        if (error?.response?.status === 409) { continuation = null; storage.removeItem(continuationKey); }
        throw error;
      }
    },
    conflict: id => drafts[id]?.conflict,
    useServer(id) { if (!drafts[id]?.conflict) return; saved[id] = drafts[id].conflict; delete drafts[id]; persist(); emit(); },
    saveAsNew(id) { const local = body(entry(id)); const workingState = entry(id).workingState; this.useServer(id); const copy = capture(local); edit(copy, { workingState }); return copy; },
    status(id) {
      const draft = drafts[id];
      if (!draft?.dirty) return entry(id)?._id ? 'Saved' : 'Start writing';
      if (!draft.durable) return 'Not saved on this device. Keep this page open.';
      if (draft.conflict) return 'This note changed elsewhere. Both versions are kept.';
      if (draft.error) return `${draft.error} On this device.`;
      return draft.saving ? 'Saving…' : 'On this device';
    },
    pending: () => Object.entries(drafts).filter(([, draft]) => draft.dirty),
    canLeave: () => Object.values(drafts).every(draft => !draft.dirty || draft.durable),
    discard(id) { delete drafts[id]; if (!saved[id]?._id) delete saved[id]; persist(); emit(); },
    removeDrafts() { storage.removeItem(key); storage.removeItem(continuationKey); drafts = {}; continuation = null; emit(); },
    dispose() { disposed = true; abort.abort(); listeners.clear(); }
  };
}
