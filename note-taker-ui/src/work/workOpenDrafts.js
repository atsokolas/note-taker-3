import { operationId, workDraftStorage } from './workDrafts';

// Separate namespace: these snapshots are never in the auto-flushing queue.
// Reuse Work's immutable records so stale tabs cannot overwrite later words.
export function createWorkOpenComposer({ account, storage, isCurrent, identity, entry, capture, edit, retain, retainParent, findItem, findNote, emit }) {
  const device = workDraftStorage(`${account}:open`, storage), writerId = operationId(), selected = new Map();
  const stored = () => device.read();
  const read = id => {
    const name = identity(id);
    if (!selected.has(name)) {
      try {
        const records = stored().filter(record => record.note.noteIdentity === name);
        selected.set(name, records.at(-1) || { note: { noteIdentity: name, title: '', kind: 'task', intent: operationId() }, version: 0, dirty: true });
      } catch (_) { selected.set(name, { note: { noteIdentity: name, title: '', kind: 'task', intent: operationId() }, version: 0, dirty: true, error: 'The earlier Open draft could not be read. Keep this page open.' }); }
    }
    return selected.get(name);
  };
  const all = () => {
    let records = [];
    try { records = stored(); } catch (_) { /* Read failures stay visible on the selected draft. */ }
    const result = new Map(records.map(record => [record.draftId, record]));
    selected.forEach(record => { if (record.note.title || record.note.submission) result.set(record.draftId || record.note.intent, record); });
    return [...result.values()];
  };
  const persist = id => {
    const previous = read(id);
    try {
      const saved = device.write(previous, writerId, identity(id)); saved.error = ''; selected.set(identity(id), saved);
      // Supersede only the exact snapshot that was displayed. A competing tab's
      // later immutable snapshot has a different key and remains recoverable.
      if (previous.writerId !== writerId && previous.recordKey) { try { device.remove(previous); } catch (_) { /* Preserve both if cleanup fails. */ } }
      return true;
    } catch (_) { previous.error = 'Open draft not saved on this device. Keep this page open and retry.'; return false; }
  };
  const clear = id => {
    const current = read(id);
    try {
      stored().filter(record => record.note.intent === current.note.intent).forEach(record => device.remove(record));
      selected.delete(identity(id)); emit(); return true;
    } catch (_) { current.error = 'Could not finish adding or clearing this draft. Retry keeps the same item.'; emit(); return false; }
  };
  return {
    draft: id => read(id).note,
    status: id => read(id).error || '',
    drafts: id => all().filter(record => record.note.noteIdentity === identity(id)).map(record => ({ ...record.note, id: record.draftId || record.note.intent })),
    choose(id, draftId) {
      if (!isCurrent()) return;
      const record = all().find(value => value.note.noteIdentity === identity(id) && (value.draftId || value.note.intent) === draftId);
      if (record) { selected.set(identity(id), record); emit(); }
    },
    change(id, patch) {
      if (!isCurrent() || read(id).note.submission) return;
      const record = read(id);
      record.note = { ...record.note, ...patch, intent: operationId(), ...(!entry(id)?._id ? { parent: { id, intent: identity(id), note: entry(id) } } : {}) }; record.version += 1;
      persist(id); emit();
    },
    cancel(id) { return isCurrent() && !read(id).note.submission && clear(id); },
    submit(id, timeZone) {
      if (!isCurrent() || !entry(id)) return null;
      const draft = read(id), value = draft.note;
      if (!value.title.trim()) return null;
      const preparing = !value.submission;
      if (preparing) {
        const note = entry(id);
        value.submission = { clientId: `local-open-${value.intent}`, values: {
          title: value.title.trim(), folder: note.folder?._id || note.folder || null, timeZone,
          workItem: { kind: value.kind, noteId: note._id || id, plannedOn: null, dueOn: null, priority: 0, startTime: '', endTime: '' }
        } };
        draft.version += 1;
      }
      // Retain the immutable request before capture; an interrupted handoff
      // reuses this identity even after the server already accepted the item.
      if (!persist(id)) { if (preparing) delete value.submission; emit(); return null; }
      const fail = () => { read(id).error = 'Open item not saved on this device. Keep this page open and retry.'; emit(); return null; };
      if (!retainParent(id)) return fail();
      const { clientId, values } = value.submission;
      const target = findItem(value.intent)?.clientId || clientId;
      if (!entry(target)) { capture(values, { id: target, intent: value.intent }); edit(target, { title: values.title }); }
      if (!retain(target)) return fail();
      return clear(id) ? target : null;
    },
    restoreParents() {
      try {
        stored().forEach(record => {
          const parent = record.note.parent;
          if (parent && !entry(parent.id) && !findNote(parent.intent)) capture(parent.note, { id: parent.id, intent: parent.intent });
        });
      } catch (_) { /* The selected draft reports unreadable device storage. */ }
    },
    recovery: () => all().map(record => ({ ...record.note })),
    canLeave: () => [...selected.values()].every(record => (!record.note.title && !record.note.submission) ? !record.error : device.durable(record)),
    discardUnsafe() {
      try {
        selected.forEach((record, name) => { if (!device.durable(record)) { device.remove(record); selected.delete(name); } });
        emit(); return true;
      } catch (_) { return false; }
    },
    removeAll() { device.removeAll(); selected.clear(); }
  };
}
