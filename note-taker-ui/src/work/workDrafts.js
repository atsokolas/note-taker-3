export const draftKey = account => `noeis:work-drafts:${account}`;
export const operationId = () => window.crypto?.randomUUID?.() || `work-${Date.now()}-${Math.random().toString(36).slice(2)}`;

// Snapshot keys are immutable. A tab can supersede its own snapshot only after
// its replacement is durable; it cannot overwrite another writer's version.
export function workDraftStorage(account, storage) {
  const key = draftKey(account), prefix = `${key}:record:`, acknowledgments = `${key}:legacy-ack:`;
  const keys = () => Array.from({ length: storage.length }, (_, index) => storage.key(index));
  const legacyAck = id => `${acknowledgments}${encodeURIComponent(id)}`;
  const read = () => {
    const records = new Map();
    for (const name of keys().filter(name => name?.startsWith(prefix))) {
      const recordValue = storage.getItem(name), value = JSON.parse(recordValue);
      if (!value?.note || !value.dirty) continue;
      const previous = records.get(value.draftId);
      if (!previous || previous.generation < value.generation) records.set(value.draftId, { ...value, recordKey: name, recordValue });
    }
    // Keep the legacy map intact. Exact-value acknowledgments retire individual
    // legacy versions without erasing a concurrent old client's later writing.
    const legacy = JSON.parse(storage.getItem(key) || '{}');
    for (const [id, draft] of Object.entries(legacy)) {
      const legacyValue = JSON.stringify(draft);
      if (draft.dirty && storage.getItem(legacyAck(id)) !== legacyValue) records.set(`legacy:${id}`, {
        ...draft, draftId: `legacy:${id}`, clientId: id, legacyId: id, legacyValue, recordKey: key
      });
    }
    return [...records.values()];
  };
  const durable = draft => {
    try {
      const value = draft.legacyId
        ? JSON.parse(storage.getItem(key) || '{}')[draft.legacyId]
        : JSON.parse(storage.getItem(draft.recordKey) || 'null');
      return Boolean(value && value.version === draft.version && JSON.stringify(value.note) === JSON.stringify(draft.note)
        && (!draft.legacyId || storage.getItem(legacyAck(draft.legacyId)) !== JSON.stringify(value)));
    } catch (_) { return false; }
  };
  const remove = draft => {
    if (draft.legacyId) storage.setItem(legacyAck(draft.legacyId), draft.legacyValue);
    else if (draft.recordKey) storage.removeItem(draft.recordKey);
  };
  return {
    read, durable, remove,
    write(draft, writerId, clientId) {
      const own = draft.writerId === writerId;
      const { recordKey, recordValue, legacyId, legacyValue, durable: receipt, saving, ...writing } = draft;
      const value = { ...writing, clientId, writerId, draftId: own ? draft.draftId : operationId(), generation: own ? (draft.generation || 0) + 1 : 1 };
      const nextKey = `${prefix}${operationId()}`, nextValue = JSON.stringify(value);
      storage.setItem(nextKey, nextValue);
      if (storage.getItem(nextKey) !== nextValue) throw new Error('Device draft receipt was not retained.');
      if (own && recordKey && !legacyId) {
        try { storage.removeItem(recordKey); } catch (_) { /* The newer durable generation wins on reload. */ }
      }
      return { ...value, recordKey: nextKey, recordValue: nextValue, durable: true };
    },
    removeAll() {
      keys().filter(name => name?.startsWith(prefix) || name?.startsWith(acknowledgments)).forEach(name => storage.removeItem(name));
      storage.removeItem(key);
    }
  };
}

export function workContinuationStorage(account, storage) {
  const legacyKey = `${draftKey(account)}:continuation`, prefix = `${legacyKey}:`;
  const read = () => {
    const records = new Map();
    const legacy = JSON.parse(storage.getItem(legacyKey) || 'null');
    if (legacy) records.set(legacy.operationId, legacy);
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key?.startsWith(prefix)) { const pending = JSON.parse(storage.getItem(key)); records.set(pending.operationId, pending); }
    }
    return [...records.values()];
  };
  return {
    read,
    write(pending) {
      const key = `${prefix}${pending.operationId}`, value = JSON.stringify(pending);
      storage.setItem(key, value);
      if (storage.getItem(key) !== value) throw new Error('Device continuation receipt was not retained.');
    },
    remove(pending) {
      storage.removeItem(`${prefix}${pending.operationId}`);
      const legacy = JSON.parse(storage.getItem(legacyKey) || 'null');
      if (legacy?.operationId === pending.operationId) storage.removeItem(legacyKey);
    },
    removeAll() { read().forEach(pending => this.remove(pending)); }
  };
}
