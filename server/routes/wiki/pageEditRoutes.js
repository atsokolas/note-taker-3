// Changing a page: edits, judgment snapshots, accepting public proof, deletion.
const { validatePageType, validateEnumField } = require('../../services/wikiSourceRefs');
const {
  STATUSES,
  VISIBILITIES,
  SOURCE_SCOPES,
  normalizeTitle,
  normalizeBodyDoc,
  clonePlain,
  serializeId,
  serializeWikiPage,
  emptyDoc
} = require('../../services/wikiPageShape');
const { isResearchEditionPage, isResearchOperatingLedgerPage } = require('../../services/wikiProtectedArtifactService');
const { snapshotPage, createWikiRevision } = require('../../services/wikiRevisionService');
const { normalizeJudgment, normalizeClaimUpdates, JudgmentValidationError } = require('../../services/wikiJudgmentService');
const { isWikiPageSurfaceEligible } = require('../../services/wikiPageQualityGuard');
const { docText } = require('../../lib/editorialText');
const { ensureHeldClaim } = require('../../services/heldClaim');
const { applyFalsifiability } = require('../../services/claimFalsifiability');
const { appendShareReceipt } = require('../../services/judgmentPublicProjection');
const { folioHash } = require('../../services/casebookLineageService');
const { normalizeComparableText, pageIsRepoWiki, mergePageRecords } = require('../../services/wikiDedupeService');
const mongoose = require('mongoose');
const { persistNoeisReceipt } = require('../../services/noeisReceiptService');
const { requireHumanReader } = require('../../services/agentTokenService');
const { buildAlphabetPublicProofAcceptance } = require('../../services/wikiPublicProofAcceptanceService');
const { buildPublicProofGrade } = require('../../services/publicProofService');
const { buildRepoComparison } = require('../../services/wikiRepoComparisonService');
const { buildRepoPublicProofAcceptance, serializeRepoAcceptancePreview } = require('../../services/wikiRepoPublicProofAcceptanceService');
const { activeCompanyDossierKey } = require('../../services/companyDossierService');

module.exports = (router, {
  EVENT_NAMES,
  NoeisReceipt,
  WikiMaintenanceRun,
  WikiPage,
  WikiRepoBaseline,
  WikiRevision,
  WikiSourceEvent,
  buildUniqueSlug,
  fetchGitHubRepoHead,
  findOwnedPage,
  publicPageCache,
  refreshPageClaims,
  restorePageSnapshot,
  syncPageGraph,
  trackWikiEvent,
  wikiAuth
}) => {
  router.patch('/api/wiki/pages/:id', wikiAuth, async (req, res) => {
    try {
      const enumChecks = [
        validatePageType(req.body?.pageType),
        validateEnumField('status', req.body?.status, STATUSES),
        validateEnumField('visibility', req.body?.visibility, VISIBILITIES),
        validateEnumField('sourceScope', req.body?.sourceScope, SOURCE_SCOPES)
      ];
      const invalidEnum = enumChecks.find(result => result?.error);
      if (invalidEnum) return res.status(400).json({ error: invalidEnum.error });

      const page = await findOwnedPage(req);
      if (!page) return res.status(404).json({ error: 'Wiki page not found.' });
      const weekendReadingsPage = isResearchEditionPage(page);
      const researchLedgerPage = isResearchOperatingLedgerPage(page);
      if (weekendReadingsPage && enumChecks[2]?.value === 'shared') {
        return res.status(409).json({
          error: 'Weekend Readings must be reviewed, approved, and published through its revision-bound publication controls.'
        });
      }
      if (researchLedgerPage && enumChecks[2]?.value === 'shared') {
        return res.status(409).json({ error: 'Research operating ledgers are permanently private.' });
      }
      // Making a page public is the reader's call, like every other share.
      if (req.agentToken && enumChecks[2]?.value === 'shared') {
        return res.status(403).json({ error: 'Only you can share a page publicly, not an agent.' });
      }
      const before = snapshotPage(page);
      const actorType = req.agentToken ? 'agent' : 'user';
      const normalizedJudgment = req.body?.judgment !== undefined
        ? normalizeJudgment({ input: req.body.judgment, existing: page.judgment, actorType, pageId: String(page._id) })
        : null;
      const claimUpdates = req.body?.claimUpdates !== undefined
        ? normalizeClaimUpdates(req.body.claimUpdates)
        : [];

      if (req.body?.title !== undefined) {
        page.title = normalizeTitle(req.body.title);
        page.slug = await buildUniqueSlug(req.user.id, page.title, page._id);
      }
      if (enumChecks[0]?.value) page.pageType = enumChecks[0].value;
      if (enumChecks[1]?.value) page.status = enumChecks[1].value;
      if (enumChecks[2]?.value === 'shared' && !isWikiPageSurfaceEligible(page)) {
        return res.status(422).json({
          error: 'Fix or archive this page before sharing it publicly.'
        });
      }
      if (enumChecks[2]?.value) page.visibility = enumChecks[2].value;
      if (enumChecks[3]?.value) page.sourceScope = enumChecks[3].value;
      /* Evergreen is the reader's own declaration, so an agent token cannot
         set it. Everything else about a page can be proposed; whether you
         keep something for life cannot be. */
      if (req.body?.evergreen !== undefined) {
        if (actorType === 'agent') {
          return res.status(403).json({ error: 'Only the reader can mark a page evergreen.' });
        }
        if (typeof req.body.evergreen !== 'boolean') {
          return res.status(400).json({ error: 'evergreen must be true or false.' });
        }
        page.evergreen = req.body.evergreen;
        page.evergreenAt = req.body.evergreen ? (page.evergreenAt || new Date()) : null;
      }
      if (req.body?.body !== undefined) {
        const nextBody = normalizeBodyDoc(req.body.body);
        if (!nextBody) {
          return res.status(400).json({ error: 'body must be a TipTap JSON object or a non-empty string.' });
        }
        page.body = nextBody;
        page.plainText = docText(nextBody);
      }
      if (req.body?.body !== undefined) refreshPageClaims(page);
      if (normalizedJudgment) {
        page.judgment = normalizedJudgment;
        if (typeof page.markModified === 'function') page.markModified('judgment');
        if (actorType === 'user') ensureHeldClaim(page, { now: new Date(), actorType });
      }
      if (claimUpdates.length) {
        if (actorType === 'user') ensureHeldClaim(page, { now: new Date(), actorType });
        const claimById = new Map((page.claims || []).map(claim => [String(claim.claimId), claim]));
        for (const update of claimUpdates) {
          const claim = claimById.get(update.claimId);
          if (!claim) return res.status(400).json({ error: `Unknown claimId: ${update.claimId}.` });
          const criteriaChanged = update.resolutionCriteria !== undefined
            || update.horizon !== undefined;
          if (criteriaChanged) applyFalsifiability(claim, update);
          const changed = claim.epistemicStatus !== update.epistemicStatus
            || claim.materiality !== update.materiality
            || claim.implication !== update.implication
            || JSON.stringify(claim.falsifierIds || []) !== JSON.stringify(update.falsifierIds || [])
            || criteriaChanged;
          if (!changed) continue;
          claim.epistemicStatus = update.epistemicStatus;
          claim.materiality = update.materiality;
          claim.implication = update.implication;
          claim.falsifierIds = update.falsifierIds;
          claim.history.push({
            at: new Date(),
            event: 'epistemic_review',
            support: claim.support || 'unsupported',
            text: claim.text || '',
            section: claim.section || '',
            confidence: claim.confidence,
            epistemicStatus: update.epistemicStatus,
            disposition: update.epistemicStatus === 'rejected' ? 'rejected' : 'accepted',
            reason: 'Owner updated the claim judgment contract.',
            actorType
          });
        }
        if (typeof page.markModified === 'function') page.markModified('claims');
      }

      const wasShared = String(before?.visibility || '') === 'shared';
      const nowShared = String(page.visibility || '') === 'shared';
      const held = String(page?.judgment?.currentJudgment || '').trim();
      if (held) {
        if (!wasShared && nowShared) appendShareReceipt(page, 'published', folioHash(page));
        else if (wasShared && !nowShared) appendShareReceipt(page, 'revoked', folioHash(page));
        else if (wasShared && nowShared && req.body?.judgment !== undefined) {
          appendShareReceipt(page, 'corrected', folioHash(page));
        }
      }

      const comparableJudgment = normalizeComparableText(page?.judgment?.currentJudgment);
      if (comparableJudgment) {
        const judgmentPages = await WikiPage.find({
          userId: req.user.id,
          _id: { $ne: page._id },
          status: { $ne: 'archived' },
          'judgment.currentJudgment': { $exists: true, $ne: '' }
        }).select('_id title judgment.currentJudgment').limit(500);
        const match = (Array.isArray(judgmentPages) ? judgmentPages : [])
          .find(candidate => (
            !pageIsRepoWiki(candidate)
            && normalizeComparableText(candidate?.judgment?.currentJudgment) === comparableJudgment
          ));
        if (match) {
          const canonicalPage = await WikiPage.findOne({ _id: match._id, userId: req.user.id });
          if (!canonicalPage) return res.status(409).json({ error: 'The matching judgment could not be reopened.' });

          const canonicalBefore = snapshotPage(canonicalPage);
          const mergedAt = new Date();
          const merged = mergePageRecords([canonicalPage, page], { canonicalPage, mergedAt });
          ['sourceRefs', 'citations', 'claims', 'judgment', 'aiState'].forEach((field) => {
            canonicalPage[field] = clonePlain(merged[field]);
            if (typeof canonicalPage.markModified === 'function') canonicalPage.markModified(field);
          });
          page.status = 'archived';
          page.archived = true;
          page.hiddenFromHome = true;
          page.aiState = {
            ...(page.aiState?.toObject ? page.aiState.toObject() : page.aiState || {}),
            build: {
              ...(page.aiState?.build?.toObject ? page.aiState.build.toObject() : page.aiState?.build || {}),
              dedupeRedirect: {
                canonicalPageId: serializeId(canonicalPage._id),
                mergedAt: mergedAt.toISOString()
              }
            }
          };
          if (typeof page.markModified === 'function') page.markModified('aiState');

          const persistMerge = async (session = null) => {
            await canonicalPage.save(session ? { session } : undefined);
            await page.save(session ? { session } : undefined);
          };
          if (mongoose.connection?.readyState === 1 && typeof mongoose.connection.transaction === 'function') {
            await mongoose.connection.transaction(persistMerge);
          } else {
            await persistMerge();
          }

          publicPageCache.invalidate(serializeId(canonicalPage._id), canonicalBefore?.slug, canonicalPage.slug);
          publicPageCache.invalidate(serializeId(page._id), before?.slug, page.slug);
          await syncPageGraph(canonicalPage, req.user.id);
          await syncPageGraph(page, req.user.id);
          await createWikiRevision({
            WikiRevision,
            userId: req.user.id,
            page: canonicalPage,
            before: canonicalBefore,
            reason: 'user_edit',
            actorType,
            summary: `Merged the redundant judgment page "${page.title}" into this case.`
          });
          await createWikiRevision({
            WikiRevision,
            userId: req.user.id,
            page,
            before,
            reason: 'archived',
            actorType,
            summary: `Merged this redundant judgment into "${canonicalPage.title}".`
          });
          return res.status(200).json({
            ...serializeWikiPage(canonicalPage),
            dedupe: {
              canonicalPageId: serializeId(canonicalPage._id),
              mergedPageId: serializeId(page._id),
              mergedAt: mergedAt.toISOString()
            }
          });
        }
      }

      await page.save();
      const heldBefore = String(before?.judgment?.currentJudgment || '').trim();
      if (held !== heldBefore) {
        trackWikiEvent(req, heldBefore ? EVENT_NAMES.VIEW_REVISED : EVENT_NAMES.VIEW_HELD, {
          pageId: serializeId(page._id),
          actorType
        });
      }
      publicPageCache.invalidate(serializeId(page._id), before?.slug, page.slug);
      await syncPageGraph(page, req.user.id);
      const revision = await createWikiRevision({
        WikiRevision,
        userId: req.user.id,
        page,
        before,
        reason: 'user_edit',
        actorType,
        summary: `Updated "${page.title}".`
      });
      const decisionsChanged = JSON.stringify(before?.judgment?.decisions || [])
        !== JSON.stringify(snapshotPage(page)?.judgment?.decisions || []);
      if (decisionsChanged) {
        await persistNoeisReceipt({
          NoeisReceipt,
          userId: req.user.id,
          receipt: {
            id: `judgment-decision:${serializeId(page._id)}:${serializeId(revision?._id)}`,
            kind: 'judgment_decision_recorded',
            source: actorType === 'agent' ? 'agent' : 'wiki',
            sourceLabel: 'Living thesis decision ledger',
            status: 'completed',
            summary: 'Decision record saved; no external action executed.',
            completedAt: new Date(),
            touched: [{ type: 'wiki_page', id: serializeId(page._id), label: page.title }]
          }
        });
      }
      res.status(200).json(serializeWikiPage(page));
    } catch (error) {
      if (error instanceof JudgmentValidationError) return res.status(error.statusCode).json({ error: error.message });
      console.error('Error updating wiki page:', error);
      res.status(500).json({ error: 'Failed to update wiki page.' });
    }
  });

  router.post('/api/wiki/pages/:id/judgment/initial-snapshot', wikiAuth, async (req, res) => {
    const revisionId = new mongoose.Types.ObjectId();
    let reservedPage = null;
    try {
      if (req.agentToken) return res.status(403).json({ error: 'Only the human owner can preserve the initial judgment.' });
      if (!WikiRevision) return res.status(503).json({ error: 'Wiki revisions are not available.' });
      const existing = await findOwnedPage(req).lean();
      if (!existing) return res.status(404).json({ error: 'Wiki page not found.' });
      // A claim with reasons is a judgment contract too, kind or no kind.
      if (!existing.judgment?.kind && !existing.judgment?.currentJudgment) {
        return res.status(400).json({ error: 'This page does not have a judgment contract.' });
      }
      if (existing.judgment?.initialRevisionId) {
        return res.status(409).json({ error: 'The initial judgment has already been saved.', initialRevisionId: serializeId(existing.judgment.initialRevisionId) });
      }
      reservedPage = await WikiPage.findOneAndUpdate(
        { _id: req.params.id, userId: req.user.id, 'judgment.initialRevisionId': null },
        { $set: { 'judgment.initialRevisionId': revisionId } },
        { new: true, runValidators: true }
      );
      if (!reservedPage) return res.status(409).json({ error: 'The initial judgment has already been saved.' });
      const revision = await createWikiRevision({
        WikiRevision,
        revisionId,
        userId: req.user.id,
        page: reservedPage,
        reason: 'user_edit',
        actorType: 'user',
        summary: 'Preserved the initial judgment as a day-zero belief snapshot.'
      });
      await persistNoeisReceipt({
        NoeisReceipt,
        userId: req.user.id,
        receipt: {
          id: `judgment-initial:${serializeId(reservedPage._id)}:${serializeId(revision._id)}`,
          kind: 'judgment_initial_snapshot',
          source: 'wiki',
          sourceLabel: 'Living thesis',
          status: 'completed',
          summary: 'Initial judgment preserved. This records the starting belief; it does not prove the thesis.',
          completedAt: new Date(),
          touched: [{ type: 'wiki_page', id: serializeId(reservedPage._id), label: reservedPage.title }]
        }
      });
      res.status(201).json({ page: serializeWikiPage(reservedPage), revisionId: serializeId(revision._id) });
    } catch (error) {
      if (reservedPage) {
        await WikiPage.updateOne(
          { _id: reservedPage._id, userId: req.user.id, 'judgment.initialRevisionId': revisionId },
          { $set: { 'judgment.initialRevisionId': null } }
        ).catch(() => null);
      }
      console.error('Error saving initial judgment:', error);
      res.status(500).json({ error: 'Failed to save the initial judgment.' });
    }
  });

  router.post('/api/wiki/pages/:id/judgment/initial-snapshot/restore', wikiAuth, async (req, res) => {
    try {
      if (req.agentToken) return res.status(403).json({ error: 'Only the human owner can restore the initial judgment.' });
      if (!WikiRevision) return res.status(503).json({ error: 'Wiki revisions are not available.' });
      const page = await findOwnedPage(req);
      if (!page) return res.status(404).json({ error: 'Wiki page not found.' });
      const initialRevisionId = page.judgment?.initialRevisionId;
      if (!initialRevisionId) return res.status(404).json({ error: 'No initial judgment snapshot exists.' });
      const revision = await WikiRevision.findOne({ _id: initialRevisionId, userId: req.user.id, pageId: page._id }).lean();
      if (!revision?.after) return res.status(409).json({ error: 'The initial judgment snapshot is unavailable.' });
      const beforeRestore = snapshotPage(page);
      restorePageSnapshot(page, revision.after);
      if (page.judgment) page.judgment.initialRevisionId = initialRevisionId;
      await page.save();
      await syncPageGraph(page, req.user.id);
      await createWikiRevision({
        WikiRevision,
        userId: req.user.id,
        page,
        before: beforeRestore,
        reason: 'user_edit',
        actorType: 'user',
        summary: 'Restored the page to its preserved initial judgment.'
      });
      res.status(200).json({ page: serializeWikiPage(page), restoredRevisionId: serializeId(initialRevisionId) });
    } catch (error) {
      console.error('Error restoring initial judgment:', error);
      res.status(500).json({ error: 'Failed to restore the initial judgment.' });
    }
  });

  router.post('/api/wiki/pages/:id/public-proof/accept', wikiAuth, requireHumanReader, async (req, res) => {
    try {
      if (!WikiSourceEvent || !WikiRevision) {
        return res.status(503).json({ error: 'Public proof acceptance records are not available.' });
      }
      const page = await findOwnedPage(req);
      if (!page) return res.status(404).json({ error: 'Wiki page not found.' });
      const requestedClocks = Array.isArray(req.body?.acceptedClocks) ? req.body.acceptedClocks : [];
      const sourceEventIds = requestedClocks.map(clock => clock?.sourceEventId).filter(Boolean);
      const revisionIds = requestedClocks.map(clock => clock?.revisionId).filter(Boolean);
      const [events, revisions] = await Promise.all([
        WikiSourceEvent.find({ _id: { $in: sourceEventIds }, userId: req.user.id }).lean(),
        WikiRevision.find({ _id: { $in: revisionIds }, userId: req.user.id, pageId: page._id }).lean()
      ]);
      const decision = buildAlphabetPublicProofAcceptance({
        page,
        requestedClocks,
        events,
        revisions,
        reason: req.body?.reason,
        now: new Date()
      });
      if (!decision.ok) return res.status(422).json({ error: 'Alphabet public proof is not ready for acceptance.', gaps: decision.errors });

      const pageSnapshot = page.toObject ? page.toObject({ virtuals: false }) : { ...page };
      const publishAsFlagship = req.body?.publishAsFlagship === true;
      const candidatePage = {
        ...pageSnapshot,
        publicProof: decision.record,
        ...(publishAsFlagship ? { visibility: 'shared', status: 'published' } : {})
      };
      const proofGrade = buildPublicProofGrade({ slot: { key: 'alphabet' }, page: candidatePage });
      const ready = proofGrade.grade === 'proven' && proofGrade.criteria?.explicitlyAccepted === true;
      if (req.body?.confirm !== true) {
        return res.status(200).json({ dryRun: true, ready, publishAsFlagship, proofGrade });
      }
      if (req.body?.decision !== 'accept_alphabet_public_proof') {
        return res.status(400).json({ error: 'Set decision to accept_alphabet_public_proof for a confirmed acceptance.' });
      }
      if (!ready) return res.status(422).json({ error: 'Alphabet public proof criteria are incomplete.', proofGrade });

      const clockSignature = clocks => (Array.isArray(clocks) ? clocks : [])
        .map(clock => `${clock?.type || ''}:${clock?.sourceEventId || ''}:${clock?.revisionId || ''}`)
        .sort()
        .join('|');
      if (page.publicProof?.grade === 'proven'
        && clockSignature(page.publicProof?.acceptedClocks) === clockSignature(decision.record.acceptedClocks)
        && (!publishAsFlagship || (page.visibility === 'shared' && page.status === 'published'))) {
        const existingProofGrade = buildPublicProofGrade({ slot: { key: 'alphabet' }, page });
        return res.status(200).json({
          dryRun: false,
          ready: true,
          unchanged: true,
          publishedAsFlagship: page.visibility === 'shared' && page.status === 'published',
          proofGrade: existingProofGrade
        });
      }

      const before = snapshotPage(page);
      page.publicProof = decision.record;
      if (publishAsFlagship) {
        page.visibility = 'shared';
        page.status = 'published';
      }
      if (typeof page.markModified === 'function') page.markModified('publicProof');
      await page.save();
      await createWikiRevision({
        WikiRevision,
        userId: req.user.id,
        page,
        before,
        reason: 'user_edit',
        actorType: 'user',
        summary: 'Accepted the Alphabet dossier as filing-maintained public proof after editorial review.'
      });
      res.status(200).json({
        dryRun: false,
        ready: true,
        publishedAsFlagship: publishAsFlagship,
        proofGrade
      });
    } catch (error) {
      console.error('Error accepting Alphabet public proof:', error);
      res.status(500).json({ error: 'Failed to accept Alphabet public proof.' });
    }
  });

  router.post('/api/wiki/pages/:id/public-proof/accept-repo-comparison', wikiAuth, requireHumanReader, async (req, res) => {
    try {
      if (!WikiRepoBaseline || !WikiSourceEvent || !WikiRevision || !WikiMaintenanceRun) {
        return res.status(503).json({ error: 'Repository public proof acceptance records are not available.' });
      }
      const page = await findOwnedPage(req);
      if (!page) return res.status(404).json({ error: 'Wiki page not found.' });
      const repoWatch = page.externalWatches?.githubRepo || {};
      let liveRepoHead;
      try {
        liveRepoHead = await fetchGitHubRepoHead({ owner: repoWatch.owner, repo: repoWatch.repo });
      } catch (error) {
        console.error('Error verifying live GitHub head for repository public proof:', error);
        return res.status(503).json({ error: 'Could not verify the live GitHub repository head. Acceptance was not evaluated.' });
      }
      const baseline = await WikiRepoBaseline.findOne({ userId: req.user.id, pageId: page._id }).lean();
      if (!baseline) return res.status(422).json({ error: 'Repository public proof requires an immutable baseline.' });
      const runs = await WikiMaintenanceRun.find({ userId: req.user.id, pageId: page._id }).sort({ createdAt: -1 }).limit(50).lean();
      const comparison = buildRepoComparison({ baseline, page, maintenanceRuns: runs });
      const sourceEventId = page.freshness?.acceptedThrough?.sourceEventId || null;
      const [sourceEvent, revision, maintenanceRun] = sourceEventId ? await Promise.all([
        WikiSourceEvent.findOne({ _id: sourceEventId, userId: req.user.id }).lean(),
        WikiRevision.findOne({ userId: req.user.id, pageId: page._id, sourceEventId, promotionStatus: 'promoted' }).sort({ createdAt: -1 }).lean(),
        WikiMaintenanceRun.findOne({ userId: req.user.id, pageId: page._id, sourceEventId, status: 'completed' }).sort({ createdAt: -1 }).lean()
      ]) : [null, null, null];
      const decision = buildRepoPublicProofAcceptance({
        page,
        baseline,
        comparison,
        sourceEvent,
        revision,
        maintenanceRun,
        liveHeadSha: liveRepoHead?.headSha,
        reason: req.body?.reason,
        now: new Date()
      });
      if (!decision.ok) {
        return res.status(422).json({
          error: 'Repository public proof is not ready for acceptance.',
          gaps: decision.errors,
          acceptance: decision.proofPulse?.acceptance || null
        });
      }

      const pageSnapshot = page.toObject ? page.toObject({ virtuals: false }) : { ...page };
      const publishAsFlagship = req.body?.publishAsFlagship === true;
      const candidatePage = {
        ...pageSnapshot,
        publicProof: decision.record,
        ...(publishAsFlagship ? { visibility: 'shared', status: 'published' } : {})
      };
      const proofGrade = buildPublicProofGrade({ slot: { key: 'noeis-repo' }, page: candidatePage });
      const ready = proofGrade.grade === 'proven' && proofGrade.criteria?.explicitlyAccepted === true;
      const acceptancePreview = serializeRepoAcceptancePreview(decision.record, decision.proofPulse);
      if (req.body?.confirm !== true) {
        return res.status(200).json({ dryRun: true, ready, publishAsFlagship, proofGrade, acceptancePreview });
      }
      if (req.body?.decision !== 'accept_repo_public_proof') {
        return res.status(400).json({ error: 'Set decision to accept_repo_public_proof for a confirmed acceptance.' });
      }
      if (!ready) return res.status(422).json({ error: 'Repository public proof criteria are incomplete.', proofGrade });

      if (page.publicProof?.grade === 'proven'
        && page.publicProof?.acceptedEventId === decision.record.acceptedEventId
        && (!publishAsFlagship || (page.visibility === 'shared' && page.status === 'published'))) {
        return res.status(200).json({
          dryRun: false,
          ready: true,
          unchanged: true,
          publishedAsFlagship: page.visibility === 'shared' && page.status === 'published',
          proofGrade: buildPublicProofGrade({ slot: { key: 'noeis-repo' }, page }),
          acceptancePreview
        });
      }

      const before = snapshotPage(page);
      page.publicProof = decision.record;
      if (publishAsFlagship) {
        page.visibility = 'shared';
        page.status = 'published';
      }
      if (typeof page.markModified === 'function') page.markModified('publicProof');
      await page.save();
      await createWikiRevision({
        WikiRevision,
        userId: req.user.id,
        page,
        before,
        reason: 'user_edit',
        actorType: 'user',
        sourceEventId,
        maintenanceRunId: maintenanceRun._id,
        summary: 'Accepted the repository comparison as public proof after claim-level editorial review.'
      });
      res.status(200).json({
        dryRun: false,
        ready: true,
        publishedAsFlagship: publishAsFlagship,
        proofGrade,
        acceptancePreview
      });
    } catch (error) {
      console.error('Error accepting repository public proof:', error);
      res.status(500).json({ error: 'Failed to accept repository public proof.' });
    }
  });

  router.delete('/api/wiki/pages/:id', wikiAuth, async (req, res) => {
    try {
      const page = await WikiPage.findOne({ _id: req.params.id, userId: req.user.id });
      if (!page) return res.status(404).json({ error: 'Wiki page not found.' });
      const before = snapshotPage(page);
      page.status = 'archived';
      page.archived = true;
      page.activeCompanyDossierKey = undefined;
      await page.save();
      publicPageCache.invalidate(serializeId(page._id), before?.slug, page.slug);
      await syncPageGraph({
        _id: page._id,
        userId: page.userId,
        body: emptyDoc(),
        sourceRefs: []
      }, req.user.id);
      await createWikiRevision({
        WikiRevision,
        userId: req.user.id,
        page,
        before,
        reason: 'archived',
        actorType: 'user',
        summary: `Archived "${page.title}".`
      });
      res.status(200).json(serializeWikiPage(page));
    } catch (_error) {
      res.status(400).json({ error: 'Invalid wiki page id.' });
    }
  });
};
