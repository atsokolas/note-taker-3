// A wiki page built from a GitHub repository.
const { parseGitHubRepo: parseGitHubRepoWatchInput } = require('../../services/githubRepoWatcherService');
const {
  normalizeTitle,
  normalizeBodyDoc,
  normalizeCreatedFrom,
  serializeId,
  serializeWikiPage
} = require('../../services/wikiPageShape');
const { buildRepoWikiTitle } = require('../../services/wikiPresentationGuard');
const { docText } = require('../../lib/editorialText');
const { createWikiRevision, snapshotPage } = require('../../services/wikiRevisionService');
const { attachSourceEventsToPageRefs, markWikiSourceEventFinished } = require('../../services/wikiSourceRefs');
const { acquireRepoBuildLease, releaseRepoBuildLease } = require('../../services/wikiRepoBuildLeaseService');
const { REPO_WIKI_GENERATOR_VERSION } = require('../../services/repoWikiGeneratorVersion');
const { runWikiMaintenanceCandidate } = require('../../services/wikiMaintenancePublicationService');

module.exports = (router, {
  Article,
  EVENT_NAMES,
  NotebookEntry,
  Question,
  TagMeta,
  WikiPage,
  WikiRevision,
  WikiSourceEvent,
  armGitHubRepoWatchForPage,
  buildUniqueSlug,
  loadWikiSchemaContent,
  maintainWikiPage,
  refreshPageClaims,
  savePageWithVersionRetry,
  syncPageGraph,
  trackWikiEvent,
  wikiAuth
}) => {
  router.post('/api/wiki/pages/from-github', wikiAuth, async (req, res) => {
    try {
      const repoInput = String(req.body?.repo || req.body?.repoUrl || '').trim();
      const owner = String(req.body?.owner || '').trim();
      const repoName = String(req.body?.repoName || '').trim();
      if (!repoInput && (!owner || !repoName)) {
        return res.status(400).json({ error: 'repo or owner/repoName is required.' });
      }
      const parsedRepo = repoInput
        ? parseGitHubRepoWatchInput(repoInput)
        : parseGitHubRepoWatchInput(`${owner}/${repoName}`);
      const ownerKey = parsedRepo.owner.toLowerCase();
      const repoKey = parsedRepo.repo.toLowerCase();
      const fullName = `${ownerKey}/${repoKey}`;
      const repoUrl = `https://github.com/${fullName}`;
      const title = normalizeTitle(req.body?.title || buildRepoWikiTitle(fullName));
      const body = normalizeBodyDoc(req.body?.body) || {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [{
                type: 'text',
                text: `${fullName} is a public GitHub repository. This page will be rebuilt from repository evidence: package files, entrypoints, workflows, docs, releases, recent commits, and the generated code inventory.`
              }]
            },
            {
              type: 'heading',
              attrs: { level: 2 },
              content: [{ type: 'text', text: 'Developer quickstart' }]
            },
            {
              type: 'paragraph',
              content: [{
                type: 'text',
                text: 'The first maintenance pass should replace this seed with concrete run commands, proof commands, architecture paths, critical flows, and unknowns supported by attached repository sources.'
              }]
            }
          ]
        };
      const createdFrom = normalizeCreatedFrom({
        ...(req.body?.createdFrom && typeof req.body.createdFrom === 'object' ? req.body.createdFrom : {}),
        type: 'search',
        text: repoUrl,
        label: `GitHub repo: ${fullName}`
      });
      const existingCandidates = await WikiPage.find({
        userId: req.user.id,
        status: { $ne: 'archived' }
      }).sort({ updatedAt: -1 }).limit(120);
      const existingPage = (Array.isArray(existingCandidates) ? existingCandidates : []).find((candidate) => {
        const watch = candidate.externalWatches?.githubRepo || {};
        const watchedIdentity = `${String(watch.owner || '').toLowerCase()}/${String(watch.repo || '').toLowerCase()}`;
        const createdLabel = String(candidate.createdFrom?.label || '').toLowerCase();
        const createdText = String(candidate.createdFrom?.text || '').replace(/\/$/, '').toLowerCase();
        return watchedIdentity === `${ownerKey}/${repoKey}`
          || createdLabel === `github repo: ${ownerKey}/${repoKey}`
          || createdText === repoUrl.toLowerCase();
      }) || null;
      const action = existingPage ? 'updated' : 'created';
      const page = existingPage || new WikiPage({
        userId: req.user.id,
        title,
        slug: await buildUniqueSlug(req.user.id, title),
        pageType: 'repo',
        status: 'draft',
        visibility: 'private',
        sourceScope: 'selected_sources',
        createdFrom,
        body,
        plainText: docText(body),
        sourceRefs: []
      });
      if (existingPage) {
        if (req.body?.title) page.title = title;
        page.pageType = 'repo';
        page.createdFrom = createdFrom;
      } else {
        refreshPageClaims(page);
      }
      await page.save();
      if (action === 'created') {
        await syncPageGraph(page, req.user.id);
        await createWikiRevision({
          WikiRevision,
          userId: req.user.id,
          page,
          reason: 'created',
          actorType: 'user',
          summary: `Created "${page.title}".`
        });
        trackWikiEvent(req, EVENT_NAMES.WIKI_PAGE_CREATED, {
          pageId: serializeId(page._id),
          title: page.title,
          pageType: page.pageType,
          sourceCount: 0,
          sourceScope: page.sourceScope,
          sourceType: 'github_repo'
        });
      }
      let result = { page, snapshot: null, events: [] };
      let watchError = null;
      try {
        result = await armGitHubRepoWatchForPage({
          WikiPage,
          WikiSourceEvent,
          userId: req.user.id,
          pageId: page._id,
          repo: fullName,
          checkNow: req.body?.checkNow !== false
        });
        if (Array.isArray(result.events) && result.events.length) {
          result.page = await attachSourceEventsToPageRefs({
            page: result.page,
            events: result.events,
            limit: 48
          });
        }
        trackWikiEvent(req, EVENT_NAMES.WIKI_SOURCE_ATTACHED, {
          pageId: serializeId(result.page?._id || page._id),
          title: result.page?.title || page.title,
          pageType: result.page?.pageType || page.pageType,
          sourceCount: Array.isArray(result.events) ? result.events.length : 0,
          sourceType: 'github_repo'
        });
      } catch (error) {
        watchError = {
          message: error.message || 'Failed to arm GitHub repo watch.',
          statusCode: error.statusCode || 500
        };
        trackWikiEvent(req, EVENT_NAMES.WIKI_SOURCE_ATTACHED, {
          pageId: serializeId(page._id),
          title: page.title,
          pageType: page.pageType,
          sourceCount: 0,
          sourceType: 'github_repo',
          status: 'failed',
          error: watchError.message
        });
      }
      const hasRepoEvidenceForBuild = Array.isArray(result.events) && result.events.length
        ? true
        : Array.isArray(result.page?.sourceRefs) && result.page.sourceRefs.length > 0;
      if (!watchError && result.buildRequired !== false && hasRepoEvidenceForBuild) {
        let buildLease = null;
        try {
          buildLease = await acquireRepoBuildLease({
            WikiPage,
            pageId: result.page._id,
            userId: req.user.id,
            headSha: result.snapshot?.headSha || '',
            generatorVersion: REPO_WIKI_GENERATOR_VERSION
          });
          if (!buildLease.acquired) {
            return res.status(202).json({
              action,
              code: 'REPO_WIKI_BUILD_IN_PROGRESS',
              message: 'This repository head is already being built.',
              page: serializeWikiPage(result.page)
            });
          }
          result.page = buildLease.page;
          const beforeMaintenance = snapshotPage(result.page);
          result.page.aiState = {
            ...(result.page.aiState?.toObject ? result.page.aiState.toObject() : result.page.aiState || {}),
            draftStatus: 'maintaining',
            draftRequestedAt: new Date(),
            draftStartedAt: new Date(),
            lastError: '',
            errorCode: ''
          };
          const publication = await runWikiMaintenanceCandidate({
            page: result.page,
            userId: req.user.id,
            WikiRevision,
            beforeSnapshot: beforeMaintenance,
            hasTrustedVersion: action === 'updated',
            sourceVersion: {
              provider: 'github',
              headSha: result.snapshot?.headSha || '',
              snapshotKey: result.snapshot?.headSha ? `github-snapshot:${fullName}:${result.snapshot.headSha}` : ''
            },
            maintainWikiPageFn: maintainWikiPage,
            maintainArgs: {
              wikiSchemaContent: await loadWikiSchemaContent(req.user.id),
              models: {
                WikiPage,
                Article,
                NotebookEntry,
                TagMeta,
                Question,
                WikiSourceEvent
              },
              maintenanceProfile: 'standard',
              // Repo handoffs reserve operational evidence across frontend,
              // API, persistence, workers, publication, and status surfaces.
              // Keep creation aligned with the maintenance selector's 48-file
              // budget or the first visible page can omit owning services.
              sourceLimit: 48,
              skipQualityRebuild: false,
              streamDraft: false,
              trigger: 'github_repo_create'
            }
          });
          result.page = publication.page;
          result.page = await savePageWithVersionRetry(result.page, req.user.id);
          if (!publication.promoted) {
            result.page = await releaseRepoBuildLease({
              WikiPage,
              pageId: result.page._id,
              userId: req.user.id,
              token: buildLease.token,
              headSha: result.snapshot?.headSha || '',
              generatorVersion: REPO_WIKI_GENERATOR_VERSION,
              status: 'needs_review',
              error: publication.quality?.failures?.slice(0, 3).join(' ') || 'Candidate did not pass quality.'
            }) || result.page;
            await markWikiSourceEventFinished({
              WikiSourceEvent,
              event: result.maintenanceEvent,
              userId: req.user.id
            });
            return res.status(422).json({
              error: 'The repo wiki candidate did not pass the evidence bar. The last trusted version is unchanged.',
              code: 'REPO_WIKI_CANDIDATE_REJECTED',
              action,
              page: serializeWikiPage(result.page),
              quality: publication.quality
            });
          }
          await syncPageGraph(result.page, req.user.id);
          await createWikiRevision({
            WikiRevision,
            userId: req.user.id,
            page: result.page,
            before: beforeMaintenance,
            reason: 'agent_maintenance',
            actorType: 'agent',
            summary: result.page.aiState?.maintenanceSummary || `Built repo wiki for ${fullName}.`
          });
          result.page = await releaseRepoBuildLease({
            WikiPage,
            pageId: result.page._id,
            userId: req.user.id,
            token: buildLease.token,
            headSha: result.snapshot?.headSha || '',
            generatorVersion: REPO_WIKI_GENERATOR_VERSION,
            status: 'ready',
            promoted: true
          }) || result.page;
          await markWikiSourceEventFinished({
            WikiSourceEvent,
            event: result.maintenanceEvent,
            userId: req.user.id
          });
          trackWikiEvent(req, EVENT_NAMES.WIKI_DRAFT_GENERATED, {
            pageId: serializeId(result.page._id),
            title: result.page.title,
            pageType: result.page.pageType,
            sourceCount: Array.isArray(result.page.sourceRefs) ? result.page.sourceRefs.length : 0,
            claimCount: Array.isArray(result.page.claims) ? result.page.claims.length : 0,
            sourceType: 'github_repo',
            stream: false
          });
        } catch (error) {
          console.error('Error building GitHub repo wiki:', error);
          if (buildLease?.acquired) {
            await releaseRepoBuildLease({
              WikiPage,
              pageId: result.page._id,
              userId: req.user.id,
              token: buildLease.token,
              headSha: result.snapshot?.headSha || '',
              generatorVersion: REPO_WIKI_GENERATOR_VERSION,
              status: 'error',
              error: error.message || 'Repo wiki build failed.'
            }).catch(() => null);
          }
          result.page.aiState = {
            ...(result.page.aiState?.toObject ? result.page.aiState.toObject() : result.page.aiState || {}),
            draftStatus: 'error',
            lastError: 'Failed to build GitHub repo wiki from attached evidence.',
            errorCode: 'REPO_WIKI_BUILD_FAILED'
          };
          await savePageWithVersionRetry(result.page, req.user.id).catch(() => null);
          return res.status(error.statusCode || 502).json({
            error: 'Failed to build GitHub repo wiki from attached evidence.',
            code: 'REPO_WIKI_BUILD_FAILED',
            page: serializeWikiPage(result.page)
          });
        }
      }
      res.status(action === 'created' ? 201 : 200).json({
        action,
        page: serializeWikiPage(result.page || page),
        repo: {
          owner: ownerKey,
          repo: repoKey,
          fullName,
          url: repoUrl
        },
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
          : [],
        watchError
      });
    } catch (error) {
      res.status(error.statusCode || 500).json({ error: error.message || 'Failed to create GitHub repo wiki.' });
    }
  });
};
