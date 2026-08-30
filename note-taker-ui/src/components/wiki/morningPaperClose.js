/* AT-414 — Morning Paper is a close or silence.
   /wiki may name something that actually finished. It never invents
   "work is ready" from a review count, a due claim, or an empty Recently updated. */

const SAFETY_LEAD = /^(user safety|safety|quality(?: gate)?)\s*:/i;

export const completeLeadSentence = (value = '', maxLength = 280) => {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  if (text.length <= maxLength && /[.!?]$/.test(text)) return text;
  const limit = Math.max(80, Number(maxLength) || 280);
  const matches = Array.from(text.matchAll(/[.!?](?=\s|$)/g));
  const boundary = matches
    .map(match => match.index + 1)
    .filter(index => index <= limit)
    .pop();
  if (boundary) return text.slice(0, boundary).trim();
  const clipped = text.slice(0, limit).replace(/[,:;–—-]+$/g, '').trim();
  const wordBoundary = clipped.lastIndexOf(' ');
  const clean = wordBoundary > 80 ? clipped.slice(0, wordBoundary).trim() : clipped;
  if (!clean) return '';
  return /[.!?]$/.test(clean) ? clean : `${clean}.`;
};

export const isEditorialBriefing = (value = '') => {
  const text = String(value || '').trim();
  if (!text) return false;
  return !SAFETY_LEAD.test(text);
};

const proposedLeadFromBriefing = (briefing = null) => {
  const lead = briefing?.lead;
  const fromLead = lead
    ? [lead.title, lead.page?.title, lead.impactSummary].filter(Boolean).join('. ')
    : '';
  return completeLeadSentence(fromLead || briefing?.summary || '');
};

/** Name a real editorial close. Invented review-count copy is silence. */
export const wikiLivingBriefingLine = ({ briefing } = {}) => {
  const proposed = proposedLeadFromBriefing(briefing);
  return isEditorialBriefing(proposed) ? proposed : '';
};

/** A shelf count of zero is a fake ready-badge. Omit it. */
export const shelfCount = (count) => {
  const n = Number(count);
  return Number.isFinite(n) && n > 0 ? n : undefined;
};
