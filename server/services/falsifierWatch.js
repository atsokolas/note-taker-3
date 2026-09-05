/**
 * Watching for the thing you said would change your mind.
 *
 * A claim can carry a falsifier: what would break it, and the observable
 * signal to look for. Separately, four watchers deliver arrivals every few
 * hours — feeds, filings, transcripts, repositories. Nothing has ever
 * connected them. `observableSignal` is written, sanitized, and read back for
 * display; it has never been compared to anything, and no code has ever moved
 * a falsifier off `unobserved`.
 *
 * So the most Noeis sentence in the product — *what would change my mind* —
 * was a note the reader left for themself and then flipped by hand, or never.
 *
 * This is the wire. An arrival is checked against the open falsifiers it
 * could plausibly satisfy, and a match moves one to `warning`.
 *
 * `warning`, never `triggered`. The software noticed; the reader decides. A
 * machine that marked its own reader's belief as broken would be doing the
 * one thing this product exists to keep in human hands — and the verdict
 * vocabulary (held up, broke, partly, right for the wrong reasons) is waiting
 * for an answer only a person can give.
 */

/**
 * The words that carry no signal — and, just as importantly, the ones that do.
 *
 * A generic English stop-word list is wrong here, and wrong in a way that
 * silently breaks the feature. A falsifier is a *testable prediction*, and its
 * load-bearing words are usually the ones such lists throw away first:
 * direction (down, up, above, below), negation (no, not), comparison (more,
 * fewer, between), and sequence (after, before). "Guides revenue down two
 * quarters" is four signal words, three of which a stock list discards.
 *
 * So only pure grammar is dropped: articles, pronouns, auxiliaries and
 * conjunctions — words that appear in every sentence regardless of what it
 * claims.
 */
const STOP_WORDS = new Set([
  'a', 'an', 'and', 'any', 'are', 'as', 'at', 'be', 'because', 'been', 'being', 'both', 'but',
  'by', 'can', 'did', 'do', 'does', 'each', 'for', 'from', 'had', 'has', 'have', 'having', 'he',
  'her', 'hers', 'here', 'him', 'his', 'how', 'i', 'if', 'in', 'into', 'is', 'it', 'its', 'just',
  'me', 'my', 'nor', 'of', 'on', 'once', 'only', 'or', 'other', 'our', 'own', 'same', 'she', 'so',
  'such', 'than', 'that', 'the', 'their', 'them', 'then', 'there', 'these', 'they', 'this',
  'those', 'through', 'to', 'too', 'until', 'very', 'was', 'we', 'were', 'what', 'when', 'where',
  'which', 'while', 'who', 'whom', 'why', 'will', 'with', 'would', 'you', 'your'
]);

/* Two shared terms is a coincidence — "quarterly report" matches half a
   corpus. Three is a signal worth a reader's morning. */
const MIN_SHARED_TERMS = 3;

/* Short tokens are dropped rather than stop-listed, since no list can
   anticipate a corpus about AI or the EU. Numbers are exempt: "10-K", "two",
   "Q3" are the quantity a prediction turns on, and a two-character number is
   as load-bearing as a ten-character noun. */
const MIN_TERM_LENGTH = 3;

const isNumeric = (term = '') => /^[0-9]+$/.test(term);

const clean = (value = '') => String(value == null ? '' : value).replace(/\s+/g, ' ').trim();

/**
 * The words a match can turn on.
 *
 * Numbers are kept whole — "two quarters", "10-K", "2026" — because the
 * quantity is usually the whole point of a falsifier, and a signal that
 * ignored it would fire on any transcript at all.
 */
const termsOf = (value = '') => new Set(
  clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter(term => (isNumeric(term) || term.length >= MIN_TERM_LENGTH) && !STOP_WORDS.has(term))
);

const overlap = (left, right) => {
  const shared = [];
  left.forEach((term) => { if (right.has(term)) shared.push(term); });
  return shared;
};

/** What an arrival is, as words: its title, its summary, and its body. */
const arrivalTerms = (arrival = {}) => termsOf(
  [arrival.title, arrival.summary, arrival.text].map(clean).filter(Boolean).join(' ')
);

const list = value => (Array.isArray(value) ? value : []);

/**
 * Everything on this page that names a signal we could watch for.
 *
 * There are two stores, and this watcher was built against the wrong one.
 * `judgment.falsifiers[].observableSignal` is written by a single bare input
 * in the living-thesis editor. The prompt readers actually answer — "what
 * would change your mind, and by when?" — writes `claims[].resolutionCriteria`
 * somewhere else entirely, and nothing ever joined them. So the watcher was
 * listening in a room almost nobody writes in.
 *
 * Both are the same thing to a reader: the observation that would break a
 * belief. So both are read, and a claim-derived signal carries its claimId,
 * so a match can write the falsifier the answer should have created.
 *
 * Retired and already-warned ones are done — one that has fired is waiting on
 * a person, not on more evidence, and re-firing it every morning would turn
 * the one sentence that should stop a reader into wallpaper.
 */
const openSignals = (page = {}) => {
  const falsifiers = list(page?.judgment?.falsifiers)
    .filter(row => row && row.status === 'unobserved' && clean(row.observableSignal))
    .map(row => ({
      kind: 'falsifier',
      falsifierId: clean(row.falsifierId),
      claimId: '',
      text: clean(row.text),
      observableSignal: clean(row.observableSignal)
    }));

  /* A claim whose criteria already produced a falsifier is watched through
     that falsifier, and must not be offered twice. */
  const spokenFor = new Set(
    list(page?.judgment?.falsifiers)
      .flatMap(row => list(row?.affectedClaimIds).map(value => String(value)))
  );

  const fromClaims = list(page?.claims)
    .filter(claim => claim
      && clean(claim.resolutionCriteria)
      && !spokenFor.has(String(claim.claimId || ''))
      && claim.checkInStatus !== 'retired'
      && !claim.retiredAt)
    .map(claim => ({
      kind: 'claim',
      falsifierId: '',
      claimId: clean(claim.claimId),
      /* The claim is what would break; the criteria is how you would know. */
      text: clean(claim.text),
      observableSignal: clean(claim.resolutionCriteria)
    }));

  return [...falsifiers, ...fromClaims];
};

/**
 * Does this arrival look like the thing the reader named?
 *
 * Deliberately dumb, and deliberately cautious. It is a shared-vocabulary
 * test, not comprehension: the reader wrote the signal, the reader reads the
 * source, and the reader decides. An overlap of three uncommon terms earns a
 * line on the front page, which is the most this is allowed to cost anyone.
 */
const matchFalsifier = ({ falsifier, arrival } = {}) => {
  const signal = termsOf(falsifier?.observableSignal);
  if (signal.size < MIN_SHARED_TERMS) return null;
  const shared = overlap(signal, arrivalTerms(arrival));
  if (shared.length < MIN_SHARED_TERMS) return null;
  return {
    kind: falsifier.kind || 'falsifier',
    falsifierId: clean(falsifier.falsifierId),
    claimId: clean(falsifier.claimId),
    text: clean(falsifier.text),
    observableSignal: clean(falsifier.observableSignal),
    /* Sorted so the same match reads the same way twice, and capped because
       the paper prints these and a reader does not need nine. */
    matchedTerms: shared.sort().slice(0, 6)
  };
};

/**
 * Every open falsifier on a page that this arrival could have satisfied.
 *
 * A page, not the corpus: an arrival reaches a page because the reader
 * pointed a watcher at it, and that is the relevance signal. Matching every
 * arrival against every belief the reader holds would find something every
 * morning, which is the same as finding nothing.
 */
const matchesForPage = ({ page, arrival } = {}) => openSignals(page)
  .map(falsifier => matchFalsifier({ falsifier, arrival }))
  .filter(Boolean);

module.exports = {
  MIN_SHARED_TERMS,
  arrivalTerms,
  matchFalsifier,
  matchesForPage,
  openSignals,
  termsOf
};
