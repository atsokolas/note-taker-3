/**
 * AT-429 — The Mirror. How good is my judgment?
 *
 * Typographic aggregations over this user's claims. Every stat is a list of
 * claims, not a score. No founder shortcut: pages arrive already scoped to
 * the signed-in userId.
 */

const { parseHorizon } = require('./claimFalsifiability');

const DAY = 24 * 60 * 60 * 1000;
const STATS = Object.freeze(['held', 'hold-time', 'revisions', 'verdicts', 'counter-evidence']);

const clean = (value = '', limit = 280) => {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > limit ? `${text.slice(0, limit - 1).trim()}…` : text;
};

const asPlain = (value) => (value?.toObject ? value.toObject({ virtuals: false }) : value);
const id = (value) => String(value?._id || value?.id || value || '');
const time = (value) => {
  if (!value) return NaN;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? NaN : parsed;
};

const isRetired = (claim = {}) => claim.checkInStatus === 'retired' || Boolean(claim.retiredAt);
const historyOf = (claim = {}) => (Array.isArray(claim.history) ? claim.history : []);
const verdictsOf = (claim = {}) => (Array.isArray(claim.verdicts) ? claim.verdicts : []);

const hrefFor = (page, claim) => {
  const pageId = id(page);
  if (page?.judgment?.currentJudgment || page?.judgment?.kind) {
    return `/judgment/${encodeURIComponent(pageId)}`;
  }
  return `/wiki/workspace?page=${encodeURIComponent(pageId)}&claimId=${encodeURIComponent(claim.claimId)}`;
};

const claimRow = (page, claim, extra = {}) => ({
  pageId: id(page),
  claimId: String(claim.claimId || ''),
  text: clean(claim.text || page?.judgment?.currentJudgment || page?.title || ''),
  href: hrefFor(page, claim),
  bornAt: claim.bornAt || claim.createdAt || page.createdAt || null,
  ...extra
});

const walkClaims = (pages = [], visit) => {
  (Array.isArray(pages) ? pages : []).forEach((pageValue) => {
    const page = asPlain(pageValue);
    (Array.isArray(page.claims) ? page.claims : []).forEach((claimValue) => {
      visit(page, asPlain(claimValue));
    });
  });
};

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

const firstConflictedAt = (claim) => {
  const hit = historyOf(claim).find((row) => String(row?.support) === 'conflicted');
  if (hit?.at) return hit.at;
  const evidence = verdictsOf(claim).find((row) => row.trigger === 'evidence');
  return evidence?.at || null;
};

const firstRevisionAfter = (claim, after) => {
  const start = time(after);
  if (Number.isNaN(start)) return null;
  const hit = historyOf(claim).find((row) => (
    String(row?.action || row?.event) === 'revised'
    && time(row?.at) >= start
  ));
  return hit?.at || null;
};

const latestVerdict = (claim) => {
  const rows = verdictsOf(claim);
  if (!rows.length) return null;
  return rows.reduce((latest, row) => (
    time(row.at) >= time(latest?.at) ? row : latest
  ));
};

const roundDays = (value) => (value == null ? null : Math.round(value * 10) / 10);

const collect = (pages = {}, now = new Date()) => {
  const held = [];
  const holdTimes = [];
  const revised = [];
  const checked = [];
  const byVerdict = {
    held_up: [],
    broke: [],
    partly: [],
    unresolvable: [],
    right_for_wrong_reasons: []
  };
  const counter = [];

  walkClaims(pages, (page, claim) => {
    if (!claim?.claimId) return;
    if (!isRetired(claim)) {
      held.push(claimRow(page, claim));
      const age = daysBetween(claim.bornAt || claim.createdAt || page.createdAt, now);
      if (age != null) holdTimes.push(age);
    }
    const actions = historyOf(claim).map((row) => String(row?.action || row?.event));
    if (actions.includes('revised') || actions.includes('reaffirmed')) {
      checked.push(claimRow(page, claim));
    }
    if (actions.includes('revised')) {
      revised.push(claimRow(page, claim));
    }
    const last = latestVerdict(claim);
    if (last && byVerdict[last.verdict]) {
      byVerdict[last.verdict].push(claimRow(page, claim, {
        verdict: last.verdict,
        at: last.at
      }));
    }
    const conflictedAt = firstConflictedAt(claim);
    const revisedAt = firstRevisionAfter(claim, conflictedAt);
    const lag = daysBetween(conflictedAt, revisedAt);
    if (lag != null) {
      counter.push(claimRow(page, claim, { days: roundDays(lag), conflictedAt, revisedAt }));
    }
  });

  return { held, holdTimes, revised, checked, byVerdict, counter };
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
  'counter-evidence': (bundle) => bundle.counter
};

/**
 * @param {{ pages: object[], now?: Date|number, userId?: string, stat?: string }} options
 * userId is recorded so the caller cannot forget whose ledger this is.
 */
const buildJudgmentMirror = ({ pages = [], now = new Date(), userId = '', stat = '' } = {}) => {
  const at = now instanceof Date ? now : new Date(now);
  const bundle = collect(pages, at);
  const checkedCount = bundle.checked.length;
  const revisionRate = checkedCount
    ? bundle.revised.length / checkedCount
    : null;
  const avgHold = mean(bundle.holdTimes);
  const avgLag = mean(bundle.counter.map((row) => row.days));
  const wanted = STATS.includes(String(stat)) ? String(stat) : '';
  const claims = wanted ? CLAIMS_FOR_STAT[wanted](bundle) : [];

  return {
    userId: String(userId || ''),
    generatedAt: at.toISOString(),
    stats: {
      held: {
        id: 'held',
        label: 'Claims held',
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
          `${bundle.byVerdict.held_up.length} held up`,
          `${bundle.byVerdict.broke.length} broke`,
          `${bundle.byVerdict.partly.length} partly`,
          `${bundle.byVerdict.unresolvable.length} unresolvable`,
          ...(bundle.byVerdict.right_for_wrong_reasons.length
            ? [`${bundle.byVerdict.right_for_wrong_reasons.length} right for the wrong reasons`]
            : [])
        ].join(' · '),
        href: '/judgment/mirror?stat=verdicts'
      },
      counterEvidence: {
        id: 'counter-evidence',
        label: 'Time from counter-evidence to revision',
        value: roundDays(avgLag),
        display: bundle.counter.length ? formatDays(avgLag) : '—',
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
