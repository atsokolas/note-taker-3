import { normalizeSpaces, sentenceBoundaryTrim } from '../../utils/editorialText';

/* AT-414 — Morning Paper is a close or silence.
   Collision is the leftover truth of that surface: when two editorial
   truths meet, name that. When they do not, name the single close — or
   stay silent. Never a “work is ready” inbox. */

const SAFETY_LEAD = /^(user safety|safety|quality(?: gate)?)\s*:/i;
const STALE_DRIFT_PRESENT = /queued signals awaiting a rebuild/i;
const QUIET_FILLER = /quiet today|no new sources, updates, or drift/i;

export const completeLeadSentence = (value = '', maxLength = 280) => {
  const text = normalizeSpaces(value);
  if (!text) return '';
  if (text.length <= maxLength && /[.!?]$/.test(text)) return text;
  const lastStop = Math.max(text.lastIndexOf('.'), text.lastIndexOf('!'), text.lastIndexOf('?'));
  const complete = lastStop >= 0 && lastStop + 1 <= maxLength
    ? text.slice(0, lastStop + 1).trim()
    : '';
  if (complete) return sentenceBoundaryTrim(complete, { maxLength, fallback: complete });
  if (text.length <= maxLength) return `${text}.`;
  return sentenceBoundaryTrim(text, { maxLength, fallback: '' });
};

export const isEditorialBriefing = (value = '') => {
  const text = String(value || '').trim();
  if (!text) return false;
  if (SAFETY_LEAD.test(text)) return false;
  if (STALE_DRIFT_PRESENT.test(text)) return false;
  if (QUIET_FILLER.test(text)) return false;
  return true;
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

export const isPaperConsequence = (row = null) => {
  if (!row?.eventId || !row?.pageId || !row?.claimId) return false;
  if (!normalizeSpaces(row.prior) || !normalizeSpaces(row.proposed) || !normalizeSpaces(row.passage)) return false;
  return true;
};

/** Name a real editorial close — or a collision of two. A quiet day is silence. */
export const wikiLivingBriefingLine = ({ briefing } = {}) => {
  if (isPaperConsequence(briefing?.consequence)) return '';
  if (String(briefing?.aliveness?.register || '').toLowerCase() === 'quiet') return '';
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

/* B2 vs A7: A7 made a quiet day silence — never the deleted stale briefing
   filler. B2 keeps that silence of news, then prints one crafted sign-off.
   A close or collision still occupies the lead alone; the sign-off does not
   sit beside it. */

export const QUIET_SIGNOFFS = Object.freeze([
  'Quiet night. Your pages held.',
  'Nothing moved. Read something worth keeping.',
  'The paper is thin this morning. That’s allowed.',
  'No close today. The claims you hold still stand.',
  'Stillness. The corpus did not argue back.',
  'A quiet morning. The work is in what you already wrote.'
]);

const localDay = (now) => {
  const date = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const dayIndex = (day, length) => {
  const [year, month, date] = day.split('-').map(Number);
  const ordinal = Math.floor(Date.UTC(year, month - 1, date) / (24 * 60 * 60 * 1000));
  return Math.abs(ordinal) % length;
};

/** One sign-off a quiet morning. No two consecutive calendar days repeat. */
export const selectQuietSignOff = ({
  now = new Date(),
  lines = QUIET_SIGNOFFS
} = {}) => {
  const list = Array.isArray(lines) && lines.length ? lines : QUIET_SIGNOFFS;
  const day = localDay(now);
  if (!day) return list[0];
  return list[dayIndex(day, list.length)];
};

const CODE_SHAPED = /(?:POST|GET|PUT|PATCH|DELETE)\s+\/api\/|Wiki[A-Z]|createRepo|Composer\b/;
const INSTRUCTION_SHAPED = /^(use|run|install|click|see|refer to|follow|before editing|debugging)\b/i;

/** A Taste-Pass-clean belief, or nothing. Repo dumps never get a tap. */
export const isPaperCheckIn = (checkIn = null) => {
  if (!checkIn?.pageId || !checkIn?.claimId) return false;
  const text = normalizeSpaces(checkIn.text);
  if (!text || text.length > 220) return false;
  if (!isEditorialBriefing(text)) return false;
  if (CODE_SHAPED.test(text) || INSTRUCTION_SHAPED.test(text)) return false;
  return true;
};

export const isPaperVerdict = (ask = null) => (
  isPaperCheckIn(ask) && ['horizon', 'evidence'].includes(String(ask?.trigger || ''))
);

/**
 * Scan-for-blue = read-the-day. A qualified consequence takes the pulse;
 * otherwise a close or collision, then a living verdict, then a check-in.
 */
export const morningPulseTarget = ({ briefing } = {}) => {
  if (isPaperConsequence(briefing?.consequence)) return 'consequence';
  if (wikiLivingBriefingLine({ briefing })) return 'lead';
  const verdicts = (Array.isArray(briefing?.claimVerdicts) ? briefing.claimVerdicts : [])
    .filter(isPaperVerdict);
  if (verdicts.length) return 'verdict';
  if (isPaperCheckIn(briefing?.claimCheckIn)) return 'check-in';
  return '';
};

const ordinal = (value) => {
  const count = Math.max(1, Number(value) || 1);
  const rem100 = count % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${count}th`;
  const rem10 = count % 10;
  if (rem10 === 1) return `${count}st`;
  if (rem10 === 2) return `${count}nd`;
  if (rem10 === 3) return `${count}rd`;
  return `${count}th`;
};

export const formatCheckInTally = ({ action = 'reaffirmed', count = 1, heldDays = 0 } = {}) => {
  const verb = String(action || 'reaffirmed').toLowerCase();
  const days = Math.max(0, Number(heldDays) || 0);
  const held = days <= 0 ? 'today' : days === 1 ? '1 day' : `${days} days`;
  return `${verb} · ${ordinal(count)} · held ${held}`;
};

export const formatVerdictTally = ({ verdict = 'held_up', trigger = 'horizon', count = 1 } = {}) => {
  const word = String(verdict || 'held_up').replace('_', ' ');
  const why = trigger === 'evidence' ? 'evidence' : 'horizon';
  return `${word} · ${ordinal(count)} · ${why}`;
};
