#!/usr/bin/env node
require('dotenv').config();

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const {
  WikiPage,
  WikiRevision,
  WikiRepoBaseline
} = require('../server/models');
const { createWikiRevision } = require('../server/services/wikiRevisionService');
const { captureRepoBaseline } = require('../server/services/wikiRepoComparisonService');
const { evaluateWikiArticleQuality } = require('../server/services/wikiMaintenanceService');

const DEFAULT_SOURCE_PAGE_ID = '6a52e89076aba1fac97456e7';
const TARGET_TITLE = 'openai/openai-agents-js — maintained developer dossier';
const TARGET_SLUG = 'openai-agents-js-maintained-developer-dossier-acceptance-2026-07-19';
const EXPECTED_OWNER = 'openai';
const EXPECTED_REPO = 'openai-agents-js';
const EXPECTED_HEAD = '710cccfd8fd26b395f8e3470419852d76de80967';
const GENERATOR_VERSION = 'editorial-primary-sources-v1';
const OUTPUT_DIR = path.resolve(
  process.env.OPENAI_AGENTS_PROOF_OUTPUT
    || path.join(process.cwd(), 'output', 'openai-agents-proof-baseline-2026-07-19')
);

const EXTRA_SOURCES = Object.freeze([
  {
    path: 'README.md',
    blobSha: 'f729a2df6f0e47230c998bd0d65c69d62a277c21',
    title: 'openai/openai-agents-js README.md',
    snippet: 'Official overview, supported runtimes, installation, and the SDK core concepts.',
    evidenceType: 'document'
  },
  {
    path: 'docs/src/content/docs/guides/running-agents.mdx',
    blobSha: 'cc52609edde7dd1b86cd4d18929a8b00ddaf37da',
    title: 'OpenAI Agents SDK — Running agents',
    snippet: 'Official Runner lifecycle, run options, state strategies, error behavior, and resume semantics.',
    evidenceType: 'document'
  },
  {
    path: 'docs/src/content/docs/guides/tracing.mdx',
    blobSha: '959675b77d45f6bcf8ccffaf92c24a497d3ff022',
    title: 'OpenAI Agents SDK — Tracing',
    snippet: 'Official tracing lifecycle, spans, sensitive-data controls, and processor configuration.',
    evidenceType: 'document'
  },
  {
    path: 'docs/src/content/docs/guides/sessions.mdx',
    blobSha: 'daf8c2db97344556bae5edc2e10daee3dfd56d45',
    title: 'OpenAI Agents SDK — Sessions',
    snippet: 'Official persistent conversation-history and session lifecycle guidance.',
    evidenceType: 'document'
  },
  {
    path: 'docs/src/content/docs/guides/voice-agents.mdx',
    blobSha: '1d13f35beb25ae123191c798d55f66ea55ab9b6b',
    title: 'OpenAI Agents SDK — Voice agents',
    snippet: 'Official RealtimeAgent and RealtimeSession architecture overview.',
    evidenceType: 'document'
  }
]);

const ARTICLE = Object.freeze([
  {
    type: 'paragraph',
    section: TARGET_TITLE,
    paths: ['README.md', 'packages/agents-core/src/agent.ts', 'packages/agents-core/src/run.ts'],
    text: 'The OpenAI Agents SDK for JavaScript and TypeScript is best understood as a small orchestration runtime rather than a catalogue of agent patterns. An Agent describes instructions, models, tools, guardrails, and possible handoffs; the Runner executes that definition across model turns and tool calls until it reaches a final output or a stopping condition. The repository also carries distinct packages for the provider-neutral core, OpenAI-specific integrations, realtime voice, extensions, and the public convenience entry point. That separation is the central architectural fact a contributor should preserve.'
  },
  { type: 'heading', level: 2, text: 'The execution model' },
  {
    type: 'paragraph',
    section: 'The execution model',
    paths: ['docs/src/content/docs/guides/agents.mdx', 'packages/agents-core/src/agent.ts'],
    text: 'Agent is primarily configuration: a name and instructions, plus optional model selection, model settings, tools, MCP servers, handoffs, input guardrails, and output guardrails. Application dependencies belong in RunContext rather than being hidden in the prompt. This makes an agent definition a declarative boundary around behavior, while the code that invokes it still owns request-specific state, persistence, credentials, and policy.'
  },
  {
    type: 'paragraph',
    section: 'The execution model',
    paths: ['docs/src/content/docs/guides/running-agents.mdx', 'packages/agents-core/src/run.ts'],
    text: 'Runner owns the turn loop. A run accepts a string, input items, or a saved RunState; it can stream events, enforce a maximum number of turns, attach a session, filter model input, configure tool execution, and select tracing behavior. Reusing a Runner is the normal application shape because provider and tracing configuration live there. The convenience run() helper is suitable for smaller scripts but creates a default Runner around the same lifecycle.'
  },
  {
    type: 'paragraph',
    section: 'The execution model',
    paths: ['docs/src/content/docs/guides/running-agents.mdx', 'docs/src/content/docs/guides/sessions.mdx'],
    text: 'The SDK exposes several different forms of state and they are not interchangeable. result.history is client-managed turn history; a session is SDK-managed persistence backed by application storage; conversationId and previousResponseId use OpenAI-managed Responses API state; RunState captures an interrupted execution; and sandbox sessions or snapshots preserve filesystem state. Mixing more than one conversation-history strategy without deliberate reconciliation can duplicate context.'
  },
  { type: 'heading', level: 2, text: 'Orchestration: managers and handoffs' },
  {
    type: 'paragraph',
    section: 'Orchestration: managers and handoffs',
    paths: ['docs/src/content/docs/guides/multi-agent.md', 'docs/src/content/docs/guides/agents.mdx'],
    text: 'The repository supports two different delegation semantics. With agents as tools, a manager remains responsible for the user-facing run and calls specialists for bounded work. With handoffs, control transfers to the selected specialist inside the same run. The choice is therefore about ownership, not merely syntax: managers centralize final synthesis and shared policy, while handoffs narrow the active instructions and let a specialist speak directly.'
  },
  {
    type: 'paragraph',
    section: 'Orchestration: managers and handoffs',
    paths: ['docs/src/content/docs/guides/handoffs.mdx', 'packages/agents-core/src/handoff.ts'],
    text: 'A handoff is exposed to the model as a function-like routing option, but it uses a dedicated runtime path. Each destination should normally have its own registered handoff. inputType adds structured metadata chosen by the model, onHandoff lets the application act on that metadata, and inputFilter controls which history reaches the receiving agent. inputType does not dynamically select another destination and does not replace application state carried in RunContext.'
  },
  {
    type: 'paragraph',
    section: 'Orchestration: managers and handoffs',
    paths: ['packages/agents-core/src/agent.ts', 'packages/agents-core/src/handoff.ts', 'docs/src/content/docs/guides/human-in-the-loop.mdx'],
    text: 'Nested orchestration remains one resumable execution graph. Approval interruptions raised inside a handed-off agent or an agent invoked as a tool surface on the outer run. Serialized RunState records stable identities across handoffs and nested agent tools, but the process that resumes the state must reconstruct the compatible root graph. Changing the graph or SDK version while approvals are outstanding is therefore an application migration concern, not something the serializer can make risk-free.'
  },
  { type: 'heading', level: 2, text: 'Tools, MCP, and approval boundaries' },
  {
    type: 'paragraph',
    section: 'Tools, MCP, and approval boundaries',
    paths: ['packages/agents-core/src/tool.ts', 'packages/agents-openai/src/tools.ts'],
    text: 'Tool is a family of runtime contracts rather than one callback shape. The core package defines local function tools and execution behavior, while the OpenAI integration adds hosted capabilities. Tool schemas, execution errors, approval requirements, and model-visible results are part of the public boundary. A change that only looks like a TypeScript refactor can therefore alter what the model is allowed to request or what the run records after execution.'
  },
  {
    type: 'paragraph',
    section: 'Tools, MCP, and approval boundaries',
    paths: ['docs/src/content/docs/guides/mcp.mdx', 'packages/agents-extensions/src/index.ts'],
    text: 'MCP support spans three current transports: hosted MCP tools executed through the Responses API, Streamable HTTP servers called by the SDK, and stdio servers for local processes; legacy SSE support remains but is not the preferred new transport. Hosted MCP can require per-tool approval, and local MCP configuration can normalize schemas, control model-visible errors, prefix tool names, and filter exposed tools. Those controls matter because connecting a server and safely exposing its entire tool catalogue are different decisions.'
  },
  {
    type: 'paragraph',
    section: 'Tools, MCP, and approval boundaries',
    paths: ['docs/src/content/docs/guides/guardrails.mdx', 'docs/src/content/docs/guides/human-in-the-loop.mdx'],
    text: 'Guardrails operate at specific workflow boundaries. Agent input guardrails apply to the first agent input, output guardrails apply to the final agent output, and function-tool guardrails wrap individual local function calls. Tool guardrails do not automatically protect the handoff path, hosted tools, built-in execution tools, or agent.asTool(). For a local function tool that also needs approval, preApprovalInputGuardrails can validate before the interruption is shown, but the guardrail runs again immediately before execution after approval.'
  },
  {
    type: 'paragraph',
    section: 'Tools, MCP, and approval boundaries',
    paths: ['docs/src/content/docs/guides/human-in-the-loop.mdx', 'packages/agents-core/src/run.ts'],
    text: 'Human approval pauses rather than destroys the run. Pending tool calls are returned as interruptions, the application approves or rejects them on result.state, and the same RunState is passed back to resume. The state can be serialized for longer waits, but it contains application context and runtime metadata. Treat it as persisted sensitive data; tracing credentials are omitted by default, while other secrets placed in context can still travel with the serialized state.'
  },
  { type: 'heading', level: 2, text: 'Models, providers, sessions, and tracing' },
  {
    type: 'paragraph',
    section: 'Models, providers, sessions, and tracing',
    paths: ['packages/agents-core/src/model.ts', 'docs/src/content/docs/guides/models.mdx'],
    text: 'The core model interface is provider-neutral, and Runner can resolve model names through a ModelProvider. The default distribution is optimized for OpenAI, but the architecture permits another provider to implement the same request, response, streaming, usage, and tool-call contracts. Provider neutrality should not be confused with identical behavior: model settings, reasoning items, hosted tools, server-managed conversation state, and response metadata can remain provider-specific.'
  },
  {
    type: 'paragraph',
    section: 'Models, providers, sessions, and tracing',
    paths: ['docs/src/content/docs/guides/sessions.mdx', 'docs/src/content/docs/guides/running-agents.mdx'],
    text: 'Sessions are the SDK abstraction for durable conversation history. The same session should be supplied when an interrupted RunState resumes so the resumed turn is appended without re-preparing the input. Applications should also decide where redaction occurs: callModelInputFilter runs immediately before the model call, and with sessions the filtered clones are what persist. That makes the filter part of both privacy and future-context behavior.'
  },
  {
    type: 'paragraph',
    section: 'Models, providers, sessions, and tracing',
    paths: ['docs/src/content/docs/guides/tracing.mdx', 'packages/agents-core/src/run.ts'],
    text: 'Tracing is integrated into the execution model: a run produces a trace, and model generations, agent spans, function tools, guardrails, and handoffs create subordinate spans. It is enabled by default in supported server runtimes and can be disabled or routed through custom processors. Because traces can include model and tool data, traceIncludeSensitiveData and exporter configuration are production controls rather than optional observability polish.'
  },
  { type: 'heading', level: 2, text: 'Realtime is a related runtime, not a thin flag' },
  {
    type: 'paragraph',
    section: 'Realtime is a related runtime, not a thin flag',
    paths: ['docs/src/content/docs/guides/voice-agents.mdx', 'packages/agents-realtime/src/index.ts', 'packages/agents-realtime/src/tool.ts'],
    text: 'RealtimeAgent and RealtimeSession adapt the agent vocabulary to low-latency spoken interaction, but the transport and lifecycle are distinct from a normal text Runner. The realtime package owns session connection, audio and event handling, and realtime-compatible tools. Browser deployments should use short-lived client tokens created by a server; placing a long-lived server API key in the browser would violate the repository’s own setup guidance.'
  },
  { type: 'heading', level: 2, text: 'Where to make changes' },
  {
    type: 'paragraph',
    section: 'Where to make changes',
    paths: ['packages/agents-core/src/agent.ts', 'packages/agents-core/src/run.ts', 'packages/agents-core/src/tool.ts', 'packages/agents-core/src/handoff.ts', 'packages/agents-core/src/model.ts'],
    text: 'Start in packages/agents-core/src/agent.ts for agent configuration, packages/agents-core/src/run.ts for the execution loop and saved state, packages/agents-core/src/tool.ts for local tool contracts, packages/agents-core/src/handoff.ts for delegation, and packages/agents-core/src/model.ts for the provider boundary. These files are coupled by public types, so changes to one should be traced through exported entry points and the tests that exercise the corresponding runtime path.'
  },
  {
    type: 'paragraph',
    section: 'Where to make changes',
    paths: ['packages/agents/src/index.ts', 'packages/agents-openai/src/index.ts', 'packages/agents-extensions/src/index.ts', 'packages/agents-realtime/src/index.ts'],
    text: 'Package ownership is deliberate. packages/agents/src/index.ts is the convenience public package; packages/agents-openai/src/index.ts owns OpenAI-specific integration; packages/agents-extensions/src/index.ts collects optional extensions; and packages/agents-realtime/src/index.ts owns realtime exports. Adding a feature at the umbrella entry point without placing its implementation in the correct package can create circular dependencies or make provider-specific behavior appear universal.'
  },
  { type: 'heading', level: 2, text: 'Run and prove changes' },
  {
    type: 'paragraph',
    section: 'Run and prove changes',
    paths: ['README.md', 'package.json', 'CONTRIBUTING.md'],
    text: 'The repository declares pnpm as its package manager and requires Node.js 22 or later for the documented runtime. Install the published SDK with npm install @openai/agents zod; for repository work, follow CONTRIBUTING.md and the pnpm workspace. From the repository root, the declared package scripts are npm run dev for the local development runner, npm test for the Vitest suite, npm run test:integration for integration coverage, npm run lint for ESLint, and npm run build for the multi-package TypeScript build. The equivalent pnpm invocations use the same script names. Declared scripts prove invocation, not that a particular commit passed CI.'
  },
  {
    type: 'paragraph',
    section: 'Run and prove changes',
    paths: ['package.json', 'AGENTS.md'],
    text: 'Choose the narrowest proof that matches the package and then widen it when a change crosses boundaries. Formatting, linting, unit tests, integration tests, examples, documentation, bundles, and the workspace build are separate scripts. The repository’s AGENTS.md adds contributor-specific operating instructions; it should be read before edits rather than inferred from package.json. Release or deployment health remains unknown unless current workflow evidence is inspected separately.'
  },
  { type: 'heading', level: 2, text: 'Current clock and known limits' },
  {
    type: 'paragraph',
    section: 'Current clock and known limits',
    paths: ['README.md', 'release:v0.13.5'],
    text: 'This baseline is pinned to repository head 710cccfd8fd26b395f8e3470419852d76de80967 and release v0.13.5. It describes the contracts present in those sources; it does not claim that main, npm, hosted documentation, or CI remains identical afterward. The GitHub watcher is the clock that will test the dossier: a later accepted version must identify changed source paths, preserve unaffected claims, rewrite only claims whose evidence changed, and keep weaker candidates out of the trusted page.'
  },
  {
    type: 'paragraph',
    section: 'Current clock and known limits',
    paths: ['docs/src/content/docs/guides/human-in-the-loop.mdx', 'docs/src/content/docs/guides/running-agents.mdx', 'docs/src/content/docs/guides/tracing.mdx'],
    support: 'partial',
    text: 'The main operational risks are boundary mistakes: assuming guardrails protect every nested path, persisting sensitive RunContext inside serialized state, mixing conversation-state strategies, treating provider-neutral interfaces as provider-identical behavior, or enabling rich tracing without an explicit data policy. These are documented constraints and engineering inferences from the runtime contracts, not claims that a specific production deployment is currently misconfigured.'
  }
]);

const clonePlain = value => JSON.parse(JSON.stringify(value ?? null));
const clean = (value = '') => String(value || '').replace(/\s+/g, ' ').trim();
const wordCount = value => clean(value).split(/\s+/).filter(Boolean).length;
const claimId = text => `claim-${crypto.createHash('sha256').update(text).digest('hex').slice(0, 16)}`;
const sourcePath = source => clean(source?.metadata?.path || source?.path || '');

const extraSourceRef = (row, now = new Date()) => ({
  _id: new mongoose.Types.ObjectId(),
  type: 'external',
  objectId: null,
  parentObjectId: null,
  title: row.title,
  snippet: row.snippet,
  url: `https://github.com/${EXPECTED_OWNER}/${EXPECTED_REPO}/blob/${EXPECTED_HEAD}/${row.path}`,
  citationLabel: row.path,
  provider: 'github',
  metadata: {
    owner: EXPECTED_OWNER,
    repo: EXPECTED_REPO,
    path: row.path,
    blobSha: row.blobSha,
    commitSha: EXPECTED_HEAD,
    evidenceType: row.evidenceType
  },
  addedBy: 'user',
  createdAt: now
});

const cloneSourceRefs = (sourcePage, now = new Date()) => {
  const refs = (sourcePage.sourceRefs || []).map((source) => {
    const plain = source?.toObject ? source.toObject() : clonePlain(source);
    return {
      ...plain,
      _id: new mongoose.Types.ObjectId(),
      objectId: plain.objectId || null,
      parentObjectId: plain.parentObjectId || null,
      createdAt: plain.createdAt || now
    };
  });
  const existingPaths = new Set(refs.map(sourcePath).filter(Boolean));
  EXTRA_SOURCES.forEach((row) => {
    if (!existingPaths.has(row.path)) refs.push(extraSourceRef(row, now));
  });
  return refs;
};

const buildCandidate = ({ sourcePage, now = new Date() }) => {
  const sourceRefs = cloneSourceRefs(sourcePage, now);
  const indexByPath = new Map();
  sourceRefs.forEach((source, index) => {
    const pathValue = sourcePath(source);
    if (pathValue) indexByPath.set(pathValue, index + 1);
    const tagName = clean(source?.metadata?.tagName);
    if (tagName) indexByPath.set(`release:${tagName}`, index + 1);
  });
  const missingPaths = Array.from(new Set(
    ARTICLE.flatMap(block => block.paths || []).filter(pathValue => !indexByPath.has(pathValue))
  ));
  if (missingPaths.length) throw new Error(`Missing primary-source paths: ${missingPaths.join(', ')}`);

  const citations = sourceRefs.map(source => ({
    _id: new mongoose.Types.ObjectId(),
    sourceRefId: source._id,
    sourceType: 'external',
    sourceTitle: source.title,
    quote: '',
    url: source.url,
    confidence: 1,
    createdAt: now
  }));
  const claimBlocks = ARTICLE.filter(block => block.type === 'paragraph');
  const body = {
    type: 'doc',
    content: ARTICLE.map((block) => {
      if (block.type === 'heading') {
        return { type: 'heading', attrs: { level: block.level || 2 }, content: [{ type: 'text', text: block.text }] };
      }
      const citationIndexes = Array.from(new Set(block.paths.map(pathValue => indexByPath.get(pathValue))));
      const support = block.support || 'supported';
      return {
        type: 'paragraph',
        content: [{
          type: 'text',
          text: block.text,
          marks: [{
            type: 'claim',
            attrs: { claimId: claimId(block.text), support, citationIndexes, contradictionIndexes: [] }
          }]
        }]
      };
    })
  };
  const claims = claimBlocks.map((block) => {
    const citationIndexes = Array.from(new Set(block.paths.map(pathValue => indexByPath.get(pathValue))));
    const support = block.support || 'supported';
    return {
      claimId: claimId(block.text),
      text: block.text,
      section: block.section,
      support,
      citationIds: citationIndexes.map(index => citations[index - 1]._id),
      sourceRefIds: citationIndexes.map(index => sourceRefs[index - 1]._id),
      contradictedByCitationIds: [],
      confidence: support === 'supported' ? 0.96 : 0.76,
      lastReviewedAt: now,
      lastVerifiedAt: now,
      history: [{
        at: now,
        event: 'created',
        support,
        text: block.text,
        section: block.section,
        citationIds: citationIndexes.map(index => citations[index - 1]._id),
        sourceRefIds: citationIndexes.map(index => sourceRefs[index - 1]._id),
        contradictedByCitationIds: [],
        summary: 'Claim created from the pinned primary-source repository baseline.'
      }],
      createdAt: now
    };
  });
  const plainText = ARTICLE.map(block => block.text).join('\n\n');
  const sourceWatch = clonePlain(sourcePage.externalWatches?.githubRepo || {});
  const page = {
    userId: sourcePage.userId,
    title: TARGET_TITLE,
    slug: TARGET_SLUG,
    pageType: 'repo',
    status: 'draft',
    visibility: 'private',
    sourceScope: 'selected_sources',
    createdFrom: {
      type: 'sources',
      objectId: sourcePage._id,
      objectIds: [sourcePage._id],
      text: 'Dedicated OpenAI Agents JS public-proof acceptance baseline.',
      label: 'Pinned primary-source repository baseline'
    },
    adoptedFrom: {
      originType: 'page',
      originPageId: sourcePage._id,
      originSlug: sourcePage.slug,
      originTitle: sourcePage.title,
      sample: false,
      adoptedAt: now
    },
    body,
    plainText,
    sourceRefs,
    citations,
    claims,
    freshness: {
      status: 'fresh',
      reason: 'Human-reviewed baseline pinned to primary repository evidence.',
      lastSourceEventAt: sourceWatch.lastCheckedAt || now,
      lastMaintainedAt: now,
      pendingSourceEventIds: [],
      conflictCount: 0,
      staleSectionCount: 0,
      acceptedThrough: {
        type: 'github',
        label: `Commit ${EXPECTED_HEAD.slice(0, 7)}`,
        ref: `https://github.com/${EXPECTED_OWNER}/${EXPECTED_REPO}/commit/${EXPECTED_HEAD}`,
        at: now
      }
    },
    publicProof: null,
    aiState: {
      draftStatus: 'ready',
      draftRequestedAt: now,
      draftStartedAt: now,
      draftCompletedAt: now,
      lastDraftedAt: now,
      lastError: '',
      errorCode: '',
      model: 'human-editorial-primary-sources',
      provider: 'human',
      sourceScopeAtDraft: 'selected_sources',
      sourceRefIdsAtDraft: sourceRefs.map(source => source._id),
      maintenanceProfile: 'repo',
      maintenanceSummary: `Established the trusted OpenAI Agents JS baseline at ${EXPECTED_HEAD.slice(0, 7)}.`,
      candidateStatus: 'promoted',
      lastCandidateAt: now,
      lastCandidateSummary: 'Human-reviewed pinned repository baseline.',
      quality: {},
      health: {
        newItems: [],
        unsupportedClaims: [],
        missingCitations: [],
        staleSections: [],
        contradictions: [],
        relatedPages: []
      },
      changeLog: [{
        id: `baseline-${EXPECTED_HEAD.slice(0, 12)}`,
        type: 'edit',
        title: 'Established trusted repository baseline',
        text: `Pinned the dossier and claim ledger to commit ${EXPECTED_HEAD.slice(0, 7)}.`,
        sourceRefIds: sourceRefs.slice(0, 8).map(source => source._id),
        createdAt: now
      }],
      suggestions: []
    },
    externalWatches: {
      githubRepo: {
        ...sourceWatch,
        owner: EXPECTED_OWNER,
        repo: EXPECTED_REPO,
        defaultBranch: sourceWatch.defaultBranch || 'main',
        status: 'active',
        lastCheckedAt: sourceWatch.lastCheckedAt || now,
        lastHeadProbeAt: sourceWatch.lastHeadProbeAt || sourceWatch.lastCheckedAt || now,
        lastHeadSha: EXPECTED_HEAD,
        publishedHeadSha: EXPECTED_HEAD,
        candidateHeadSha: '',
        publishedGeneratorVersion: GENERATOR_VERSION,
        candidateGeneratorVersion: '',
        lastPublishedAt: now,
        lastBuildAttemptAt: now,
        lastBuildError: '',
        buildStatus: 'ready',
        buildLease: { token: '', headSha: '', acquiredAt: null, expiresAt: null },
        errorMessage: ''
      }
    },
    hiddenFromHome: true,
    debugOnly: false,
    archived: false
  };
  page.aiState.quality = evaluateWikiArticleQuality({
    page,
    body,
    claims,
    sourceRefs,
    now
  });
  if (!page.aiState.quality.ok) {
    throw new Error(`Editorial baseline failed repository quality: ${page.aiState.quality.failures.join(' | ')}`);
  }
  return page;
};

const safeSummary = page => ({
  id: String(page?._id || ''),
  title: page?.title || '',
  slug: page?.slug || '',
  status: page?.status || '',
  visibility: page?.visibility || '',
  wordCount: wordCount(page?.plainText || ''),
  sourceCount: page?.sourceRefs?.length || 0,
  claimCount: page?.claims?.length || 0,
  citationCount: page?.citations?.length || 0,
  quality: page?.aiState?.quality || null,
  headSha: page?.externalWatches?.githubRepo?.lastHeadSha || '',
  publishedHeadSha: page?.externalWatches?.githubRepo?.publishedHeadSha || '',
  publicProof: page?.publicProof || null
});

const writeJson = (filename, payload) => {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const target = path.join(OUTPUT_DIR, filename);
  fs.writeFileSync(target, `${JSON.stringify(payload, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  return target;
};

const validateSourcePage = (sourcePage) => {
  if (!sourcePage) throw new Error('OpenAI Agents JS source page not found.');
  const watch = sourcePage.externalWatches?.githubRepo || {};
  if (sourcePage.visibility !== 'private') throw new Error('Refusing copy: source page must remain private.');
  if (clean(watch.owner).toLowerCase() !== EXPECTED_OWNER || clean(watch.repo).toLowerCase() !== EXPECTED_REPO) {
    throw new Error(`Refusing copy: expected ${EXPECTED_OWNER}/${EXPECTED_REPO}.`);
  }
  if (clean(watch.lastHeadSha) !== EXPECTED_HEAD) {
    throw new Error(`Refusing copy: source head changed from audited ${EXPECTED_HEAD}. Re-audit before rebuilding.`);
  }
};

const main = async () => {
  const apply = process.argv.includes('--apply') || process.env.APPLY === '1';
  const sourcePageId = process.env.OPENAI_AGENTS_SOURCE_PAGE_ID || DEFAULT_SOURCE_PAGE_ID;
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required.');
  if (!mongoose.isValidObjectId(sourcePageId)) throw new Error('OPENAI_AGENTS_SOURCE_PAGE_ID must be a Mongo ObjectId.');

  await mongoose.connect(process.env.MONGODB_URI);
  const sourcePage = await WikiPage.findOne({ _id: sourcePageId, status: { $ne: 'archived' } });
  validateSourcePage(sourcePage);
  const existing = await WikiPage.findOne({ userId: sourcePage.userId, slug: TARGET_SLUG });
  if (existing) {
    const baseline = await WikiRepoBaseline.findOne({ userId: existing.userId, pageId: existing._id });
    console.log(JSON.stringify({
      mode: apply ? 'apply' : 'dry-run',
      idempotent: true,
      source: safeSummary(sourcePage),
      copy: safeSummary(existing),
      baseline: baseline ? { id: String(baseline._id), headSha: baseline.headSha, publicEligible: baseline.publicEligible } : null
    }, null, 2));
    return;
  }

  const candidate = buildCandidate({ sourcePage });
  const report = {
    mode: apply ? 'apply' : 'dry-run',
    idempotent: false,
    source: safeSummary(sourcePage),
    candidate: safeSummary(candidate),
    sourcePageChanged: false,
    publicRegistryChanged: false,
    publicPageChanged: false
  };
  if (!apply) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const snapshotPath = writeJson(`before-${timestamp}.json`, {
    capturedAt: new Date().toISOString(),
    sourcePage: sourcePage.toObject({ virtuals: false }),
    intendedCandidate: safeSummary(candidate)
  });
  const copy = new WikiPage(candidate);
  await copy.save();
  const revision = await createWikiRevision({
    WikiRevision,
    userId: copy.userId,
    page: copy,
    reason: 'created',
    actorType: 'user',
    promotionStatus: 'promoted',
    sourceVersion: {
      provider: 'github',
      owner: EXPECTED_OWNER,
      repo: EXPECTED_REPO,
      headSha: EXPECTED_HEAD,
      generatorVersion: GENERATOR_VERSION
    },
    quality: copy.aiState.quality,
    summary: 'Created the private, human-reviewed OpenAI Agents JS repository baseline from pinned primary sources.'
  });
  const baselineResult = await captureRepoBaseline({
    WikiRepoBaseline,
    WikiRevision,
    page: copy,
    userId: copy.userId,
    publicEligible: true
  });
  const result = {
    ...report,
    candidate: undefined,
    copy: safeSummary(copy),
    revisionId: String(revision?._id || ''),
    baseline: {
      id: String(baselineResult.baseline?._id || ''),
      created: baselineResult.created,
      headSha: baselineResult.baseline?.headSha || '',
      publicEligible: baselineResult.baseline?.publicEligible === true
    },
    snapshotPath,
    rollback: {
      action: 'delete_private_acceptance_copy_and_its_baseline_only',
      copyFilter: { _id: String(copy._id), userId: String(copy.userId), slug: TARGET_SLUG },
      baselineFilter: { pageId: String(copy._id), userId: String(copy.userId) },
      sourcePageMustRemain: String(sourcePage._id)
    }
  };
  const resultPath = writeJson(`result-${timestamp}.json`, result);
  console.log(JSON.stringify({ ...result, resultPath }, null, 2));
};

if (require.main === module) {
  main()
    .catch(error => {
      console.error(error?.stack || error?.message || error);
      process.exitCode = 1;
    })
    .finally(async () => {
      if (mongoose.connection.readyState) await mongoose.disconnect();
    });
}

module.exports = {
  ARTICLE,
  EXPECTED_HEAD,
  EXTRA_SOURCES,
  GENERATOR_VERSION,
  TARGET_SLUG,
  TARGET_TITLE,
  buildCandidate,
  safeSummary,
  validateSourcePage
};
