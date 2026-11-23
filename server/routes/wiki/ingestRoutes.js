// Ingesting into the wiki: take a source in, review what it proposes, undo it.
const { normalizeIngestSource, cleanWikiSummary, serializeIngestRun, persistIngestCandidateGraphTrace } = require('../../services/wikiSourceRefs');
const { findLibraryArticle } = require('../../services/librarySource');
const { INGEST_TEXT_LIMIT, serializeId } = require('../../services/wikiPageShape');
const { fetchReadableArticle } = require('../../services/readableArticle');
const { createWikiSourceEvent } = require('../../services/wikiSourceEventService');
const { CHATGPT_ACCESS_PROFILE } = require('../../services/chatgptAccessPolicy');
const { processWikiSourceEvent } = require('../../services/wikiMaintenanceOrchestrator');
const mongoose = require('mongoose');
const { snapshotPage, createWikiRevision } = require('../../services/wikiRevisionService');

module.exports = (router, {
  Article,
  Connection,
  EVENT_NAMES,
  WikiPage,
  WikiRevision,
  WikiSourceEvent,
  assertHumanForResolvedWeekendReadingsTargets,
  buildIngestTimeline,
  buildUniqueSlug,
  findMaintenanceRunBySourceEvent,
  loadWikiSchemaContent,
  restorePageSnapshot,
  syncPageGraph,
  trackWikiEvent,
  wikiAuth,
  wikiModels
}) => {
  router.post('/api/wiki/ingest', wikiAuth, async (req, res) => {
    try {
      if (!WikiSourceEvent) return res.status(503).json({ error: 'Wiki ingest storage is not available.' });
      const normalized = normalizeIngestSource(req.body?.source);
      if (normalized.error) return res.status(400).json({ error: normalized.error });
      const source = normalized.value;
      /* An address the reader already saved is their Library article, cited as
         itself rather than as a second copy of the web page. A saved article
         with nothing to read stays the web page, so the run cites what it read. */
      const saved = source.rawType === 'url'
        ? await findLibraryArticle({ Article, userId: req.user.id, url: source.url })
        : null;
      const savedText = cleanWikiSummary(saved?.content, INGEST_TEXT_LIMIT);
      if (savedText) {
        Object.assign(source, {
          sourceType: 'article',
          objectId: saved._id,
          title: saved.title || source.title || '',
          text: savedText,
          summary: ''
        });
      }
      /* A URL used to arrive as a bare link. The run stored a title and an
         address and nothing to read, so the wiki either drafted from an empty
         source or drafted nothing at all. The reader's extension has always
         extracted; the server never did. It does now — and when it cannot, the
         reason is written down, because a source that could not be read is not
         the same thing as a source that said nothing. */
      const fetched = (source.rawType === 'url' && source.url && !source.text)
        ? await fetchReadableArticle({ url: source.url })
        : null;
      const sourceText = fetched?.ok && fetched.content
        ? fetched.content.slice(0, INGEST_TEXT_LIMIT)
        : source.text;
      const sourceLabel = source.title
        || (fetched?.ok ? fetched.title : '')
        || source.url
        || sourceText.slice(0, 120)
        || 'Untitled';
      const event = await createWikiSourceEvent({
        WikiSourceEvent,
        userId: req.user.id,
        sourceType: source.sourceType,
        sourceObjectId: source.objectId,
        provider: source.rawType === 'url' ? 'url' : (source.rawType === 'text' ? 'paste' : ''),
        eventType: 'imported',
        title: sourceLabel,
        summary: source.summary || sourceText.slice(0, 1200) || source.url || sourceLabel,
        text: sourceText,
        url: source.url,
        metadata: {
          ingest: true,
          ingestSourceType: source.rawType,
          // Durable policy follows this event through deferred/retried workers.
          ...(req.agentToken?.accessProfile === CHATGPT_ACCESS_PROFILE ? { requireOwnerAcceptance: true } : {}),
          ...(fetched ? { fetchedText: Boolean(fetched.ok && fetched.content), fetchError: fetched.ok ? '' : fetched.error } : {})
        }
      });
      if (!event) return res.status(400).json({ error: 'Could not create ingest run.' });
      trackWikiEvent(req, EVENT_NAMES.WIKI_INGEST_SUBMITTED, {
        sourceEventId: serializeId(event._id),
        sourceType: source.rawType,
        hasUrl: Boolean(source.url),
        hasText: Boolean(source.text)
      });

      res.status(202).json(serializeIngestRun({ event }));

      const sourceEventId = event._id;
      const userId = req.user.id;
      const sourceType = source.rawType;
      const requestForAnalytics = req;
      setImmediate(async () => {
        try {
          const result = await processWikiSourceEvent({
            sourceEventId,
            userId,
            models: wikiModels(),
            buildUniqueSlug,
            wikiSchemaContent: await loadWikiSchemaContent(userId)
          });
          const affectedPageCount = Array.isArray((result.event || event).affectedPageIds)
            ? (result.event || event).affectedPageIds.length
            : 0;
          trackWikiEvent(requestForAnalytics, affectedPageCount > 0 ? EVENT_NAMES.WIKI_INGEST_COMPLETED : EVENT_NAMES.WIKI_INGEST_NO_MATCH, {
            sourceEventId: serializeId((result.event || event)._id),
            sourceType,
            affectedPageCount,
            status: (result.event || event).status || '',
            suggestedCreatePage: Boolean((result.event || event).metadata?.ignoredReason === 'no_matching_wiki_page')
          });
        } catch (error) {
          console.error('Error processing queued wiki ingest source:', error);
        }
      });
    } catch (error) {
      console.error('Error ingesting wiki source:', error);
      res.status(500).json({ error: 'Failed to ingest wiki source.' });
    }
  });

  router.get('/api/wiki/ingest/:runId', wikiAuth, async (req, res) => {
    try {
      if (!WikiSourceEvent) return res.status(404).json({ error: 'Wiki ingest run not found.' });
      if (!mongoose.Types.ObjectId.isValid(String(req.params.runId || ''))) {
        return res.status(400).json({ error: 'Invalid ingest run id.' });
      }
      const event = await WikiSourceEvent.findOne({
        _id: req.params.runId,
        userId: req.user.id
      }).lean();
      if (!event) return res.status(404).json({ error: 'Wiki ingest run not found.' });
      const run = await findMaintenanceRunBySourceEvent({ userId: req.user.id, sourceEventId: event._id });
      const timeline = await buildIngestTimeline({ userId: req.user.id, event, run });
      res.status(200).json({
        ...serializeIngestRun({ event, run }),
        timeline
      });
    } catch (error) {
      console.error('Error reading wiki ingest run:', error);
      res.status(500).json({ error: 'Failed to read wiki ingest run.' });
    }
  });

  router.post('/api/wiki/ingest/:runId/review', wikiAuth, async (req, res) => {
    try {
      if (!WikiSourceEvent) return res.status(404).json({ error: 'Wiki ingest run not found.' });
      if (!mongoose.Types.ObjectId.isValid(String(req.params.runId || ''))) {
        return res.status(400).json({ error: 'Invalid ingest run id.' });
      }
      const action = String(req.body?.action || '').trim().toLowerCase();
      const allowed = new Set(['accept', 'defer', 'reject']);
      if (!allowed.has(action)) {
        return res.status(400).json({ error: 'action must be one of: accept, defer, reject.' });
      }
      const event = await WikiSourceEvent.findOne({ _id: req.params.runId, userId: req.user.id });
      if (!event) return res.status(404).json({ error: 'Wiki ingest run not found.' });
      const metadata = event.metadata?.toObject ? event.metadata.toObject() : (event.metadata || {});
      const reviewedAt = new Date();
      const candidateIds = Array.isArray(req.body?.candidateIds)
        ? req.body.candidateIds.map(id => String(id || '').trim()).filter(Boolean)
        : [];
      const selectedCandidateIds = new Set(candidateIds);
      const existingCandidates = Array.isArray(metadata.candidateUpdates) ? metadata.candidateUpdates : [];
      const baseStatus = action === 'accept' ? 'accepted' : (action === 'reject' ? 'rejected' : 'deferred');
      const candidateUpdates = [];
      for (const candidate of existingCandidates) {
        const candidateId = String(candidate?.id || '').trim();
        const shouldReview = !selectedCandidateIds.size || selectedCandidateIds.has(candidateId);
        if (!shouldReview) {
          candidateUpdates.push(candidate);
          continue;
        }
        const graphTrace = action === 'accept'
          ? await persistIngestCandidateGraphTrace({
              Connection,
              userId: req.user.id,
              event,
              candidate
            })
          : null;
        candidateUpdates.push({
          ...candidate,
          status: baseStatus,
          reviewAction: action,
          reviewedAt,
          ...(graphTrace ? { graphTrace } : {})
        });
      }
      const selectedKnownCount = candidateIds.filter(id => (
        existingCandidates.some(candidate => String(candidate?.id || '').trim() === id)
      )).length;
      const isPartialReview = Boolean(existingCandidates.length && selectedCandidateIds.size && selectedKnownCount < existingCandidates.length);
      event.metadata = {
        ...metadata,
        ...(existingCandidates.length ? { candidateUpdates } : {}),
        ingestReviewStatus: isPartialReview ? `partially_${baseStatus}` : baseStatus,
        ingestReviewedAt: reviewedAt,
        ingestReviewNote: String(req.body?.note || '').trim().slice(0, 500)
      };
      await event.save();
      const run = await findMaintenanceRunBySourceEvent({ userId: req.user.id, sourceEventId: event._id });
      res.status(200).json(serializeIngestRun({ event, run }));
    } catch (error) {
      console.error('Error reviewing wiki ingest run:', error);
      res.status(500).json({ error: 'Failed to review wiki ingest run.' });
    }
  });

  router.post('/api/wiki/ingest/:runId/undo', wikiAuth, async (req, res) => {
    try {
      if (!WikiSourceEvent || !WikiRevision) {
        return res.status(503).json({ error: 'Wiki ingest undo is not available.' });
      }
      if (!mongoose.Types.ObjectId.isValid(String(req.params.runId || ''))) {
        return res.status(400).json({ error: 'Invalid ingest run id.' });
      }
      const event = await WikiSourceEvent.findOne({ _id: req.params.runId, userId: req.user.id });
      if (!event) return res.status(404).json({ error: 'Wiki ingest run not found.' });
      if (event.metadata?.undoneAt) {
        return res.status(409).json({ error: 'Wiki ingest run has already been undone.' });
      }

      const revisions = await WikiRevision.find({
        userId: req.user.id,
        sourceEventId: event._id
      }).sort({ createdAt: -1 }).limit(100);
      const latestByPage = new Map();
      (Array.isArray(revisions) ? revisions : []).forEach((revision) => {
        const pageId = serializeId(revision.pageId);
        if (pageId && !latestByPage.has(pageId)) latestByPage.set(pageId, revision);
      });

      await assertHumanForResolvedWeekendReadingsTargets({
        WikiPage,
        req,
        pageIds: Array.from(latestByPage.keys())
      });

      const restoredPageIds = [];
      for (const revision of latestByPage.values()) {
        const page = await WikiPage.findOne({ _id: revision.pageId, userId: req.user.id });
        if (!page) continue;
        const beforeUndo = snapshotPage(page);
        if (revision.before) restorePageSnapshot(page, revision.before);
        else page.status = 'archived';
        await page.save();
        await syncPageGraph(page, req.user.id);
        await createWikiRevision({
          WikiRevision,
          userId: req.user.id,
          page,
          before: beforeUndo,
          reason: 'user_edit',
          actorType: 'user',
          sourceEventId: event._id,
          summary: `Undid ingest changes from "${event.title || event.sourceType}".`
        });
        restoredPageIds.push(serializeId(page._id));
      }

      event.metadata = {
        ...(event.metadata?.toObject ? event.metadata.toObject() : event.metadata || {}),
        undoneAt: new Date(),
        undonePageIds: restoredPageIds
      };
      await event.save();
      const run = await findMaintenanceRunBySourceEvent({ userId: req.user.id, sourceEventId: event._id });
      res.status(200).json({
        ...serializeIngestRun({ event, run }),
        restoredPageIds
      });
    } catch (error) {
      console.error('Error undoing wiki ingest run:', error);
      res.status(error.statusCode || 500).json({
        error: error.statusCode ? error.message : 'Failed to undo wiki ingest run.'
      });
    }
  });
};
