// What changed in the wiki, where it contradicts itself, a page as Markdown, and the Library's evidence for a page.
const { isPromoted, describeSince, describeHistory } = require('../../services/wikiChangeStory');
const { collectContradictions, contradictionsTouching } = require('../../services/wikiContradictionService');
const { sanitizeFilename, renderWikiPageMarkdown } = require('../../services/wikiMarkdownExportService');
const { findLibraryEvidence } = require('../../services/judgmentEvidenceService');

module.exports = (router, {
  Article,
  VectorItem,
  WikiPage,
  WikiRevision,
  changeSourcesFor,
  findOwnedPage,
  wikiAuth
}) => {
  /* What moved since you last looked: one sentence per page, the net change
     from the page as it stood at `since` to the page now. A page whose
     updatedAt moved without a promoted revision (a visit, a status flag) did
     not change for the reader and is left out. */
  router.get('/api/wiki/changes', wikiAuth, async (req, res) => {
    try {
      const sinceTime = new Date(req.query.since || 0);
      const since = Number.isFinite(sinceTime.getTime()) ? sinceTime : new Date(0);
      const live = { userId: req.user.id, status: { $ne: 'archived' } };
      const [pageCount, pages] = await Promise.all([
        WikiPage.countDocuments(live),
        WikiPage.find({ ...live, updatedAt: { $gt: since } })
          .select('title body sourceRefs.title sourceRefs.url sourceRefs.objectId updatedAt')
          .sort({ updatedAt: -1 })
          .limit(12)
          .lean()
      ]);
      if (!WikiRevision?.find || !pages.length) return res.status(200).json({ since, pageCount, changes: [] });
      const changes = (await Promise.all(pages.map(async (page) => {
        const revisions = (await WikiRevision.find({ userId: req.user.id, pageId: page._id, createdAt: { $gt: since } })
          .select('reason actorType sourceEventId maintenanceRunId promotionStatus snapshotUnchanged summary before.body before.sourceRefs createdAt')
          .sort({ createdAt: -1 })
          .limit(20)
          .lean()).filter(revision => isPromoted(revision) && !revision.snapshotUnchanged);
        if (!revisions.length) return null;
        const oldest = revisions[revisions.length - 1];
        const sentence = describeSince(oldest, page) || describeHistory([revisions[0]], page)[0];
        const sources = await changeSourcesFor(req.user.id, [revisions[0]]);
        return {
          pageId: String(page._id),
          title: page.title,
          at: revisions[0].createdAt,
          by: revisions[0].actorType === 'user' ? 'you' : 'partner',
          sentence,
          changeSource: sources.get(String(revisions[0]._id)) || null
        };
      }))).filter(Boolean);
      return res.status(200).json({ since, pageCount, changes });
    } catch (error) {
      console.error('Error reading wiki changes:', error);
      return res.status(500).json({ error: 'Could not read what changed.' });
    }
  });

  router.get('/api/wiki/contradictions', wikiAuth, async (req, res) => {
    try {
      const limit = Math.max(1, Math.min(Number(req.query.limit) || 50, 200));
      const pages = await WikiPage.find({ userId: req.user.id, status: { $ne: 'archived' } })
        .select('title slug updatedAt claims citations sourceRefs')
        .sort({ updatedAt: -1 })
        .limit(300)
        .lean();
      const all = collectContradictions(pages);
      const pageId = String(req.query.pageId || '').trim();
      const contradictions = (pageId ? contradictionsTouching(all, pageId) : all).slice(0, limit);
      return res.status(200).json({ contradictions });
    } catch (error) {
      console.error('Error collecting wiki contradictions:', error);
      return res.status(500).json({ error: 'Could not read what disagrees.' });
    }
  });

  router.get('/api/wiki/pages/:id/markdown', wikiAuth, async (req, res) => {
    try {
      const page = await findOwnedPage(req).lean();
      if (!page) return res.status(404).json({ error: 'Wiki page not found.' });
      const filename = `${sanitizeFilename(page.slug || page.title)}.md`;
      res.status(200);
      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(renderWikiPageMarkdown(page));
    } catch (_error) {
      res.status(400).json({ error: 'Invalid wiki page id.' });
    }
  });

  /* What the library already holds about the claim on this page.
     The search is the held sentence — currentJudgment — not the page title.
     The agent retrieves and the human files: every candidate comes back with
     the words that matched and the source it came from, and nothing is written
     into the judgment here. Deciding whether a passage supports the claim or
     cuts against it is the reader's, and it is the whole point of the page. */
  router.get('/api/wiki/pages/:id/library-evidence', wikiAuth, async (req, res) => {
    let page;
    try {
      /* A Wiki page can carry a long article, source ledger, and maintenance
         history. Evidence retrieval needs only the held sentence and passages
         already filed beneath it; hydrating the rest made a small sidebar read
         wait behind the entire dossier. */
      const pageQuery = findOwnedPage(req).select({
        'judgment.currentJudgment': 1,
        'judgment.why': 1,
        'judgment.against': 1,
        'judgment.notAboutIds': 1
      });
      if (typeof pageQuery.maxTimeMS === 'function') pageQuery.maxTimeMS(2000);
      page = await pageQuery.lean();
    } catch (error) {
      if (error?.name === 'CastError') {
        return res.status(400).json({ error: 'Invalid wiki page id.' });
      }
      console.error('Error reading judgment for library evidence:', error);
      return res.status(500).json({ error: 'Your library could not be searched right now.' });
    }
    if (!page) return res.status(404).json({ error: 'Wiki page not found.' });
    const claim = String(page?.judgment?.currentJudgment || '').trim();
    if (!claim) {
      return res.status(409).json({ error: 'There is no claim on this page to look for.' });
    }
    if (!Article?.find) {
      return res.status(200).json({ claim, terms: [], candidates: [] });
    }
    try {
      const limit = Math.max(1, Math.min(Number(req.query.limit) || 8, 25));
      const { terms, candidates } = await findLibraryEvidence({
        Article,
        VectorItem,
        userId: req.user.id,
        pageId: page._id,
        claim,
        judgment: page.judgment || {},
        limit
      });
      return res.status(200).json({ claim, terms, candidates });
    } catch (error) {
      console.error('Error retrieving library evidence:', error);
      return res.status(500).json({ error: 'Your library could not be searched right now.' });
    }
  });
};
