const { maintainWikiPage } = require('./wikiMaintenanceService');
const { createWikiRevision, snapshotPage } = require('./wikiRevisionService');
const { createProposalFromSourceEvent } = require('./wikiProposalService');
const { syncWikiPageGraphConnections } = require('./wikiGraphConnectionService');
const { getWikiSchemaPromptContent } = require('./wikiSchemaService');

const escapeRegExp = (value = '') => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const asText = (value = '') => String(value || '').replace(/\s+/g, ' ').trim();

const sourceRefMatchesEvent = (source, event) => {
  if (!source || !event) return false;
  if (event.sourceObjectId && source.objectId && String(source.objectId) === String(event.sourceObjectId)) return true;
  if (event.url && source.url && String(source.url).trim() === String(event.url).trim()) return true;
  return false;
};

const scorePageForEvent = (page, event) => {
  const haystack = [
    page.title,
    page.plainText,
    page.createdFrom?.text,
    ...(Array.isArray(page.sourceRefs) ? page.sourceRefs.flatMap(source => [source.title, source.snippet, source.url]) : []),
    ...(Array.isArray(page.claims) ? page.claims.map(claim => claim.text) : [])
  ].filter(Boolean).join(' ').toLowerCase();
  let score = 0;
  if ((page.sourceRefs || []).some(source => sourceRefMatchesEvent(source, event))) score += 1;
  const terms = [event.title, event.summary, event.text]
    .join(' ')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(term => term.length > 4)
    .slice(0, 20);
  terms.forEach(term => {
    if (haystack.includes(term)) score += 0.08;
  });
  const title = asText(event.title).toLowerCase();
  if (title && asText(page.title).toLowerCase().includes(title)) score += 0.35;
  return score;
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
  return (Array.isArray(recent) ? recent : [])
    .map(page => ({ page, score: scorePageForEvent(page, event) }))
    .filter(item => item.score >= 0.4)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(item => item.page);
};

const shouldCreateDraftPageForEvent = (event) => {
  if (event.metadata?.allowPageCreation === false) return false;
  if (event.metadata?.allowPageCreation === true) return true;
  if (event.sourceType === 'highlight') return false;
  const textLength = [event.title, event.summary, event.text].join(' ').length;
  return ['article', 'notebook'].includes(event.sourceType) && textLength >= 320;
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
  buildUniqueSlug = null,
  maintainWikiPageFn = maintainWikiPage,
  wikiSchemaContent = ''
} = {}) => {
  const {
    WikiSourceEvent,
    WikiPage,
    WikiRevision,
    WikiMaintenanceRun,
    WikiProposal,
    Connection,
    Article,
    NotebookEntry,
    TagMeta,
    Question,
    WikiSchemaSettings
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
  const effectiveWikiSchemaContent = wikiSchemaContent || await getWikiSchemaPromptContent({
    WikiSchemaSettings,
    userId: event.userId
  });

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
    const mayCreateDraftPage = shouldCreateDraftPageForEvent(event);
    if (!pages.length && mayCreateDraftPage) {
      pages = [await createPageForEvent({ WikiPage, userId: event.userId, event, buildUniqueSlug })];
    }
    if (!pages.length) {
      const proposal = await createProposalFromSourceEvent({ WikiProposal, event });
      event.status = 'ignored';
      event.processedAt = new Date();
      event.errorMessage = '';
      event.metadata = {
        ...(event.metadata?.toObject ? event.metadata.toObject() : event.metadata || {}),
        proposalId: proposal?._id || null,
        ignoredReason: proposal ? 'created_low_confidence_proposal' : 'no_matching_wiki_page'
      };
      await event.save();
      if (run) {
        run.status = 'completed';
        run.summary = proposal ? 'Created a low-confidence wiki proposal.' : 'No matching wiki page found.';
        run.completedAt = new Date();
        await run.save();
      }
      return { event, pages: [], run, proposal };
    }

    for (const page of pages) {
      const before = snapshotPage(page);
      page.freshness = {
        ...(page.freshness?.toObject ? page.freshness.toObject() : page.freshness || {}),
        status: 'needs_review',
        lastSourceEventAt: event.createdAt || new Date(),
        pendingSourceEventIds: [event._id]
      };
      await maintainWikiPageFn({
        page,
        userId: event.userId,
        models: { Article, NotebookEntry, TagMeta, Question },
        trigger: 'source_event',
        wikiSchemaContent: effectiveWikiSchemaContent
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
      if (Connection) {
        await syncWikiPageGraphConnections({
          Connection,
          userId: event.userId,
          page
        });
      }
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

const processPendingWikiSourceEvents = async ({ userId, models = {}, limit = 5, buildUniqueSlug = null, wikiSchemaContent = '' } = {}) => {
  const { WikiSourceEvent } = models;
  if (!WikiSourceEvent || !userId) return [];
  const events = await WikiSourceEvent.find({ userId, status: 'pending' }).sort({ createdAt: 1 }).limit(limit);
  const results = [];
  for (const event of Array.isArray(events) ? events : []) {
    results.push(await processWikiSourceEvent({ sourceEvent: event, userId, models, buildUniqueSlug, wikiSchemaContent }));
  }
  return results;
};

module.exports = {
  processPendingWikiSourceEvents,
  processWikiSourceEvent
};
