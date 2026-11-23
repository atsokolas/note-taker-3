// A page's sources, asking a page a question, and the discussions an answer becomes.
const { normalizeSourceRef } = require('../../services/wikiSourceRefs');
const { createWikiRevision } = require('../../services/wikiRevisionService');
const {
  serializeId,
  serializeWikiPage,
  normalizeTitle,
  deriveTitleFromQuestion,
  collectCitationIndexesFromDoc,
  cloneSourceRefForPromotion,
  buildPromotedDiscussionDoc
} = require('../../services/wikiPageShape');
const { docText } = require('../../lib/editorialText');

module.exports = (router, {
  EVENT_NAMES,
  TagMeta,
  WikiPage,
  WikiRevision,
  applyAutolinksForPage,
  askWikiPage,
  autolinkPagesToTarget,
  buildUniqueSlug,
  findOwnedPage,
  findWikiBacklinks,
  loadWikiAskCorpus,
  loadWikiSchemaContent,
  openWikiAskStream,
  refreshPageClaims,
  syncPageGraph,
  trackWikiEvent,
  wikiAuth,
  writeSse
}) => {
  router.post('/api/wiki/pages/:id/sources', wikiAuth, async (req, res) => {
    try {
      const sourceRef = normalizeSourceRef(req.body);
      if (sourceRef.error) return res.status(400).json({ error: sourceRef.error });

      const page = await findOwnedPage(req);
      if (!page) return res.status(404).json({ error: 'Wiki page not found.' });

      page.sourceRefs.push(sourceRef.value);
      refreshPageClaims(page);
      await page.save();
      await syncPageGraph(page, req.user.id);
      await createWikiRevision({
        WikiRevision,
        userId: req.user.id,
        page,
        reason: 'user_edit',
        actorType: 'user',
        summary: `Attached a source to "${page.title}".`
      });
      trackWikiEvent(req, EVENT_NAMES.WIKI_SOURCE_ATTACHED, {
        pageId: serializeId(page._id),
        title: page.title,
        pageType: page.pageType,
        sourceCount: Array.isArray(page.sourceRefs) ? page.sourceRefs.length : 0,
        sourceType: sourceRef.value?.type || ''
      });
      res.status(201).json(serializeWikiPage(page));
    } catch (error) {
      console.error('Error adding wiki source:', error);
      res.status(500).json({ error: 'Failed to add wiki source.' });
    }
  });

  router.delete('/api/wiki/pages/:id/sources/:sourceRefId', wikiAuth, async (req, res) => {
    try {
      const page = await findOwnedPage(req);
      if (!page) return res.status(404).json({ error: 'Wiki page not found.' });

      const source = page.sourceRefs.id(req.params.sourceRefId);
      if (!source) return res.status(404).json({ error: 'Wiki source not found.' });

      source.deleteOne();
      refreshPageClaims(page);
      await page.save();
      await syncPageGraph(page, req.user.id);
      await createWikiRevision({
        WikiRevision,
        userId: req.user.id,
        page,
        reason: 'user_edit',
        actorType: 'user',
        summary: `Removed a source from "${page.title}".`
      });
      res.status(200).json(serializeWikiPage(page));
    } catch (error) {
      console.error('Error removing wiki source:', error);
      res.status(500).json({ error: 'Failed to remove wiki source.' });
    }
  });

  // Ask the agent a question about this page. The answer is appended to
  // the page's discussions array and the updated page is returned so the
  // editor can re-render the discussions section.
  router.post('/api/wiki/pages/:id/ask', wikiAuth, async (req, res) => {
    try {
      const question = String(req.body?.question || '').trim();
      if (!question) return res.status(400).json({ error: 'Question is required.' });
      if (question.length > 1000) return res.status(400).json({ error: 'Question is too long.' });

      const page = await findOwnedPage(req);
      if (!page) return res.status(404).json({ error: 'Wiki page not found.' });
      const corpus = await loadWikiAskCorpus({
        page,
        question,
        userId: req.user.id,
        WikiPage,
        WikiRevision,
        TagMeta,
        findWikiBacklinks
      });

      const result = await askWikiPage({
        page,
        question,
        relatedPages: corpus.relatedPages,
        conceptRecords: corpus.conceptRecords,
        backlinkRows: corpus.backlinkRows,
        revisionRows: corpus.revisionRows,
        wikiSchemaContent: await loadWikiSchemaContent(req.user.id)
      });

      page.discussions.push({
        question,
        answer: result.answer,
        citationIndexesUsed: result.citationIndexesUsed || [],
        provenance: result.provenance || {},
        model: result.model || '',
        status: result.status || 'answered',
        errorMessage: result.errorMessage || '',
        askedAt: new Date()
      });
      await page.save();

      res.status(200).json(serializeWikiPage(page));
    } catch (error) {
      console.error('Error asking wiki page:', error);
      res.status(500).json({ error: 'Failed to ask wiki page.' });
    }
  });

  const answerDocText = (node) => {
    if (!node) return '';
    if (typeof node === 'string') return node;
    if (Array.isArray(node)) return node.map(answerDocText).filter(Boolean).join(' ');
    if (typeof node !== 'object') return '';
    const own = typeof node.text === 'string' ? node.text : '';
    const child = Array.isArray(node.content) ? answerDocText(node.content) : '';
    return [own, child].filter(Boolean).join(' ').trim();
  };

  const streamAnswerText = async (res, text = '') => {
    const chunks = String(text || '')
      .split(/(\s+)/)
      .filter(Boolean);
    for (const chunk of chunks) {
      writeSse(res, 'wiki-ask-delta', { delta: chunk });
      // Yield between chunks so browser rendering sees a real stream instead
      // of one buffered terminal event.
      await new Promise(resolve => setTimeout(resolve, 8));
    }
  };

  router.post('/api/wiki/pages/:id/ask/stream', wikiAuth, async (req, res) => {
    openWikiAskStream(res);
    try {
      const question = String(req.body?.question || '').trim();
      if (!question) {
        writeSse(res, 'error', { error: 'Question is required.' });
        return res.end();
      }
      if (question.length > 1000) {
        writeSse(res, 'error', { error: 'Question is too long.' });
        return res.end();
      }

      const page = await findOwnedPage(req);
      if (!page) {
        writeSse(res, 'error', { error: 'Wiki page not found.' });
        return res.end();
      }
      const corpus = await loadWikiAskCorpus({
        page,
        question,
        userId: req.user.id,
        WikiPage,
        WikiRevision,
        TagMeta,
        findWikiBacklinks
      });

      writeSse(res, 'wiki-ask', {
        stage: 'thinking',
        summary: 'Reading selected page, related wiki pages, highlights, concepts, and backlinks.'
      });
      const result = await askWikiPage({
        page,
        question,
        relatedPages: corpus.relatedPages,
        conceptRecords: corpus.conceptRecords,
        backlinkRows: corpus.backlinkRows,
        revisionRows: corpus.revisionRows,
        wikiSchemaContent: await loadWikiSchemaContent(req.user.id)
      });
      const answerText = answerDocText(result.answer);
      await streamAnswerText(res, answerText);

      page.discussions.push({
        question,
        answer: result.answer,
        citationIndexesUsed: result.citationIndexesUsed || [],
        provenance: result.provenance || {},
        model: result.model || '',
        status: result.status || 'answered',
        errorMessage: result.errorMessage || '',
        askedAt: new Date()
      });
      await page.save();

      writeSse(res, 'wiki-ask', {
        stage: 'complete',
        page: serializeWikiPage(page)
      });
      writeSse(res, 'done', { ok: true, pageId: serializeId(page._id) });
      res.end();
    } catch (error) {
      console.error('Error streaming wiki page ask:', error);
      writeSse(res, 'error', {
        error: 'Failed to ask wiki page.',
        message: error?.message || ''
      });
      res.end();
    }
  });

  router.post('/api/wiki/pages/:id/discussions/:discussionId/promote', wikiAuth, async (req, res) => {
    try {
      const sourcePage = await findOwnedPage(req);
      if (!sourcePage) return res.status(404).json({ error: 'Wiki page not found.' });

      const discussion = sourcePage.discussions.id(req.params.discussionId);
      if (!discussion) return res.status(404).json({ error: 'Discussion not found.' });
      if (discussion.status === 'failed') {
        return res.status(400).json({ error: 'Only answered discussions can become wiki pages.' });
      }

      const title = normalizeTitle(req.body?.title || deriveTitleFromQuestion(discussion.question));
      const citationIndexes = collectCitationIndexesFromDoc(discussion.answer);
      (discussion.citationIndexesUsed || []).forEach((index) => {
        const numeric = Number(index);
        if (Number.isInteger(numeric) && numeric >= 1) citationIndexes.add(numeric);
      });
      const sourceRefs = Array.from(citationIndexes)
        .sort((a, b) => a - b)
        .map(index => sourcePage.sourceRefs?.[index - 1])
        .map(cloneSourceRefForPromotion)
        .filter(Boolean);
      const citationIndexMap = new Map(
        Array.from(citationIndexes)
          .sort((a, b) => a - b)
          .map((index, nextIndex) => [index, nextIndex + 1])
      );
      const body = buildPromotedDiscussionDoc({ title, discussion, citationIndexMap });
      const promotedPage = new WikiPage({
        userId: req.user.id,
        title,
        slug: await buildUniqueSlug(req.user.id, title),
        pageType: 'question',
        status: 'draft',
        visibility: 'private',
        sourceScope: sourceRefs.length > 0 ? 'selected_sources' : 'current_item',
        createdFrom: {
          type: 'question',
          objectId: sourcePage._id,
          objectIds: [sourcePage._id],
          text: discussion.question,
          label: sourcePage.title
        },
        body,
        plainText: docText(body),
        sourceRefs
      });

      await applyAutolinksForPage(promotedPage, req.user.id);
      refreshPageClaims(promotedPage);
      await promotedPage.save();
      await syncPageGraph(promotedPage, req.user.id);
      await createWikiRevision({
        WikiRevision,
        userId: req.user.id,
        page: promotedPage,
        reason: 'created',
        actorType: 'agent',
        summary: `Created "${promotedPage.title}" from a discussion on "${sourcePage.title}".`
      });
      const linkedNeighborPages = await autolinkPagesToTarget({
        targetPage: promotedPage,
        userId: req.user.id,
        sourcePageId: sourcePage._id
      });
      trackWikiEvent(req, EVENT_NAMES.WIKI_QA_PROMOTED, {
        sourcePageId: serializeId(sourcePage._id),
        promotedPageId: serializeId(promotedPage._id),
        citationCount: sourceRefs.length,
        linkedNeighborPageCount: linkedNeighborPages.length
      });
      res.status(201).json({
        page: serializeWikiPage(promotedPage),
        sourcePage: serializeWikiPage(sourcePage),
        linkedNeighborPageIds: linkedNeighborPages.map(page => serializeId(page._id)).filter(Boolean)
      });
    } catch (error) {
      console.error('Error promoting wiki discussion:', error);
      res.status(500).json({ error: 'Failed to create wiki page from discussion.' });
    }
  });

  router.delete('/api/wiki/pages/:id/discussions/:discussionId', wikiAuth, async (req, res) => {
    try {
      const page = await findOwnedPage(req);
      if (!page) return res.status(404).json({ error: 'Wiki page not found.' });

      const discussion = page.discussions.id(req.params.discussionId);
      if (!discussion) return res.status(404).json({ error: 'Discussion not found.' });

      discussion.deleteOne();
      await page.save();
      res.status(200).json(serializeWikiPage(page));
    } catch (error) {
      console.error('Error removing wiki discussion:', error);
      res.status(500).json({ error: 'Failed to remove discussion.' });
    }
  });
};
