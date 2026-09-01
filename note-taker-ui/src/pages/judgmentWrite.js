import { formatCalendarDate } from '../utils/calendarDate';

/**
 * The two things a write to a held belief says: what it will do, and what it
 * did. Same clauses, same order, same separator — so a reader who saw the
 * promise recognises the receipt, and a promise the write cannot keep is
 * visible as a difference rather than hidden as a rewording.
 *
 * describePreview runs before any state changes (Stage 2 asks for exactly
 * that). describeLanding runs after, and is the stricter of the two: the
 * preview may say what the write intends, but the receipt may only say what
 * the write is known to have done.
 *
 * The receipt a revised belief leaves behind (Stage 1).
 *
 *   accepted · prior wording preserved · review Sep 30
 *   narrowed · prior wording preserved · review Sep 30
 *
 * Every clause has to have earned its place. "prior wording preserved" is a
 * claim about durable storage, so it is printed only when the server hands
 * back the revision that holds the snapshot — the id is the proof, and
 * without it the line simply does not make the promise. "review" is printed
 * only when a review is actually scheduled; an unscheduled belief says
 * nothing rather than inventing a date to look diligent.
 *
 * The receipt is for the landing, not for the record. It reports what was
 * true at the moment the write completed.
 */
export const describeLanding = ({ verb = 'accepted', revisionId = '', nextReviewAt = null } = {}) => {
  const parts = [verb];
  if (String(revisionId || '').trim()) parts.push('prior wording preserved');
  const review = formatCalendarDate(nextReviewAt);
  if (review) parts.push(`review ${review}`);
  return parts.join(' · ');
};

const VERB_INTENT = {
  accept: 'accepting',
  narrow: 'narrowing',
  preserve: 'preserving what you hold',
  reject: 'rejecting',
  defer: 'deferring'
};

/**
 * What this disposition is about to do, shown before it does it.
 *
 * A preview is allowed to state intent — that is what it is for — but not to
 * invent scope. Bound sources are named only when the count is known, and a
 * review date only when one is actually scheduled. `null` for either means
 * we have not looked, and an unlooked-at number is not a zero.
 *
 * Only the two dispositions that write get a preview of consequences. The
 * three that do not change what you hold have nothing to preview, and saying
 * so at length would be theatre.
 */
export const describePreview = ({
  verb = 'accept',
  boundSources = null,
  nextReviewAt = null
} = {}) => {
  const intent = VERB_INTENT[verb];
  if (!intent) return '';
  const parts = [intent];
  if (verb === 'accept' || verb === 'narrow') {
    parts.push('prior wording kept');
    const bound = Number(boundSources);
    if (boundSources !== null && boundSources !== undefined && Number.isFinite(bound)) {
      parts.push(`${bound} bound source${bound === 1 ? '' : 's'} unchanged`);
    }
    const review = formatCalendarDate(nextReviewAt);
    if (review) parts.push(`review stays ${review}`);
  }
  return parts.join(' · ');
};
