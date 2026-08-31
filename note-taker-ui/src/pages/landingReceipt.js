import { formatCalendarDate } from '../utils/calendarDate';

/**
 * The receipt a revised belief leaves behind (Stage 1).
 *
 *   accepted · prior wording preserved · review Sep 30
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
export const describeLanding = ({ revisionId = '', nextReviewAt = null } = {}) => {
  const parts = ['accepted'];
  if (String(revisionId || '').trim()) parts.push('prior wording preserved');
  const review = formatCalendarDate(nextReviewAt);
  if (review) parts.push(`review ${review}`);
  return parts.join(' · ');
};
