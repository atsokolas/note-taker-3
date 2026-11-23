// Wiki pages in public: shared pages, proof, repo comparisons, adopting, following and forking, starter packs and collections.
const { isResearchEditionPage, HUMAN_ONLY_WIKI_LABEL_PATTERN, isHumanOnlyWikiArtifact, RESEARCH_LEDGER_LABEL_PATTERN } = require('../../services/wikiProtectedArtifactService');
const { loadPublishedWeekendReadingsArtifact } = require('../../services/weekendReadingsWorkflowService');
const {
  serializePublicWikiPage,
  buildAdoptableWikiPageSnapshot,
  serializeId,
  serializeWikiPage,
  sanitizeSharedWikiSourceRefsForAdoption,
  serializePublicWikiCollection
} = require('../../services/wikiPageShape');
const { captureRepoBaseline, buildRepoComparison, serializePublicRepoComparison } = require('../../services/wikiRepoComparisonService');
const {
  selectPublicProofPages,
  DEFAULT_PUBLIC_PROOF_SLOTS,
  slotMatchesPage,
  serializePublicProofEntry,
  buildPublicProofRegistryState
} = require('../../services/publicProofService');
const mongoose = require('mongoose');
const { folioHash, originSnapshot, followCasebook, unfollowCasebook } = require('../../services/casebookLineageService');
const { signCasebook, verifyCasebook } = require('../../services/judgmentPublicProjection');
const { normalizePageType } = require('../../services/wikiPageStructureService');
const { createWikiRevision } = require('../../services/wikiRevisionService');
const { STARTER_PACKS, starterPackSummary, findStarterPack, serializeStarterPackAsPublicCollection } = require('../../services/wikiStarterPacks');
const { requireHumanReader } = require('../../services/agentTokenService');

module.exports = (router, {
  CasebookLineage,
  EVENT_NAMES,
  NoeisReceipt,
  WikiMaintenanceRun,
  WikiPage,
  WikiRepoBaseline,
  WikiRevision,
  WikiSharedCollection,
  adoptStarterPackForUser,
  buildUniqueCollectionSlug,
  buildUniqueSlug,
  createAdoptedWikiPages,
  findOwnedPage,
  loadPublicCasebook,
  loadSharedWikiPage,
  publicComparisonCache,
  publicPageCache,
  sendLineageError,
  trackWikiEvent,
  wikiAuth
}) => {
  router.get('/api/public/wiki/pages/:idOrSlug', async (req, res) => {
    try {
      const idOrSlug = String(req.params.idOrSlug || '').trim();
      if (!idOrSlug) return res.status(400).json({ error: 'Wiki page id or slug is required.' });
      res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
      const cachedPayload = publicPageCache.get(idOrSlug);
      if (cachedPayload) {
        res.setHeader('X-Noeis-Public-Page-Cache', 'HIT');
        return res.status(200).json(cachedPayload);
      }
      const page = await loadSharedWikiPage(idOrSlug);
      if (!page) return res.status(404).json({ error: 'Shared wiki page not found.' });
      const researchEditionPage = isResearchEditionPage(page);
      const publicPage = researchEditionPage
        ? await loadPublishedWeekendReadingsArtifact({ NoeisReceipt, page, ownerUserId: page.userId })
        : serializePublicWikiPage(page);
      if (!publicPage) return res.status(404).json({ error: 'Shared wiki page not found.' });
      const casebook = researchEditionPage ? null : await loadPublicCasebook(page);
      const payload = {
        page: publicPage,
        ...(casebook ? { casebook } : {}),
        sharedAt: page.updatedAt || page.createdAt || null
      };
      publicPageCache.set(idOrSlug, payload);
      publicPageCache.set(page._id, payload);
      publicPageCache.set(page.slug, payload);
      res.setHeader('X-Noeis-Public-Page-Cache', 'MISS');
      res.status(200).json(payload);
    } catch (error) {
      console.error('Error fetching public wiki page:', error);
      res.status(500).json({ error: 'Failed to fetch shared wiki page.' });
    }
  });

  router.post('/api/wiki/pages/:id/repo-comparison/baseline', wikiAuth, async (req, res) => {
    try {
      if (!WikiRepoBaseline) return res.status(501).json({ error: 'Repository comparisons are not configured.' });
      const page = await findOwnedPage(req);
      if (!page) return res.status(404).json({ error: 'Wiki page not found.' });
      const result = await captureRepoBaseline({
        WikiRepoBaseline,
        WikiRevision,
        page,
        userId: req.user.id,
        publicEligible: req.body?.publicEligible === true
      });
      const runs = WikiMaintenanceRun
        ? await WikiMaintenanceRun.find({ userId: req.user.id, pageId: page._id }).sort({ createdAt: -1 }).limit(50).lean()
        : [];
      res.status(result.created ? 201 : 200).json({
        created: result.created,
        comparison: buildRepoComparison({ baseline: result.baseline, page, maintenanceRuns: runs })
      });
    } catch (error) {
      const status = error.code === 'REPO_BASELINE_NO_PUBLISHED_HEAD' || error.code === 'REPO_BASELINE_INVALID_PAGE' ? 422 : 500;
      res.status(status).json({ error: error.message || 'Failed to capture repository baseline.', code: error.code || '' });
    }
  });

  router.get('/api/wiki/pages/:id/repo-comparison', wikiAuth, async (req, res) => {
    try {
      if (!WikiRepoBaseline) return res.status(501).json({ error: 'Repository comparisons are not configured.' });
      const page = await findOwnedPage(req);
      if (!page) return res.status(404).json({ error: 'Wiki page not found.' });
      const baseline = await WikiRepoBaseline.findOne({ userId: req.user.id, pageId: page._id }).lean();
      if (!baseline) return res.status(404).json({ error: 'Repository baseline not found.' });
      const runs = WikiMaintenanceRun
        ? await WikiMaintenanceRun.find({ userId: req.user.id, pageId: page._id }).sort({ createdAt: -1 }).limit(50).lean()
        : [];
      res.status(200).json({ comparison: buildRepoComparison({ baseline, page, maintenanceRuns: runs }) });
    } catch (error) {
      res.status(500).json({ error: error.message || 'Failed to read repository comparison.' });
    }
  });

  const handlePublicProofRegistry = async (_req, res) => {
    // This endpoint answers in ~24s in production while an unrouted path
    // answers in 0.16s and a static one in 0.15s, and it returns 23KB across 7
    // items — so neither payload size nor scan volume explains it. Two attempts
    // to fix it by reasoning about the query changed the measured time not at
    // all. Record where the time actually goes instead of guessing a third
    // time; the numbers are cheap and the endpoint is uncached.
    const startedAt = Date.now();
    const marks = {};
    const mark = (name) => { marks[name] = Date.now() - startedAt; };
    try {
      let pagesQuery = WikiPage.find({
        visibility: 'shared',
        status: { $ne: 'archived' },
        'createdFrom.label': { $not: HUMAN_ONLY_WIKI_LABEL_PATTERN }
      });
      if (pagesQuery?.select) {
        // This pass only decides which pages fill the proof slots, and slot
        // matching never reads article text. Carrying plainText meant shipping
        // the full body of every shared page — up to 250 articles — merely to
        // choose a handful, which is what the logged-out landing page waited
        // on. The chosen pages are rehydrated in full immediately below.
        pagesQuery = pagesQuery.select('_id slug title pageType status visibility createdFrom sourceRefs.title sourceRefs.url claims.claimId externalWatches.githubRepo externalWatches.edgar externalWatches.transcripts freshness publicProof lastReviewedAt aiState.quality.checkedAt aiState.lastDraftedAt aiState.maintenanceSummary aiState.changeLog.type aiState.changeLog.text aiState.changeLog.title aiState.changeLog.createdAt createdAt updatedAt');
      }
      if (pagesQuery?.sort) pagesQuery = pagesQuery.sort({ updatedAt: -1 });
      if (pagesQuery?.limit) pagesQuery = pagesQuery.limit(250);
      const pages = pagesQuery?.lean ? await pagesQuery.lean() : await pagesQuery;
      mark('registryQuery');
      // Drop human-only artifacts before choosing rather than after. Both
      // selection passes must see the same candidate list, or the final pass
      // can land on a page the detail fetch never rehydrated and serialize it
      // without its body.
      const registryCandidates = (Array.isArray(pages) ? pages : [])
        .filter(page => !isHumanOnlyWikiArtifact(page));
      const preliminarySelection = selectPublicProofPages({
        pages: registryCandidates,
        slots: DEFAULT_PUBLIC_PROOF_SLOTS
      });
      // The registry scan stays deliberately small, but exact-head acceptance
      // hashes the complete editorial object. Rehydrate only the selected pages
      // plus plausible SEC dossier duplicates before grading them. Computing a
      // full-page hash from the compact projection above creates a guaranteed
      // false mismatch for otherwise accepted proof objects.
      const detailIds = new Set(preliminarySelection.map(({ page }) => String(page?._id || page?.id || '')));
      DEFAULT_PUBLIC_PROOF_SLOTS
        .filter(slot => slot.requiredClock === 'sec_edgar')
        .forEach((slot) => {
          const identifier = String(process.env?.[slot.envKey] || '').trim();
          registryCandidates.forEach((page) => {
            if (slotMatchesPage({ slot, page, identifier })) {
              detailIds.add(String(page?._id || page?.id || ''));
            }
          });
        });

      let proofPages = registryCandidates;
      const selectedIds = [...detailIds].filter(Boolean);
      if (selectedIds.length > 0) {
        let detailQuery = WikiPage.find({ _id: { $in: selectedIds } });
        if (detailQuery?.select) {
          // Measured: this query took 22.2s of a 24.4s request while fetching
          // eight documents by _id. It was not the volume, it was the width —
          // full bodies, every source snippet (up to 6000 characters each, up
          // to 80 per page), whole claim and citation ledgers, and the entire
          // change log, for pages the registry renders as a 420-character
          // excerpt and eight source titles.
          //
          // The registry is compact, and its consumers are narrow:
          // compactRegistryPage reads title, plainText, and sourceRefs
          // title/url; buildPublicMaintenanceProof reads claim and source
          // counts plus publicProof; buildPublicProofGrade reads freshness and
          // publicProof. Ask for that and nothing else.
          detailQuery = detailQuery.select('_id slug title pageType status visibility createdFrom plainText sourceRefs._id sourceRefs.type sourceRefs.title sourceRefs.url citations.sourceRefId citations.claimId claims.claimId externalWatches.githubRepo externalWatches.edgar externalWatches.transcripts freshness publicProof lastReviewedAt aiState.quality.ok aiState.quality.status aiState.quality.checkedAt aiState.lastDraftedAt aiState.maintenanceSummary createdAt updatedAt');
        }
        const detailedPages = detailQuery?.lean ? await detailQuery.lean() : await detailQuery;
        mark('detailQuery');
        const detailsById = new Map((Array.isArray(detailedPages) ? detailedPages : [])
          .map(page => [String(page?._id || page?.id || ''), page]));
        proofPages = registryCandidates.map(page => (
          detailsById.get(String(page?._id || page?.id || '')) || page
        ));
      }

      const selected = selectPublicProofPages({
        // Already filtered above, so this pass sees exactly the candidates the
        // preliminary pass did and lands on the same rehydrated pages.
        pages: Array.isArray(proofPages) ? proofPages : [],
        slots: DEFAULT_PUBLIC_PROOF_SLOTS
      });
      mark('selection');
      const entries = selected
        .map(({ slot, page }) => serializePublicProofEntry({
          slot,
          page,
          serializePage: serializePublicWikiPage,
          compact: true
        }))
        .filter(Boolean);
      const registryState = buildPublicProofRegistryState({
        entries,
        expectedCount: DEFAULT_PUBLIC_PROOF_SLOTS.length
      });
      mark('serialize');
      // Cumulative milliseconds from request start, so the gap between marks
      // names the slow stage directly. scanned/detailed say whether the cost
      // tracks document count at all.
      console.log('[PROOF-TIMING]', JSON.stringify({
        totalMs: Date.now() - startedAt,
        ...marks,
        scanned: registryCandidates.length,
        detailed: selectedIds.length,
        entries: entries.length
      }));
      res.status(200).json({
        items: entries,
        privacyStatement: entries[0]?.maintenanceProof?.privacyStatement || '',
        // Campaign readiness is not blocked by obsolete illustrative slots.
        // Preserve exact slot coverage as a separate diagnostic.
        ...registryState
      });
    } catch (error) {
      console.error('Error fetching public proof registry:', error, JSON.stringify({
        totalMs: Date.now() - startedAt,
        ...marks
      }));
      res.status(500).json({ error: 'Failed to fetch public proof registry.' });
    }
  };

  router.get('/api/public/wiki/proof', handlePublicProofRegistry);

  router.get('/api/public/wiki/pages/:idOrSlug/comparison', async (req, res) => {
    try {
      if (!WikiRepoBaseline) return res.status(404).json({ error: 'Public repository comparison not found.' });
      const idOrSlug = String(req.params.idOrSlug || '').trim();
      res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
      const cachedPayload = publicComparisonCache.get(idOrSlug);
      if (cachedPayload) {
        res.setHeader('X-Noeis-Comparison-Cache', 'HIT');
        return res.status(200).json(cachedPayload);
      }
      const query = {
        visibility: 'shared',
        status: { $ne: 'archived' },
        'createdFrom.label': { $not: RESEARCH_LEDGER_LABEL_PATTERN }
      };
      if (mongoose.Types.ObjectId.isValid(idOrSlug)) query._id = idOrSlug;
      else query.slug = idOrSlug;
      let pageQuery = WikiPage.findOne(query);
      if (pageQuery?.select) {
        pageQuery = pageQuery.select('_id userId title slug pageType status visibility externalWatches.githubRepo sourceRefs._id sourceRefs.title sourceRefs.url sourceRefs.provider sourceRefs.metadata claims');
      }
      const pagePromise = pageQuery?.lean ? pageQuery.lean() : pageQuery;
      let baselinePromise = null;
      let runsPromise = null;
      if (mongoose.Types.ObjectId.isValid(idOrSlug)) {
        let baselineQuery = WikiRepoBaseline.findOne({ pageId: idOrSlug, publicEligible: true });
        if (baselineQuery?.select) {
          baselineQuery = baselineQuery.select('_id userId pageId owner repo defaultBranch headSha releaseTag generatorVersion claims sourceRefs capturedAt createdAt publicEligible');
        }
        baselinePromise = baselineQuery?.lean ? baselineQuery.lean() : baselineQuery;
        if (WikiMaintenanceRun) {
          let runsQuery = WikiMaintenanceRun.find({ pageId: idOrSlug });
          if (runsQuery?.select) runsQuery = runsQuery.select('_id userId pageId createdAt updatedAt completedAt metadata.comparisons.pageId metadata.comparisons.sourceEventId metadata.comparisons.candidateHeadSha metadata.comparisons.outcome metadata.comparisons.counts');
          if (runsQuery?.sort) runsQuery = runsQuery.sort({ createdAt: -1 });
          if (runsQuery?.limit) runsQuery = runsQuery.limit(50);
          runsPromise = runsQuery?.lean ? runsQuery.lean() : runsQuery;
        }
      }
      const page = await pagePromise;
      if (!page) return res.status(404).json({ error: 'Public repository comparison not found.' });
      if (!baselinePromise) {
        let baselineQuery = WikiRepoBaseline.findOne({ pageId: page._id, publicEligible: true });
        if (baselineQuery?.select) {
          baselineQuery = baselineQuery.select('_id userId pageId owner repo defaultBranch headSha releaseTag generatorVersion claims sourceRefs capturedAt createdAt publicEligible');
        }
        baselinePromise = baselineQuery?.lean ? baselineQuery.lean() : baselineQuery;
      }
      if (!runsPromise && WikiMaintenanceRun) {
        let runsQuery = WikiMaintenanceRun.find({ userId: page.userId, pageId: page._id });
        if (runsQuery?.select) runsQuery = runsQuery.select('_id createdAt updatedAt completedAt metadata.comparisons.pageId metadata.comparisons.sourceEventId metadata.comparisons.candidateHeadSha metadata.comparisons.outcome metadata.comparisons.counts');
        if (runsQuery?.sort) runsQuery = runsQuery.sort({ createdAt: -1 });
        if (runsQuery?.limit) runsQuery = runsQuery.limit(50);
        runsPromise = runsQuery?.lean ? runsQuery.lean() : runsQuery;
      }
      const [baseline, runsResult] = await Promise.all([baselinePromise, runsPromise || Promise.resolve([])]);
      if (!baseline) return res.status(404).json({ error: 'Public repository comparison not found.' });
      if (String(baseline.userId || '') !== String(page.userId || '')) {
        return res.status(404).json({ error: 'Public repository comparison not found.' });
      }
      const runs = (Array.isArray(runsResult) ? runsResult : [])
        .filter(run => String(run.userId || page.userId) === String(page.userId));
      const comparison = buildRepoComparison({ baseline, page, maintenanceRuns: runs });
      if (!comparison) return res.status(404).json({ error: 'Public repository comparison not found.' });
      const payload = { comparison: serializePublicRepoComparison(comparison) };
      publicComparisonCache.set(idOrSlug, payload);
      res.setHeader('X-Noeis-Comparison-Cache', 'MISS');
      res.status(200).json(payload);
    } catch (error) {
      res.status(500).json({ error: 'Failed to read public repository comparison.' });
    }
  });

  router.post('/api/public/wiki/pages/:idOrSlug/adopt', wikiAuth, async (req, res) => {
    try {
      const idOrSlug = String(req.params.idOrSlug || '').trim();
      if (!idOrSlug) return res.status(400).json({ error: 'Wiki page id or slug is required.' });
      const query = {
        visibility: 'shared',
        status: { $ne: 'archived' },
        'createdFrom.label': { $not: RESEARCH_LEDGER_LABEL_PATTERN }
      };
      if (mongoose.Types.ObjectId.isValid(idOrSlug)) {
        query._id = idOrSlug;
      } else {
        query.slug = idOrSlug;
      }
      const originPage = await WikiPage.findOne(query).lean();
      if (!originPage) return res.status(404).json({ error: 'Shared wiki page not found.' });
      if (isHumanOnlyWikiArtifact(originPage)) {
        return res.status(409).json({
          error: 'Protected research artifacts cannot be adopted into a private mutable copy.'
        });
      }

      const adoptable = buildAdoptableWikiPageSnapshot(originPage);
      if (!adoptable?.page) return res.status(422).json({ error: 'Shared wiki page could not be adopted.' });
      if (adoptable.origin) {
        adoptable.origin.originHash = folioHash(originPage);
        adoptable.origin.kind = 'adopt';
      }
      const result = await createAdoptedWikiPages({
        userId: req.user.id,
        snapshots: [adoptable],
        originType: 'page'
      });
      const adopted = result.pages[0] || {};
      const page = adopted.page;
      if (CasebookLineage && page && String(originPage?.judgment?.currentJudgment || '').trim()) {
        await CasebookLineage.create({
          userId: req.user.id,
          action: 'adopt',
          ...originSnapshot(originPage, folioHash(originPage)),
          childPageId: page._id
        });
      }
      trackWikiEvent(req, EVENT_NAMES.WIKI_SHARED_ADOPTED, {
        originType: 'page',
        originPageId: serializeId(originPage._id),
        originSlug: originPage.slug || '',
        originTitle: originPage.title || '',
        adoptedPageId: serializeId(page?._id),
        pageCount: 1,
        mergeAvailable: Boolean(adopted.mergeAvailable)
      });
      res.status(201).json({
        page: serializeWikiPage(page),
        adoptedFrom: page.adoptedFrom || {},
        mergeAvailable: Boolean(adopted.mergeAvailable),
        library: result.library || null
      });
    } catch (error) {
      console.error('Error adopting shared wiki page:', error);
      res.status(500).json({ error: 'Failed to adopt shared wiki page.' });
    }
  });

  router.get('/api/wiki/pages/:id/public-preview', wikiAuth, async (req, res) => {
    try {
      const page = await findOwnedPage(req);
      if (!page) return res.status(404).json({ error: 'Wiki page not found.' });
      const raw = typeof page.toObject === 'function' ? page.toObject({ virtuals: false }) : page;
      const casebook = await loadPublicCasebook(raw);
      return res.status(200).json({
        page: serializePublicWikiPage(raw),
        casebook,
        preview: true
      });
    } catch (error) {
      console.error('Error building public casebook preview:', error);
      return res.status(500).json({ error: 'Failed to preview the public folio.' });
    }
  });

  router.get('/api/public/wiki/pages/:idOrSlug/export', async (req, res) => {
    try {
      const idOrSlug = String(req.params.idOrSlug || '').trim();
      if (!idOrSlug) return res.status(400).json({ error: 'Wiki page id or slug is required.' });
      const page = await loadSharedWikiPage(idOrSlug);
      if (!page) return res.status(404).json({ error: 'Shared wiki page not found.' });
      const casebook = await loadPublicCasebook(page);
      if (!casebook) return res.status(404).json({ error: 'This page has no public casebook.' });
      const sealed = signCasebook(casebook);
      return res.status(200).json({ casebook: sealed });
    } catch (error) {
      if (error.code === 'export_secret_missing') {
        return res.status(503).json({ error: error.message, code: error.code });
      }
      console.error('Error exporting public casebook:', error);
      return res.status(500).json({ error: 'Failed to export the public folio.' });
    }
  });

  router.post('/api/public/casebook/verify', async (req, res) => {
    try {
      const result = verifyCasebook(req.body?.casebook || req.body);
      return res.status(result.ok ? 200 : 409).json(result);
    } catch (error) {
      console.error('Error verifying casebook seal:', error);
      return res.status(500).json({ error: 'Failed to verify the folio.' });
    }
  });

  router.post('/api/public/wiki/pages/:idOrSlug/follow', wikiAuth, async (req, res) => {
    try {
      const originPage = await loadSharedWikiPage(String(req.params.idOrSlug || '').trim());
      if (!originPage) return res.status(404).json({ error: 'Shared wiki page not found.' });
      const result = await followCasebook({ CasebookLineage, userId: req.user.id, originPage });
      return res.status(result.idempotent ? 200 : 201).json({
        action: 'follow',
        origin: {
          title: result.lineage.originTitle,
          slug: result.lineage.originSlug,
          hash: result.lineage.originHash
        }
      });
    } catch (error) {
      return sendLineageError(res, error);
    }
  });

  router.delete('/api/public/wiki/pages/:idOrSlug/follow', wikiAuth, async (req, res) => {
    try {
      const idOrSlug = String(req.params.idOrSlug || '').trim();
      const originPage = await loadSharedWikiPage(idOrSlug);
      let originPageId = originPage?._id || null;
      if (!originPageId && CasebookLineage?.findOne) {
        const existing = await CasebookLineage.findOne({
          userId: req.user.id,
          action: 'follow',
          revokedAt: null,
          $or: mongoose.Types.ObjectId.isValid(idOrSlug)
            ? [{ originPageId: idOrSlug }, { originSlug: idOrSlug }]
            : [{ originSlug: idOrSlug }]
        });
        originPageId = existing?.originPageId || null;
      }
      if (!originPageId) return res.status(404).json({ error: 'Shared wiki page not found.' });
      const result = await unfollowCasebook({
        CasebookLineage,
        userId: req.user.id,
        originPageId
      });
      return res.status(200).json({
        action: 'unfollow',
        origin: {
          title: result.lineage.originTitle,
          slug: result.lineage.originSlug,
          hash: result.lineage.originHash
        }
      });
    } catch (error) {
      return sendLineageError(res, error);
    }
  });

  router.post('/api/public/wiki/pages/:idOrSlug/fork', wikiAuth, async (req, res) => {
    try {
      const originPage = await loadSharedWikiPage(String(req.params.idOrSlug || '').trim());
      if (!originPage) return res.status(404).json({ error: 'Shared wiki page not found.' });
      const claim = String(originPage?.judgment?.currentJudgment || '').trim();
      if (!claim) return res.status(422).json({ error: 'There is no public claim to fork.' });
      const hash = folioHash(originPage);
      const publicPage = serializePublicWikiPage(originPage);
      const title = publicPage?.title || originPage.title || claim;
      const page = new WikiPage({
        userId: req.user.id,
        title,
        slug: await buildUniqueSlug(req.user.id, title),
        pageType: normalizePageType(originPage.pageType || 'topic'),
        status: 'draft',
        visibility: 'private',
        sourceScope: 'selected_sources',
        createdFrom: {
          type: 'wiki_index',
          text: claim,
          label: title
        },
        adoptedFrom: {
          originType: 'page',
          kind: 'fork',
          originPageId: mongoose.Types.ObjectId.isValid(originPage._id) ? originPage._id : null,
          originSlug: originPage.slug || '',
          originTitle: title,
          originHash: hash,
          adoptedAt: new Date()
        },
        judgment: {
          currentJudgment: claim,
          status: 'framing',
          bornAt: new Date()
        },
        sourceRefs: sanitizeSharedWikiSourceRefsForAdoption(publicPage?.sourceRefs || [])
      });
      await page.save();
      if (CasebookLineage) {
        await CasebookLineage.create({
          userId: req.user.id,
          action: 'fork',
          ...originSnapshot(originPage, hash),
          childPageId: page._id
        });
      }
      if (WikiRevision) {
        await createWikiRevision({
          WikiRevision,
          userId: req.user.id,
          page,
          reason: 'created',
          actorType: 'user',
          summary: `Forked from ${title}.`
        });
      }
      return res.status(201).json({
        action: 'fork',
        page: serializeWikiPage(page),
        origin: {
          title,
          slug: originPage.slug || '',
          hash
        }
      });
    } catch (error) {
      return sendLineageError(res, error);
    }
  });

  router.get('/api/public/wiki/starter-packs', async (_req, res) => {
    res.status(200).json({
      packs: STARTER_PACKS.map(starterPackSummary)
    });
  });

  router.get('/api/public/wiki/starter-packs/:packId', async (req, res) => {
    const pack = STARTER_PACKS.find(candidate => candidate.id === String(req.params.packId || '').trim());
    if (!pack) return res.status(404).json({ error: 'Starter pack not found.' });
    res.status(200).json({
      pack: {
        ...starterPackSummary(pack),
        pages: pack.pages.map(serializePublicWikiPage)
      }
    });
  });

  router.post('/api/public/wiki/starter-packs/:packId/adopt', wikiAuth, async (req, res) => {
    try {
      const pack = findStarterPack(req.params.packId);
      if (!pack) return res.status(404).json({ error: 'Starter pack not found.' });
      const result = await adoptStarterPackForUser({ pack, userId: req.user.id });
      trackWikiEvent(req, EVENT_NAMES.WIKI_SHARED_ADOPTED, {
        originType: 'starter_pack',
        packId: pack.id,
        originSlug: pack.id,
        originTitle: pack.name,
        pageCount: result.pages.length,
        mergeAvailable: result.pages.some(entry => entry.mergeAvailable)
      });
      res.status(201).json({
        pack: starterPackSummary(pack),
        pages: result.pages.map(entry => serializeWikiPage(entry.page)),
        mergeAvailable: result.pages.some(entry => entry.mergeAvailable),
        library: result.library || null
      });
    } catch (error) {
      console.error('Error adopting starter pack:', error);
      res.status(500).json({ error: 'Failed to adopt starter pack.' });
    }
  });

  router.post('/api/wiki/collections', wikiAuth, requireHumanReader, async (req, res) => {
    try {
      if (!WikiSharedCollection) return res.status(501).json({ error: 'Wiki collections are not configured.' });
      const name = String(req.body?.name || '').trim();
      if (!name) return res.status(400).json({ error: 'Collection name is required.' });
      const pageIds = Array.isArray(req.body?.pageIds)
        ? req.body.pageIds.map(id => String(id || '').trim()).filter(Boolean)
        : [];
      if (!pageIds.length) return res.status(400).json({ error: 'At least one page is required.' });
      const pages = await WikiPage.find({
        _id: { $in: pageIds },
        userId: req.user.id,
        status: { $ne: 'archived' }
      }).select('_id').lean();
      const allowedIds = new Set((Array.isArray(pages) ? pages : []).map(page => String(page._id)));
      const sanitizedPageIds = pageIds.filter(id => allowedIds.has(String(id)));
      if (!sanitizedPageIds.length) return res.status(404).json({ error: 'No owned wiki pages found for this collection.' });
      const visibility = req.body?.visibility === 'private' ? 'private' : 'shared';
      const slug = await buildUniqueCollectionSlug(req.body?.slug || name);
      const collection = new WikiSharedCollection({
        userId: req.user.id,
        name,
        description: String(req.body?.description || '').trim(),
        slug,
        pageIds: sanitizedPageIds,
        visibility,
        sourceType: 'user'
      });
      await collection.save();
      res.status(201).json({ collection: serializePublicWikiCollection({ collection, pages: [] }) });
    } catch (error) {
      console.error('Error creating wiki collection:', error);
      if (error.code === 11000) return res.status(409).json({ error: 'Collection slug already exists.' });
      res.status(500).json({ error: 'Failed to create wiki collection.' });
    }
  });

  router.get('/api/public/wiki/collections/:idOrSlug', async (req, res) => {
    try {
      const idOrSlug = String(req.params.idOrSlug || '').trim();
      const starterPack = findStarterPack(idOrSlug);
      if (starterPack) {
        return res.status(200).json({
          collection: serializeStarterPackAsPublicCollection(starterPack)
        });
      }
      if (!WikiSharedCollection) return res.status(404).json({ error: 'Shared wiki collection not found.' });
      const query = { visibility: 'shared' };
      if (mongoose.Types.ObjectId.isValid(idOrSlug)) query._id = idOrSlug;
      else query.slug = idOrSlug;
      const collection = await WikiSharedCollection.findOne(query).lean();
      if (!collection) return res.status(404).json({ error: 'Shared wiki collection not found.' });
      const pages = await WikiPage.find({
        _id: { $in: collection.pageIds || [] },
        visibility: 'shared',
        status: { $ne: 'archived' },
        'createdFrom.label': { $not: RESEARCH_LEDGER_LABEL_PATTERN }
      }).sort({ updatedAt: -1 }).lean();
      res.status(200).json({
        collection: serializePublicWikiCollection({ collection, pages })
      });
    } catch (error) {
      console.error('Error reading public wiki collection:', error);
      res.status(500).json({ error: 'Failed to read shared wiki collection.' });
    }
  });

  router.post('/api/public/wiki/collections/:idOrSlug/adopt', wikiAuth, async (req, res) => {
    try {
      const idOrSlug = String(req.params.idOrSlug || '').trim();
      const starterPack = findStarterPack(idOrSlug);
      if (starterPack) {
        const result = await adoptStarterPackForUser({ pack: starterPack, userId: req.user.id });
        trackWikiEvent(req, EVENT_NAMES.WIKI_SHARED_ADOPTED, {
          originType: 'starter_pack',
          packId: starterPack.id,
          originSlug: starterPack.id,
          originTitle: starterPack.name,
          surface: 'collection_route',
          pageCount: result.pages.length,
          mergeAvailable: result.pages.some(entry => entry.mergeAvailable)
        });
        return res.status(201).json({
          collection: {
            _id: starterPack.id,
            name: starterPack.name,
            slug: starterPack.id,
            sourceType: 'starter_pack',
            packId: starterPack.id,
            pageCount: result.pages.length
          },
          pages: result.pages.map(entry => serializeWikiPage(entry.page)),
          mergeAvailable: result.pages.some(entry => entry.mergeAvailable),
          library: result.library || null
        });
      }
      if (!WikiSharedCollection) return res.status(404).json({ error: 'Shared wiki collection not found.' });
      const query = { visibility: 'shared' };
      if (mongoose.Types.ObjectId.isValid(idOrSlug)) query._id = idOrSlug;
      else query.slug = idOrSlug;
      const collection = await WikiSharedCollection.findOne(query).lean();
      if (!collection) return res.status(404).json({ error: 'Shared wiki collection not found.' });
      const pages = await WikiPage.find({
        _id: { $in: collection.pageIds || [] },
        visibility: 'shared',
        status: { $ne: 'archived' },
        'createdFrom.label': { $not: RESEARCH_LEDGER_LABEL_PATTERN }
      }).sort({ updatedAt: -1 }).lean();
      const snapshots = (Array.isArray(pages) ? pages : [])
        .filter(page => !isHumanOnlyWikiArtifact(page))
        .map(buildAdoptableWikiPageSnapshot)
        .filter(Boolean);
      if (!snapshots.length) return res.status(422).json({ error: 'Shared wiki collection has no adoptable pages.' });
      const result = await createAdoptedWikiPages({
        userId: req.user.id,
        snapshots,
        originType: 'collection',
        originCollectionId: serializeId(collection._id) || collection.slug || '',
        originCollectionTitle: collection.name || 'Shared wiki'
      });
      trackWikiEvent(req, EVENT_NAMES.WIKI_SHARED_ADOPTED, {
        originType: 'collection',
        originCollectionId: serializeId(collection._id),
        originSlug: collection.slug || '',
        originTitle: collection.name || '',
        pageCount: result.pages.length,
        mergeAvailable: result.pages.some(entry => entry.mergeAvailable)
      });
      res.status(201).json({
        collection: {
          _id: serializeId(collection._id),
          name: collection.name,
          slug: collection.slug,
          pageCount: result.pages.length
        },
        pages: result.pages.map(entry => serializeWikiPage(entry.page)),
        mergeAvailable: result.pages.some(entry => entry.mergeAvailable),
        library: result.library || null
      });
    } catch (error) {
      console.error('Error adopting shared wiki collection:', error);
      res.status(500).json({ error: 'Failed to adopt shared wiki collection.' });
    }
  });
};
