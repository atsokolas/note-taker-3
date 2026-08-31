/**
 * Stage 6 — Cross-case lineage.
 *
 * A thread exists only when two cases share an assumption, an evidence
 * object, a decision pattern, or a named consequence. Similarity is not a
 * reason. Contradictions stay visible. A proposed knot can be cut.
 */

const LINK_KINDS = Object.freeze(['assumption', 'evidence', 'decision_pattern', 'consequence']);
const DIRECTIONS = Object.freeze(['rests_on', 'feeds', 'shares', 'contradicts']);
const STATUSES = Object.freeze(['proposed', 'accepted', 'rejected']);

class CrossCaseLineageError extends Error {
  constructor(message, code = 'invalid_link') {
    super(message);
    this.name = 'CrossCaseLineageError';
    this.code = code;
  }
}

const clean = (value = '', limit = 400) => {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > limit ? `${text.slice(0, limit - 1).trim()}…` : text;
};
const idOf = (value) => String(value?._id || value?.id || value || '').trim();
const list = (value) => (Array.isArray(value) ? value : []);

const explicitObject = (value = {}) => {
  const kind = LINK_KINDS.includes(String(value.kind || '')) ? value.kind : '';
  const text = clean(value.text || value.label || '', 400);
  const objectId = idOf(value.id || value.objectId);
  if (!kind || (!text && !objectId)) return null;
  return { kind, id: objectId, text };
};

const proposeLink = ({
  fromPageId,
  toPageId,
  kind,
  object,
  direction = 'shares',
  contradiction = false,
  proposedBy = 'user',
  similarity,
  now = new Date()
} = {}) => {
  if (similarity != null && Number.isFinite(Number(similarity)) && !explicitObject(object)) {
    throw new CrossCaseLineageError(
      'A resemblance is not a lineage. Name the shared assumption, evidence, pattern, or consequence.',
      'similarity_refused'
    );
  }
  const shared = explicitObject({ ...object, kind: object?.kind || kind });
  if (!shared) {
    throw new CrossCaseLineageError(
      'Name the shared assumption, evidence object, decision pattern, or consequence.',
      'not_explicit'
    );
  }
  const from = idOf(fromPageId);
  const to = idOf(toPageId);
  if (!from || !to || from === to) {
    throw new CrossCaseLineageError('A thread joins two different cases.');
  }
  const linkKind = LINK_KINDS.includes(String(kind || shared.kind)) ? String(kind || shared.kind) : shared.kind;
  const dir = DIRECTIONS.includes(String(direction || '')) ? direction : 'shares';
  return {
    fromPageId: from,
    toPageId: to,
    kind: linkKind,
    object: shared,
    direction: contradiction ? 'contradicts' : dir,
    contradiction: Boolean(contradiction) || dir === 'contradicts',
    status: 'proposed',
    proposedBy: clean(proposedBy, 40) || 'user',
    proposedAt: now instanceof Date ? now.toISOString() : new Date(now).toISOString(),
    rejectedAt: null,
    rejectedBy: null
  };
};

const acceptLink = (link, { now = new Date() } = {}) => {
  if (!link || link.status === 'rejected') {
    throw new CrossCaseLineageError('A cut thread cannot be accepted.');
  }
  return {
    ...link,
    status: 'accepted',
    acceptedAt: now instanceof Date ? now.toISOString() : new Date(now).toISOString()
  };
};

const rejectLink = (link, { actorId = '', now = new Date() } = {}) => {
  if (!link) throw new CrossCaseLineageError('There is no thread to cut.');
  return {
    ...link,
    status: 'rejected',
    rejectedAt: now instanceof Date ? now.toISOString() : new Date(now).toISOString(),
    rejectedBy: idOf(actorId)
  };
};

const knotLine = (link, pages = {}) => {
  const from = pages[link.fromPageId] || {};
  const to = pages[link.toPageId] || {};
  const fromClaim = clean(from.judgment?.currentJudgment || from.title, 240);
  const toClaim = clean(to.judgment?.currentJudgment || to.title, 240);
  const shared = clean(link.object?.text, 240);
  if (link.contradiction) {
    return {
      ...link,
      line: shared
        ? `These sentences part on ${shared}.`
        : 'These sentences part on a named assumption.'
    };
  }
  if (link.kind === 'consequence' || link.direction === 'feeds') {
    return {
      ...link,
      line: shared
        ? `${fromClaim || 'This case'} is felt later as ${shared}.`
        : `${fromClaim || 'This case'} feeds a later case.`
    };
  }
  if (link.kind === 'assumption' || link.direction === 'rests_on') {
    return {
      ...link,
      line: shared
        ? `${fromClaim || 'This sentence'} also rests on ${shared}.`
        : `${fromClaim || 'This sentence'} rests on a named assumption.`
    };
  }
  return {
    ...link,
    line: shared
      ? `These cases share ${shared}.`
      : `These cases share a named ${link.kind.replace('_', ' ')}.`,
    fromClaim,
    toClaim
  };
};

const serializeThread = (links = [], pages = {}) => {
  const rows = list(links).map((link) => knotLine(link, pages));
  const live = rows.filter((row) => row.status !== 'rejected');
  const cut = rows.filter((row) => row.status === 'rejected');
  const contradictions = live.filter((row) => row.contradiction);
  return {
    knots: live,
    cut,
    contradictions,
    silent: live.length === 0
  };
};

module.exports = {
  DIRECTIONS,
  LINK_KINDS,
  STATUSES,
  CrossCaseLineageError,
  acceptLink,
  explicitObject,
  knotLine,
  proposeLink,
  rejectLink,
  serializeThread
};
