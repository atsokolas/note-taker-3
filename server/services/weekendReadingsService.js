const { createWikiRevision: defaultCreateWikiRevision } = require('./wikiRevisionService');
const { persistNoeisReceipt: defaultPersistNoeisReceipt } = require('./noeisReceiptService');
const { resolveResearchEditionProfile } = require('./researchEditionProfile');

const READING_ROLES = new Set([
  'thesis_evidence',
  'counterevidence',
  'context',
  'intellectual_broadening'
]);

const SOURCE_QUALITIES = new Set([
  'primary',
  'high_quality_secondary',
  'secondary',
  'unknown'
]);

const AI_EVIDENCE_LAYERS = new Set([
  'models_methods',
  'infrastructure_systems',
  'evaluation_counterevidence'
]);

const TRACKING_QUERY_KEYS = new Set([
  'fbclid',
  'gclid',
  'mc_cid',
  'mc_eid'
]);

const SENSITIVE_QUERY_KEYS = new Set([
  'access_key',
  'access_token',
  'api_key',
  'apikey',
  'auth',
  'authorization',
  'client_secret',
  'credential',
  'credentials',
  'id_token',
  'jwt',
  'key',
  'oauth_token',
  'password',
  'passwd',
  'private_key',
  'refresh_token',
  'resource_key',
  'resourcekey',
  'secret',
  'session_id',
  'session_token',
  'sig',
  'signature',
  'ticket',
  'token',
  'token_value',
  'oauth_code',
  'x_amz_credential',
  'x_amz_security_token',
  'x_amz_signature',
  'x_goog_credential',
  'x_goog_signature'
]);

const SENSITIVE_QUERY_COMPONENTS = new Set([
  'auth', 'authorization', 'credential', 'credentials', 'jwt', 'password', 'passwd',
  'secret', 'sig', 'signature'
]);

const normalizeSensitiveQueryKey = value => String(value || '')
  .trim()
  .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
  .toLowerCase()
  .replace(/[.\[\]-]+/g, '_')
  .replace(/_+/g, '_')
  .replace(/^_|_$/g, '');

const isSensitiveQueryKey = value => {
  const normalized = normalizeSensitiveQueryKey(value);
  if (SENSITIVE_QUERY_KEYS.has(normalized)) return true;
  const components = normalized.split('_').filter(Boolean);
  if (components.some(component => SENSITIVE_QUERY_COMPONENTS.has(component))) return true;
  if (components.includes('ticket') || components.includes('resourcekey')) return true;
  if (components.includes('resource') && components.includes('key')) return true;
  if (components.includes('session') && components.some(component => ['id', 'key', 'token'].includes(component))) return true;
  if (components.includes('oauth') && components.some(component => ['code', 'key', 'token'].includes(component))) return true;
  if (components.includes('token')) return normalized !== 'token_count';
  if (components.includes('key')) {
    return components.some(component => ['access', 'api', 'client', 'private', 'public', 'secret', 'signing'].includes(component));
  }
  return false;
};

const clean = (value = '', limit = 4000) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit);

const toDate = (value, field) => {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`${field} must be a valid date.`);
  return date;
};

const dateKey = (value, field) => toDate(value, field).toISOString().slice(0, 10);

const canonicalizeReadingUrl = (value = '', { allowHttp = false } = {}) => {
  let parsed;
  try {
    parsed = new URL(clean(value, 2000));
  } catch (_error) {
    throw new Error('Each Weekend Readings item must include a valid direct URL.');
  }
  if (parsed.protocol !== 'https:' && !(allowHttp && parsed.protocol === 'http:')) {
    throw new Error(allowHttp
      ? 'Weekend Readings URLs must use https or explicitly accepted http.'
      : 'Weekend Readings URLs must use https.');
  }
  if (parsed.username || parsed.password) {
    throw new Error('Weekend Readings URLs cannot contain embedded credentials.');
  }
  const sensitiveKey = Array.from(parsed.searchParams.keys()).find(isSensitiveQueryKey);
  if (sensitiveKey) {
    throw new Error(`Weekend Readings URLs cannot contain sensitive query parameter "${sensitiveKey}".`);
  }
  parsed.hash = '';
  parsed.hostname = parsed.hostname.toLowerCase();
  if ((parsed.protocol === 'https:' && parsed.port === '443') || (parsed.protocol === 'http:' && parsed.port === '80')) {
    parsed.port = '';
  }
  Array.from(parsed.searchParams.keys()).forEach((key) => {
    const normalized = key.toLowerCase();
    if (normalized.startsWith('utm_') || TRACKING_QUERY_KEYS.has(normalized)) {
      parsed.searchParams.delete(key);
    }
  });
  parsed.searchParams.sort();
  if (parsed.pathname !== '/') parsed.pathname = parsed.pathname.replace(/\/+$/, '') || '/';
  return parsed.toString();
};

const normalizeIdList = (value = []) => Array.from(new Set(
  (Array.isArray(value) ? value : [])
    .map(item => clean(item, 120))
    .filter(Boolean)
)).slice(0, 40);

const normalizeIntakeProvenance = (value = []) => (Array.isArray(value) ? value : [])
  .slice(0, 12)
  .map(entry => ({
    sourceType: clean(entry?.sourceType, 120),
    sourceName: clean(entry?.sourceName, 240),
    schemaVersion: clean(entry?.schemaVersion, 40),
    generatedAt: entry?.generatedAt ? toDate(entry.generatedAt, 'intakeProvenance.generatedAt') : null,
    sourceJobId: clean(entry?.sourceJobId, 160),
    externalId: clean(entry?.externalId, 240),
    signalQuality: clean(entry?.signalQuality, 120)
  }))
  .filter(entry => entry.sourceType && entry.externalId);

const normalizeWeekendReadingItem = (item = {}, index = 0, options = {}) => {
  const profile = resolveResearchEditionProfile(options.publicationProfile);
  const title = clean(item.title, 240);
  const canonicalUrl = canonicalizeReadingUrl(item.url || item.canonicalUrl, options);
  const whyItMatters = clean(item.whyItMatters, 1200);
  const readingRole = clean(item.readingRole, 80).toLowerCase();
  const sourceQuality = clean(item.sourceQuality || 'unknown', 80).toLowerCase();
  if (!title) throw new Error(`Weekend Readings item ${index + 1} needs a title.`);
  if (!whyItMatters) throw new Error(`Weekend Readings item ${index + 1} needs whyItMatters.`);
  if (!READING_ROLES.has(readingRole)) {
    throw new Error(`Weekend Readings item ${index + 1} has an invalid readingRole.`);
  }
  if (!SOURCE_QUALITIES.has(sourceQuality)) {
    throw new Error(`Weekend Readings item ${index + 1} has an invalid sourceQuality.`);
  }
  const boundary = clean(item.boundary, 800);
  if (readingRole === 'context' && !boundary) {
    throw new Error(`Weekend Readings context item ${index + 1} needs a boundary statement.`);
  }
  const publishedAt = item.publishedAt ? toDate(item.publishedAt, `items[${index}].publishedAt`) : null;
  const normalized = {
    title,
    url: canonicalUrl,
    canonicalUrl,
    whyItMatters,
    readingRole,
    sourceQuality,
    sourceLabel: clean(item.sourceLabel || item.provider || new URL(canonicalUrl).hostname, 160),
    publishedAt,
    sourceDateLabel: publishedAt ? publishedAt.toISOString().slice(0, 10) : (clean(item.sourceDateLabel, 80) || 'Not recorded'),
    publicRelationship: clean(item.publicRelationship, 500) || 'Unassigned',
    boundary,
    affectedQuestion: clean(item.affectedQuestion, 500),
    affectedClaimIds: normalizeIdList(item.affectedClaimIds),
    affectedUnknownIds: normalizeIdList(item.affectedUnknownIds),
    affectedFalsifierIds: normalizeIdList(item.affectedFalsifierIds),
    intakeProvenance: normalizeIntakeProvenance(item.intakeProvenance),
    requiresHumanAcceptance: item.requiresHumanAcceptance !== false
  };
  const libraryArticleId = clean(item.libraryArticleId, 120);
  if (libraryArticleId) normalized.libraryArticleId = libraryArticleId;
  if (profile.key === 'this_week_in_ai') {
    normalized.evidenceLayer = clean(item.evidenceLayer, 80).toLowerCase();
    normalized.technicalApproach = clean(item.technicalApproach, 1200);
    normalized.evidenceAssessment = clean(item.evidenceAssessment, 1200);
    normalized.consequence = clean(item.consequence, 1200);
    if (!AI_EVIDENCE_LAYERS.has(normalized.evidenceLayer)) {
      throw new Error(`This Week in AI item ${index + 1} has an invalid evidenceLayer.`);
    }
    if (!normalized.technicalApproach) {
      throw new Error(`This Week in AI item ${index + 1} needs a technicalApproach.`);
    }
    if (!normalized.evidenceAssessment) {
      throw new Error(`This Week in AI item ${index + 1} needs an evidenceAssessment.`);
    }
    if (!normalized.consequence) {
      throw new Error(`This Week in AI item ${index + 1} needs a consequence.`);
    }
    if (!normalized.boundary) {
      throw new Error(`This Week in AI item ${index + 1} needs an evidence boundary.`);
    }
  }
  return normalized;
};

const normalizeWeekendReadingItems = (items = [], options = {}) => {
  const profile = resolveResearchEditionProfile(options.publicationProfile);
  if (!Array.isArray(items) || !items.length) {
    throw new Error(`${profile.titleLabel} requires at least one selected item.`);
  }
  if (items.length < profile.minItems || items.length > profile.maxItems) {
    throw new Error(`${profile.titleLabel} requires ${profile.minItems}-${profile.maxItems} selected items.`);
  }
  const seen = new Map();
  return items.map((item, index) => normalizeWeekendReadingItem(item, index, options)).map((item) => {
    if (seen.has(item.canonicalUrl)) {
      throw new Error(`Duplicate Weekend Readings URL: "${item.title}" duplicates "${seen.get(item.canonicalUrl)}".`);
    }
    seen.set(item.canonicalUrl, item.title);
    return item;
  });
};

const textNode = (text, marks = undefined) => ({
  type: 'text',
  text,
  ...(marks ? { marks } : {})
});

const paragraph = (content = []) => ({ type: 'paragraph', content });
const heading = (level, value, marks = undefined) => ({ type: 'heading', attrs: { level }, content: [textNode(value, marks)] });

const roleLabel = (value = '') => ({
  thesis_evidence: 'Thesis evidence',
  counterevidence: 'Counterevidence',
  context: 'Context',
  intellectual_broadening: 'Intellectual broadening'
}[value] || value);

const evidenceLayerLabel = (value = '') => ({
  models_methods: 'Models and methods',
  infrastructure_systems: 'Infrastructure and systems',
  evaluation_counterevidence: 'Evaluation and measurement'
}[value] || value);

const listParagraphs = (values = []) => (Array.isArray(values) ? values : [])
  .map(value => clean(value, 1200))
  .filter(Boolean)
  .map(value => paragraph([textNode(`• ${value}`)]));

const buildThisWeekInAIBody = ({
  authorLabel,
  windowStart,
  windowEnd,
  editorialNote = '',
  weeklyHighlights = [],
  connectingThread = '',
  watchNext = [],
  items = []
} = {}) => {
  const layerOrder = ['models_methods', 'infrastructure_systems', 'evaluation_counterevidence'];
  const evidenceSections = layerOrder.flatMap(layer => {
    const layerItems = items.filter(item => item.evidenceLayer === layer);
    if (!layerItems.length) return [];
    return [
      heading(2, evidenceLayerLabel(layer)),
      ...layerItems.flatMap((item, index) => [
        heading(3, `${items.indexOf(item) + 1}. ${item.title}`, [{ type: 'link', attrs: { href: item.canonicalUrl, target: '_blank', rel: 'noopener noreferrer' } }]),
        paragraph([textNode(`${item.sourceLabel} · ${item.sourceDateLabel}`)]),
        paragraph([textNode(`Finding: ${item.whyItMatters}`)]),
        paragraph([textNode(`How it works: ${item.technicalApproach}`)]),
        paragraph([textNode(`Evidence: ${item.evidenceAssessment}`)]),
        paragraph([textNode(`Why it matters: ${item.consequence}`)]),
        paragraph([textNode(`Limitations: ${item.boundary}`)])
      ])
    ];
  });
  return {
    type: 'doc',
    content: [
      paragraph([textNode(`${authorLabel} — researched and maintained with Noeis`)]),
      paragraph([textNode(`Evidence window: ${dateKey(windowStart, 'windowStart')} through ${dateKey(windowEnd, 'windowEnd')}`)]),
      heading(2, 'In brief'),
      paragraph([textNode(clean(editorialNote, 2400))]),
      heading(2, 'At a glance'),
      ...listParagraphs(weeklyHighlights),
      ...evidenceSections,
      heading(2, 'Connections across the week'),
      paragraph([textNode(clean(connectingThread, 2400))]),
      heading(2, 'What to watch next'),
      ...listParagraphs(watchNext)
    ]
  };
};

const buildWeekendReadingsBody = ({
  title,
  authorLabel,
  windowStart,
  windowEnd,
  editorialNote = '',
  items = [],
  publicationProfile = 'weekend_readings',
  ...edition
} = {}) => {
  const profile = resolveResearchEditionProfile(publicationProfile);
  if (profile.key === 'this_week_in_ai') {
    return buildThisWeekInAIBody({
      authorLabel,
      windowStart,
      windowEnd,
      editorialNote,
      items,
      ...edition
    });
  }
  return {
  type: 'doc',
  content: [
    paragraph([textNode(`${authorLabel} — researched and maintained with Noeis`)]),
    paragraph([textNode(`Reading window: ${dateKey(windowStart, 'windowStart')} through ${dateKey(windowEnd, 'windowEnd')}`)]),
    heading(2, 'Editorial note'),
    paragraph([textNode(clean(editorialNote, 2000))]),
    heading(2, 'Selected readings'),
    ...items.flatMap((item, index) => [
      heading(3, `${index + 1}. ${item.title}`, [{ type: 'link', attrs: { href: item.canonicalUrl, target: '_blank', rel: 'noopener noreferrer' } }]),
      paragraph([textNode(`${item.sourceLabel} · ${item.sourceDateLabel}`)]),
      paragraph([textNode(item.whyItMatters)]),
      paragraph([textNode(`Role: ${roleLabel(item.readingRole)} · Source quality: ${item.sourceQuality.replace(/_/g, ' ')}`)]),
      paragraph([textNode(`May affect: ${item.publicRelationship}`)]),
      ...(item.boundary ? [paragraph([textNode(`Boundary: ${item.boundary}`)])] : [])
    ])
  ]
  };
};

const buildWeekendReadingsDraft = ({
  ownerId = '',
  editionNumber = null,
  windowStart,
  windowEnd,
  authorLabel = 'Athan Tsokolas',
  editorialNote = '',
  items = [],
  activeThesisPageId = '',
  allowHttp = false,
  publicationProfile = 'weekend_readings',
  weeklyHighlights = [],
  connectingThread = '',
  watchNext = []
} = {}) => {
  const profile = resolveResearchEditionProfile(publicationProfile);
  const start = toDate(windowStart, 'windowStart');
  const end = toDate(windowEnd, 'windowEnd');
  if (end < start) throw new Error('windowEnd must be on or after windowStart.');
  const normalizedEditorialNote = clean(editorialNote, 2000);
  if (!normalizedEditorialNote) throw new Error(`${profile.titleLabel} requires an editorialNote.`);
  const normalizedItems = normalizeWeekendReadingItems(items, { allowHttp, publicationProfile: profile.key });
  const editionFields = profile.key === 'this_week_in_ai' ? {
    weeklyHighlights: (Array.isArray(weeklyHighlights) ? weeklyHighlights : []).map(value => clean(value, 1200)).filter(Boolean).slice(0, 5),
    connectingThread: clean(connectingThread, 2400),
    watchNext: (Array.isArray(watchNext) ? watchNext : []).map(value => clean(value, 1200)).filter(Boolean).slice(0, 8)
  } : {};
  if (profile.key === 'this_week_in_ai') {
    if (editionFields.weeklyHighlights.length < 2) throw new Error('This Week in AI requires at least two weeklyHighlights.');
    if (!editionFields.connectingThread) throw new Error('This Week in AI requires connectingThread.');
    if (!editionFields.watchNext.length) throw new Error('This Week in AI requires at least one watchNext item.');
  }
  const editionSuffix = Number.isInteger(Number(editionNumber)) && Number(editionNumber) > 0
    ? ` — ${profile.issueLabel} ${String(Number(editionNumber)).padStart(profile.key === 'this_week_in_ai' ? 3 : 1, '0')}`
    : '';
  const title = `${profile.titleLabel} — ${dateKey(end, 'windowEnd')}${editionSuffix}`;
  const ownerKey = clean(ownerId, 120) || 'unscoped';
  const editionKey = `${profile.editionPrefix}:${ownerKey}:${dateKey(start, 'windowStart')}:${dateKey(end, 'windowEnd')}`;
  const body = buildWeekendReadingsBody({
    title,
    authorLabel: clean(authorLabel, 160) || 'Athan Tsokolas',
    windowStart: start,
    windowEnd: end,
    editorialNote: normalizedEditorialNote,
    items: normalizedItems,
    publicationProfile: profile.key,
    ...editionFields
  });
  return {
    editionKey,
    title,
    body,
    plainText: body.content.flatMap(node => node.content || []).map(node => node.text || '').filter(Boolean).join('\n'),
    items: normalizedItems,
    page: {
      title,
      pageType: 'log',
      status: 'draft',
      visibility: 'private',
      sourceScope: 'selected_sources',
      createdFrom: {
        type: 'sources',
        label: editionKey,
        text: `Private ${profile.titleLabel} draft covering ${dateKey(start, 'windowStart')} through ${dateKey(end, 'windowEnd')}.`
      },
      body,
      plainText: body.content.flatMap(node => node.content || []).map(node => node.text || '').filter(Boolean).join('\n'),
      sourceRefs: normalizedItems.map(item => ({
        type: item.libraryArticleId ? 'article' : 'external',
        objectId: item.libraryArticleId || null,
        title: item.title,
        snippet: item.whyItMatters,
        url: item.canonicalUrl,
        citationLabel: item.sourceLabel,
        provider: item.sourceLabel,
        addedBy: 'user',
        metadata: {
          weekendReadings: {
            publicationProfile: profile.key,
            artifactType: profile.artifactType,
            canonicalUrl: item.canonicalUrl,
            publishedAt: item.publishedAt,
            sourceDateLabel: item.sourceDateLabel,
            sourceQuality: item.sourceQuality,
            readingRole: item.readingRole,
            whyItMatters: item.whyItMatters,
            publicRelationship: item.publicRelationship,
            boundary: item.boundary,
            affectedQuestion: item.affectedQuestion,
            affectedClaimIds: item.affectedClaimIds,
            affectedUnknownIds: item.affectedUnknownIds,
            affectedFalsifierIds: item.affectedFalsifierIds,
            intakeProvenance: item.intakeProvenance,
            requiresHumanAcceptance: true,
            thesisConnectionDisposition: 'unreviewed',
            activeThesisPageId: clean(activeThesisPageId, 120),
            ...(profile.key === 'this_week_in_ai' ? {
              evidenceLayer: item.evidenceLayer,
              technicalApproach: item.technicalApproach,
              evidenceAssessment: item.evidenceAssessment,
              consequence: item.consequence,
              edition: editionFields
            } : {})
          }
        }
      }))
    }
  };
};

const resolveQuery = async (query) => {
  if (!query) return null;
  if (typeof query.lean === 'function') return query.lean();
  return query;
};

const createWeekendReadingsDraft = async ({
  WikiPage,
  WikiRevision,
  NoeisReceipt,
  Connection,
  userId,
  buildUniqueSlug,
  createWikiRevision = defaultCreateWikiRevision,
  persistNoeisReceipt = defaultPersistNoeisReceipt,
  ...input
} = {}) => {
  if (!WikiPage || !userId) throw new Error('WikiPage and userId are required.');
  const draft = buildWeekendReadingsDraft({ ...input, ownerId: userId });
  const profile = resolveResearchEditionProfile(input.publicationProfile);
  const existingQuery = typeof WikiPage.findOne === 'function'
    ? WikiPage.findOne({ userId, 'createdFrom.label': draft.editionKey, status: { $ne: 'archived' } })
    : null;
  const existingPage = input.replaceExistingDraft && typeof existingQuery?.exec === 'function'
    ? await existingQuery.exec()
    : await resolveQuery(existingQuery);
  if (existingPage && !input.replaceExistingDraft) {
    return { created: false, updated: false, page: existingPage, revision: null, receipt: null, draft };
  }
  if (existingPage && (
    String(existingPage.status || '') !== 'draft'
    || String(existingPage.visibility || '') !== 'private'
  )) {
    throw new Error('Only an existing private draft research edition can be replaced.');
  }
  if (!NoeisReceipt?.find || !NoeisReceipt?.findOneAndUpdate) {
    throw new Error('Weekend Readings receipt history and persistence are required before draft creation.');
  }
  // Loaded lazily to keep the intake parser reusable without creating a module cycle at startup.
  const { loadPriorWeekendReadingsUrls } = require('./weekendReadingsIntakeService');
  const priorUrls = new Set(await loadPriorWeekendReadingsUrls({ NoeisReceipt, userId }));
  const repeated = draft.items.find(item => priorUrls.has(item.canonicalUrl));
  if (repeated) {
    throw new Error(`Weekend Readings source already appeared in a prior published edition: ${repeated.canonicalUrl}`);
  }

  const before = existingPage
    ? (typeof existingPage.toObject === 'function'
      ? existingPage.toObject({ virtuals: false })
      : { ...existingPage })
    : null;
  let page;
  if (existingPage) {
    Object.assign(existingPage, draft.page);
    page = typeof existingPage.save === 'function'
      ? await existingPage.save()
      : existingPage;
  } else {
    const slug = typeof buildUniqueSlug === 'function'
      ? await buildUniqueSlug(userId, draft.title)
      : draft.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 120);
    const pageInput = { ...draft.page, userId, slug };
    page = typeof WikiPage.create === 'function'
      ? await WikiPage.create(pageInput)
      : await new WikiPage(pageInput).save();
  }
  const revision = WikiRevision
    ? await createWikiRevision({
        WikiRevision,
        userId,
        page,
        ...(before ? { before } : {}),
        reason: before ? 'user_edit' : 'created',
        actorType: 'user',
        summary: `${before ? 'Rebuilt' : 'Created'} private ${draft.title} draft.`
      })
    : null;
  if (Connection) {
    const { syncWikiPageGraphConnections } = require('./wikiGraphConnectionService');
    await syncWikiPageGraphConnections({ Connection, userId, page });
  }
  const pageId = clean(page?._id || page?.id, 120);
  const revisionId = clean(revision?._id || revision?.id, 120);
  const activeThesisPageId = clean(input.activeThesisPageId, 120);
  const receipt = NoeisReceipt
    ? await persistNoeisReceipt({
        NoeisReceipt,
        userId,
        receipt: {
          id: `${draft.editionKey}:draft`,
          kind: 'weekend_readings_draft',
          source: 'noeis',
          sourceLabel: profile.sourceLabel,
          status: 'draft',
          title: draft.title,
          summary: `Private draft created with ${draft.items.length} deduplicated source${draft.items.length === 1 ? '' : 's'}.`,
          metrics: {
            selectedCount: draft.items.length,
            classificationCounts: draft.items.reduce((counts, item) => ({
              ...counts,
              [item.readingRole]: (counts[item.readingRole] || 0) + 1
            }), {})
          },
          touched: [
            ...(pageId ? [{ type: 'wiki_page', id: pageId, title: draft.title }] : []),
            ...(activeThesisPageId ? [{ type: 'wiki_page', id: activeThesisPageId, title: 'Active thesis' }] : [])
          ],
          nextAction: {
            type: 'review_required',
            label: 'Athan reviews this exact private draft before publication.',
            targetId: pageId
          },
          provenance: {
            editionKey: draft.editionKey,
            pageId,
            revisionId,
            windowStart: dateKey(input.windowStart, 'windowStart'),
            windowEnd: dateKey(input.windowEnd, 'windowEnd'),
            activeThesisPageId: activeThesisPageId || null,
            canonicalUrls: draft.items.map(item => item.canonicalUrl),
            publicationProfile: profile.key,
            artifactType: profile.artifactType,
            itemManifest: draft.items.map(item => ({
              title: item.title,
              canonicalUrl: item.canonicalUrl,
              readingRole: item.readingRole,
              sourceQuality: item.sourceQuality,
              whyItMatters: item.whyItMatters,
              publicRelationship: item.publicRelationship,
              boundary: item.boundary,
              affectedClaimIds: item.affectedClaimIds,
              libraryArticleId: item.libraryArticleId || '',
              evidenceLayer: item.evidenceLayer || '',
              technicalApproach: item.technicalApproach || '',
              evidenceAssessment: item.evidenceAssessment || '',
              consequence: item.consequence || '',
              intakeProvenance: item.intakeProvenance,
              requiresHumanAcceptance: true
            }))
          },
          completedAt: new Date()
        }
      })
    : null;
  return { created: !before, updated: Boolean(before), page, revision, receipt, draft };
};

module.exports = {
  AI_EVIDENCE_LAYERS,
  READING_ROLES,
  SENSITIVE_QUERY_KEYS,
  SOURCE_QUALITIES,
  buildWeekendReadingsBody,
  buildWeekendReadingsDraft,
  canonicalizeReadingUrl,
  createWeekendReadingsDraft,
  normalizeWeekendReadingItem,
  normalizeWeekendReadingItems
};
