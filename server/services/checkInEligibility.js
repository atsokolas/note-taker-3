/**
 * Check-in claim eligibility (Taste Pass T1).
 *
 * Eligibility gate: a stance a person can hold, from a judgment surface,
 * short enough to render in full, first-person ownable, and not shown in
 * the last 14 days.
 * Quality bar: code/process/instruction prose and fragment-length text
 * are suppressed even when they sit on a judgment page.
 * Silence fallback: if nothing qualifies, serve no check-in.
 */

const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_CHARS = 220;
const MAX_SENTENCES = 2;
const MIN_WORDS = 4;
const MIN_CHARS = 24;

const EXCLUDED_PAGE_TYPES = new Set(['repo', 'log', 'edition']);
const JUDGMENT_PAGE_TYPES = new Set(['concept']);

const REPO_WIKI_TITLE = /\brepo wiki\b/i;
const EDITION_TITLE = /\bthis week in\b|\bedition\b/i;
const SYSTEM_TITLE = /\bacceptance\b|\bsystem status\b|\bbuild order verification\b/i;
const CODE_SHAPED = /(?:POST|GET|PUT|PATCH|DELETE)\s+\/api\/|\/api\/[a-z]|Wiki[A-Z][A-Za-z]+|[a-z]+[A-Z][A-Za-z]+From[A-Z]|Composer\b|createRepo/;
/**
 * A belief answers "do you still believe that…?"; an instruction cannot.
 * One vocabulary, checked once — the earlier pair of overlapping lists let a
 * memorised denylist of one observed sentence stand in for a real gate.
 */
const IMPERATIVE_OPENER = /^(use|run|install|click|see|refer to|follow|debug|debugging|open|create|add|update|delete|before editing)\b/i;

/* Observed live 2026-08-29 on the morning paper — must fail every T1 gate. */
const EXHIBIT_A = 'Use these traces before editing because repo bugs usually cross UI, API, service, persistence, and render boundaries… WikiRepoCreateComposer, createRepoWikiFromGitHub, POST /api/wiki/pages/from-github… debugging only the v…';

const normalize = (value = '') => String(value || '').replace(/\s+/g, ' ').trim();

const sentenceCount = (text = '') => {
  const parts = normalize(text).split(/(?<=[.!?])\s+/).filter(Boolean);
  return Math.max(parts.length, text ? 1 : 0);
};

const isNaturalBeliefFrame = (text = '') => {
  const core = normalize(text)
    .replace(/^[.!?…]+/, '')
    .replace(/[.!?…]+$/g, '')
    .replace(/^that\s+/i, '')
    .trim();
  if (!core) return false;
  // "Do you still believe that Use these traces…" is not natural English.
  if (IMPERATIVE_OPENER.test(core)) return false;
  return true;
};

const isBeliefShaped = (text = '') => {
  const value = normalize(text);
  if (!value) return false;
  if (CODE_SHAPED.test(value)) return false;
  return isNaturalBeliefFrame(value);
};

const isJudgmentSurface = (page = {}) => {
  const type = String(page.pageType || '').toLowerCase();
  const title = String(page.title || '');
  if (EXCLUDED_PAGE_TYPES.has(type)) return false;
  if (REPO_WIKI_TITLE.test(title)) return false;
  if (EDITION_TITLE.test(title)) return false;
  if (SYSTEM_TITLE.test(title)) return false;
  if (page.investmentDossier || page.activeCompanyDossierKey) return true;
  if (page.judgment && (page.judgment.kind || page.judgment.currentJudgment)) return true;
  if (JUDGMENT_PAGE_TYPES.has(type)) return true;
  return false;
};

const isFirstPersonOwnable = (claim = {}) => {
  const status = String(claim.checkInStatus || '');
  if (status === 'reaffirmed' || status === 'revised') return true;
  const history = Array.isArray(claim.history) ? claim.history : [];
  return history.some((row) => (
    row?.actorType === 'user'
    || row?.disposition === 'accepted'
    || ['reaffirmed', 'revised', 'restored'].includes(String(row?.action || ''))
  ));
};

const isShortEnough = (text = '') => {
  const value = normalize(text);
  if (value.length > MAX_CHARS) return false;
  if (sentenceCount(value) > MAX_SENTENCES) return false;
  return true;
};

const meetsQualityBar = (text = '') => {
  const value = normalize(text);
  const words = value.split(/\s+/).filter(Boolean);
  return value.length >= MIN_CHARS && words.length >= MIN_WORDS;
};

const evaluateCheckInEligibility = ({ page = {}, claim = {}, now = Date.now() } = {}) => {
  const reasons = [];
  if (!claim || claim.checkInStatus === 'retired' || claim.retiredAt) {
    return { eligible: false, reasons: ['retired'], text: normalize(claim?.text) };
  }
  const text = normalize(claim.text);
  if (!isBeliefShaped(text)) reasons.push('not_belief_shaped');
  if (!isJudgmentSurface(page)) reasons.push('not_judgment_surface');
  if (!isShortEnough(text)) reasons.push('too_long');
  if (!meetsQualityBar(text)) reasons.push('below_quality_bar');
  if (!isFirstPersonOwnable(claim)) reasons.push('not_ownable');
  const lastChecked = new Date(claim.lastCheckedAt || 0).getTime();
  if (lastChecked && Number.isFinite(lastChecked) && now - lastChecked < FOURTEEN_DAYS_MS) {
    reasons.push('shown_within_14_days');
  }
  return { eligible: reasons.length === 0, reasons, text };
};

const REPO_WIKI_CLAIM_CORPUS = Object.freeze([
  {
    page: {
      _id: 'repo-wiki',
      title: 'note-taker-3 — repo wiki',
      pageType: 'repo',
      slug: 'note-taker-3-repo-wiki'
    },
    claim: {
      claimId: 'observed-2026-08-29',
      text: EXHIBIT_A,
      support: 'supported',
      sourceRefIds: ['s1', 's2', 's3'],
      checkInStatus: 'unreviewed',
      history: [{ actorType: 'agent', action: '', summary: 'Extracted from repo wiki draft.' }]
    }
  },
  {
    page: {
      _id: 'edition',
      title: 'This Week in AI',
      pageType: 'overview'
    },
    claim: {
      claimId: 'edition-lead',
      text: 'Frontier labs shipped three overlapping model drops this week.',
      sourceRefIds: ['s1', 's2'],
      checkInStatus: 'unreviewed',
      history: []
    }
  },
  {
    page: {
      _id: 'acceptance',
      title: 'Public proof acceptance',
      pageType: 'log'
    },
    claim: {
      claimId: 'acceptance-note',
      text: 'The acceptance clock must stay bound to the published head.',
      sourceRefIds: ['s1', 's2'],
      checkInStatus: 'unreviewed',
      history: [{ actorType: 'system' }]
    }
  }
]);

module.exports = {
  FOURTEEN_DAYS_MS,
  MAX_CHARS,
  EXHIBIT_A,
  evaluateCheckInEligibility,
  isBeliefShaped,
  isJudgmentSurface,
  isFirstPersonOwnable,
  isShortEnough,
  isNaturalBeliefFrame,
  REPO_WIKI_CLAIM_CORPUS
};
