/**
 * AT-429 — The Mirror. How good is my judgment?
 *
 * Typographic aggregations over this user's views. Every stat is a list of
 * views, not a score. No founder shortcut: pages arrive already scoped to
 * the signed-in userId.
 */

const { wordBoundaryTrim } = require('../lib/editorialText');

const DAY = 24 * 60 * 60 * 1000;
const STATS = Object.freeze(['held', 'hold-time', 'revisions', 'verdicts', 'counter-evidence']);

const clean = (value = '', limit = 280) => wordBoundaryTrim(String(value || '').replace(/\s+/g, ' ').trim(), { maxLength: limit });

const asPlain = (value) => (value?.toObject ? value.toObject({ virtuals: false }) : value);
const id = (value) => String(value?._id || value?.id || value || '');
const time = (value) => {
  if (!value) return NaN;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? NaN : parsed;
};

/* A view is a page holding a sentence — the same object the Judgment index
   lists. Counting the wiki claim ledger instead made the Mirror report views
   the index had never heard of. */
const heldSentence = (page = {}) => String(page?.judgment?.currentJudgment || '').trim();
const isActive = (page = {}) => !['parked', 'closed', 'archived'].includes(String(page?.judgment?.status || ''));
const heldSince = (page = {}) => page?.judgment?.startedAt || page?.judgment?.bornAt || page?.createdAt || null;

const viewRow = (page, extra = {}) => ({
  pageId: id(page),
  claimId: '',
  text: clean(heldSentence(page)),
  href: `/judgment/${encodeURIComponent(id(page))}`,
  bornAt: heldSince(page),
  ...extra
});

const mean = (values) => {
  const list = values.filter((value) => Number.isFinite(value));
  if (!list.length) return null;
  return list.reduce((sum, value) => sum + value, 0) / list.length;
};

const daysBetween = (from, to) => {
  const start = time(from);
  const end = time(to);
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return null;
  return Math.max(0, (end - start) / DAY);
};

const roundDays = (value) => (value == null ? null : Math.round(value * 10) / 10);

const collect = (pages = [], now = new Date()) => {
  const views = (Array.isArray(pages) ? pages : []).map(asPlain).filter(page => heldSentence(page));
  const held = [];
  const holdTimes = [];
  const revised = [];
  const byVerdict = {
    held_up: [],
    broke: [],
    partly: [],
    unresolvable: [],
    right_for_wrong_reasons: []
  };

  views.forEach((page) => {
    if (isActive(page)) {
      held.push(viewRow(page));
      const age = daysBetween(heldSince(page), now);
      if (age != null) holdTimes.push(age);
    }
    if (Array.isArray(page.judgment?.heldHistory) && page.judgment.heldHistory.length) {
      revised.push(viewRow(page));
    }
    const verdicts = Array.isArray(page.judgment?.verdicts) ? page.judgment.verdicts : [];
    const last = verdicts[verdicts.length - 1];
    if (last && byVerdict[last.result]) {
      byVerdict[last.result].push(viewRow(page, { verdict: last.result, at: last.recordedAt }));
    }
  });

  return { views, held, holdTimes, revised, byVerdict };
};

const formatDays = (value) => {
  if (value == null) return '';
  if (value < 1) return 'less than a day';
  if (Math.abs(value - 1) < 0.05) return '1 day';
  const rounded = Number.isInteger(value) ? String(value) : String(roundDays(value));
  return `${rounded} days`;
};

const CLAIMS_FOR_STAT = {
  held: (bundle) => bundle.held,
  'hold-time': (bundle) => bundle.held,
  revisions: (bundle) => bundle.revised,
  verdicts: (bundle) => Object.values(bundle.byVerdict).flat(),
  'counter-evidence': (_bundle, exactCounterevidence = []) => exactCounterevidence
};

/**
 * @param {{ pages: object[], now?: Date|number, userId?: string, stat?: string }} options
 * userId is recorded so the caller cannot forget whose ledger this is.
 */
const buildJudgmentMirror = ({
  pages = [], now = new Date(), userId = '', stat = '', counterevidence = []
} = {}) => {
  const at = now instanceof Date ? now : new Date(now);
  const bundle = collect(pages, at);
  const revisionRate = bundle.views.length
    ? bundle.revised.length / bundle.views.length
    : null;
  const avgHold = mean(bundle.holdTimes);
  const exactCounterevidence = Array.isArray(counterevidence) ? counterevidence : [];
  const avgLag = mean(exactCounterevidence.map((row) => Number(row?.days)));
  const wanted = STATS.includes(String(stat)) ? String(stat) : '';
  const claims = wanted ? CLAIMS_FOR_STAT[wanted](bundle, exactCounterevidence) : [];

  return {
    userId: String(userId || ''),
    generatedAt: at.toISOString(),
    stats: {
      held: {
        id: 'held',
        label: 'Views held',
        value: bundle.held.length,
        display: String(bundle.held.length),
        href: '/judgment/mirror?stat=held'
      },
      holdTime: {
        id: 'hold-time',
        label: 'Average hold time',
        value: roundDays(avgHold),
        display: bundle.held.length ? formatDays(avgHold) : '—',
        href: '/judgment/mirror?stat=hold-time'
      },
      revisions: {
        id: 'revisions',
        label: 'Revision rate',
        value: revisionRate,
        display: revisionRate == null ? '—' : `${Math.round(revisionRate * 100)}%`,
        href: '/judgment/mirror?stat=revisions'
      },
      verdicts: {
        id: 'verdicts',
        label: 'Verdict record',
        value: {
          held_up: bundle.byVerdict.held_up.length,
          broke: bundle.byVerdict.broke.length,
          partly: bundle.byVerdict.partly.length,
          unresolvable: bundle.byVerdict.unresolvable.length,
          right_for_wrong_reasons: bundle.byVerdict.right_for_wrong_reasons.length
        },
        display: [
          [bundle.byVerdict.held_up.length, 'held up'],
          [bundle.byVerdict.broke.length, 'broke'],
          [bundle.byVerdict.partly.length, 'partly'],
          [bundle.byVerdict.unresolvable.length, 'could not be settled'],
          [bundle.byVerdict.right_for_wrong_reasons.length, 'right for the wrong reasons']
        ].filter(([count]) => count).map(([count, word]) => `${count} ${word}`).join(' · '),
        href: '/judgment/mirror?stat=verdicts'
      },
      counterEvidence: {
        id: 'counter-evidence',
        label: 'Time from counter-evidence to response',
        value: roundDays(avgLag),
        display: exactCounterevidence.length ? formatDays(avgLag) : '—',
        href: '/judgment/mirror?stat=counter-evidence'
      }
    },
    stat: wanted,
    claims
  };
};

module.exports = {
  STATS,
  buildJudgmentMirror,
  formatDays
};
