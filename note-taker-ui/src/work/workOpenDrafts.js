import { operationId } from './workDrafts';

// Unsubmitted words never enter the auto-flushing Work queue. A submitted
// snapshot bridges the two stores with one identity, even if cleanup fails.
export function createWorkOpenComposer({ account, storage, isCurrent, identity, entry, capture, edit, retain, findItem, emit }) {
  const prefix = `noeis:work-open:${account}:`, drafts = new Map();
  const key = id => `${prefix}${encodeURIComponent(identity(id))}`;
  const read = id => {
    const name = key(id);
    if (!drafts.has(name)) {
      try { drafts.set(name, { value: JSON.parse(storage.getItem(name) || 'null') || { title: '', kind: 'task', intent: operationId() }, error: '' }); }
      catch (_) { drafts.set(name, { value: { title: '', kind: 'task', intent: operationId() }, error: 'The earlier Open draft could not be read. Keep this page open.' }); }
    }
    return drafts.get(name);
  };
  const persist = id => {
    const draft = read(id), value = JSON.stringify(draft.value);
    try {
      storage.setItem(key(id), value);
      if (storage.getItem(key(id)) !== value) throw new Error('No device receipt');
      draft.error = ''; return true;
    } catch (_) { draft.error = 'Open draft not saved on this device. Keep this page open and retry.'; return false; }
  };
  const clear = id => {
    try {
      storage.removeItem(key(id));
      if (storage.getItem(key(id)) !== null) throw new Error('Draft remains');
      drafts.delete(key(id)); emit(); return true;
    } catch (_) { read(id).error = 'Could not finish adding or clearing this draft. Retry keeps the same item.'; emit(); return false; }
  };
  return {
    draft: id => read(id).value,
    status: id => read(id).error,
    change(id, patch) {
      if (!isCurrent() || read(id).value.submission) return;
      read(id).value = { ...read(id).value, ...patch }; persist(id); emit();
    },
    cancel(id) { return isCurrent() && !read(id).value.submission && clear(id); },
    submit(id, timeZone) {
      if (!isCurrent() || !entry(id)) return null;
      const draft = read(id), value = draft.value;
      if (!value.title.trim()) return null;
      const preparing = !value.submission;
      if (preparing) {
        const note = entry(id);
        value.submission = { clientId: `local-open-${value.intent}`, values: {
          title: value.title.trim(), folder: note.folder?._id || note.folder || null, timeZone,
          workItem: { kind: value.kind, noteId: note._id || id, plannedOn: null, dueOn: null, priority: 0, startTime: '', endTime: '' }
        } };
      }
      // Retain the immutable request before capture; a failed handoff is retryable.
      if (!persist(id)) { if (preparing) delete value.submission; emit(); return null; }
      const { clientId, values } = value.submission;
      const existing = findItem(value.intent);
      const target = existing?.clientId || clientId;
      if (!entry(target)) { capture(values, { id: target, intent: value.intent }); edit(target, { title: values.title }); }
      if (!retain(target)) { draft.error = 'Open item not saved on this device. Keep this page open and retry.'; emit(); return null; }
      return clear(id) ? target : null;
    },
    canLeave() {
      return [...drafts.entries()].every(([name, draft]) => {
        if (!draft.value.title && !draft.value.submission) return !draft.error;
        try { return storage.getItem(name) === JSON.stringify(draft.value); } catch (_) { return false; }
      });
    },
    removeAll() {
      const names = Array.from({ length: storage.length }, (_, index) => storage.key(index));
      names.filter(name => name?.startsWith(prefix)).forEach(name => storage.removeItem(name)); drafts.clear();
    }
  };
}
