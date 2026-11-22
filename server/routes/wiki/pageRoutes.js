// One page and the watches on it: EDGAR filings, earnings transcripts, a GitHub repository.
const { linkPageSources } = require('../../services/librarySource');
const { CHATGPT_ACCESS_PROFILE } = require('../../services/chatgptAccessPolicy');
const { readReviewerBudgetStatus } = require('../../services/reviewerRehearsalBudget');
const { serializeWikiPage, serializeId } = require('../../services/wikiPageShape');
const { normalizeTicker: normalizeEdgarTicker, padCik: padEdgarCik, normalizeForms: normalizeEdgarForms } = require('../../services/edgarWatcherService');
const { normalizeTicker: normalizeTranscriptTicker } = require('../../services/earningsTranscriptWatcherService');
const { parseGitHubRepo: parseGitHubRepoWatchInput } = require('../../services/githubRepoWatcherService');
const { attachSourceEventsToPageRefs } = require('../../services/wikiSourceRefs');

module.exports = (router, {
  Article,
  WikiPage,
  WikiSourceEvent,
  armEdgarWatchForPage,
  armGitHubRepoWatchForPage,
  armTranscriptWatchForPage,
  checkEdgarWatchForPage,
  checkGitHubRepoHeadForPage,
  checkGitHubRepoWatchForPage,
  checkTranscriptWatchForPage,
  wikiAuth
}) => {
  router.get('/api/wiki/pages/:id', wikiAuth, async (req, res) => {
    try {
      /* Reader routes never mutate the fetched document. Lean avoids hydrating
         large repository evidence ledgers into thousands of Mongoose
         subdocuments before the page can paint. The article projection also
         leaves the historical claim ledger and maintenance workbench behind;
         neither is rendered by the article, and repo histories can exceed the
         article itself by an order of magnitude. */
      const pageQuery = WikiPage.findOne({ _id: req.params.id, userId: req.user.id });
      if (String(req.query?.reader || '') === '1') {
        pageQuery.select([
          '-claims.history',
          '-citations',
          '-discussions',
          '-aiState.build',
          '-aiState.sectionMaintenance',
          '-aiState.changeLog',
          '-aiState.suggestions'
        ].join(' '));
      }
      const page = await pageQuery.lean();
      if (!page) return res.status(404).json({ error: 'Wiki page not found.' });
      await linkPageSources({ Article, WikiSourceEvent, WikiPage, page })
        .catch(error => console.error('Could not link wiki sources to the Library:', error));
      const repoWatch = page.externalWatches?.githubRepo || {};
      const lastProbeAt = repoWatch.lastHeadProbeAt ? new Date(repoWatch.lastHeadProbeAt).getTime() : 0;
      const probeStale = Date.now() - lastProbeAt >= 15 * 60 * 1000;
      if (req.agentToken?.accessProfile !== CHATGPT_ACCESS_PROFILE && repoWatch.status === 'active' && repoWatch.owner && repoWatch.repo && probeStale) {
        const pageId = page._id;
        const userId = page.userId;
        /* Opening a Wiki is a database read, never a GitHub request. A stale
           repo probe is useful maintenance, but it cannot sit on the reader's
           critical path. Run the bounded probe after the response begins and
           let the next read observe any changed-head metadata it records. */
        setImmediate(async () => {
          const probeController = new AbortController();
          const probeTimer = setTimeout(() => probeController.abort(), 1800);
          try {
            const freshPage = await WikiPage.findOne({ _id: pageId, userId });
            if (!freshPage) return;
            const probe = await checkGitHubRepoHeadForPage({
              WikiPage,
              page: freshPage,
              signal: probeController.signal
            });
            if (probe.changed) {
              const changedPage = await WikiPage.findOne({ _id: pageId, userId });
              if (changedPage) await checkGitHubRepoWatchForPage({ WikiSourceEvent, page: changedPage });
            }
          } catch (_probeError) {
            // Reading remains available when GitHub is unavailable or rate limited.
          } finally {
            clearTimeout(probeTimer);
          }
        });
      }
      const reviewerBudget = page.visibility === 'private'
        ? await readReviewerBudgetStatus({ userId: req.user.id, pageId: page._id }) : null;
      res.status(200).json({ ...serializeWikiPage(page), ...(reviewerBudget ? { reviewerBudget } : {}) });
    } catch (_error) {
      res.status(400).json({ error: 'Invalid wiki page id.' });
    }
  });

  router.post('/api/wiki/pages/:id/edgar-watch', wikiAuth, async (req, res) => {
    try {
      const ticker = normalizeEdgarTicker(req.body?.ticker);
      const cik = padEdgarCik(req.body?.cik);
      if (!ticker && !cik) return res.status(400).json({ error: 'ticker or cik is required.' });
      const result = await armEdgarWatchForPage({
        WikiPage,
        WikiSourceEvent,
        userId: req.user.id,
        pageId: req.params.id,
        ticker,
        cik,
        companyName: req.body?.companyName,
        forms: normalizeEdgarForms(req.body?.forms),
        checkNow: req.body?.checkNow !== false
      });
      res.status(200).json({
        page: serializeWikiPage(result.page),
        filings: Array.isArray(result.filings) ? result.filings : [],
        sourceEvents: Array.isArray(result.events)
          ? result.events.map(event => ({
            id: serializeId(event._id),
            title: event.title,
            status: event.status,
            externalId: event.externalId,
            url: event.url,
            sourceUpdatedAt: event.sourceUpdatedAt
          }))
          : []
      });
    } catch (error) {
      res.status(error.statusCode || 500).json({ error: error.message || 'Failed to arm EDGAR watch.' });
    }
  });

  router.post('/api/wiki/pages/:id/edgar-watch/check', wikiAuth, async (req, res) => {
    try {
      const page = await WikiPage.findOne({ _id: req.params.id, userId: req.user.id, status: { $ne: 'archived' } });
      if (!page) return res.status(404).json({ error: 'Wiki page not found.' });
      const result = await checkEdgarWatchForPage({
        WikiSourceEvent,
        page,
        limit: req.body?.limit
      });
      res.status(200).json({
        page: serializeWikiPage(result.page),
        filings: Array.isArray(result.filings) ? result.filings : [],
        sourceEvents: Array.isArray(result.events)
          ? result.events.map(event => ({
            id: serializeId(event._id),
            title: event.title,
            status: event.status,
            externalId: event.externalId,
            url: event.url,
            sourceUpdatedAt: event.sourceUpdatedAt
          }))
          : []
      });
    } catch (error) {
      res.status(error.statusCode || 500).json({ error: error.message || 'Failed to check EDGAR watch.' });
    }
  });

  router.post('/api/wiki/pages/:id/transcript-watch', wikiAuth, async (req, res) => {
    try {
      const ticker = normalizeTranscriptTicker(req.body?.ticker);
      if (!ticker) return res.status(400).json({ error: 'ticker is required.' });
      const result = await armTranscriptWatchForPage({
        WikiPage,
        WikiSourceEvent,
        userId: req.user.id,
        pageId: req.params.id,
        ticker,
        checkNow: req.body?.checkNow !== false
      });
      res.status(200).json({
        page: serializeWikiPage(result.page),
        transcript: result.transcript || null,
        sourceEvents: Array.isArray(result.events)
          ? result.events.map(event => ({
            id: serializeId(event._id),
            title: event.title,
            status: event.status,
            externalId: event.externalId,
            sourceUpdatedAt: event.sourceUpdatedAt
          }))
          : []
      });
    } catch (error) {
      res.status(error.statusCode || 500).json({ error: error.message || 'Failed to arm transcript watch.' });
    }
  });

  router.post('/api/wiki/pages/:id/transcript-watch/check', wikiAuth, async (req, res) => {
    try {
      const page = await WikiPage.findOne({ _id: req.params.id, userId: req.user.id, status: { $ne: 'archived' } });
      if (!page) return res.status(404).json({ error: 'Wiki page not found.' });
      const result = await checkTranscriptWatchForPage({
        WikiSourceEvent,
        page
      });
      res.status(200).json({
        page: serializeWikiPage(result.page),
        transcript: result.transcript || null,
        sourceEvents: Array.isArray(result.events)
          ? result.events.map(event => ({
            id: serializeId(event._id),
            title: event.title,
            status: event.status,
            externalId: event.externalId,
            sourceUpdatedAt: event.sourceUpdatedAt
          }))
          : []
      });
    } catch (error) {
      res.status(error.statusCode || 500).json({ error: error.message || 'Failed to check transcript watch.' });
    }
  });

  router.post('/api/wiki/pages/:id/github-repo-watch', wikiAuth, async (req, res) => {
    try {
      const repoInput = String(req.body?.repo || req.body?.repoUrl || '').trim();
      const owner = String(req.body?.owner || '').trim();
      const repoName = String(req.body?.repoName || '').trim();
      if (!repoInput && (!owner || !repoName)) return res.status(400).json({ error: 'repo or owner/repoName is required.' });
      if (repoInput) parseGitHubRepoWatchInput(repoInput);
      const result = await armGitHubRepoWatchForPage({
        WikiPage,
        WikiSourceEvent,
        userId: req.user.id,
        pageId: req.params.id,
        repo: repoInput,
        owner,
        repoName,
        checkNow: req.body?.checkNow !== false
      });
      if (Array.isArray(result.events) && result.events.length) {
        result.page = await attachSourceEventsToPageRefs({
          page: result.page,
          events: result.events
        });
      }
      res.status(200).json({
        page: serializeWikiPage(result.page),
        snapshot: result.snapshot ? {
          fullName: result.snapshot.fullName,
          description: result.snapshot.description,
          defaultBranch: result.snapshot.defaultBranch,
          headSha: result.snapshot.headSha,
          docCount: Array.isArray(result.snapshot.docs) ? result.snapshot.docs.length : 0,
          latestRelease: result.snapshot.latestRelease || null
        } : null,
        sourceEvents: Array.isArray(result.events)
          ? result.events.map(event => ({
            id: serializeId(event._id),
            title: event.title,
            status: event.status,
            externalId: event.externalId,
            url: event.url,
            sourceUpdatedAt: event.sourceUpdatedAt
          }))
          : []
      });
    } catch (error) {
      res.status(error.statusCode || 500).json({ error: error.message || 'Failed to arm GitHub repo watch.' });
    }
  });

  router.post('/api/wiki/pages/:id/github-repo-watch/check', wikiAuth, async (req, res) => {
    try {
      const page = await WikiPage.findOne({ _id: req.params.id, userId: req.user.id, status: { $ne: 'archived' } });
      if (!page) return res.status(404).json({ error: 'Wiki page not found.' });
      const result = await checkGitHubRepoWatchForPage({
        WikiSourceEvent,
        page
      });
      if (Array.isArray(result.events) && result.events.length) {
        result.page = await attachSourceEventsToPageRefs({
          page: result.page,
          events: result.events
        });
      }
      res.status(200).json({
        page: serializeWikiPage(result.page),
        snapshot: result.snapshot ? {
          fullName: result.snapshot.fullName,
          description: result.snapshot.description,
          defaultBranch: result.snapshot.defaultBranch,
          headSha: result.snapshot.headSha,
          docCount: Array.isArray(result.snapshot.docs) ? result.snapshot.docs.length : 0,
          latestRelease: result.snapshot.latestRelease || null
        } : null,
        sourceEvents: Array.isArray(result.events)
          ? result.events.map(event => ({
            id: serializeId(event._id),
            title: event.title,
            status: event.status,
            externalId: event.externalId,
            url: event.url,
            sourceUpdatedAt: event.sourceUpdatedAt
          }))
          : []
      });
    } catch (error) {
      res.status(error.statusCode || 500).json({ error: error.message || 'Failed to check GitHub repo watch.' });
    }
  });
};
