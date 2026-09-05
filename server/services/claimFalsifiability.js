const { wordBoundaryTrim } = require('../lib/editorialText');
/**
 * AT-427 — optional falsifiability on a claim.
 *
 * "What would change your mind — and by when?" never blocks a write.
 * Empty, missing, or unparseable values are silence, not errors.
 * The Skeptical Partner may propose criteria; proposing is not a write.
 */

const clean = (value = '', limit = 800) => wordBoundaryTrim(String(value || '').replace(/\s+/g, ' ').trim(), { maxLength: limit });

const parseHorizon = (value) => {
  if (value === undefined || value === null || value === '') return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const asIsoDay = (value) => {
  const date = parseHorizon(value);
  if (!date) return '';
  return date.toISOString().slice(0, 10);
};

/** Apply optional criteria and horizon. Undefined keys leave the claim as-is. */
const applyFalsifiability = (claim, { resolutionCriteria, horizon } = {}) => {
  if (!claim) return claim;
  if (resolutionCriteria !== undefined) {
    claim.resolutionCriteria = clean(resolutionCriteria);
  }
  if (horizon !== undefined) {
    claim.horizon = parseHorizon(horizon);
  }
  return claim;
};

/**
 * The falsifier a criteria answer should always have created.
 *
 * "What would change your mind" wrote only to the claim, while the watchers
 * read `judgment.falsifiers`. Two fields for one idea, never joined, so the
 * most important sentence a reader writes was watched by nothing.
 *
 * Answering now also keeps a falsifier: same text, same signal, tied to the
 * claim. Editing the answer edits that falsifier rather than growing a
 * second one, and clearing the answer retires it — a signal nobody is
 * claiming any more should not keep firing.
 */
const syncClaimFalsifier = (page, claim, { now = new Date() } = {}) => {
  if (!page || !claim?.claimId) return page;
  const criteria = clean(claim.resolutionCriteria);
  page.judgment = page.judgment || {};
  page.judgment.falsifiers = page.judgment.falsifiers || [];

  const claimId = String(claim.claimId);
  const existing = page.judgment.falsifiers
    .find(row => (row?.affectedClaimIds || []).some(value => String(value) === claimId));

  if (!criteria) {
    /* Retired, not deleted: the reader may have answered and then thought
       better of it, and that is part of the record. */
    if (existing && existing.status !== 'triggered') existing.status = 'retired';
    return page;
  }

  if (existing) {
    existing.text = clean(claim.text) || existing.text;
    existing.observableSignal = criteria;
    return page;
  }

  page.judgment.falsifiers.push({
    falsifierId: `claim-${claimId}`,
    text: clean(claim.text) || criteria,
    observableSignal: criteria,
    status: 'unobserved',
    affectedClaimIds: [claimId],
    createdAt: now
  });
  return page;
};

/**
 * A suggestion the human may accept. Never mutates the claim.
 * `autoWrite` is always false — the partner proposes; the owner writes.
 */
const proposeCriteria = ({ text = '', horizon = null } = {}) => ({
  kind: 'suggestion',
  field: 'criteria',
  resolutionCriteria: clean(text),
  horizon: parseHorizon(horizon),
  autoWrite: false
});

const hasCriteria = (claim = {}) => Boolean(clean(claim?.resolutionCriteria));
const hasHorizon = (claim = {}) => Boolean(parseHorizon(claim?.horizon));

module.exports = {
  applyFalsifiability,
  asIsoDay,
  cleanCriteria: clean,
  hasCriteria,
  hasHorizon,
  parseHorizon,
  proposeCriteria,
  syncClaimFalsifier
};
