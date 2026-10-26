import apiClient from '../api';
import { operationId, workDraftStorage, workContinuationStorage } from './workDrafts';
import { plainTextFrom } from '../utils/editorialText';
export { draftKey, operationId } from './workDrafts';

export const workAccount = token => {
  try { return String(JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).id || ''); }
  catch (_) { return ''; }
};
export const localDay = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
export const noteTitle = note => note?.title?.trim() || 'Untitled note';
export const noteDate = note => note?.occurredOn || '';
export const noteWords = note => note?.blocks?.length ? note.blocks.map(block => block.text || '').join('\n') : plainTextFrom(note?.content);
const body = note => ({ title: note.title || '', content: note.content || '', blocks: note.blocks || [], folder: note.folder?._id || note.folder || null, occurredOn: note.occurredOn, withText: note.withText || '' });
const message = error => error?.response?.data?.error || 'Sync paused. Retry when you are connected.';

// The server owns notes. This session holds only unacknowledged edits beside them.
export function createWorkSession({ token, api = apiClient, storage = localStorage }) {
  const account = workAccount(token), writerId = operationId();
  const device = workDraftStorage(account, storage), receipts = workContinuationStorage(account, storage);
  let abort = new AbortController();
  const continuations = new Map();
  const options = { skipAuthHandling: true, headers: { Authorization: `Bearer ${token}` }, signal: abort.signal };
  let saved = {}, drafts = {}, folders = [], disposed = false, tick = 0, loadError = '', loading = true, authNeeded = false;
  const listeners = new Set(), flights = new Map(), aliases = new Map();
  const isCurrent = () => !disposed && Boolean(account) && workAccount(storage.getItem('token') || '') === account;
  const emit = () => { tick += 1; listeners.forEach(listener => listener()); };
  const requestError = error => {
    if (error?.response?.status === 401) { authNeeded = true; return 'Sign in to sync.'; }
    return message(error);
  };
  const refreshDrafts = () => {
    try {
      for (const record of device.read()) {
        if (Object.values(drafts).some(draft => draft.draftId === record.draftId)) continue;
        const preferred = record.note._id || record.clientId || record.draftId;
        const id = drafts[preferred] ? record.draftId : preferred;
        drafts[id] = { ...record, saving: false, durable: true };
      }
    } catch (_) { loadError = 'Device drafts could not be read. Keep this page open until your writing is saved.'; }
    Object.values(drafts).forEach(draft => { draft.durable = device.durable(draft); });
    emit();
  };
  const continuation = () => {
    try { receipts.read().forEach(pending => continuations.set(pending.operationId, continuations.get(pending.operationId) || pending)); }
    catch (_) { loadError = 'The earlier continuation receipt could not be read.'; }
    return continuations.values().next().value || null;
  };
  const forgetContinuation = pending => { receipts.remove(pending); continuations.delete(pending.operationId); };
  continuation();
  refreshDrafts();
  const persist = id => {
    try { drafts[id] = device.write(drafts[id], writerId, id); return true; }
    catch (_) { drafts[id].durable = device.durable(drafts[id]); return false; }
  };
  const forget = id => {
    const draft = drafts[id];
    if (!draft) return;
    try { device.remove(draft); delete drafts[id]; return true; }
    catch (_) { draft.error = 'Saved writing could not be cleared from this device.'; return false; }
  };
  const keepSaved = (note, clientId = note._id) => {
    if (clientId !== note._id) { aliases.set(clientId, note._id); delete saved[clientId]; }
    if (!saved[note._id] || saved[note._id].revision <= note.revision) saved[note._id] = note;
    return note._id;
  };
  const entry = id => drafts[id]?.note || saved[aliases.get(id) || id];
  const edit = (id, patch) => {
    if (!isCurrent()) return;
    const current = entry(id); if (!current) return;
    const previous = drafts[id];
    drafts[id] = { ...previous, note: { ...current, ...patch }, version: (previous?.version || 0) + 1, dirty: true, error: '' };
    persist(id); emit();
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
          if (creating && !draft.createBody) { draft.createBody = body(sent); persist(id); }
          const { data } = creating
            ? await api.post('/api/work-notes', { ...draft.createBody, operationId: draft.operationId }, request)
            : await api.put(`/api/work-notes/${sent._id}`, { ...body(sent), expectedRevision: sent.revision, ...(sent.workingState ? { workingState: { nextTimeLine: sent.workingState.nextTimeLine } } : {}) }, request);
          if (!isCurrent() || request.signal.aborted) return false;
          const latest = drafts[id];
          if (creating && data.revision > 0) {
            latest.conflict = data; latest.saving = false; persist(id); emit(); return false;
          }
          keepSaved(data, id);
          if (latest.version === version && !creating) { if (!forget(id)) { emit(); return false; } }
          else { latest.note = { ...data, ...latest.note, _id: data._id, revision: data.revision }; persist(id); }
          emit();
        } catch (error) {
          if (!isCurrent() || request.signal.aborted) return false;
          const latest = drafts[id]; latest.saving = false;
          if (error?.response?.status === 409 && error.response.data?.current) latest.conflict = error.response.data.current;
          latest.error = requestError(error);
          persist(id); emit(); return false;
        }
      }
      return !drafts[id]?.dirty;
    };
    const promise = run().finally(() => flights.delete(id)); flights.set(id, promise); return promise;
  };
  return {
    account, entry, edit, capture, flush, isCurrent, refreshDrafts,
    resume(nextToken = storage.getItem('token') || '') {
      if (workAccount(nextToken) !== account || workAccount(storage.getItem('token') || '') !== account) return false;
      if (disposed || options.headers.Authorization !== `Bearer ${nextToken}`) {
        abort.abort(); disposed = false; abort = new AbortController(); options.signal = abort.signal;
        if (options.headers.Authorization !== `Bearer ${nextToken}`) authNeeded = false;
        options.headers = { Authorization: `Bearer ${nextToken}` }; emit();
      }
      return true;
    },
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); },
    snapshot: () => tick,
    entries: () => [
      ...Object.entries(saved).filter(([id]) => !drafts[id] && !Object.values(drafts).some(draft => draft.note._id === id)).map(([id, note]) => ({ ...note, clientId: id })),
      ...Object.entries(drafts).map(([id, draft]) => ({ ...draft.note, clientId: id, localVersion: Object.values(drafts).some(other => other !== draft && draft.note._id && other.note._id === draft.note._id) }))
    ],
    folders: () => folders,
    loading: () => loading,
    error: () => loadError,
    authNeeded: () => authNeeded,
    async load() {
      const request = { ...options };
      loading = true; loadError = ''; emit();
      try {
        const { data } = await api.get('/api/work-notes', request); if (!isCurrent() || request.signal.aborted) return;
        data.entries.forEach(note => keepSaved(note));
        folders = data.folders;
      } catch (error) { if (isCurrent() && !request.signal.aborted) loadError = requestError(error); }
      finally { if (isCurrent() && !request.signal.aborted) { loading = false; emit(); } }
    },
    async addFolder(name) {
      if (!isCurrent()) return null;
      const request = { ...options };
      try {
        const { data } = await api.post('/api/work-notes/folders', { name }, request);
        if (!isCurrent() || request.signal.aborted) return null; folders = [...folders, data]; emit(); return data;
      } catch (error) {
        if (isCurrent() && !request.signal.aborted) { requestError(error); emit(); }
        throw error;
      }
    },
    continuation,
    async continueFrom(source, intent) {
      if (!isCurrent()) throw new Error('The account changed.');
      const held = continuation();
      if (held && (held.operationId !== intent || held.source._id !== source._id)) throw new Error('Recover the earlier continuation receipt before starting another.');
      const request = { ...options };
      const pending = held || { source, operationId: intent, occurredOn: localDay() };
      try { receipts.write(pending); }
      catch (_) { throw new Error('This device could not keep the continuation request. Free storage and retry.'); }
      continuations.set(pending.operationId, pending);
      const confirmed = pending.source;
      try {
        const { data } = await api.post(`/api/work-notes/${confirmed._id}/continue`, {
          operationId: pending.operationId, expectedRevision: confirmed.revision,
          ...(Number.isInteger(confirmed.workingState?.revision) ? { expectedWorkbenchRevision: confirmed.workingState.revision } : {}), occurredOn: pending.occurredOn
        }, request);
        if (!isCurrent() || request.signal.aborted) return null;
        keepSaved(confirmed); keepSaved(data); forgetContinuation(pending); emit(); return data._id;
      } catch (error) {
        if (isCurrent() && !request.signal.aborted) { requestError(error); emit(); }
        if (error?.response?.status === 409) { forgetContinuation(pending); }
        throw error;
      }
    },
    conflict: id => drafts[id]?.conflict,
    useServer(id) { if (!drafts[id]?.conflict) return; keepSaved(drafts[id].conflict, id); forget(id); emit(); },
    saveAsNew(id) { const local = body(entry(id)); const workingState = entry(id).workingState; this.useServer(id); const copy = capture(local); edit(copy, { workingState }); return copy; },
    status(id) {
      const draft = drafts[id];
      if (!draft?.dirty) return entry(id)?._id ? 'Saved' : 'Start writing';
      draft.durable = device.durable(draft);
      if (!draft.durable) return 'Not saved on this device. Keep this page open.';
      if (draft.conflict) return 'This note changed elsewhere. Both versions are kept.';
      if (draft.error) return `${draft.error} On this device.`;
      return draft.saving ? 'Saving…' : 'On this device';
    },
    pending: () => Object.entries(drafts).filter(([, draft]) => draft.dirty).map(([id, draft]) => { draft.durable = device.durable(draft); return [id, draft]; }),
    canLeave: () => Object.values(drafts).every(draft => !draft.dirty || device.durable(draft)),
    discard(id) { forget(id); if (!saved[id]?._id) delete saved[id]; emit(); },
    removeDrafts() { device.removeAll(); receipts.removeAll(); drafts = {}; continuations.clear(); emit(); },
    dispose() { disposed = true; abort.abort(); listeners.clear(); }
  };
}
