#!/usr/bin/env node
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { WikiPage, WikiRevision, WikiSourceEvent } = require('../server/models');
const { createWikiRevision, snapshotPage } = require('../server/services/wikiRevisionService');
const { evaluateWikiArticleQuality } = require('../server/services/wikiMaintenanceService');

const PAGE_ID = process.env.NVIDIA_PROOF_PAGE_ID || '6a5d225cd00276de99a7d168';
const OUTPUT_DIR = path.resolve(process.env.NVIDIA_MOAT_OUTPUT || path.join(process.cwd(), 'output', 'nvidia-product-moat-enrichment-2026-07-19'));
const APPLY = process.argv.includes('--apply') || process.env.APPLY === '1';

const NEW_SOURCES = Object.freeze([
  {
    key: 'cuda-guide',
    title: 'NVIDIA CUDA Programming Guide 13.2',
    url: 'https://docs.nvidia.com/cuda/cuda-programming-guide/pdf/cuda-programming-guide.pdf',
    snippet: 'Official programming-model documentation explaining CUDA languages, libraries, tools, portability, and multi-GPU execution.'
  },
  {
    key: 'cuda-x',
    title: 'NVIDIA CUDA-X accelerated libraries',
    url: 'https://developer.nvidia.com/cuda/cuda-x-libraries',
    snippet: 'Official inventory of optimized math, scientific-computing, deep-learning, data-processing, communication, image, and video libraries.'
  },
  {
    key: 'blackwell',
    title: 'NVIDIA Blackwell architecture technical overview',
    url: 'https://www.nvidia.com/en-us/data-center/technologies/blackwell-architecture/',
    snippet: 'Official architecture overview for Blackwell GPUs, Transformer Engine, NVLink, NVLink Switch, confidential computing, and rack-scale systems.'
  },
  {
    key: 'rack-networking',
    title: 'NVIDIA DGX GB rack-scale networking guide',
    url: 'https://docs.nvidia.com/dgx/dgxgb200-user-guide/networking.html',
    snippet: 'Official system guide describing NVLink scale-up within a rack and InfiniBand or Ethernet scale-out across racks.'
  },
  {
    key: 'mlperf',
    title: 'MLCommons MLPerf Training v6.0 results',
    url: 'https://mlcommons.org/2026/06/mlperf-training-v6-0-results/',
    snippet: 'Independent benchmark-consortium release describing 24 submitting organizations, 95 systems, 13 accelerator types, and modern training workloads.'
  }
]);

const PRODUCT_SECTIONS = Object.freeze([
  {
    heading: 'What NVIDIA actually sells',
    claims: [
      {
        id: 'nvda-product-system-not-chip', support: 'supported', sources: ['fy26', 'blackwell', 'rack-networking'],
        text: 'NVIDIA’s core Data Center product is no longer adequately described as a GPU. The commercial unit is increasingly a data-center-scale computing system: GPUs perform parallel computation; Grace CPUs coordinate general-purpose work; NVLink and NVLink Switch connect GPUs inside the scale-up domain; InfiniBand or Spectrum-X Ethernet connects racks; BlueField DPUs handle infrastructure tasks; and CUDA, libraries, compilers, inference engines, and management software make the hardware usable. Blackwell’s rack-scale design connects 36 Grace CPUs and 72 GPUs so the rack can operate as one multi-GPU compute domain. Customers are therefore buying time-to-train, inference throughput, power efficiency, deployment reliability, and a supported software path—not a semiconductor specification in isolation.'
      },
      {
        id: 'nvda-product-vertical-range', support: 'supported', sources: ['fy26'],
        text: 'The same underlying programmable architecture is reused across Data Center, gaming, professional visualization, automotive, robotics, and scientific computing through different software stacks. NVIDIA reports support for roughly 6,000 accelerated applications and says its GPUs and networking power more than 78% of systems on the TOP500 supercomputer list. The investment significance is leverage: research in processors, interconnects, compilers, and libraries can be reused across several markets rather than funded independently for each product line. The limitation is that these are company-reported adoption measures, not proof that every supported application creates durable revenue.'
      }
    ]
  },
  {
    heading: 'Why CUDA is more than a programming language',
    claims: [
      {
        id: 'nvda-cuda-stack', support: 'supported', sources: ['fy26', 'cuda-guide', 'cuda-x'],
        text: 'CUDA is a platform boundary between applications and NVIDIA hardware, not merely a language syntax. It includes compilers, runtime and driver APIs, debugging and profiling tools, multi-GPU primitives, and optimized libraries such as cuBLAS, cuFFT, cuDNN, NCCL, and TensorRT-related components. CUDA-X extends that layer across linear algebra, scientific simulation, deep learning, data processing, communications, imaging, and other domains. A developer can obtain performance by calling maintained libraries instead of rewriting low-level kernels for each hardware generation. That raises productivity and lets NVIDIA deliver performance improvements through software as well as new silicon.'
      },
      {
        id: 'nvda-cuda-switching-cost', support: 'partial', sources: ['fy26', 'cuda-guide', 'cuda-x'],
        text: 'The CUDA moat is accumulated workflow capital. NVIDIA reports more than 7.5 million developers using CUDA and its other software tools. The relevant switching cost is not simply recompiling source code: production teams have model kernels, custom extensions, deployment containers, monitoring, staff expertise, validated numerical behavior, and performance assumptions tied to specific libraries and tools. Replacing the accelerator can require retuning or replacing several of those layers and then revalidating the application. This cost is strongest for performance-sensitive or highly customized workloads and weaker where frameworks successfully hide the hardware backend.'
      },
      {
        id: 'nvda-software-monetization-limit', support: 'supported', sources: ['fy26'],
        text: 'Software’s clearest economic role today is to defend hardware demand and system utilization, not to establish a separately proven high-margin software business. NVIDIA sells AI Enterprise, vGPU, Omniverse, DRIVE, and other software, but its 10-K explicitly warns that it may fail to generate meaningful standalone software or services revenue. The moat can therefore be economically powerful even if software revenue remains small: better libraries and deployment tooling make NVIDIA infrastructure more productive and harder to replace. Investors should not, however, value the company as a large recurring-software franchise until the disclosure supports that claim.'
      }
    ]
  },
  {
    heading: 'Networking and co-design turn chips into a platform',
    claims: [
      {
        id: 'nvda-networking-moat', support: 'supported', sources: ['fy26', 'blackwell', 'rack-networking'],
        text: 'Large AI models are distributed systems: accelerator performance is wasted when memory movement and communication become bottlenecks. NVIDIA owns critical parts of both scale-up and scale-out networking. Fifth-generation NVLink provides high-bandwidth, low-latency GPU-to-GPU communication inside Blackwell rack-scale systems, while InfiniBand and Ethernet connect racks into larger clusters. NVIDIA reported that Data Center networking revenue grew 142% in FY2026, driven by NVLink compute fabric and growth in Ethernet and InfiniBand. Mellanox therefore did more than add a networking revenue line; it gave NVIDIA the ability to co-design computation, memory movement, and cluster communication.'
      },
      {
        id: 'nvda-codesign-economics', support: 'partial', sources: ['fy26', 'blackwell', 'rack-networking'],
        text: 'Full-stack co-design creates a wider optimization surface than a standalone accelerator. NVIDIA can change numeric precision, tensor-core behavior, compiler output, collective-communication libraries, interconnect topology, cooling assumptions, and inference scheduling together. If those changes reduce the total number of racks, energy consumed, or engineering months required for a workload, customers can rationally accept a higher component price. The moat is thus best tested through total system economics and reliable workload completion, not peak FLOPS. The counterpoint is that system complexity also increases qualification, cooling, manufacturing, and product-transition risk.'
      }
    ]
  },
  {
    heading: 'How durable is the moat?',
    claims: [
      {
        id: 'nvda-moat-ranking', support: 'partial', sources: ['fy26', 'cuda-guide', 'cuda-x', 'rack-networking', 'mlperf'],
        text: 'The moat has layers of unequal durability. The strongest layer is the accumulated developer and application ecosystem around CUDA libraries and tools. Next is the system layer—GPUs, networking, reference architectures, and software qualified together at scale. Distribution through major cloud providers, server manufacturers, and integrators broadens availability and reduces adoption friction. Release cadence and financial capacity reinforce those layers by funding rapid iteration. Patents and raw chip performance matter, but neither is sufficient alone: competitors can design fast accelerators, while recreating the surrounding software, networking, support, and deployment ecosystem takes longer.'
      },
      {
        id: 'nvda-benchmark-boundary', support: 'partial', sources: ['mlperf', 'fy26'],
        text: 'MLPerf provides useful external evidence but should be interpreted narrowly. Its latest training round included 24 submitting organizations, 95 distinct systems, and 13 accelerator types, confirming both the breadth of NVIDIA’s partner ecosystem and the growing diversity of credible alternatives. NVIDIA and systems containing its accelerators participate across modern workloads, but benchmark leadership does not by itself prove customer total cost, production reliability, or future pricing power. The more important signal is that NVIDIA can repeatedly bring new hardware and software through a broad set of OEM and cloud partners while the benchmark suite itself becomes more competitive.'
      },
      {
        id: 'nvda-moat-erosion', support: 'partial', sources: ['fy26', 'mlperf'],
        text: 'The moat erodes through abstraction and specialization. Frameworks and compilers can make applications less dependent on CUDA-specific code; hyperscalers can design custom accelerators for stable internal workloads; AMD, Huawei, Intel, and other vendors can compete on price, memory, performance, or openness; and Ethernet-based or other industry-standard systems can weaken proprietary interconnect advantages. NVIDIA itself warns that open models deployed on competing platforms could reduce demand and that China restrictions are helping competitors build their own developer and customer ecosystems. A broad ecosystem is an advantage only while NVIDIA continues to deliver enough system-level benefit to justify its premium and preserve developer attention.'
      },
      {
        id: 'nvda-product-monitoring-test', support: 'partial', sources: ['fy26', 'mlperf', 'cuda-guide'],
        text: 'The product moat should be maintained against observable tests rather than slogans. Track the share of major training and inference deployments available on non-NVIDIA accelerators; whether leading frameworks and open models achieve competitive performance without CUDA-specific work; networking growth versus compute growth; adoption of each annual architecture without inventory or reliability problems; changes in developer and application counts; meaningful standalone software revenue; and independent benchmark participation across clouds and OEMs. The thesis weakens before revenue collapses if customers can switch backends with little engineering cost or if NVIDIA must fund progressively more of the ecosystem to sustain demand.'
      }
    ]
  }
]);

const clone = value => JSON.parse(JSON.stringify(value ?? null));
const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
const id = value => String(value?._id || value?.id || value || '');
const sourceKey = source => clean(source?.metadata?.evidenceKey || source?.citationLabel).toLowerCase();

const enrichPage = ({ page, now = new Date() }) => {
  const candidate = clone(page);
  candidate.sourceRefs = Array.isArray(candidate.sourceRefs) ? candidate.sourceRefs : [];
  candidate.citations = Array.isArray(candidate.citations) ? candidate.citations : [];
  candidate.claims = Array.isArray(candidate.claims) ? candidate.claims : [];
  candidate.body = candidate.body || { type: 'doc', content: [] };

  const existingClaimIds = new Set(candidate.claims.map(claim => claim.claimId));
  if (PRODUCT_SECTIONS.flatMap(section => section.claims).every(claim => existingClaimIds.has(claim.id))) {
    return { candidate, changed: false, addedSourceCount: 0, addedClaimCount: 0 };
  }

  const sourceByKey = new Map(candidate.sourceRefs.map((source, index) => [sourceKey(source), { source, index: index + 1 }]));
  for (const row of NEW_SOURCES) {
    if (sourceByKey.has(row.key)) continue;
    const source = {
      _id: new mongoose.Types.ObjectId(), type: 'external', title: row.title, snippet: row.snippet,
      url: row.url, citationLabel: row.key.toUpperCase(), provider: row.key === 'mlperf' ? 'mlcommons' : 'nvidia-official',
      metadata: { evidenceKey: row.key, evidenceType: 'technical_product_moat', reviewedAt: now }, addedBy: 'user', createdAt: now
    };
    candidate.sourceRefs.push(source);
    const citation = { _id: new mongoose.Types.ObjectId(), sourceRefId: source._id, sourceType: 'external', sourceTitle: source.title, quote: '', url: source.url, confidence: 0.98, createdAt: now };
    candidate.citations.push(citation);
    sourceByKey.set(row.key, { source, index: candidate.sourceRefs.length, citation });
  }
  for (const [key, row] of sourceByKey) {
    if (!row.citation) row.citation = candidate.citations.find(citation => id(citation.sourceRefId) === id(row.source._id));
    sourceByKey.set(key, row);
  }

  const insertionIndex = candidate.body.content.findIndex(node => node.type === 'heading' && clean(node.content?.[0]?.text) === 'The operating engine');
  if (insertionIndex < 0) throw new Error('Could not locate the operating-engine insertion point.');
  const nodes = [];
  let addedClaimCount = 0;
  for (const section of PRODUCT_SECTIONS) {
    nodes.push({ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: section.heading }] });
    for (const claim of section.claims) {
      if (existingClaimIds.has(claim.id)) continue;
      const evidence = claim.sources.map(key => sourceByKey.get(key)).filter(Boolean);
      if (evidence.length !== claim.sources.length) throw new Error(`Missing evidence for ${claim.id}.`);
      nodes.push({ type: 'paragraph', content: [{ type: 'text', text: claim.text, marks: [{ type: 'claim', attrs: { claimId: claim.id, support: claim.support, citationIndexes: evidence.map(row => row.index), contradictionIndexes: [] } }] }] });
      candidate.claims.push({
        claimId: claim.id, text: claim.text, section: section.heading, support: claim.support,
        citationIds: evidence.map(row => row.citation._id), sourceRefIds: evidence.map(row => row.source._id), contradictedByCitationIds: [],
        confidence: claim.support === 'supported' ? 0.94 : 0.75, lastReviewedAt: now, lastVerifiedAt: now,
        history: [{ at: now, event: 'created', support: claim.support, text: claim.text, section: section.heading, citationIds: evidence.map(row => row.citation._id), sourceRefIds: evidence.map(row => row.source._id), contradictedByCitationIds: [], summary: 'Added through the primary-source product and technical-moat review.' }],
        createdAt: now
      });
      addedClaimCount += 1;
    }
  }
  candidate.body.content.splice(insertionIndex, 0, ...nodes);
  candidate.plainText = candidate.body.content.map(node => (node.content || []).map(child => child.text || '').join('')).filter(Boolean).join('\n\n');
  candidate.freshness = { ...(candidate.freshness || {}), status: 'fresh', lastMaintainedAt: now };
  candidate.aiState = {
    ...(candidate.aiState || {}), lastDraftedAt: now,
    maintenanceSummary: 'Added a filing- and documentation-backed analysis of NVIDIA’s product stack, CUDA switching costs, networking moat, and technical erosion paths.',
    changeLog: [{ type: 'merged_new_evidence', text: 'Added product, CUDA, networking, and moat durability analysis from official technical documentation and MLCommons.', createdAt: now }, ...(candidate.aiState?.changeLog || [])]
  };
  return { candidate, changed: true, addedSourceCount: NEW_SOURCES.filter(row => !page.sourceRefs.some(source => sourceKey(source) === row.key)).length, addedClaimCount };
};

const summarize = page => ({ id: id(page), title: page.title, status: page.status, visibility: page.visibility, words: clean(page.plainText).split(/\s+/).filter(Boolean).length, sources: page.sourceRefs?.length || 0, claims: page.claims?.length || 0, acceptedThrough: page.freshness?.acceptedThrough || null, publicProof: page.publicProof || null });
const writeJson = (name, payload) => { fs.mkdirSync(OUTPUT_DIR, { recursive: true }); const target = path.join(OUTPUT_DIR, name); fs.writeFileSync(target, `${JSON.stringify(payload, null, 2)}\n`, { flag: 'wx', mode: 0o600 }); return target; };

const main = async () => {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required.');
  await mongoose.connect(process.env.MONGODB_URI);
  const page = await WikiPage.findById(PAGE_ID);
  if (!page || page.status !== 'published' || page.visibility !== 'shared' || page.externalWatches?.edgar?.ticker !== 'NVDA') throw new Error('Target must be the published shared NVDA proof page.');
  const before = snapshotPage(page);
  const enrichment = enrichPage({ page: page.toObject({ virtuals: false }) });
  if (!enrichment.changed) { console.log(JSON.stringify({ mode: APPLY ? 'apply' : 'dry-run', idempotent: true, page: summarize(page) }, null, 2)); return; }
  const quality = evaluateWikiArticleQuality({ page: enrichment.candidate, body: enrichment.candidate.body, claims: enrichment.candidate.claims, sourceRefs: enrichment.candidate.sourceRefs, now: new Date() });
  if (!quality.ok) throw new Error(`Quality gate failed: ${JSON.stringify(quality)}`);
  const preview = { mode: APPLY ? 'apply' : 'dry-run', idempotent: false, before: summarize(page), after: summarize(enrichment.candidate), addedSourceCount: enrichment.addedSourceCount, addedClaimCount: enrichment.addedClaimCount, quality, publicProofPreserved: JSON.stringify(before.publicProof) === JSON.stringify(enrichment.candidate.publicProof), acceptedThroughPreserved: JSON.stringify(before.freshness?.acceptedThrough) === JSON.stringify(enrichment.candidate.freshness?.acceptedThrough) };
  if (!APPLY) { console.log(JSON.stringify(preview, null, 2)); return; }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const beforePath = writeJson(`before-${stamp}.json`, { capturedAt: new Date().toISOString(), page: page.toObject({ virtuals: false }), preview });
  const event = new WikiSourceEvent({
    userId: page.userId, sourceType: 'external', provider: 'nvidia-technical-review', externalId: 'nvidia-product-moat-review-2026-07-19',
    eventType: 'updated', title: 'NVIDIA product and technical-moat evidence review',
    summary: 'Official NVIDIA technical documentation and MLCommons evidence were reviewed to add the product stack, CUDA ecosystem, networking, switching-cost, and moat-erosion layers missing from the financial dossier.',
    text: 'The review added claim-level evidence for CUDA libraries and tools, rack-scale Blackwell systems, NVLink and scale-out networking, developer workflow switching costs, software monetization limits, independent benchmark breadth, and specific technical paths that could erode the moat.',
    url: NEW_SOURCES[0].url, sourceUpdatedAt: new Date(), status: 'processed', affectedPageIds: [page._id], processedAt: new Date(),
    metadata: { source: 'nvidia-technical-review', sourceUrls: NEW_SOURCES.map(row => row.url), historicalBacktest: false }
  });
  await event.save();
  for (const [key, value] of Object.entries(enrichment.candidate)) {
    if (['_id', 'id', 'userId', 'createdAt', 'updatedAt', '__v'].includes(key)) continue;
    page[key] = clone(value); page.markModified(key);
  }
  page.aiState.quality = quality; page.markModified('aiState');
  await page.save();
  const revision = await createWikiRevision({
    WikiRevision, userId: page.userId, page, before, after: snapshotPage(page), reason: 'source_event', actorType: 'agent', sourceEventId: event._id,
    promotionStatus: 'promoted', sourceVersion: { provider: 'nvidia-technical-review', reviewedAt: new Date(), sourceCount: NEW_SOURCES.length },
    quality: { ...quality, comparison: { claimDeltas: { added: enrichment.addedClaimCount, changed: 1, gainedSupport: 0, contradicted: 0, preserved: before.claims?.length || 0, removed: 0 } } },
    summary: 'Added product architecture, CUDA ecosystem, networking, switching-cost, and moat-erosion analysis to the published NVIDIA proof.'
  });
  const result = { ...preview, mode: 'apply', page: summarize(page), eventId: id(event), revisionId: id(revision), beforePath, rollback: { pageId: id(page), eventId: id(event), revisionId: id(revision), restoreSnapshotFrom: beforePath } };
  const resultPath = writeJson(`result-${stamp}.json`, result);
  console.log(JSON.stringify({ ...result, resultPath }, null, 2));
};

if (require.main === module) main().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; }).finally(async () => { try { await mongoose.disconnect(); } catch (_error) {} });

module.exports = { NEW_SOURCES, PRODUCT_SECTIONS, enrichPage };
