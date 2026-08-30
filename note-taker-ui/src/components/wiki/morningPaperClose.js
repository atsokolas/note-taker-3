import { sentenceBoundaryTrim } from '../../utils/editorialText';

/* AT-414 — Morning Paper is a close or silence.
   Collision is the leftover truth of that surface: when two editorial
   truths meet, name that. When they do not, name the single close — or
   stay silent. Never a “work is ready” inbox. */

const SAFETY_LEAD = /^(user safety|safety|quality(?: gate)?)\s*:/i;

export const completeLeadSentence = (value = '', maxLength = 280) => {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  if (text.length <= maxLength && /[.!?]$/.test(text)) return text;
  const matches = Array.from(text.matchAll(/[.!?](?=\s|$)/g));
  const boundary = matches
    .map(match => match.index + 1)
    .filter(index => index <= maxLength)
    .pop();
  if (boundary) {
    return sentenceBoundaryTrim(text.slice(0, boundary), { maxLength, fallback: '' });
  }
  if (text.length <= maxLength) return `${text}.`;
  return sentenceBoundaryTrim(text, { maxLength, fallback: '' });
};

export const isEditorialBriefing = (value = '') => {
  const text = String(value || '').trim();
  if (!text) return false;
  return !SAFETY_LEAD.test(text);
};

const stripTerminal = (value = '') => String(value || '').replace(/[.!?]+$/g, '').trim();

const proposedLeadFromBriefing = (briefing = null) => {
  const lead = briefing?.lead;
  const fromLead = lead
    ? [lead.title, lead.page?.title, lead.impactSummary].filter(Boolean).join('. ')
    : '';
  return completeLeadSentence(fromLead || briefing?.summary || '');
};

const watcherCloseFromLead = (lead = null) => {
  if (!lead || typeof lead !== 'object') return null;
  const title = completeLeadSentence(lead.title || '');
  const named = isEditorialBriefing(title) ? title : '';
  const sentence = proposedLeadFromBriefing({ lead, summary: '' });
  if (!named && !isEditorialBriefing(sentence)) return null;
  return {
    pageId: lead.page?.id ? String(lead.page.id) : '',
    eventId: lead.eventId ? String(lead.eventId) : '',
    title: named,
    sentence: isEditorialBriefing(sentence) ? sentence : named
  };
};

const editorialWatcherCloses = (briefing = null) => {
  const rows = [];
  const seen = new Set();
  const push = (lead) => {
    const close = watcherCloseFromLead(lead);
    if (!close) return;
    const key = close.eventId || `${close.pageId}:${close.title || close.sentence}`;
    if (seen.has(key)) return;
    seen.add(key);
    rows.push(close);
  };
  push(briefing?.lead);
  (Array.isArray(briefing?.watcherLeads) ? briefing.watcherLeads : []).forEach(push);
  return rows;
};

const closeCollidingWithHold = (briefing = null, closes = []) => {
  const hold = briefing?.claimCheckIn;
  if (!hold || hold.changedSinceLastCheck !== true) return null;
  const pageId = hold.pageId ? String(hold.pageId) : '';
  if (!pageId) return null;
  return closes.find(close => close.pageId === pageId) || null;
};

const paperCollisionLine = (briefing = null) => {
  const closes = editorialWatcherCloses(briefing);
  const held = closeCollidingWithHold(briefing, closes);
  if (held) {
    const named = held.title || held.sentence;
    return completeLeadSentence(`${stripTerminal(named)}. It touched a claim you still hold.`);
  }
  if (closes.length >= 2) {
    const first = closes[0].title || closes[0].sentence;
    const second = closes[1].title || closes[1].sentence;
    return completeLeadSentence(
      `${stripTerminal(first)}. Another close: ${stripTerminal(second)}.`
    );
  }
  return '';
};

/** Name a real editorial close — or a collision of two. Invented review-count copy is silence. */
export const wikiLivingBriefingLine = ({ briefing } = {}) => {
  const collision = paperCollisionLine(briefing);
  if (collision) return collision;
  const proposed = proposedLeadFromBriefing(briefing);
  return isEditorialBriefing(proposed) ? proposed : '';
};

/** A shelf count of zero is a fake ready-badge. Omit it. */
export const shelfCount = (count) => {
  const n = Number(count);
  return Number.isFinite(n) && n > 0 ? n : undefined;
};
