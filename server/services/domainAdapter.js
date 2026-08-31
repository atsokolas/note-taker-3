/**
 * Stage 6 — Domain adapter contract.
 *
 * A domain is a vocabulary over the same claim-to-outcome chain. It never
 * forks the ledger. Unsupported semantics fail by name, not by silent
 * coercion. The first adapter is a held sentence — not a 10-K product.
 */

const CHAIN = Object.freeze(['claim', 'evidence', 'disposition', 'decision', 'outcome']);
const KERNEL_CLOCKS = Object.freeze(['evidence', 'expectation', 'decision', 'review', 'outcome']);
const EVIDENCE_TYPES = Object.freeze(['passage', 'source', 'observation']);
const REVIEW_TRIGGERS = Object.freeze(['horizon', 'counterevidence', 'explicit']);
const FORBIDDEN_SEMANTICS = Object.freeze([
  'ticker',
  'position_size',
  'ten_k_item',
  'marketplace',
  'leaderboard',
  'ontology_class'
]);

const HELD_SENTENCE = Object.freeze({
  id: 'held-sentence',
  name: 'Held sentence',
  vocabulary: Object.freeze({
    claim: 'held sentence',
    evidence: 'passage',
    disposition: 'how you met it',
    decision: 'posture',
    outcome: 'what happened',
    lesson: 'what it taught'
  }),
  evidenceTypes: EVIDENCE_TYPES,
  reviewTriggers: REVIEW_TRIGGERS,
  policy: Object.freeze({
    forbids: FORBIDDEN_SEMANTICS,
    requiresHuman: Object.freeze(['disposition', 'decision', 'outcome']),
    chain: CHAIN
  })
});

const ADAPTERS = Object.freeze({
  'held-sentence': HELD_SENTENCE
});

class DomainAdapterError extends Error {
  constructor(message, code = 'unsupported_semantics') {
    super(message);
    this.name = 'DomainAdapterError';
    this.code = code;
  }
}

const clean = (value = '', limit = 400) => {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > limit ? `${text.slice(0, limit - 1).trim()}…` : text;
};
const list = (value) => (Array.isArray(value) ? value : []);
const plain = (value) => (value?.toObject ? value.toObject({ virtuals: false }) : value);

const isAdapter = (value) => Boolean(ADAPTERS[String(value?.id || value || '')]);

const adapterOf = (value) => {
  if (!value) return HELD_SENTENCE;
  if (typeof value === 'string') {
    const found = ADAPTERS[value];
    if (!found) throw new DomainAdapterError(`No adapter named ${clean(value, 40)}.`);
    return found;
  }
  if (value.id && ADAPTERS[value.id]) return ADAPTERS[value.id];
  throw new DomainAdapterError('Unknown domain adapter.');
};

const refuse = (semantic) => {
  const name = clean(semantic, 40);
  if (!name) throw new DomainAdapterError('Name the unsupported semantic.');
  throw new DomainAdapterError(
    `The held-sentence adapter does not speak ${name}. The kernel stays the claim-to-outcome chain.`,
    'unsupported_semantics'
  );
};

const assertKernel = (adapter) => {
  const policy = adapter?.policy || {};
  const chain = list(policy.chain);
  if (chain.join(',') !== CHAIN.join(',')) {
    throw new DomainAdapterError('An adapter may not fork the claim-to-outcome chain.', 'fork_refused');
  }
  list(policy.forbids).forEach((item) => {
    if (!FORBIDDEN_SEMANTICS.includes(item)) return;
  });
};

const projectChain = (page = {}, adapter = HELD_SENTENCE) => {
  assertKernel(adapter);
  const raw = plain(page) || {};
  const judgment = plain(raw.judgment) || {};
  return {
    adapter: adapter.id,
    vocabulary: adapter.vocabulary,
    chain: {
      claim: clean(judgment.currentJudgment || '', 8000),
      evidence: list(raw.sourceRefs).map((source) => ({
        type: adapter.evidenceTypes.includes(String(source.type || '')) ? source.type : 'source',
        title: clean(source.title || source.url, 240)
      })).filter((row) => row.title),
      disposition: list(judgment.verdicts).map((row) => ({
        result: clean(row.result, 40),
        at: row.recordedAt || row.at || null
      })),
      decision: {
        posture: clean(judgment.decisionPosture || judgment.status, 40),
        at: judgment.decisionAt || judgment.startedAt || null
      },
      outcome: list(judgment.outcomes).map((row) => ({
        result: clean(row.result, 40),
        at: row.observedAt || row.at || null,
        silent: Boolean(row.silence)
      }))
    },
    clocks: KERNEL_CLOCKS,
    reviewTriggers: adapter.reviewTriggers
  };
};

module.exports = {
  ADAPTERS,
  CHAIN,
  DomainAdapterError,
  EVIDENCE_TYPES,
  FORBIDDEN_SEMANTICS,
  HELD_SENTENCE,
  KERNEL_CLOCKS,
  REVIEW_TRIGGERS,
  adapterOf,
  assertKernel,
  isAdapter,
  projectChain,
  refuse
};
