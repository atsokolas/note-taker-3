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

const PAGE_ID = process.env.NVIDIA_PROOF_PAGE_ID || '6a5d225cd00276de99a7d168';
const OUTPUT_DIR = path.resolve(process.env.NVIDIA_PUSH2_OUTPUT || path.join(process.cwd(), 'output', 'nvidia-retained-content-push2-2026-07-19'));
const APPLY = process.argv.includes('--apply') || process.env.APPLY === '1';
const RESEARCH_AS_OF = new Date('2026-07-19T23:59:59.000Z');

const SOURCES = Object.freeze([
  {
    key: 'nvlink-fusion-tech', provider: 'nvidia-official', type: 'company_product_claim',
    title: 'NVIDIA technical overview of NVLink and NVLink Fusion',
    url: 'https://developer.nvidia.com/blog/scaling-ai-inference-performance-and-flexibility-with-nvidia-nvlink-and-nvlink-fusion/',
    snippet: 'Official technical description of NVLink Fusion component boundaries, custom-XPU and custom-CPU configurations, rack integration, and modular scale-out choices.'
  },
  {
    key: 'aws-trn2-ga', provider: 'aws-primary', type: 'company_product_claim',
    title: 'AWS: Amazon EC2 Trn2 instances generally available',
    url: 'https://aws.amazon.com/about-aws/whats-new/2024/12/amazon-ec2-trn2-instances-available/',
    snippet: 'Official launch status and architecture for Trainium2 instances, NeuronLink-connected UltraServers, EFA networking, and the Neuron software stack.'
  },
  {
    key: 'google-tpu-v5p-ga', provider: 'google-cloud-primary', type: 'company_product_claim',
    title: 'Google Cloud: TPU v5p and multi-host serving generally available',
    url: 'https://cloud.google.com/blog/products/compute/whats-new-with-google-clouds-ai-hypercomputer-architecture',
    snippet: 'Official availability and system description for TPU v5p pods, inter-chip interconnect, GKE support, and multi-host serving.'
  },
  {
    key: 'ualink-1', provider: 'ualink-consortium', type: 'industry_specification',
    title: 'UALink 200G 1.0 specification overview',
    url: 'https://ualinkconsortium.org/resource/introducing-ualink-200g-1-0-specification/',
    snippet: 'Consortium specification overview for an open memory-semantic scale-up fabric, including direct operations and pod-level accelerator connectivity.'
  },
  {
    key: 'ualink-status-2026', provider: 'task-consultancy', type: 'third_party_industry_analysis',
    title: 'TASK Consultancy: UALink open scale-up ecosystem status',
    url: 'https://ualinkconsortium.org/wp-content/uploads/2026/01/UALink_White_Paper_Publication_Candidate_FINAL_VERSION.pdf',
    snippet: 'Consortium status report distinguishing published specifications, components in development, and evaluation hardware expected during 2026.'
  },
  {
    key: 'meta-roce', provider: 'meta-primary', type: 'peer_reviewed_operator_study',
    title: 'Meta: RDMA over Ethernet for distributed AI training at scale',
    url: 'https://engineering.fb.com/wp-content/uploads/2024/08/sigcomm24-final246.pdf',
    snippet: 'SIGCOMM production study of roughly 30,000 training jobs, fragmented placement, topology, congestion, and large-scale RoCE operation.'
  }
]);

const REMOVE_CLAIMS = Object.freeze([
  'nvda-push1-fusion-fact',
  'nvda-push1-retained-content',
  'nvda-push1-missing-evidence',
  'nvda-push1-central-question',
  'nvda-product-monitoring-test',
  'nvda-product-system-not-chip',
  'nvda-product-vertical-range',
  'nvda-push1-robotics'
]);

const REWRITES = Object.freeze([
  {
    id: 'nvda-moat-ranking', support: 'partial', sources: ['cuda-guide', 'rack-networking', 'mlperf'],
    text: 'Our working hypothesis—not an observed ordinal ranking—is that CUDA workflow capital is most defensible where applications depend on customized kernels, libraries, profiling, and validated numerical behavior; system integration matters where communication, reliability, and deployment time dominate; and the chip is most exposed where workloads are stable, repetitive, and large enough to amortize a purpose-built stack. Public evidence establishes the mechanisms but does not rank their durability. The hypothesis should be replaced when matched switching-cost, useful-work, or production-migration evidence becomes available.'
  },
  {
    id: 'nvda-push1-prefill-decode-fact', support: 'supported', sources: ['splitwise', 'distserve'],
    text: 'LLM inference contains two materially different phases. Prefill processes input tokens in parallel and is generally compute intensive; decode generates tokens sequentially and is generally constrained by model-weight and KV-cache movement, memory bandwidth, capacity, batching, and tail-latency requirements. Splitwise and DistServe independently measure these differences and test separate phase provisioning.'
  },
  {
    id: 'nvda-push1-decode-risk', support: 'partial', sources: ['splitwise', 'distserve', 'aws-trn2', 'google-tpu'],
    text: 'Decode becomes more exposed to accelerator substitution only under a specific conjunction: the model and serving pattern remain stable, volume is predictable enough to amortize a purpose-built stack, memory movement dominates, and the alternative preserves latency, availability, utilization, and engineering velocity. This is a conditional model output, not a current market ranking. It fails when those conditions do not hold or when NVIDIA retains a lower fully loaded cost per accepted output token.'
  },
  {
    id: 'nvda-push1-falsifiers', support: 'partial', sources: ['fy26', 'q1', 'nvlink-fusion', 'nvlink-fusion-tech', 'ualink-1', 'ualink-status-2026'],
    text: 'Use three observable tests rather than partner logos. By July 2028, the favorable retained-content thesis weakens if NVIDIA still cannot name a production custom-XPU NVLink Fusion deployment; if a certified UALink or internal-fabric accelerator pod reaches named production deployment without a disclosed NVIDIA scale-up or scale-out component; or if NVIDIA networking revenue trails Data Center compute growth for four consecutive reported quarters while a named customer’s custom accelerator reaches general availability plus disclosed capacity or instance availability, or reaches a second consecutive deployed generation. The sources are NVIDIA filings and product disclosures, customer architecture releases, and UALink certification or shipment records. If NVIDIA stops separating compute and networking disclosure, the financial proxy becomes unavailable and cannot count as positive confirmation. These dates and thresholds are analyst tests, not company guidance.'
  }
]);

const SECTIONS = Object.freeze([
  {
    heading: 'Who controls the rack after the accelerator changes?',
    claims: [
      {
        id: 'nvda-push2-architecture-map', support: 'partial',
        sources: ['rack-networking', 'nvlink-fusion-tech', 'aws-trn2-ga', 'google-tpu-v5p-ga'],
        text: 'Three named architecture paths produce different NVIDIA outcomes. An NVIDIA reference architecture can combine NVIDIA accelerators, NVLink and switches, scale-out networking, Grace CPUs, BlueField DPUs, rack integration, and CUDA software; the cited guide does not establish that every component is mandatory in every NVIDIA accelerator rack. AWS Trainium2 instead combines AWS accelerators, NeuronLink, EFA, and Neuron; Google TPU v5p similarly combines Google accelerators, inter-chip fabric, orchestration, and serving software. AWS Trn2 instances and Google TPU v5p were generally available, while AWS described the larger Trn2 UltraServer as preview in its December 2024 announcement. NVLink Fusion is a third path: a custom XPU can replace the NVIDIA accelerator while retaining NVIDIA NVLink interfaces or switches and parts of the rack architecture, while scale-out networking may remain modular. Fusion evidence establishes a product design and partner intent, not a named production custom-XPU deployment.'
      },
      {
        id: 'nvda-push2-interface-control', support: 'partial',
        sources: ['nvlink-fusion-tech', 'ualink-1', 'ualink-status-2026', 'meta-roce'],
        text: 'The economic control point is not “networking” in the abstract. It is which interfaces remain proprietary or operationally difficult to replace. NVLink Fusion tries to preserve NVIDIA inside the scale-up domain even when the XPU changes; UALink defines an open memory-semantic alternative; and Meta demonstrates that open Ethernet can operate as a production scale-out fabric when topology and congestion are engineered carefully. UALink had published specifications and an ecosystem under development as of this review, but a TASK Consultancy white paper hosted by UALink described evaluation hardware rather than a comparable production pod. Specification breadth is therefore a threat indicator, not proof of displaced NVIDIA revenue.'
      }
    ]
  },
  {
    heading: 'An indexed model, not an imaginary bill of materials',
    claims: [
      {
        id: 'nvda-push2-retained-index', support: 'partial',
        sources: ['fy26', 'q1', 'rack-networking', 'nvlink-fusion-tech', 'aws-trn2-ga', 'google-tpu-v5p-ga'],
        text: 'Define the revenue-retention index as R = Σ(wᵢ × rᵢ), where each wᵢ is an all-NVIDIA system’s NVIDIA revenue weight for accelerator, scale-up interconnect, scale-out networking, CPU and DPU, rack integration, and paid software or support; each rᵢ is the percentage of that layer retained after substitution; and the six weights sum to 100. Three fully illustrative cases make the assumptions reproducible. Low: w = [80, 7, 5, 3, 3, 2], r = [0%, 25%, 25%, 0%, 25%, 0%], R = 3.75. Base: w = [75, 8, 6, 4, 4, 3], r = [0%, 75%, 75%, 25%, 75%, 50%], R = 16.00. High: w = [65, 10, 8, 6, 6, 5], r = [0%, 100%, 100%, 50%, 100%, 75%], R = 30.75. These are arithmetic scenarios, not estimates or forecasts. A gross-profit index would require separate margin weights and cannot be derived from public disclosure.'
      },
      {
        id: 'nvda-push2-financial-bridge', support: 'partial',
        sources: ['fy26', 'q1', 'nvlink-fusion-tech', 'aws-trn2-ga', 'google-tpu-v5p-ga'],
        text: 'The public financial bridge is necessarily indirect. Track Data Center networking growth relative to compute growth, gross-margin direction through system transitions, named Fusion production deployments, disclosed networking and software mix, and customer evidence that internal accelerators are taking sustained production volume. Rising networking revenue alongside custom-accelerator adoption would be consistent with retained content but would not prove attach or profit; slower networking growth and deteriorating transition margins would weaken the hypothesis but could still reflect supply, mix, or timing. The missing decisive disclosure is NVIDIA revenue and gross profit per heterogeneous rack.'
      }
    ]
  }
]);

const clone = value => JSON.parse(JSON.stringify(value ?? null));
const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
const id = value => String(value?._id || value?.id || value || '');
const sourceKey = source => clean(source?.metadata?.evidenceKey || source?.citationLabel).toLowerCase();
const bodyText = node => (node?.content || []).map(child => child.text || '').join('');
const bodyClaimMarks = body => (body?.content || []).flatMap(node => (node.content || []).flatMap(child => (
  (child.marks || []).filter(mark => mark.type === 'claim').map(mark => ({
    claimId: mark.attrs?.claimId, support: mark.attrs?.support,
    citationIndexes: mark.attrs?.citationIndexes || [], text: child.text || ''
  }))
)));

const sourceMap = candidate => {
  const map = new Map();
  candidate.sourceRefs.forEach((source, index) => {
    const citation = candidate.citations.find(row => id(row.sourceRefId) === id(source._id));
    map.set(sourceKey(source), { source, citation, index: index + 1 });
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
      sourceTitle: source.title, quote: '', url: source.url,
      confidence: row.type === 'peer_reviewed_operator_study' || row.type === 'industry_specification' ? 0.97 : 0.86,
      createdAt: now
    };
    candidate.sourceRefs.push(source);
    candidate.citations.push(citation);
    map.set(row.key, { source, citation, index: candidate.sourceRefs.length });
    added += 1;
  });
  return { map, added };
};

const evidenceFor = (map, keys) => keys.map(key => map.get(key));

const removeClaims = candidate => {
  const removed = new Set(REMOVE_CLAIMS);
  const before = candidate.claims.length;
  candidate.claims = candidate.claims.filter(claim => !removed.has(claim.claimId));
  candidate.body.content = candidate.body.content.filter(node => !((node.content || []).some(child => (
    (child.marks || []).some(mark => mark.type === 'claim' && removed.has(mark.attrs?.claimId))
  ))));
  return before - candidate.claims.length;
};

const rewriteClaims = ({ candidate, map, now }) => {
  let changed = 0;
  REWRITES.forEach(rewrite => {
    const claim = candidate.claims.find(row => row.claimId === rewrite.id);
    if (!claim) throw new Error(`Missing rewrite target ${rewrite.id}.`);
    const evidence = evidenceFor(map, rewrite.sources);
    if (evidence.some(row => !row?.source || !row?.citation)) throw new Error(`Missing rewrite evidence for ${rewrite.id}.`);
    const priorText = claim.text;
    const priorSupport = claim.support;
    claim.text = rewrite.text;
    claim.support = rewrite.support;
    claim.section = claim.section || '';
    claim.citationIds = evidence.map(row => row.citation._id);
    claim.sourceRefIds = evidence.map(row => row.source._id);
    claim.confidence = rewrite.support === 'supported' ? 0.94 : 0.72;
    claim.lastReviewedAt = now;
    claim.lastVerifiedAt = now;
    claim.history = [{
      at: now, event: 'edited', support: rewrite.support, text: rewrite.text, section: claim.section,
      citationIds: claim.citationIds, sourceRefIds: claim.sourceRefIds, contradictedByCitationIds: [],
      summary: `Push 2 replaced ${priorSupport} language with a narrower architecture or evidence claim.`
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
    if (priorText !== rewrite.text || priorSupport !== rewrite.support) changed += 1;
  });
  return changed;
};

const addSections = ({ candidate, map, now }) => {
  const existing = new Set(candidate.claims.map(claim => claim.claimId));
  const nodes = [];
  let added = 0;
  SECTIONS.forEach(section => {
    nodes.push({ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: section.heading }] });
    section.claims.forEach(claim => {
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
        claimId: claim.id, text: claim.text, section: section.heading, support: claim.support,
        citationIds: evidence.map(row => row.citation._id), sourceRefIds: evidence.map(row => row.source._id),
        contradictedByCitationIds: [], confidence: 0.72, lastReviewedAt: now, lastVerifiedAt: now,
        history: [{
          at: now, event: 'created', support: claim.support, text: claim.text, section: section.heading,
          citationIds: evidence.map(row => row.citation._id), sourceRefIds: evidence.map(row => row.source._id), contradictedByCitationIds: [],
          summary: 'Added through the Push 2 retained-content architecture review.'
        }],
        createdAt: now
      });
      added += 1;
    });
  });
  const insertionIndex = candidate.body.content.findIndex(node => node.type === 'heading' && clean(bodyText(node)) === 'What NVIDIA actually sells');
  if (insertionIndex < 0) throw new Error('Could not locate the Push 2 insertion point.');
  candidate.body.content.splice(insertionIndex, 0, ...nodes);
  candidate.body.content = candidate.body.content.filter((node, index, rows) => !(
    node.type === 'heading'
    && clean(bodyText(node)) === 'What NVIDIA actually sells'
    && rows[index + 1]?.type === 'heading'
  ));
  return added;
};

const applyPush = ({ page, now = new Date() }) => {
  const candidate = clone(page);
  candidate.sourceRefs = Array.isArray(candidate.sourceRefs) ? candidate.sourceRefs : [];
  candidate.citations = Array.isArray(candidate.citations) ? candidate.citations : [];
  candidate.claims = Array.isArray(candidate.claims) ? candidate.claims : [];
  candidate.body = candidate.body || { type: 'doc', content: [] };
  const expected = SECTIONS.flatMap(section => section.claims).map(claim => claim.id);
  if (expected.every(claimId => candidate.claims.some(claim => claim.claimId === claimId))) {
    return { candidate, changed: false, addedSourceCount: 0, addedClaimCount: 0, removedClaimCount: 0, rewrittenClaimCount: 0 };
  }
  const { map, added: addedSourceCount } = addSources({ candidate, now });
  const removedClaimCount = removeClaims(candidate);
  const rewrittenClaimCount = rewriteClaims({ candidate, map, now });
  const addedClaimCount = addSections({ candidate, map, now });
  candidate.plainText = candidate.body.content.map(bodyText).filter(Boolean).join('\n\n');
  candidate.freshness = { ...(candidate.freshness || {}), status: 'fresh', lastMaintainedAt: now };
  candidate.aiState = {
    ...(candidate.aiState || {}), lastDraftedAt: now,
    maintenanceSummary: 'Consolidated the NVIDIA research head around named architecture paths, an indexed retained-content model, financial proxies, and dated falsifiers. This research revision does not advance the SEC accepted-through clock.',
    changeLog: [{
      type: 'research_revision',
      text: 'Push 2 removed repetitive or backlog claims, corrected ordinal moat language, and added a reproducible retained-content decision model.',
      createdAt: now
    }, ...(candidate.aiState?.changeLog || [])]
  };
  return { candidate, changed: true, addedSourceCount, addedClaimCount, removedClaimCount, rewrittenClaimCount };
};

const strictValidate = page => {
  const errors = [];
  const claims = page.claims || [];
  const sources = page.sourceRefs || [];
  const citations = page.citations || [];
  const claimIds = claims.map(claim => claim.claimId);
  if (new Set(claimIds).size !== claimIds.length) errors.push('Claim IDs must be unique.');
  const sourceIds = new Set(sources.map(source => id(source._id)));
  const citationIds = new Set(citations.map(citation => id(citation._id)));
  const citationById = new Map(citations.map(citation => [id(citation._id), citation]));
  claims.forEach(claim => {
    if (!Array.isArray(claim.citationIds) || !claim.citationIds.length) errors.push(`${claim.claimId} has no citation.`);
    (claim.citationIds || []).forEach(citationId => {
      if (!citationIds.has(id(citationId))) errors.push(`${claim.claimId} has a dangling citation ID.`);
      const citation = citationById.get(id(citationId));
      if (citation && !sourceIds.has(id(citation.sourceRefId))) errors.push(`${claim.claimId} cites an unresolved source.`);
    });
    (claim.sourceRefIds || []).forEach(sourceRefId => {
      if (!sourceIds.has(id(sourceRefId))) errors.push(`${claim.claimId} has a dangling source ID.`);
    });
  });
  const marks = bodyClaimMarks(page.body);
  const markIds = new Set(marks.map(mark => mark.claimId));
  claims.forEach(claim => { if (!markIds.has(claim.claimId)) errors.push(`${claim.claimId} is missing from the body.`); });
  marks.forEach(mark => {
    const ledger = claims.find(claim => claim.claimId === mark.claimId);
    if (!ledger) errors.push(`${mark.claimId} body mark has no ledger claim.`);
    if (ledger && (ledger.support !== mark.support || clean(ledger.text) !== clean(mark.text))) errors.push(`${mark.claimId} body and ledger disagree.`);
    mark.citationIndexes.forEach(index => {
      if (!Number.isInteger(index) || index < 1 || index > sources.length) errors.push(`${mark.claimId} has an invalid citation index.`);
    });
  });
  REMOVE_CLAIMS.forEach(claimId => {
    if (claims.some(claim => claim.claimId === claimId)) errors.push(`${claimId} should have been consolidated out.`);
  });
  SECTIONS.flatMap(section => section.claims).forEach(expected => {
    const claim = claims.find(row => row.claimId === expected.id);
    if (!claim) errors.push(`${expected.id} is missing.`);
    if (claim && claim.support !== 'partial') errors.push(`${expected.id} must remain partial.`);
  });
  REWRITES.forEach(rewrite => {
    const claim = claims.find(row => row.claimId === rewrite.id);
    if (!claim || clean(claim.text) !== clean(rewrite.text) || claim.support !== rewrite.support) errors.push(`${rewrite.id} rewrite is not exact.`);
  });
  const indexClaim = claims.find(row => row.claimId === 'nvda-push2-retained-index');
  if (!indexClaim?.text.includes('arithmetic scenarios, not estimates or forecasts')) errors.push('Retained-content index must label illustrative values.');
  if (!indexClaim?.text.includes('R = 3.75') || !indexClaim?.text.includes('R = 16.00') || !indexClaim?.text.includes('R = 30.75')) {
    errors.push('Retained-content index must include all reproducible scenario outputs.');
  }
  const falsifier = claims.find(row => row.claimId === 'nvda-push1-falsifiers');
  if (!/July 2028/.test(falsifier?.text || '') || !/four consecutive/.test(falsifier?.text || '')) errors.push('Falsifiers need a date and observable threshold.');
  return {
    ok: errors.length === 0, errors, claimCount: claims.length,
    bodyClaimCount: marks.length,
    citedClaimCount: claims.filter(claim => claim.citationIds?.length).length
  };
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
    inferenceStatus: claim.support === 'supported' ? 'source-backed fact' : 'mixed evidence, calculation, or analyst inference',
    hasExplicitBoundary: /not |unknown|does not|fails|weakens|rather than|hypothesis/i.test(claim.text)
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
  if (!acceptedThroughPreserved) throw new Error('Push 2 must not advance or rewrite the SEC accepted-through clock.');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const preview = {
    mode: APPLY ? 'apply' : 'dry-run', idempotent: false,
    before: summarize(page), after: summarize(push.candidate),
    addedSourceCount: push.addedSourceCount, addedClaimCount: push.addedClaimCount,
    removedClaimCount: push.removedClaimCount, rewrittenClaimCount: push.rewrittenClaimCount,
    quality, strict, comparison: comparison.counts, acceptedThroughPreserved,
    publicProofHeadRequiresReacceptance: true, researchAsOf: RESEARCH_AS_OF
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
    userId: page.userId, sourceType: 'external', provider: 'nvidia-retained-content-review',
    externalId: `nvidia-retained-content-push2:${RESEARCH_AS_OF.toISOString()}`,
    eventType: 'updated', title: 'NVIDIA heterogeneous-rack retained-content review',
    summary: 'A primary-source research pass consolidated the dossier around named architecture paths, an indexed retained-content model, financial proxies, and measurable falsifiers.',
    text: 'This is an as-of research compilation. It does not advance the SEC filing clock and does not claim Noeis observed the cited product or specification releases in real time.',
    url: SOURCES.find(source => source.key === 'nvlink-fusion-tech').url,
    sourceUpdatedAt: RESEARCH_AS_OF, status: 'processed', affectedPageIds: [page._id], processedAt: new Date(),
    metadata: { source: 'nvidia-retained-content-review', sourceUrls: SOURCES.map(source => source.url), researchRevision: true, maintenanceClockEligible: false, asOf: RESEARCH_AS_OF }
  });
  await researchEvent.save();
  assignCandidate(page, push.candidate);
  page.aiState.quality = quality;
  page.markModified('aiState');
  await page.save();
  const revision = await createWikiRevision({
    WikiRevision, userId: page.userId, page, before, after: snapshotPage(page),
    reason: 'source_event', actorType: 'agent', sourceEventId: researchEvent._id,
    promotionStatus: 'promoted',
    sourceVersion: { provider: 'nvidia-retained-content-review', asOf: RESEARCH_AS_OF, sourceCount: SOURCES.length, researchRevision: true, maintenanceClockEligible: false },
    quality: { ...quality, strict, comparison },
    summary: 'Added Push 2 named architecture paths, indexed retained-content economics, financial proxies, and dated falsifiers while removing repetitive claims.'
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
    reason: 'The historical SEC maintenance clock remains pinned to the June 2026 filing, while the current Push 2 head passed claim consolidation, architecture-status, indexed-model, citation, comparison, and falsifier review.',
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

module.exports = { APPLY, RESEARCH_AS_OF, REMOVE_CLAIMS, REWRITES, SECTIONS, SOURCES, applyPush, strictValidate };
