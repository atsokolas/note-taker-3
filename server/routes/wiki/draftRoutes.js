// Drafting a wiki page with the model: at once, detached, or streamed as it writes.
const { serializeId, serializeWikiPage } = require('../../services/wikiPageShape');
const { snapshotPage, createWikiRevision } = require('../../services/wikiRevisionService');
const { isReviewer } = require('../../services/reviewerRehearsalBudget');
const { runWikiMaintenanceCandidate } = require('../../services/wikiMaintenancePublicationService');
const { CHATGPT_ACCESS_PROFILE } = require('../../services/chatgptAccessPolicy');
const { releaseRepoBuildLease } = require('../../services/wikiRepoBuildLeaseService');
const { REPO_WIKI_GENERATOR_VERSION } = require('../../services/repoWikiGeneratorVersion');
const {
  isCompanyDossier,
  dossierBuildAllowance,
  createDossierBuildRun,
  waitForDossierBuildRun,
  touchDossierBuildRun,
  recordDossierBuildStage,
  withTransientRetries,
  finishDossierBuildRun
} = require('../../services/wikiDossierBuildReliabilityService');
const { buildCompanyDossierEvidenceCoverage } = require('../../services/companyDossierEvidenceService');

module.exports = (router, {
  Article,
  EVENT_NAMES,
  NotebookEntry,
  Question,
  TagMeta,
  WikiMaintenanceRun,
  WikiPage,
  WikiRevision,
  WikiSourceEvent,
  acquireCompanyFactsForDossier,
  acquireCompetitorPrimaryForDossier,
  acquireIndependentDomainForDossier,
  acquireMarketSnapshotForDossier,
  acquireOfficialProductSourcesForDossier,
  acquireRepoMaintenanceLease,
  acquireSecPrimaryPackForDossier,
  activeWikiDraftStreams,
  applyAutolinksForPage,
  asyncBuildTimeoutMs,
  autolinkPagesToTarget,
  findOwnedPage,
  isGitHubRepoWikiPage,
  loadWikiSchemaContent,
  maintainWikiPage,
  openWikiDraftStream,
  readMaintenanceRequestOptions,
  reviewerMaintenanceArgs,
  savePageWithVersionRetry,
  scheduleInboundAutolinks,
  syncPageGraph,
  trackWikiEvent,
  wikiAuth,
  writeSse
}) => {
  router.post('/api/wiki/pages/:id/ai/draft', wikiAuth, async (req, res) => {
    let page = null;
    let buildLease = null;
    let repoHeadSha = '';
    try {
      page = await findOwnedPage(req);
      if (!page) return res.status(404).json({ error: 'Wiki page not found.' });
      buildLease = await acquireRepoMaintenanceLease({ page, userId: req.user.id });
      if (buildLease && !buildLease.acquired) {
        return res.status(409).json({
          error: 'Wiki maintenance already running for this repository head.',
          code: 'REPO_WIKI_BUILD_IN_PROGRESS',
          pageId: serializeId(page._id)
        });
      }
      if (buildLease?.page) page = buildLease.page;
      repoHeadSha = buildLease?.headSha || '';
      const before = snapshotPage(page);
      const boundedMaintenanceArgs = reviewerMaintenanceArgs({ userId: req.user.id, page });
      if (isReviewer(req.user.id) && await Article.countDocuments({
        userId: req.user.id,
        _id: { $in: page.sourceRefs.map(ref => ref.objectId) }
      }) !== 2) {
        return res.status(422).json({ code: 'REVIEWER_SOURCE_OWNERSHIP_MISMATCH', error: 'Reviewer fixture sources must belong to the verified reviewer.' });
      }

      page.aiState = {
        ...(page.aiState?.toObject ? page.aiState.toObject() : page.aiState || {}),
        draftStatus: 'maintaining',
        draftRequestedAt: new Date(),
        draftStartedAt: new Date(),
        lastError: '',
        errorCode: ''
      };

      const publication = await runWikiMaintenanceCandidate({
        page,
        userId: req.user.id,
        WikiRevision,
        beforeSnapshot: before,
        requireFirstHeadAcceptance: /^company-dossier:/i.test(String(page?.createdFrom?.label || '')),
        requireOwnerAcceptance: req.agentToken?.accessProfile === CHATGPT_ACCESS_PROFILE || Boolean(page?.investmentDossier?.version) || isReviewer(req.user.id),
        maintainWikiPageFn: maintainWikiPage,
        maintainArgs: {
          ...boundedMaintenanceArgs,
          wikiSchemaContent: await loadWikiSchemaContent(req.user.id),
          models: {
            Article,
            NotebookEntry,
            TagMeta,
            Question,
            WikiSourceEvent
          }
        }
      });
      page = publication.page;

      if (!publication.promoted) {
        await page.save();
        if (publication.awaitingAcceptance) {
          return res.status(202).json({
            ...serializeWikiPage(page),
            firstHeadReview: {
              status: 'awaiting_acceptance',
              kind: publication.reviewKind,
              revisionId: serializeId(publication.reviewRevision?._id),
              summary: publication.reviewKind === 'first_head'
                ? page.aiState?.firstHeadCandidateSummary || {}
                : page.aiState?.maintenanceCandidateSummary || {}
            }
          });
        }
        if (buildLease?.acquired) {
          page = await releaseRepoBuildLease({
            WikiPage,
            pageId: page._id,
            userId: req.user.id,
            token: buildLease.token,
            headSha: repoHeadSha,
            generatorVersion: REPO_WIKI_GENERATOR_VERSION,
            status: 'needs_review',
            error: publication.quality?.failures?.slice(0, 3).join(' ') || 'Candidate did not pass quality.'
          }) || page;
          buildLease = null;
        }
        return res.status(422).json({
          error: 'The wiki candidate did not pass the quality bar. The last trusted version is unchanged.',
          code: 'WIKI_CANDIDATE_REJECTED',
          page: serializeWikiPage(page),
          quality: publication.quality
        });
      }

      // Concept pages benefit from cross-wiki autolinking. Repo dossiers are
      // repository-grounded developer manuals; scanning the entire personal
      // wiki for concept links can hold their publication lease for minutes.
      const repoWikiPage = isGitHubRepoWikiPage(page);
      if (!repoWikiPage) await applyAutolinksForPage(page, req.user.id, { limit: 80 });

      await page.save();
      await syncPageGraph(page, req.user.id);
      await createWikiRevision({
        WikiRevision,
        userId: req.user.id,
        page,
        before,
        reason: 'agent_maintenance',
        actorType: 'agent',
        summary: page.aiState?.maintenanceSummary || `Maintained "${page.title}".`
      });
      if (buildLease?.acquired) {
        page = await releaseRepoBuildLease({
          WikiPage,
          pageId: page._id,
          userId: req.user.id,
          token: buildLease.token,
          headSha: repoHeadSha,
          generatorVersion: REPO_WIKI_GENERATOR_VERSION,
          status: 'ready',
          promoted: true
        }) || page;
        buildLease = null;
      }
      trackWikiEvent(req, EVENT_NAMES.WIKI_DRAFT_GENERATED, {
        pageId: serializeId(page._id),
        title: page.title,
        pageType: page.pageType,
        sourceCount: Array.isArray(page.sourceRefs) ? page.sourceRefs.length : 0,
        claimCount: Array.isArray(page.claims) ? page.claims.length : 0
      });
      res.status(200).json(serializeWikiPage(page));
      // The durable page and direct graph are already in the response.
      // Settle corpus-wide inbound mentions only after the user can read it.
      if (!repoWikiPage) {
        scheduleInboundAutolinks({
          targetPage: page,
          userId: req.user.id,
          sourcePageId: page._id
        });
      }
    } catch (error) {
      console.error('Error maintaining wiki page:', error);
      if ((typeof error.code === 'string' && error.code.startsWith('REVIEWER_'))) {
        return res.status(error.status || 409).json({ code: error.code, error: error.message });
      }
      if (buildLease?.acquired && page) {
        await releaseRepoBuildLease({
          WikiPage,
          pageId: page._id,
          userId: req.user.id,
          token: buildLease.token,
          headSha: repoHeadSha,
          generatorVersion: REPO_WIKI_GENERATOR_VERSION,
          status: 'error',
          error: error.message || 'Wiki maintenance failed.'
        }).catch(() => null);
      }
      res.status(500).json({ error: 'Failed to maintain wiki page.' });
    }
  });

  /**
   * Kick off a page build and return immediately.
   *
   * First-run onboarding cannot hold a new user on a spinner for the length of a
   * real maintenance pass, so the build runs detached and the client polls
   * `aiState.draftStatus` on the page (idle | maintaining | ready | error).
   *
   * Deliberately narrower than POST /ai/draft: this path refuses any page whose
   * publication needs acceptance review or a repository build lease, rather than
   * silently bypassing those gates. Callers that need those flows use the
   * synchronous route, which owns them.
   */
  router.post('/api/wiki/pages/:id/ai/draft/async', wikiAuth, async (req, res) => {
    let page = null;
    try {
      page = await findOwnedPage(req);
      if (!page) return res.status(404).json({ error: 'Wiki page not found.' });

      // Refuse exactly the pages that need a repository build lease — that is the
      // machinery this detached path does not implement. Note isGitHubRepoWikiPage
      // alone is not the test: externalWatches.githubRepo defaults to an object, so
      // it is truthy on ordinary pages. The head SHA is what makes a build a repo build.
      const repoHeadSha = String(page?.externalWatches?.githubRepo?.lastHeadSha || '').trim();
      if (isGitHubRepoWikiPage(page) && repoHeadSha) {
        return res.status(409).json({
          error: 'Repository wiki builds run through the synchronous maintenance route.',
          code: 'ASYNC_BUILD_UNSUPPORTED_PAGE'
        });
      }
      const needsAcceptance = /^company-dossier:/i.test(String(page?.createdFrom?.label || ''))
        || Boolean(page?.investmentDossier?.version);
      if (needsAcceptance) {
        return res.status(409).json({
          error: 'This page requires acceptance review and cannot be built detached.',
          code: 'ASYNC_BUILD_REQUIRES_REVIEW'
        });
      }
      if (page.aiState?.draftStatus === 'maintaining') {
        // Already building. Report the in-flight build rather than starting a second.
        return res.status(202).json({
          pageId: serializeId(page._id),
          status: 'maintaining',
          startedAt: page.aiState?.draftStartedAt || null,
          alreadyRunning: true
        });
      }

      const startedAt = new Date();
      page.aiState = {
        ...(page.aiState?.toObject ? page.aiState.toObject() : page.aiState || {}),
        draftStatus: 'maintaining',
        draftRequestedAt: startedAt,
        draftStartedAt: startedAt,
        lastError: '',
        errorCode: ''
      };
      // Persist "maintaining" BEFORE responding. The client polls this field, so a
      // status that only lives in memory would read as idle for the whole build.
      await page.save();

      res.status(202).json({
        pageId: serializeId(page._id),
        status: 'maintaining',
        startedAt,
        alreadyRunning: false
      });

      const userId = req.user.id;
      const pageId = page._id;
      const requestForAnalytics = req;
      const wikiSchemaContent = await loadWikiSchemaContent(userId);

      setImmediate(async () => {
        // A build that hangs must still end. The failure path below only fires when
        // the work *rejects*; when an upstream model call stalls instead, the page
        // stayed 'maintaining' forever and the client sat on a spinner until its own
        // ten-minute give-up. Observed on production: three builds stuck past five
        // minutes with nothing recorded. Whichever finishes first — the build or this
        // timer — writes the outcome, and the guard on draftStatus means a late
        // finisher cannot be overwritten by a timeout that already fired, or the
        // reverse.
        const stallTimer = setTimeout(() => {
          WikiPage.updateOne(
            { _id: pageId, userId, 'aiState.draftStatus': 'maintaining' },
            {
              $set: {
                'aiState.draftStatus': 'error',
                'aiState.draftCompletedAt': new Date(),
                'aiState.lastError': 'the build did not finish in time. Nothing was lost — your page is unchanged, and you can try again.',
                'aiState.errorCode': 'WIKI_ASYNC_BUILD_TIMED_OUT'
              }
            }
          ).catch(timeoutError => console.error('Failed to record async build timeout:', timeoutError));
        }, asyncBuildTimeoutMs);

        try {
          const livePage = await WikiPage.findOne({ _id: pageId, userId });
          if (!livePage) {
            clearTimeout(stallTimer);
            return;
          }
          const before = snapshotPage(livePage);
          const publication = await runWikiMaintenanceCandidate({
            page: livePage,
            userId,
            WikiRevision,
            beforeSnapshot: before,
            requireFirstHeadAcceptance: false,
            requireOwnerAcceptance: false,
            maintainWikiPageFn: maintainWikiPage,
            maintainArgs: {
              wikiSchemaContent,
              models: { Article, NotebookEntry, TagMeta, Question, WikiSourceEvent }
            }
          });
          let built = publication.page;

          if (!publication.promoted) {
            // The publication service has already written why it refused, in its
            // own words — which claims had no anchor in the evidence, what the
            // rebuild attempts missed. Keep it. Overwriting it with a generic
            // sentence threw away the only actionable thing the user could be told.
            const priorAiState = built.aiState?.toObject ? built.aiState.toObject() : built.aiState || {};
            built.aiState = {
              ...priorAiState,
              draftStatus: 'error',
              draftCompletedAt: new Date(),
              lastError: priorAiState.lastError
                || priorAiState.lastCandidateSummary
                || 'The draft did not reach the evidence bar. The last trusted version is unchanged.',
              errorCode: priorAiState.errorCode || 'WIKI_CANDIDATE_REJECTED'
            };
            await savePageWithVersionRetry(built, userId);
            clearTimeout(stallTimer);
            return;
          }

          await applyAutolinksForPage(built, userId);
          built.aiState = {
            ...(built.aiState?.toObject ? built.aiState.toObject() : built.aiState || {}),
            draftStatus: 'ready',
            draftCompletedAt: new Date(),
            lastError: '',
            errorCode: ''
          };
          built = await savePageWithVersionRetry(built, userId);
          await syncPageGraph(built, userId);
          await autolinkPagesToTarget({ targetPage: built, userId });
          await createWikiRevision({
            WikiRevision,
            userId,
            page: built,
            before,
            reason: 'agent_maintenance',
            actorType: 'agent',
            summary: built.aiState?.maintenanceSummary || `Maintained "${built.title}".`
          });
          trackWikiEvent(requestForAnalytics, EVENT_NAMES.WIKI_DRAFT_GENERATED, {
            pageId: serializeId(built._id),
            title: built.title,
            pageType: built.pageType,
            sourceCount: Array.isArray(built.sourceRefs) ? built.sourceRefs.length : 0,
            claimCount: Array.isArray(built.claims) ? built.claims.length : 0
          });
          clearTimeout(stallTimer);
        } catch (error) {
          clearTimeout(stallTimer);
          console.error('Error building wiki page asynchronously:', error);
          // The client is polling; a build that dies silently would spin forever.
          try {
            await WikiPage.updateOne(
              { _id: pageId, userId },
              {
                $set: {
                  'aiState.draftStatus': 'error',
                  'aiState.draftCompletedAt': new Date(),
                  'aiState.lastError': 'the build did not finish. Nothing was lost — your page is unchanged.',
                  'aiState.errorCode': 'WIKI_ASYNC_BUILD_FAILED'
                }
              }
            );
          } catch (statusError) {
            console.error('Failed to record async build failure:', statusError);
          }
        }
      });
    } catch (error) {
      console.error('Error starting async wiki page build:', error);
      if (!res.headersSent) res.status(500).json({ error: 'Failed to start wiki page build.' });
    }
  });

  router.post('/api/wiki/pages/:id/ai/draft/stream', wikiAuth, async (req, res) => {
    let page = null;
    let activeStreamKey = '';
    let ownsActiveStreamKey = false;
    let buildLease = null;
    let dossierBuildRun = null;
    let heartbeatTimer = null;
    let repoHeadSha = '';
    try {
      page = await findOwnedPage(req);
      if (!page) return res.status(404).json({ error: 'Wiki page not found.' });
      if (isCompanyDossier(page)
        && page.aiState?.draftStatus === 'ready'
        && ['awaiting_first_head_acceptance', 'awaiting_maintenance_acceptance'].includes(page.aiState?.candidateStatus)) {
        openWikiDraftStream(res);
        const firstHead = page.aiState.candidateStatus === 'awaiting_first_head_acceptance';
        writeSse(res, 'wiki-page', {
          stage: 'candidate_ready',
          summary: firstHead
            ? 'The first research head is already ready for owner review.'
            : 'The maintenance candidate is already ready for owner review.',
          page: serializeWikiPage(page)
        });
        writeSse(res, 'done', {
          ok: true,
          code: firstHead
            ? 'WIKI_FIRST_HEAD_AWAITING_ACCEPTANCE'
            : 'WIKI_MAINTENANCE_AWAITING_ACCEPTANCE',
          pageId: serializeId(page._id),
          resumed: true
        });
        res.end();
        return;
      }
      if (isCompanyDossier(page)) {
        const allowance = await dossierBuildAllowance({ WikiMaintenanceRun, userId: req.user.id, pageId: page._id });
        if (!allowance.allowed) {
          return res.status(409).json({ error: allowance.error, code: 'DOSSIER_WEEKLY_LIMIT', opensAt: allowance.opensAt });
        }
      }
      activeStreamKey = `${serializeId(req.user.id)}:${serializeId(page._id)}`;
      if (activeWikiDraftStreams.has(activeStreamKey) && !isCompanyDossier(page)) {
        return res.status(409).json({
          error: 'Wiki maintenance already running.',
          code: 'WIKI_DRAFT_STREAM_IN_PROGRESS',
          pageId: serializeId(page._id)
        });
      }
      buildLease = await acquireRepoMaintenanceLease({ page, userId: req.user.id });
      if (buildLease && !buildLease.acquired) {
        return res.status(409).json({
          error: 'Wiki maintenance already running for this repository head.',
          code: 'REPO_WIKI_BUILD_IN_PROGRESS',
          pageId: serializeId(page._id)
        });
      }
      if (buildLease?.page) page = buildLease.page;
      repoHeadSha = buildLease?.headSha || '';
      if (!isCompanyDossier(page)) {
        activeWikiDraftStreams.set(activeStreamKey, Date.now());
        ownsActiveStreamKey = true;
      }
      let before = snapshotPage(page);
      const maintenanceOptions = readMaintenanceRequestOptions(req.body || {});
      if (isGitHubRepoWikiPage(page)) {
        maintenanceOptions.skipQualityRebuild = false;
      }
      openWikiDraftStream(res);

      if (isCompanyDossier(page)) {
        const secPrimaryPackAcquisition = await acquireSecPrimaryPackForDossier({
          page,
          userId: req.user.id
        });
        if (!secPrimaryPackAcquisition.skipped) {
          page = await savePageWithVersionRetry(page, req.user.id);
          writeSse(res, 'wiki-draft', {
            stage: secPrimaryPackAcquisition.stop
              ? 'sec_primary_pack_unavailable'
              : 'sec_primary_pack_checked',
            summary: secPrimaryPackAcquisition.stop?.message
              || (secPrimaryPackAcquisition.sourcesAdded
                ? `Attached ${secPrimaryPackAcquisition.sourcesAdded} additional SEC filing source${secPrimaryPackAcquisition.sourcesAdded === 1 ? '' : 's'}.`
                : 'The saved SEC filing pack is already current.'),
            sourceCount: Array.isArray(page.sourceRefs) ? page.sourceRefs.length : 0
          });
        }
        const companyFactsAcquisition = await acquireCompanyFactsForDossier({ page });
        if (!companyFactsAcquisition.skipped) {
          page = await savePageWithVersionRetry(page, req.user.id);
          writeSse(res, 'wiki-draft', {
            stage: companyFactsAcquisition.sourceRef
              ? 'operating_benchmark_attached'
              : 'operating_benchmark_unavailable',
            summary: companyFactsAcquisition.sourceRef
              ? 'Attached a free SEC Company Facts operating history.'
              : companyFactsAcquisition.stop?.message,
            sourceCount: Array.isArray(page.sourceRefs) ? page.sourceRefs.length : 0
          });
        }
        const officialProductAcquisition = await acquireOfficialProductSourcesForDossier({ page });
        if (!officialProductAcquisition.skipped) {
          page = await savePageWithVersionRetry(page, req.user.id);
          writeSse(res, 'wiki-draft', {
            stage: officialProductAcquisition.sourceRefs.length
              ? 'official_product_evidence_attached'
              : 'official_product_evidence_unavailable',
            summary: officialProductAcquisition.sourceRefs.length
              ? `Attached ${officialProductAcquisition.sourceRefs.length} verified official company source${officialProductAcquisition.sourceRefs.length === 1 ? '' : 's'}.`
              : officialProductAcquisition.stop?.message,
            sourceCount: Array.isArray(page.sourceRefs) ? page.sourceRefs.length : 0
          });
        }
        const competitorPrimaryAcquisition = await acquireCompetitorPrimaryForDossier({
          page,
          userId: req.user.id
        });
        if (!competitorPrimaryAcquisition.skipped) {
          page = await savePageWithVersionRetry(page, req.user.id);
          writeSse(res, 'wiki-draft', {
            stage: competitorPrimaryAcquisition.sourceRef
              ? 'competitor_primary_evidence_attached'
              : 'competitor_primary_evidence_unavailable',
            summary: competitorPrimaryAcquisition.sourceRef
              ? 'Attached a primary annual filing from a competitor explicitly named by the issuer.'
              : competitorPrimaryAcquisition.stop?.message,
            sourceCount: Array.isArray(page.sourceRefs) ? page.sourceRefs.length : 0
          });
        }
        const independentDomainAcquisition = await acquireIndependentDomainForDossier({ page });
        if (!independentDomainAcquisition.skipped) {
          page = await savePageWithVersionRetry(page, req.user.id);
          writeSse(res, 'wiki-draft', {
            stage: independentDomainAcquisition.sourceRef
              ? 'independent_domain_evidence_attached'
              : 'independent_domain_evidence_unavailable',
            summary: independentDomainAcquisition.sourceRef
              ? 'Attached a verified government or regulator benchmark for this SEC industry.'
              : independentDomainAcquisition.stop?.message,
            sourceCount: Array.isArray(page.sourceRefs) ? page.sourceRefs.length : 0
          });
        }
        const marketSnapshotAcquisition = await acquireMarketSnapshotForDossier({ page });
        if (!marketSnapshotAcquisition.skipped) {
          page = await savePageWithVersionRetry(page, req.user.id);
          writeSse(res, 'wiki-draft', {
            stage: marketSnapshotAcquisition.sourceRef
              ? 'market_snapshot_attached'
              : 'market_snapshot_unavailable',
            summary: marketSnapshotAcquisition.sourceRef
              ? 'Attached a dated public market price with source provenance.'
              : marketSnapshotAcquisition.stop?.message,
            sourceCount: Array.isArray(page.sourceRefs) ? page.sourceRefs.length : 0
          });
        }
        const evidenceCoverage = buildCompanyDossierEvidenceCoverage({ page });
        if (!evidenceCoverage.ready) {
          const priorDossier = page.investmentDossier?.toObject
            ? page.investmentDossier.toObject()
            : page.investmentDossier || {};
          const priorResearchPlan = priorDossier.researchPlan || {};
          page.investmentDossier = {
            ...priorDossier,
            researchPlan: {
              ...priorResearchPlan,
              status: 'research_incomplete',
              evidenceArchetypes: evidenceCoverage.observedEvidenceArchetypes,
              missingEvidenceArchetypes: evidenceCoverage.missingEvidenceArchetypes,
              updatedAt: new Date()
            }
          };
          page.markModified?.('investmentDossier');
          page.aiState = {
            ...(page.aiState?.toObject ? page.aiState.toObject() : page.aiState || {}),
            draftStatus: 'error',
            lastError: evidenceCoverage.message,
            errorCode: 'WIKI_DOSSIER_EVIDENCE_INCOMPLETE',
            lastCandidateSummary: '',
            lastCandidateQuality: {
              status: evidenceCoverage.status,
              metrics: evidenceCoverage
            }
          };
          page = await savePageWithVersionRetry(page, req.user.id);
          writeSse(res, 'wiki-page', {
            stage: 'evidence_incomplete',
            summary: evidenceCoverage.message,
            page: serializeWikiPage(page),
            evidenceCoverage
          });
          writeSse(res, 'done', {
            ok: false,
            code: 'WIKI_DOSSIER_EVIDENCE_INCOMPLETE',
            pageId: serializeId(page._id),
            evidenceCoverage
          });
          res.end();
          return;
        }
        if (evidenceCoverage.missingEvidenceArchetypes.length) {
          /* The writer names what could not be found instead of filling it. */
          const priorDossier = page.investmentDossier?.toObject
            ? page.investmentDossier.toObject()
            : page.investmentDossier || {};
          page.investmentDossier = {
            ...priorDossier,
            researchPlan: {
              ...(priorDossier.researchPlan || {}),
              evidenceArchetypes: evidenceCoverage.observedEvidenceArchetypes,
              missingEvidenceArchetypes: evidenceCoverage.missingEvidenceArchetypes
            }
          };
          page.markModified?.('investmentDossier');
        }
        before = snapshotPage(page);
      }

      const resumingDossier = isCompanyDossier(page) && (
        page.aiState?.errorCode === 'WIKI_BUILD_INTERRUPTED'
        || (Array.isArray(page.sourceRefs) && page.sourceRefs.length > 0 && !page.aiState?.lastDraftedAt)
      );
      const dossierBuildClaim = await createDossierBuildRun({
        WikiMaintenanceRun,
        page,
        userId: req.user.id,
        resume: resumingDossier
      });
      dossierBuildRun = dossierBuildClaim?.run || null;
      if (dossierBuildClaim && !dossierBuildClaim.acquired) {
        writeSse(res, 'wiki-draft', {
          stage: 'following_active_build',
          summary: 'Reconnected to the company dossier build already running.',
          runId: serializeId(dossierBuildRun._id)
        });
        const finalRun = await waitForDossierBuildRun({
          WikiMaintenanceRun,
          runId: dossierBuildRun._id,
          onPoll: current => writeSse(res, 'wiki-draft', {
            stage: current.metadata?.lastStage || 'heartbeat',
            summary: current.metadata?.stages?.at?.(-1)?.summary || 'The dossier build is still working.',
            runId: serializeId(dossierBuildRun._id)
          })
        });
        page = await findOwnedPage(req);
        if (page && ['completed', 'needs_review'].includes(finalRun?.status)) {
          const needsReview = finalRun.status === 'needs_review';
          writeSse(res, 'wiki-page', {
            stage: needsReview ? 'candidate_ready' : 'complete',
            summary: finalRun.summary || (needsReview
              ? 'The research candidate is ready for owner review.'
              : 'Company dossier build completed.'),
            page: serializeWikiPage(page)
          });
          writeSse(res, 'done', {
            ok: true,
            code: needsReview
              ? (page.aiState?.candidateStatus === 'awaiting_first_head_acceptance'
                  ? 'WIKI_FIRST_HEAD_AWAITING_ACCEPTANCE'
                  : 'WIKI_MAINTENANCE_AWAITING_ACCEPTANCE')
              : 'WIKI_DOSSIER_BUILD_COMPLETED',
            pageId: serializeId(page._id),
            reconnected: true
          });
        } else {
          writeSse(res, 'error', {
            error: finalRun?.status === 'timed_out'
              ? 'The active dossier build is taking longer than expected. Noeis will reconnect again.'
              : 'The active dossier build was interrupted. Noeis will resume from saved evidence.',
            code: finalRun?.status === 'timed_out'
              ? 'WIKI_DOSSIER_FOLLOW_TIMEOUT'
              : 'WIKI_BUILD_INTERRUPTED',
            retryable: true
          });
        }
        res.end();
        return;
      }
      if (dossierBuildClaim?.acquired) {
        const allowance = await dossierBuildAllowance({ WikiMaintenanceRun, userId: req.user.id, run: dossierBuildRun });
        if (!allowance.allowed) {
          await WikiMaintenanceRun.deleteOne({ _id: dossierBuildRun._id });
          writeSse(res, 'error', { error: allowance.error, code: 'DOSSIER_WEEKLY_LIMIT', opensAt: allowance.opensAt });
          res.end();
          return;
        }
      }
      if (dossierBuildClaim?.acquired && !activeWikiDraftStreams.has(activeStreamKey)) {
        activeWikiDraftStreams.set(activeStreamKey, Date.now());
        ownsActiveStreamKey = true;
      }
      if (dossierBuildRun) {
        heartbeatTimer = setInterval(() => {
          writeSse(res, 'wiki-draft', {
            stage: 'heartbeat',
            summary: 'The dossier build is still working.',
            runId: serializeId(dossierBuildRun._id)
          });
          touchDossierBuildRun({ run: dossierBuildRun })
            .catch(error => console.error('[dossier-build-heartbeat] failed:', error));
        }, 10000);
        heartbeatTimer.unref?.();
      }

      page.aiState = {
        ...(page.aiState?.toObject ? page.aiState.toObject() : page.aiState || {}),
        draftStatus: 'maintaining',
        draftRequestedAt: new Date(),
        draftStartedAt: new Date(),
        lastError: '',
        errorCode: '',
        ...(dossierBuildRun ? {
          build: {
            runId: serializeId(dossierBuildRun._id),
            resumable: true,
            resumed: resumingDossier,
            lastStage: 'starting',
            startedAt: dossierBuildRun.startedAt || new Date()
          }
        } : {})
      };
      page = await savePageWithVersionRetry(page, req.user.id);
      writeSse(res, 'wiki-page', {
        stage: 'maintaining',
        summary: 'Wiki maintenance started.',
        page: serializeWikiPage(page)
      });

      let stageWrite = Promise.resolve();
      const recordProgress = (event = {}) => {
        writeSse(res, 'wiki-draft', event);
        if (!dossierBuildRun || event.stage === 'model_streaming') return;
        stageWrite = stageWrite
          .then(() => recordDossierBuildStage({
            run: dossierBuildRun,
            stage: event.stage,
            summary: event.summary,
            attempt: event.attempt || 1,
            details: {
              sourceCount: event.sourceCount,
              claimCount: event.claimCount,
              failureCount: event.failureCount,
              model: event.model,
              provider: event.provider,
              errorCode: event.errorCode
            }
          }))
          .catch(error => console.error('[dossier-build-stage] failed:', error));
      };
      const publication = await runWikiMaintenanceCandidate({
        page,
        userId: req.user.id,
        WikiRevision,
        beforeSnapshot: before,
        requireFirstHeadAcceptance: /^company-dossier:/i.test(String(page?.createdFrom?.label || '')),
        requireOwnerAcceptance: Boolean(page?.investmentDossier?.version),
        maintainWikiPageFn: args => (
          dossierBuildRun
            ? withTransientRetries({
                attempts: 3,
                delaysMs: [1000, 3000],
                onAttempt: ({ attempt, total }) => recordDossierBuildStage({
                  run: dossierBuildRun,
                  stage: 'maintenance_attempt',
                  summary: attempt === 1
                    ? 'Building from saved SEC evidence.'
                    : `Retrying the interrupted build automatically (${attempt}/${total}).`,
                  attempt
                }),
                operation: () => maintainWikiPage(args)
              })
            : maintainWikiPage(args)
        ),
        maintainArgs: {
          wikiSchemaContent: await loadWikiSchemaContent(req.user.id),
          models: {
            Article,
            NotebookEntry,
            TagMeta,
            Question,
            WikiSourceEvent
          },
          maintenanceProfile: maintenanceOptions.maintenanceProfile,
          sourceLimit: maintenanceOptions.sourceLimit,
          sourceTextLimit: maintenanceOptions.sourceTextLimit,
          skipQualityRebuild: maintenanceOptions.skipQualityRebuild,
          streamDraft: maintenanceOptions.streamDraft || isCompanyDossier(page),
          resumeFromBestCandidate: Boolean(dossierBuildRun),
          onProgress: recordProgress
        }
      });
      await stageWrite;
      page = publication.page;

      if (!publication.promoted) {
        page = await savePageWithVersionRetry(page, req.user.id);
        if (publication.awaitingAcceptance) {
          await finishDossierBuildRun({
            run: dossierBuildRun,
            status: 'needs_review',
            summary: 'The first dossier candidate is ready for owner review.'
          });
          writeSse(res, 'wiki-page', {
            stage: 'candidate_ready',
            summary: 'The first research head is ready for explicit owner review.',
            page: serializeWikiPage(page),
            firstHeadReview: {
              status: 'awaiting_acceptance',
              kind: publication.reviewKind,
              revisionId: serializeId(publication.reviewRevision?._id),
              summary: publication.reviewKind === 'first_head'
                ? page.aiState?.firstHeadCandidateSummary || {}
                : page.aiState?.maintenanceCandidateSummary || {}
            }
          });
          writeSse(res, 'done', {
            ok: true,
            code: publication.reviewKind === 'first_head'
              ? 'WIKI_FIRST_HEAD_AWAITING_ACCEPTANCE'
              : 'WIKI_MAINTENANCE_AWAITING_ACCEPTANCE',
            pageId: serializeId(page._id)
          });
          res.end();
          return;
        }
        await finishDossierBuildRun({
          run: dossierBuildRun,
          status: 'failed',
          summary: 'The dossier did not reach the evidence bar.',
          errorMessage: publication.quality?.failures?.slice(0, 3).join(' ') || 'Not enough filing evidence was incorporated.'
        });
        if (buildLease?.acquired) {
          page = await releaseRepoBuildLease({
            WikiPage,
            pageId: page._id,
            userId: req.user.id,
            token: buildLease.token,
            headSha: repoHeadSha,
            generatorVersion: REPO_WIKI_GENERATOR_VERSION,
            status: 'needs_review',
            error: publication.quality?.failures?.slice(0, 3).join(' ') || 'Candidate did not pass quality.'
          }) || page;
          buildLease = null;
        }
        writeSse(res, 'wiki-page', {
          stage: 'quality_rejected',
          summary: 'The candidate missed the quality bar. The last trusted version is unchanged.',
          page: serializeWikiPage(page),
          quality: publication.quality
        });
        writeSse(res, 'done', {
          ok: false,
          code: 'WIKI_CANDIDATE_REJECTED',
          pageId: serializeId(page._id)
        });
        res.end();
        return;
      }

      const repoWikiPage = isGitHubRepoWikiPage(page);
      const shouldScheduleInboundAutolinks = !repoWikiPage && maintenanceOptions.deferInboundAutolinks;
      // Repo dossiers prioritize a bounded publication transaction over a
      // corpus-wide concept-link sweep. Their repository citations still sync.
      if (!repoWikiPage) {
        await applyAutolinksForPage(page, req.user.id, { limit: maintenanceOptions.inlineAutolinkLimit });
      }

      writeSse(res, 'wiki-page', {
        stage: 'drafted',
        summary: page.aiState?.maintenanceSummary || 'Wiki draft generated.',
        page: serializeWikiPage(page)
      });

      page = await savePageWithVersionRetry(page, req.user.id);
      writeSse(res, 'wiki-page', {
        stage: 'saved',
        summary: 'Wiki page saved.',
        page: serializeWikiPage(page)
      });

      await syncPageGraph(page, req.user.id);
      if (repoWikiPage) {
        writeSse(res, 'wiki-draft', {
          stage: 'graph_synced',
          summary: 'Repository source and citation connections synced.'
        });
      } else if (shouldScheduleInboundAutolinks) {
        writeSse(res, 'wiki-draft', {
          stage: 'inbound_links_deferred',
          summary: 'Backlinks will settle in the background while you start reading.'
        });
      } else {
        // AT-288: link this page FROM existing pages that mention its title (inbound).
        await autolinkPagesToTarget({ targetPage: page, userId: req.user.id });
        writeSse(res, 'wiki-draft', {
          stage: 'graph_synced',
          summary: 'Wiki graph connections synced.'
        });
      }

      await createWikiRevision({
        WikiRevision,
        userId: req.user.id,
        page,
        before,
        reason: 'agent_maintenance',
        actorType: 'agent',
        summary: page.aiState?.maintenanceSummary || `Maintained "${page.title}".`
      });
      await finishDossierBuildRun({
        run: dossierBuildRun,
        status: 'completed',
        summary: 'Company dossier build completed.'
      });
      if (buildLease?.acquired) {
        page = await releaseRepoBuildLease({
          WikiPage,
          pageId: page._id,
          userId: req.user.id,
          token: buildLease.token,
          headSha: repoHeadSha,
          generatorVersion: REPO_WIKI_GENERATOR_VERSION,
          status: 'ready',
          promoted: true
        }) || page;
        buildLease = null;
      }
      trackWikiEvent(req, EVENT_NAMES.WIKI_DRAFT_GENERATED, {
        pageId: serializeId(page._id),
        title: page.title,
        pageType: page.pageType,
        sourceCount: Array.isArray(page.sourceRefs) ? page.sourceRefs.length : 0,
        claimCount: Array.isArray(page.claims) ? page.claims.length : 0,
        stream: true
      });
      writeSse(res, 'wiki-page', {
        stage: 'complete',
        summary: page.aiState?.maintenanceSummary || 'Wiki maintenance completed.',
        page: serializeWikiPage(page)
      });
      writeSse(res, 'done', { ok: true, pageId: serializeId(page._id) });
      res.end();
      if (shouldScheduleInboundAutolinks) {
        scheduleInboundAutolinks({ targetPage: page, userId: req.user.id, sourcePageId: page._id });
      }
    } catch (error) {
      console.error('Error streaming wiki maintenance:', error);
      const modelBudgetUnavailable = Number(error?.status || error?.statusCode || 0) === 402;
      const interruptionMessage = modelBudgetUnavailable
        ? 'The configured research-model budget is unavailable. Add OpenRouter credits or lower the model budget, then Resume.'
        : 'The build was interrupted partway. Resume it to continue from saved SEC evidence.';
      const interruptionCode = modelBudgetUnavailable
        ? 'WIKI_MODEL_BUDGET_UNAVAILABLE'
        : 'WIKI_DRAFT_STREAM_FAILED';
      await recordDossierBuildStage({
        run: dossierBuildRun,
        stage: 'failed',
        summary: modelBudgetUnavailable
          ? 'The configured research-model budget was unavailable.'
          : 'The dossier build stopped before completion.',
        details: { errorCode: interruptionCode }
      }).catch(() => null);
      await finishDossierBuildRun({
        run: dossierBuildRun,
        status: 'failed',
        summary: modelBudgetUnavailable
          ? 'The research-model budget was unavailable; saved evidence was preserved.'
          : 'The dossier build was interrupted and can be resumed.',
        errorMessage: modelBudgetUnavailable
          ? interruptionMessage
          : error.message || 'The build stopped before completion.'
      }).catch(() => null);
      if (buildLease?.acquired && page) {
        await releaseRepoBuildLease({
          WikiPage,
          pageId: page._id,
          userId: req.user.id,
          token: buildLease.token,
          headSha: repoHeadSha,
          generatorVersion: REPO_WIKI_GENERATOR_VERSION,
          status: 'error',
          error: error.message || 'Wiki maintenance failed.'
        }).catch(() => null);
        buildLease = null;
      }
      if (!res.headersSent) {
        return res.status(500).json({ error: 'Failed to maintain wiki page.' });
      }
      if (page) {
        page.aiState = {
          ...(page.aiState?.toObject ? page.aiState.toObject() : page.aiState || {}),
          draftStatus: 'error',
          lastError: interruptionMessage,
          errorCode: interruptionCode
        };
        try {
          await savePageWithVersionRetry(page, req.user.id);
        } catch (_saveError) {
          // The stream error is the actionable failure for the client.
        }
      }
      writeSse(res, 'error', {
        error: interruptionMessage,
        code: interruptionCode,
        retryable: true
      });
      res.end();
    } finally {
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      if (activeStreamKey && ownsActiveStreamKey) activeWikiDraftStreams.delete(activeStreamKey);
    }
  });
};
