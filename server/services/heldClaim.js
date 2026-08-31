const crypto = require('crypto');
const { resolveClaimBornAt } = require('./claimBornAt');

const clean = (value = '', limit = 800) => {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > limit ? `${text.slice(0, limit - 1).trim()}…` : text;
};

const identity = (value = '') => String(value || '')
  .normalize('NFKC')
  .toLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const asPlain = (value) => (value?.toObject ? value.toObject({ virtuals: false }) : value);

const claimsOf = (page = {}) => (Array.isArray(page.claims) ? page.claims : []);

const heldSentence = (page = {}) => clean(page?.judgment?.currentJudgment, 800);

const findHeldClaim = (page = {}, claimId = '') => {
  const claims = claimsOf(page);
  const wanted = String(claimId || '');
  if (wanted) {
    const byId = claims.find((claim) => String(claim?.claimId) === wanted);
    if (byId) return byId;
  }
  const sentence = identity(heldSentence(page));
  if (sentence) {
    const byText = claims.find((claim) => identity(claim?.text) === sentence);
    if (byText) return byText;
  }
  return null;
};

const ownableHistory = ({ now, actorType, text }) => {
  const human = actorType !== 'agent';
  return [{
    at: now,
    event: 'created',
    action: '',
    actorType: human ? 'user' : 'agent',
    disposition: human ? 'accepted' : null,
    text,
    summary: human ? 'Held sentence entered the ledger.' : 'Claim extracted onto the ledger.'
  }];
};

/**
 * The sentence you hold is a claim. Judgment pages used to store it only on
 * `currentJudgment`, so the paper and the Mirror could not see it. This stamps
 * the matching ledger row — per page, per user — without inventing a global
 * founder shortcut.
 */
const ensureHeldClaim = (page, { now = new Date(), actorType = 'user', claimId = '' } = {}) => {
  if (!page) return null;
  const existing = findHeldClaim(page, claimId);
  const sentence = heldSentence(page) || clean(existing?.text, 800);
  if (existing) {
    if (sentence && clean(existing.text) !== sentence && actorType !== 'agent') {
      existing.text = sentence;
    }
    existing.bornAt = resolveClaimBornAt(existing, { now, pageCreatedAt: page.createdAt });
    return existing;
  }
  if (!sentence) return null;
  const claim = {
    claimId: `claim_${crypto.randomUUID()}`,
    text: sentence,
    support: 'unsupported',
    checkInStatus: 'unreviewed',
    createdAt: now,
    bornAt: page.judgment?.startedAt || page.createdAt || now,
    history: ownableHistory({ now, actorType, text: sentence }),
    verdicts: [],
    resolutionCriteria: '',
    horizon: null
  };
  claim.bornAt = resolveClaimBornAt(claim, { now, pageCreatedAt: page.createdAt });
  const next = [claim, ...claimsOf(page).map(asPlain)];
  page.claims = next;
  if (typeof page.markModified === 'function') page.markModified('claims');
  return page.claims[0];
};

module.exports = {
  ensureHeldClaim,
  findHeldClaim,
  heldSentence,
  identity
};
