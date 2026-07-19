const { createWikiRevision: defaultCreateWikiRevision } = require('./wikiRevisionService');
const { persistNoeisReceipt: defaultPersistNoeisReceipt } = require('./noeisReceiptService');

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

const TRACKING_QUERY_KEYS = new Set([
  'fbclid',
  'gclid',
  'mc_cid',
  'mc_eid'
]);

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

const normalizeWeekendReadingItem = (item = {}, index = 0, options = {}) => {
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
  return {
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
    affectedFalsifierIds: normalizeIdList(item.affectedFalsifierIds)
  };
};

const normalizeWeekendReadingItems = (items = [], options = {}) => {
  if (!Array.isArray(items) || !items.length) {
    throw new Error('Weekend Readings requires at least one selected item.');
  }
  if (items.length > 15) throw new Error('Weekend Readings supports at most 15 selected items.');
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

const buildWeekendReadingsBody = ({
  title,
  authorLabel,
  windowStart,
  windowEnd,
  editorialNote = '',
  items = []
} = {}) => ({
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
});

const buildWeekendReadingsDraft = ({
  editionNumber = null,
  windowStart,
  windowEnd,
  authorLabel = 'Athan Tsokolas',
  editorialNote = '',
  items = [],
  activeThesisPageId = '',
  allowHttp = false
} = {}) => {
  const start = toDate(windowStart, 'windowStart');
  const end = toDate(windowEnd, 'windowEnd');
  if (end < start) throw new Error('windowEnd must be on or after windowStart.');
  const normalizedEditorialNote = clean(editorialNote, 2000);
  if (!normalizedEditorialNote) throw new Error('Weekend Readings requires an editorialNote.');
  const normalizedItems = normalizeWeekendReadingItems(items, { allowHttp });
  const editionSuffix = Number.isInteger(Number(editionNumber)) && Number(editionNumber) > 0
    ? ` — Edition ${Number(editionNumber)}`
    : '';
  const title = `Weekend Readings — ${dateKey(end, 'windowEnd')}${editionSuffix}`;
  const editionKey = `weekend-readings:${dateKey(start, 'windowStart')}:${dateKey(end, 'windowEnd')}`;
  const body = buildWeekendReadingsBody({
    title,
    authorLabel: clean(authorLabel, 160) || 'Athan Tsokolas',
    windowStart: start,
    windowEnd: end,
    editorialNote: normalizedEditorialNote,
    items: normalizedItems
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
        text: `Private Weekend Readings draft covering ${dateKey(start, 'windowStart')} through ${dateKey(end, 'windowEnd')}.`
      },
      body,
      plainText: body.content.flatMap(node => node.content || []).map(node => node.text || '').filter(Boolean).join('\n'),
      sourceRefs: normalizedItems.map(item => ({
        type: 'external',
        title: item.title,
        snippet: item.whyItMatters,
        url: item.canonicalUrl,
        citationLabel: item.sourceLabel,
        provider: item.sourceLabel,
        addedBy: 'user',
        metadata: {
          weekendReadings: {
            canonicalUrl: item.canonicalUrl,
            publishedAt: item.publishedAt,
            sourceQuality: item.sourceQuality,
            readingRole: item.readingRole,
            whyItMatters: item.whyItMatters,
            publicRelationship: item.publicRelationship,
            boundary: item.boundary,
            affectedQuestion: item.affectedQuestion,
            affectedClaimIds: item.affectedClaimIds,
            affectedUnknownIds: item.affectedUnknownIds,
            affectedFalsifierIds: item.affectedFalsifierIds,
            thesisConnectionDisposition: 'unreviewed',
            activeThesisPageId: clean(activeThesisPageId, 120)
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
  userId,
  buildUniqueSlug,
  createWikiRevision = defaultCreateWikiRevision,
  persistNoeisReceipt = defaultPersistNoeisReceipt,
  ...input
} = {}) => {
  if (!WikiPage || !userId) throw new Error('WikiPage and userId are required.');
  const draft = buildWeekendReadingsDraft(input);
  const existingPage = typeof WikiPage.findOne === 'function'
    ? await resolveQuery(WikiPage.findOne({ userId, 'createdFrom.label': draft.editionKey, status: { $ne: 'archived' } }))
    : null;
  if (existingPage) return { created: false, page: existingPage, revision: null, receipt: null, draft };

  const slug = typeof buildUniqueSlug === 'function'
    ? await buildUniqueSlug(userId, draft.title)
    : draft.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 120);
  const pageInput = { ...draft.page, userId, slug };
  const page = typeof WikiPage.create === 'function'
    ? await WikiPage.create(pageInput)
    : await new WikiPage(pageInput).save();
  const revision = WikiRevision
    ? await createWikiRevision({
        WikiRevision,
        userId,
        page,
        reason: 'created',
        actorType: 'user',
        summary: `Created private ${draft.title} draft.`
      })
    : null;
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
          sourceLabel: 'Weekend Readings',
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
            itemManifest: draft.items.map(item => ({
              title: item.title,
              canonicalUrl: item.canonicalUrl,
              readingRole: item.readingRole,
              sourceQuality: item.sourceQuality,
              whyItMatters: item.whyItMatters,
              publicRelationship: item.publicRelationship,
              boundary: item.boundary,
              affectedClaimIds: item.affectedClaimIds
            }))
          },
          completedAt: new Date()
        }
      })
    : null;
  return { created: true, page, revision, receipt, draft };
};

module.exports = {
  READING_ROLES,
  SOURCE_QUALITIES,
  buildWeekendReadingsBody,
  buildWeekendReadingsDraft,
  canonicalizeReadingUrl,
  createWeekendReadingsDraft,
  normalizeWeekendReadingItem,
  normalizeWeekendReadingItems
};
