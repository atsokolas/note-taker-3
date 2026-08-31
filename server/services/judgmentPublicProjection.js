/**
 * Stage 4 — Public casebook projection.
 *
 * A sealed folio is an allowlist, not a redaction. The owner ledger stays
 * behind the login; a stranger receives only what this file names. Private
 * notes, conviction, weights, unpublished candidates, Library identity,
 * agent state, tokens, and internal ids are absent — not hashed, not
 * commented, not present.
 */

const crypto = require('crypto');
const { VERDICT_LABEL, POSTMORTEM } = require('./judgmentLedger');

const ALGORITHM = 'hmac-sha256';
const CLOCKS = Object.freeze(['evidence', 'expectation', 'decision', 'review', 'outcome']);
const PUBLISHED_VERDICTS = Object.freeze(['held_up', 'broke', 'partly', 'unresolvable', 'right_for_wrong_reasons']);
const SHARE_KINDS = Object.freeze(['published', 'corrected', 'revoked']);

const SHARE_SUMMARY = Object.freeze({
  published: 'This case was sealed for public reading.',
  corrected: 'The public edition was corrected. Prior seals still verify.',
  revoked: 'The public seal was lifted. Prior copies keep their provenance.'
});

const clean = (value = '', limit = 4000) => {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > limit ? `${text.slice(0, limit - 1).trim()}…` : text;
};
const list = (value) => (Array.isArray(value) ? value : []);
const idOf = (value) => String(value?._id || value?.id || value || '').trim();
const plain = (value) => (value?.toObject ? value.toObject({ virtuals: false }) : value);
const iso = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};
const exportSecret = () => (
  process.env.CASEBOOK_EXPORT_SECRET
  || process.env.JWT_SECRET
  || ''
);

const canonicalize = (value) => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((item) => canonicalize(item));
  if (typeof value === 'object') {
    return Object.keys(value).sort().reduce((acc, key) => {
      const next = canonicalize(value[key]);
      if (next === undefined) return acc;
      acc[key] = next;
      return acc;
    }, {});
  }
  return String(value);
};

const digest = (value) => crypto
  .createHash('sha256')
  .update(JSON.stringify(canonicalize(value)))
  .digest('hex');

const publicSource = (source = {}) => {
  const title = clean(source.title || source.url || '', 240);
  const url = clean(source.url, 1000);
  if (!title && !url) return null;
  if (url && !/^https?:\/\//i.test(url)) return { title, url: '' };
  return {
    type: clean(source.type || source.sourceType || 'source', 40) || 'source',
    title: title || url,
    url
  };
};

const publicSources = (page = {}) => list(plain(page)?.sourceRefs)
  .map(publicSource)
  .filter(Boolean);

const sourceById = (page = {}) => {
  const map = new Map();
  list(plain(page)?.sourceRefs).forEach((source) => {
    const key = idOf(source);
    const published = publicSource(source);
    if (key && published) map.set(key, published);
  });
  return map;
};

const evidenceLinks = (page, ids = []) => {
  const byId = sourceById(page);
  const seen = new Set();
  return list(ids).map(idOf).filter(Boolean).map((key) => {
    if (seen.has(key) || !byId.has(key)) return null;
    seen.add(key);
    return byId.get(key);
  }).filter(Boolean);
};

const publicClock = (fact = {}) => {
  const clock = CLOCKS.includes(String(fact.clock || '')) ? fact.clock : '';
  const summary = clean(fact.summary, 2000);
  if (!clock || (!summary && !fact.occurredAt)) return null;
  return {
    clock,
    occurredAt: iso(fact.occurredAt),
    precision: clean(fact.precision, 20) || 'unknown',
    authoredBy: ['user', 'world', 'system'].includes(String(fact.authoredBy || ''))
      ? fact.authoredBy
      : 'system',
    sourceLabel: clean(fact.sourceLabel, 240),
    summary,
    causalKind: fact.causalKind === 'inference' ? 'inference' : 'evidence'
  };
};

const publicVerdict = (page, verdict = {}) => {
  const result = String(verdict.result || '');
  if (!PUBLISHED_VERDICTS.includes(result)) return null;
  return {
    result,
    label: VERDICT_LABEL[result] || result,
    recordedAt: iso(verdict.recordedAt),
    note: clean(verdict.note, 2000),
    criterion: clean(verdict.criteriaSnapshot, 2000),
    evidence: evidenceLinks(page, verdict.evidenceSourceRefIds)
  };
};

const publicPostmortem = (outcome = {}) => {
  if (outcome.silence && !clean(outcome.answer) && !clean(outcome.lesson)) {
    return {
      question: clean(outcome.question, 400) || POSTMORTEM[outcome.verdictSnapshot] || '',
      answer: '',
      lesson: '',
      silent: true,
      observedAt: iso(outcome.observedAt || outcome.recordedAt),
      result: clean(outcome.result, 40)
    };
  }
  const answer = clean(outcome.answer, 4000);
  const lesson = clean(outcome.lesson, 2000);
  if (!answer && !lesson) return null;
  return {
    question: clean(outcome.question, 400) || POSTMORTEM[outcome.verdictSnapshot] || '',
    answer,
    lesson,
    silent: false,
    observedAt: iso(outcome.observedAt || outcome.recordedAt),
    result: clean(outcome.result, 40)
  };
};

const publicRevision = (revision = {}) => {
  const status = String(revision.promotionStatus || 'promoted');
  if (status === 'candidate' || status === 'rejected' || status === 'deferred') return null;
  const summary = clean(revision.summary, 400);
  const at = iso(revision.createdAt);
  if (!at) return null;
  return {
    at,
    summary,
    reason: clean(revision.reason, 40)
  };
};

const publicRevisions = (revisions = []) => {
  const seen = new Set();
  return list(revisions).map(publicRevision).filter(Boolean).filter((revision) => {
    // The public surface renders day precision. Repeated autosaves with the
    // same public summary on that day are one visible movement, not a feed.
    const key = `${revision.at.slice(0, 10)}\u0000${revision.summary}\u0000${revision.reason}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const acceptedThrough = (page = {}) => {
  const raw = plain(page) || {};
  const accepted = plain(raw.freshness?.acceptedThrough) || {};
  const proof = plain(raw.publicProof) || {};
  const at = iso(accepted.acceptedAt || accepted.sourceUpdatedAt || proof.acceptedAt || raw.lastReviewedAt);
  const label = clean(accepted.title, 240)
    || (proof.acceptedAt ? 'Accepted public edition' : '')
    || (at ? 'Last reviewed' : '');
  if (!at && !label) return null;
  return {
    at,
    label,
    ref: /^https?:\/\//i.test(String(accepted.url || '')) ? clean(accepted.url, 1000) : ''
  };
};

const maintenanceDeltas = (revisions = [], accepted = null) => {
  if (!accepted?.at) return [];
  const since = new Date(accepted.at).getTime();
  return publicRevisions(revisions)
    .filter((row) => {
      return new Date(row.at).getTime() > since;
    })
    .map((row) => ({
      at: row.at,
      summary: row.summary || 'The public edition moved.'
    }));
};

const publicReceipt = (receipt = {}) => {
  const kind = SHARE_KINDS.includes(String(receipt.kind || '')) ? receipt.kind : '';
  if (!kind) return null;
  return {
    kind,
    at: iso(receipt.at || receipt.createdAt),
    summary: clean(receipt.summary, 400) || SHARE_SUMMARY[kind],
    hash: clean(receipt.hash, 128)
  };
};

const publicLineage = (lineage) => {
  const tree = lineage && typeof lineage === 'object' ? lineage : {};
  const origin = tree.origin && clean(tree.origin.title || tree.origin.slug)
    ? {
      title: clean(tree.origin.title, 240),
      slug: clean(tree.origin.slug, 180),
      hash: clean(tree.origin.hash, 128),
      revoked: Boolean(tree.origin.revoked),
      action: ['fork', 'adopt'].includes(String(tree.origin.action || ''))
        ? tree.origin.action
        : 'fork'
    }
    : null;
  const branches = list(tree.branches).map((branch) => {
    const title = clean(branch.title || branch.slug, 240);
    const slug = clean(branch.slug, 180);
    if (!title && !slug) return null;
    return {
      title: title || slug,
      slug,
      action: ['fork', 'adopt'].includes(String(branch.action || '')) ? branch.action : 'fork',
      at: iso(branch.at || branch.createdAt),
      diverged: Boolean(branch.diverged)
    };
  }).filter(Boolean);
  if (!origin && !branches.length) return null;
  return { origin, branches };
};

const heldClaim = (page = {}) => {
  const judgment = plain(plain(page)?.judgment) || {};
  const text = clean(judgment.currentJudgment, 8000);
  if (!text) return null;
  return {
    text,
    bornAt: iso(judgment.bornAt || judgment.startedAt || page.createdAt)
  };
};

const serializePublicCasebook = ({
  page,
  revisions = [],
  lineage = {},
  receipts = []
} = {}) => {
  const raw = plain(page);
  if (!raw) return null;
  const claim = heldClaim(raw);
  if (!claim) return null;
  const judgment = plain(raw.judgment) || {};
  const storedReceipts = list(receipts).length
    ? list(receipts)
    : list(plain(raw.casebookShare)?.receipts);
  const accepted = acceptedThrough(raw);
  const folio = {
    kind: 'casebook',
    title: clean(raw.title, 240) || claim.text,
    slug: clean(raw.slug, 180),
    claim,
    clocks: list(judgment.clocks).map(publicClock).filter(Boolean),
    verdicts: list(judgment.verdicts).map((row) => publicVerdict(raw, row)).filter(Boolean),
    postmortems: list(judgment.outcomes).map(publicPostmortem).filter(Boolean),
    revisions: publicRevisions(revisions),
    evidence: publicSources(raw),
    acceptedThrough: accepted,
    deltas: maintenanceDeltas(revisions, accepted),
    corrections: storedReceipts.map(publicReceipt).filter(Boolean),
    lineage: publicLineage(lineage),
    criterion: clean(judgment.resolutionCriteria, 2000)
  };
  return folio;
};

const unsignedEnvelope = (casebook) => {
  if (!casebook) return null;
  const { seal, ...rest } = casebook;
  return rest;
};

const signCasebook = (casebook, { secret = exportSecret(), signedAt = new Date() } = {}) => {
  const payload = unsignedEnvelope(casebook);
  if (!payload) return null;
  if (!secret) {
    const error = new Error('A server secret is required to seal a casebook.');
    error.status = 503;
    error.code = 'export_secret_missing';
    throw error;
  }
  const hash = digest(payload);
  const signature = crypto.createHmac('sha256', secret).update(hash).digest('hex');
  return {
    ...payload,
    seal: {
      algorithm: ALGORITHM,
      hash,
      signature,
      signedAt: iso(signedAt)
    }
  };
};

const verifyCasebook = (casebook, { secret = exportSecret() } = {}) => {
  const seal = casebook?.seal || {};
  if (!secret) return { ok: false, reason: 'The server cannot verify this seal.' };
  if (clean(seal.algorithm, 40) !== ALGORITHM) return { ok: false, reason: 'Unknown seal.' };
  if (!clean(seal.hash, 128) || !clean(seal.signature, 128)) {
    return { ok: false, reason: 'The seal is incomplete.' };
  }
  let expected;
  try {
    expected = signCasebook(unsignedEnvelope(casebook), { secret, signedAt: seal.signedAt });
  } catch (_error) {
    return { ok: false, reason: 'The seal could not be recomputed.' };
  }
  const hashMatch = crypto.timingSafeEqual
    ? expected.seal.hash.length === seal.hash.length
      && crypto.timingSafeEqual(Buffer.from(expected.seal.hash), Buffer.from(seal.hash))
    : expected.seal.hash === seal.hash;
  const signatureMatch = expected.seal.signature.length === seal.signature.length
    && crypto.timingSafeEqual(Buffer.from(expected.seal.signature), Buffer.from(seal.signature));
  if (!hashMatch || !signatureMatch) return { ok: false, reason: 'The folio does not match its seal.' };
  return { ok: true, reason: '' };
};

const appendShareReceipt = (page, kind, hash, at = new Date()) => {
  if (!SHARE_KINDS.includes(kind)) return null;
  if (!page.casebookShare) page.casebookShare = { receipts: [] };
  if (!Array.isArray(page.casebookShare.receipts)) page.casebookShare.receipts = [];
  const receipt = {
    kind,
    at,
    summary: SHARE_SUMMARY[kind],
    hash: clean(hash, 128)
  };
  page.casebookShare.receipts.push(receipt);
  if (kind === 'published') page.casebookShare.publishedAt = at;
  if (kind === 'revoked') page.casebookShare.revokedAt = at;
  page.markModified?.('casebookShare');
  return receipt;
};

module.exports = {
  appendShareReceipt,
  digest,
  serializePublicCasebook,
  signCasebook,
  verifyCasebook
};
