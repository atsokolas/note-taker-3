/**
 * How the paper says the four things.
 *
 * Sentences, not fields. Each of these takes what the ledger knows and hands
 * back one line a person would actually read, or nothing at all — a morning
 * with no anniversary prints no anniversary, it does not print an empty
 * anniversary slot with a dash in it.
 */

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

const day = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const longDate = (value) => {
  const date = day(value);
  return date ? `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}, ${date.getUTCFullYear()}` : '';
};

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

/**
 * "Two years ago you wrote this down and have not been back."
 *
 * The number of years is said, not the raw date alone, because "September 4,
 * 2024" makes a reader do arithmetic before they feel anything.
 */
export const anniversaryLine = (anniversary) => {
  if (!anniversary?.text) return null;
  const years = Number(anniversary.years) || 1;
  const when = longDate(anniversary.bornAt);
  /* On the day itself, say so. "A year ago today" is a different sentence
     from "a year ago" — one is a fact, the other is an anniversary. */
  const today = anniversary.toTheDay ? ' today' : '';
  return {
    standfirst: years === 1
      ? `A year ago${today} you wrote this down`
      : `${years} years ago${today} you wrote this down`,
    text: anniversary.text,
    footnote: [when && `Entered ${when}`, 'Not looked at since'].filter(Boolean).join(' · '),
    href: anniversary.pageId ? `/wiki/${anniversary.pageId}` : '',
    pageTitle: anniversary.pageTitle || ''
  };
};

/**
 * "Your library disagrees with itself."
 *
 * How many sources argue is said only when it is known and more than one —
 * "1 source disagrees" reads as a rounding error rather than a fight.
 */
export const disagreementLine = (disagreement) => {
  if (!disagreement?.text) return null;
  const against = Number(disagreement.against) || 0;
  return {
    standfirst: 'Your library disagrees with itself',
    text: disagreement.text,
    footnote: [
      disagreement.pageTitle && `On ${disagreement.pageTitle}`,
      against > 1 ? `${plural(against, 'source')} against it` : ''
    ].filter(Boolean).join(' · '),
    href: disagreement.pageId ? `/wiki/${disagreement.pageId}` : '',
    pageTitle: disagreement.pageTitle || ''
  };
};

/** "In August you retired this. Last week you brought it back." */
export const correctionLines = (corrections = []) => (
  (Array.isArray(corrections) ? corrections : [])
    .filter(entry => entry?.text && entry?.was && entry?.became)
    .map(entry => ({
      key: entry.key || `${entry.pageId}:${entry.at}`,
      text: `You ${entry.was} this, then ${entry.became}.`,
      claim: entry.text,
      footnote: entry.pageTitle || '',
      href: entry.pageId ? `/wiki/${entry.pageId}` : ''
    }))
);

/**
 * "Nothing has been added to Deliberate Practice since July 9."
 *
 * Months rather than a day count once the silence is long, because "312 days"
 * is a number and "ten months" is a feeling.
 */
export const obituaryLine = (obituary) => {
  if (!obituary?.pageTitle) return null;
  const days = Number(obituary.days) || 0;
  const months = Math.floor(days / 30);
  const howLong = months >= 2 ? `${plural(months, 'month')}` : `${plural(days, 'day')}`;
  return {
    text: `Nothing has been added to ${obituary.pageTitle} in ${howLong}.`,
    href: obituary.pageId ? `/wiki/${obituary.pageId}` : ''
  };
};

/**
 * The thing you said would change your mind may have happened.
 *
 * The loudest sentence this product can print, and the one no other reading
 * tool can: it needs a dated claim with a named falsifier and a watcher
 * pointed at the same subject. It leads the paper.
 *
 * Two verbs, deliberately: *read it, then say*. The software found a
 * resemblance between words the reader wrote and words that arrived — it has
 * not read the source and does not know. The reader reads, the reader rules.
 */
export const warnedLine = (warned) => {
  if (!warned?.text) return null;
  return {
    standfirst: 'The thing you said would change your mind may have happened',
    text: warned.text,
    signal: warned.signal || '',
    footnote: [warned.pageTitle && `On ${warned.pageTitle}`, 'Read it, then say: held, or broke']
      .filter(Boolean).join(' · '),
    href: warned.pageId ? `/judgment/${warned.pageId}` : ''
  };
};

/**
 * How your confidence has met later outcomes.
 *
 * "When you said certain, you were right 7 of 9 times" is the single most
 * useful thing a tool can tell a serious reader about themself, and it is
 * useless as a percentage — 78% invites a target, and a target invites gaming
 * the one instrument that only works when nobody is performing for it.
 *
 * So: a count out of a count, no trend, no score. The instrument decides when
 * there is enough to say; this only prints it.
 */
export const calibrationLine = (calibration) => {
  const of = Number(calibration?.of) || 0;
  if (!calibration?.confidence || !of) return null;
  const held = Number(calibration.held) || 0;
  return {
    text: `When you said “${calibration.confidence}”, it held ${held} of ${of} times.`,
    href: '/judgment/mirror'
  };
};

/**
 * How many mornings the paper has asked this.
 *
 * Two askings is a coincidence; three is the paper noticing. Below that it
 * says nothing, because "I have asked this once before" is a fact about the
 * software rather than about the reader.
 *
 * This sentence is the whole reason the paper keeps a record. Showing a thing
 * a fourth time is a re-read; saying it is the fourth time is a confrontation.
 */
export const askedLine = (asked = 0) => {
  const count = Number(asked) || 0;
  if (count < 2) return '';
  const ordinal = count === 2 ? 'third' : count === 3 ? 'fourth' : `${count + 1}th`;
  return `The ${ordinal} morning I have asked.`;
};

const CLOSING_VERB = Object.freeze({
  anniversary: 'You went back to it',
  disagreement: 'You settled it',
  obituary: 'You wrote on it again'
});

/**
 * What the paper asked about, that is no longer open.
 *
 * Two different things, and the paper stopped calling them one once it had a
 * record of its own to check against.
 *
 * Answered is a follow-up: the paper asked, you acted, and it says so. That
 * is the loop closing, and a paper that notices you acted is a different
 * object from one that asks again.
 *
 * Vanished is a correction, in the sense a newspaper means it — we printed a
 * thing and the thing was not there. The paper has been asking about a page
 * that no longer exists, and saying so is more honest than dropping the
 * question and hoping nobody remembers it was asked.
 */
export const closingLines = (closed = []) => (
  (Array.isArray(closed) ? closed : [])
    .filter(entry => entry?.label && entry?.day)
    .map(entry => ({
      key: `${entry.kind}:${entry.label}:${entry.day}`,
      vanished: Boolean(entry.vanished),
      text: entry.vanished
        ? `${entry.label} is gone. The paper was still asking about it.`
        : `${CLOSING_VERB[entry.kind] || 'You dealt with it'}: ${entry.label}.`,
      /* No door to a page that is not there. */
      href: entry.pageId && !entry.vanished ? `/wiki/${entry.pageId}` : ''
    }))
);

export const closingGroups = (closed = []) => {
  const lines = closingLines(closed);
  return {
    answered: lines.filter(line => !line.vanished),
    corrections: lines.filter(line => line.vanished)
  };
};

/**
 * A run of quiet mornings.
 *
 * One quiet day is rest. Five in a row is news — the corpus has gone cold, or
 * you have stopped reading — and only a paper that remembers its own mornings
 * can tell the difference. Below the floor it says nothing, because a
 * two-day streak is a weekend.
 */
export const QUIET_STREAK_FLOOR = 4;

export const quietStreakLine = (streak = 0) => {
  const days = Number(streak) || 0;
  if (days < QUIET_STREAK_FLOOR) return '';
  return `${days} quiet mornings in a row. The corpus has gone cold.`;
};

/**
 * The oldest thing still open.
 *
 * A superlative, which papers have always loved, and useful because the
 * oldest open question is usually the one you have been avoiding.
 */
export const oldestOpenLine = (oldest) => {
  const days = Number(oldest?.days) || 0;
  if (!oldest?.text || days < 30) return null;
  return {
    text: `Your oldest open question is ${days} days old.`,
    claim: oldest.text,
    href: oldest.pageId ? `/wiki/${oldest.pageId}` : ''
  };
};

/**
 * Right for the wrong reasons.
 *
 * You can already record this verdict and nothing has ever printed it. It is
 * the most honest thing in the vocabulary and the funniest, and no other
 * software lets a person admit it — so when it is recorded, the paper says it
 * once, deadpan, and does not editorialise.
 */
export const rightForWrongReasonsLine = (entry) => {
  if (!entry?.claim) return null;
  return {
    text: `You were right about ${entry.pageTitle || 'this'} — for the wrong reasons.`,
    claim: entry.claim,
    href: entry.pageId ? `/judgment/${entry.pageId}` : ''
  };
};

/**
 * How much paper there is this morning.
 *
 * The point of the whole rebuild: a paper whose length says what kind of day
 * it is before a word is read. A morning with nothing to report is not a
 * failure state, it is the best thing this product can say.
 */
export const paperWeight = (columns = {}) => (
  (columns?.warned ? 1 : 0)
  + (columns?.rightForWrongReasons ? 1 : 0)
  + (columns?.oldestOpen ? 1 : 0)
  + (columns?.calibration ? 1 : 0)
  + (columns?.anniversary ? 1 : 0)
  + (columns?.disagreement ? 1 : 0)
  + ((columns?.corrections || []).length ? 1 : 0)
  + (columns?.obituary ? 1 : 0)
  /* A morning whose only news is that you closed something is not a quiet
     morning. It is the best kind. */
  + ((columns?.closed || []).length ? 1 : 0)
);

export const QUIET_MORNING = 'A quiet morning. Nothing is asking for you — go and read something.';
