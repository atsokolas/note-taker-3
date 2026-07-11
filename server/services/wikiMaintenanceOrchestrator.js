const { isGitHubRepoPage, maintainWikiPage } = require('./wikiMaintenanceService');
const { createWikiRevision, snapshotPage } = require('./wikiRevisionService');
const { runWikiMaintenanceCandidate } = require('./wikiMaintenancePublicationService');
const {
  acquireRepoBuildLease,
  releaseRepoBuildLease
} = require('./wikiRepoBuildLeaseService');
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

const eventTerms = (event = {}) => [event.title, event.summary, event.text]
  .join(' ')
  .toLowerCase()
  .split(/[^a-z0-9]+/)
  .filter(term => term.length > 4)
  .slice(0, 18);

const scoreTextForEvent = (text = '', event = {}) => {
  const haystack = asText(text).toLowerCase();
  if (!haystack) return 0;
  let score = 0;
  eventTerms(event).forEach(term => {
    if (haystack.includes(term)) score += 0.12;
  });
  const title = asText(event.title).toLowerCase();
  if (title && haystack.includes(title)) score += 0.35;
  return score;
};

const candidateConfidence = (score = 0, fallback = 'candidate') => {
  if (score >= 0.85) return 'high';
  if (score >= 0.5) return 'medium';
  if (score > 0) return 'low';
  return fallback;
};

const buildWikiCandidateRows = (pages = [], event = {}) => (
  (Array.isArray(pages) ? pages : []).map(page => ({
    id: `wiki:${page._id}`,
    targetType: 'wiki_page',
    pageId: String(page._id || ''),
    title: asText(page.title) || 'Wiki page',
    reason: 'The source overlaps this wiki page and triggered a maintenance pass.',
    confidence: candidateConfidence(scorePageForEvent(page, event), 'updated'),
    recommendedAction: 'Review the rebuilt page and decide whether the new source should stay attached.',
    status: 'updated',
    provenance: {
      sourceEventId: String(event._id || ''),
      sourceTitle: asText(event.title || event.url || event.sourceType)
    }
  })).filter(row => row.pageId)
);

const queryRecent = async (Model, query = {}, select = '', limit = 25) => {
  if (!Model?.find) return [];
  try {
    let cursor = Model.find(query);
    if (cursor?.select && select) cursor = cursor.select(select);
    if (cursor?.sort) cursor = cursor.sort({ updatedAt: -1, createdAt: -1 });
    if (cursor?.limit) cursor = cursor.limit(limit);
    const rows = await cursor;
    return Array.isArray(rows) ? rows : [];
  } catch (_error) {
    return [];
  }
};

const buildThinkCandidateRows = async ({ models = {}, userId, event } = {}) => {
  const { TagMeta, Question, NotebookEntry } = models;
  const terms = eventTerms(event);
  if (!userId || !terms.length) return [];
  const regex = new RegExp(terms.slice(0, 6).map(escapeRegExp).join('|'), 'i');
  const [concepts, questions, notebooks] = await Promise.all([
    queryRecent(TagMeta, { userId, $or: [{ name: regex }, { description: regex }] }, 'name description updatedAt', 20),
    queryRecent(Question, { userId, text: regex }, 'text updatedAt status linkedTagName', 20),
    queryRecent(NotebookEntry, { userId, $or: [{ title: regex }, { content: regex }] }, 'title content updatedAt', 20)
  ]);

  const rows = [];
  (Array.isArray(concepts) ? concepts : []).forEach((concept) => {
    const score = scoreTextForEvent([concept.name, concept.description].join(' '), event);
    if (score <= 0) return;
    rows.push({
      id: `concept:${concept._id || concept.name}`,
      targetType: 'concept',
      objectId: String(concept._id || concept.name || ''),
      title: asText(concept.name) || 'Concept',
      reason: 'The source mentions terms already present in this concept.',
      confidence: candidateConfidence(score),
      recommendedAction: 'Pull the source in as evidence or open a concept synthesis pass.',
      status: 'candidate',
      provenance: { sourceEventId: String(event._id || ''), sourceTitle: asText(event.title || event.url || event.sourceType) }
    });
  });
  (Array.isArray(questions) ? questions : []).forEach((question) => {
    const score = scoreTextForEvent(question.text, event);
    if (score <= 0) return;
    rows.push({
      id: `question:${question._id}`,
      targetType: 'question',
      objectId: String(question._id || ''),
      title: asText(question.text) || 'Question',
      reason: 'The source may answer or reframe this open question.',
      confidence: candidateConfidence(score),
      recommendedAction: 'Review the source against the question before closing the loop.',
      status: 'candidate',
      provenance: { sourceEventId: String(event._id || ''), sourceTitle: asText(event.title || event.url || event.sourceType) }
    });
  });
  (Array.isArray(notebooks) ? notebooks : []).forEach((note) => {
    const score = scoreTextForEvent([note.title, note.content].join(' '), event);
    if (score <= 0) return;
    rows.push({
      id: `notebook:${note._id}`,
      targetType: 'notebook',
      objectId: String(note._id || ''),
      title: asText(note.title) || 'Notebook',
      reason: 'The source overlaps a quiet note that may need to be woven back in.',
      confidence: candidateConfidence(score),
      recommendedAction: 'Use the source as context for the next note or promotion.',
      status: 'candidate',
      provenance: { sourceEventId: String(event._id || ''), sourceTitle: asText(event.title || event.url || event.sourceType) }
    });
  });
  return rows
    .filter(row => row.objectId)
    .sort((a, b) => ['high', 'medium', 'low', 'candidate'].indexOf(a.confidence) - ['high', 'medium', 'low', 'candidate'].indexOf(b.confidence))
    .slice(0, 8);
};

const setEventMetadata = (event, updates = {}) => {
  event.metadata = {
    ...(event.metadata?.toObject ? event.metadata.toObject() : event.metadata || {}),
    ...updates
  };
};

const attachRepoSnapshotEvidence = async ({ WikiSourceEvent, page, event } = {}) => {
  const eventIds = Array.isArray(event?.metadata?.documentEventIds)
    ? event.metadata.documentEventIds.filter(Boolean)
    : [];
  if (!WikiSourceEvent?.find || !page || !eventIds.length) return page;
  const evidenceEvents = await WikiSourceEvent.find({
    _id: { $in: eventIds },
    userId: event.userId
  });
  const refs = (Array.isArray(evidenceEvents) ? evidenceEvents : []).map(source => ({
    type: 'external',
    objectId: source._id || null,
    title: asText(source.title || source.url).slice(0, 240),
    snippet: asText(source.text || source.summary).slice(0, 4000),
    url: String(source.url || '').slice(0, 1000),
    provider: 'github-repo',
    metadata: source.metadata?.toObject ? source.metadata.toObject() : source.metadata || {},
    addedBy: 'ai'
  }));
  page.sourceRefs = [
    ...(Array.isArray(page.sourceRefs) ? page.sourceRefs.filter(ref => ref.provider !== 'github-repo') : []),
    ...refs
  ].slice(0, 80);
  if (typeof page.markModified === 'function') page.markModified('sourceRefs');
  if (typeof page.save === 'function') await page.save();
  return page;
};

const findAffectedPages = async ({ WikiPage, userId, event, limit = 8 }) => {
  if (!WikiPage || !userId || !event) return [];
  const explicitIds = Array.isArray(event.affectedPageIds) ? event.affectedPageIds.filter(Boolean) : [];
  if (explicitIds.length) {
    const query = { userId, _id: { $in: explicitIds }, status: { $ne: 'archived' } };
    const result = WikiPage.find(query).limit(limit);
    const resolved = await result;
    return Array.isArray(resolved) ? resolved : [];
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
    const thinkCandidates = await buildThinkCandidateRows({
      models: { TagMeta, Question, NotebookEntry },
      userId: event.userId,
      event
    });
    const candidateUpdates = [
      ...buildWikiCandidateRows(pages, event),
      ...thinkCandidates
    ].slice(0, 16);
    setEventMetadata(event, {
      candidateUpdates,
      ingestReviewStatus: candidateUpdates.length ? 'pending_review' : 'no_candidates'
    });
    if (!pages.length) {
      const proposal = await createProposalFromSourceEvent({ WikiProposal, event });
      event.status = 'ignored';
      event.processedAt = new Date();
      event.errorMessage = '';
      setEventMetadata(event, {
        proposalId: proposal?._id || null,
        ignoredReason: proposal ? 'created_low_confidence_proposal' : 'no_matching_wiki_page'
      });
      await event.save();
      if (run) {
        run.status = 'completed';
        run.summary = proposal ? 'Created a low-confidence wiki proposal.' : 'No matching wiki page found.';
        run.completedAt = new Date();
        await run.save();
      }
      return { event, pages: [], run, proposal };
    }

    let rejectedCount = 0;
    let skippedCount = 0;
    for (let page of pages) {
      const repoSnapshotEvent = event.metadata?.source === 'github-repo-snapshot';
      if (repoSnapshotEvent) {
        page = await attachRepoSnapshotEvidence({ WikiSourceEvent, page, event });
      }
      const before = snapshotPage(page);
      page.freshness = {
        ...(page.freshness?.toObject ? page.freshness.toObject() : page.freshness || {}),
        status: 'needs_review',
        lastSourceEventAt: event.createdAt || new Date(),
        pendingSourceEventIds: [event._id]
      };
      const maintainArgs = {
        models: { Article, NotebookEntry, TagMeta, Question },
        trigger: 'source_event',
        wikiSchemaContent: effectiveWikiSchemaContent
      };
      const enforcePublicationShield = isGitHubRepoPage({ page })
        || event.metadata?.enforcePublicationQuality === true;
      const headSha = String(event.metadata?.commitSha || page.externalWatches?.githubRepo?.lastHeadSha || '');
      const lease = enforcePublicationShield && headSha
        ? await acquireRepoBuildLease({
            WikiPage,
            pageId: page._id,
            userId: event.userId,
            headSha
          })
        : null;
      if (lease && !lease.acquired) {
        skippedCount += 1;
        continue;
      }
      if (lease?.page) page = lease.page;
      let publication;
      try {
        publication = enforcePublicationShield
          ? await runWikiMaintenanceCandidate({
            page,
            userId: event.userId,
            WikiRevision,
            beforeSnapshot: before,
            sourceEventId: event._id,
            maintenanceRunId: run?._id || null,
            sourceVersion: event.metadata?.commitSha ? {
              provider: 'github',
              headSha: event.metadata.commitSha,
              snapshotKey: event.metadata.snapshotKey || ''
            } : null,
            maintainWikiPageFn,
            maintainArgs
          })
          : {
            page: await maintainWikiPageFn({
              ...maintainArgs,
              page,
              userId: event.userId
            }) || page,
            promoted: true
          };
      } catch (error) {
        if (lease?.acquired) {
          await releaseRepoBuildLease({
            WikiPage,
            pageId: page._id,
            userId: event.userId,
            token: lease.token,
            headSha,
            status: 'error',
            error: error.message || 'Repo wiki build failed.'
          }).catch(() => null);
        }
        throw error;
      }
      if (!publication.promoted) {
        rejectedCount += 1;
        const candidate = candidateUpdates.find(row => (
          row.targetType === 'wiki_page' && row.pageId === String(page._id || '')
        ));
        if (candidate) {
          candidate.status = 'needs_review';
          candidate.reason = 'The source produced a candidate that did not pass the wiki quality contract.';
          candidate.recommendedAction = 'Review the rejected candidate while the last trusted page stays published.';
        }
        page.freshness = {
          ...(page.freshness?.toObject ? page.freshness.toObject() : page.freshness || {}),
          status: 'needs_review',
          lastSourceEventAt: event.createdAt || new Date(),
          pendingSourceEventIds: []
        };
        await page.save();
        if (lease?.acquired) {
          await releaseRepoBuildLease({
            WikiPage,
            pageId: page._id,
            userId: event.userId,
            token: lease.token,
            headSha,
            status: 'needs_review',
            error: publication.quality?.failures?.slice(0, 3).join(' ') || 'Candidate did not pass quality.'
          });
        }
        continue;
      }
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
      if (lease?.acquired) {
        await releaseRepoBuildLease({
          WikiPage,
          pageId: page._id,
          userId: event.userId,
          token: lease.token,
          headSha,
          status: 'ready',
          promoted: true
        });
      }
    }

    event.status = 'processed';
    event.processedAt = new Date();
    event.affectedPageIds = pages.map(page => page._id).filter(Boolean);
    await event.save();
    if (run) {
      run.status = rejectedCount ? 'needs_review' : 'completed';
      run.pageId = pages[0]?._id || null;
      run.summary = rejectedCount
        ? `Kept ${rejectedCount} wiki ${rejectedCount === 1 ? 'page' : 'pages'} on the last trusted version for review.`
        : skippedCount
          ? `Skipped ${skippedCount} duplicate repo build ${skippedCount === 1 ? 'delivery' : 'deliveries'} already in progress.`
        : `Updated ${pages.length} wiki ${pages.length === 1 ? 'page' : 'pages'}.`;
      run.completedAt = new Date();
      await run.save();
    }
    return { event, pages, run, rejectedCount, skippedCount };
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
