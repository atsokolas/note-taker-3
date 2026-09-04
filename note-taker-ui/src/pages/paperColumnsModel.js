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
  return {
    standfirst: years === 1 ? 'A year ago you wrote this down' : `${years} years ago you wrote this down`,
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
 * How much paper there is this morning.
 *
 * The point of the whole rebuild: a paper whose length says what kind of day
 * it is before a word is read. A morning with nothing to report is not a
 * failure state, it is the best thing this product can say.
 */
export const paperWeight = (columns = {}) => (
  (columns?.anniversary ? 1 : 0)
  + (columns?.disagreement ? 1 : 0)
  + ((columns?.corrections || []).length ? 1 : 0)
  + (columns?.obituary ? 1 : 0)
);

export const QUIET_MORNING = 'A quiet morning. Nothing is asking for you — go and read something.';
