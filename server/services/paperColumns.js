/**
 * What the paper has to say about you this morning.
 *
 * The front page was a maintenance grid: sixty rows where two phrases —
 * "Review available" and "No proposal" — repeated down a column. Every fact on
 * it was true and none of it was worth reading, because a status that is true
 * of forty-four rows out of sixty is not a status, it is wallpaper.
 *
 * These are the four things only this product can print, because only this
 * product keeps a dated ledger of what its reader believed:
 *
 *   The anniversary — a claim you made a year ago and have not looked at
 *   since. Every other reading app can show you a highlight from last March.
 *   Only this one can show you a belief and ask whether you still hold it.
 *
 *   The disagreement — two sources you trusted enough to save, saying
 *   opposite things. The single most interesting sentence a library can
 *   produce about itself.
 *
 *   The correction — papers print these, and it is the most charming thing
 *   they do. A claim you retired and then restored is a real reversal with a
 *   real audit trail, so the paper can admit what it told you last week.
 *
 *   The obituary — a page nothing has been added to in months. Wry, useful,
 *   and papers have always run them.
 *
 * Each returns null rather than something. A morning with no anniversary
 * prints no anniversary; it does not print "no anniversary". That is what
 * makes the paper short on a quiet day, which is the point — a paper whose
 * length tells you what kind of day it is before you read a word.
 */

const { wordBoundaryTrim } = require('../lib/editorialText');
const { buildCalibration } = require('./calibrationInstrument');

const DAY_MS = 24 * 60 * 60 * 1000;

/* A claim on the front page is a quotation, and a quotation that stops
   mid-word reads as broken software rather than as an excerpt. Claims in a
   real corpus run to whole paragraphs — the first one this column ever showed
   ended "...balancing conviction with a" — so they are cut at a word, with the
   mark that says there is more. The claim's own page carries the rest. */
const CLAIM_EXCERPT = 240;

const excerpt = (value = '') => wordBoundaryTrim(
  String(value == null ? '' : value).replace(/\s+/g, ' ').trim(),
  { maxLength: CLAIM_EXCERPT }
);

/* A year, less a fortnight, so a claim made "about a year ago" still counts.
   Waiting for the exact anniversary would mean the column almost never runs. */
const ANNIVERSARY_MIN_AGE_MS = 350 * DAY_MS;
const CORRECTION_WINDOW_MS = 21 * DAY_MS;
const OBITUARY_MIN_SILENCE_MS = 60 * DAY_MS;

const clean = (value = '', limit = 400) => String(value == null ? '' : value)
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, limit);

const idOf = (value) => String(value?._id || value?.id || value || '');

const time = (value) => {
  if (!value) return 0;
  const date = value instanceof Date ? value : new Date(value);
  const ms = date.getTime();
  return Number.isNaN(ms) ? 0 : ms;
};

const list = (value) => (Array.isArray(value) ? value : []);

/* The same day gives the same paper. A front page that reshuffles when you
   refresh is a feed wearing a masthead. */
const editionDay = (now) => new Date(now).toISOString().slice(0, 10);

const seedOf = (key = '') => {
  let seed = 0;
  for (let index = 0; index < key.length; index += 1) {
    seed = (seed * 31 + key.charCodeAt(index)) % 1_000_003;
  }
  return seed;
};

const pickByDay = (items = [], now = Date.now()) => {
  if (!items.length) return null;
  const ordered = [...items].sort((left, right) => left.key.localeCompare(right.key));
  return ordered[seedOf(editionDay(now)) % ordered.length];
};

/* Every claim on every page, carrying the page it belongs to, because a claim
   without a door back to its page is a sentence the reader cannot act on. */
const allClaims = (pages = []) => list(pages).flatMap((page) => {
  const pageId = idOf(page);
  const pageTitle = clean(page?.title, 200);
  if (!pageId || !pageTitle) return [];
  return list(page.claims)
    .filter(claim => clean(claim?.text))
    .map(claim => ({ claim, pageId, pageTitle }));
});

const lastTouch = (claim = {}) => Math.max(
  time(claim.lastCheckedAt),
  time(claim.lastReviewedAt),
  ...list(claim.history).map(entry => time(entry.at)),
  ...list(claim.verdicts).map(entry => time(entry.at))
);

/* Same month and day, a whole number of years apart, read in UTC — the same
   clock bornAt was written on. */
const sameDayOfYear = (from, to) => {
  const born = new Date(from);
  const today = new Date(to);
  return born.getUTCMonth() === today.getUTCMonth() && born.getUTCDate() === today.getUTCDate();
};

const yearsBetween = (from, to) => Math.max(1, Math.round((to - from) / (365 * DAY_MS)));

/**
 * A belief you have not looked at in a year.
 *
 * Preferring the ones you have never gone back to, because a claim you
 * reaffirmed last month is not a question — it is settled, and the paper has
 * nothing to ask about it. Retired claims are left alone: you already
 * answered.
 */
const candidateAnniversaries = ({ pages = [], now = Date.now() } = {}) => (
  allClaims(pages)
    .filter(({ claim }) => {
      if (claim.checkInStatus === 'retired' || claim.retiredAt) return false;
      const born = time(claim.bornAt) || time(claim.createdAt);
      if (!born || now - born < ANNIVERSARY_MIN_AGE_MS) return false;
      /* Touched since it was born means you have already revisited it. */
      return lastTouch(claim) <= born + DAY_MS;
    })
    .map(({ claim, pageId, pageTitle }) => ({
      key: `${pageId}:${claim.claimId || clean(claim.text, 80)}`,
      claimId: clean(claim.claimId, 120),
      pageId,
      pageTitle,
      text: excerpt(claim.text),
      bornAt: new Date(time(claim.bornAt) || time(claim.createdAt)).toISOString(),
      years: yearsBetween(time(claim.bornAt) || time(claim.createdAt), now),
      /* Not "about a year ago" — a year ago *today*. The difference between
         approximate and exact is the difference between a database and a
         paper that is paying attention. */
      toTheDay: sameDayOfYear(time(claim.bornAt) || time(claim.createdAt), now)
    }))
);

const anniversary = ({ pages = [], now = Date.now() } = {}) => (
  pickByDay(candidateAnniversaries({ pages, now }), now)
);

/**
 * Your own sources, caught arguing.
 *
 * A claim marked conflicted, or one carrying citations that contradict it.
 * Both mean the same thing to a reader: you saved two things that cannot both
 * be right, and nobody has decided which.
 */
const candidateDisagreements = ({ pages = [] } = {}) => (
  allClaims(pages)
    .filter(({ claim }) => (
      claim.support === 'conflicted' || list(claim.contradictedByCitationIds).length > 0
    ))
    .map(({ claim, pageId, pageTitle }) => ({
      key: `${pageId}:${claim.claimId || clean(claim.text, 80)}`,
      claimId: clean(claim.claimId, 120),
      pageId,
      pageTitle,
      text: excerpt(claim.text),
      against: list(claim.contradictedByCitationIds).length
    }))
);

const disagreement = ({ pages = [], now = Date.now() } = {}) => (
  pickByDay(candidateDisagreements({ pages }), now)
);

const REVERSALS = Object.freeze({
  restored: 'retired',
  revised: 'reaffirmed',
  broke: 'held_up',
  held_up: 'broke'
});

const CORRECTION_PHRASE = Object.freeze({
  restored: ['retired', 'brought it back'],
  revised: ['reaffirmed', 'revised it'],
  broke: ['said it held up', 'recorded that it broke'],
  held_up: ['recorded that it broke', 'said it held up']
});

/**
 * What the paper got wrong, or what you changed your mind about.
 *
 * A reversal is two entries in one claim's own history: something you did,
 * and then the opposite. Real audit trail, no guessing — the paper is not
 * remembering what it printed, it is reading what happened.
 */
const corrections = ({ pages = [], now = Date.now(), limit = 2 } = {}) => allClaims(pages)
  .flatMap(({ claim, pageId, pageTitle }) => {
    const history = list(claim.history)
      .filter(entry => entry.action && time(entry.at))
      .sort((left, right) => time(left.at) - time(right.at));
    return history.flatMap((entry, index) => {
      const undoes = REVERSALS[entry.action];
      if (!undoes) return [];
      if (now - time(entry.at) > CORRECTION_WINDOW_MS) return [];
      const before = history.slice(0, index).reverse().find(earlier => earlier.action === undoes);
      if (!before) return [];
      const [was, became] = CORRECTION_PHRASE[entry.action];
      return [{
        key: `${pageId}:${claim.claimId}:${time(entry.at)}`,
        pageId,
        pageTitle,
        text: excerpt(claim.text),
        was,
        became,
        at: new Date(time(entry.at)).toISOString()
      }];
    });
  })
  .sort((left, right) => time(right.at) - time(left.at))
  .slice(0, Math.max(0, limit));

/**
 * A page nothing has been added to in a season.
 *
 * Only pages that were alive once. A page with no claims and no sources was
 * never alive, so it has not died — it is just empty, and an obituary for it
 * would be a joke at the reader's expense.
 */
const candidateObituaries = ({ pages = [], now = Date.now() } = {}) => (
  list(pages)
    .filter((page) => {
      if (!idOf(page) || !clean(page?.title)) return false;
      if (page.status === 'archived') return false;
      const alive = list(page.claims).length > 0 || list(page.sourceRefs).length > 0;
      if (!alive) return false;
      const touched = time(page.updatedAt);
      return touched && now - touched > OBITUARY_MIN_SILENCE_MS;
    })
    .map(page => ({
      key: idOf(page),
      pageId: idOf(page),
      pageTitle: clean(page.title, 200),
      silentSince: new Date(time(page.updatedAt)).toISOString(),
      days: Math.floor((now - time(page.updatedAt)) / DAY_MS)
    }))
);

/* The longest silence, not a random one. An obituary is for the deadest thing
   on the shelf. */
const obituary = ({ pages = [], now = Date.now() } = {}) => (
  [...candidateObituaries({ pages, now })]
    .sort((left, right) => time(left.silentSince) - time(right.silentSince))[0] || null
);

/**
 * The thing you said would change your mind may have happened.
 *
 * A falsifier a watcher matched is the loudest thing this product can print,
 * so it leads — above the anniversary, above everything. It is `warning`, not
 * `triggered`: the software noticed, and the reader decides. The verdict
 * vocabulary is waiting for an answer only a person can give.
 *
 * The newest first, and only one. Two of these on one morning is not twice
 * the signal, it is a queue.
 */
const warned = ({ pages = [] } = {}) => {
  const rows = list(pages).flatMap((page) => {
    const pageId = idOf(page);
    const pageTitle = clean(page?.title, 200);
    if (!pageId || !pageTitle) return [];
    return list(page?.judgment?.falsifiers)
      .filter(falsifier => falsifier?.status === 'warning' && clean(falsifier.text))
      .map(falsifier => ({
        pageId,
        pageTitle,
        falsifierId: clean(falsifier.falsifierId, 120),
        text: excerpt(falsifier.text),
        signal: excerpt(falsifier.observableSignal),
        at: falsifier.lastCheckedAt ? new Date(time(falsifier.lastCheckedAt)).toISOString() : null
      }));
  });
  if (!rows.length) return null;
  return rows.sort((left, right) => time(right.at) - time(left.at))[0];
};

/**
 * How your confidence has met later outcomes.
 *
 * The instrument already exists and already refuses to speak without enough
 * settled cases — it hands back its own silence rather than a number. All
 * this does is quote the band with the most evidence, on the days it has
 * something to say. No score, no leaderboard, no trend line: one sentence,
 * and the Mirror for the rest.
 */
const calibration = ({ pages = [], userId = '' } = {}) => {
  /* The instrument reads real documents and does not expect holes in the
     array. Every other column here already tolerates a half-written page, so
     the filtering happens at this door rather than by loosening a service the
     Judgment Mirror also depends on. */
  const instrument = buildCalibration(list(pages).filter(Boolean), { userId });
  const speaking = list(instrument?.byConfidence).filter(band => band?.sufficient && band.n);
  if (!speaking.length) return null;
  const band = speaking.sort((left, right) => right.n - left.n)[0];
  return {
    confidence: band.confidence,
    held: (band.counts?.held_up || 0) + (band.counts?.partly || 0),
    of: band.n
  };
};

/**
 * The oldest thing still open.
 *
 * A superlative, and a useful one: the oldest open question is usually the
 * one being avoided. Wiki open questions are the reader's own unanswered
 * lines, so age is measured from the page that carries them.
 */
const oldestOpen = ({ pages = [], now = Date.now() } = {}) => {
  const rows = list(pages).flatMap((page) => {
    const pageId = idOf(page);
    const pageTitle = clean(page?.title, 200);
    if (!pageId || !pageTitle) return [];
    return list(page?.judgment?.unknowns)
      .filter(unknown => unknown?.status === 'open' && clean(unknown.question))
      .map(unknown => ({
        pageId,
        pageTitle,
        text: excerpt(unknown.question),
        at: time(unknown.createdAt),
        days: Math.floor((now - time(unknown.createdAt)) / DAY_MS)
      }))
      .filter(row => row.at);
  });
  if (!rows.length) return null;
  return rows.sort((left, right) => left.at - right.at)[0];
};

/**
 * Right for the wrong reasons.
 *
 * The verdict has always been recordable and has never been printed. It is
 * the most honest thing in the vocabulary, and the only software that lets a
 * person admit it should say so — once, deadpan, and recently, because it is
 * a remark rather than a standing fact.
 */
const RIGHT_FOR_WRONG_REASONS_WINDOW_MS = 21 * DAY_MS;

const rightForWrongReasons = ({ pages = [], now = Date.now() } = {}) => {
  const rows = list(pages).flatMap((page) => {
    const pageId = idOf(page);
    const pageTitle = clean(page?.title, 200);
    if (!pageId || !pageTitle) return [];
    return allClaims([page])
      .flatMap(({ claim }) => list(claim.verdicts)
        .filter(verdict => verdict?.verdict === 'right_for_wrong_reasons')
        .map(verdict => ({
          pageId,
          pageTitle,
          claim: excerpt(claim.text),
          at: time(verdict.at)
        })))
      .filter(row => row.at && now - row.at <= RIGHT_FOR_WRONG_REASONS_WINDOW_MS);
  });
  if (!rows.length) return null;
  return rows.sort((left, right) => right.at - left.at)[0];
};

/**
 * The paper, for the edition the reader is holding.
 *
 * Two columns do not run on a weekend, and both for the same reason: they
 * read as a reproach. The obituary names a page you let go quiet, and the
 * oldest open question names the one you have been avoiding — fair on a
 * Tuesday, and not what a Saturday is for.
 *
 * The warning is exempt. A falsifier that may have fired does not keep until
 * Monday, and a paper that sat on it to protect the reader's weekend would be
 * protecting them from the one thing they asked to be told.
 *
 * The client says which edition it is printing, because the client is where
 * the reader's Saturday actually is; a server reads UTC.
 */
const paperColumns = ({ pages = [], now = Date.now(), userId = '', weekend = false } = {}) => ({
  warned: warned({ pages }),
  calibration: calibration({ pages, userId }),
  oldestOpen: weekend ? null : oldestOpen({ pages, now }),
  rightForWrongReasons: rightForWrongReasons({ pages, now }),
  anniversary: anniversary({ pages, now }),
  disagreement: disagreement({ pages, now }),
  corrections: corrections({ pages, now }),
  obituary: weekend ? null : obituary({ pages, now })
});

/**
 * Everything that *could* have run today, not what did.
 *
 * The ledger needs this to tell a question that was answered from one that
 * simply was not dealt. Each column prints one candidate a day, so a claim
 * vanishing from the paper usually means a different claim's turn came round
 * — not that the reader did anything about it.
 *
 * A target that has left this set has left it for a reason: the belief was
 * checked, the contradiction was resolved, somebody wrote on the page. That
 * is the only honest basis for saying a thing is closed.
 */
const openTargets = ({ pages = [], now = Date.now() } = {}) => ({
  anniversary: new Set(candidateAnniversaries({ pages, now }).map(row => row.key)),
  disagreement: new Set(candidateDisagreements({ pages }).map(row => row.key)),
  obituary: new Set(candidateObituaries({ pages, now }).map(row => row.key))
});

module.exports = {
  ANNIVERSARY_MIN_AGE_MS,
  CORRECTION_WINDOW_MS,
  OBITUARY_MIN_SILENCE_MS,
  anniversary,
  calibration,
  corrections,
  disagreement,
  obituary,
  oldestOpen,
  openTargets,
  paperColumns,
  rightForWrongReasons,
  warned
};
