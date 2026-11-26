// A wiki page's sources: draft suggestions, what an ingest takes in, source refs, proposals, and the graph trace an ingest leaves.
const {
  PAGE_TYPES,
  PAGE_TYPE_ALIASES,
  INGEST_SOURCE_TYPES,
  normalizeObjectId,
  serializeId,
  SOURCE_REF_TYPES,
  clonePlain,
  INVERSE_CONNECTION_RELATION_TYPES,
  SOURCE_REF_ADDED_BY
} = require('./wikiPageShape');
const { normalizePageType } = require('./wikiPageStructureService');
const { wordBoundaryTrim } = require('../lib/editorialText');

const buildWikiDraftSuggestions = ({ page }) => {
  const sourceIds = Array.isArray(page.sourceRefs)
    ? page.sourceRefs.map(source => source._id).filter(Boolean)
    : [];
  const stamp = Date.now();
  const seedText = String(page.createdFrom?.text || '').trim();
  return [
    {
      id: `outline-${stamp}`,
      type: 'outline',
      title: 'Suggested outline',
      text: `Turn "${page.title}" into a short page with context, source-backed claims, and open questions.`,
      sourceRefIds: sourceIds
    },
    {
      id: `edit-${stamp}`,
      type: 'edit',
      title: 'Next edit',
      text: seedText || 'Add a concise working thesis, then attach the sources that support or challenge it.',
      sourceRefIds: sourceIds
    },
    {
      id: `gap-${stamp}`,
      type: 'gap',
      title: 'Evidence gap',
      text: sourceIds.length > 0
        ? 'Review each attached source and cite the strongest claim before publishing.'
        : 'Attach at least one source so the page has a traceable evidence trail.',
      sourceRefIds: []
    }
  ];
};

const buildWikiDraftState = ({ page, now = new Date(), model = 'local-stub', error = null }) => {
  if (error) {
    return {
      ...(page.aiState?.toObject ? page.aiState.toObject() : page.aiState || {}),
      draftStatus: 'error',
      lastError: String(error.message || error || 'Draft failed.'),
      errorCode: String(error.code || 'DRAFT_FAILED'),
      model,
      sourceScopeAtDraft: page.sourceScope
    };
  }

  return {
    draftStatus: 'ready',
    draftRequestedAt: page.aiState?.draftRequestedAt || now,
    draftStartedAt: page.aiState?.draftStartedAt || now,
    draftCompletedAt: now,
    lastDraftedAt: now,
    lastError: '',
    errorCode: '',
    model,
    sourceScopeAtDraft: page.sourceScope,
    sourceRefIdsAtDraft: Array.isArray(page.sourceRefs)
      ? page.sourceRefs.map(source => source._id).filter(Boolean)
      : [],
    suggestions: buildWikiDraftSuggestions({ page })
  };
};

const validateEnumField = (field, value, allowedValues) => {
  if (value === undefined) return null;
  const normalized = String(value || '').trim();
  if (!allowedValues.has(normalized)) {
    return { error: `${field} must be one of: ${Array.from(allowedValues).join(', ')}.` };
  }
  return { value: normalized };
};

const validatePageType = (value) => {
  if (value === undefined) return null;
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return { error: `pageType must be one of: ${Array.from(PAGE_TYPES).join(', ')}.` };
  const normalized = normalizePageType(raw);
  if (normalized === 'topic' && raw !== 'topic' && PAGE_TYPE_ALIASES[raw] !== 'topic') {
    return { error: `pageType must be one of: ${Array.from(PAGE_TYPES).join(', ')}.` };
  }
  return { value: normalized, raw };
};

const pageTypeQueryValue = (pageType) => {
  if (!pageType?.value) return null;
  const legacyValues = Object.entries(PAGE_TYPE_ALIASES)
    .filter(([, normalized]) => normalized === pageType.value)
    .map(([legacy]) => legacy);
  return legacyValues.length ? { $in: [pageType.value, ...legacyValues] } : pageType.value;
};

const normalizeIngestSource = (value = {}) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { error: 'source payload must be an object.' };
  }
  const rawType = String(value.type || '').trim().toLowerCase();
  if (!INGEST_SOURCE_TYPES.has(rawType)) {
    return { error: `source.type must be one of: ${Array.from(INGEST_SOURCE_TYPES).join(', ')}.` };
  }
  const objectId = normalizeObjectId(value.objectId);
  if (value.objectId && !objectId) return { error: 'source.objectId must be a valid id.' };
  const url = String(value.url || '').trim().slice(0, 1000);
  const text = String(value.text || '').trim().slice(0, 8000);
  if (!objectId && !url && !text) {
    return { error: 'source must include objectId, url, or text.' };
  }
  const sourceType = rawType === 'url' || rawType === 'text' ? 'external' : rawType;
  return {
    value: {
      sourceType,
      objectId,
      url,
      text,
      title: String(value.title || '').trim().slice(0, 240),
      summary: String(value.summary || '').trim().slice(0, 1200),
      rawType
    }
  };
};

const cleanWikiSummary = (value = '', maxLength = 360) => {
  const text = String(value || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return '';
  return wordBoundaryTrim(text, { maxLength });
};

const serializeSourceRefFromEvent = (event = {}) => ({
  type: event.sourceType || 'external',
  objectId: serializeId(event.sourceObjectId),
  url: event.url || '',
  title: event.title || '',
  summary: cleanWikiSummary(event.summary || ''),
  text: event.text || ''
});

const sourceRefFromWikiSourceEvent = (event = {}) => {
  if (!event) return null;
  const raw = typeof event.toObject === 'function' ? event.toObject({ virtuals: false }) : event;
  const sourceType = SOURCE_REF_TYPES.has(String(raw.sourceType || '').trim())
    ? String(raw.sourceType || '').trim()
    : 'external';
  const isGitHubConfig = raw.provider === 'github-repo'
    && /\b(?:package\.json|\.github\/workflows\/[^/]+\.ya?ml)\b/i.test(String(raw.metadata?.path || raw.title || ''));
  const snippetLimit = isGitHubConfig ? 4000 : 1000;
  return {
    type: sourceType,
    objectId: raw.sourceObjectId || raw._id || null,
    parentObjectId: null,
    title: String(raw.title || raw.url || 'Repository source').trim().slice(0, 240),
    snippet: cleanWikiSummary(raw.text || raw.summary || '', snippetLimit),
    url: String(raw.url || '').trim().slice(0, 1000),
    citationLabel: '',
    provider: String(raw.provider || '').trim().slice(0, 120),
    metadata: raw.metadata && typeof raw.metadata === 'object' ? clonePlain(raw.metadata) : {},
    addedBy: 'ai'
  };
};

const attachSourceEventsToPageRefs = async ({ page, events = [], limit = 12 } = {}) => {
  if (!page || !Array.isArray(events) || !events.length) return page;
  const existing = Array.isArray(page.sourceRefs) ? page.sourceRefs : [];
  const seen = new Set(existing.map(source => [
    source.type || '',
    source.objectId ? String(source.objectId) : '',
    source.url || '',
    source.title || ''
  ].join(':')));
  const additions = [];
  events.slice(0, limit).forEach((event) => {
    const ref = sourceRefFromWikiSourceEvent(event);
    if (!ref || (!ref.objectId && !ref.title && !ref.snippet && !ref.url)) return;
    const key = [ref.type || '', ref.objectId ? String(ref.objectId) : '', ref.url || '', ref.title || ''].join(':');
    if (seen.has(key)) return;
    seen.add(key);
    additions.push(ref);
  });
  if (!additions.length) return page;
  page.sourceRefs = [...existing, ...additions].slice(0, 80);
  if (typeof page.markModified === 'function') page.markModified('sourceRefs');
  if (typeof page.save === 'function') await page.save();
  return page;
};

const markWikiSourceEventFinished = async ({ WikiSourceEvent, event, userId, status = 'processed', errorMessage = '' } = {}) => {
  if (!event) return null;
  event.status = status;
  event.processedAt = new Date();
  event.errorMessage = errorMessage;
  if (typeof event.save === 'function') return event.save();
  if (!WikiSourceEvent?.findOneAndUpdate) return event;
  return WikiSourceEvent.findOneAndUpdate(
    { _id: event._id, userId },
    { $set: { status, processedAt: event.processedAt, errorMessage } },
    { new: true }
  );
};

const serializeIngestRun = ({ event, run = null } = {}) => {
  if (!event) return null;
  const rawEvent = typeof event.toObject === 'function' ? event.toObject({ virtuals: false }) : event;
  const rawRun = run && typeof run.toObject === 'function' ? run.toObject({ virtuals: false }) : run;
  return {
    runId: serializeId(rawEvent._id),
    sourceRef: serializeSourceRefFromEvent(rawEvent),
    affectedPageIds: Array.isArray(rawEvent.affectedPageIds) ? rawEvent.affectedPageIds.map(serializeId).filter(Boolean) : [],
    candidateUpdates: Array.isArray(rawEvent.metadata?.candidateUpdates) ? rawEvent.metadata.candidateUpdates : [],
    reviewStatus: rawEvent.metadata?.ingestReviewStatus || '',
    summary: cleanWikiSummary(rawRun?.summary || rawEvent.summary || rawEvent.errorMessage || ''),
    status: rawEvent.status || rawRun?.status || 'pending',
    suggestedCreatePage: (
      rawEvent.status === 'ignored'
      && !(Array.isArray(rawEvent.affectedPageIds) && rawEvent.affectedPageIds.length)
      && rawEvent.metadata?.ignoredReason === 'no_matching_wiki_page'
    ) ? {
        title: rawEvent.title || rawEvent.url || rawEvent.sourceType || 'Untitled wiki page',
        source: serializeSourceRefFromEvent(rawEvent)
      } : null,
    undoneAt: rawEvent.metadata?.undoneAt || null,
    startedAt: rawRun?.startedAt || rawEvent.createdAt || null,
    completedAt: rawEvent.processedAt || rawRun?.completedAt || null,
    sourceEventId: serializeId(rawEvent._id),
    maintenanceRunId: serializeId(rawRun?._id)
  };
};

const connectionTargetForIngestCandidate = (candidate = {}) => {
  const targetType = String(candidate.targetType || candidate.target_type || '').trim().toLowerCase();
  const pageId = serializeId(candidate.pageId || candidate.page_id);
  const objectId = String(candidate.objectId || candidate.object_id || '').trim();
  if (targetType === 'wiki_page' && pageId) return { type: 'wiki_page', id: pageId };
  if (['concept', 'question', 'notebook'].includes(targetType) && objectId) return { type: targetType, id: objectId };
  return null;
};

const connectionSourceForIngestEvent = (event = {}) => {
  const sourceType = SOURCE_REF_TYPES.has(String(event.sourceType || '').trim())
    ? String(event.sourceType || '').trim()
    : 'external';
  const objectId = serializeId(event.sourceObjectId);
  const fallbackId = serializeId(event._id);
  if (objectId) return { type: sourceType, id: objectId };
  if (fallbackId) return { type: 'external', id: fallbackId };
  return null;
};

const persistIngestCandidateGraphTrace = async ({
  Connection,
  userId,
  event,
  candidate
} = {}) => {
  if (!Connection || !userId || !event || !candidate) return null;
  const source = connectionSourceForIngestEvent(event);
  const target = connectionTargetForIngestCandidate(candidate);
  if (!source || !target || (source.type === target.type && source.id === target.id)) return null;

  const relationType = 'supports';
  const reciprocalRelationType = INVERSE_CONNECTION_RELATION_TYPES[relationType] || 'supported_by';
  const scopeType = target.type === 'question' ? 'question' : '';
  const scopeId = target.type === 'question' ? target.id : '';
  const forward = {
    userId,
    fromType: source.type,
    fromId: source.id,
    toType: target.type,
    toId: target.id,
    relationType,
    scopeType,
    scopeId
  };
  const reciprocal = {
    userId,
    fromType: target.type,
    fromId: target.id,
    toType: source.type,
    toId: source.id,
    relationType: reciprocalRelationType,
    scopeType,
    scopeId
  };

  const save = async (row) => {
    if (typeof Connection.findOneAndUpdate === 'function') {
      return Connection.findOneAndUpdate(
        row,
        { $setOnInsert: row, $set: { updatedAt: new Date() } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    }
    if (typeof Connection.create === 'function') {
      try {
        return await Connection.create(row);
      } catch (error) {
        if (error?.code !== 11000) throw error;
      }
    }
    return null;
  };

  const [forwardRow, reciprocalRow] = await Promise.all([save(forward), save(reciprocal)]);
  return {
    bidirectional: Boolean(forwardRow && reciprocalRow),
    relationType,
    reciprocalRelationType,
    source,
    target,
    forwardId: serializeId(forwardRow?._id),
    reciprocalId: serializeId(reciprocalRow?._id)
  };
};

const activityEventTime = (event = {}) => new Date(event.at || 0).getTime();

const sortActivityEvents = (events = []) => events
  .filter(event => event && event.at)
  .sort((a, b) => activityEventTime(b) - activityEventTime(a));

const normalizeSourceRef = (value = {}) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { error: 'sourceRef payload must be an object.' };
  }

  const type = String(value.type || '').trim().toLowerCase();
  if (!SOURCE_REF_TYPES.has(type)) {
    return { error: `type must be one of: ${Array.from(SOURCE_REF_TYPES).join(', ')}.` };
  }

  const addedBy = String(value.addedBy || 'user').trim();
  if (!SOURCE_REF_ADDED_BY.has(addedBy)) {
    return { error: "addedBy must be one of: user, ai." };
  }

  const objectId = normalizeObjectId(value.objectId);
  if (value.objectId && !objectId) {
    return { error: 'objectId must be a valid id.' };
  }
  const parentObjectId = normalizeObjectId(value.parentObjectId);
  if (value.parentObjectId && !parentObjectId) {
    return { error: 'parentObjectId must be a valid id.' };
  }

  const sourceRef = {
    type,
    objectId,
    parentObjectId,
    title: String(value.title || '').trim().slice(0, 240),
    snippet: String(value.snippet || '').trim().slice(0, 6000),
    url: String(value.url || '').trim().slice(0, 1000),
    citationLabel: String(value.citationLabel || '').trim().slice(0, 120),
    addedBy
  };

  if (!sourceRef.objectId && !sourceRef.title && !sourceRef.snippet && !sourceRef.url) {
    return { error: 'sourceRef must include objectId, title, snippet, or url.' };
  }

  return { value: sourceRef };
};

// A new page may cite this many sources at birth: enough for every passage of a
// kept thread or subject, bounded so one request cannot carry an archive.
const INITIAL_SOURCE_REFS_MAX = 50;

const normalizeInitialSourceRefs = ({ initialSourceRef, initialSourceRefs, createdFrom }) => {
  const rawRefs = [];
  if (initialSourceRef !== undefined) rawRefs.push(initialSourceRef);
  if (initialSourceRefs !== undefined) {
    if (!Array.isArray(initialSourceRefs)) {
      return { error: 'initialSourceRefs must be an array.' };
    }
    rawRefs.push(...initialSourceRefs);
  }
  const sourceRefs = [];
  const seen = new Set();
  for (const rawRef of rawRefs.slice(0, INITIAL_SOURCE_REFS_MAX)) {
    const sourceRef = normalizeSourceRef(rawRef);
    if (sourceRef?.error) return { error: sourceRef.error };
    const value = {
      ...sourceRef.value,
      objectId: sourceRef.value.objectId
        || (sourceRef.value.type === createdFrom.type ? createdFrom.objectId : null)
    };
    const key = [
      value.type,
      value.objectId || '',
      value.url || '',
      value.citationLabel || '',
      value.title || '',
      value.snippet || ''
    ].join(':');
    if (seen.has(key)) continue;
    seen.add(key);
    sourceRefs.push(value);
  }
  return { value: sourceRefs };
};

const serializeWikiProposal = (proposal) => {
  if (!proposal) return proposal;
  const raw = typeof proposal.toObject === 'function'
    ? proposal.toObject({ virtuals: false })
    : { ...proposal };
  return {
    ...raw,
    sourceRefs: Array.isArray(raw.sourceRefs) ? raw.sourceRefs : [],
    connectedPageRefs: Array.isArray(raw.connectedPageRefs) ? raw.connectedPageRefs : [],
    connectedConceptRefs: Array.isArray(raw.connectedConceptRefs) ? raw.connectedConceptRefs : [],
    signals: Array.isArray(raw.signals) ? raw.signals : [],
    starterClaims: Array.isArray(raw.starterClaims) ? raw.starterClaims : [],
    openQuestions: Array.isArray(raw.openQuestions) ? raw.openQuestions : []
  };
};

const proposalsAreStale = (proposals = [], maxAgeMs = 24 * 60 * 60 * 1000) => {
  if (!Array.isArray(proposals) || proposals.length === 0) return true;
  const latest = proposals.reduce((max, proposal) => {
    const t = new Date(proposal?.generation?.generatedAt || proposal?.updatedAt || 0).getTime();
    return Number.isFinite(t) ? Math.max(max, t) : max;
  }, 0);
  return Date.now() - latest > maxAgeMs;
};

module.exports = {
  buildWikiDraftState,
  validateEnumField,
  validatePageType,
  pageTypeQueryValue,
  normalizeIngestSource,
  cleanWikiSummary,
  attachSourceEventsToPageRefs,
  markWikiSourceEventFinished,
  serializeIngestRun,
  persistIngestCandidateGraphTrace,
  sortActivityEvents,
  normalizeSourceRef,
  normalizeInitialSourceRefs,
  serializeWikiProposal,
  proposalsAreStale
};
