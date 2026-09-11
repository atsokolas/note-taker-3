const asLine = (value) => String(value || '').trim();
const idOf = (value) => {
  if (value && typeof value === 'object') {
    return String(value._id || value.id || value.sourceId || '').trim();
  }
  return String(value || '').trim();
};

export const DISTINCTION_SOURCE_TYPE = 'authored_distinction';

export const distinctionVersionId = ({ name = '', definition = '' } = {}) => {
  const payload = `${asLine(name)}\n${asLine(definition)}`;
  let hash = 0x811c9dc5;
  let extra = 0x811c9dc5;
  for (let i = 0; i < payload.length; i += 1) {
    hash ^= payload.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  for (let i = payload.length - 1; i >= 0; i -= 1) {
    extra ^= payload.charCodeAt(i);
    extra = Math.imul(extra, 0x01000193);
  }
  return `${(hash >>> 0).toString(16).padStart(8, '0')}${(extra >>> 0).toString(16).padStart(8, '0')}`;
};

export const distinctionHref = (sourceId, versionId) => {
  const id = asLine(sourceId);
  if (!id) return '';
  const path = `/think?tab=notebook&entryId=${encodeURIComponent(id)}`;
  return asLine(versionId) ? `${path}&v=${encodeURIComponent(asLine(versionId))}` : path;
};

export const distinctionExternalId = (saved = {}) => {
  if (asLine(saved.id) || asLine(saved._id)) return `distinction:${idOf(saved)}`;
  if (asLine(saved.pageId) && asLine(saved.claimId)) {
    return `distinction:${asLine(saved.pageId)}:${asLine(saved.claimId)}`;
  }
  if (asLine(saved.articleId) && asLine(saved.highlightId)) {
    return `distinction:${asLine(saved.articleId)}:${asLine(saved.highlightId)}`;
  }
  return '';
};

const asMeaning = (value = {}) => {
  const name = asLine(value.name);
  const definition = asLine(value.definition);
  if (!name || !definition) return null;
  return {
    name,
    definition,
    versionId: asLine(value.versionId) || distinctionVersionId({ name, definition })
  };
};

export const distinctionRecord = (value = {}) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const meaning = asMeaning(value);
  if (!meaning) return null;
  const sourceId = asLine(value.sourceId);
  const ownerId = asLine(value.ownerId);
  const against = asLine(value.against);
  const appliedAt = asLine(value.appliedAt);
  const reason = asLine(value.reason);
  const narrowedAt = asLine(value.narrowedAt);
  const sourceHref = asLine(value.sourceHref) || (sourceId ? distinctionHref(sourceId) : '');
  const externalId = asLine(value.externalId);
  const narrowedTo = value.inapplicable === true ? null : asMeaning(value.narrowedTo);
  return {
    ...meaning,
    ...(sourceId ? { sourceId, sourceKind: asLine(value.sourceKind) || 'notebook' } : {}),
    ...(ownerId ? { ownerId } : {}),
    ...(against ? { against } : {}),
    ...(sourceHref ? { sourceHref } : {}),
    ...(appliedAt ? { appliedAt } : {}),
    ...(externalId ? { externalId } : {}),
    ...(value.inapplicable === true ? { inapplicable: true } : {}),
    ...(reason ? { reason } : {}),
    ...(narrowedAt ? { narrowedAt } : {}),
    ...(narrowedTo ? { narrowedTo } : {})
  };
};

export const heldInstrumentFrom = (value) => {
  const record = distinctionRecord(value);
  if (!record) return null;
  const held = distinctionRecord({
    name: record.name,
    definition: record.definition,
    versionId: record.versionId,
    sourceId: record.sourceId,
    sourceKind: record.sourceKind,
    ownerId: record.ownerId,
    sourceHref: record.sourceId ? distinctionHref(record.sourceId) : record.sourceHref,
    externalId: record.externalId
  });
  return value?.pending === true ? { ...held, pending: true } : held;
};

export const recordedDefinition = (use) => {
  const record = distinctionRecord(use);
  return record ? { name: record.name, definition: record.definition } : null;
};

export const sourceStatus = (use, liveNote) => {
  const record = distinctionRecord(use);
  if (!record?.sourceId) return 'unbound';
  const noteId = idOf(liveNote);
  if (!noteId) return 'missing';
  if (noteId !== record.sourceId) return 'missing';
  const noteOwner = asLine(liveNote.userId || liveNote.ownerId);
  if (record.ownerId && noteOwner && noteOwner !== record.ownerId) return 'foreign';
  return 'ok';
};

export const heldInstrumentForOwner = (held, ownerId) => {
  const record = heldInstrumentFrom(held);
  if (!record) return null;
  const owner = asLine(ownerId);
  if (record.ownerId && owner && record.ownerId !== owner) return null;
  return record;
};

export const recordFailedApplication = (use, {
  inapplicable = false,
  narrower,
  reason = '',
  at = ''
} = {}) => {
  const record = distinctionRecord(use);
  if (!record) return null;
  const {
    narrowedTo: _priorNarrow,
    inapplicable: _priorInapplicable,
    reason: _priorReason,
    narrowedAt: _priorAt,
    ...base
  } = record;
  const when = asLine(at);
  const why = asLine(reason);
  if (inapplicable) {
    return distinctionRecord({
      ...base,
      inapplicable: true,
      ...(why ? { reason: why } : {}),
      ...(when ? { narrowedAt: when } : {})
    });
  }
  const next = asMeaning(narrower);
  if (!next || next.versionId === record.versionId) return record;
  return distinctionRecord({
    ...base,
    ...(why ? { reason: why } : {}),
    ...(when ? { narrowedAt: when } : {}),
    narrowedTo: next
  });
};

export const liveDefinitionAfterFailure = (use) => {
  const record = distinctionRecord(use);
  if (!record) return null;
  if (record.narrowedTo && !record.inapplicable) {
    return heldInstrumentFrom({
      ...heldInstrumentFrom(record),
      ...record.narrowedTo
    });
  }
  return heldInstrumentFrom(record);
};

export const keepNewerHeldInstrument = (held, snapshot) => {
  const current = heldInstrumentFrom(held);
  const used = heldInstrumentFrom(snapshot);
  if (!current) return used;
  if (!used) return current;
  if (current.sourceId && used.sourceId && current.sourceId === used.sourceId) {
    if (current.versionId === used.versionId) return current.pending ? used : current;
    if (current.pending === true) return current;
    return used;
  }
  if (current.versionId === used.versionId) return used;
  if (!used.sourceId && current.name === used.name) return current;
  return used;
};

export const exceptionsFromUses = (uses = []) => (
  (Array.isArray(uses) ? uses : [])
    .map((item) => distinctionRecord(item))
    .filter((item) => item && (item.inapplicable || item.narrowedTo))
);

export const shouldUpdateExistingDistinction = (note, next = {}) => {
  const listed = eligibleDistinctions([note])[0];
  const name = asLine(next.name);
  const definition = asLine(next.definition);
  return Boolean(listed && name && definition && name === listed.name);
};

export const updateDistinctionPayload = ({
  note,
  name,
  definition,
  createId = () => 'block-1'
} = {}) => {
  const listed = eligibleDistinctions([note])[0];
  const title = asLine(name) || listed?.name;
  const text = asLine(definition);
  if (!title || !text || !listed) return null;
  const externalId = asLine(note?.importMeta?.externalId || note?.externalId);
  return {
    title,
    content: text,
    blocks: [{ id: createId(), type: 'paragraph', text }],
    importMeta: {
      ...(note?.importMeta && typeof note.importMeta === 'object' ? note.importMeta : {}),
      provider: asLine(note?.importMeta?.provider) || 'noeis',
      sourceType: DISTINCTION_SOURCE_TYPE,
      sourceLabel: title,
      ...(externalId ? { externalId } : {})
    }
  };
};

const noteDefinition = (note) => asLine(
  note?.snippet
  || note?.content
  || (Array.isArray(note?.blocks) ? note.blocks.map((block) => block?.text).find(asLine) : '')
);

export const eligibleDistinctions = (notes = []) => (
  (Array.isArray(notes) ? notes : []).map((note) => {
    if (asLine(note?.importMeta?.sourceType) !== DISTINCTION_SOURCE_TYPE) return null;
    const name = asLine(note?.title);
    const definition = noteDefinition(note);
    const sourceId = idOf(note);
    if (!name || !definition || !sourceId) return null;
    return {
      sourceId,
      name,
      definition,
      href: distinctionHref(sourceId)
    };
  }).filter(Boolean)
);

export const findRetainedDistinction = (notes = [], externalId) => {
  const id = asLine(externalId);
  if (!id) return null;
  const note = (Array.isArray(notes) ? notes : []).find((item) => (
    asLine(item?.externalId) === id
    || (
      asLine(item?.importMeta?.externalId) === id
      && asLine(item?.importMeta?.sourceType) === DISTINCTION_SOURCE_TYPE
    )
  ));
  if (!note) return null;
  const listed = eligibleDistinctions([note])[0];
  return listed || distinctionRecord({
    name: asLine(note.name || note.title) || 'Untitled',
    definition: asLine(note.definition) || noteDefinition(note) || asLine(note.title),
    sourceId: idOf(note),
    externalId: id
  });
};

export const retainDistinctionPayload = ({
  name,
  definition,
  externalId,
  createId = () => 'block-1'
} = {}) => {
  const title = asLine(name);
  const text = asLine(definition);
  if (!title || !text) return null;
  return {
    title,
    content: text,
    blocks: [{ id: createId(), type: 'paragraph', text }],
    importMeta: {
      provider: 'noeis',
      sourceType: DISTINCTION_SOURCE_TYPE,
      sourceLabel: title,
      externalId: asLine(externalId)
    }
  };
};

export const retainDistinction = async ({
  notes = [],
  createNote,
  name,
  definition,
  externalId,
  createId
} = {}) => {
  const existing = findRetainedDistinction(notes, externalId);
  if (existing) return distinctionRecord({ ...existing, name: existing.name, definition: existing.definition });
  const payload = retainDistinctionPayload({ name, definition, externalId, createId });
  if (!payload || typeof createNote !== 'function') return null;
  const created = await createNote(payload);
  return distinctionRecord({
    name: asLine(created?.title) || asLine(name),
    definition: noteDefinition(created) || asLine(definition),
    sourceId: idOf(created),
    externalId: asLine(externalId)
  });
};

export const quoteBlockFromDistinctionUse = (use, createId) => {
  const record = distinctionRecord(use);
  if (!record) return null;
  return {
    id: createId(),
    type: 'quote',
    text: record.definition,
    articleTitle: record.name,
    sourcePath: distinctionHref(record.sourceId, record.versionId)
  };
};

export const editorNodesFromDistinctionUse = (use) => {
  const record = distinctionRecord(use);
  if (!record) return [];
  return [
    {
      type: 'heading',
      attrs: { level: 3 },
      content: [{ type: 'text', text: record.name }]
    },
    {
      type: 'blockquote',
      attrs: {
        sourcePath: distinctionHref(record.sourceId, record.versionId),
        articleTitle: record.name
      },
      content: [{ type: 'paragraph', content: [{ type: 'text', text: record.definition }] }]
    }
  ];
};
