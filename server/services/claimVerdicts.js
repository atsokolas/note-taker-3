/**
 * AT-428 — append-only verdicts, asked in the morning paper.
 *
 * Horizon-triggered and evidence-triggered both appear. A quiet day asks
 * nothing. T1 taste gates apply; the 14-day check-in cadence does not —
 * a test coming due is not a reminder you already answered.
 */

const { evaluateCheckInEligibility } = require('./checkInEligibility');
const { parseHorizon, asIsoDay } = require('./claimFalsifiability');
const { findHeldClaim } = require('./heldClaim');

const VERDICTS = Object.freeze(['held_up', 'broke', 'partly', 'unresolvable']);
const VERDICT_LABELS = Object.freeze({
  held_up: 'Held up',
  broke: 'Broke',
  partly: 'Partly',
  unresolvable: 'Unresolvable'
});
const TRIGGERS = Object.freeze(['horizon', 'evidence']);

const clean = (value = '', limit = 500) => {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > limit ? `${text.slice(0, limit - 1).trim()}…` : text;
};

const id = (value) => String(value?._id || value || '');
const asPlain = (value) => (value?.toObject ? value.toObject({ virtuals: false }) : value);

const isVerdict = (value) => VERDICTS.includes(String(value || ''));
const isTrigger = (value) => TRIGGERS.includes(String(value || ''));

const verdictsOf = (claim = {}) => (
  Array.isArray(claim.verdicts) ? claim.verdicts.map(asPlain) : []
);

const sameHorizon = (left, right) => {
  const a = asIsoDay(left);
  const b = asIsoDay(right);
  return Boolean(a) && a === b;
};

const alreadyAsked = (claim, { trigger, sourceEventId = '', horizon = null } = {}) => {
  return verdictsOf(claim).some((row) => {
    if (String(row.trigger) !== String(trigger)) return false;
    if (trigger === 'horizon') return sameHorizon(row.horizon || row.at, horizon);
    return String(row.sourceEventId || '') === String(sourceEventId || '');
  });
};

const evaluateVerdictEligibility = ({ page = {}, claim = {}, now = Date.now() } = {}) => {
  const base = evaluateCheckInEligibility({ page, claim, now });
  const reasons = (base.reasons || []).filter((reason) => reason !== 'shown_within_14_days');
  return { eligible: reasons.length === 0, reasons, text: base.text };
};

const isDecisiveImpact = (impact = {}) => {
  const after = String(impact.afterSupport || '');
  const before = String(impact.beforeSupport || '');
  if (after === 'conflicted') return true;
  if (after === 'unsupported' && before === 'supported') return true;
  return false;
};

const paperRow = ({ page, claim, eligibility, trigger, sourceEventId = '', horizon = null }) => ({
  pageId: id(page),
  pageTitle: clean(page.title || page.judgment?.currentJudgment || '', 180),
  claimId: String(claim.claimId),
  text: eligibility.text,
  trigger,
  sourceEventId: sourceEventId ? String(sourceEventId) : '',
  horizon: horizon ? new Date(horizon).toISOString() : null,
  resolutionCriteria: clean(claim.resolutionCriteria, 800),
  href: `/wiki/workspace?page=${encodeURIComponent(id(page))}&claimId=${encodeURIComponent(claim.claimId)}`
});

const selectPaperVerdicts = ({ pages = [], watcherLeads = [], now = Date.now() } = {}) => {
  const at = now instanceof Date ? now : new Date(now);
  const due = [];
  const seen = new Set();

  const push = (row) => {
    const key = `${row.pageId}:${row.claimId}:${row.trigger}:${row.sourceEventId || asIsoDay(row.horizon)}`;
    if (seen.has(key)) return;
    seen.add(key);
    due.push(row);
  };

  (Array.isArray(pages) ? pages : []).forEach((pageValue) => {
    const page = asPlain(pageValue);
    (Array.isArray(page.claims) ? page.claims : []).forEach((claimValue) => {
      const claim = asPlain(claimValue);
      const eligibility = evaluateVerdictEligibility({ page, claim, now: at.getTime() });
      if (!eligibility.eligible) return;
      const horizon = parseHorizon(claim.horizon);
      if (horizon && horizon.getTime() <= at.getTime() && !alreadyAsked(claim, { trigger: 'horizon', horizon })) {
        push(paperRow({ page, claim, eligibility, trigger: 'horizon', horizon }));
      }
    });
  });

  (Array.isArray(watcherLeads) ? watcherLeads : []).forEach((lead) => {
    const pageId = id(lead?.page?.id || lead?.page);
    const eventId = String(lead?.eventId || '');
    if (!pageId || !eventId) return;
    const page = (Array.isArray(pages) ? pages : []).map(asPlain).find((row) => id(row) === pageId);
    if (!page) return;
    (Array.isArray(lead.claimImpacts) ? lead.claimImpacts : []).forEach((impact) => {
      if (!isDecisiveImpact(impact)) return;
      const claim = findHeldClaim(page, impact.claimId) || (page.claims || []).find((row) => String(row.claimId) === String(impact.claimId));
      if (!claim) return;
      const eligibility = evaluateVerdictEligibility({ page, claim: asPlain(claim), now: at.getTime() });
      if (!eligibility.eligible) return;
      if (alreadyAsked(claim, { trigger: 'evidence', sourceEventId: eventId })) return;
      push(paperRow({
        page,
        claim: asPlain(claim),
        eligibility,
        trigger: 'evidence',
        sourceEventId: eventId
      }));
    });
  });

  return due;
};

const appendVerdict = (claim, {
  verdict,
  trigger,
  sourceEventId = '',
  horizon = null,
  note = '',
  now = new Date()
} = {}) => {
  if (!claim) {
    const error = new Error('Claim not found.');
    error.statusCode = 404;
    throw error;
  }
  const nextVerdict = String(verdict || '');
  const nextTrigger = String(trigger || '');
  if (!isVerdict(nextVerdict)) {
    const error = new Error('verdict must be held_up, broke, partly, or unresolvable.');
    error.statusCode = 400;
    throw error;
  }
  if (!isTrigger(nextTrigger)) {
    const error = new Error('trigger must be horizon or evidence.');
    error.statusCode = 400;
    throw error;
  }
  const entry = Object.freeze({
    at: now,
    verdict: nextVerdict,
    trigger: nextTrigger,
    sourceEventId: clean(sourceEventId, 120),
    horizon: nextTrigger === 'horizon' ? (parseHorizon(horizon) || parseHorizon(claim.horizon)) : null,
    note: clean(note, 500),
    actorType: 'user'
  });
  if (!Array.isArray(claim.verdicts)) claim.verdicts = [];
  claim.verdicts.push({ ...entry });
  if (!Array.isArray(claim.history)) claim.history = [];
  claim.history.push({
    at: now,
    event: 'verdict',
    action: nextVerdict,
    actorType: 'user',
    note: entry.note,
    support: claim.support || 'unsupported',
    text: claim.text,
    summary: `Verdict ${nextVerdict.replace('_', ' ')} (${nextTrigger}).`
  });
  return entry;
};

module.exports = {
  VERDICT_LABELS,
  VERDICTS,
  alreadyAsked,
  appendVerdict,
  evaluateVerdictEligibility,
  isDecisiveImpact,
  isVerdict,
  selectPaperVerdicts
};
