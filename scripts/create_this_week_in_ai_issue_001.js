#!/usr/bin/env node
require('dotenv').config();

const mongoose = require('mongoose');
const { Article, Connection, WikiPage, WikiRevision, NoeisReceipt } = require('../server/models');
const { createWeekendReadingsDraft, buildWeekendReadingsDraft } = require('../server/services/weekendReadingsService');
const {
  buildResearchEditionLibraryNote,
  ensureResearchEditionLibraryItems
} = require('../server/services/researchEditionLibraryService');

const APPLY = process.argv.includes('--apply') || process.env.APPLY === '1';
const REPLACE_DRAFT = process.argv.includes('--replace-draft') || process.env.REPLACE_DRAFT === '1';
const OWNER_REFERENCE_PAGE_ID = process.env.NOEIS_OWNER_REFERENCE_PAGE_ID || '6a62aa71a5153ffa3255d6de';

const ISSUE_INPUT = Object.freeze({
  publicationProfile: 'this_week_in_ai',
  editionNumber: 1,
  windowStart: '2026-07-20',
  windowEnd: '2026-07-26',
  authorLabel: 'Athan Tsokolas',
  editorialNote: 'The week’s most consequential papers concentrated on a shared technical problem: turning nominal capability into reliable useful work. Two papers examine how procedural structure and verification affect model agents; two examine how better execution models and finer scheduling recover accelerator performance. None establishes a general replacement for scaling, but together they show why measurement and control increasingly matter at both the model and systems layers.',
  weeklyHighlights: [
    'Self-play improves when generated tasks carry executable validators and an evolving curriculum, although the evidence is limited to bounded task families.',
    'Agent skills can create regressions that aggregate benchmark scores hide; paired gains and losses are a more informative reliability measure.',
    'Tile-centric analytical models may predict regular GPU workloads across hardware generations without architecture-specific retraining.',
    'Fine-grained signaling can overlap MoE computation and communication, but the reported gains narrow against stronger baselines and do not cover multi-node production systems.'
  ],
  connectingThread: 'All four papers replace a coarse aggregate with a more useful unit of analysis. Skill Self-Play examines validator-backed tasks rather than undifferentiated synthetic data. The Regression Tax separates newly solved tasks from newly broken ones rather than relying on a net score. TileSight models tiles rather than only peak compute and bandwidth, while the MoE work schedules outputs as they become ready rather than waiting for an entire layer. Across the stack, the common theme is that exposing intermediate state enables better control—but each result remains bounded by its workload, benchmark, or hardware configuration.',
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
      technicalApproach: 'A proposer generates tasks under skill-defined rules, a solver attempts them, and executable validators determine whether examples are usable. A controller evolves and routes skills while a separate exploration stream prevents the curriculum from collapsing onto a narrow set of tasks.',
      evidenceAssessment: 'The paper tests multiple backbones and two verifiable task families, compares against unguided self-play, and ablates static routing, frozen skills, and frozen proposer/solver components. The extreme 42.9-point tool-use gain is primarily a recovery from a weak starting configuration; competent Qwen and Granite models gain 2.8–6.5 points.',
      consequence: 'Verifier design and curriculum control may matter more than raw self-generated data volume. Skills are potentially valuable as training-time interfaces that bind generation rules to executable validation, not merely as reusable inference prompts.',
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
      technicalApproach: 'The study compares each task with and without a skill library, classifies transitions as gains, regressions, persistent successes, or persistent failures, and inspects paired traces for changes in grounding, procedure following, and verification.',
      evidenceAssessment: 'Paired task outcomes reveal information hidden by average pass-rate changes, and spreadsheet-grader artifacts are separated before interpretation. Only three of eighteen net comparisons survive Bonferroni correction, all on the same Claude Code/sonnet-4.6 SpreadsheetBench stack. Proposed mechanisms are observational and single-coded.',
      consequence: 'Agent skills should be evaluated with a gain/regression matrix against an unassisted baseline. Grounding and verification deserve first-class measures rather than being hidden inside net task success.',
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
      technicalApproach: 'The model represents kernels and distributed serving as tile-level work moving through compute, memory, cache, and communication resources. It derives latency from hardware and workload parameters instead of fitting a separate learned predictor for every architecture.',
      evidenceAssessment: 'The evaluation covers multiple GPU generations, an AMD check, single-GPU kernels, distributed kernels, and dense and MoE serving. It compares learned, analytical, and roofline baselines and exposes interpretable error sources. Several baselines lack native support for newer architectures or MoE, weakening simple head-to-head interpretation.',
      consequence: 'Portable white-box performance models could reduce profiling and per-architecture retraining in kernel and serving optimization, increasing the value of compiler/runtime intelligence relative to peak device specifications.',
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
      technicalApproach: 'A persistent producer kernel computes expert tiles and signals readiness at tile granularity. A communication consumer assigned its own streaming multiprocessors transmits completed outputs before the remaining expert work finishes, moving part of the all-to-all exchange off the critical path.',
      evidenceAssessment: 'The paper compares four systems, three model configurations, multiple expert counts and routing skews, SM partitions, and 1,440 reported correctness checks. It reveals when communication moves off the critical path and when insufficient consumer resources create back-pressure. The maximum headline is not representative of every baseline comparison.',
      consequence: 'MoE economics depend on communication readiness and scheduling as well as sparse arithmetic and network bandwidth. Persistent kernels and early tile-level signaling can convert exposed all-to-all time into useful overlap.',
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

const ensureIssueLibraryItems = async ({ ArticleModel = Article, userId, items = ISSUE_INPUT.items } = {}) => {
  return ensureResearchEditionLibraryItems({
    Article: ArticleModel,
    userId,
    items,
    publicationTitle: 'This Week in AI — Issue 001'
  });
};

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
    const libraryItems = await ensureIssueLibraryItems({
      userId: referencePage.userId,
      items: ISSUE_INPUT.items
    });
    const result = await createWeekendReadingsDraft({
      ...ISSUE_INPUT,
      items: libraryItems,
      replaceExistingDraft: REPLACE_DRAFT,
      WikiPage,
      WikiRevision,
      NoeisReceipt,
      Connection,
      userId: referencePage.userId,
      buildUniqueSlug: async () => 'this-week-in-ai-2026-07-26-issue-001'
    });
    process.stdout.write(`${JSON.stringify({
      mode: 'apply',
      created: result.created,
      updated: result.updated,
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

module.exports = {
  ISSUE_INPUT,
  buildLibraryNote: item => buildResearchEditionLibraryNote(item, { publicationTitle: 'This Week in AI — Issue 001' }),
  ensureIssueLibraryItems,
  safeSummary
};
