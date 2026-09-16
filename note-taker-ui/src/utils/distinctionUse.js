import { buildConceptPath } from './sourceRoutes';

const asLine = (value) => String(value || '').trim();
const idOf = (value) => {
  if (value && typeof value === 'object') {
    return String(value._id || value.id || value.sourceId || '').trim();
  }
  return String(value || '').trim();
};
const isSuppressed = (item) => Boolean(
  item?.hiddenFromHome || item?.debugOnly || item?.archived
);
const CONTENT_WORD = /[a-zA-Z][a-zA-Z']{2,}/g;

export const DISTINCTION_SOURCE_TYPE = 'authored_distinction';
export const DISTINCTION_SOURCE_CONCEPT = 'concept';
export const DISTINCTION_SOURCE_NOTEBOOK = 'notebook';

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

export const distinctionHref = (sourceId, versionId, sourceKind = '', name = '') => {
  const id = asLine(sourceId);
  const kind = asLine(sourceKind) || DISTINCTION_SOURCE_NOTEBOOK;
  if (kind === DISTINCTION_SOURCE_CONCEPT) {
    return buildConceptPath({
      name: asLine(name) || id,
      conceptId: id,
      versionId
    });
  }
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

const noteDefinition = (note) => asLine(
  note?.description
  || note?.snippet
  || note?.content
  || (Array.isArray(note?.blocks) ? note.blocks.map((block) => block?.text).find(asLine) : '')
);

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
  const sourceKind = sourceId
    ? (asLine(value.sourceKind) || DISTINCTION_SOURCE_NOTEBOOK)
    : '';
  const sourceHref = asLine(value.sourceHref) || (sourceId
    ? distinctionHref(sourceId, meaning.versionId, sourceKind, meaning.name)
    : '');
  const externalId = asLine(value.externalId);
  const narrowedTo = value.inapplicable === true ? null : asMeaning(value.narrowedTo);
  return {
    ...meaning,
    ...(sourceId ? { sourceId, sourceKind } : {}),
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
    sourceHref: record.sourceId
      ? distinctionHref(record.sourceId, record.versionId, record.sourceKind, record.name)
      : record.sourceHref,
    externalId: record.externalId
  });
  return value?.pending === true ? { ...held, pending: true } : held;
};

export const recordedDefinition = (use) => {
  const record = distinctionRecord(use);
  return record ? { name: record.name, definition: record.definition } : null;
};

export const sourceStatus = (use, liveSource) => {
  const record = distinctionRecord(use);
  if (!record?.sourceId) return 'unbound';
  if (record.sourceKind === DISTINCTION_SOURCE_CONCEPT) {
    if (isSuppressed(liveSource)) return 'missing';
    const liveId = idOf(liveSource);
    const liveName = asLine(liveSource?.name);
    if (!liveId && !liveName) return 'missing';
    const sameId = liveId && liveId === record.sourceId;
    const sameName = liveName && liveName.toLowerCase() === record.name.toLowerCase();
    if (!sameId && !sameName) return 'missing';
    const noteOwner = asLine(liveSource.userId || liveSource.ownerId);
    if (record.ownerId && noteOwner && noteOwner !== record.ownerId) return 'foreign';
    return 'ok';
  }
  const noteId = idOf(liveSource);
  if (!noteId) return 'missing';
  if (noteId !== record.sourceId) return 'missing';
  const noteOwner = asLine(liveSource.userId || liveSource.ownerId);
  if (record.ownerId && noteOwner && noteOwner !== record.ownerId) return 'foreign';
  return 'ok';
};

export const missingSourceCopy = (status, sourceKind = '') => (
  status === 'missing' || status === 'foreign'
    ? (sourceKind === DISTINCTION_SOURCE_CONCEPT
      ? 'The concept is gone. These are the words used here.'
      : 'The notebook page is gone. These are the words used here.')
    : 'Used here as written.'
);

export const liveDefinitionMoved = (live, versionId) => {
  const current = distinctionRecord({
    name: asLine(live?.name || live?.title),
    definition: asLine(live?.description) || noteDefinition(live)
  });
  const recorded = asLine(versionId);
  return Boolean(current && recorded && current.versionId !== recorded);
};

export const isLexicalOnlyMatch = (contextText, instrument) => {
  const haystack = asLine(contextText).toLowerCase();
  const record = distinctionRecord(instrument) || asMeaning(instrument);
  if (!haystack || !record) return true;
  const name = record.name.toLowerCase();
  const definition = record.definition.toLowerCase();
  const nameHit = haystack.includes(name);
  const extraWords = (definition.match(CONTENT_WORD) || [])
    .map((word) => word.toLowerCase())
    .filter((word) => word.length > 3 && !name.includes(word));
  const definitionHit = extraWords.some((word) => haystack.includes(word));
  return nameHit && !definitionHit;
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

export const eligibleDistinctions = (items = []) => {
  const listed = (Array.isArray(items) ? items : []).map((item) => {
    if (!item || typeof item !== 'object' || isSuppressed(item)) return null;
    const fromNote = asLine(item?.importMeta?.sourceType) === DISTINCTION_SOURCE_TYPE;
    const name = asLine(fromNote ? item.title : (item.name || item.title));
    const definition = fromNote
      ? asLine(item.snippet || item.content || (Array.isArray(item.blocks) ? item.blocks.map((block) => block?.text).find(asLine) : ''))
      : asLine(item.description);
    const sourceId = idOf(item) || (fromNote ? '' : name);
    const sourceKind = fromNote ? DISTINCTION_SOURCE_NOTEBOOK : DISTINCTION_SOURCE_CONCEPT;
    if (!fromNote && asLine(item?.importMeta?.sourceType)) return null;
    if (!fromNote && !asLine(item?.description)) return null;
    if (!name || !definition || !sourceId) return null;
    return {
      sourceId,
      sourceKind,
      name,
      definition,
      href: distinctionHref(sourceId, '', sourceKind, name)
    };
  }).filter(Boolean);
  const conceptNames = new Set(
    listed
      .filter((item) => item.sourceKind === DISTINCTION_SOURCE_CONCEPT)
      .map((item) => item.name.toLowerCase())
  );
  return listed.filter((item) => (
    item.sourceKind === DISTINCTION_SOURCE_CONCEPT
    || !conceptNames.has(item.name.toLowerCase())
  ));
};

export const findRetainedDistinction = (items = [], externalIdOrQuery = '') => {
  const query = externalIdOrQuery && typeof externalIdOrQuery === 'object'
    ? externalIdOrQuery
    : { externalId: externalIdOrQuery };
  const id = asLine(query.externalId);
  const title = asLine(query.name);
  const listed = eligibleDistinctions(items);
  if (id) {
    const fromId = (Array.isArray(items) ? items : []).find((item) => (
      asLine(item?.externalId) === id
      || (
        asLine(item?.importMeta?.externalId) === id
        && asLine(item?.importMeta?.sourceType) === DISTINCTION_SOURCE_TYPE
      )
    ));
    if (fromId) {
      return eligibleDistinctions([fromId])[0] || distinctionRecord({
        name: asLine(fromId.name || fromId.title) || 'Untitled',
        definition: asLine(fromId.definition) || noteDefinition(fromId) || asLine(fromId.title),
        sourceId: idOf(fromId),
        sourceKind: asLine(fromId.importMeta?.sourceType) === DISTINCTION_SOURCE_TYPE
          ? DISTINCTION_SOURCE_NOTEBOOK
          : DISTINCTION_SOURCE_CONCEPT,
        externalId: id
      });
    }
  }
  if (title) {
    return listed.find((item) => item.name.toLowerCase() === title.toLowerCase()) || null;
  }
  return null;
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
  concepts = [],
  createNote,
  saveConcept,
  name,
  definition,
  externalId,
  createId
} = {}) => {
  const title = asLine(name);
  const text = asLine(definition);
  const fromConcept = findRetainedDistinction(concepts, { name: title });
  if (fromConcept) {
    return distinctionRecord({ ...fromConcept, name: fromConcept.name, definition: fromConcept.definition });
  }
  if (typeof saveConcept === 'function' && title && text) {
    const unlabeled = (Array.isArray(concepts) ? concepts : []).find((item) => (
      !isSuppressed(item)
      && asLine(item?.name).toLowerCase() === title.toLowerCase()
      && !asLine(item?.description)
    ));
    const saved = await saveConcept(title, { description: text });
    return distinctionRecord({
      name: asLine(saved?.name) || title,
      definition: asLine(saved?.description) || text,
      sourceId: idOf(saved) || idOf(unlabeled) || title,
      sourceKind: DISTINCTION_SOURCE_CONCEPT
    });
  }
  const existing = findRetainedDistinction(notes, { externalId });
  if (existing) return distinctionRecord({ ...existing, name: existing.name, definition: existing.definition });
  const payload = retainDistinctionPayload({ name, definition, externalId, createId });
  if (!payload || typeof createNote !== 'function') return null;
  const created = await createNote(payload);
  return distinctionRecord({
    name: asLine(created?.title) || title,
    definition: noteDefinition(created) || text,
    sourceId: idOf(created),
    sourceKind: DISTINCTION_SOURCE_NOTEBOOK,
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
    sourcePath: distinctionHref(record.sourceId, record.versionId, record.sourceKind, record.name)
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
        sourcePath: distinctionHref(record.sourceId, record.versionId, record.sourceKind, record.name),
        articleTitle: record.name
      },
      content: [{ type: 'paragraph', content: [{ type: 'text', text: record.definition }] }]
    }
  ];
};
