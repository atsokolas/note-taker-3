import { normalizeSpaces } from '../../utils/editorialText';

/**
 * The above-fold delta (Stage 2).
 *
 *   what changed / what it affects / what I need from you
 *
 * The product could already say what changed. What it affects was a count in
 * a scope row and a list behind a disclosure triangle labelled "Sources and
 * provenance" — so learning which of your beliefs a filing touched meant
 * opening a details element named after something else. What it needs from
 * you was an unlabelled arrow.
 *
 * All three parts come from what the movement already carries. None of them
 * are invented, and each is omitted rather than padded:
 *
 *   · affects is empty when nothing is affected, and the surface then says
 *     nothing instead of "0 affected claims"
 *   · asks is empty when there is no next action, because an update that
 *     needs nothing from you should not manufacture a demand to look busy
 *
 * Affected claims outrank affected objects: a claim is a thing you believe,
 * an object is a thing you own, and the delta is about your thinking.
 */
const LEAD_LIMIT = 2;

const named = (refs = []) => (Array.isArray(refs) ? refs : [])
  .map(ref => ({ id: normalizeSpaces(ref?.id) || normalizeSpaces(ref?.title), title: normalizeSpaces(ref?.title), href: ref?.href, external: Boolean(ref?.external) }))
  .filter(ref => ref.title && ref.href);

export const describeConsequenceDelta = (movement = {}, { limit = LEAD_LIMIT } = {}) => {
  const claims = named(movement.subjects);
  const objects = named(movement.affected);
  const affected = claims.length ? claims : objects;
  const asks = normalizeSpaces(movement?.nextAction?.label);

  return {
    changed: normalizeSpaces(movement.whyItMatters),
    // What the delta is naming, so the surface can say "claim" or "object"
    // rather than guessing.
    affectedKind: claims.length ? 'claim' : 'object',
    affects: affected.slice(0, Math.max(0, limit)),
    affectedRest: Math.max(0, affected.length - Math.max(0, limit)),
    asks,
    askHref: asks ? movement?.nextAction?.href || '' : ''
  };
};

/** "and 3 more" — or nothing, when there is no more. */
export const describeAffectedRest = (rest = 0) => (rest > 0 ? `and ${rest} more` : '');
