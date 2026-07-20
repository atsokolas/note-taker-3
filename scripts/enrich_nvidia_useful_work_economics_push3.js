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
const { strictValidate: validatePush2Contract } = require('./enrich_nvidia_retained_content_push2');

const PAGE_ID = process.env.NVIDIA_PROOF_PAGE_ID || '6a5d225cd00276de99a7d168';
const OUTPUT_DIR = path.resolve(process.env.NVIDIA_PUSH3_OUTPUT || path.join(process.cwd(), 'output', 'nvidia-useful-work-push3-2026-07-19'));
const APPLY = process.argv.includes('--apply') || process.env.APPLY === '1';
const RESEARCH_AS_OF = new Date('2026-07-19T23:59:59.000Z');

const SOURCES = Object.freeze([
  {
    key: 'mlperf-training-method', provider: 'mlcommons', type: 'industry_benchmark_methodology',
    title: 'MLCommons MLPerf Training benchmark methodology',
    url: 'https://mlcommons.org/benchmarks/training/',
    snippet: 'Independent benchmark methodology measuring wall-clock time to a fixed workload-specific quality target rather than nominal accelerator throughput.'
  },
  {
    key: 'mlperf-power', provider: 'mlcommons', type: 'industry_benchmark_methodology',
    title: 'MLCommons MLPerf Power system-energy methodology',
    url: 'https://mlcommons.org/2025/03/ml-commons-power-hpca/',
    snippet: 'Independent framework requiring system-level power measurement across compute, memory, storage, interconnect, and cooling, with workload quality and throughput held explicit.'
  },
  {
    key: 'meta-cluster-reliability', provider: 'meta-research', type: 'peer_reviewed_operator_study',
    title: 'Meta: Revisiting reliability in large-scale machine learning research clusters',
    url: 'https://ai.meta.com/research/publications/revisiting-reliability-in-large-scale-machine-learning-research-clusters/',
    snippet: 'HPCA 2025 analysis of four million jobs and more than 150 million A100 GPU-hours, introducing Effective Training Time Ratio and quantifying reliability exposure by job scale.'
  },
  {
    key: 'google-tpu-resiliency', provider: 'google-research', type: 'peer_reviewed_operator_study',
    title: 'Google: Resiliency at scale in TPUv4 supercomputers',
    url: 'https://www.usenix.org/conference/nsdi24/presentation/zu',
    snippet: 'NSDI 2024 production account of 4,096-chip TPUv4 pods, dynamic reconfiguration, 99.98% system availability, and hardware outages affecting roughly one percent of training jobs.'
  },
  {
    key: 'dgx-gb-hardware', provider: 'nvidia-official', type: 'primary_product_specification',
    title: 'NVIDIA DGX GB rack-scale hardware guide',
    url: 'https://docs.nvidia.com/dgx/dgxgb200-user-guide/hardware.html',
    snippet: 'Official NVL72 rack specification covering 72 GPUs, 36 CPUs, nine NVLink switch trays, ConnectX NICs, BlueField DPUs, liquid cooling, and approximately 120 kW rack power.'
  }
]);

const SECTION = Object.freeze({
  heading: 'The unit that matters: cost per accepted unit of work',
  claims: [
    {
      id: 'nvda-push3-useful-work-unit', support: 'partial',
      sources: ['mlperf-training-method', 'mlperf-power', 'meta-cluster-reliability'],
      text: 'The economic denominator should be accepted workload output, not peak FLOPS, accelerator price, or nominal utilization. Over one explicit analysis period T, define Cuseful,w(T) = [Kperiod,w(T) + Emeasured,w(T) + Oincremental,w(T) + Sallocated,w(T)] / Qaccepted,w(T). For owned capacity, Kperiod is the workload’s allocated hardware, network, storage, spares, and facility capital converted into the same period with disclosed economic life, residual value, financing or discount convention, and reserved-idle allocation. For rented capacity, substitute actual billed instance or reservation fees plus separately billed storage, transfer, and support; do not add provider capital, power, or operations already embedded in the bill. Sallocated includes one-time porting, qualification, tuning, and migration labor amortized over the expected accepted work of the workload’s actual life, plus separately identified recurring licenses and engineering; missing labor is unknown, not zero, and must not overlap Oincremental. Training Qaccepted is a completed run reaching a fixed quality target. Inference uses tokens or requests meeting fixed model quality, time-to-first-token, time-per-output-token, tail latency, and availability. Recommendation needs its own quality and tail-latency denominator. MLPerf Training establishes time to a fixed quality target, while MLPerf Power requires system rather than chip-only energy measurement. This is an accounting framework, not evidence that NVIDIA currently has the lowest Cuseful.'
    },
    {
      id: 'nvda-push3-utilization-bridge', support: 'partial',
      sources: ['meta-cluster-reliability', 'meta-roce', 'google-tpu-resiliency'],
      text: 'Useful-work utilization should reconcile accepted output to purchased calendar capacity: ηuseful = Qaccepted / (N × Hcalendar × qreference), using a fixed workload-specific reference rate under the same precision and quality target. Diagnose the gap through allocated capacity, productive runtime, scale efficiency, reliability, and quality-or-SLA acceptance. When those factors overlap, use a calendar-hour ledger instead: accepted work; demand idle; fragmentation; input or compile wait; communication and straggler time; checkpoints; failure detection; queue and restart; replay; and rejected output. Meta’s cluster study distinguishes productive training time from scheduler utilization, Meta’s RoCE work shows placement and topology can degrade output from already-purchased GPUs, and Google shows recovery architecture is part of operating a custom-accelerator pod. None of those studies provides a matched NVIDIA-versus-ASIC cost result.'
    },
    {
      id: 'nvda-push3-failure-economics', support: 'partial',
      sources: ['meta-cluster-reliability', 'google-tpu-resiliency'],
      text: 'For synchronous training, reliability belongs inside unit economics rather than in a qualitative risk paragraph. A first-order overhead model is Toverhead / Tuseful ≈ c/τ + λjob × (d + q + r + τ/2), where c is checkpoint-write time, τ is useful compute between checkpoints, λjob is the observed job-level interruption rate, d is failure-detection latency, q is diagnosis and rescheduling time, r is restore and reinitialization time, and τ/2 is expected replay under a simple uniform-failure assumption. The formula is an analytical approximation and should be replaced with production traces. Do not infer λjob mechanically from device failure rates without testing dependence, and do not charge lost accelerator time twice if it already reduces Qaccepted.'
    },
    {
      id: 'nvda-push3-facility-boundary', support: 'partial',
      sources: ['dgx-gb-hardware', 'mlperf-power', 'meta-roce'],
      text: 'The accelerator is now a tenant of the data center. NVIDIA specifies that one NVL72 rack contains 72 Blackwell GPUs, 36 Grace CPUs, nine NVLink switch trays, substantial ConnectX and BlueField networking, liquid-cooled compute trays, and approximately 120 kW of rack power. That specification proves a facility and network requirement; it does not prove efficiency or customer total cost. Capital must include accelerator, host, network, storage, spares, and allocated facility build. Energy must use measured wall or system power—including memory, network, storage, and cooling—not TDP. A high-density rack can reduce footprint and cabling while still creating power, cooling, deployment-time, or stranded-capacity costs.'
    },
    {
      id: 'nvda-push3-moat-test', support: 'partial',
      sources: ['dgx-gb-hardware', 'mlperf-power', 'meta-roce', 'meta-cluster-reliability', 'google-tpu-resiliency'],
      text: 'NVIDIA earns a system premium only when it produces a positive workload moat value: Mw = Cuseful,alternative,w − Cuseful,NVIDIA,w under the same analysis window, quality target, service level, and cost-allocation convention. Every mechanism must be charged exactly once: lost calendar time lowers Qaccepted; incremental failure labor, replacement parts, or contract penalties enter the numerator; reserved idle capacity remains in periodized capital; and deployment delay changes the measured economic life or expected accepted output rather than becoming an additional arbitrary risk surcharge. Networking is therefore both potential moat and a tax that must earn its capital; Meta’s production RoCE deployment proves that indispensable networking does not automatically mean proprietary NVIDIA networking. Three disclosures would change the thesis most: matched goodput and wall energy at fixed quality and service levels; a calendar accelerator-hour trace covering idle, fragmentation, communication, checkpoint, failure, restart, replay, and rejection; and NVIDIA revenue and gross profit retained in named heterogeneous racks. Until those exist, installed GPU share and benchmark leadership are insufficient measures of economic durability.'
    }
  ]
});

const REWRITES = Object.freeze([
  {
    id: 'nvda-codesign-economics', support: 'partial',
    sources: ['dgx-gb-hardware', 'mlperf-power', 'meta-roce'],
    text: 'Full-stack co-design is economically valuable only if it lowers cost per accepted unit of work or increases accepted output from a constrained facility. NVIDIA can jointly tune precision, compiler output, collectives, interconnect topology, cache movement, cooling assumptions, and scheduling; that wider surface may justify a higher component price through faster deployment, greater productive utilization, or lower engineering burden. It also expands the capital, power, qualification, and transition costs that must be counted. Public evidence proves the optimization mechanisms and physical system boundary, not a matched customer-level NVIDIA cost advantage.'
  }
]);

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
      metadata: { evidenceKey: row.key, evidenceType: row.type, reviewedAt: now, asOf: RESEARCH_AS_OF },
      addedBy: 'user', createdAt: now
    };
    const citation = {
      _id: new mongoose.Types.ObjectId(), sourceRefId: source._id, sourceType: 'external',
      sourceTitle: source.title, quote: '', url: source.url, confidence: 0.97, createdAt: now
    };
    candidate.sourceRefs.push(source);
    candidate.citations.push(citation);
    map.set(row.key, { source, citation, index: candidate.sourceRefs.length });
    added += 1;
  });
  return { map, added };
};

const evidenceFor = (map, keys) => keys.map(key => map.get(key));

const rewriteClaim = ({ candidate, map, rewrite, now }) => {
  const claim = candidate.claims.find(row => row.claimId === rewrite.id);
  if (!claim) throw new Error(`Missing rewrite target ${rewrite.id}.`);
  const evidence = evidenceFor(map, rewrite.sources);
  if (evidence.some(row => !row?.source || !row?.citation)) throw new Error(`Missing rewrite evidence for ${rewrite.id}.`);
  const priorText = claim.text;
  claim.text = rewrite.text;
  claim.support = rewrite.support;
  claim.citationIds = evidence.map(row => row.citation._id);
  claim.sourceRefIds = evidence.map(row => row.source._id);
  claim.confidence = 0.74;
  claim.lastReviewedAt = now;
  claim.lastVerifiedAt = now;
  claim.history = [{
    at: now, event: 'edited', support: rewrite.support, text: rewrite.text, section: claim.section,
    citationIds: claim.citationIds, sourceRefIds: claim.sourceRefIds, contradictedByCitationIds: [],
    summary: 'Push 3 replaced broad co-design language with a measurable useful-work economic test.'
  }, ...(claim.history || [])];
  let bodyMatch = false;
  candidate.body.content.forEach(node => {
    (node.content || []).forEach(child => {
      const mark = (child.marks || []).find(row => row.type === 'claim' && row.attrs?.claimId === rewrite.id);
      if (!mark) return;
      bodyMatch = true;
      child.text = rewrite.text;
      mark.attrs.support = rewrite.support;
      mark.attrs.citationIndexes = evidence.map(row => row.index);
    });
  });
  if (!bodyMatch) throw new Error(`Missing body mark for rewrite ${rewrite.id}.`);
  return priorText !== rewrite.text;
};

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
      contradictedByCitationIds: [], confidence: 0.74, lastReviewedAt: now, lastVerifiedAt: now,
      history: [{
        at: now, event: 'created', support: claim.support, text: claim.text, section: SECTION.heading,
        citationIds: evidence.map(row => row.citation._id), sourceRefIds: evidence.map(row => row.source._id),
        contradictedByCitationIds: [], summary: 'Added through the Push 3 useful-work economics review.'
      }], createdAt: now
    });
    added += 1;
  });
  const insertionIndex = candidate.body.content.findIndex(node => (
    node.type === 'heading' && clean(bodyText(node)) === 'Six workloads, not one AI-compute market'
  ));
  if (insertionIndex < 0) throw new Error('Could not locate the Push 3 insertion point.');
  candidate.body.content[insertionIndex].content[0].text = 'Workload boundaries, not one AI-compute market';
  candidate.claims.forEach(claim => {
    if (claim.section === 'Six workloads, not one AI-compute market') claim.section = 'Workload boundaries, not one AI-compute market';
  });
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
  if (complete) return { candidate, changed: false, addedSourceCount: 0, addedClaimCount: 0, rewrittenClaimCount: 0 };
  const { map, added: addedSourceCount } = addSources({ candidate, now });
  const rewrittenClaimCount = REWRITES.reduce((count, rewrite) => (
    count + (rewriteClaim({ candidate, map, rewrite, now }) ? 1 : 0)
  ), 0);
  const addedClaimCount = addSection({ candidate, map, now });
  candidate.plainText = candidate.body.content.map(bodyText).filter(Boolean).join('\n\n');
  candidate.freshness = { ...(candidate.freshness || {}), status: 'fresh', lastMaintainedAt: now };
  candidate.aiState = {
    ...(candidate.aiState || {}), lastDraftedAt: now,
    maintenanceSummary: 'Added a facility-, reliability-, and software-inclusive useful-work economic model without advancing the SEC filing clock.',
    changeLog: [{
      type: 'research_revision',
      text: 'Push 3 replaced component-level moat language with cost per accepted unit of work, a calendar-capacity bridge, and explicit missing disclosures.',
      createdAt: now
    }, ...(candidate.aiState?.changeLog || [])]
  };
  return { candidate, changed: true, addedSourceCount, addedClaimCount, rewrittenClaimCount };
};

const strictValidate = (page, { validateUpstream = true } = {}) => {
  const upstream = validateUpstream
    ? validatePush2Contract(page)
    : { ok: true, errors: [], claimCount: page.claims?.length || 0 };
  const errors = [...upstream.errors];
  const headings = (page.body?.content || []).filter(node => node.type === 'heading').map(node => clean(bodyText(node)));
  if (headings.includes('Six workloads, not one AI-compute market')) errors.push('Misleading six-workload heading remains.');
  if (!headings.includes('Workload boundaries, not one AI-compute market')) errors.push('Workload-boundary heading is missing.');
  if (!headings.includes(SECTION.heading)) errors.push('Useful-work section is missing.');
  SECTION.claims.forEach(expected => {
    const claim = page.claims.find(row => row.claimId === expected.id);
    if (!claim || clean(claim.text) !== clean(expected.text)) errors.push(`${expected.id} is missing or not exact.`);
    if (claim?.support !== 'partial') errors.push(`${expected.id} must remain partial.`);
  });
  REWRITES.forEach(expected => {
    const claim = page.claims.find(row => row.claimId === expected.id);
    if (!claim || clean(claim.text) !== clean(expected.text) || claim.support !== expected.support) errors.push(`${expected.id} rewrite is not exact.`);
  });
  const unit = page.claims.find(row => row.claimId === 'nvda-push3-useful-work-unit')?.text || '';
  if (!unit.includes('Cuseful') || !unit.includes('not evidence that NVIDIA')) errors.push('Useful-work claim needs its formula and inference boundary.');
  const moat = page.claims.find(row => row.claimId === 'nvda-push3-moat-test')?.text || '';
  if (!moat.includes('Mw =') || !moat.includes('Three disclosures')) errors.push('Moat claim needs its decision equation and missing disclosures.');
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
    inferenceStatus: claim.support === 'supported' ? 'source-backed fact' : 'mixed evidence, calculation, or analyst inference'
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
  if (!acceptedThroughPreserved) throw new Error('Push 3 must not advance or rewrite the SEC accepted-through clock.');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const preview = {
    mode: APPLY ? 'apply' : 'dry-run', idempotent: false,
    before: summarize(page), after: summarize(push.candidate),
    addedSourceCount: push.addedSourceCount, addedClaimCount: push.addedClaimCount,
    rewrittenClaimCount: push.rewrittenClaimCount, quality, strict,
    comparison: comparison.counts, acceptedThroughPreserved, researchAsOf: RESEARCH_AS_OF
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
    userId: page.userId, sourceType: 'external', provider: 'nvidia-useful-work-review',
    externalId: `nvidia-useful-work-push3:${RESEARCH_AS_OF.toISOString()}`,
    eventType: 'updated', title: 'NVIDIA useful-work economics review',
    summary: 'A primary-source research pass added accepted-work, utilization, failure, facility, and engineering-cost boundaries to the NVIDIA dossier.',
    text: 'This as-of research compilation does not advance the SEC filing clock and does not claim a public matched NVIDIA-versus-ASIC cost result.',
    url: SOURCES.find(source => source.key === 'mlperf-power').url,
    sourceUpdatedAt: RESEARCH_AS_OF, status: 'processed', affectedPageIds: [page._id], processedAt: new Date(),
    metadata: { source: 'nvidia-useful-work-review', sourceUrls: SOURCES.map(source => source.url), researchRevision: true, maintenanceClockEligible: false, asOf: RESEARCH_AS_OF }
  });
  await researchEvent.save();
  assignCandidate(page, push.candidate);
  page.aiState.quality = quality;
  page.markModified('aiState');
  await page.save();
  const revision = await createWikiRevision({
    WikiRevision, userId: page.userId, page, before, after: snapshotPage(page),
    reason: 'source_event', actorType: 'agent', sourceEventId: researchEvent._id, promotionStatus: 'promoted',
    sourceVersion: { provider: 'nvidia-useful-work-review', asOf: RESEARCH_AS_OF, sourceCount: SOURCES.length, researchRevision: true, maintenanceClockEligible: false },
    quality: { ...quality, strict, comparison },
    summary: 'Added Push 3 useful-work unit economics, utilization and failure bridges, facility boundaries, and decision-critical missing disclosures.'
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
    reason: 'The historical SEC clock remains pinned to the June 2026 filing, while Push 3 added a source-grounded useful-work economic model, explicit inference boundaries, and measurable missing disclosures.',
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

module.exports = { APPLY, RESEARCH_AS_OF, REWRITES, SECTION, SOURCES, applyPush, strictValidate };
