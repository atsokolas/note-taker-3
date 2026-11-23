// Listing wiki pages and starting a new one.
const { validateEnumField, validatePageType, pageTypeQueryValue, normalizeInitialSourceRefs } = require('../../services/wikiSourceRefs');
const {
  STATUSES,
  VISIBILITIES,
  serializeWikiPage,
  SOURCE_SCOPES,
  normalizeCreatedFrom,
  normalizeTitle,
  escapeRegExp,
  normalizeBodyDoc,
  emptyDoc,
  serializeId
} = require('../../services/wikiPageShape');
const { wikiCollectionSearchClause, WIKI_CANON_FIELDS, WIKI_JUDGMENT_INDEX_FIELDS, WIKI_PAGE_SUMMARY_FIELDS } = require('../../services/wikiPageFields');
const mongoose = require('mongoose');
const { classifyWikiPageQuality } = require('../../services/wikiPageQualityGuard');
const { reviewExpired } = require('../../services/reviewTriageService');
const { findWriteTimeCanonicalPage } = require('../../services/wikiDedupeService');
const { buildLivingThesisBody } = require('../../services/wikiPageStructureService');
const { normalizeJudgment } = require('../../services/wikiJudgmentService');
const { docText } = require('../../lib/editorialText');
const { createWikiRevision } = require('../../services/wikiRevisionService');

module.exports = (router, {
  Article,
  EVENT_NAMES,
  NotebookEntry,
  Question,
  TagMeta,
  WikiPage,
  WikiPageVisit,
  WikiRevision,
  buildUniqueSlug,
  prepareOrdinaryWikiBuild,
  refreshPageClaims,
  rejectAgentReservedWeekendReadingsCreation,
  syncPageGraph,
  trackWikiEvent,
  wikiAuth
}) => {
  router.get('/api/wiki/pages', wikiAuth, async (req, res) => {
    try {
      const query = { userId: req.user.id };
      const status = validateEnumField('status', req.query.status, STATUSES);
      const visibility = validateEnumField('visibility', req.query.visibility, VISIBILITIES);
      const pageType = validatePageType(req.query.pageType);
      const invalidEnum = [status, visibility, pageType].find(result => result?.error);
      if (invalidEnum) return res.status(400).json({ error: invalidEnum.error });
      const qualityFilter = String(req.query.quality || '').trim().toLowerCase();
      if (qualityFilter && !['ok', 'needs_review', 'blocked'].includes(qualityFilter)) {
        return res.status(400).json({ error: 'quality must be one of: ok, needs_review, blocked.' });
      }
      const includeLowQuality = ['1', 'true', 'yes'].includes(String(req.query.includeLowQuality || '').toLowerCase());
      const projection = String(req.query.projection || '').trim().toLowerCase();
      /* The gate has to know every projection the selection below offers, or a
         surface asking for its own fields is refused before it reaches them —
         which is exactly what the canon got on its first live request. */
      if (projection && !['judgment', 'canon'].includes(projection)) {
        return res.status(400).json({ error: 'projection must be judgment or canon when provided.' });
      }
      /* The canon asks only for what was kept. wikiPageSchema already carries
         { userId, evergreen, updatedAt } for exactly this, and without the
         filter the shelf was pulling every page the account has ever had —
         a full scan that took long enough on a real corpus to never finish. */
      if (['1', 'true', 'yes'].includes(String(req.query.evergreen || '').toLowerCase())) {
        query.evergreen = true;
      }
      if (status?.value) query.status = status.value;
      else query.status = { $ne: 'archived' };
      if (visibility?.value) query.visibility = visibility.value;
      if (pageType?.value) query.pageType = pageTypeQueryValue(pageType);

      const searchClause = wikiCollectionSearchClause(req.query.q);
      if (searchClause) Object.assign(query, searchClause);

      const limit = Math.max(1, Math.min(Number(req.query.limit) || 100, 500));
      const requestedPagedScan = req.query.scanCursor !== undefined;
      if (requestedPagedScan && qualityFilter !== 'needs_review') {
        return res.status(400).json({ error: 'scanCursor is only available for the needs_review queue.' });
      }
      const pagedReviewScan = qualityFilter === 'needs_review' && requestedPagedScan;
      const scanCursor = pagedReviewScan ? String(req.query.scanCursor || '').trim() : '';
      if (
        pagedReviewScan
        && scanCursor !== 'start'
        && !mongoose.Types.ObjectId.isValid(scanCursor)
      ) {
        return res.status(400).json({ error: 'scanCursor must be start or a valid page id.' });
      }
      if (pagedReviewScan && scanCursor !== 'start') {
        query._id = { $lt: new mongoose.Types.ObjectId(scanCursor) };
      }
      let scanLimit = limit;
      if (qualityFilter) scanLimit = pagedReviewScan ? limit : 1000;
      else if (!includeLowQuality) scanLimit = Math.min(1000, Math.max(limit * 3, limit));
      // Summary mode keeps the same response shape and asks the database only
      // for what a list actually renders. See WIKI_PAGE_SUMMARY_FIELDS for what
      // is in it and why. Callers that want whole pages simply do not pass it.
      const summaryOnly = ['1', 'true', 'yes'].includes(String(req.query.summary || '').toLowerCase());
      // Review scans use immutable ids rather than mutable updatedAt offsets,
      // so concurrent maintenance cannot move a page across a batch boundary.
      let pagesQuery = WikiPage.find(query).sort(
        pagedReviewScan ? { _id: -1 } : { updatedAt: -1, _id: -1 }
      );
      pagesQuery = pagesQuery.limit(scanLimit);
      if (pagesQuery.select) {
        if (projection === 'canon') {
          pagesQuery = pagesQuery.select(WIKI_CANON_FIELDS.join(' '));
        } else if (projection === 'judgment') {
          pagesQuery = pagesQuery.select(WIKI_JUDGMENT_INDEX_FIELDS.join(' '));
        } else if (summaryOnly) {
          pagesQuery = pagesQuery.select(WIKI_PAGE_SUMMARY_FIELDS.join(' '));
        }
      }
      const pages = await pagesQuery.lean();
      const pageIds = pages.map(page => page?._id).filter(Boolean);
      const visits = qualityFilter === 'needs_review' && WikiPageVisit?.find
        ? await WikiPageVisit.find({ userId: req.user.id, pageId: { $in: pageIds } })
          .select('pageId lastVisitedAt')
          .lean()
        : [];
      const visitedAt = new Map((Array.isArray(visits) ? visits : []).map(visit => [
        String(visit?.pageId || ''),
        visit?.lastVisitedAt || null
      ]));
      const serialized = pages.map(page => ({
        raw: { ...page, lastVisitedAt: visitedAt.get(String(page?._id || '')) || null },
        value: serializeWikiPage(page)
      })).filter(({ raw, value: page }) => {
        const review = page.qualityReview || classifyWikiPageQuality(page);
        if (qualityFilter === 'ok') return review.status === 'ok';
        if (qualityFilter === 'needs_review') {
          return review.status === 'needs_review' && !reviewExpired(raw, Date.now());
        }
        if (qualityFilter === 'blocked') return review.surfaceEligible === false;
        // A dossier is research its owner asked for; it stays in their list
        // while its review is still out.
        if (includeLowQuality || raw.investmentDossier?.version) return true;
        return review.surfaceEligible !== false;
      }).map(({ raw, value }) => (
        qualityFilter === 'needs_review'
          ? { ...value, lastVisitedAt: raw.lastVisitedAt || null }
          : value
      ));
      if (pagedReviewScan) {
        return res.status(200).json({
          pages: serialized,
          nextScanCursor: pages.length === scanLimit
            ? String(pages[pages.length - 1]?._id || '') || null
            : null
        });
      }
      res.status(200).json(serialized.slice(0, limit));
    } catch (error) {
      console.error('Error listing wiki pages:', error);
      res.status(500).json({ error: 'Failed to list wiki pages.' });
    }
  });

  router.post('/api/wiki/pages', wikiAuth, async (req, res) => {
    try {
      const livingThesisPreset = req.body?.preset === 'living_thesis';
      const unsupportedMetadataFields = ['sourceRefs', 'claims', 'citations']
        .filter(field => req.body?.[field] !== undefined);
      if (unsupportedMetadataFields.length) {
        return res.status(400).json({
          error: `Unsupported wiki page metadata fields: ${unsupportedMetadataFields.join(', ')}. Use initialSourceRef when creating a page; source and claim ledgers are managed by wiki maintenance.`
        });
      }
      const pageType = validatePageType(req.body?.pageType);
      const sourceScope = validateEnumField('sourceScope', req.body?.sourceScope, SOURCE_SCOPES);
      if (pageType?.error) return res.status(400).json({ error: pageType.error });
      if (sourceScope?.error) return res.status(400).json({ error: sourceScope.error });

      const createdFrom = normalizeCreatedFrom(req.body?.createdFrom);
      if (rejectAgentReservedWeekendReadingsCreation(req, res, createdFrom)) return;
      let initialSourceRefs = normalizeInitialSourceRefs({
        initialSourceRef: req.body?.initialSourceRef,
        initialSourceRefs: req.body?.initialSourceRefs,
        createdFrom
      });
      if (initialSourceRefs?.error) return res.status(400).json({ error: initialSourceRefs.error });
      const title = normalizeTitle(req.body?.title || createdFrom.label);
      const existing = findWriteTimeCanonicalPage(
        await WikiPage.find({
          userId: req.user.id,
          status: { $ne: 'archived' }
        }).sort({ updatedAt: -1 }).limit(500),
        title
      );
      if (existing) {
        return res.status(200).json({
          ...serializeWikiPage(existing),
          reusedExisting: true
        });
      }
      const ordinaryEvidencePreflight = req.body?.evidencePreflight === true
        && !livingThesisPreset
        && createdFrom.type === 'idea'
        && initialSourceRefs.value.length === 0;
      if (ordinaryEvidencePreflight) {
        const exactTitlePages = await WikiPage.find({
          userId: req.user.id,
          status: { $ne: 'archived' },
          title: new RegExp(`^${escapeRegExp(title)}$`, 'i')
        }).sort({ updatedAt: -1 }).limit(20);
        const rankedExactPages = (Array.isArray(exactTitlePages) ? exactTitlePages : [])
          .map(page => ({ page, serialized: serializeWikiPage(page) }))
          .sort((left, right) => (
            Number(right.serialized.bodyWordCount > 0) - Number(left.serialized.bodyWordCount > 0)
            || Number(right.serialized.aiState?.candidateStatus !== 'rejected')
              - Number(left.serialized.aiState?.candidateStatus !== 'rejected')
            || Number(right.serialized.qualityReview?.surfaceEligible !== false)
              - Number(left.serialized.qualityReview?.surfaceEligible !== false)
            || right.serialized.bodyWordCount - left.serialized.bodyWordCount
            || right.serialized.sourceCount - left.serialized.sourceCount
            || new Date(right.page.updatedAt || 0) - new Date(left.page.updatedAt || 0)
          ));
        if (rankedExactPages[0]) {
          return res.status(200).json({
            ...rankedExactPages[0].serialized,
            reusedExisting: true
          });
        }
        const preflight = await prepareOrdinaryWikiBuild({
          userId: req.user.id,
          title,
          createdFrom,
          models: { Article, NotebookEntry, TagMeta, Question }
        });
        if (!preflight?.eligible) {
          return res.status(422).json({
            error: preflight?.message || `No direct Library source explains “${title}.”`,
            code: preflight?.code || 'WIKI_BUILD_EVIDENCE_MISSING',
            topic: preflight?.topic || title,
            suggestions: Array.isArray(preflight?.suggestions) ? preflight.suggestions : []
          });
        }
        initialSourceRefs = normalizeInitialSourceRefs({
          initialSourceRefs: preflight.sourceRefs,
          createdFrom
        });
        if (initialSourceRefs?.error) return res.status(400).json({ error: initialSourceRefs.error });
      }
      const governingQuestion = String(req.body?.governingQuestion || '').replace(/\s+/g, ' ').trim();
      if (livingThesisPreset && !governingQuestion) {
        return res.status(400).json({ error: 'A governing question is required for a living thesis.' });
      }
      if (!livingThesisPreset && req.body?.judgment !== undefined) {
        return res.status(400).json({ error: 'An initial judgment requires the living_thesis preset.' });
      }
      const body = livingThesisPreset
        ? buildLivingThesisBody()
        : (normalizeBodyDoc(req.body?.body) || emptyDoc());
      const actorType = req.agentToken ? 'agent' : 'user';
      const judgment = livingThesisPreset ? normalizeJudgment({
        input: {
          ...(req.body?.judgment || {}),
          kind: 'thesis',
          governingQuestion,
          status: req.body?.judgment?.status || 'framing',
          decisionPosture: req.body?.judgment?.decisionPosture || 'investigate',
          startedAt: req.body?.judgment?.startedAt || new Date(),
          causalModel: req.body?.judgment?.causalModel || { summary: '', nodes: [], edges: [] },
          assumptions: req.body?.judgment?.assumptions || [],
          unknowns: req.body?.judgment?.unknowns || [],
          falsifiers: req.body?.judgment?.falsifiers || [],
          decisions: req.body?.judgment?.decisions || []
        },
        actorType
      }) : null;
      const page = new WikiPage({
        userId: req.user.id,
        title,
        slug: await buildUniqueSlug(req.user.id, title),
        pageType: livingThesisPreset ? 'overview' : (pageType?.value || 'topic'),
        status: 'draft',
        visibility: 'private',
        sourceScope: ordinaryEvidencePreflight ? 'selected_sources' : (sourceScope?.value || 'entire_library'),
        createdFrom,
        body,
        plainText: docText(body),
        sourceRefs: initialSourceRefs.value,
        ...(ordinaryEvidencePreflight ? {
          aiState: {
            build: {
              creationPreflight: true,
              directSourceCount: initialSourceRefs.value.length
            }
          }
        } : {}),
        judgment
      });
      refreshPageClaims(page);
      await page.save();
      await syncPageGraph(page, req.user.id);
      await createWikiRevision({
        WikiRevision,
        userId: req.user.id,
        page,
        reason: 'created',
        actorType,
        summary: `Created "${page.title}".`
      });
      trackWikiEvent(req, EVENT_NAMES.WIKI_PAGE_CREATED, {
        pageId: serializeId(page._id),
        title: page.title,
        pageType: page.pageType,
        sourceCount: Array.isArray(page.sourceRefs) ? page.sourceRefs.length : 0,
        sourceScope: page.sourceScope
      });
      if (Array.isArray(page.sourceRefs) && page.sourceRefs.length > 0) {
        trackWikiEvent(req, EVENT_NAMES.WIKI_SOURCE_ATTACHED, {
          pageId: serializeId(page._id),
          title: page.title,
          pageType: page.pageType,
          sourceCount: page.sourceRefs.length,
          sourceType: page.sourceRefs[0]?.type || ''
        });
      }
      res.status(201).json(serializeWikiPage(page));
    } catch (error) {
      console.error('Error creating wiki page:', error);
      res.status(500).json({ error: 'Failed to create wiki page.' });
    }
  });
};
