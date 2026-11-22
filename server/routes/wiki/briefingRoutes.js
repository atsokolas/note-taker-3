// The wiki briefing, backlinks and graph, and the page proposals the wiki makes.
const { DEFAULT_BRIEFING_CACHE_MAX_AGE_MS, loadCachedWikiBriefing, persistWikiBriefingCache } = require('../../services/wikiBriefingService');
const { syncWikiPageGraphConnections, rebuildWikiGraphConnections } = require('../../services/wikiGraphConnectionService');
const { serializeWikiProposal } = require('../../services/wikiSourceRefs');
const { normalizeObjectId, serializeWikiPage } = require('../../services/wikiPageShape');
const { createDraftPageFromProposal } = require('../../services/wikiProposalService');

module.exports = (router, {
  Article,
  Connection,
  ImportSession,
  NoeisReceipt,
  NotebookEntry,
  Question,
  TagMeta,
  User,
  WikiBriefingCache,
  WikiMaintenanceRun,
  WikiPage,
  WikiProposal,
  WikiRevision,
  WikiSourceEvent,
  buildUniqueSlug,
  buildWikiBriefing,
  findOwnedPage,
  findWikiBacklinks,
  maintainProposalDraft,
  refreshWikiProposals,
  wikiAuth
}) => {
  // Daily wiki briefing for the index page. A fresh read model is served first
  // so warm opens do not re-run the full page/library scan.
  router.get('/api/wiki/briefing', wikiAuth, async (req, res) => {
    try {
      const now = Date.now();
      const requestedWindowDays = Number(req.query.windowDays);
      const windowDays = Number.isFinite(requestedWindowDays)
        ? Math.max(1, Math.min(Math.floor(requestedWindowDays), 7))
        : 1;
      const usesDailyCache = windowDays === 1;
      const maxAgeMs = Math.max(
        60 * 1000,
        Number(process.env.WIKI_BRIEFING_CACHE_MAX_AGE_MS || DEFAULT_BRIEFING_CACHE_MAX_AGE_MS)
      );
      const cachedBriefing = usesDailyCache
        ? await loadCachedWikiBriefing({
          userId: req.user.id,
          WikiBriefingCache,
          now,
          maxAgeMs
        })
        : null;
      if (cachedBriefing) {
        res.setHeader('X-Noeis-Briefing-Cache', 'HIT');
        return res.status(200).json(cachedBriefing);
      }
      const briefing = await buildWikiBriefing({
        userId: req.user.id,
        models: {
          WikiPage,
          Article,
          NotebookEntry,
          TagMeta,
          Question,
          ImportSession,
          NoeisReceipt,
          WikiRevision,
          WikiMaintenanceRun,
          WikiSourceEvent,
          Connection,
          // The masthead numbers the morning from the day the account began.
          User
        },
        now,
        windowMs: windowDays * 24 * 60 * 60 * 1000
      });
      if (usesDailyCache) {
        await persistWikiBriefingCache({
          userId: req.user.id,
          WikiBriefingCache,
          briefing,
          now,
          maxAgeMs
        });
      }
      res.setHeader('X-Noeis-Briefing-Cache', 'MISS');
      res.status(200).json(briefing);
    } catch (error) {
      console.error('Error building wiki briefing:', error);
      res.status(500).json({ error: 'Failed to build wiki briefing.' });
    }
  });

  // Backlinks for a single page — "Mentioned in N other pages." Computed
  // on demand by scanning the user's other pages' plainText for substring
  // matches against this page's title.
  router.get('/api/wiki/pages/:id/backlinks', wikiAuth, async (req, res) => {
    try {
      const targetPage = await findOwnedPage(req).lean();
      if (!targetPage) return res.status(404).json({ error: 'Wiki page not found.' });
      const result = await findWikiBacklinks({
        targetPage,
        userId: req.user.id,
        models: { WikiPage }
      });
      res.status(200).json(result);
    } catch (error) {
      console.error('Error finding wiki backlinks:', error);
      res.status(500).json({ error: 'Failed to compute wiki backlinks.' });
    }
  });

  router.post('/api/wiki/pages/:id/graph/rebuild', wikiAuth, async (req, res) => {
    try {
      if (!Connection) return res.status(503).json({ error: 'Wiki graph storage is not available.' });
      const page = await findOwnedPage(req).lean();
      if (!page) return res.status(404).json({ error: 'Wiki page not found.' });
      const result = await syncWikiPageGraphConnections({
        Connection,
        userId: req.user.id,
        page
      });
      res.status(200).json(result);
    } catch (error) {
      console.error('Error rebuilding wiki page graph:', error);
      res.status(500).json({ error: 'Failed to rebuild wiki page graph.' });
    }
  });

  router.post('/api/wiki/graph/rebuild', wikiAuth, async (req, res) => {
    try {
      if (!Connection) return res.status(503).json({ error: 'Wiki graph storage is not available.' });
      const limit = Math.max(1, Math.min(Number(req.body?.limit) || 500, 1000));
      const result = await rebuildWikiGraphConnections({
        Connection,
        WikiPage,
        userId: req.user.id,
        limit
      });
      res.status(200).json(result);
    } catch (error) {
      console.error('Error rebuilding wiki graph:', error);
      res.status(500).json({ error: 'Failed to rebuild wiki graph.' });
    }
  });

  router.get('/api/wiki/proposals', wikiAuth, async (req, res) => {
    try {
      const result = await refreshWikiProposals({ userId: req.user.id, force: false });
      res.status(200).json(result);
    } catch (error) {
      console.error('Error listing wiki proposals:', error);
      res.status(500).json({ error: 'Failed to list wiki proposals.' });
    }
  });

  router.post('/api/wiki/proposals/generate-background', wikiAuth, async (req, res) => {
    try {
      const result = await refreshWikiProposals({ userId: req.user.id, force: Boolean(req.body?.force) });
      res.status(200).json(result);
    } catch (error) {
      console.error('Error refreshing wiki proposals:', error);
      res.status(500).json({ error: 'Failed to refresh wiki proposals.' });
    }
  });

  router.post('/api/wiki/proposals/:proposalId/watch', wikiAuth, async (req, res) => {
    try {
      if (!WikiProposal) return res.status(404).json({ error: 'Wiki proposal not found.' });
      const proposal = await WikiProposal.findOneAndUpdate(
        { _id: req.params.proposalId, userId: req.user.id, status: 'pending' },
        { status: 'watched' },
        { new: true }
      );
      if (!proposal) return res.status(404).json({ error: 'Wiki proposal not found.' });
      res.status(200).json(serializeWikiProposal(proposal));
    } catch (error) {
      console.error('Error watching wiki proposal:', error);
      res.status(500).json({ error: 'Failed to watch wiki proposal.' });
    }
  });

  router.post('/api/wiki/proposals/:proposalId/dismiss', wikiAuth, async (req, res) => {
    try {
      if (!WikiProposal) return res.status(404).json({ error: 'Wiki proposal not found.' });
      const proposal = await WikiProposal.findOneAndUpdate(
        { _id: req.params.proposalId, userId: req.user.id, status: { $in: ['pending', 'watched'] } },
        { status: 'dismissed', dismissedReason: String(req.body?.reason || '').trim().slice(0, 500) },
        { new: true }
      );
      if (!proposal) return res.status(404).json({ error: 'Wiki proposal not found.' });
      res.status(200).json(serializeWikiProposal(proposal));
    } catch (error) {
      console.error('Error dismissing wiki proposal:', error);
      res.status(500).json({ error: 'Failed to dismiss wiki proposal.' });
    }
  });

  router.post('/api/wiki/proposals/:proposalId/merge', wikiAuth, async (req, res) => {
    try {
      if (!WikiProposal) return res.status(404).json({ error: 'Wiki proposal not found.' });
      const pageId = normalizeObjectId(req.body?.pageId);
      if (!pageId) return res.status(400).json({ error: 'pageId must be a valid id.' });
      const targetPage = await WikiPage.findOne({ _id: pageId, userId: req.user.id }).select('_id').lean();
      if (!targetPage) return res.status(404).json({ error: 'Merge target page not found.' });
      const proposal = await WikiProposal.findOneAndUpdate(
        { _id: req.params.proposalId, userId: req.user.id, status: { $in: ['pending', 'watched'] } },
        { status: 'merged', mergedIntoPageId: pageId },
        { new: true }
      );
      if (!proposal) return res.status(404).json({ error: 'Wiki proposal not found.' });
      res.status(200).json(serializeWikiProposal(proposal));
    } catch (error) {
      console.error('Error merging wiki proposal:', error);
      res.status(500).json({ error: 'Failed to merge wiki proposal.' });
    }
  });

  router.post('/api/wiki/proposals/:proposalId/accept', wikiAuth, async (req, res) => {
    try {
      if (!WikiProposal) return res.status(404).json({ error: 'Wiki proposal not found.' });
      const proposal = await WikiProposal.findOne({
        _id: req.params.proposalId,
        userId: req.user.id,
        status: { $in: ['pending', 'watched'] }
      });
      if (!proposal) return res.status(404).json({ error: 'Wiki proposal not found.' });
      const page = await createDraftPageFromProposal({ proposal, WikiPage, buildUniqueSlug });
      const maintainedPage = await maintainProposalDraft({ page, userId: req.user.id });
      res.status(201).json({ proposal: serializeWikiProposal(proposal), page: serializeWikiPage(maintainedPage) });
    } catch (error) {
      console.error('Error accepting wiki proposal:', error);
      res.status(500).json({ error: 'Failed to accept wiki proposal.' });
    }
  });
};
