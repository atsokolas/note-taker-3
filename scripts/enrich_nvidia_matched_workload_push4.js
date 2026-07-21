#!/usr/bin/env node
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { WikiPage, WikiRevision, WikiSourceEvent } = require('../server/models');
const { createWikiRevision, snapshotPage } = require('../server/services/wikiRevisionService');
const { evaluateWikiArticleQuality } = require('../server/services/wikiMaintenanceService');
const { compareClaimLedgers } = require('../server/services/wikiClaimComparisonService');
const { buildSecPublicProofAcceptance } = require('../server/services/wikiPublicProofAcceptanceService');
const { buildPublicProofHeadHash } = require('../server/services/publicProofHeadService');
const { strictValidate: validatePush3Contract } = require('./enrich_nvidia_useful_work_economics_push3');

const PAGE_ID = process.env.NVIDIA_PROOF_PAGE_ID || '6a5d225cd00276de99a7d168';
const OUTPUT_DIR = path.resolve(process.env.NVIDIA_PUSH4_OUTPUT || path.join(process.cwd(), 'output', 'nvidia-matched-workload-push4-2026-07-20'));
const APPLY = process.argv.includes('--apply') || process.env.APPLY === '1';
const RESEARCH_AS_OF = new Date('2026-07-20T23:59:59.000Z');
const RESULTS_COMMIT = '5ea4f62ef62536e6bf4d78a9b440fb9035ddfb4a';

const rawResult = relativePath => `https://raw.githubusercontent.com/mlcommons/inference_results_v5.1/${RESULTS_COMMIT}/${relativePath}`;

const SOURCES = Object.freeze([
  {
    key: 'mlperf-v51-summary', provider: 'mlcommons', type: 'official_benchmark_results',
    title: 'MLPerf Inference v5.1 official summary results (commit pinned)',
    url: rawResult('summary_results.json'),
    snippet: 'Official Closed/Available Datacenter result registry identifying the Nebius H200 and Vultr MI325X Llama 2 70B 99.9 Server submissions, their system boundaries, software, validity, and tokens-per-second results.'
  },
  {
    key: 'mlperf-v51-nebius-system', provider: 'mlcommons', type: 'official_benchmark_system_record',
    title: 'MLPerf v5.1 Nebius 8x H200 system record (commit pinned)',
    url: rawResult('closed/Nebius/systems/H200-SXM-141GBx8_TRT.json'),
    snippet: 'Official system record for the one-node Nebius submission: eight H200 SXM 141GB accelerators, TensorRT 10.11, CUDA 12.9, and the disclosed host and interconnect configuration.'
  },
  {
    key: 'mlperf-v51-vultr-system', provider: 'mlcommons', type: 'official_benchmark_system_record',
    title: 'MLPerf v5.1 Vultr 8x MI325X system record (commit pinned)',
    url: rawResult('closed/Vultr/systems/8xMI325X_2xEPYC_9554.json'),
    snippet: 'Official system record for the one-node Vultr submission: eight MI325X 256GB accelerators, vLLM, PyTorch, ROCm 6.3.1, and the disclosed host configuration.'
  },
  {
    key: 'mlperf-v51-nebius-server', provider: 'mlcommons', type: 'official_benchmark_run_log',
    title: 'MLPerf v5.1 Nebius H200 Llama 2 70B 99.9 Server run',
    url: rawResult('closed/Nebius/results/H200-SXM-141GBx8_TRT/llama2-70b-99.9/Server/performance/run_1/mlperf_log_summary.txt'),
    snippet: 'Official valid Server run reporting 34,029.38 completed tokens per second, with the 2,000ms TTFT and 200ms TPOT constraints satisfied.'
  },
  {
    key: 'mlperf-v51-vultr-server', provider: 'mlcommons', type: 'official_benchmark_run_log',
    title: 'MLPerf v5.1 Vultr MI325X Llama 2 70B 99.9 Server run',
    url: rawResult('closed/Vultr/results/8xMI325X_2xEPYC_9554/llama2-70b-99.9/Server/performance/run_1/mlperf_log_summary.txt'),
    snippet: 'Official valid Server run reporting 30,339.40 completed tokens per second, with the 2,000ms TTFT and 200ms TPOT constraints satisfied.'
  },
  {
    key: 'mlcommons-v51-release', provider: 'mlcommons', type: 'official_benchmark_release',
    title: 'MLCommons MLPerf Inference v5.1 results release',
    url: 'https://mlcommons.org/2025/09/mlperf-inference-v5-1-results/',
    snippet: 'Official September 9, 2025 release describing the round and stating that only Lenovo Datacenter and GATEOverflow Edge supplied power submissions.'
  },
  {
    key: 'nebius-h200-price', provider: 'nebius-official', type: 'primary_price_snapshot',
    title: 'Nebius AI Cloud pricing',
    url: 'https://nebius.com/prices',
    snippet: 'Direct provider price page listing NVIDIA HGX H200 at $4.50 per GPU-hour on demand, accessed July 20, 2026; prices can change and exclude applicable taxes.'
  }
]);

const SECTION = Object.freeze({
  heading: 'A matched case: where the platform moat has to earn its premium',
  claims: [
    {
      id: 'nvda-push4-matched-boundary', support: 'supported',
      sources: ['mlperf-v51-summary', 'mlperf-v51-nebius-system', 'mlperf-v51-vultr-system'],
      text: 'This bounded public NVIDIA-versus-AMD inference comparison is narrow: MLPerf Inference v5.1, Datacenter, Closed division, Available systems, Llama 2 70B at the 99.9 accuracy target, Server scenario, one node, and eight accelerators. The NVIDIA record is Nebius submission 5.1-0075 with eight H200 SXM 141GB accelerators and TensorRT 10.11/CUDA 12.9. The AMD record is Vultr submission 5.1-0095 with eight MI325X 256GB accelerators and vLLM/PyTorch/ROCm 6.3.1. Both are system-level results from rental-cloud operators, not chip specifications or vendor-estimated peak throughput.'
    },
    {
      id: 'nvda-push4-matched-result', support: 'supported',
      sources: ['mlperf-v51-summary', 'mlperf-v51-nebius-server', 'mlperf-v51-vultr-server'],
      text: 'Under that accepted-work boundary, the valid Nebius H200 run completed 34,029.38 tokens per second and the valid Vultr MI325X run completed 30,339.40 tokens per second while satisfying the 2,000ms time-to-first-token and 200ms time-per-output-token constraints. H200 was 12.2% faster in this exact pair. That is a real lead, but it is not remotely an order-of-magnitude hardware advantage; the matched result places the systems in the same performance neighborhood for this workload.'
    },
    {
      id: 'nvda-push4-price-threshold', support: 'partial',
      sources: ['mlperf-v51-nebius-server', 'mlperf-v51-vultr-server', 'nebius-h200-price'],
      text: 'Nebius listed H200 at $4.50 per GPU-hour on July 20, 2026. Eight GPUs therefore cost $36 per hour and, at the submitted 34,029.38-token-per-second rate, imply about $0.294 per million accepted tokens at full benchmark utilization. The matched MI325X system breaks even on this renter-cost boundary at approximately $4.01 per GPU-hour: $4.50 multiplied by 30,339.40 divided by 34,029.38. A realizable all-in MI325X rate below that threshold would be cheaper per accepted token if utilization and included services were equal; a higher rate would not. This is a decision threshold, not a reported Vultr price, a forecast, or total cost of ownership.'
    },
    {
      id: 'nvda-push4-missing-economics', support: 'supported',
      sources: ['mlperf-v51-summary', 'mlcommons-v51-release'],
      text: 'Neither matched Llama 2 70B record contains measured power. MLCommons reported only two power submissions in the entire v5.1 round—Lenovo Datacenter and GATEOverflow Edge—so this pair cannot support an energy-per-token comparison. Public benchmark output also does not disclose real fleet utilization, interruption and restart rates, engineering labor, negotiated price, or deployment wait time. Those are missing inputs, not zeros.'
    },
    {
      id: 'nvda-push4-moat-implication', support: 'partial',
      sources: ['mlperf-v51-summary', 'mlperf-v51-nebius-system', 'mlperf-v51-vultr-system', 'mlperf-v51-nebius-server', 'mlperf-v51-vultr-server'],
      text: 'The investment implication is sharper than “CUDA wins” or “AMD is cheaper.” On this bounded workload, NVIDIA has a measured throughput lead but not enough raw separation to establish an economic moat by itself. The platform premium must therefore earn its return through higher production utilization, faster deployment, broader workload coverage, lower failure and porting burden, or superior multi-node scaling. The matched public data does not resolve those variables. A serious diligence process should request the customer’s realized MI325X price relative to the $4.01 break-even threshold, accepted tokens per paid calendar hour, measured wall energy, restart and replay losses, and engineer-hours through production qualification.'
    }
  ]
});

const clone = value => JSON.parse(JSON.stringify(value ?? null));
const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
const id = value => String(value?._id || value?.id || value || '');
const sourceKey = source => clean(source?.metadata?.evidenceKey || source?.citationLabel).toLowerCase();
const bodyText = node => (node?.content || []).map(child => child.text || '').join('');

const sourceMap = candidate => {
  const map = new Map();
  candidate.sourceRefs.forEach((source, index) => {
    map.set(sourceKey(source), {
      source,
      citation: candidate.citations.find(row => id(row.sourceRefId) === id(source._id)),
      index: index + 1
    });
  });
  return map;
};

const addSources = ({ candidate, now }) => {
  const map = sourceMap(candidate);
  let added = 0;
  SOURCES.forEach(row => {
    if (map.has(row.key)) return;
    const source = {
      _id: new mongoose.Types.ObjectId(), type: 'external', title: row.title, snippet: row.snippet,
      url: row.url, citationLabel: row.key.toUpperCase(), provider: row.provider,
      metadata: { evidenceKey: row.key, evidenceType: row.type, reviewedAt: now, asOf: RESEARCH_AS_OF, commit: RESULTS_COMMIT },
      addedBy: 'user', createdAt: now
    };
    const citation = {
      _id: new mongoose.Types.ObjectId(), sourceRefId: source._id, sourceType: 'external',
      sourceTitle: source.title, quote: '', url: source.url, confidence: 0.99, createdAt: now
    };
    candidate.sourceRefs.push(source);
    candidate.citations.push(citation);
    map.set(row.key, { source, citation, index: candidate.sourceRefs.length });
    added += 1;
  });
  return { map, added };
};

const evidenceFor = (map, keys) => keys.map(key => map.get(key));

const addSection = ({ candidate, map, now }) => {
  const existing = new Set(candidate.claims.map(claim => claim.claimId));
  const nodes = [{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: SECTION.heading }] }];
  let added = 0;
  SECTION.claims.forEach(claim => {
    if (existing.has(claim.id)) return;
    const evidence = evidenceFor(map, claim.sources);
    if (evidence.some(row => !row?.source || !row?.citation)) throw new Error(`Missing evidence for ${claim.id}.`);
    nodes.push({
      type: 'paragraph',
      content: [{
        type: 'text', text: claim.text,
        marks: [{ type: 'claim', attrs: { claimId: claim.id, support: claim.support, citationIndexes: evidence.map(row => row.index), contradictionIndexes: [] } }]
      }]
    });
    candidate.claims.push({
      claimId: claim.id, text: claim.text, section: SECTION.heading, support: claim.support,
      citationIds: evidence.map(row => row.citation._id), sourceRefIds: evidence.map(row => row.source._id),
      contradictedByCitationIds: [], confidence: claim.support === 'supported' ? 0.98 : 0.78,
      lastReviewedAt: now, lastVerifiedAt: now,
      history: [{
        at: now, event: 'created', support: claim.support, text: claim.text, section: SECTION.heading,
        citationIds: evidence.map(row => row.citation._id), sourceRefIds: evidence.map(row => row.source._id),
        contradictedByCitationIds: [], summary: 'Added through the Push 4 matched-workload review.'
      }], createdAt: now
    });
    added += 1;
  });
  if (!added) return 0;
  const insertionIndex = candidate.body.content.findIndex(node => (
    node.type === 'heading' && clean(bodyText(node)) === 'Workload boundaries, not one AI-compute market'
  ));
  if (insertionIndex < 0) throw new Error('Could not locate the Push 4 insertion point.');
  candidate.body.content.splice(insertionIndex, 0, ...nodes);
  return added;
};

const applyPush = ({ page, now = new Date() }) => {
  const candidate = clone(page);
  candidate.sourceRefs = Array.isArray(candidate.sourceRefs) ? candidate.sourceRefs : [];
  candidate.citations = Array.isArray(candidate.citations) ? candidate.citations : [];
  candidate.claims = Array.isArray(candidate.claims) ? candidate.claims : [];
  candidate.body = candidate.body || { type: 'doc', content: [] };
  const complete = SECTION.claims.every(expected => candidate.claims.some(claim => claim.claimId === expected.id));
  if (complete) return { candidate, changed: false, addedSourceCount: 0, addedClaimCount: 0 };
  const { map, added: addedSourceCount } = addSources({ candidate, now });
  const addedClaimCount = addSection({ candidate, map, now });
  candidate.plainText = candidate.body.content.map(bodyText).filter(Boolean).join('\n\n');
  candidate.freshness = { ...(candidate.freshness || {}), status: 'fresh', lastMaintainedAt: now };
  candidate.aiState = {
    ...(candidate.aiState || {}), lastDraftedAt: now,
    maintenanceSummary: 'Added a matched H200-versus-MI325X accepted-work case and a price break-even threshold without claiming TCO or advancing the SEC filing clock.',
    changeLog: [{
      type: 'research_revision',
      text: 'Push 4 pinned one matched MLPerf workload, measured the exact throughput gap, and converted incomplete pricing into a falsifiable break-even threshold.',
      createdAt: now
    }, ...(candidate.aiState?.changeLog || [])]
  };
  return { candidate, changed: true, addedSourceCount, addedClaimCount };
};

const strictValidate = (page, { validateUpstream = true } = {}) => {
  const upstream = validateUpstream
    ? validatePush3Contract(page)
    : { ok: true, errors: [], claimCount: page.claims?.length || 0 };
  const errors = [...upstream.errors];
  const headings = (page.body?.content || []).filter(node => node.type === 'heading').map(node => clean(bodyText(node)));
  if (!headings.includes(SECTION.heading)) errors.push('Matched-workload section is missing.');
  SECTION.claims.forEach(expected => {
    const claim = page.claims.find(row => row.claimId === expected.id);
    if (!claim || clean(claim.text) !== clean(expected.text)) errors.push(`${expected.id} is missing or not exact.`);
    if (claim?.support !== expected.support) errors.push(`${expected.id} has the wrong support grade.`);
    if ((claim?.sourceRefIds || []).length !== expected.sources.length) errors.push(`${expected.id} has the wrong source count.`);
  });
  const matched = page.claims.find(row => row.claimId === 'nvda-push4-matched-result')?.text || '';
  if (!matched.includes('34,029.38') || !matched.includes('30,339.40') || !matched.includes('12.2%')) {
    errors.push('Matched result must preserve both measurements and the derived gap.');
  }
  const threshold = page.claims.find(row => row.claimId === 'nvda-push4-price-threshold')?.text || '';
  if (!threshold.includes('$4.01') || !threshold.includes('not a reported Vultr price') || !threshold.includes('not') || !threshold.includes('total cost of ownership')) {
    errors.push('Price threshold must retain its arithmetic and inference boundaries.');
  }
  const forbidden = clean(page.plainText).toLowerCase();
  if (forbidden.includes('vultr mi325x $2.00') || forbidden.includes('$0.146')) {
    errors.push('Unverified Vultr pricing leaked into the published candidate.');
  }
  return { ...upstream, ok: errors.length === 0, errors };
};

const summarize = page => ({
  id: id(page), title: page.title, status: page.status, visibility: page.visibility,
  words: clean(page.plainText).split(/\s+/).filter(Boolean).length,
  sources: page.sourceRefs?.length || 0, claims: page.claims?.length || 0,
  acceptedThrough: page.freshness?.acceptedThrough || null, publicProof: page.publicProof || null,
  headHash: buildPublicProofHeadHash(page)
});

const writeJson = (name, payload) => {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const target = path.join(OUTPUT_DIR, name);
  fs.writeFileSync(target, `${JSON.stringify(payload, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  return target;
};

const claimSourceMatrix = page => {
  const sources = new Map(page.sourceRefs.map(source => [id(source._id), source]));
  return page.claims.map(claim => ({
    claimId: claim.claimId, section: claim.section, support: claim.support, text: claim.text,
    sources: (claim.sourceRefIds || []).map(sourceId => sources.get(id(sourceId))).filter(Boolean).map(source => ({
      key: sourceKey(source), title: source.title, url: source.url, evidenceType: source.metadata?.evidenceType || ''
    })),
    inferenceStatus: claim.support === 'supported' ? 'source-backed fact' : 'calculation or analyst inference with explicit boundary'
  }));
};

const assignCandidate = (page, candidate) => {
  Object.entries(candidate).forEach(([key, value]) => {
    if (['_id', 'id', 'userId', 'createdAt', 'updatedAt', '__v', 'publicProof'].includes(key)) return;
    page[key] = clone(value);
    page.markModified(key);
  });
};

const main = async () => {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required.');
  await mongoose.connect(process.env.MONGODB_URI);
  const page = await WikiPage.findById(PAGE_ID);
  if (!page || page.status !== 'published' || page.visibility !== 'shared'
    || page.externalWatches?.edgar?.ticker !== 'NVDA' || page.publicProof?.grade !== 'proven') {
    throw new Error('Target must be the published, shared, explicitly proven NVDA dossier.');
  }
  const before = snapshotPage(page);
  const push = applyPush({ page: page.toObject({ virtuals: false }) });
  if (!push.changed) {
    console.log(JSON.stringify({ mode: APPLY ? 'apply' : 'dry-run', idempotent: true, page: summarize(page) }, null, 2));
    return;
  }
  const strict = strictValidate(push.candidate);
  if (!strict.ok) throw new Error(`Strict proof validation failed: ${JSON.stringify(strict.errors)}`);
  const quality = evaluateWikiArticleQuality({
    page: push.candidate, body: push.candidate.body, claims: push.candidate.claims,
    sourceRefs: push.candidate.sourceRefs, now: new Date()
  });
  if (!quality.ok) throw new Error(`Quality gate failed: ${JSON.stringify(quality)}`);
  const comparison = compareClaimLedgers({ beforeClaims: before.claims, afterClaims: push.candidate.claims, outcome: 'accepted' });
  const acceptedThroughPreserved = JSON.stringify(before.freshness?.acceptedThrough) === JSON.stringify(push.candidate.freshness?.acceptedThrough);
  if (!acceptedThroughPreserved) throw new Error('Push 4 must not advance or rewrite the SEC accepted-through clock.');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const preview = {
    mode: APPLY ? 'apply' : 'dry-run', idempotent: false,
    before: summarize(page), after: summarize(push.candidate),
    addedSourceCount: push.addedSourceCount, addedClaimCount: push.addedClaimCount,
    quality, strict, comparison: comparison.counts, acceptedThroughPreserved,
    researchAsOf: RESEARCH_AS_OF, resultsCommit: RESULTS_COMMIT
  };
  const dryRunPath = writeJson(`dry-run-${stamp}.json`, preview);
  const matrixPath = writeJson(`claim-source-matrix-${stamp}.json`, claimSourceMatrix(push.candidate));
  const comparisonPath = writeJson(`comparison-${stamp}.json`, comparison);
  if (!APPLY) {
    console.log(JSON.stringify({ ...preview, dryRunPath, matrixPath, comparisonPath }, null, 2));
    return;
  }
  const beforePath = writeJson(`before-${stamp}.json`, { capturedAt: new Date().toISOString(), page: page.toObject({ virtuals: false }), preview });
  const researchEvent = new WikiSourceEvent({
    userId: page.userId, sourceType: 'external', provider: 'nvidia-matched-workload-review',
    externalId: `nvidia-matched-workload-push4:${RESEARCH_AS_OF.toISOString()}`,
    eventType: 'updated', title: 'NVIDIA matched-workload economics review',
    summary: 'A commit-pinned MLPerf comparison added exact accepted-work throughput, a price break-even test, and the disclosures required before any TCO conclusion.',
    text: 'This as-of research compilation does not advance the SEC filing clock and does not claim a matched customer TCO result.',
    url: SOURCES.find(source => source.key === 'mlperf-v51-summary').url,
    sourceUpdatedAt: RESEARCH_AS_OF, status: 'processed', affectedPageIds: [page._id], processedAt: new Date(),
    metadata: { source: 'nvidia-matched-workload-review', sourceUrls: SOURCES.map(source => source.url), researchRevision: true, maintenanceClockEligible: false, asOf: RESEARCH_AS_OF, resultsCommit: RESULTS_COMMIT }
  });
  await researchEvent.save();
  assignCandidate(page, push.candidate);
  page.aiState.quality = quality;
  page.markModified('aiState');
  await page.save();
  const revision = await createWikiRevision({
    WikiRevision, userId: page.userId, page, before, after: snapshotPage(page),
    reason: 'source_event', actorType: 'agent', sourceEventId: researchEvent._id, promotionStatus: 'promoted',
    sourceVersion: { provider: 'nvidia-matched-workload-review', asOf: RESEARCH_AS_OF, sourceCount: SOURCES.length, researchRevision: true, maintenanceClockEligible: false, resultsCommit: RESULTS_COMMIT },
    quality: { ...quality, strict, comparison },
    summary: 'Added Push 4 matched H200-versus-MI325X accepted-work evidence, a price break-even threshold, and explicit missing TCO disclosures.'
  });
  const clock = before.publicProof?.acceptedClocks?.find(row => row.type === 'sec_edgar');
  if (!clock) throw new Error('The existing proven record has no SEC clock.');
  const [clockEvent, clockRevision] = await Promise.all([
    WikiSourceEvent.findById(clock.sourceEventId), WikiRevision.findById(clock.revisionId)
  ]);
  if (!clockEvent || !clockRevision) throw new Error('The existing accepted SEC clock cannot be resolved.');
  const acceptance = buildSecPublicProofAcceptance({
    page, requestedClocks: [{ sourceEventId: clockEvent._id, revisionId: clockRevision._id }],
    events: [clockEvent], revisions: [clockRevision, revision], acceptedHeadRevision: revision,
    comparison, researchAsOf: RESEARCH_AS_OF,
    identity: { ticker: 'NVDA', cik: '0001045810', titlePattern: /NVIDIA/ },
    reason: 'The SEC clock remains pinned to the accepted June 2026 filing, while Push 4 adds a commit-pinned matched-workload case, a falsifiable price threshold, and explicit limits on economic inference.',
    now: new Date()
  });
  if (!acceptance.ok) throw new Error(`Head-bound acceptance failed: ${acceptance.errors.join(' ')}`);
  page.publicProof = acceptance.record;
  page.markModified('publicProof');
  await page.save();
  const result = {
    ...preview, mode: 'apply', page: summarize(page), researchEventId: id(researchEvent), revisionId: id(revision),
    acceptedHeadRevisionId: acceptance.record.acceptanceSnapshot.revisionId,
    beforePath, dryRunPath, matrixPath, comparisonPath,
    invariants: {
      acceptedThroughPreserved: JSON.stringify(before.freshness?.acceptedThrough) === JSON.stringify(page.freshness?.acceptedThrough),
      secClockRevisionPreserved: acceptance.record.acceptedClocks.some(row => row.type === 'sec_edgar' && row.revisionId === id(clockRevision)),
      currentHeadBound: acceptance.record.acceptanceSnapshot.headContentHash === buildPublicProofHeadHash(page),
      researchEventClockEligible: false
    },
    rollback: { pageId: id(page), researchEventId: id(researchEvent), revisionId: id(revision), restoreSnapshotFrom: beforePath }
  };
  const resultPath = writeJson(`result-${stamp}.json`, result);
  console.log(JSON.stringify({ ...result, resultPath }, null, 2));
};

if (require.main === module) main()
  .catch(error => { console.error(error.stack || error.message); process.exitCode = 1; })
  .finally(async () => { try { await mongoose.disconnect(); } catch (_error) {} });

module.exports = { APPLY, RESEARCH_AS_OF, RESULTS_COMMIT, SECTION, SOURCES, applyPush, strictValidate };
