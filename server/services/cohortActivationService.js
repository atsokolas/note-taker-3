/**
 * Stage 1 cohort readout.
 *
 * The gate is not a feeling about a user session. It is four durable receipts
 * per participant, read back from what the product actually wrote:
 *
 *   1. company_dossier_created
 *   2. company_dossier_first_head_accepted
 *   3. investment_valuation_refreshed
 *   4. company_dossier_maintenance_accepted   ← Stage 2, after later evidence
 *
 * A participant who produced the first three has *completed Stage 1*. Nobody
 * is *activated* until the fourth arrives, because activation is a claim about
 * a belief surviving contact with new evidence, and that has not happened yet.
 * Conflating the two would let a cohort look activated on the strength of one
 * good afternoon.
 *
 * The cohort rule is 5/5 or nothing. Four out of five is not "nearly passing";
 * it is a failed gate with an encouraging shape, and the roadmap says so.
 *
 * Silence discipline: `receipts` of null means the store was never read, and
 * the readout says it does not know. It never reports an unread cohort as a
 * cohort that produced nothing — the distinction the rest of this product has
 * been learning all week.
 */

const REQUIRED_COHORT = 5;

const FIRST_THREE = Object.freeze([
  'company_dossier_created',
  'company_dossier_first_head_accepted',
  'investment_valuation_refreshed'
]);

const ACTIVATING = 'company_dossier_maintenance_accepted';

const clean = (value = '') => String(value ?? '').replace(/\s+/g, ' ').trim();
const idOf = (value) => clean(value?._id || value?.id || value);

/** Only a completed receipt is evidence. A pending one is an intention. */
const earned = (receipt) => clean(receipt?.status) === 'completed';

const earnedAt = (receipt) => {
  const at = new Date(receipt?.completedAt || receipt?.createdAt || '');
  return Number.isNaN(at.getTime()) ? null : at.toISOString();
};

const readParticipant = (participant, receipts) => {
  const id = idOf(participant);
  const mine = receipts.filter(receipt => earned(receipt) && idOf(receipt?.userId) === id);
  const produced = {};
  FIRST_THREE.forEach((kind) => {
    const first = mine
      .filter(receipt => clean(receipt.kind) === kind)
      .map(earnedAt)
      .filter(Boolean)
      .sort()[0] || null;
    produced[kind] = first;
  });
  const activatedAt = mine
    .filter(receipt => clean(receipt.kind) === ACTIVATING)
    .map(earnedAt)
    .filter(Boolean)
    .sort()[0] || null;

  const missing = FIRST_THREE.filter(kind => !produced[kind]);
  return {
    id,
    label: clean(participant?.label) || id,
    produced,
    missing,
    complete: missing.length === 0,
    activated: missing.length === 0 && Boolean(activatedAt),
    activatedAt
  };
};

const buildCohortActivation = ({ participants = [], receipts = null } = {}) => {
  const roster = (Array.isArray(participants) ? participants : []).filter(person => idOf(person));

  // Never read. Saying "nobody produced anything" here would be a lie with a
  // number attached.
  if (!Array.isArray(receipts)) {
    return {
      known: false,
      reason: 'The receipt store was not read, so nothing is known about this cohort.',
      size: roster.length,
      participants: [],
      complete: null,
      activated: null,
      passes: null
    };
  }

  const read = roster.map(person => readParticipant(person, receipts));
  const complete = read.filter(person => person.complete).length;
  const activated = read.filter(person => person.activated).length;

  return {
    known: true,
    size: roster.length,
    required: REQUIRED_COHORT,
    participants: read,
    complete,
    activated,
    // 5/5, and not one participant short of it.
    passes: roster.length >= REQUIRED_COHORT && complete === roster.length
  };
};

/** One line a human can read without decoding a JSON blob. */
const describeCohort = (cohort) => {
  if (!cohort?.known) return 'Stage 1 cohort: not read.';
  const { size, complete, activated, passes, required } = cohort;
  if (size < required) {
    return `Stage 1 cohort: ${complete}/${size} complete · ${size} of ${required} participants enrolled · gate cannot pass yet.`;
  }
  return `Stage 1 cohort: ${complete}/${size} complete · ${activated} activated · ${passes ? 'PASSES' : 'does not pass'}.`;
};

module.exports = {
  ACTIVATING,
  FIRST_THREE,
  REQUIRED_COHORT,
  buildCohortActivation,
  describeCohort
};
