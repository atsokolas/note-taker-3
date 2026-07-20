#!/usr/bin/env node
require('dotenv').config();

const fs = require('fs');
const https = require('https');
const path = require('path');
const mongoose = require('mongoose');
const {
  WikiMaintenanceRun,
  WikiPage,
  WikiRepoBaseline,
  WikiRevision,
  WikiSourceEvent
} = require('../server/models');
const { createWikiRevision, snapshotPage } = require('../server/services/wikiRevisionService');
const {
  buildRepoComparison,
  buildProofPulse,
  captureRepoBaseline
} = require('../server/services/wikiRepoComparisonService');
const { buildRepoPublicProofAcceptance } = require('../server/services/wikiRepoPublicProofAcceptanceService');
const { evaluateWikiArticleQuality } = require('../server/services/wikiMaintenanceService');
const {
  buildCandidate,
  EXPECTED_HEAD: CURRENT_HEAD
} = require('./create_openai_agents_public_proof_baseline');

const SOURCE_PAGE_ID = '6a52e89076aba1fac97456e7';
const OWNER = 'openai';
const REPO = 'openai-agents-js';
const BASELINE_HEAD = '4e1f842f63673db59018a7fa4a441c64c274caf2';
const BASELINE_TAG = 'v0.13.4';
const CURRENT_TAG = 'v0.13.5';
const TARGET_TITLE = 'openai/openai-agents-js — maintained developer dossier';
const TARGET_SLUG = 'openai-agents-js-maintained-developer-dossier-backtest-2026-07-19';
const GENERATOR_VERSION = 'historical-primary-source-backtest-v1';
const OUTPUT_DIR = path.resolve(process.env.OPENAI_AGENTS_BACKTEST_OUTPUT
  || path.join(process.cwd(), 'output', 'openai-agents-historical-proof-2026-07-19'));

const CHANGE_CLAIMS = Object.freeze([
  {
    claimId: 'release-change-provider-executed-tool-search',
    section: 'What changed between v0.13.4 and v0.13.5',
    paths: [
      'packages/agents-extensions/src/ai-sdk/index.ts',
      'packages/agents-core/src/tool.ts',
      'packages/agents-core/src/model.ts'
    ],
    before: 'At v0.13.4, the AI SDK extension adapted ordinary tools and client-side tool-search events, but it did not expose a helper for provider-executed tool search or carry provider-specific function-tool metadata through the core serialization boundary. A provider performing tool search on its server therefore had no explicit Agents SDK contract for preserving that server call and result as a tool-search pair.',
    after: 'At v0.13.5, aiSdkToolSearchTool() adapts a provider-defined server tool-search definition into a hosted, server-executed tool, while FunctionTool.providerData survives core serialization and is forwarded as AI SDK provider options. The adapter now preserves provider-executed tool-search call and result ordering, so a discovered tool can follow the server search in both generated and streamed responses.'
  },
  {
    claimId: 'release-change-stream-item-correlation',
    section: 'What changed between v0.13.4 and v0.13.5',
    paths: [
      'packages/agents-core/src/types/protocol.ts',
      'packages/agents-extensions/src/ai-sdk-ui/uiMessageStream.ts',
      'packages/agents-openai/src/openaiChatCompletionsStreaming.ts',
      'packages/agents-openai/src/openaiResponsesModel.ts'
    ],
    before: 'At v0.13.4, the normalized output_text_delta event did not carry an output-item ID. The AI SDK UI bridge therefore tracked streamed text at the response level, which could not reliably distinguish a completed message item that had already streamed from another message item emitted in the same response.',
    after: 'At v0.13.5, output_text_delta can carry itemId, the OpenAI model adapters propagate the response item identifier, and the AI SDK UI bridge tracks streamed text per item. The practical change is correlation: a completed output item is suppressed only when that same item already streamed, while a different message item can still be emitted.'
  },
  {
    claimId: 'release-change-portable-base64-decoding',
    section: 'What changed between v0.13.4 and v0.13.5',
    paths: [
      'packages/agents-core/src/sandbox/sandboxes/shared/manifestPersistence.ts',
      'packages/agents-core/src/utils/base64.ts'
    ],
    before: 'At v0.13.4, persisted binary sandbox-manifest content was decoded through host-provided Buffer or atob globals. A JavaScript host that supplied neither global could encode a manifest but could not restore its binary file content through this path.',
    after: 'At v0.13.5, binary sandbox-manifest restoration uses a shared decoder that falls back to an internal base64 implementation when neither Buffer nor atob exists. This widens the supported host boundary for persisted binary manifests without changing the serialized manifest format.'
  }
]);

const clean = (value = '') => String(value || '').replace(/\s+/g, ' ').trim();
const clone = value => JSON.parse(JSON.stringify(value ?? null));
const wordCount = value => clean(value).split(/\s+/).filter(Boolean).length;
const id = value => String(value?._id || value?.id || value || '');
const sourcePath = source => clean(source?.metadata?.path || source?.path || '');

const githubJson = url => new Promise((resolve, reject) => {
  const request = https.get(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'noeis-public-proof-backtest'
    }
  }, (response) => {
    let body = '';
    response.setEncoding('utf8');
    response.on('data', chunk => { body += chunk; });
    response.on('end', () => {
      if (response.statusCode < 200 || response.statusCode >= 300) {
        reject(new Error(`GitHub ${response.statusCode}: ${body.slice(0, 300)}`));
        return;
      }
      try { resolve(JSON.parse(body)); } catch (error) { reject(error); }
    });
  });
  request.on('error', reject);
});

const treeFor = async (headSha) => {
  const payload = await githubJson(`https://api.github.com/repos/${OWNER}/${REPO}/git/trees/${headSha}?recursive=1`);
  if (payload.truncated) throw new Error(`GitHub returned a truncated tree for ${headSha}.`);
  return new Map((payload.tree || [])
    .filter(row => row.type === 'blob' && row.path && row.sha)
    .map(row => [row.path, row.sha]));
};

const updatePinnedSources = ({ page, headSha, tagName, tree }) => {
  const release = (page.sourceRefs || []).find(source => clean(source?.metadata?.tagName));
  if (!release) throw new Error('The source page does not contain a pinned release reference.');
  release.title = `${OWNER}/${REPO} release ${tagName}`;
  release.snippet = `Official ${tagName} release and changelog boundary.`;
  release.url = `https://github.com/${OWNER}/${REPO}/releases/tag/${tagName}`;
  release.citationLabel = tagName;
  release.metadata = { ...(release.metadata || {}), owner: OWNER, repo: REPO, tagName, commitSha: headSha, evidenceType: 'release' };

  for (const source of page.sourceRefs || []) {
    const repoPath = sourcePath(source);
    if (!repoPath) continue;
    if (repoPath.startsWith('__repo_inventory__/')) {
      source.url = `https://github.com/${OWNER}/${REPO}/tree/${headSha}`;
      source.metadata = {
        ...(source.metadata || {}), owner: OWNER, repo: REPO, path: repoPath,
        blobSha: `tree-inventory:${headSha}`, commitSha: headSha, evidenceType: 'inventory'
      };
      continue;
    }
    const blobSha = tree.get(repoPath);
    if (!blobSha) throw new Error(`Pinned ${headSha.slice(0, 7)} tree is missing required source path ${repoPath}.`);
    source.url = `https://github.com/${OWNER}/${REPO}/blob/${headSha}/${repoPath}`;
    source.metadata = { ...(source.metadata || {}), owner: OWNER, repo: REPO, path: repoPath, blobSha, commitSha: headSha };
  }
  const sourceById = new Map((page.sourceRefs || []).map(source => [id(source), source]));
  for (const citation of page.citations || []) {
    const source = sourceById.get(id(citation.sourceRefId));
    if (!source) continue;
    citation.sourceTitle = source.title;
    citation.url = source.url;
  }
};

const ensureChangeSources = ({ page, tree, now = new Date() }) => {
  const existingPaths = new Set((page.sourceRefs || []).map(sourcePath).filter(Boolean));
  const requiredPaths = Array.from(new Set(CHANGE_CLAIMS.flatMap(row => row.paths)));
  for (const repoPath of requiredPaths) {
    if (existingPaths.has(repoPath)) continue;
    const blobSha = tree.get(repoPath);
    if (!blobSha) throw new Error(`Current tree is missing required change source ${repoPath}.`);
    const sourceId = new mongoose.Types.ObjectId();
    const source = {
      _id: sourceId, type: 'external', objectId: null, parentObjectId: null,
      title: `${OWNER}/${REPO} ${repoPath}`,
      snippet: 'Primary-source implementation path used by the v0.13.4 to v0.13.5 maintenance backtest.',
      url: `https://github.com/${OWNER}/${REPO}/blob/${CURRENT_HEAD}/${repoPath}`,
      citationLabel: repoPath, provider: 'github',
      metadata: { owner: OWNER, repo: REPO, path: repoPath, blobSha, commitSha: CURRENT_HEAD, evidenceType: 'code' },
      addedBy: 'user', createdAt: now
    };
    page.sourceRefs.push(source);
    page.citations.push({
      _id: new mongoose.Types.ObjectId(), sourceRefId: sourceId, sourceType: 'external',
      sourceTitle: source.title, quote: '', url: source.url, confidence: 1, createdAt: now
    });
    existingPaths.add(repoPath);
  }
};

const replaceTextInBody = ({ body, from, to }) => {
  for (const node of body?.content || []) {
    for (const child of node?.content || []) {
      if (child?.text === from) child.text = to;
    }
  }
};

const addReleaseChangeClaims = ({ page, version }) => {
  const sourceByPath = new Map((page.sourceRefs || []).map(source => [sourcePath(source), source]));
  const citationBySourceId = new Map((page.citations || []).map(citation => [id(citation.sourceRefId), citation]));
  const heading = {
    type: 'heading', attrs: { level: 2 },
    content: [{ type: 'text', text: 'What changed between v0.13.4 and v0.13.5' }]
  };
  const paragraphs = CHANGE_CLAIMS.map((row) => {
    const text = version === 'before' ? row.before : row.after;
    const sources = row.paths.map(repoPath => sourceByPath.get(repoPath));
    if (sources.some(source => !source)) {
      throw new Error(`Missing source for ${row.claimId}: ${row.paths.filter((_, index) => !sources[index]).join(', ')}`);
    }
    const citations = sources.map(source => citationBySourceId.get(id(source)));
    if (citations.some(citation => !citation)) throw new Error(`Missing citation for ${row.claimId}.`);
    page.claims.push({
      claimId: row.claimId,
      text,
      section: row.section,
      support: 'supported',
      citationIds: citations.map(citation => citation._id),
      sourceRefIds: sources.map(source => source._id),
      contradictedByCitationIds: [],
      confidence: 0.97,
      lastReviewedAt: new Date(),
      lastVerifiedAt: new Date(),
      history: [{
        at: new Date(), event: version === 'before' ? 'created' : 'rewritten', support: 'supported', text,
        section: row.section, citationIds: citations.map(citation => citation._id),
        sourceRefIds: sources.map(source => source._id), contradictedByCitationIds: [],
        summary: version === 'before' ? 'Historical v0.13.4 primary-source baseline.' : 'Rewritten from the accepted v0.13.5 repository delta.'
      }],
      createdAt: new Date()
    });
    return {
      type: 'paragraph',
      content: [{
        type: 'text', text,
        marks: [{ type: 'claim', attrs: {
          claimId: row.claimId, support: 'supported',
          citationIndexes: sources.map(source => (page.sourceRefs || []).findIndex(candidate => id(candidate) === id(source)) + 1),
          contradictionIndexes: []
        } }]
      }]
    };
  });
  const clockIndex = (page.body?.content || []).findIndex(node => (
    node.type === 'heading' && node.content?.[0]?.text === 'Current clock and known limits'
  ));
  if (clockIndex < 0) throw new Error('Could not find the clock section insertion point.');
  page.body.content.splice(clockIndex, 0, heading, ...paragraphs);
};

const pinClock = ({ page, fromHead, fromTag, headSha, tagName, baseline }) => {
  const oldText = `This baseline is pinned to repository head ${fromHead} and release ${fromTag}. It describes the contracts present in those sources; it does not claim that main, npm, hosted documentation, or CI remains identical afterward. The GitHub watcher is the clock that will test the dossier: a later accepted version must identify changed source paths, preserve unaffected claims, rewrite only claims whose evidence changed, and keep weaker candidates out of the trusted page.`;
  const newText = baseline
    ? `This historical acceptance baseline is pinned to repository head ${headSha} and release ${tagName}. It is intentionally reconstructed from the repository state at that version so the next accepted version can be tested against a real, already-observed change; it is not presented as a live event that Noeis witnessed in real time. The acceptance result must still identify changed source paths, preserve unaffected claims, and rewrite only claims whose evidence changed.`
    : `This maintained version is pinned to repository head ${headSha} and release ${tagName}. It was accepted through a deliberately labeled historical backtest from v0.13.4, not a claim that Noeis observed the release in real time. The comparison remains useful only if it identifies the source-backed developer contracts that changed, preserves unaffected claims, and exposes the exact primary-source paths behind each rewrite.`;
  const claim = (page.claims || []).find(row => row.text === oldText);
  if (!claim) throw new Error('Could not find the generated clock claim.');
  replaceTextInBody({ body: page.body, from: oldText, to: newText });
  claim.text = newText;
  claim.claimId = 'release-clock-boundary';
  for (const node of page.body?.content || []) {
    for (const child of node?.content || []) {
      for (const mark of child?.marks || []) {
        if (mark.type === 'claim' && child.text === newText) mark.attrs.claimId = claim.claimId;
      }
    }
  }
};

const finalizePage = ({ page, headSha, tagName, event = null, now = new Date(), baseline = false }) => {
  page.title = TARGET_TITLE;
  page.slug = TARGET_SLUG;
  page.status = 'draft';
  page.visibility = 'private';
  page.plainText = (page.body?.content || []).flatMap(node => (node.content || []).map(child => child.text || '')).filter(Boolean).join('\n\n');
  page.externalWatches.githubRepo = {
    ...(page.externalWatches?.githubRepo || {}), owner: OWNER, repo: REPO, defaultBranch: 'main', status: 'active',
    lastCheckedAt: now, lastHeadProbeAt: now, lastHeadSha: headSha, publishedHeadSha: headSha,
    candidateHeadSha: '', publishedGeneratorVersion: GENERATOR_VERSION, candidateGeneratorVersion: '',
    lastPublishedAt: now, lastBuildAttemptAt: now, lastBuildError: '', buildStatus: 'ready',
    buildLease: { token: '', headSha: '', acquiredAt: null, expiresAt: null }, lastReleaseTag: tagName, errorMessage: ''
  };
  page.freshness = {
    ...(page.freshness || {}), status: 'fresh', lastSourceEventAt: now, lastMaintainedAt: now,
    pendingSourceEventIds: [], conflictCount: 0, staleSectionCount: 0,
    acceptedThrough: event ? {
      type: 'github', sourceEventId: event._id, title: `${OWNER}/${REPO} ${tagName}`,
      sourceUpdatedAt: now, acceptedAt: now,
      url: `https://github.com/${OWNER}/${REPO}/commit/${headSha}`
    } : {
      type: 'github', label: `Commit ${headSha.slice(0, 7)}`,
      ref: `https://github.com/${OWNER}/${REPO}/commit/${headSha}`, at: now
    }
  };
  page.aiState = {
    ...(page.aiState || {}), draftStatus: 'ready', lastDraftedAt: now,
    maintenanceSummary: baseline
      ? `Reconstructed the explicit historical ${tagName} baseline from pinned primary sources.`
      : `Accepted ${tagName}: provider tool search, stream correlation, and portable manifest decoding were rewritten from changed primary sources.`,
    candidateStatus: 'promoted', lastCandidateAt: now,
    lastCandidateSummary: baseline ? 'Historical baseline ready for backtest.' : 'Historical maintenance backtest accepted.',
    changeLog: baseline ? [{
      id: `historical-baseline-${headSha.slice(0, 12)}`, type: 'edit',
      title: `Historical baseline at ${tagName}`,
      text: `Reconstructed the trusted ${tagName} claim ledger from repository sources; this is explicitly a backtest, not a witnessed live event.`,
      sourceRefIds: (page.sourceRefs || []).slice(0, 8).map(source => source._id), createdAt: now
    }] : [{
      id: `accepted-release-${headSha.slice(0, 12)}`, type: 'maintenance',
      title: `Accepted ${tagName} repository maintenance`,
      text: 'Rewrote three developer-facing contracts from changed repository sources and preserved the unaffected architecture and operating guidance.',
      sourceRefIds: (page.sourceRefs || []).filter(source => CHANGE_CLAIMS.some(row => row.paths.includes(sourcePath(source)))).slice(0, 8).map(source => source._id),
      createdAt: now
    }]
  };
  page.aiState.quality = evaluateWikiArticleQuality({
    page, body: page.body, claims: page.claims, sourceRefs: page.sourceRefs, now
  });
  if (!page.aiState.quality.ok) throw new Error(`Quality failed: ${(page.aiState.quality.failures || []).join(' | ')}`);
};

const buildVersions = async ({ sourcePage, now = new Date() }) => {
  const [baselineTree, currentTree] = await Promise.all([treeFor(BASELINE_HEAD), treeFor(CURRENT_HEAD)]);
  const generated = buildCandidate({ sourcePage, now });
  ensureChangeSources({ page: generated, tree: currentTree, now });
  generated.slug = TARGET_SLUG;
  generated.createdFrom.text = 'Explicitly labeled historical repository-maintenance acceptance backtest.';
  generated.createdFrom.label = 'Historical v0.13.4 to v0.13.5 primary-source backtest';

  const baseline = clone(generated);
  updatePinnedSources({ page: baseline, headSha: BASELINE_HEAD, tagName: BASELINE_TAG, tree: baselineTree });
  pinClock({ page: baseline, fromHead: CURRENT_HEAD, fromTag: CURRENT_TAG, headSha: BASELINE_HEAD, tagName: BASELINE_TAG, baseline: true });
  addReleaseChangeClaims({ page: baseline, version: 'before' });
  finalizePage({ page: baseline, headSha: BASELINE_HEAD, tagName: BASELINE_TAG, now, baseline: true });

  const current = clone(generated);
  updatePinnedSources({ page: current, headSha: CURRENT_HEAD, tagName: CURRENT_TAG, tree: currentTree });
  pinClock({ page: current, fromHead: CURRENT_HEAD, fromTag: CURRENT_TAG, headSha: CURRENT_HEAD, tagName: CURRENT_TAG, baseline: false });
  addReleaseChangeClaims({ page: current, version: 'after' });
  finalizePage({ page: current, headSha: CURRENT_HEAD, tagName: CURRENT_TAG, now, baseline: false });
  return { baseline, current };
};

const summary = page => ({
  id: id(page), title: page?.title || '', slug: page?.slug || '', status: page?.status || '',
  visibility: page?.visibility || '', words: wordCount(page?.plainText || ''), sources: page?.sourceRefs?.length || 0,
  claims: page?.claims?.length || 0, citations: page?.citations?.length || 0,
  headSha: page?.externalWatches?.githubRepo?.lastHeadSha || '', quality: page?.aiState?.quality || null,
  publicProof: page?.publicProof || null
});

const writeJson = (filename, payload) => {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const target = path.join(OUTPUT_DIR, filename);
  fs.writeFileSync(target, `${JSON.stringify(payload, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  return target;
};

const main = async () => {
  const apply = process.argv.includes('--apply') || process.env.APPLY === '1';
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required.');
  await mongoose.connect(process.env.MONGODB_URI);
  const sourcePage = await WikiPage.findById(SOURCE_PAGE_ID);
  if (!sourcePage) throw new Error('OpenAI Agents JS source page not found.');
  const existing = await WikiPage.findOne({ userId: sourcePage.userId, slug: TARGET_SLUG });
  if (existing) {
    const baseline = await WikiRepoBaseline.findOne({ userId: existing.userId, pageId: existing._id });
    const runs = await WikiMaintenanceRun.find({ userId: existing.userId, pageId: existing._id }).sort({ createdAt: -1 });
    const comparison = baseline ? buildRepoComparison({ baseline, page: existing, maintenanceRuns: runs }) : null;
    console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', idempotent: true, page: summary(existing),
      baseline: baseline ? { id: id(baseline), headSha: baseline.headSha, publicEligible: baseline.publicEligible } : null,
      comparison: comparison ? { counts: comparison.claimComparison?.counts, proofPulse: buildProofPulse(comparison) } : null }, null, 2));
    return;
  }

  const now = new Date();
  const versions = await buildVersions({ sourcePage, now });
  const report = { mode: apply ? 'apply' : 'dry-run', idempotent: false,
    baseline: summary(versions.baseline), current: summary(versions.current),
    explicitlyHistorical: true, sourcePageChanged: false };
  if (!apply) {
    const fakeBaseline = { headSha: BASELINE_HEAD, releaseTag: BASELINE_TAG, generatorVersion: GENERATOR_VERSION,
      capturedAt: now, claims: versions.baseline.claims,
      sourceRefs: versions.baseline.sourceRefs.map(source => ({
        sourceRefId: id(source), title: source.title, path: sourcePath(source), blobSha: source.metadata?.blobSha,
        commitSha: source.metadata?.commitSha, tagName: source.metadata?.tagName, url: source.url,
        evidenceType: source.metadata?.evidenceType
      })) };
    const comparison = buildRepoComparison({ baseline: fakeBaseline, page: versions.current, maintenanceRuns: [] });
    report.comparison = { counts: comparison.claimComparison.counts, proofPulse: buildProofPulse(comparison),
      repositoryChanges: Object.fromEntries(['added', 'changed', 'removed'].map(key => [key, comparison.repositoryChanges[key].length])) };
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const stamp = now.toISOString().replace(/[:.]/g, '-');
  const beforePath = writeJson(`before-${stamp}.json`, { capturedAt: now, sourcePage: summary(sourcePage), intended: report });
  const page = new WikiPage(versions.baseline);
  await page.save();
  const baselineRevision = await createWikiRevision({
    WikiRevision, userId: page.userId, page, reason: 'created', actorType: 'user', promotionStatus: 'promoted',
    sourceVersion: { provider: 'github', owner: OWNER, repo: REPO, headSha: BASELINE_HEAD, releaseTag: BASELINE_TAG, historicalBacktest: true },
    quality: page.aiState.quality,
    summary: 'Created an explicitly historical v0.13.4 repository baseline from pinned primary sources.'
  });
  const baselineResult = await captureRepoBaseline({
    WikiRepoBaseline, WikiRevision, page, userId: page.userId, publicEligible: true, now
  });

  const event = new WikiSourceEvent({
    userId: page.userId, sourceType: 'external', provider: 'github-repo-snapshot',
    externalId: `${OWNER}/${REPO}:${CURRENT_HEAD}`, eventType: 'updated',
    title: `${OWNER}/${REPO} advanced from ${BASELINE_TAG} to ${CURRENT_TAG}`,
    summary: 'Historical backtest of the v0.13.5 source-backed repository changes.',
    text: 'This event is an explicit historical reconstruction, not a claim of real-time observation.',
    url: `https://github.com/${OWNER}/${REPO}/compare/${BASELINE_TAG}...${CURRENT_TAG}`,
    sourceUpdatedAt: new Date('2026-07-17T22:52:07.000Z'), status: 'processing',
    affectedPageIds: [page._id], attemptCount: 1,
    metadata: { pageId: page._id, owner: OWNER, repo: REPO, baselineHeadSha: BASELINE_HEAD,
      commitSha: CURRENT_HEAD, fromTag: BASELINE_TAG, toTag: CURRENT_TAG, historicalBacktest: true }
  });
  await event.save();
  const run = new WikiMaintenanceRun({
    userId: page.userId, pageId: page._id, sourceEventId: event._id, status: 'running', trigger: 'manual',
    summary: 'Running explicit historical repository-maintenance acceptance backtest.', startedAt: now,
    metadata: { historicalBacktest: true, comparisonVersion: 2 }
  });
  await run.save();

  const before = snapshotPage(page);
  const current = clone(versions.current);
  current._id = page._id;
  current.userId = page.userId;
  finalizePage({ page: current, headSha: CURRENT_HEAD, tagName: CURRENT_TAG, event, now, baseline: false });
  const keepId = page._id;
  Object.keys(current).forEach((key) => { if (!['_id', 'userId'].includes(key)) page[key] = current[key]; });
  page._id = keepId;
  page.userId = sourcePage.userId;
  page.markModified('body'); page.markModified('sourceRefs'); page.markModified('claims'); page.markModified('citations');
  page.markModified('freshness'); page.markModified('aiState'); page.markModified('externalWatches');
  await page.save();
  const revision = await createWikiRevision({
    WikiRevision, userId: page.userId, page, before, reason: 'source_event', actorType: 'agent',
    sourceEventId: event._id, maintenanceRunId: run._id, promotionStatus: 'promoted',
    sourceVersion: { provider: 'github', owner: OWNER, repo: REPO, headSha: CURRENT_HEAD, releaseTag: CURRENT_TAG, historicalBacktest: true },
    quality: page.aiState.quality,
    summary: 'Accepted three source-backed developer-contract rewrites and preserved unaffected dossier claims.'
  });
  event.status = 'processed'; event.processedAt = now; event.metadata.revisionId = revision._id;
  await event.save();

  const firstComparison = buildRepoComparison({ baseline: baselineResult.baseline, page, maintenanceRuns: [] });
  const pulse = buildProofPulse(firstComparison);
  if (!pulse.acceptance.eligible) throw new Error(`Comparison is not acceptance eligible: ${pulse.acceptance.blockers.join(', ')}`);
  run.status = 'completed'; run.completedAt = now;
  run.summary = `Accepted ${firstComparison.claimComparison.counts.changed} changed claims and preserved ${firstComparison.claimComparison.counts.preserved}.`;
  run.metadata = {
    historicalBacktest: true, comparisonVersion: 2,
    comparisons: [{ version: 2, outcome: 'accepted', pageId: page._id, sourceEventId: event._id,
      candidateHeadSha: CURRENT_HEAD, counts: firstComparison.claimComparison.counts,
      deltas: firstComparison.claimComparison.deltas }]
  };
  await run.save();
  const comparison = buildRepoComparison({ baseline: baselineResult.baseline, page, maintenanceRuns: [run] });
  const decision = buildRepoPublicProofAcceptance({
    page, baseline: baselineResult.baseline, comparison, sourceEvent: event, revision, maintenanceRun: run,
    liveHeadSha: CURRENT_HEAD,
    reason: 'This explicitly historical v0.13.4 to v0.13.5 backtest rewrote three developer-facing contracts from changed primary-source paths, preserved unaffected peer claims, and passed the version 2 editorial comparison gate.',
    now
  });
  if (!decision.ok) throw new Error(`Public-proof acceptance failed: ${decision.errors.join(' | ')}`);
  page.publicProof = decision.record;
  page.visibility = 'shared';
  page.status = 'published';
  page.markModified('publicProof');
  await page.save();

  const result = {
    ...report, baseline: { id: id(baselineResult.baseline), revisionId: id(baselineRevision),
      headSha: baselineResult.baseline.headSha, publicEligible: baselineResult.baseline.publicEligible },
    page: summary(page), eventId: id(event), maintenanceRunId: id(run), revisionId: id(revision),
    comparison: { counts: comparison.claimComparison.counts, proofPulse: buildProofPulse(comparison),
      repositoryChanges: Object.fromEntries(['added', 'changed', 'removed'].map(key => [key, comparison.repositoryChanges[key].length])) },
    explicitlyHistorical: true, beforePath,
    rollback: { pageId: id(page), baselineId: id(baselineResult.baseline), eventId: id(event),
      maintenanceRunId: id(run), revisionIds: [id(baselineRevision), id(revision)], sourcePageMustRemain: id(sourcePage) }
  };
  const resultPath = writeJson(`result-${stamp}.json`, result);
  console.log(JSON.stringify({ ...result, resultPath }, null, 2));
};

if (require.main === module) {
  main().catch(error => { console.error(error?.stack || error); process.exitCode = 1; })
    .finally(async () => { if (mongoose.connection.readyState) await mongoose.disconnect(); });
}

module.exports = {
  BASELINE_HEAD,
  CHANGE_CLAIMS,
  CURRENT_HEAD,
  TARGET_SLUG,
  buildVersions,
  updatePinnedSources
};
