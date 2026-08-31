/**
 * Stage 6 — Portability, retention, succession.
 *
 * Complete export with provenance, built on the Stage 4 sealed folio.
 * Legal hold and retention hooks. Deletion and correction as receipts.
 * Ownership can move; authorship of the sentences does not rewrite.
 * Import validates the seal. The paper remains intelligible outside Noeis.
 */

const {
  serializePublicCasebook,
  signCasebook,
  verifyCasebook,
  digest
} = require('./judgmentPublicProjection');
const { SCHEMA_VERSION } = require('./decisionMemory');

const EXPORT_KIND = 'institution-export';
const EXPORT_VERSION = 1;
const HOLD_KINDS = Object.freeze(['retention', 'legal']);
const DELETION = Object.freeze(['forget', 'correct']);

class PortabilityError extends Error {
  constructor(message, status = 400, code = 'invalid_export') {
    super(message);
    this.name = 'PortabilityError';
    this.status = status;
    this.code = code;
  }
}

const clean = (value = '', limit = 400) => {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > limit ? `${text.slice(0, limit - 1).trim()}…` : text;
};
const list = (value) => (Array.isArray(value) ? value : []);
const idOf = (value) => String(value?._id || value?.id || value || '').trim();
const iso = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const isHeld = (holds = [], pageId, now = new Date()) => (
  list(holds).some((row) => {
    if (idOf(row.pageId) !== idOf(pageId)) return false;
    if (row.releasedAt) return false;
    if (!row.until) return true;
    return new Date(row.until).getTime() > (now instanceof Date ? now.getTime() : new Date(now).getTime());
  })
);

const placeHold = ({ pageId, kind = 'retention', until = null, note = '', actorId, now = new Date() } = {}) => {
  if (!HOLD_KINDS.includes(String(kind || ''))) {
    throw new PortabilityError('Name the hold as retention or legal.');
  }
  if (!idOf(pageId)) throw new PortabilityError('Name the case to hold.');
  return {
    pageId: idOf(pageId),
    kind,
    until: iso(until),
    note: clean(note, 400),
    placedAt: iso(now),
    placedBy: idOf(actorId),
    releasedAt: null
  };
};

const releaseHold = (hold, { actorId, now = new Date() } = {}) => ({
  ...hold,
  releasedAt: iso(now),
  releasedBy: idOf(actorId)
});

const exportBundle = ({
  pages = [],
  lineage = [],
  holds = [],
  succession = [],
  secret,
  signedAt = new Date(),
  ownerId
} = {}) => {
  const cases = list(pages).map((page) => {
    const folio = serializePublicCasebook({ page });
    if (!folio) return null;
    const sealed = signCasebook(folio, { secret, signedAt });
    return {
      pageId: idOf(page),
      seal: sealed.seal,
      folio: sealed,
      ownership: idOf(page.userId)
    };
  }).filter(Boolean);
  const payload = {
    kind: EXPORT_KIND,
    version: EXPORT_VERSION,
    schema: SCHEMA_VERSION,
    exportedAt: iso(signedAt),
    ownerId: idOf(ownerId),
    cases,
    lineage: list(lineage).map((row) => ({
      fromPageId: idOf(row.fromPageId),
      toPageId: idOf(row.toPageId),
      kind: clean(row.kind, 40),
      object: row.object || null,
      status: clean(row.status, 20),
      contradiction: Boolean(row.contradiction)
    })),
    holds: list(holds).map((row) => ({
      pageId: idOf(row.pageId),
      kind: clean(row.kind, 20),
      until: iso(row.until),
      note: clean(row.note, 400)
    })),
    succession: list(succession).map((row) => ({
      pageId: idOf(row.pageId),
      fromUserId: idOf(row.fromUserId),
      toUserId: idOf(row.toUserId),
      at: iso(row.at)
    }))
  };
  return {
    ...payload,
    digest: digest(payload)
  };
};

const validateImport = (bundle, { secret } = {}) => {
  if (!bundle || bundle.kind !== EXPORT_KIND) {
    throw new PortabilityError('This is not an institution export.');
  }
  if (Number(bundle.version) !== EXPORT_VERSION) {
    throw new PortabilityError('Unknown export version.');
  }
  const cases = list(bundle.cases);
  if (!cases.length) throw new PortabilityError('The export holds no sealed cases.');
  cases.forEach((row, index) => {
    const folio = row.folio || row;
    const verdict = verifyCasebook(folio, { secret });
    if (!verdict.ok) {
      throw new PortabilityError(
        `Case ${index + 1} does not match its seal.`,
        400,
        'seal_invalid'
      );
    }
  });
  const { digest: claimed, ...rest } = bundle;
  const expected = digest(rest);
  if (claimed && claimed !== expected) {
    throw new PortabilityError('The export digest does not match.', 400, 'digest_invalid');
  }
  return { ok: true, cases: cases.length, digest: claimed || expected };
};

const forgetCase = ({ page, holds = [], now = new Date() } = {}) => {
  if (isHeld(holds, page?._id || page?.id, now)) {
    throw new PortabilityError('A legal or retention hold keeps this case.', 423, 'held');
  }
  return {
    action: 'forget',
    pageId: idOf(page),
    at: iso(now),
    tombstone: {
      status: 'withdrawn',
      summary: 'This case was withdrawn. The audit still knows it existed.'
    }
  };
};

const correctCase = ({ page, summary = '', now = new Date() } = {}) => ({
  action: 'correct',
  pageId: idOf(page),
  at: iso(now),
  summary: clean(summary, 400) || 'A correction was recorded. Prior seals still verify.'
});

const transferOwnership = ({
  page,
  fromUserId,
  toUserId,
  now = new Date()
} = {}) => {
  if (!idOf(toUserId)) throw new PortabilityError('Name the successor.');
  if (idOf(page?.userId) !== idOf(fromUserId)) {
    throw new PortabilityError('Only the owner may hand the case on.', 403, 'forbidden');
  }
  if (idOf(fromUserId) === idOf(toUserId)) {
    throw new PortabilityError('Succession needs a different person.');
  }
  return {
    pageId: idOf(page),
    fromUserId: idOf(fromUserId),
    toUserId: idOf(toUserId),
    at: iso(now),
    authorshipIntact: true,
    claim: clean(page?.judgment?.currentJudgment, 800)
  };
};

const roundTrip = (bundle, { secret } = {}) => {
  const checked = validateImport(bundle, { secret });
  return {
    ok: checked.ok,
    digest: checked.digest,
    cases: list(bundle.cases).map((row) => ({
      pageId: idOf(row.pageId),
      hash: row.seal?.hash || row.folio?.seal?.hash
    }))
  };
};

module.exports = {
  DELETION,
  EXPORT_KIND,
  EXPORT_VERSION,
  HOLD_KINDS,
  PortabilityError,
  correctCase,
  exportBundle,
  forgetCase,
  isHeld,
  placeHold,
  releaseHold,
  roundTrip,
  transferOwnership,
  validateImport
};
