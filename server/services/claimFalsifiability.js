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
  proposeCriteria
};
