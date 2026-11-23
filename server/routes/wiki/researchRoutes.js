// Company dossiers and research: building one, tracking it in a judgment, research candidates and reviews, valuation.
const {
  normalizeCompanyDossierInput,
  activeCompanyDossierKey,
  companyDossierInputsMatch,
  buildCompanyDossierBody,
  buildInvestmentDossierProfile,
  buildCompanyDossierJudgmentInput
} = require('../../services/companyDossierService');
const { withTransientRetries, dossierBuildAllowance } = require('../../services/wikiDossierBuildReliabilityService');
const { serializeWikiPage, serializeId, normalizeTitle } = require('../../services/wikiPageShape');
const { docText } = require('../../lib/editorialText');
const { createWikiRevision, snapshotPage, matchesTrustedRevisionHead, snapshotContentHash } = require('../../services/wikiRevisionService');
const { persistNoeisReceipt } = require('../../services/noeisReceiptService');
const { normalizeJudgment } = require('../../services/wikiJudgmentService');
const { groundingSourceRefsForPage } = require('../../services/wikiMaintenanceService');
const { compareClaimLedgers } = require('../../services/wikiClaimComparisonService');
const { buildInvestmentMaintenanceComparison } = require('../../services/investmentDossierComparisonService');
const { inkWikiPageReview } = require('../../services/wikiReviewClock');
const { buildDossierJudgmentReviewReceipt, listDossierJudgmentReviews, loadDossierJudgmentReview, resolveDossierJudgmentReview } = require('../../services/dossierJudgmentReviewService');
const mongoose = require('mongoose');
const { buildValuationSnapshot } = require('../../services/investmentValuationService');

module.exports = (router, {
  EVENT_NAMES,
  JudgmentResponseDraft,
  NoeisReceipt,
  WikiMaintenanceRun,
  WikiPage,
  WikiRevision,
  WikiSourceEvent,
  acquireCompanyFactsForDossier,
  acquireCompetitorPrimaryForDossier,
  acquireIndependentDomainForDossier,
  acquireMarketSnapshotForDossier,
  acquireOfficialProductSourcesForDossier,
  acquireSecPrimaryPackForDossier,
  buildUniqueSlug,
  evaluateWikiArticleQuality,
  findOwnedPage,
  inspectCompanyDossierFiler,
  normalizeExternalHttpUrl,
  publicPageCache,
  refreshPageClaims,
  resolveEdgarCompanyIdentifier,
  restorePageSnapshot,
  syncPageGraph,
  trackWikiEvent,
  wikiAuth
}) => {
  router.post('/api/wiki/pages/from-company', wikiAuth, async (req, res) => {
    let createdCompanyDossierPage = null;
    try {
      if (req.agentToken) {
        return res.status(403).json({ error: 'Only the human owner can create an investment dossier.' });
      }
      let input;
      try {
        input = normalizeCompanyDossierInput(req.body || {});
      } catch (validationError) {
        return res.status(400).json({ error: validationError.message });
      }
      const company = await withTransientRetries({
        attempts: 3,
        delaysMs: [750, 2000],
        operation: () => resolveEdgarCompanyIdentifier({ ticker: input.ticker })
      });
      const filer = await withTransientRetries({
        attempts: 3,
        delaysMs: [750, 2000],
        operation: () => inspectCompanyDossierFiler({ company })
      });
      if (!filer.supported) {
        const form = filer.primaryForeignForm || 'no supported annual filing';
        const foreign = filer.reason === 'foreign_private_issuer';
        return res.status(422).json({
          code: foreign ? 'DOSSIER_FOREIGN_FILER_UNSUPPORTED' : 'DOSSIER_FILER_UNSUPPORTED',
          error: foreign
            ? `${company.ticker} files as a foreign private issuer (${form}). Noeis dossiers currently support US domestic filers (10-K/10-Q). Foreign-filer support is coming.`
            : `${company.ticker} does not have a supported US domestic filing history (10-K/10-Q), so Noeis cannot build this dossier yet.`,
          company,
          filer
        });
      }
      const dossierKey = activeCompanyDossierKey(company.cik);
      let existing = await WikiPage.findOne({
        userId: req.user.id,
        activeCompanyDossierKey: dossierKey,
        status: { $ne: 'archived' },
        archived: { $ne: true }
      });
      if (!existing) existing = await WikiPage.findOne({
        userId: req.user.id,
        status: { $ne: 'archived' },
        archived: { $ne: true },
        'externalWatches.edgar.cik': company.cik
      });
      if (existing) {
        if (!existing.activeCompanyDossierKey) {
          existing.activeCompanyDossierKey = dossierKey;
          await existing.save();
        }
        const existingProfile = existing.investmentDossier || {};
        if (!companyDossierInputsMatch(existingProfile, input)) {
          return res.status(409).json({
            code: 'DOSSIER_INPUT_CONFLICT',
            error: `${company.ticker} already has an active dossier with a different owner judgment or return hurdle. Open that dossier to revise the decision record explicitly.`,
            page: serializeWikiPage(existing),
            company
          });
        }
        return res.status(200).json({
          action: 'existing',
          page: serializeWikiPage(existing),
          company,
          receipt: {
            id: `company-dossier:${serializeId(existing._id)}`,
            kind: 'company_dossier_existing',
            source: 'wiki',
            sourceLabel: 'Company dossier',
            status: 'completed',
            title: `Opened existing ${company.ticker} investment dossier.`,
            summary: 'No duplicate page was created. The saved owner judgment and return hurdle were unchanged.',
            metrics: {
              ticker: company.ticker,
              cik: company.cik,
              requiredReturn: input.requiredReturn,
              horizonYears: input.horizonYears
            },
            touched: [{ type: 'wiki_page', id: serializeId(existing._id), title: existing.title }],
            nextAction: {
              type: 'review_wiki_page',
              id: serializeId(existing._id),
              title: 'Review the existing trusted page'
            }
          }
        });
      }

      const allowance = await dossierBuildAllowance({ WikiMaintenanceRun, userId: req.user.id });
      if (!allowance.allowed) {
        return res.status(409).json({ error: allowance.error, code: 'DOSSIER_WEEKLY_LIMIT', opensAt: allowance.opensAt });
      }
      const title = normalizeTitle(`${company.companyName || company.ticker} investment dossier`);
      const body = buildCompanyDossierBody({ ...input, ...company });
      const page = new WikiPage({
        userId: req.user.id,
        title,
        slug: await buildUniqueSlug(req.user.id, title),
        pageType: 'entity',
        status: 'draft',
        visibility: 'private',
        sourceScope: 'selected_sources',
        createdFrom: {
          type: 'wiki_index',
          objectIds: [],
          text: input.startingJudgment,
          label: `company-dossier:${company.ticker}`
        },
        body,
        plainText: docText(body),
        // A dossier is maintained research. It becomes an active case only
        // after the owner explicitly chooses Track in Judgment.
        judgment: null,
        investmentDossier: buildInvestmentDossierProfile({
          ...input,
          ...company,
          sic: filer.sic,
          sicDescription: filer.sicDescription
        }),
        activeCompanyDossierKey: dossierKey,
        externalWatches: {
          edgar: {
            ticker: company.ticker,
            cik: company.cik,
            companyName: company.companyName,
            forms: ['10-K', '10-Q', 'DEF 14A', '8-K'],
            status: 'active'
          }
        }
      });
      refreshPageClaims(page);
      try {
        await page.save();
        createdCompanyDossierPage = page;
      } catch (saveError) {
        if (Number(saveError?.code) !== 11000) throw saveError;
        const winner = await WikiPage.findOne({
          userId: req.user.id,
          activeCompanyDossierKey: dossierKey,
          status: { $ne: 'archived' },
          archived: { $ne: true }
        });
        if (!winner) throw saveError;
        return res.status(200).json({
          action: 'existing',
          page: serializeWikiPage(winner),
          company,
          receipt: {
            id: `company-dossier:${serializeId(winner._id)}`,
            kind: 'company_dossier_existing',
            source: 'wiki',
            sourceLabel: 'Company dossier',
            status: 'completed',
            title: `Opened existing ${company.ticker} investment dossier.`,
            summary: 'A simultaneous request already created this active dossier. No duplicate page was saved.',
            metrics: { ticker: company.ticker, cik: company.cik },
            touched: [{ type: 'wiki_page', id: serializeId(winner._id), title: winner.title }]
          }
        });
      }
      await syncPageGraph(page, req.user.id);
      const revision = await createWikiRevision({
        WikiRevision,
        userId: req.user.id,
        page,
        reason: 'created',
        actorType: 'user',
        summary: `Created ${company.ticker} investment dossier from the owner's starting judgment.`
      });

      const secPrimaryPackAcquisition = await acquireSecPrimaryPackForDossier({
        page,
        userId: req.user.id
      });
      const watchResult = {
        filings: secPrimaryPackAcquisition.filings,
        events: secPrimaryPackAcquisition.events
      };
      const watchError = secPrimaryPackAcquisition.stop?.message || '';
      const companyFactsAcquisition = await acquireCompanyFactsForDossier({ page });
      const officialProductAcquisition = await acquireOfficialProductSourcesForDossier({ page });
      const competitorPrimaryAcquisition = await acquireCompetitorPrimaryForDossier({
        page,
        userId: req.user.id
      });
      const independentDomainAcquisition = await acquireIndependentDomainForDossier({ page });
      const marketSnapshotAcquisition = await acquireMarketSnapshotForDossier({ page });
      if (
        !secPrimaryPackAcquisition.skipped
        || !companyFactsAcquisition.skipped
        || !officialProductAcquisition.skipped
        || !competitorPrimaryAcquisition.skipped
        || !independentDomainAcquisition.skipped
        || !marketSnapshotAcquisition.skipped
      ) await page.save();
      const filingSourceCount = (page.sourceRefs || []).filter(source => (
        source?.provider === 'sec-edgar'
        && source?.metadata?.evidenceArchetype === 'filing'
      )).length;
      const acquisitionStops = [
        companyFactsAcquisition.stop,
        officialProductAcquisition.stop,
        competitorPrimaryAcquisition.stop,
        independentDomainAcquisition.stop,
        marketSnapshotAcquisition.stop
      ].filter(Boolean);
      const receiptInput = {
        id: `company-dossier:${serializeId(page._id)}`,
        kind: 'company_dossier_created',
        source: 'wiki',
        sourceLabel: 'Company dossier',
        status: watchError || acquisitionStops.length ? 'partial' : 'completed',
        title: `Created ${company.ticker} investment dossier.`,
        summary: watchError
          ? 'The private dossier and starting view were saved. The SEC filing check needs retry.'
          : acquisitionStops.length
            ? `The private dossier and filing watch were saved. ${acquisitionStops.map(stop => stop.message).join(' ')}`
            : 'The private dossier, starting view, return hurdle, free SEC filing watch, Company Facts operating history, official product evidence, a named-competitor filing, a verified independent benchmark, and a dated public market price were saved.',
        metrics: {
          ticker: company.ticker,
          cik: company.cik,
          requiredReturn: input.requiredReturn,
          horizonYears: input.horizonYears,
          filingsFound: watchResult.filings?.length || 0,
          sourceEventsCreated: watchResult.events?.length || 0,
          filingsAttached: filingSourceCount,
          totalSourcesAttached: Array.isArray(page.sourceRefs) ? page.sourceRefs.length : 0,
          operatingBenchmarkAttached: Boolean(companyFactsAcquisition.sourceRef),
          officialProductSourcesAttached: officialProductAcquisition.sourcesAdded,
          competitorPrimaryAttached: Boolean(competitorPrimaryAcquisition.sourceRef),
          independentDomainAttached: Boolean(independentDomainAcquisition.sourceRef),
          marketSnapshotAttached: Boolean(marketSnapshotAcquisition.sourceRef),
          acquisitionStops: acquisitionStops.map(stop => stop.code)
        },
        provenance: {
          initialRevisionId: serializeId(revision?._id),
          firstHeadState: 'draft_pending_review',
          filings: (watchResult.events || []).map((event) => {
            const raw = event?.toObject ? event.toObject() : event;
            return {
              form: String(raw?.metadata?.form || ''),
              accessionNumber: String(raw?.metadata?.accessionNumber || ''),
              filingDate: raw?.metadata?.filingDate || null,
              attached: raw?.metadata?.bootstrapDisposition === 'attached_for_first_build'
            };
          })
        },
        touched: [{ type: 'wiki_page', id: serializeId(page._id), title: page.title }],
        nextAction: {
          type: 'review_wiki_page',
          id: serializeId(page._id),
          title: 'Build and review the first trusted head'
        },
        completedAt: new Date()
      };
      const persistedReceipt = await persistNoeisReceipt({
        NoeisReceipt,
        userId: req.user.id,
        receipt: receiptInput
      });
      const receipt = persistedReceipt || receiptInput;
      trackWikiEvent(req, EVENT_NAMES.WIKI_PAGE_CREATED, {
        pageId: serializeId(page._id),
        title: page.title,
        pageType: page.pageType,
        ticker: company.ticker,
        source: 'company_dossier'
      });
      res.status(201).json({
        action: 'created',
        page: serializeWikiPage(page),
        company,
        watchResult: {
          filingsFound: watchResult.filings?.length || 0,
          sourceEventsCreated: watchResult.events?.length || 0,
          filingsAttached: filingSourceCount,
          totalSourcesAttached: Array.isArray(page.sourceRefs) ? page.sourceRefs.length : 0,
          operatingBenchmarkAttached: Boolean(companyFactsAcquisition.sourceRef),
          officialProductSourcesAttached: officialProductAcquisition.sourcesAdded,
          competitorPrimaryAttached: Boolean(competitorPrimaryAcquisition.sourceRef),
          independentDomainAttached: Boolean(independentDomainAcquisition.sourceRef),
          marketSnapshotAttached: Boolean(marketSnapshotAcquisition.sourceRef),
          acquisitionStops,
          watchError
        },
        receipt
      });
    } catch (error) {
      console.error('Error creating company dossier:', error);
      if (createdCompanyDossierPage) {
        return res.status(500).json({
          code: 'DOSSIER_CREATE_PARTIAL',
          error: 'The private dossier was created, but setup did not finish. Open the saved page from Wiki and resume the build.',
          page: serializeWikiPage(createdCompanyDossierPage)
        });
      }
      res.status(Number(error?.statusCode) || 500).json({
        code: error.code || 'DOSSIER_CREATE_FAILED',
        error: Number(error?.statusCode) === 404
          ? 'No SEC company record was found for that ticker. Check the ticker and try again.'
          : Number(error?.statusCode) < 500
            ? error.message
            : 'Noeis could not validate this company against SEC filings. Nothing was created; try again shortly.'
      });
    }
  });

  router.post('/api/wiki/pages/:id/track-in-judgment', wikiAuth, async (req, res) => {
    try {
      if (req.agentToken) {
        return res.status(403).json({ error: 'Only the human owner can track a dossier in Judgment.' });
      }
      const page = await findOwnedPage(req);
      if (!page) return res.status(404).json({ error: 'Wiki page not found.' });
      const profile = page.investmentDossier || {};
      if (!profile.version) {
        return res.status(409).json({ error: 'Only an investment dossier can be tracked as a company case.' });
      }
      if (page.judgment?.kind) {
        return res.status(200).json({
          action: 'existing',
          page: serializeWikiPage(page),
          receipt: {
            id: `company-dossier-judgment:${serializeId(page._id)}`,
            kind: 'company_dossier_judgment_existing',
            source: 'judgment',
            sourceLabel: 'Judgment',
            status: 'completed',
            title: `${profile.company?.ticker || page.title} is already tracked in Judgment.`,
            summary: 'The existing owner judgment was left unchanged.',
            touched: [{ type: 'wiki_page', id: serializeId(page._id), title: page.title }]
          }
        });
      }

      const hurdle = profile.hurdle || {};
      page.judgment = normalizeJudgment({
        input: buildCompanyDossierJudgmentInput({
          companyName: profile.company?.name,
          ticker: profile.company?.ticker,
          startingJudgment: profile.startingJudgment,
          requiredReturn: hurdle.annualReturn,
          horizonYears: hurdle.horizonYears
        }),
        actorType: 'user',
        pageId: String(page._id)
      });
      page.markModified?.('judgment');
      await page.save();
      const revision = await createWikiRevision({
        WikiRevision,
        userId: req.user.id,
        page,
        reason: 'judgment_tracking_started',
        actorType: 'user',
        summary: `Started tracking ${profile.company?.ticker || page.title} in Judgment.`
      });
      if (revision?._id) {
        page.judgment.initialRevisionId = revision._id;
        page.markModified?.('judgment');
        await page.save();
      }
      await syncPageGraph(page, req.user.id);

      const receiptInput = {
        id: `company-dossier-judgment:${serializeId(page._id)}`,
        kind: 'company_dossier_judgment_started',
        source: 'judgment',
        sourceLabel: 'Judgment',
        status: 'completed',
        title: `Tracking ${profile.company?.ticker || page.title} in Judgment.`,
        summary: 'The dossier remains in Wiki. Judgment now carries the owner-controlled company case.',
        touched: [{ type: 'wiki_page', id: serializeId(page._id), title: page.title }],
        nextAction: {
          type: 'open_judgment',
          id: serializeId(page._id),
          title: 'Open the company case'
        },
        completedAt: new Date()
      };
      const receipt = await persistNoeisReceipt({
        NoeisReceipt,
        userId: req.user.id,
        receipt: receiptInput
      }) || receiptInput;
      res.status(200).json({ action: 'tracked', page: serializeWikiPage(page), receipt });
    } catch (error) {
      console.error('Error tracking company dossier in Judgment:', error);
      res.status(error.statusCode || 500).json({ error: error.message || 'Failed to track this dossier in Judgment.' });
    }
  });

  router.get('/api/wiki/pages/:id/research-candidate', wikiAuth, async (req, res) => {
    try {
      if (!WikiRevision) return res.status(503).json({ error: 'Wiki revisions are not available.' });
      const page = await findOwnedPage(req);
      if (!page) return res.status(404).json({ error: 'Wiki page not found.' });
      const firstHead = page.aiState?.candidateStatus === 'awaiting_first_head_acceptance';
      const maintenance = page.aiState?.candidateStatus === 'awaiting_maintenance_acceptance';
      const revisionId = String(firstHead
        ? page.aiState?.firstHeadCandidateRevisionId
        : page.aiState?.maintenanceCandidateRevisionId || '');
      if ((!firstHead && !maintenance) || !revisionId) {
        return res.status(404).json({ error: 'No research candidate is awaiting review.' });
      }
      const revision = await WikiRevision.findOne({
        _id: revisionId,
        userId: req.user.id,
        pageId: page._id,
        promotionStatus: 'candidate'
      }).lean();
      if (!revision?.after) return res.status(404).json({ error: 'The first-head candidate is unavailable.' });
      res.status(200).json({
        revisionId: serializeId(revision._id),
        status: firstHead ? 'awaiting_first_head_acceptance' : 'awaiting_maintenance_acceptance',
        kind: firstHead ? 'first_head' : 'maintenance',
        summary: firstHead
          ? page.aiState?.firstHeadCandidateSummary || {}
          : page.aiState?.maintenanceCandidateSummary || {},
        candidate: serializeWikiPage(revision.after)
      });
    } catch (error) {
      console.error('Error loading first-head candidate:', error);
      res.status(500).json({ error: 'Failed to load the first-head candidate.' });
    }
  });

  router.post('/api/wiki/pages/:id/research-candidate/:decision', wikiAuth, async (req, res) => {
    try {
      if (req.agentToken) {
        return res.status(403).json({ error: 'Only the human owner can accept or reject the first trusted head.' });
      }
      if (!WikiRevision) return res.status(503).json({ error: 'Wiki revisions are not available.' });
      const decision = String(req.params.decision || '').toLowerCase();
      if (!['accept', 'reject'].includes(decision)) {
        return res.status(400).json({ error: 'Decision must be accept or reject.' });
      }
      const page = await findOwnedPage(req);
      if (!page) return res.status(404).json({ error: 'Wiki page not found.' });
      const firstHead = page.aiState?.candidateStatus === 'awaiting_first_head_acceptance';
      const maintenance = page.aiState?.candidateStatus === 'awaiting_maintenance_acceptance';
      const revisionId = String(firstHead
        ? page.aiState?.firstHeadCandidateRevisionId
        : page.aiState?.maintenanceCandidateRevisionId || '');
      if ((!firstHead && !maintenance) || !revisionId) {
        return res.status(409).json({ error: 'No research candidate is awaiting review.' });
      }
      const revision = await WikiRevision.findOne({
        _id: revisionId,
        userId: req.user.id,
        pageId: page._id,
        promotionStatus: 'candidate'
      });
      if (!revision?.after) return res.status(404).json({ error: 'The first-head candidate is unavailable.' });
      const before = snapshotPage(page);
      if (!matchesTrustedRevisionHead({ current: before, revision })) {
        return res.status(409).json({
          code: 'WIKI_RESEARCH_CANDIDATE_STALE',
          error: 'The trusted page changed after this candidate was generated. Rebuild the candidate before accepting it.'
        });
      }
      if (decision === 'accept') {
        const currentQuality = evaluateWikiArticleQuality({
          page: revision.after,
          body: revision.after.body,
          claims: revision.after.claims || [],
          sourceRefs: await groundingSourceRefsForPage({ page: revision.after, userId: req.user.id, models: { WikiSourceEvent } })
        });
        if (!currentQuality?.ok) {
          return res.status(409).json({
            code: 'WIKI_RESEARCH_CANDIDATE_QUALITY_STALE',
            error: 'This candidate no longer satisfies the current decision-grade dossier contract. Rebuild it before accepting.',
            failures: Array.isArray(currentQuality?.failures) ? currentQuality.failures : []
          });
        }
      }
      const now = new Date();
      const candidateLabel = firstHead ? 'first trusted head' : 'maintenance candidate';
      if (decision === 'accept') {
        restorePageSnapshot(page, revision.after);
        const profile = page.investmentDossier || {};
        const claimComparison = compareClaimLedgers({
          beforeClaims: before.claims || [],
          afterClaims: page.claims || [],
          outcome: 'accepted'
        });
        const maintenanceComparison = buildInvestmentMaintenanceComparison({
          before,
          after: snapshotPage(page),
          claimComparison,
          sourceLabel: revision.sourceVersion?.provider || (firstHead ? 'Initial SEC research build' : 'Accepted maintenance candidate'),
          sourceEventId: serializeId(revision.sourceEventId),
          revisionId: serializeId(revision._id),
          now
        });
        page.investmentDossier = firstHead
          ? {
            ...profile,
            firstHead: {
              status: 'accepted',
              acceptedAt: now,
              candidateRevisionId: serializeId(revision._id)
            },
            lastMaintenanceComparison: maintenanceComparison
          }
          : {
            ...profile,
            lastMaintenanceComparison: maintenanceComparison
          };
        page.aiState = {
          ...(page.aiState?.toObject ? page.aiState.toObject() : page.aiState || {}),
          candidateStatus: 'accepted',
          firstHeadAcceptedAt: now,
          draftStatus: 'ready',
          lastError: '',
          errorCode: '',
          lastCandidateQuality: {},
          lastCandidateSummary: ''
        };
        delete page.aiState.firstHeadCandidateRevisionId;
        delete page.aiState.firstHeadCandidateAt;
        delete page.aiState.firstHeadCandidateSummary;
        delete page.aiState.maintenanceCandidateRevisionId;
        delete page.aiState.maintenanceCandidateAt;
        delete page.aiState.maintenanceCandidateSummary;
        page.freshness = {
          ...(page.freshness?.toObject ? page.freshness.toObject() : page.freshness || {}),
          status: 'fresh',
          lastMaintainedAt: now
        };
        inkWikiPageReview(page, now);
        page.markModified?.('investmentDossier');
        page.markModified?.('aiState');
        page.markModified?.('freshness');
        await page.save();
        revision.promotionStatus = 'promoted';
        revision.summary = `Accepted ${candidateLabel} for "${page.title}".`;
        await revision.save();
        await syncPageGraph(page, req.user.id);
        const acceptanceRevision = await createWikiRevision({
          WikiRevision,
          userId: req.user.id,
          page,
          before,
          reason: 'user_edit',
          actorType: 'user',
          summary: `Owner accepted the ${candidateLabel} for "${page.title}".`
        });
        const judgmentReviewInput = maintenance
          ? buildDossierJudgmentReviewReceipt({
            page,
            comparison: maintenanceComparison,
            candidateRevisionId: revision._id,
            acceptanceRevisionId: acceptanceRevision?._id,
            now
          })
          : null;
        const receiptInput = {
          id: `company-dossier-${firstHead ? 'first-head' : 'maintenance'}:${serializeId(page._id)}:${serializeId(revision._id)}`,
          kind: firstHead ? 'company_dossier_first_head_accepted' : 'company_dossier_maintenance_accepted',
          source: 'wiki',
          sourceLabel: 'Company dossier',
          status: 'completed',
          title: `Accepted the ${firstHead ? 'first trusted head' : 'maintenance candidate'} for ${page.investmentDossier?.company?.ticker || page.title}`,
          summary: `${maintenanceComparison.headline} ${maintenanceComparison.judgmentSummary}`,
          provenance: {
            pageId: serializeId(page._id),
            candidateRevisionId: serializeId(revision._id),
            acceptanceRevisionId: serializeId(acceptanceRevision?._id),
            sourceEventId: serializeId(revision.sourceEventId)
          },
          touched: [{ type: 'wiki_page', id: serializeId(page._id), title: page.title }],
          completedAt: now
        };
        const persistedReceipt = await persistNoeisReceipt({
          NoeisReceipt,
          userId: req.user.id,
          receipt: receiptInput
        });
        const judgmentReview = judgmentReviewInput
          ? await persistNoeisReceipt({
            NoeisReceipt,
            userId: req.user.id,
            receipt: judgmentReviewInput
          })
          : null;
        trackWikiEvent(req, EVENT_NAMES.WIKI_DRAFT_GENERATED, {
          pageId: serializeId(page._id),
          title: page.title,
          pageType: page.pageType,
          sourceCount: Array.isArray(page.sourceRefs) ? page.sourceRefs.length : 0,
          claimCount: Array.isArray(page.claims) ? page.claims.length : 0,
          sourceType: 'company_dossier',
          acceptance: firstHead ? 'first_head' : 'maintenance'
        });
        return res.status(200).json({
          page: serializeWikiPage(page),
          receipt: persistedReceipt || receiptInput,
          judgmentReview
        });
      }

      revision.promotionStatus = 'rejected';
      revision.summary = `Owner rejected ${candidateLabel} for "${page.title}".`;
      await revision.save();
      page.aiState = {
        ...(page.aiState?.toObject ? page.aiState.toObject() : page.aiState || {}),
        candidateStatus: firstHead ? 'first_head_rejected' : 'maintenance_rejected',
        lastCandidateAt: now,
        lastCandidateSummary: firstHead
          ? 'The owner rejected the first research head. The original private scaffold and judgment remain unchanged.'
          : 'The owner rejected the maintenance candidate. The accepted research head and judgment remain unchanged.'
      };
      delete page.aiState.firstHeadCandidateRevisionId;
      delete page.aiState.firstHeadCandidateAt;
      delete page.aiState.firstHeadCandidateSummary;
      delete page.aiState.maintenanceCandidateRevisionId;
      delete page.aiState.maintenanceCandidateAt;
      delete page.aiState.maintenanceCandidateSummary;
      page.markModified?.('aiState');
      await page.save();
      const receiptInput = {
        id: `company-dossier-${firstHead ? 'first-head' : 'maintenance'}-rejected:${serializeId(page._id)}:${serializeId(revision._id)}`,
        kind: firstHead ? 'company_dossier_first_head_rejected' : 'company_dossier_maintenance_rejected',
        source: 'wiki',
        sourceLabel: 'Company dossier',
        status: 'needs_review',
        title: `Rejected the ${firstHead ? 'first research head' : 'maintenance candidate'} for ${page.investmentDossier?.company?.ticker || page.title}.`,
        summary: `The generated candidate was rejected. The trusted private ${firstHead ? 'scaffold' : 'research head'} and owner judgment are unchanged.`,
        provenance: {
          pageId: serializeId(page._id),
          candidateRevisionId: serializeId(revision._id),
          sourceEventId: serializeId(revision.sourceEventId)
        },
        touched: [{ type: 'wiki_page', id: serializeId(page._id), title: page.title }],
        completedAt: now
      };
      const persistedReceipt = await persistNoeisReceipt({
        NoeisReceipt,
        userId: req.user.id,
        receipt: receiptInput
      });
      return res.status(200).json({
        page: serializeWikiPage(page),
        receipt: persistedReceipt || receiptInput
      });
    } catch (error) {
      console.error('Error reviewing first-head candidate:', error);
      res.status(500).json({ error: 'Failed to review the first-head candidate.' });
    }
  });

  router.get('/api/wiki/judgment-research-reviews', wikiAuth, async (req, res) => {
    try {
      const reviews = await listDossierJudgmentReviews({
        NoeisReceipt,
        userId: req.user.id,
        limit: req.query?.limit
      });
      return res.status(200).json({ reviews });
    } catch (error) {
      console.error('Error listing dossier Judgment reviews:', error);
      return res.status(500).json({ error: 'Failed to load pending dossier Judgment reviews.' });
    }
  });

  router.get('/api/wiki/pages/:id/judgment-research-review', wikiAuth, async (req, res) => {
    try {
      const page = await findOwnedPage(req);
      if (!page) return res.status(404).json({ error: 'Wiki page not found.' });
      if (!page.investmentDossier?.version || !page.judgment?.kind) {
        return res.status(200).json({ review: null });
      }
      const review = await loadDossierJudgmentReview({
        NoeisReceipt,
        userId: req.user.id,
        pageId: page._id
      });
      return res.status(200).json({ review });
    } catch (error) {
      console.error('Error loading dossier Judgment review:', error);
      return res.status(500).json({ error: 'Failed to load the dossier Judgment review.' });
    }
  });

  router.post('/api/wiki/pages/:id/judgment-research-review/:resolution', wikiAuth, async (req, res) => {
    try {
      if (req.agentToken) {
        return res.status(403).json({ error: 'Only the human owner can resolve a dossier Judgment review.' });
      }
      const page = await findOwnedPage(req);
      if (!page) return res.status(404).json({ error: 'Wiki page not found.' });
      const receipt = await resolveDossierJudgmentReview({
        NoeisReceipt,
        JudgmentResponseDraft,
        userId: req.user.id,
        page,
        receiptId: req.body?.receiptId,
        resolution: req.params.resolution
      });
      return res.status(200).json({ receipt });
    } catch (error) {
      if (!error.statusCode) console.error('Error resolving dossier Judgment review:', error);
      return res.status(error.statusCode || 500).json({
        code: error.code || 'DOSSIER_JUDGMENT_REVIEW_FAILED',
        error: error.message || 'Failed to resolve the dossier Judgment review.'
      });
    }
  });

  router.post('/api/wiki/pages/:id/research-head/adopt', wikiAuth, async (req, res) => {
    try {
      if (req.agentToken) {
        return res.status(403).json({ error: 'Only the human owner can adopt a trusted research head.' });
      }
      if (String(req.body?.confirmation || '') !== 'ADOPT CURRENT TRUSTED HEAD') {
        return res.status(400).json({
          code: 'WIKI_RESEARCH_HEAD_CONFIRMATION_REQUIRED',
          error: 'Review the current article and confirm that you want to adopt this exact head.'
        });
      }
      const page = await findOwnedPage(req);
      if (!page) return res.status(404).json({ error: 'Wiki page not found.' });
      const profile = page.investmentDossier || {};
      if (!profile.version || !profile.company?.ticker) {
        return res.status(409).json({ error: 'This page is not a structured investment dossier.' });
      }
      if (profile.firstHead?.status === 'accepted') {
        return res.status(409).json({
          code: 'WIKI_RESEARCH_HEAD_ALREADY_ACCEPTED',
          error: 'This dossier already has an accepted trusted head.'
        });
      }
      if (['awaiting_first_head_acceptance', 'awaiting_maintenance_acceptance'].includes(page.aiState?.candidateStatus)) {
        return res.status(409).json({
          code: 'WIKI_RESEARCH_CANDIDATE_PENDING',
          error: 'Review the pending research candidate instead of adopting an older trusted head.'
        });
      }
      if (!String(page.judgment?.currentJudgment || '').trim()) {
        return res.status(409).json({
          code: 'WIKI_OWNER_JUDGMENT_REQUIRED',
          error: 'Record your current judgment in the Decision record before adopting this research head.'
        });
      }
      const quality = evaluateWikiArticleQuality({
        page,
        body: page.body,
        claims: page.claims || [],
        sourceRefs: await groundingSourceRefsForPage({ page: snapshotPage(page), userId: req.user.id, models: { WikiSourceEvent } })
      });
      if (!quality?.ok) {
        return res.status(409).json({
          code: 'WIKI_RESEARCH_HEAD_QUALITY_FAILED',
          error: 'The current article does not satisfy the decision-grade dossier contract.',
          failures: Array.isArray(quality?.failures) ? quality.failures : []
        });
      }

      const now = new Date();
      const before = snapshotPage(page);
      const trustedHeadHash = snapshotContentHash(before);
      page.investmentDossier = {
        ...profile,
        firstHead: {
          status: 'accepted',
          acceptedAt: now,
          method: 'legacy_trusted_head_adoption',
          trustedHeadHash
        }
      };
      page.aiState = {
        ...(page.aiState?.toObject ? page.aiState.toObject() : page.aiState || {}),
        candidateStatus: 'accepted',
        firstHeadAcceptedAt: now,
        draftStatus: 'ready',
        lastError: '',
        errorCode: ''
      };
      page.markModified?.('investmentDossier');
      page.markModified?.('aiState');
      await page.save();
      const acceptanceRevision = await createWikiRevision({
        WikiRevision,
        userId: req.user.id,
        page,
        before,
        reason: 'user_edit',
        actorType: 'user',
        sourceVersion: {
          provider: 'legacy-trusted-head-adoption',
          trustedHeadHash,
          adoptedWithoutContentChange: true
        },
        quality,
        summary: `Owner adopted the existing trusted research head for "${page.title}" without changing its content or evidence clock.`
      });
      if (!acceptanceRevision) {
        restorePageSnapshot(page, before);
        await page.save();
        return res.status(500).json({ error: 'Could not bind the adopted head to a durable revision.' });
      }
      page.investmentDossier = {
        ...(page.investmentDossier?.toObject
          ? page.investmentDossier.toObject()
          : page.investmentDossier || {}),
        firstHead: {
          ...(page.investmentDossier?.firstHead || {}),
          acceptanceRevisionId: serializeId(acceptanceRevision._id)
        }
      };
      page.markModified?.('investmentDossier');
      await page.save();
      publicPageCache.invalidate(serializeId(page._id), page.slug);

      const receiptInput = {
        id: `company-dossier-first-head-adopted:${serializeId(page._id)}:${trustedHeadHash.slice(0, 16)}`,
        kind: 'company_dossier_first_head_accepted',
        source: 'wiki',
        sourceLabel: 'Company dossier',
        status: 'completed',
        title: `Adopted the current trusted head for ${profile.company.ticker}`,
        summary: 'The owner accepted the exact existing private article. No claim, source, valuation input, or evidence clock changed.',
        metrics: {
          ticker: profile.company.ticker,
          words: String(page.plainText || '').trim().split(/\s+/).filter(Boolean).length,
          claims: Array.isArray(page.claims) ? page.claims.length : 0,
          sources: Array.isArray(page.sourceRefs) ? page.sourceRefs.length : 0
        },
        provenance: {
          acceptanceRevisionId: serializeId(acceptanceRevision._id),
          trustedHeadHash,
          method: 'legacy_trusted_head_adoption'
        },
        touched: [{ type: 'wiki_page', id: serializeId(page._id), title: page.title }],
        nextAction: {
          type: 'review_wiki_page',
          id: serializeId(page._id),
          title: 'Refresh expectations or wait for new evidence'
        },
        completedAt: now
      };
      const persistedReceipt = await persistNoeisReceipt({
        NoeisReceipt,
        userId: req.user.id,
        receipt: receiptInput
      });
      trackWikiEvent(req, EVENT_NAMES.WIKI_DRAFT_GENERATED, {
        pageId: serializeId(page._id),
        title: page.title,
        pageType: page.pageType,
        sourceType: 'company_dossier',
        acceptance: 'legacy_first_head'
      });
      return res.status(200).json({
        page: serializeWikiPage(page),
        receipt: persistedReceipt || receiptInput
      });
    } catch (error) {
      console.error('Error adopting legacy research head:', error);
      res.status(500).json({ error: 'Failed to adopt the current research head.' });
    }
  });

  router.post('/api/wiki/pages/:id/valuation', wikiAuth, async (req, res) => {
    try {
      if (req.agentToken) {
        return res.status(403).json({ error: 'Only the human owner can refresh investment expectations.' });
      }
      const page = await findOwnedPage(req);
      if (!page) return res.status(404).json({ error: 'Wiki page not found.' });
      const profile = page.investmentDossier || {};
      if (!profile.version || !profile.company?.ticker) {
        return res.status(409).json({ error: 'This page is not a structured investment dossier.' });
      }
      const hurdle = profile.hurdle || profile.valuation?.hurdle || {};
      const annualReturn = Number(hurdle.annualReturn);
      const horizonYears = Number(hurdle.horizonYears);
      if (!Number.isFinite(annualReturn) || !Number.isFinite(horizonYears)) {
        return res.status(409).json({ error: 'Set the owner return hurdle and horizon before refreshing valuation.' });
      }

      const operatingSourceRefId = String(req.body?.operatingSourceRefId || '').trim();
      const operatingSource = (page.sourceRefs || []).find(
        source => serializeId(source?._id) === operatingSourceRefId
      );
      if (!operatingSource) {
        return res.status(400).json({ error: 'Choose an attached filing or operating source for the valuation base.' });
      }
      const marketSourceUrl = normalizeExternalHttpUrl(req.body?.marketSourceUrl, 'Market source URL');
      const asOf = String(req.body?.asOf || '').trim();
      const now = new Date();
      const before = snapshotPage(page);
      let marketSource = (page.sourceRefs || []).find(source => (
        source?.metadata?.marketSnapshot === true
        && String(source.url || '') === marketSourceUrl
        && String(source?.metadata?.asOf || '') === asOf
      ));
      if (!marketSource) {
        page.sourceRefs.push({
          _id: new mongoose.Types.ObjectId(),
          type: 'external',
          title: String(req.body?.marketSourceTitle || `${profile.company.ticker} market price snapshot`).trim().slice(0, 300),
          snippet: `${profile.company.ticker} price observation of ${req.body?.price} as of ${asOf}. User-supplied market input; does not advance the SEC evidence clock.`,
          url: marketSourceUrl,
          citationLabel: `Market price · ${asOf}`,
          provider: 'market-observation',
          metadata: {
            marketSnapshot: true,
            evidenceArchetype: 'market_snapshot',
            ticker: profile.company.ticker,
            price: Number(req.body?.price),
            asOf
          },
          addedBy: 'user'
        });
        marketSource = page.sourceRefs[page.sourceRefs.length - 1];
      }
      const marketSourceRefId = serializeId(marketSource?._id);
      let valuation;
      try {
        valuation = buildValuationSnapshot({
          asOf,
          currency: 'USD',
          unitScale: req.body?.unitScale,
          price: req.body?.price,
          dilutedShares: req.body?.dilutedShares,
          netCashOrDebt: req.body?.netCashOrDebt,
          operatingBase: {
            metric: req.body?.operatingMetric,
            period: req.body?.operatingPeriod,
            value: req.body?.operatingBase,
            derivation: req.body?.operatingDerivation,
            sourceRefIds: [operatingSourceRefId]
          },
          annualReturn,
          horizonYears,
          terminalMultiples: req.body?.terminalMultiples,
          sourceRefIds: [marketSourceRefId, operatingSourceRefId],
          calculatedAt: now
        });
      } catch (validationError) {
        if (!before?.sourceRefs?.some(source => serializeId(source?._id) === marketSourceRefId)) {
          const index = page.sourceRefs.findIndex(source => serializeId(source?._id) === marketSourceRefId);
          if (index >= 0) page.sourceRefs.splice(index, 1);
        }
        return res.status(400).json({ error: validationError.message });
      }

      const comparison = buildInvestmentMaintenanceComparison({
        before,
        after: {
          ...before,
          investmentDossier: {
            ...profile,
            valuation
          }
        },
        claimComparison: {
          counts: {
            added: 0,
            changed: 0,
            gainedSupport: 0,
            contradicted: 0,
            preserved: Array.isArray(page.claims) ? page.claims.length : 0,
            removed: 0
          },
          deltas: {}
        },
        sourceLabel: `${profile.company.ticker} market-price refresh`,
        now
      });
      page.investmentDossier = {
        ...profile,
        valuation,
        lastMaintenanceComparison: comparison,
        clocks: {
          ...(profile.clocks || {}),
          priceRefreshedAt: valuation.calculatedAt
        }
      };
      page.markModified?.('sourceRefs');
      page.markModified?.('investmentDossier');
      await page.save();
      const revision = await createWikiRevision({
        WikiRevision,
        userId: req.user.id,
        page,
        before,
        reason: 'valuation_refreshed',
        actorType: 'user',
        summary: `Refreshed ${profile.company.ticker} implied expectations without advancing the SEC filing clock.`
      });
      publicPageCache.invalidate(serializeId(page._id), page.slug);

      const receiptInput = {
        id: `investment-valuation:${serializeId(page._id)}:${String(asOf).slice(0, 10)}`,
        kind: 'investment_valuation_refreshed',
        source: 'wiki',
        sourceLabel: 'Investment expectations',
        status: 'completed',
        title: `Refreshed ${profile.company.ticker} implied expectations.`,
        summary: `${comparison.expectations.summary} The accepted SEC clock was not changed.`,
        metrics: {
          ticker: profile.company.ticker,
          price: valuation.price,
          asOf: valuation.asOf,
          annualReturn,
          horizonYears,
          scenarioCount: valuation.scenarios.length
        },
        provenance: {
          revisionId: serializeId(revision?._id),
          marketSourceRefId,
          operatingSourceRefId,
          filingAcceptedAt: profile.clocks?.filingAcceptedAt || null,
          priceRefreshedAt: valuation.calculatedAt
        },
        touched: [{ type: 'wiki_page', id: serializeId(page._id), title: page.title }],
        nextAction: {
          type: 'review_wiki_page',
          id: serializeId(page._id),
          title: 'Review what the current price requires'
        },
        completedAt: now
      };
      const persistedReceipt = await persistNoeisReceipt({
        NoeisReceipt,
        userId: req.user.id,
        receipt: receiptInput
      });
      res.status(200).json({
        page: serializeWikiPage(page),
        valuation,
        receipt: persistedReceipt || receiptInput
      });
    } catch (error) {
      console.error('Error refreshing investment valuation:', error);
      res.status(Number(error?.statusCode) || 500).json({
        error: Number(error?.statusCode) < 500
          ? error.message
          : 'Failed to refresh investment expectations.'
      });
    }
  });
};
