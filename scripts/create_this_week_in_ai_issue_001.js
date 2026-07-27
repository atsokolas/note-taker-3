#!/usr/bin/env node
require('dotenv').config();

const mongoose = require('mongoose');
const { WikiPage, WikiRevision, NoeisReceipt } = require('../server/models');
const { createWeekendReadingsDraft, buildWeekendReadingsDraft } = require('../server/services/weekendReadingsService');

const APPLY = process.argv.includes('--apply') || process.env.APPLY === '1';
const OWNER_REFERENCE_PAGE_ID = process.env.NOEIS_OWNER_REFERENCE_PAGE_ID || '6a62aa71a5153ffa3255d6de';

const ISSUE_INPUT = Object.freeze({
  publicationProfile: 'this_week_in_ai',
  editionNumber: 1,
  windowStart: '2026-07-20',
  windowEnd: '2026-07-26',
  authorLabel: 'Athan Tsokolas',
  governingQuestion: 'Where is technically consequential AI progress coming from now: larger models and more hardware, or better control over how models learn, act, and use the hardware already deployed?',
  weeklyThesis: 'The strongest evidence this week points toward controlled utilization as an increasingly important source of progress. At the model layer, structured, executable verification can turn self-generated experience into real capability gains, but procedural skills also break tasks that an unassisted agent already solved. At the systems layer, tile-aware modeling and fine-grained computation/communication overlap can reclaim meaningful performance from existing accelerators, but the gains depend on workload structure and do not transfer automatically.',
  editorialNote: 'Four papers survived the consequence gate. Together they strengthen the view that AI progress will increasingly depend on instrumentation, verification, and workload-specific co-design. They weaken two simpler beliefs: that procedural skills are monotonically helpful, and that hardware performance can be understood from peak compute or aggregate bandwidth alone. This does not show that scaling has stopped. It shows that the gap between theoretical capability and delivered useful work is large enough to be its own technical and economic frontier.',
  crossLayerSynthesis: 'Skill Self-Play and fine-grained MoE overlap make the same architectural move at different layers: replace a coarse sequential loop with an instrumented feedback loop that exposes intermediate readiness. The Regression Tax and TileSight supply corresponding measurement systems, decomposing aggregate agent gains and aggregate hardware limits into actionable mechanisms. The commercial implication is that useful-work efficiency may become a more important competitive variable than nominal model size or peak accelerator throughput.',
  strongestCounterargument: 'All four papers are preprints or narrowly bounded systems results. Two study skills in constrained, verifiable tasks; two study regular GPU workloads on limited hardware configurations. They may be local optimizations rather than a broad regime change, while frontier capability continues to be driven overwhelmingly by scale. This issue upgrades controlled utilization as a research direction; it does not establish its share of future AI progress.',
  maintainedObjectUpdates: [
    'Verified self-improvement — add the candidate claim that executable validators and evolving curricula can outperform unguided self-play on bounded task families; keep generalization beyond those families unresolved.',
    'Agent skills and reliability — replace aggregate-only evaluation with paired gains, regressions, and residual failures; add grounding and verification displacement as candidate failure mechanisms.',
    'GPU performance modeling — add tile-centric first-principles modeling as a credible alternative to architecture-trained predictors for regular workloads; retain an explicit irregular and small-batch boundary.',
    'MoE execution economics — split “network bottleneck” into bandwidth, readiness, scheduling, and resource-partition components.'
  ],
  watchNext: [
    'Independent reproduction of Skill-SP and transfer to software engineering, web agents, multimodal environments, and stronger models.',
    'Controlled ablations that causally isolate skill-description osmosis, grounding displacement, and verification displacement.',
    'TileSight source release and third-party accuracy on untested hardware, irregular operators, and small-batch decode.',
    'MoE overlap on Blackwell, multi-node fabrics, production serving distributions, and the backward pass.',
    'Evidence connecting utilization gains to cost per successful task rather than isolated benchmark accuracy or kernel throughput.'
  ],
  items: [
    {
      title: 'Skill Self-Play: Pushing the Frontier of LLM Capability with Co-Evolving Skills',
      url: 'https://arxiv.org/abs/2607.22529',
      publishedAt: '2026-07-24T17:59:22.000Z',
      sourceLabel: 'arXiv:2607.22529',
      sourceQuality: 'primary',
      readingRole: 'thesis_evidence',
      evidenceLayer: 'models_methods',
      whyItMatters: 'Skill-SP joins a task proposer, solver, and evolving skill controller so generated tasks carry structural rules and executable validators while a separate exploration stream preserves diversity. Across five 3B–14B backbones, API-Bank, BFCL, and ZebraLogic, the authors report smaller but consistent gains for competent models and large recoveries for initially misaligned models.',
      evidenceAssessment: 'The paper tests multiple backbones and two verifiable task families, compares against unguided self-play, and ablates static routing, frozen skills, and frozen proposer/solver components. The extreme 42.9-point tool-use gain is primarily a recovery from a weak starting configuration; competent Qwen and Granite models gain 2.8–6.5 points.',
      consequence: 'Verifier design and curriculum control may matter more than raw self-generated data volume. Skills are potentially valuable as training-time interfaces that bind generation rules to executable validation, not merely as reusable inference prompts.',
      priorBelief: 'Self-play becomes broader as task generation becomes more open-ended.',
      updatedBelief: 'Open-ended generation without verification-bearing structure can starve or corrupt the learning loop; constrained diversity may scale better than unconstrained diversity.',
      publicRelationship: 'Verified self-improvement and curriculum design.',
      boundary: 'The evidence covers tool-call prediction and deterministic logic puzzles, not open-ended research, software engineering, multimodal action, or frontier-scale models. The base model needs enough capability to bootstrap valid tasks, fixed routing heuristics require tuning, and independent replication is not available.'
    },
    {
      title: 'The Regression Tax: Decomposing Why Skills Help and Hurt LLM Agents',
      url: 'https://arxiv.org/abs/2607.22520',
      publishedAt: '2026-07-24T17:50:03.000Z',
      sourceLabel: 'arXiv:2607.22520',
      sourceQuality: 'primary',
      readingRole: 'counterevidence',
      evidenceLayer: 'evaluation_counterevidence',
      whyItMatters: 'Across 5,832 task-condition runs on two office-automation benchmarks and three model/harness stacks, every evaluated skill library broke some tasks the no-skill baseline solved. The authors count 553 gains and 324 regressions, so regressions offset 59% of gross gains.',
      evidenceAssessment: 'Paired task outcomes reveal information hidden by average pass-rate changes, and spreadsheet-grader artifacts are separated before interpretation. Only three of eighteen net comparisons survive Bonferroni correction, all on the same Claude Code/sonnet-4.6 SpreadsheetBench stack. Proposed mechanisms are observational and single-coded.',
      consequence: 'Agent skills should be evaluated with a gain/regression matrix against an unassisted baseline. Grounding and verification deserve first-class measures rather than being hidden inside net task success.',
      priorBelief: 'A skill that improves aggregate benchmark performance is probably a useful addition.',
      updatedBelief: 'Aggregate improvement is insufficient; procedural context redistributes capability and can impose a large regression tax.',
      publicRelationship: 'Agent skills, grounding, verification, and reliability measurement.',
      boundary: 'Both benchmarks emphasize office automation, grounding, and output format. Model and harness effects are coupled, most net comparisons are statistically inconclusive, and the mechanisms need multi-coder review and controlled content interventions.'
    },
    {
      title: 'TileSight: A First-Principles Tile-Centric Analytical GPU Performance Model from Cores to Clusters',
      url: 'https://arxiv.org/abs/2607.22432',
      publishedAt: '2026-07-24T15:50:23.000Z',
      sourceLabel: 'arXiv:2607.22432',
      sourceQuality: 'primary',
      readingRole: 'thesis_evidence',
      evidenceLayer: 'infrastructure_systems',
      whyItMatters: 'TileSight uses the tile as a shared model of compute/memory overlap, cache reuse, and inter-GPU communication. It reports 12.35% pooled latency MAPE across 703 tensor-core GEMM shapes on four NVIDIA generations and 13.52% weighted MAPE across 166 vLLM configurations.',
      evidenceAssessment: 'The evaluation covers multiple GPU generations, an AMD check, single-GPU kernels, distributed kernels, and dense and MoE serving. It compares learned, analytical, and roofline baselines and exposes interpretable error sources. Several baselines lack native support for newer architectures or MoE, weakening simple head-to-head interpretation.',
      consequence: 'Portable white-box performance models could reduce profiling and per-architecture retraining in kernel and serving optimization, increasing the value of compiler/runtime intelligence relative to peak device specifications.',
      priorBelief: 'Modern GPU performance is too interaction-heavy for useful first-principles prediction across architectures.',
      updatedBelief: 'For regular tile-structured workloads, a physically grounded tile abstraction may predict and optimize across kernels, caches, and networks without per-architecture model training.',
      publicRelationship: 'GPU performance modeling, compilers, and heterogeneous inference.',
      boundary: 'TileSight does not cover data-dependent control flow, irregular memory access, undocumented scheduling, closed runtimes, or important small-batch latency cases. The authors say code will be released upon publication, so reproducibility remains incomplete.'
    },
    {
      title: 'Fine-grained Computation-Communication Overlap via Tile-level Signaling and Scheduling for Mixture-of-Experts',
      url: 'https://arxiv.org/abs/2607.19539',
      publishedAt: '2026-07-21T19:40:06.000Z',
      sourceLabel: 'arXiv:2607.19539',
      sourceQuality: 'primary',
      readingRole: 'thesis_evidence',
      evidenceLayer: 'infrastructure_systems',
      whyItMatters: 'The system begins returning completed MoE expert tiles while other expert computation is still running. On one four-A100 NVLink node, it reports up to 2.64× end-to-end and 2.74× MoE-layer speedup versus FasterMoE, while gains against stronger baselines are materially smaller and disappear on one small-hidden-dimension configuration.',
      evidenceAssessment: 'The paper compares four systems, three model configurations, multiple expert counts and routing skews, SM partitions, and 1,440 reported correctness checks. It reveals when communication moves off the critical path and when insufficient consumer resources create back-pressure. The maximum headline is not representative of every baseline comparison.',
      consequence: 'MoE economics depend on communication readiness and scheduling as well as sparse arithmetic and network bandwidth. Persistent kernels and early tile-level signaling can convert exposed all-to-all time into useful overlap.',
      priorBelief: 'MoE communication overhead is primarily a network-bandwidth problem.',
      updatedBelief: 'A material part can be a readiness and scheduling problem because software waits for coarse compute completion before communicating.',
      publicRelationship: 'Mixture-of-experts execution economics.',
      boundary: 'The evidence is single-node, four-A100, forward-pass inference. It does not establish multi-node scaling, Blackwell behavior, training/backward-pass gains, adaptive SM allocation, or production reliability.'
    }
  ]
});

const safeSummary = draft => ({
  editionKey: draft.editionKey,
  title: draft.title,
  status: draft.page.status,
  visibility: draft.page.visibility,
  sourceCount: draft.page.sourceRefs.length,
  wordCount: String(draft.plainText || '').split(/\s+/).filter(Boolean).length,
  artifactType: draft.page.sourceRefs[0]?.metadata?.weekendReadings?.artifactType || ''
});

const main = async () => {
  const preview = buildWeekendReadingsDraft({ ...ISSUE_INPUT, ownerId: 'preview-owner' });
  if (!APPLY) {
    process.stdout.write(`${JSON.stringify({ mode: 'dry-run', candidate: safeSummary(preview) }, null, 2)}\n`);
    return;
  }
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required for --apply.');
  if (!mongoose.isValidObjectId(OWNER_REFERENCE_PAGE_ID)) throw new Error('NOEIS_OWNER_REFERENCE_PAGE_ID must be a Mongo ObjectId.');
  await mongoose.connect(process.env.MONGODB_URI);
  try {
    const referencePage = await WikiPage.findOne({ _id: OWNER_REFERENCE_PAGE_ID, status: { $ne: 'archived' } }).select('_id userId');
    if (!referencePage?.userId) throw new Error('Owner reference page was not found.');
    const result = await createWeekendReadingsDraft({
      ...ISSUE_INPUT,
      WikiPage,
      WikiRevision,
      NoeisReceipt,
      userId: referencePage.userId,
      buildUniqueSlug: async () => 'this-week-in-ai-2026-07-26-issue-001'
    });
    process.stdout.write(`${JSON.stringify({
      mode: 'apply',
      created: result.created,
      pageId: String(result.page?._id || ''),
      slug: result.page?.slug || '',
      candidate: safeSummary(result.draft),
      receiptId: result.receipt?.receiptId || result.receipt?.id || null,
      nextAction: result.receipt?.nextAction || null
    }, null, 2)}\n`);
  } finally {
    await mongoose.disconnect();
  }
};

if (require.main === module) {
  main().catch(async error => {
    process.stderr.write(`${error.stack || error.message}\n`);
    if (mongoose.connection.readyState) await mongoose.disconnect();
    process.exitCode = 1;
  });
}

module.exports = { ISSUE_INPUT, safeSummary };
