const crypto = require('crypto');
const { persistNoeisReceipt, serializeStoredReceipt } = require('./noeisReceiptService');
const { diffSegments } = require('./claimRevisionReviewService');
const { createWikiSourceEvent } = require('./wikiSourceEventService');
const { wordBoundaryTrim } = require('../lib/editorialText');

/**
 * C5 first deliverable: one recorded source correction meets one recorded
 * authored use. Lineage lives on WikiSourceEvent. Consequence is the review
 * and NoeisReceipt. WikiRevision remains the wiki-page store — this slice
 * does not mint a second history of private writing.
 */

const KIND = 'authored_source_correction';
const ACTIONS = Object.freeze(['keep', 'change', 'no_change']);
const TERMINAL = new Set(['keep', 'change', 'no_change']);

class AuthoredSourceCorrectionError extends Error {
  constructor(message, status = 400, code = 'invalid_source_correction', details = {}) {
    super(message);
    this.name = 'AuthoredSourceCorrectionError';
    this.status = status;
    this.statusCode = status;
    this.code = code;
    this.details = details;
  }
}

const clean = (value = '', limit = 8000) => wordBoundaryTrim(
  String(value || '').replace(/\s+/g, ' ').trim(),
  { maxLength: limit }
);
const id = (value) => String(value?._id || value?.id || value || '').trim();
const plain = (value) => (value?.toObject ? value.toObject({ virtuals: false }) : value);

const datedLabel = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
};

const correctionIdentity = ({ userId, sourceType, sourceObjectId, previousText, text }) => crypto
  .createHash('sha256')
  .update([
    String(userId || ''),
    String(sourceType || ''),
    id(sourceObjectId),
    clean(previousText, 8000).toLowerCase(),
    clean(text, 8000).toLowerCase()
  ].join('|'))
  .digest('hex');

const receiptKey = ({ userId, eventId, objectType, objectId }) => (
  `${KIND}:v1:${id(userId)}:${id(eventId)}:${objectType}:${id(objectId)}`
);

const recordedUsesFromNotebook = (entry = {}) => (
  (Array.isArray(entry?.blocks) ? entry.blocks : [])
    .filter((block) => {
      const type = String(block?.type || '');
      return (type === 'highlight_embed' || type === 'highlight-ref' || type === 'highlight_ref')
        && (block.highlightId || block.articleId);
    })
    .map((block) => ({
      useId: id(block.id || block.highlightId),
      articleId: id(block.articleId),
      highlightId: id(block.highlightId),
      quotation: clean(block.text, 6000),
      title: clean(block.articleTitle, 500),
      blockId: id(block.id)
    }))
    .filter((use) => use.highlightId || use.articleId)
);

const recordedUsesFromExploration = (exploration = {}) => {
  const draft = exploration.draft || exploration;
  const selected = draft.selectedSource;
  const uses = [];
  if (selected && (selected.highlightId || selected.articleId || selected.passage)) {
    uses.push({
      useId: `selected:${id(selected.highlightId || selected.articleId)}`,
      articleId: id(selected.articleId),
      highlightId: id(selected.highlightId),
      quotation: clean(selected.passage, 6000),
      title: clean(selected.articleTitle || selected.title, 500)
    });
  }
  if (exploration.articleId && exploration.highlightId) {
    const highlightId = id(exploration.highlightId);
    if (!uses.some((use) => use.highlightId === highlightId)) {
      uses.push({
        useId: `origin:${highlightId}`,
        articleId: id(exploration.articleId),
        highlightId,
        quotation: clean(exploration.origin?.claimText, 4000),
        title: clean(exploration.origin?.pageTitle, 500)
      });
    }
  }
  return uses.filter((use) => use.highlightId || use.articleId);
};

const usesOf = (objectType, object) => (
  objectType === 'notebook' ? recordedUsesFromNotebook(object) : recordedUsesFromExploration(object)
);

const sameRecordedUse = (use, event) => {
  const sourceId = id(event?.sourceObjectId);
  if (!sourceId) return false;
  if (String(event.sourceType || '') === 'highlight' && use.highlightId === sourceId) return true;
  if (String(event.sourceType || '') === 'article' && use.articleId === sourceId) return true;
  return false;
};

const sourceHref = (use, event) => {
  const articleId = use.articleId || (event?.sourceType === 'article' ? id(event.sourceObjectId) : id(event?.parentObjectId));
  const highlightId = use.highlightId || (event?.sourceType === 'highlight' ? id(event.sourceObjectId) : '');
  if (!articleId) return clean(event?.url, 1000);
  return `/library?articleId=${encodeURIComponent(articleId)}${highlightId ? `&highlightId=${encodeURIComponent(highlightId)}` : ''}`;
};

const objectHref = (objectType, object) => {
  if (objectType === 'notebook') return `/think?tab=notebook&entryId=${encodeURIComponent(id(object))}`;
  if (object?.origin?.href) return String(object.origin.href);
  if (object?.articleId && object?.highlightId) {
    return `/library?articleId=${encodeURIComponent(id(object.articleId))}&highlightId=${encodeURIComponent(id(object.highlightId))}&exploration=1`;
  }
  if (object?.pageId && object?.claimId) {
    return `/wiki/workspace?page=${encodeURIComponent(id(object.pageId))}&claimId=${encodeURIComponent(object.claimId)}`;
  }
  return '';
};

const buildPreview = ({
  event,
  use,
  objectType,
  object,
  receipt = null,
  now = new Date()
}) => {
  const oldQuotation = clean(
    receipt?.provenance?.oldQuotation || event?.metadata?.previousText || use.quotation,
    6000
  );
  const newEvidence = clean(event?.text, 6000);
  const disposition = TERMINAL.has(receipt?.provenance?.disposition)
    ? receipt.provenance.disposition
    : '';
  return {
    eventId: id(event),
    sourceEventId: id(event),
    eventIdentity: clean(event?.metadata?.correctionIdentity, 80),
    sourceObjectId: id(event?.sourceObjectId),
    sourceType: String(event?.sourceType || ''),
    parentObjectId: id(event?.parentObjectId),
    sourceUseId: use.useId,
    objectType,
    objectId: id(object),
    objectTitle: clean(object?.title || object?.draft?.title || object?.origin?.pageTitle, 240),
    objectHref: objectHref(objectType, object),
    oldQuotation,
    newEvidence,
    changedSegments: diffSegments(oldQuotation, newEvidence),
    sourceTitle: clean(use.title || event?.title, 240),
    sourceHref: sourceHref(use, event),
    sourceUpdatedAt: event?.sourceUpdatedAt || event?.createdAt || null,
    sourceUpdatedOn: datedLabel(event?.sourceUpdatedAt || event?.createdAt),
    reviewedOn: receipt?.completedAt ? datedLabel(receipt.completedAt) : '',
    whatChanged: 'The saved passage was corrected.',
    whatItAffects: clean(object?.title || object?.draft?.title || 'this work', 240),
    whatINeed: 'Keep this work, change the quotation, or record no change — including when you cannot tell.',
    disposition: disposition || null,
    receipt,
    ui: disposition ? 'settled' : 'review',
    generatedAt: now
  };
};

const findCorrectionEvent = async ({ WikiSourceEvent, userId, identity }) => {
  if (!WikiSourceEvent?.findOne || !identity) return null;
  let query = WikiSourceEvent.findOne({ userId, 'metadata.correctionIdentity': identity });
  return query?.lean ? query.lean() : query;
};

const listCorrectionEvents = async ({ WikiSourceEvent, userId, sourceObjectIds = [] }) => {
  const ids = [...new Set((Array.isArray(sourceObjectIds) ? sourceObjectIds : []).map(id).filter(Boolean))];
  if (!WikiSourceEvent?.find || !ids.length) return [];
  let query = WikiSourceEvent.find({
    userId,
    'metadata.kind': 'source_correction',
    sourceObjectId: { $in: ids }
  });
  query = query.sort?.({ createdAt: 1 }) || query;
  const rows = await (query.lean ? query.lean() : query) || [];
  return Array.isArray(rows) ? rows : [];
};

const loadReceipt = async ({ NoeisReceipt, userId, key }) => {
  if (!NoeisReceipt?.findOne || !key) return null;
  return serializeStoredReceipt(await NoeisReceipt.findOne({ userId, receiptId: key }));
};

/**
 * Record a mechanical source correction. Duplicate previous+new text on the
 * same source is one event. Unchanged text is not news.
 */
const recordSourceCorrection = async ({
  WikiSourceEvent,
  userId,
  sourceType = 'highlight',
  sourceObjectId,
  parentObjectId = null,
  provider = 'library',
  externalId = '',
  title = '',
  url = '',
  previousText = '',
  text = '',
  sourceUpdatedAt = null,
  metadata = {}
} = {}) => {
  const oldQuote = clean(previousText, 8000);
  const newEvidence = clean(text, 8000);
  if (!WikiSourceEvent || !userId || !sourceObjectId) {
    return { event: null, duplicate: false, reason: 'incomplete' };
  }
  if (!oldQuote || !newEvidence || oldQuote === newEvidence) {
    return { event: null, duplicate: false, reason: 'no_impact' };
  }
  const identity = correctionIdentity({
    userId,
    sourceType,
    sourceObjectId,
    previousText: oldQuote,
    text: newEvidence
  });
  const existing = await findCorrectionEvent({ WikiSourceEvent, userId, identity });
  if (existing) return { event: existing, duplicate: true, reason: 'duplicate' };

  let priorQuery = WikiSourceEvent.findOne?.({
    userId,
    sourceType,
    sourceObjectId
  });
  priorQuery = priorQuery?.sort?.({ createdAt: -1 }) || priorQuery;
  const prior = priorQuery?.lean ? await priorQuery.lean() : await priorQuery;

  const event = await createWikiSourceEvent({
    WikiSourceEvent,
    userId,
    sourceType,
    sourceObjectId,
    parentObjectId,
    provider,
    externalId: externalId || id(sourceObjectId),
    eventType: 'updated',
    title,
    summary: newEvidence,
    text: newEvidence,
    url,
    sourceUpdatedAt: sourceUpdatedAt || new Date(),
    status: 'processed',
    metadata: {
      ...((metadata && typeof metadata === 'object' && !Array.isArray(metadata)) ? metadata : {}),
      kind: 'source_correction',
      previousText: oldQuote,
      correctionIdentity: identity,
      correctsEventId: id(prior)
    }
  });
  if (event && !event.processedAt && typeof event.save === 'function') {
    event.processedAt = new Date();
    await event.save();
  }
  return { event, duplicate: false, reason: 'recorded' };
};

const selectAuthoredSourceCorrection = async ({
  models = {},
  userId,
  objectType,
  object,
  now = new Date()
} = {}) => {
  if (!userId || !object || !['notebook', 'exploration'].includes(objectType)) return null;
  const uses = usesOf(objectType, object);
  if (!uses.length) return null;
  const sourceObjectIds = uses.flatMap((use) => [use.highlightId, use.articleId]).filter(Boolean);
  const events = await listCorrectionEvents({
    WikiSourceEvent: models.WikiSourceEvent,
    userId,
    sourceObjectIds
  });
  const seenIdentity = new Set();
  let settled = null;
  for (const event of events) {
    const identity = clean(event?.metadata?.correctionIdentity, 80) || id(event);
    if (seenIdentity.has(identity)) continue;
    seenIdentity.add(identity);
    const previousText = clean(event?.metadata?.previousText, 6000);
    const newEvidence = clean(event?.text, 6000);
    if (!previousText || !newEvidence || previousText === newEvidence) continue;
    const use = uses.find((row) => sameRecordedUse(row, event));
    if (!use) continue;
    const key = receiptKey({
      userId,
      eventId: id(event),
      objectType,
      objectId: id(object)
    });
    const receipt = await loadReceipt({
      NoeisReceipt: models.NoeisReceipt,
      userId,
      key
    });
    const oldQuotation = clean(
      receipt?.provenance?.oldQuotation || use.quotation || previousText,
      6000
    );
    if (!oldQuotation) continue;
    const preview = buildPreview({
      event,
      use: { ...use, quotation: oldQuotation },
      objectType,
      object,
      receipt,
      now
    });
    if (receipt && TERMINAL.has(receipt?.provenance?.disposition)) {
      if (!settled) settled = preview;
      continue;
    }
    if (clean(use.quotation, 6000) === newEvidence) continue;
    return preview;
  }
  return settled;
};

const applyChange = async ({ objectType, object, preview }) => {
  const nextQuote = preview.newEvidence;
  if (objectType === 'notebook') {
    const blocks = Array.isArray(object.blocks) ? object.blocks : [];
    let changed = false;
    blocks.forEach((block) => {
      const type = String(block?.type || '');
      const isEmbed = type === 'highlight_embed' || type === 'highlight-ref' || type === 'highlight_ref';
      if (!isEmbed) return;
      const matchesHighlight = preview.sourceType === 'highlight'
        && id(block.highlightId) === preview.sourceObjectId;
      const matchesArticle = preview.sourceType === 'article'
        && id(block.articleId) === preview.sourceObjectId;
      if (!matchesHighlight && !matchesArticle) return;
      block.text = nextQuote;
      changed = true;
    });
    if (changed && typeof object.markModified === 'function') object.markModified('blocks');
    if (changed && typeof object.save === 'function') await object.save();
    return object;
  }
  const draft = object.draft || {};
  if (draft.selectedSource && (
    (preview.sourceType === 'highlight' && id(draft.selectedSource.highlightId) === preview.sourceObjectId)
    || (preview.sourceType === 'article' && id(draft.selectedSource.articleId) === preview.sourceObjectId)
  )) {
    draft.selectedSource.passage = nextQuote;
    object.draft = draft;
    if (typeof object.markModified === 'function') object.markModified('draft');
  }
  if (
    preview.sourceType === 'highlight'
    && id(object.highlightId) === preview.sourceObjectId
    && object.origin
  ) {
    object.origin.claimText = nextQuote;
    if (typeof object.markModified === 'function') object.markModified('origin');
  }
  object.revision = Number(object.revision || 0) + 1;
  if (typeof object.save === 'function') await object.save();
  return object;
};

const disposeAuthoredSourceCorrection = async ({
  models = {},
  userId,
  objectType,
  object,
  eventId,
  action,
  now = new Date()
} = {}) => {
  const selected = String(action || '').trim().toLowerCase().replace(/-/g, '_');
  if (!ACTIONS.includes(selected)) {
    throw new AuthoredSourceCorrectionError('Choose keep, change, or no change.', 400, 'invalid_disposition');
  }
  if (!object || !id(object)) {
    throw new AuthoredSourceCorrectionError('The work was not found.', 404, 'object_not_found');
  }
  const preview = await selectAuthoredSourceCorrection({
    models,
    userId,
    objectType,
    object: plain(object),
    now
  });
  if (!preview || id(preview.eventId) !== id(eventId)) {
    throw new AuthoredSourceCorrectionError('There is no source correction to review here.', 404, 'correction_not_found');
  }
  if (preview.receipt && TERMINAL.has(preview.receipt?.provenance?.disposition)) {
    return { preview, receipt: preview.receipt, replay: true, object: plain(object) };
  }

  if (selected === 'change') {
    await applyChange({ objectType, object, preview });
  }

  const statusLabel = {
    keep: 'kept',
    change: 'changed',
    no_change: 'no_change'
  }[selected];
  const summary = {
    keep: 'Kept this work. The old quotation remains what was used.',
    change: 'The quotation now follows the new evidence. The writing is unchanged.',
    no_change: 'No change. The correction does not require this work to move.'
  }[selected];
  const receipt = await persistNoeisReceipt({
    NoeisReceipt: models.NoeisReceipt,
    userId,
    receipt: {
      id: receiptKey({
        userId,
        eventId: preview.eventId,
        objectType,
        objectId: id(object)
      }),
      kind: KIND,
      source: objectType,
      sourceLabel: preview.objectTitle || 'Authored work',
      status: 'completed',
      title: preview.sourceTitle || 'Source correction',
      summary,
      provenance: {
        eventId: preview.eventId,
        sourceEventId: preview.sourceEventId,
        eventIdentity: preview.eventIdentity,
        sourceObjectId: preview.sourceObjectId,
        sourceType: preview.sourceType,
        sourceUseId: preview.sourceUseId,
        objectType,
        objectId: id(object),
        ...(id(object.pageId) ? { pageId: id(object.pageId) } : {}),
        oldQuotation: preview.oldQuotation,
        newEvidence: preview.newEvidence,
        disposition: selected,
        snapshotUnchanged: selected !== 'change',
        writingRewritten: false,
        resolvedAt: now
      },
      touched: [{
        type: objectType === 'notebook' ? 'notebook' : 'authored_exploration',
        id: id(object),
        title: preview.objectTitle
      }],
      completedAt: now,
      createdAt: now
    }
  });
  const settled = buildPreview({
    event: {
      _id: preview.eventId,
      sourceType: preview.sourceType,
      sourceObjectId: preview.sourceObjectId,
      parentObjectId: preview.parentObjectId,
      text: preview.newEvidence,
      title: preview.sourceTitle,
      url: preview.sourceHref,
      sourceUpdatedAt: preview.sourceUpdatedAt,
      metadata: {
        previousText: preview.oldQuotation,
        correctionIdentity: preview.eventIdentity,
        kind: 'source_correction'
      }
    },
    use: {
      useId: preview.sourceUseId,
      articleId: preview.sourceType === 'article' ? preview.sourceObjectId : '',
      highlightId: preview.sourceType === 'highlight' ? preview.sourceObjectId : '',
      quotation: preview.oldQuotation,
      title: preview.sourceTitle
    },
    objectType,
    object: plain(object),
    receipt,
    now
  });
  return {
    preview: settled,
    receipt,
    replay: false,
    object: plain(object)
  };
};

const attachAuthoredSourceCorrection = async ({
  models = {},
  userId,
  objectType,
  object
} = {}) => {
  if (!object) return object;
  const payload = plain(object) || object;
  const sourceCorrection = await selectAuthoredSourceCorrection({
    models,
    userId,
    objectType,
    object: payload
  });
  if (!sourceCorrection) return payload;
  if (payload && typeof payload === 'object') {
    payload.sourceCorrection = sourceCorrection;
    return payload;
  }
  return payload;
};

module.exports = {
  ACTIONS,
  KIND,
  AuthoredSourceCorrectionError,
  attachAuthoredSourceCorrection,
  correctionIdentity,
  disposeAuthoredSourceCorrection,
  recordSourceCorrection,
  recordedUsesFromExploration,
  recordedUsesFromNotebook,
  receiptKey,
  selectAuthoredSourceCorrection
};
