const { maintainWikiPage } = require('./wikiMaintenanceService');
const { createWikiRevision, snapshotPage } = require('./wikiRevisionService');

const escapeRegExp = (value = '') => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const asText = (value = '') => String(value || '').replace(/\s+/g, ' ').trim();

const pageMatchesEvent = (page, event) => {
  const haystack = [
    page.title,
    page.plainText,
    page.createdFrom?.text,
    ...(Array.isArray(page.sourceRefs) ? page.sourceRefs.flatMap(source => [source.title, source.snippet]) : [])
  ].filter(Boolean).join(' ').toLowerCase();
  const terms = [event.title, event.summary, event.text]
    .join(' ')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(term => term.length > 4)
    .slice(0, 16);
  return terms.some(term => haystack.includes(term));
};

const findAffectedPages = async ({ WikiPage, userId, event, limit = 8 }) => {
  if (!WikiPage || !userId || !event) return [];
  const explicitIds = Array.isArray(event.affectedPageIds) ? event.affectedPageIds.filter(Boolean) : [];
  if (explicitIds.length) {
    const query = { userId, _id: { $in: explicitIds }, status: { $ne: 'archived' } };
    const result = WikiPage.find(query).limit(limit);
    return Array.isArray(await result) ? await result : [];
  }

  const title = asText(event.title);
  if (title) {
    const regex = new RegExp(escapeRegExp(title).slice(0, 120), 'i');
    const candidates = await WikiPage.find({
      userId,
      status: { $ne: 'archived' },
      $or: [{ title: regex }, { plainText: regex }]
    }).sort({ updatedAt: -1 }).limit(limit);
    if (Array.isArray(candidates) && candidates.length) return candidates;
  }

  const recent = await WikiPage.find({ userId, status: { $ne: 'archived' } }).sort({ updatedAt: -1 }).limit(40);
  return (Array.isArray(recent) ? recent : []).filter(page => pageMatchesEvent(page, event)).slice(0, limit);
};

const createPageForEvent = async ({ WikiPage, userId, event, buildUniqueSlug }) => {
  const title = asText(event.title) || 'Untitled Wiki Page';
  const page = new WikiPage({
    userId,
    title,
    slug: buildUniqueSlug ? await buildUniqueSlug(userId, title) : `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')}-${Date.now()}`,
    pageType: event.sourceType === 'question' ? 'question' : 'topic',
    status: 'draft',
    visibility: 'private',
    sourceScope: 'entire_library',
    createdFrom: {
      type: event.sourceType === 'notebook' ? 'notebook' : (event.sourceType === 'article' ? 'article' : 'sources'),
      objectId: event.sourceObjectId || null,
      objectIds: [event.sourceObjectId].filter(Boolean),
      text: event.summary || '',
      label: title
    },
    body: { type: 'doc', content: [{ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: title }] }] },
    plainText: title,
    sourceRefs: [{
      type: event.sourceType,
      objectId: event.sourceObjectId || null,
      title,
      snippet: event.summary || '',
      url: event.url || '',
      addedBy: 'ai'
    }],
    freshness: {
      status: 'needs_review',
      lastSourceEventAt: event.createdAt || new Date(),
      pendingSourceEventIds: [event._id].filter(Boolean)
    }
  });
  await page.save();
  return page;
};

const processWikiSourceEvent = async ({
  sourceEventId,
  sourceEvent = null,
  userId,
  models = {},
  buildUniqueSlug = null
} = {}) => {
  const {
    WikiSourceEvent,
    WikiPage,
    WikiRevision,
    WikiMaintenanceRun,
    Article,
    NotebookEntry,
    TagMeta,
    Question
  } = models;
  if (!WikiSourceEvent || !WikiPage) throw new Error('Wiki source event processing requires WikiSourceEvent and WikiPage models.');

  const event = sourceEvent || await WikiSourceEvent.findOne({ _id: sourceEventId, ...(userId ? { userId } : {}) });
  if (!event) {
    const error = new Error('Wiki source event not found.');
    error.code = 'SOURCE_EVENT_NOT_FOUND';
    throw error;
  }

  event.status = 'processing';
  event.errorMessage = '';
  await event.save();

  const run = WikiMaintenanceRun ? new WikiMaintenanceRun({
    userId: event.userId,
    sourceEventId: event._id,
    status: 'running',
    trigger: 'source_event',
    startedAt: new Date()
  }) : null;
  if (run) await run.save();

  try {
    let pages = await findAffectedPages({ WikiPage, userId: event.userId, event });
    const mayCreateDraftPage = event.sourceType !== 'highlight' && event.metadata?.allowPageCreation !== false;
    if (!pages.length && mayCreateDraftPage) {
      pages = [await createPageForEvent({ WikiPage, userId: event.userId, event, buildUniqueSlug })];
    }
    if (!pages.length) {
      event.status = 'ignored';
      event.processedAt = new Date();
      event.errorMessage = '';
      await event.save();
      if (run) {
        run.status = 'completed';
        run.summary = 'No matching wiki page found.';
        run.completedAt = new Date();
        await run.save();
      }
      return { event, pages: [], run };
    }

    for (const page of pages) {
      const before = snapshotPage(page);
      page.freshness = {
        ...(page.freshness?.toObject ? page.freshness.toObject() : page.freshness || {}),
        status: 'needs_review',
        lastSourceEventAt: event.createdAt || new Date(),
        pendingSourceEventIds: [event._id]
      };
      await maintainWikiPage({
        page,
        userId: event.userId,
        models: { Article, NotebookEntry, TagMeta, Question },
        trigger: 'source_event'
      });
      page.freshness = {
        ...(page.freshness?.toObject ? page.freshness.toObject() : page.freshness || {}),
        status: Array.isArray(page.aiState?.health?.contradictions) && page.aiState.health.contradictions.length ? 'conflicted' : 'fresh',
        lastMaintainedAt: new Date(),
        pendingSourceEventIds: [],
        conflictCount: Array.isArray(page.aiState?.health?.contradictions) ? page.aiState.health.contradictions.length : 0,
        staleSectionCount: Array.isArray(page.aiState?.health?.staleSections) ? page.aiState.health.staleSections.length : 0
      };
      await page.save();
      await createWikiRevision({
        WikiRevision,
        userId: event.userId,
        page,
        before,
        reason: 'source_event',
        actorType: 'agent',
        sourceEventId: event._id,
        maintenanceRunId: run?._id || null,
        summary: page.aiState?.maintenanceSummary || `Updated from ${event.title || event.sourceType}.`
      });
    }

    event.status = 'processed';
    event.processedAt = new Date();
    event.affectedPageIds = pages.map(page => page._id).filter(Boolean);
    await event.save();
    if (run) {
      run.status = 'completed';
      run.pageId = pages[0]?._id || null;
      run.summary = `Updated ${pages.length} wiki ${pages.length === 1 ? 'page' : 'pages'}.`;
      run.completedAt = new Date();
      await run.save();
    }
    return { event, pages, run };
  } catch (error) {
    event.status = 'failed';
    event.errorMessage = error.message || 'Failed to process wiki source event.';
    event.lockedAt = null;
    event.nextAttemptAt = new Date(Date.now() + Math.min(60, Math.max(5, Number(event.attemptCount || 1) * 10)) * 60 * 1000);
    await event.save();
    if (run) {
      run.status = 'failed';
      run.errorMessage = event.errorMessage;
      run.completedAt = new Date();
      await run.save();
    }
    throw error;
  }
};

const processPendingWikiSourceEvents = async ({ userId, models = {}, limit = 5, buildUniqueSlug = null } = {}) => {
  const { WikiSourceEvent } = models;
  if (!WikiSourceEvent || !userId) return [];
  const events = await WikiSourceEvent.find({ userId, status: 'pending' }).sort({ createdAt: 1 }).limit(limit);
  const results = [];
  for (const event of Array.isArray(events) ? events : []) {
    results.push(await processWikiSourceEvent({ sourceEvent: event, userId, models, buildUniqueSlug }));
  }
  return results;
};

module.exports = {
  processPendingWikiSourceEvents,
  processWikiSourceEvent
};
