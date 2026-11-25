// Keeping a wiki current: activity, schema suggestions, source events, revisions, autolinks, freshness and write-back to connectors.
const { sortActivityEvents, cleanWikiSummary } = require('../../services/wikiSourceRefs');
const { serializeId, serializeWikiPage, emptyDoc } = require('../../services/wikiPageShape');
const { suggestWikiSchemaUpdates } = require('../../services/wikiSchemaSuggestionService');
const { listWikiSourceEvents } = require('../../services/wikiSourceEventService');
const { processPendingWikiSourceEvents } = require('../../services/wikiSourceEventWorker');
const { processWikiSourceEvent } = require('../../services/wikiMaintenanceOrchestrator');
const { describeHistory } = require('../../services/wikiChangeStory');
const { snapshotPage, createWikiRevision } = require('../../services/wikiRevisionService');
const { findAutolinkSuggestions } = require('../../services/wikiAutolinkService');
const mongoose = require('mongoose');
const { applyWikiAutolinkToDoc } = require('../../services/wikiAutolinkApplyService');
const { docText } = require('../../lib/editorialText');
const { writeWikiPageToConnector } = require('../../services/wikiConnectorWritebackService');

module.exports = (router, {
  ConnectorActionLog,
  EVENT_NAMES,
  IntegrationConnection,
  WikiLintRun,
  WikiMaintenanceRun,
  WikiPage,
  WikiRevision,
  WikiSourceEvent,
  appendNotionBlockChildren,
  buildUniqueSlug,
  changeSourcesFor,
  createNotionPage,
  decryptSecret,
  findOwnedPage,
  loadWikiSchemaContent,
  restorePageSnapshot,
  syncPageGraph,
  trackWikiEvent,
  updateNotionPageTitle,
  wikiAuth,
  wikiModels
}) => {
  router.get('/api/wiki/activity', wikiAuth, async (req, res) => {
    try {
      const limit = Math.max(1, Math.min(Number(req.query.limit) || 50, 100));
      const sinceRaw = String(req.query.since || '').trim();
      const sinceDate = sinceRaw ? new Date(sinceRaw) : null;
      if (sinceRaw && Number.isNaN(sinceDate.getTime())) {
        return res.status(400).json({ error: 'since must be a valid date or timestamp.' });
      }
      const [sourceEvents, maintenanceRuns, lintRuns, pages, externalAgentActions] = await Promise.all([
        WikiSourceEvent
          ? WikiSourceEvent.find({ userId: req.user.id }).sort({ createdAt: -1 }).limit(limit).lean()
          : [],
        WikiMaintenanceRun
          ? WikiMaintenanceRun.find({ userId: req.user.id }).sort({ createdAt: -1 }).limit(limit).lean()
          : [],
        WikiLintRun
          ? WikiLintRun.find({ userId: req.user.id }).sort({ createdAt: -1 }).limit(limit).lean()
          : [],
        WikiPage.find({ userId: req.user.id, status: { $ne: 'archived' } }).sort({ updatedAt: -1 }).limit(200).lean(),
        ConnectorActionLog?.find
          ? ConnectorActionLog.find({ userId: req.user.id, connector: 'wiki_mcp' }).sort({ createdAt: -1 }).limit(limit).lean()
          : []
      ]);
      const events = sortActivityEvents([
        ...(Array.isArray(sourceEvents) ? sourceEvents : []).flatMap(event => ([{
          id: serializeId(event._id),
          type: event.metadata?.ingest ? 'ingest' : 'source_event',
          runId: event.metadata?.ingest ? serializeId(event._id) : null,
          sourceEventId: serializeId(event._id),
          status: event.status || '',
          title: event.title || event.url || event.sourceType,
          summary: cleanWikiSummary(event.summary || event.errorMessage || ''),
          affectedPageIds: Array.isArray(event.affectedPageIds) ? event.affectedPageIds.map(serializeId).filter(Boolean) : [],
          at: event.processedAt || event.updatedAt || event.createdAt
        }, event.metadata?.undoneAt ? {
          id: `${serializeId(event._id)}:undo`,
          type: 'ingest_undo',
          runId: event.metadata?.ingest ? serializeId(event._id) : null,
          sourceEventId: serializeId(event._id),
          status: 'completed',
          title: `Undid ${event.title || event.url || event.sourceType}`,
          summary: `${Array.isArray(event.metadata?.undonePageIds) ? event.metadata.undonePageIds.length : 0} page${Array.isArray(event.metadata?.undonePageIds) && event.metadata.undonePageIds.length === 1 ? '' : 's'} restored.`,
          affectedPageIds: Array.isArray(event.metadata?.undonePageIds) ? event.metadata.undonePageIds.map(serializeId).filter(Boolean) : [],
          at: event.metadata.undoneAt
        } : null]).filter(Boolean)),
        ...(Array.isArray(maintenanceRuns) ? maintenanceRuns : []).map(run => ({
          id: serializeId(run._id),
          type: 'maintenance',
          runId: serializeId(run._id),
          sourceEventId: serializeId(run.sourceEventId),
          status: run.status || '',
          pageId: serializeId(run.pageId),
          title: 'Wiki maintenance',
          summary: cleanWikiSummary(run.summary || run.errorMessage || ''),
          at: run.completedAt || run.startedAt || run.createdAt
        })),
        ...(Array.isArray(lintRuns) ? lintRuns : []).map(run => ({
          id: serializeId(run._id),
          type: 'lint',
          runId: serializeId(run._id),
          status: run.status || 'completed',
          pageId: serializeId(run.pageId),
          title: 'Wiki lint',
          summary: cleanWikiSummary(run.summary || ''),
          at: run.completedAt || run.createdAt
        })),
        ...(Array.isArray(externalAgentActions) ? externalAgentActions : []).map(action => ({
          id: serializeId(action._id),
          type: 'external_agent_action',
          status: action.status || '',
          pageId: action.targetType === 'wiki_page' ? serializeId(action.targetId) : null,
          runId: action.targetType === 'wiki_ingest_run' ? serializeId(action.targetId) : null,
          sourceEventId: action.targetType === 'wiki_source_event' ? serializeId(action.targetId) : null,
          title: `${action.agentTokenLabel || 'External agent'} · ${(action.action || 'wiki action').replace(/_/g, ' ')}`,
          summary: cleanWikiSummary(action.summary || action.errorMessage || ''),
          targetType: action.targetType || '',
          targetId: serializeId(action.targetId),
          at: action.createdAt
        })),
        ...(Array.isArray(pages) ? pages : []).flatMap(page => (
          Array.isArray(page.discussions) ? page.discussions : []
        ).map(discussion => ({
          id: serializeId(discussion._id) || `${page._id}:${discussion.askedAt}`,
          type: 'ask',
          pageId: serializeId(page._id),
          status: discussion.status || 'answered',
          title: discussion.question || 'Wiki question',
          summary: cleanWikiSummary(discussion.errorMessage || ''),
          at: discussion.askedAt || page.updatedAt
        })))
      ]).filter(event => {
        if (!sinceDate) return true;
        const eventDate = new Date(event.at);
        return !Number.isNaN(eventDate.getTime()) && eventDate.getTime() >= sinceDate.getTime();
      }).slice(0, limit);
      res.status(200).json({ events });
    } catch (error) {
      console.error('Error listing wiki activity:', error);
      res.status(500).json({ error: 'Failed to list wiki activity.' });
    }
  });

  router.post('/api/wiki/schema/suggestions', wikiAuth, async (req, res) => {
    try {
      const limit = Math.max(5, Math.min(Number(req.body?.limit) || 50, 100));
      const [sourceEvents, maintenanceRuns, pages] = await Promise.all([
        WikiSourceEvent
          ? WikiSourceEvent.find({ userId: req.user.id }).sort({ createdAt: -1 }).limit(limit).lean()
          : [],
        WikiMaintenanceRun
          ? WikiMaintenanceRun.find({ userId: req.user.id }).sort({ createdAt: -1 }).limit(limit).lean()
          : [],
        WikiPage.find({ userId: req.user.id, status: { $ne: 'archived' } }).sort({ updatedAt: -1 }).limit(limit).lean()
      ]);
      const now = new Date();
      const result = suggestWikiSchemaUpdates({
        currentSchema: req.body?.currentSchema,
        sourceEvents,
        maintenanceRuns,
        pages,
        now
      });
      let run = null;
      if (WikiMaintenanceRun) {
        run = new WikiMaintenanceRun({
          userId: req.user.id,
          status: 'completed',
          trigger: 'batch',
          summary: result.summary,
          startedAt: now,
          completedAt: now,
          metadata: {
            kind: 'schema_suggestions',
            suggestionCount: result.suggestions.length,
            currentSchemaLength: result.currentSchema.length,
            context: result.context
          }
        });
        await run.save();
      }
      trackWikiEvent(req, EVENT_NAMES.WIKI_SCHEMA_SUGGESTED, {
        runId: serializeId(run?._id),
        suggestionCount: Array.isArray(result.suggestions) ? result.suggestions.length : 0,
        currentSchemaLength: String(result.currentSchema || '').length
      });
      res.status(200).json({
        runId: serializeId(run?._id),
        ...result
      });
    } catch (error) {
      console.error('Error suggesting wiki schema updates:', error);
      res.status(500).json({ error: 'Failed to suggest wiki schema updates.' });
    }
  });

  router.get('/api/wiki/source-events', wikiAuth, async (req, res) => {
    try {
      const status = String(req.query.status || '').trim();
      if (status && !['pending', 'processing', 'processed', 'failed', 'ignored'].includes(status)) {
        return res.status(400).json({ error: 'Invalid source event status.' });
      }
      const events = await listWikiSourceEvents({
        WikiSourceEvent,
        userId: req.user.id,
        status,
        limit: req.query.limit
      });
      res.status(200).json({ events });
    } catch (error) {
      console.error('Error listing wiki source events:', error);
      res.status(500).json({ error: 'Failed to list wiki source events.' });
    }
  });

  router.post('/api/wiki/source-events/process-pending', wikiAuth, async (req, res) => {
    try {
      const results = await processPendingWikiSourceEvents({
        userId: req.user.id,
        models: wikiModels(),
        limit: req.body?.limit,
        buildUniqueSlug,
        wikiSchemaContent: await loadWikiSchemaContent(req.user.id)
      });
      res.status(200).json({
        processed: results.filter(result => !result.error && !result.deferred).length,
        deferred: results.filter(result => result.deferred).length,
        failed: results.filter(result => result.error).length,
        results: results.map(result => ({
          eventId: result.event?._id || null,
          status: result.event?.status || (result.error ? 'failed' : ''),
          pageIds: Array.isArray(result.pages) ? result.pages.map(page => page._id).filter(Boolean) : [],
          error: result.error || ''
        }))
      });
    } catch (error) {
      console.error('Error processing pending wiki source events:', error);
      res.status(500).json({ error: 'Failed to process pending wiki source events.' });
    }
  });

  router.post('/api/wiki/source-events/:sourceEventId/process', wikiAuth, async (req, res) => {
    try {
      const result = await processWikiSourceEvent({
        sourceEventId: req.params.sourceEventId,
        userId: req.user.id,
        models: wikiModels(),
        buildUniqueSlug,
        wikiSchemaContent: await loadWikiSchemaContent(req.user.id)
      });
      res.status(200).json({
        event: result.event,
        deferred: Boolean(result.deferred),
        pages: Array.isArray(result.pages) ? result.pages.map(serializeWikiPage) : [],
        run: result.run || null
      });
    } catch (error) {
      if (error.code === 'SOURCE_EVENT_NOT_FOUND') return res.status(404).json({ error: 'Wiki source event not found.' });
      console.error('Error processing wiki source event:', error);
      res.status(500).json({ error: 'Failed to process wiki source event.' });
    }
  });

  router.get('/api/wiki/pages/:id/revisions', wikiAuth, async (req, res) => {
    try {
      const page = await findOwnedPage(req).select('_id body sourceRefs.title sourceRefs.url sourceRefs.objectId').lean();
      if (!page) return res.status(404).json({ error: 'Wiki page not found.' });
      if (!WikiRevision) return res.status(200).json({ revisions: [] });
      const limit = Math.max(1, Math.min(Number(req.query.limit) || 50, 100));
      /* A history list is ids, dates, reasons and summaries. This shipped two
         full copies of the page per row instead — up to fifty of them, and on
         the repo page a snapshot ran 1.5MB, so opening the history of one page
         could move tens of megabytes to render five lines in a rail.

         What the readers actually reach into is narrow: Open Sentence looks for
         an earlier wording in before.body and before.claims, and the accepted-
         revision picker falls back to a claim's text in either side. Nothing
         reads plainText, aiState, freshness, publicProof or the body of after.
         A caller that truly wants the whole snapshot asks for it. */
      const wantsSnapshots = String(req.query.include || '').split(',').includes('snapshots');
      const query = WikiRevision.find({ userId: req.user.id, pageId: req.params.id })
        .sort({ createdAt: -1 })
        .limit(limit);
      const revisions = await (wantsSnapshots ? query : query.select([
        'reason', 'actorType', 'sourceEventId', 'maintenanceRunId', 'promotionStatus',
        'claimReview', 'sourceVersion', 'quality', 'summary', 'pageId', 'userId',
        'snapshotPrunedAt', 'snapshotExpiryPolicy', 'snapshotUnchanged', 'contentHash', 'createdAt', 'updatedAt',
        'before.body', 'before.claims', 'before.citations', 'before.sourceRefs',
        'after.claims'
      ].join(' '))).lean();
      const sentences = describeHistory(revisions, page);
      const sources = await changeSourcesFor(req.user.id, revisions);
      res.status(200).json({
        revisions: revisions.map((revision, index) => ({
          ...revision,
          sentence: sentences[index],
          changeSource: sources.get(String(revision._id)) || null
        }))
      });
    } catch (error) {
      console.error('Error listing wiki revisions:', error);
      res.status(500).json({ error: 'Failed to list wiki revisions.' });
    }
  });

  router.post('/api/wiki/pages/:id/revisions/latest/restore', wikiAuth, async (req, res) => {
    try {
      if (!WikiRevision) return res.status(503).json({ error: 'Wiki revisions are not available.' });
      const page = await findOwnedPage(req);
      if (!page) return res.status(404).json({ error: 'Wiki page not found.' });
      const revision = await WikiRevision.findOne({ userId: req.user.id, pageId: req.params.id })
        .sort({ createdAt: -1 });
      if (!revision?.before) return res.status(404).json({ error: 'No restorable wiki revision found.' });
      const beforeRestore = snapshotPage(page);
      restorePageSnapshot(page, revision.before);
      await page.save();
      await syncPageGraph(page, req.user.id);
      await createWikiRevision({
        WikiRevision,
        userId: req.user.id,
        page,
        before: beforeRestore,
        reason: 'external_agent_undo',
        actorType: 'user',
        summary: `Restored "${page.title}" from the latest captured revision.`
      });
      res.status(200).json({
        page: serializeWikiPage(page),
        restoredRevisionId: serializeId(revision._id)
      });
    } catch (error) {
      console.error('Error restoring latest wiki revision:', error);
      res.status(500).json({ error: 'Failed to restore wiki revision.' });
    }
  });

  router.get('/api/wiki/pages/:id/connector-actions', wikiAuth, async (req, res) => {
    try {
      const page = await findOwnedPage(req).select('_id').lean();
      if (!page) return res.status(404).json({ error: 'Wiki page not found.' });
      if (!ConnectorActionLog) return res.status(200).json({ actions: [] });
      const actions = await ConnectorActionLog.find({
        userId: req.user.id,
        targetType: 'wiki_page',
        targetId: String(req.params.id)
      }).sort({ createdAt: -1 }).limit(20).lean();
      res.status(200).json({ actions });
    } catch (error) {
      console.error('Error listing wiki connector actions:', error);
      res.status(500).json({ error: 'Failed to list wiki connector actions.' });
    }
  });

  router.get('/api/wiki/pages/:id/autolinks', wikiAuth, async (req, res) => {
    try {
      const page = await findOwnedPage(req).lean();
      if (!page) return res.status(404).json({ error: 'Wiki page not found.' });
      const result = await findAutolinkSuggestions({
        targetPage: page,
        userId: req.user.id,
        models: { WikiPage }
      });
      res.status(200).json(result);
    } catch (error) {
      console.error('Error listing wiki autolink suggestions:', error);
      res.status(500).json({ error: 'Failed to list wiki autolink suggestions.' });
    }
  });

  router.post('/api/wiki/pages/:id/autolinks/:targetPageId/apply', wikiAuth, async (req, res) => {
    try {
      if (!mongoose.Types.ObjectId.isValid(String(req.params.targetPageId || ''))) {
        return res.status(400).json({ error: 'Invalid target wiki page id.' });
      }
      const page = await findOwnedPage(req);
      if (!page) return res.status(404).json({ error: 'Wiki page not found.' });
      const targetPage = await WikiPage.findOne({
        _id: req.params.targetPageId,
        userId: req.user.id,
        status: { $ne: 'archived' }
      }).lean();
      if (!targetPage) return res.status(404).json({ error: 'Target wiki page not found.' });
      if (String(targetPage._id) === String(page._id)) return res.status(400).json({ error: 'Cannot link a Wiki page to itself.' });
      const before = snapshotPage(page);
      const result = applyWikiAutolinkToDoc({ doc: page.body || emptyDoc(), targetPage });
      if (!result.applied) {
        return res.status(409).json({ error: 'Could not apply link. The mention may already be linked or no longer exists.' });
      }
      page.body = result.doc;
      page.plainText = docText(result.doc);
      await page.save();
      await syncPageGraph(page, req.user.id);
      await createWikiRevision({
        WikiRevision,
        userId: req.user.id,
        page,
        before,
        reason: 'user_edit',
        actorType: 'user',
        summary: `Linked "${targetPage.title}" from "${page.title}".`
      });
      res.status(200).json(serializeWikiPage(page));
    } catch (error) {
      console.error('Error applying wiki autolink:', error);
      res.status(500).json({ error: 'Failed to apply wiki link.' });
    }
  });

  router.post('/api/wiki/pages/:id/freshness/review', wikiAuth, async (req, res) => {
    try {
      const page = await findOwnedPage(req);
      if (!page) return res.status(404).json({ error: 'Wiki page not found.' });
      page.freshness = {
        ...(page.freshness?.toObject ? page.freshness.toObject() : page.freshness || {}),
        status: 'fresh',
        conflictCount: 0,
        staleSectionCount: 0,
        reviewedAt: new Date()
      };
      await page.save();
      await createWikiRevision({
        WikiRevision,
        userId: req.user.id,
        page,
        reason: 'user_edit',
        actorType: 'user',
        summary: `Marked "${page.title}" freshness reviewed.`
      });
      res.status(200).json(serializeWikiPage(page));
    } catch (error) {
      console.error('Error reviewing wiki freshness:', error);
      res.status(500).json({ error: 'Failed to mark wiki freshness reviewed.' });
    }
  });

  router.post('/api/wiki/pages/:id/write-back/:connector', wikiAuth, async (req, res) => {
    try {
      const page = await findOwnedPage(req);
      if (!page) return res.status(404).json({ error: 'Wiki page not found.' });
      const result = await writeWikiPageToConnector({
        page,
        userId: req.user.id,
        connector: req.params.connector,
        connectionId: req.body?.connectionId,
        parentPageId: req.body?.parentPageId,
        notionPageId: req.body?.notionPageId,
        models: { IntegrationConnection, ConnectorActionLog },
        createNotionPage,
        appendNotionBlockChildren,
        updateNotionPageTitle,
        decryptSecret
      });
      res.status(201).json(result);
    } catch (error) {
      if (error.code === 'CONNECTOR_CONNECTION_NOT_FOUND') return res.status(404).json({ error: error.message });
      if (error.code === 'CONNECTOR_WRITEBACK_UNSUPPORTED') return res.status(400).json({ error: error.message });
      if (error.code === 'CONNECTOR_TOKEN_MISSING' || error.code === 'CONNECTOR_WRITEBACK_NOT_CONFIGURED') {
        return res.status(400).json({ error: error.message });
      }
      console.error('Error writing wiki page to connector:', error);
      res.status(500).json({ error: 'Failed to write wiki page to connector.' });
    }
  });
};
