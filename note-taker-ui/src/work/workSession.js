import apiClient from '../api';
import { createWorkOpenComposer } from './workOpenDrafts';
import { operationId, workDraftStorage, workContinuationStorage } from './workDrafts';
import { dayInZone, deviceTimeZone, displayDay, itemMetadata } from './workPlannerModel';
import { plainTextFrom } from '../utils/editorialText';
export { draftKey, operationId } from './workDrafts';

export const workAccount = token => {
  try { return String(JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).id || ''); }
  catch (_) { return ''; }
};
export const localDay = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
// One phrase search for every Work list: a note's title and its words.
export const matchesQuery = (note, query) => !query || `${noteTitle(note)} ${note.content || ''}`.toLowerCase().includes(query.toLowerCase());
export const noteTitle = note => note?.title?.trim() || noteWords(note).split('\n').find(line => line.trim())?.trim().slice(0, 80) || 'Untitled note';
export const noteDate = note => displayDay(note?.occurredOn);
export const noteWords = note => note?.blocks?.length ? note.blocks.map(block => block.text || '').join('\n') : plainTextFrom(note?.content);
const body = (note, creating = false) => ({ ...(creating ? { capturedAt: note.capturedAt, timeZone: note.timeZone } : {}), ...(note.workItem ? { workItem: itemMetadata(note.workItem) } : {}), ...(note.workActions?.length ? { workActions: note.workActions } : {}), title: note.title || '', content: note.content || '', blocks: note.blocks || [], folder: note.folder?._id || note.folder || null, occurredOn: note.occurredOn, withText: note.withText || '' });
const MATCHING_SERVER = 'Work needs its matching server before it can save. Retry shortly.';
const message = error => error?.response?.data?.error || 'Sync paused. Retry when you are connected.';

// The server owns notes. This session holds only unacknowledged edits beside them.
export function createWorkSession({ token, api = apiClient, storage = localStorage }) {
  const account = workAccount(token), writerId = operationId();
  const device = workDraftStorage(account, storage), receipts = workContinuationStorage(account, storage);
  let abort = new AbortController();
  const continuations = new Map();
  const options = { skipAuthHandling: true, headers: { Authorization: `Bearer ${token}` }, signal: abort.signal };
  let saved = {}, drafts = {}, folders = [], disposed = false, tick = 0, loadError = '', loading = true, authNeeded = false, compatible = null;
  const listeners = new Set(), flights = new Map(), aliases = new Map();
  const isCurrent = () => !disposed && Boolean(account) && workAccount(storage.getItem('token') || '') === account;
  const emit = () => { tick += 1; listeners.forEach(listener => listener()); };
  const requestError = error => {
    if (error?.code === 'work_server_updating') return error.message;
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
    let linkedDurable = true;
    if (clientId !== note._id) {
      aliases.set(clientId, note._id); delete saved[clientId];
      // Retain a child's canonical link before the parent's local receipt clears.
      // Otherwise a reload between the two saves loses the in-memory alias.
      Object.entries(drafts).forEach(([id, draft]) => {
        if (![clientId, note._id].includes(draft.note.workItem?.noteId)) return;
        draft.note = { ...draft.note, workItem: { ...draft.note.workItem, noteId: note._id } };
        if (!persist(id)) linkedDurable = false;
      });
    }
    if (!saved[note._id] || saved[note._id].revision <= note.revision) saved[note._id] = note;
    return linkedDurable;
  };
  const entry = id => drafts[id]?.note || saved[aliases.get(id) || id];
  const edit = (id, patch) => {
    if (!isCurrent()) return;
    const current = entry(id); if (!current) return;
    const previous = drafts[id];
    const changedFields = [...new Set([...(previous?.changedFields || []), ...Object.keys(patch).filter(key => key !== 'workActions')])];
    drafts[id] = { ...previous, changedFields, note: { ...current, ...patch }, version: (previous?.version || 0) + 1, dirty: true, error: '' };
    persist(id); emit();
  };
  const capture = (values = {}, identity = {}) => {
    const id = identity.id || `local-${operationId()}`;
    const capturedAt = values.capturedAt || new Date().toISOString(), timeZone = values.timeZone || deviceTimeZone();
    const takenOn = dayInZone(capturedAt, timeZone);
    saved[id] = { title: '', content: '', blocks: [], folder: null, occurredOn: takenOn, withText: '', ...values, capturedAt, takenOn, timeZone };
    drafts[id] = { note: saved[id], operationId: identity.intent || operationId(), version: 0, dirty: false, durable: false };
    emit(); return id;
  };
  const load = async () => {
    const request = { ...options };
    loading = true; loadError = ''; emit();
    try {
      const { data } = await api.get('/api/work-notes', request); if (!isCurrent() || request.signal.aborted) return;
      compatible = Array.isArray(data.items);
      if (!compatible) { loadError = MATCHING_SERVER; return; }
      [...data.entries, ...data.items].forEach(note => keepSaved(note));
      mergeFolders(data.folders);
    } catch (error) { if (isCurrent() && !request.signal.aborted) loadError = requestError(error); }
    finally { if (isCurrent() && !request.signal.aborted) { open.restoreParents(); loading = false; emit(); } }
  };
  const requireServer = async () => { if (compatible !== true) await load(); if (compatible !== true) throw Object.assign(new Error(loadError || MATCHING_SERVER), { code: 'work_server_updating' }); };
  const flush = id => {
    if (flights.has(id)) return flights.get(id);
    const run = async () => {
      while (isCurrent() && drafts[id]?.dirty && !drafts[id].conflict) {
        const linked = drafts[id].note.workItem?.noteId;
        if (typeof linked === 'string' && linked.startsWith('local-')) {
          if (!await flush(linked) || !entry(linked)?._id) { drafts[id].error = 'This linked note is waiting to sync. Both remain on this device.'; persist(id); emit(); return false; }
          drafts[id].note = { ...drafts[id].note, workItem: { ...drafts[id].note.workItem, noteId: entry(linked)._id } }; persist(id);
        }
        const draft = drafts[id], version = draft.version, sent = draft.note, request = { ...options };
        draft.saving = true; draft.error = ''; emit();
        try {
          await requireServer();
          if (!isCurrent() || request.signal.aborted) return false;
          const creating = !sent._id;
          if (creating && !draft.createBody) { draft.createBody = body(sent, true); persist(id); }
          const { data } = creating
            ? await api.post('/api/work-notes', { ...draft.createBody, operationId: draft.operationId }, request)
            : await api.put(`/api/work-notes/${sent._id}`, { ...body(sent), expectedRevision: sent.revision, ...(sent.workingState ? { workingState: { nextTimeLine: sent.workingState.nextTimeLine } } : {}) }, request);
          if (!isCurrent() || request.signal.aborted) return false;
          const latest = drafts[id];
          if (creating && data.revision > 0) {
            latest.conflict = data; latest.saving = false; persist(id); emit(); return false;
          }
          if (data._actionReplay && (latest.changedFields || []).some(key => JSON.stringify(key === 'workItem' ? itemMetadata(sent.workItem) : sent[key]) !== JSON.stringify(key === 'workItem' ? itemMetadata(data.workItem) : data[key]))) {
            latest.conflict = data; latest.saving = false; persist(id); emit(); return false;
          }
          if (!keepSaved(data, id)) { latest.saving = false; latest.error = 'Linked writing could not be kept on this device. Keep this page open and retry.'; emit(); return false; }
          if (latest.version === version && !creating) { if (!forget(id)) { emit(); return false; } }
          else {
            const acknowledged = new Set((data.workItem?.history || []).map(event => event.operationId));
            // A replay can return newer remote metadata. Carry only actual local edits into it.
            const pending = data._actionReplay ? Object.fromEntries((latest.changedFields || []).map(key => [key, latest.note[key]])) : latest.note;
            latest.note = { ...data, ...pending, ...(data.workItem ? { workItem: { ...data.workItem, ...pending.workItem, history: data.workItem.history }, workActions: (latest.note.workActions || []).filter(action => !acknowledged.has(action.operationId)) } : {}), _id: data._id, revision: data.revision }; persist(id);
          }
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
  const records = () => [
    ...Object.entries(saved).filter(([id]) => !drafts[id] && !Object.values(drafts).some(draft => draft.note._id === id)).map(([id, note]) => ({ ...note, clientId: id })),
    ...Object.entries(drafts).map(([id, draft]) => ({ ...draft.note, clientId: id, localVersion: Object.values(drafts).some(other => other !== draft && draft.note._id && other.note._id === draft.note._id) }))
  ];
  const mergeFolders = incoming => {
    const all = new Map(folders.map(folder => [folder._id, folder]));
    incoming.forEach(folder => { if (!all.has(folder._id) || (all.get(folder._id).revision || 0) <= (folder.revision || 0)) all.set(folder._id, folder); });
    folders = [...all.values()].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0) || a.name.localeCompare(b.name));
  };
  const open = createWorkOpenComposer({
    account, storage, isCurrent, entry, capture, edit, emit,
    identity: id => entry(id)?.operationId || drafts[id]?.operationId || entry(id)?._id || id,
    findItem: intent => records().find(note => note.workItem && note.operationId === intent),
    findNote: intent => records().find(note => !note.workItem && note.operationId === intent),
    retain: id => !drafts[id]?.dirty || persist(id),
    retainParent: id => {
      if (entry(id)?._id) return true;
      // Explicit Add commits a real parent even when its prose is still blank.
      if (!drafts[id]?.dirty) edit(id, { title: entry(id)?.title || '' });
      return persist(id);
    }
  });
  return {
    account, entry, edit, capture, flush, isCurrent, refreshDrafts, open,
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
    entries: () => records().filter(note => !note.workItem),
    items: () => records().filter(note => note.workItem),
    folders: () => folders,
    loading: () => loading,
    error: () => loadError,
    authNeeded: () => authNeeded,
    load,
    compatible: () => compatible,
    async addFolder(name, intent = operationId()) {
      if (!isCurrent()) return null;
      await requireServer();
      if (!isCurrent()) return null;
      const request = { ...options };
      try {
        const { data } = await api.post('/api/work-notes/folders', { name, operationId: intent }, request);
        if (!isCurrent() || request.signal.aborted) return null; mergeFolders([data]); emit(); return data;
      } catch (error) {
        if (isCurrent() && !request.signal.aborted) { requestError(error); emit(); }
        throw error;
      }
    },
    action(id, action) {
      const note = entry(id); if (!isCurrent() || !note?.workItem) return null;
      const next = { operationId: operationId(), actionAt: new Date().toISOString(), timeZone: note.timeZone || deviceTimeZone(), ...action };
      edit(id, { workActions: [...(note.workActions || []), next] }); return next.operationId;
    },
    rebaseItem(id) {
      const draft = drafts[id], current = draft?.conflict;
      if (!current?.workItem || !isCurrent()) return;
      const acknowledged = new Set((current.workItem.history || []).map(action => action.operationId));
      const note = { ...draft.note, revision: current.revision, workItem: { ...current.workItem, ...itemMetadata(draft.note.workItem), history: current.workItem.history }, workActions: (draft.note.workActions || []).filter(action => !acknowledged.has(action.operationId)) };
      drafts[id] = { ...draft, note, conflict: null, version: draft.version + 1, error: '' }; keepSaved(current, id); persist(id); emit();
    },
    async updateFolder(folder, patch, intent = operationId()) {
      if (!isCurrent()) return null;
      await requireServer();
      if (!isCurrent()) return null;
      const request = { ...options };
      try {
        const { data } = await api.put(`/api/work-notes/folders/${folder._id}`, { ...patch, expectedRevision: folder.revision || 0, operationId: intent }, request);
        if (!isCurrent() || request.signal.aborted) return null; mergeFolders([data]); emit(); return data;
      } catch (error) { if (isCurrent()) { requestError(error); emit(); } throw error; }
    },
    async reorderFolders(ids, intent = operationId()) {
      if (!isCurrent()) return null;
      await requireServer();
      if (!isCurrent()) return null;
      const request = { ...options };
      try {
        const { data } = await api.post('/api/work-notes/folders/order', { operationId: intent, order: ids.map(id => ({ id, revision: folders.find(folder => folder._id === id)?.revision || 0 })) }, request);
        if (!isCurrent() || request.signal.aborted) return null; mergeFolders(data.folders); emit(); return data.folders;
      } catch (error) { if (isCurrent()) { requestError(error); emit(); } throw error; }
    },
    continuation,
    async continueFrom(source, intent, { timeZone = deviceTimeZone() } = {}) {
      if (!isCurrent()) throw new Error('The account changed.');
      await requireServer();
      if (!isCurrent()) throw new Error('The account changed.');
      const held = continuation();
      if (held && (held.operationId !== intent || held.source._id !== source._id)) throw new Error('Recover the earlier continuation receipt before starting another.');
      const request = { ...options };
      const capturedAt = new Date().toISOString();
      const pending = held || { source, operationId: intent, capturedAt, timeZone, occurredOn: dayInZone(capturedAt, timeZone) };
      try { receipts.write(pending); }
      catch (_) { throw new Error('This device could not keep the continuation request. Free storage and retry.'); }
      continuations.set(pending.operationId, pending);
      const confirmed = pending.source;
      try {
        const { data } = await api.post(`/api/work-notes/${confirmed._id}/continue`, {
          operationId: pending.operationId, expectedRevision: confirmed.revision,
          ...(Number.isInteger(confirmed.workingState?.revision) ? { expectedWorkbenchRevision: confirmed.workingState.revision } : {}), occurredOn: pending.occurredOn, ...(pending.capturedAt ? { capturedAt: pending.capturedAt, timeZone: pending.timeZone } : {})
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
    useServer(id) { if (!drafts[id]?.conflict) return; if (keepSaved(drafts[id].conflict, id)) forget(id); emit(); },
    saveAsNew(id) { const local = body(entry(id)); const workingState = entry(id).workingState; this.useServer(id); const copy = capture(local); edit(copy, { workingState }); return copy; },
    status(id) {
      const draft = drafts[id];
      if (!draft?.dirty) return entry(id)?._id ? 'Saved' : 'Start writing';
      draft.durable = device.durable(draft);
      if (!draft.durable) return 'Not saved on this device. Keep this page open.';
      if (draft.conflict) return draft.note.workItem && draft.error ? `${draft.error} Both versions are kept.` : 'This note changed elsewhere. Both versions are kept.';
      if (draft.error) return `${draft.error} On this device.`;
      return draft.saving ? 'Saving…' : 'On this device';
    },
    pending: () => Object.entries(drafts).filter(([, draft]) => draft.dirty).map(([id, draft]) => { draft.durable = device.durable(draft); return [id, draft]; }),
    canLeave: () => open.canLeave() && Object.values(drafts).every(draft => !draft.dirty || device.durable(draft)),
    discard(id) { forget(id); if (!saved[id]?._id) delete saved[id]; emit(); },
    removeDrafts() { device.removeAll(); receipts.removeAll(); open.removeAll(); drafts = {}; continuations.clear(); emit(); },
    dispose() { disposed = true; abort.abort(); listeners.clear(); }
  };
}
