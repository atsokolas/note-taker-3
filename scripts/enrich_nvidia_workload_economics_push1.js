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
const OUTPUT_DIR = path.resolve(process.env.NVIDIA_PUSH1_OUTPUT || path.join(process.cwd(), 'output', 'nvidia-workload-economics-push1-2026-07-19'));
const APPLY = process.argv.includes('--apply') || process.env.APPLY === '1';
const RESEARCH_AS_OF = new Date('2026-07-19T23:59:59.000Z');

const SOURCES = Object.freeze([
  {
    key: 'meta-llama3', provider: 'meta-primary', type: 'company_technical_report',
    title: 'Meta: Building Meta Llama 3',
    url: 'https://ai.meta.com/blog/meta-llama-3/',
    snippet: 'Primary technical account of frontier training clusters, parallelism, reliability work, and the mixed post-training workflow.'
  },
  {
    key: 'openai-reasoning', provider: 'openai-primary', type: 'company_research',
    title: 'OpenAI: Learning to reason with LLMs',
    url: 'https://openai.com/index/learning-to-reason-with-llms/',
    snippet: 'Primary research account distinguishing reinforcement-learning scaling from pretraining.'
  },
  {
    key: 'splitwise', provider: 'microsoft-research', type: 'peer_reviewed_paper',
    title: 'Splitwise: Efficient generative LLM inference using phase splitting',
    url: 'https://www.microsoft.com/en-us/research/publication/splitwise-efficient-generative-llm-inference-using-phase-splitting/',
    snippet: 'ISCA 2024 paper characterizing compute-intensive prefill and memory-intensive decode and testing homogeneous and heterogeneous phase-split clusters.'
  },
  {
    key: 'distserve', provider: 'usenix', type: 'peer_reviewed_paper',
    title: 'DistServe: Disaggregating Prefill and Decoding for Goodput-optimized LLM Serving',
    url: 'https://www.usenix.org/system/files/osdi24-zhong-yinmin.pdf',
    snippet: 'OSDI 2024 paper on independently provisioning prefill and decode under time-to-first-token and time-per-output-token service objectives.'
  },
  {
    key: 'dynamo-disagg', provider: 'nvidia-official', type: 'primary_documentation',
    title: 'NVIDIA Dynamo: Disaggregated serving',
    url: 'https://docs.nvidia.com/dynamo/dev/user-guides/disaggregated-serving',
    snippet: 'Official design documentation for prefill/decode workers, KV-cache transfer, routing, independent scaling, and cases where aggregation can be superior.'
  },
  {
    key: 'dynamo-intro', provider: 'nvidia-official', type: 'primary_documentation',
    title: 'NVIDIA Dynamo introduction',
    url: 'https://docs.nvidia.com/dynamo/getting-started/introduction',
    snippet: 'Official overview of Dynamo routing, cache management, scaling, supported inference engines, and hardware-backend posture.'
  },
  {
    key: 'nvlink-fusion', provider: 'nvidia-official', type: 'company_product_claim',
    title: 'NVIDIA NVLink Fusion',
    url: 'https://www.nvidia.com/en-us/data-center/nvlink-fusion/',
    snippet: 'Official product page describing integration of custom CPUs and XPUs with NVLink, MGX, and NVIDIA scale-up and scale-out infrastructure.'
  },
  {
    key: 'nvlink-marvell', provider: 'nvidia-official', type: 'company_partnership_claim',
    title: 'NVIDIA and Marvell NVLink Fusion announcement',
    url: 'https://nvidianews.nvidia.com/news/nvidia-ai-ecosystem-expands-as-marvell-joins-forces-through-nvlink-fusion',
    snippet: 'Primary announcement assigning custom-XPU and compatible scale-up roles to Marvell and CPU, NIC, DPU, NVLink, Spectrum-X, and rack roles to NVIDIA.'
  },
  {
    key: 'aws-trn2', provider: 'aws-primary', type: 'company_product_claim',
    title: 'AWS Trainium2 EC2 Trn2 instances and UltraServers',
    url: 'https://aws.amazon.com/ec2/instance-types/trn2/',
    snippet: 'AWS product specifications and vendor-reported economics for its integrated Trainium2, NeuronLink, EFA, and Neuron alternative stack.'
  },
  {
    key: 'google-tpu', provider: 'google-cloud-primary', type: 'primary_documentation',
    title: 'Google Cloud TPU system architecture',
    url: 'https://docs.cloud.google.com/tpu/docs/system-architecture-tpu-vm',
    snippet: 'Official TPU architecture documentation covering matrix units, memory movement, HBM, and the software/system boundary.'
  },
  {
    key: 'google-llmd', provider: 'google-cloud-primary', type: 'company_technical_report',
    title: 'Google Cloud: Enhancing vLLM for distributed inference with llm-d',
    url: 'https://cloud.google.com/blog/products/ai-machine-learning/enhancing-vllm-for-distributed-inference-with-llm-d',
    snippet: 'Primary description of accelerator-portable prefill/decode disaggregation, independent instances, and multi-tier KV caching.'
  },
  {
    key: 'meta-recsys', provider: 'meta-research', type: 'research_paper',
    title: 'Meta: Deep learning training in Facebook data centers',
    url: 'https://ai.meta.com/research/publications/deep-learning-training-in-facebook-data-centers-design-of-scale-up-and-scale-out-systems/',
    snippet: 'Primary systems research distinguishing sparse recommendation workloads, embedding pressure, irregular memory access, and communication patterns.'
  },
  {
    key: 'meta-mtia', provider: 'meta-primary', type: 'company_technical_report',
    title: 'Meta MTIA v1: recommendation-specific inference accelerator',
    url: 'https://ai.meta.com/blog/meta-training-inference-accelerator-AI-MTIA/',
    snippet: 'Primary technical account of Meta designing and integrating a recommendation-specific ASIC, its PyTorch stack, memory architecture, and workload-dependent efficiency limits.'
  },
  {
    key: 'jetson-thor', provider: 'nvidia-official', type: 'company_product_claim',
    title: 'NVIDIA Jetson Thor technical overview',
    url: 'https://www.nvidia.com/en-us/autonomous-machines/embedded-systems/jetson-thor/',
    snippet: 'Official edge-computing specifications establishing robotics power, memory, sensor-processing, and local-latency constraints.'
  }
]);

const SECTIONS = Object.freeze([
  {
    heading: 'The decision surface: where should NVIDIA lose?',
    claims: [
      {
        id: 'nvda-push1-central-question', support: 'partial', sources: ['fy26', 'splitwise', 'dynamo-disagg', 'nvlink-fusion', 'aws-trn2', 'google-tpu'],
        text: 'The relevant moat question is not whether CUDA is broad. It is where the economic value of programmability, rapid deployment, utilization pooling, reliability, and an integrated system exceeds the efficiency available from purpose-built silicon. The most important unresolved variable is NVIDIA content retained after accelerator substitution: custom silicon can take accelerator share without necessarily removing NVLink, networking, CPU, DPU, rack, or orchestration content. Public evidence establishes that this mechanism exists, but not its production adoption, revenue, attach rate, or gross profit.'
      },
      {
        id: 'nvda-push1-break-even', support: 'partial', sources: ['splitwise', 'distserve', 'aws-trn2', 'google-tpu'],
        text: 'Our break-even model is V* = F / (Cgpu − Casc), where V* is the lifetime volume of SLA-qualified useful work required to justify custom silicon; F includes silicon design, software porting, qualification, deployment delay, stranded-capacity risk, and lost flexibility; and Cgpu and Casc are fully loaded costs per useful unit, not chip prices. Useful work excludes failed, retried, or latency-violating output. This is a model framework, not a measured result: public sources do not disclose enough matched utilization, internal transfer pricing, engineering cost, or workload life to calculate V* reliably.'
      }
    ]
  },
  {
    heading: 'Six workloads, not one AI-compute market',
    claims: [
      {
        id: 'nvda-push1-training', support: 'partial', sources: ['meta-llama3', 'openai-reasoning', 'fy26'],
        text: 'Frontier pretraining currently favors flexible, highly networked systems when model architecture, numeric formats, parallelism, and training recipes are changing quickly. Meta’s Llama 3 account shows that effective training time depended on parallelism, checkpointing, fault detection, and cluster reliability—not nominal FLOPS alone. Custom accelerators become more credible when a hyperscaler has enormous persistent volume and can sustain the compiler, networking, and operations stack. The falsifier for the merchant-GPU advantage is not a faster ASIC specification; it is frontier labs moving training to internal silicon without sacrificing iteration speed, utilization, or completed-run reliability.'
      },
      {
        id: 'nvda-push1-posttraining', support: 'partial', sources: ['meta-llama3', 'openai-reasoning', 'dynamo-disagg'],
        text: 'Post-training and reinforcement learning are a mixed hardware market: supervised tuning, rollout inference, sampling, scoring, verification, and policy optimization create a changing blend of training and inference. That volatility should increase the value of a common programmable platform, but large repetitive rollout or verifier workloads can still justify specialized inference capacity. The hypothesis weakens if leading labs standardize these pipelines on custom accelerators while preserving model-development velocity and high fleet utilization.'
      },
      {
        id: 'nvda-push1-prefill-decode-fact', support: 'partial', sources: ['splitwise', 'distserve', 'dynamo-disagg'],
        text: 'LLM inference contains two materially different phases. Prefill processes input tokens in parallel and is generally compute intensive; decode generates tokens sequentially and is generally constrained by model-weight and KV-cache movement, memory bandwidth, capacity, batching, and tail-latency requirements. Splitwise and DistServe test independent phase provisioning, while Dynamo implements separate workers and KV-cache transfer. This supports treating prefill and decode as different hardware profit pools rather than one inference market.'
      },
      {
        id: 'nvda-push1-recommendation', support: 'partial', sources: ['meta-recsys', 'meta-mtia'],
        text: 'Recommendation is not a smaller version of dense LLM training. Meta’s systems research describes sparse embedding tables, irregular memory access, memory-capacity pressure, and substantial communication; Meta also built MTIA specifically because it said GPUs were not always optimal for its recommendation workloads at its scale. Persistent, stable hyperscale operators therefore create a credible custom-silicon opening. This claim weakens if matched production evidence shows NVIDIA systems retaining lower fully loaded cost and higher shared-fleet utilization across the same recommendation workload mix after software and deployment costs are included.'
      },
      {
        id: 'nvda-push1-robotics', support: 'partial', sources: ['jetson-thor', 'fy26'],
        text: 'Robotics moves the decision boundary to the edge: power and thermal envelope, deterministic latency, sensor input, qualification, local reliability, and software integration matter more than data-center throughput alone. Jetson Thor’s published power and memory envelope establishes those constraints, not durable NVIDIA economics. NVIDIA can win during development and lower-volume deployment through Jetson and its software stack. This claim weakens if comparable robotics teams standardize on non-NVIDIA platforms during development or lower-volume deployment without longer development cycles, lower reliability, or materially greater validation cost.'
      }
    ]
  },
  {
    heading: 'Prefill and decode split the inference profit pool',
    claims: [
      {
        id: 'nvda-push1-inference-model', support: 'partial', sources: ['splitwise', 'distserve', 'dynamo-disagg'],
        text: 'The minimum inference model needs input length, output length, arrival rate, concurrency, batch size, prefix-cache hit rate, time-to-first-token, time-per-output-token, tail-latency target, achieved compute utilization, achieved memory-bandwidth utilization, HBM capacity, and effective network transfer. Request time can be decomposed as Tprefill + Tkv-transfer + output tokens × Tdecode-per-token. The model should compare cost per useful input and output token under matched service levels; peak FLOPS or vendor price-performance claims are not substitutes for that denominator.'
      },
      {
        id: 'nvda-push1-disaggregation-boundary', support: 'partial', sources: ['dynamo-disagg', 'google-llmd', 'splitwise'],
        text: 'Disaggregation is not automatically superior. NVIDIA documents that short prompts, small models, low concurrency, or slow KV transfer can favor aggregated serving. Moving the KV cache creates a network and scheduling cost that can erase phase-specific hardware savings. This boundary is economically important because the same disaggregation that opens each phase to specialized accelerators also raises the value of fast data movement, cache-aware routing, and topology-aware orchestration.'
      },
      {
        id: 'nvda-push1-decode-risk', support: 'partial', sources: ['splitwise', 'distserve', 'aws-trn2', 'google-tpu'],
        text: 'Our current ranking puts decode at greater accelerator-substitution risk than prefill because production models can remain stable, token generation is sequential and memory intensive, and very large predictable volumes can amortize a purpose-built stack. This is a hypothesis, not a market-share forecast. It fails if matched production measurements show NVIDIA maintaining lower cost per SLA-qualified output token after alternative-platform engineering, utilization, reliability, and capacity risk are included.'
      }
    ]
  },
  {
    heading: 'The heterogeneous-infrastructure counterattack',
    claims: [
      {
        id: 'nvda-push1-fusion-fact', support: 'partial', sources: ['nvlink-fusion', 'nvlink-marvell'],
        text: 'NVLink Fusion is explicitly designed to place custom CPUs and XPUs inside an NVIDIA-associated rack and data-center architecture. In the announced Marvell arrangement, Marvell supplies custom XPUs and compatible scale-up networking, while NVIDIA says it supplies Vera CPU, ConnectX NICs, BlueField DPUs, NVLink, Spectrum-X switches, and rack-scale technology. This proves product intent and a defined component boundary; it does not prove a production customer, shipment volume, attach rate, pricing, or retained profit.'
      },
      {
        id: 'nvda-push1-dynamo-boundary', support: 'partial', sources: ['dynamo-intro', 'dynamo-disagg', 'google-llmd', 'fy26'],
        text: 'Dynamo can strengthen NVIDIA’s system position by coordinating routing, cache state, worker scaling, and multiple inference engines above the accelerator. The counterargument is equally material: NVIDIA describes a modular, vendor-aware framework, and comparable open infrastructure such as llm-d targets GPUs and TPUs. Orchestration could therefore increase NVIDIA’s relevance while making accelerators easier to substitute. There is no public evidence yet of meaningful standalone Dynamo revenue or the backend mix of production deployments.'
      },
      {
        id: 'nvda-push1-retained-content', support: 'partial', sources: ['q1', 'fy26', 'nvlink-fusion', 'nvlink-marvell'],
        text: 'The scenario variable is retained content ratio = NVIDIA revenue in a heterogeneous system divided by NVIDIA revenue in an all-NVIDIA system. The numerator may include accelerators, NVLink and switches, scale-out networking, CPUs, DPUs, and paid software. NVIDIA’s reported networking growth shows that non-GPU content is already material, but current disclosure does not reveal bill of materials, attach rates, margins, or content per custom-XPU rack. Accelerator-share loss and total NVIDIA-content loss are therefore not equivalent, but neither can yet be quantified.'
      },
      {
        id: 'nvda-push1-falsifiers', support: 'partial', sources: ['dynamo-disagg', 'dynamo-intro', 'nvlink-fusion', 'nvlink-marvell', 'aws-trn2', 'google-llmd'],
        text: 'The favorable heterogeneous-infrastructure thesis weakens if named Fusion partners remain design announcements through two architecture cycles; production custom-XPU systems use little NVIDIA content beyond a licensed interface; alternative scale-up fabrics become dominant; Dynamo operates competitively across non-NVIDIA accelerators and networking without paid NVIDIA support; or custom-silicon deployment rises while NVIDIA networking growth and gross profit per deployed AI system fall. It strengthens only with named production deployments, disclosed or inferable attach, and independent workload economics—not additional partner logos.'
      },
      {
        id: 'nvda-push1-missing-evidence', support: 'partial', sources: ['dynamo-disagg', 'nvlink-fusion', 'aws-trn2', 'google-tpu'],
        text: 'The evidence still missing is decision-critical: matched cost per useful token under identical latency and quality requirements; real fleet utilization and failure rates; custom-silicon design and software cost; workload life and model-change frequency; production prefill/decode traffic distributions; NVLink Fusion deployments and component attach; Dynamo use by hardware backend; and NVIDIA revenue and gross profit per heterogeneous rack. Until those inputs exist, this push is a falsifiable underwriting framework, not proof that NVIDIA wins the transition.'
      }
    ]
  }
]);

const REGRADE = Object.freeze({
  'nvda-product-system-not-chip': 'partial',
  'nvda-product-vertical-range': 'partial',
  'nvda-networking-moat': 'partial',
  'nvda-benchmark-boundary': 'partial'
});

const clone = value => JSON.parse(JSON.stringify(value ?? null));
const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
const id = value => String(value?._id || value?.id || value || '');
const sourceKey = source => clean(source?.metadata?.evidenceKey || source?.citationLabel).toLowerCase();
const bodyText = node => (node?.content || []).map(child => child.text || '').join('');

const sourceAndCitationMaps = candidate => {
  const sourceByKey = new Map(candidate.sourceRefs.map((source, index) => [sourceKey(source), { source, index: index + 1 }]));
  sourceByKey.forEach((row, key) => {
    row.citation = candidate.citations.find(citation => id(citation.sourceRefId) === id(row.source._id));
    sourceByKey.set(key, row);
  });
  return sourceByKey;
};

const addSources = ({ candidate, now }) => {
  const sourceByKey = sourceAndCitationMaps(candidate);
  let added = 0;
  SOURCES.forEach(row => {
    if (sourceByKey.has(row.key)) return;
    const source = {
      _id: new mongoose.Types.ObjectId(), type: 'external', title: row.title, snippet: row.snippet,
      url: row.url, citationLabel: row.key.toUpperCase(), provider: row.provider,
      metadata: { evidenceKey: row.key, evidenceType: row.type, reviewedAt: now, asOf: RESEARCH_AS_OF },
      addedBy: 'user', createdAt: now
    };
    const citation = {
      _id: new mongoose.Types.ObjectId(), sourceRefId: source._id, sourceType: 'external',
      sourceTitle: source.title, quote: '', url: source.url, confidence: row.type.includes('claim') ? 0.86 : 0.97, createdAt: now
    };
    candidate.sourceRefs.push(source);
    candidate.citations.push(citation);
    sourceByKey.set(row.key, { source, citation, index: candidate.sourceRefs.length });
    added += 1;
  });
  return { sourceByKey, added };
};

const regradeExistingClaims = ({ candidate, now }) => {
  let changed = 0;
  Object.entries(REGRADE).forEach(([claimId, support]) => {
    const claim = candidate.claims.find(row => row.claimId === claimId);
    if (!claim || claim.support === support) return;
    const previousSupport = claim.support;
    claim.support = support;
    claim.confidence = 0.74;
    claim.lastReviewedAt = now;
    claim.history = Array.isArray(claim.history) ? claim.history : [];
    claim.history.push({
      at: now, event: 'regraded', support, text: claim.text, section: claim.section,
      citationIds: claim.citationIds || [], sourceRefIds: claim.sourceRefIds || [],
      contradictedByCitationIds: claim.contradictedByCitationIds || [],
      summary: `Regraded from ${previousSupport} because the claim combines reported facts with editorial or economic interpretation.`
    });
    candidate.body.content.forEach(node => {
      (node.content || []).forEach(child => {
        (child.marks || []).forEach(mark => {
          if (mark.type === 'claim' && mark.attrs?.claimId === claimId) mark.attrs.support = support;
        });
      });
    });
    changed += 1;
  });
  return changed;
};

const applyPush = ({ page, now = new Date() }) => {
  const candidate = clone(page);
  candidate.sourceRefs = Array.isArray(candidate.sourceRefs) ? candidate.sourceRefs : [];
  candidate.citations = Array.isArray(candidate.citations) ? candidate.citations : [];
  candidate.claims = Array.isArray(candidate.claims) ? candidate.claims : [];
  candidate.body = candidate.body || { type: 'doc', content: [] };

  const expectedIds = SECTIONS.flatMap(section => section.claims).map(claim => claim.id);
  if (expectedIds.every(claimId => candidate.claims.some(claim => claim.claimId === claimId))) {
    return { candidate, changed: false, addedSourceCount: 0, addedClaimCount: 0, regradedClaimCount: 0 };
  }

  const { sourceByKey, added: addedSourceCount } = addSources({ candidate, now });
  const regradedClaimCount = regradeExistingClaims({ candidate, now });
  const existingIds = new Set(candidate.claims.map(claim => claim.claimId));
  const nodes = [];
  let addedClaimCount = 0;
  SECTIONS.forEach(section => {
    nodes.push({ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: section.heading }] });
    section.claims.forEach(claim => {
      if (existingIds.has(claim.id)) return;
      const evidence = claim.sources.map(key => sourceByKey.get(key));
      if (evidence.some(row => !row?.source || !row?.citation)) throw new Error(`Missing source or citation for ${claim.id}.`);
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
        contradictedByCitationIds: [], confidence: claim.support === 'supported' ? 0.94 : 0.73,
        lastReviewedAt: now, lastVerifiedAt: now,
        history: [{
          at: now, event: 'created', support: claim.support, text: claim.text, section: section.heading,
          citationIds: evidence.map(row => row.citation._id), sourceRefIds: evidence.map(row => row.source._id),
          contradictedByCitationIds: [],
          summary: 'Added through the Push 1 workload-economics and heterogeneous-infrastructure research review.'
        }],
        createdAt: now
      });
      addedClaimCount += 1;
    });
  });

  const insertionIndex = candidate.body.content.findIndex(node => node.type === 'heading' && [
    'What NVIDIA actually sells', 'The operating engine'
  ].includes(clean(bodyText(node))));
  if (insertionIndex < 0) throw new Error('Could not locate the Push 1 insertion point.');
  candidate.body.content.splice(insertionIndex, 0, ...nodes);
  candidate.plainText = candidate.body.content.map(bodyText).filter(Boolean).join('\n\n');
  candidate.freshness = { ...(candidate.freshness || {}), status: 'fresh', lastMaintainedAt: now };
  candidate.aiState = {
    ...(candidate.aiState || {}), lastDraftedAt: now,
    maintenanceSummary: 'Added an as-of research revision on workload economics, prefill/decode disaggregation, custom-silicon break-even, and NVIDIA content retained in heterogeneous infrastructure. This revision does not advance the SEC accepted-through clock.',
    changeLog: [{
      type: 'research_revision',
      text: 'Added the Push 1 workload-economics decision model and corrected overconfident product-moat support grades; the June 2026 SEC clock remains unchanged.',
      createdAt: now
    }, ...(candidate.aiState?.changeLog || [])]
  };
  return { candidate, changed: true, addedSourceCount, addedClaimCount, regradedClaimCount };
};

const bodyClaimMarks = body => (body?.content || []).flatMap(node => (node.content || []).flatMap(child => (
  (child.marks || []).filter(mark => mark.type === 'claim').map(mark => ({
    claimId: mark.attrs?.claimId, support: mark.attrs?.support,
    citationIndexes: mark.attrs?.citationIndexes || [], text: child.text || ''
  }))
)));

const strictValidate = page => {
  const errors = [];
  const claims = Array.isArray(page.claims) ? page.claims : [];
  const sources = Array.isArray(page.sourceRefs) ? page.sourceRefs : [];
  const citations = Array.isArray(page.citations) ? page.citations : [];
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
  Object.entries(REGRADE).forEach(([claimId, support]) => {
    if (claims.find(claim => claim.claimId === claimId)?.support !== support) errors.push(`${claimId} was not regraded to ${support}.`);
  });
  const analyticalIds = SECTIONS.flatMap(section => section.claims.filter(claim => claim.support === 'partial').map(claim => claim.id));
  analyticalIds.forEach(claimId => {
    if (claims.find(claim => claim.claimId === claimId)?.support !== 'partial') errors.push(`${claimId} must remain partial.`);
  });
  if (!claims.find(claim => claim.claimId === 'nvda-push1-falsifiers')?.text.includes('weakens if')) errors.push('Push 1 needs explicit falsifiers.');
  return { ok: errors.length === 0, errors, claimCount: claims.length, bodyClaimCount: marks.length, citedClaimCount: claims.filter(claim => claim.citationIds?.length).length };
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
  const sourceById = new Map(page.sourceRefs.map(source => [id(source._id), source]));
  return page.claims.map(claim => ({
    claimId: claim.claimId, section: claim.section, support: claim.support, text: claim.text,
    sources: (claim.sourceRefIds || []).map(sourceId => {
      const source = sourceById.get(id(sourceId));
      return source ? { key: sourceKey(source), title: source.title, url: source.url, evidenceType: source.metadata?.evidenceType || '' } : null;
    }).filter(Boolean),
    inferenceStatus: claim.support === 'supported' ? 'source-backed fact' : 'mixed evidence and analyst inference',
    hasExplicitFalsifier: /falsif|weakens if|fails if/i.test(claim.text)
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
  if (!acceptedThroughPreserved) throw new Error('Push 1 must not advance or rewrite the SEC accepted-through clock.');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const preview = {
    mode: APPLY ? 'apply' : 'dry-run', idempotent: false,
    before: summarize(page), after: summarize(push.candidate),
    addedSourceCount: push.addedSourceCount, addedClaimCount: push.addedClaimCount,
    regradedClaimCount: push.regradedClaimCount, quality, strict,
    comparison: comparison.counts, acceptedThroughPreserved,
    publicProofHeadRequiresReacceptance: true, researchAsOf: RESEARCH_AS_OF
  };
  const dryRunPath = writeJson(`dry-run-${stamp}.json`, preview);
  const matrixPath = writeJson(`claim-source-matrix-${stamp}.json`, claimSourceMatrix(push.candidate));
  const comparisonPath = writeJson(`comparison-${stamp}.json`, comparison);
  if (!APPLY) {
    console.log(JSON.stringify({ ...preview, dryRunPath, matrixPath, comparisonPath }, null, 2));
    return;
  }

  const beforePath = writeJson(`before-${stamp}.json`, {
    capturedAt: new Date().toISOString(), page: page.toObject({ virtuals: false }), preview
  });
  const researchEvent = new WikiSourceEvent({
    userId: page.userId, sourceType: 'external', provider: 'nvidia-workload-economics-review',
    externalId: `nvidia-workload-economics-push1:${RESEARCH_AS_OF.toISOString()}`,
    eventType: 'updated', title: 'NVIDIA workload-economics and heterogeneous-infrastructure review',
    summary: 'A primary-source and peer-reviewed research pass added the merchant-GPU/custom-ASIC decision model, prefill/decode decomposition, retained-content hypothesis, and explicit falsifiers.',
    text: 'This is an as-of research compilation. It does not advance the SEC filing clock and does not claim Noeis observed the cited product or research publications in real time.',
    url: SOURCES.find(source => source.key === 'splitwise').url,
    sourceUpdatedAt: RESEARCH_AS_OF, status: 'processed', affectedPageIds: [page._id], processedAt: new Date(),
    metadata: {
      source: 'nvidia-workload-economics-review', sourceUrls: SOURCES.map(source => source.url),
      researchRevision: true, maintenanceClockEligible: false, asOf: RESEARCH_AS_OF
    }
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
    sourceVersion: {
      provider: 'nvidia-workload-economics-review', asOf: RESEARCH_AS_OF,
      sourceCount: SOURCES.length, researchRevision: true, maintenanceClockEligible: false
    },
    quality: { ...quality, strict, comparison },
    summary: 'Added Push 1 workload economics, prefill/decode disaggregation, custom-silicon break-even, retained-content scenarios, and falsifiers.'
  });

  const clock = before.publicProof?.acceptedClocks?.find(row => row.type === 'sec_edgar');
  if (!clock) throw new Error('The existing proven record has no SEC clock.');
  const [clockEvent, clockRevision] = await Promise.all([
    WikiSourceEvent.findById(clock.sourceEventId),
    WikiRevision.findById(clock.revisionId)
  ]);
  if (!clockEvent || !clockRevision) throw new Error('The existing accepted SEC clock cannot be resolved.');
  const acceptance = buildSecPublicProofAcceptance({
    page, requestedClocks: [{ sourceEventId: clockEvent._id, revisionId: clockRevision._id }],
    events: [clockEvent], revisions: [clockRevision, revision], acceptedHeadRevision: revision,
    comparison, researchAsOf: RESEARCH_AS_OF,
    identity: { ticker: 'NVDA', cik: '0001045810', titlePattern: /NVIDIA/ },
    reason: 'The historical SEC maintenance clock remains pinned to the June 2026 filing, while the current Push 1 research head passed claim-level citation, support-grade, comparison, and falsifier review.',
    now: new Date()
  });
  if (!acceptance.ok) throw new Error(`Head-bound acceptance failed: ${acceptance.errors.join(' ')}`);
  page.publicProof = acceptance.record;
  page.markModified('publicProof');
  await page.save();

  const result = {
    ...preview, mode: 'apply', page: summarize(page), researchEventId: id(researchEvent),
    revisionId: id(revision), acceptedHeadRevisionId: acceptance.record.acceptanceSnapshot.revisionId,
    beforePath, dryRunPath, matrixPath, comparisonPath,
    invariants: {
      acceptedThroughPreserved: JSON.stringify(before.freshness?.acceptedThrough) === JSON.stringify(page.freshness?.acceptedThrough),
      secClockRevisionPreserved: acceptance.record.acceptedClocks.some(row => row.type === 'sec_edgar' && row.revisionId === id(clockRevision)),
      currentHeadBound: acceptance.record.acceptanceSnapshot.headContentHash === buildPublicProofHeadHash(page),
      researchEventClockEligible: false
    },
    rollback: {
      pageId: id(page), researchEventId: id(researchEvent), revisionId: id(revision),
      restoreSnapshotFrom: beforePath
    }
  };
  const resultPath = writeJson(`result-${stamp}.json`, result);
  console.log(JSON.stringify({ ...result, resultPath }, null, 2));
};

if (require.main === module) main()
  .catch(error => { console.error(error.stack || error.message); process.exitCode = 1; })
  .finally(async () => { try { await mongoose.disconnect(); } catch (_error) {} });

module.exports = { APPLY, RESEARCH_AS_OF, REGRADE, SECTIONS, SOURCES, applyPush, strictValidate };
