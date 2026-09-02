/**
 * Motion is a crossing.
 *
 * A sentence only flies when it moves between places. Inside a place movement
 * is instant: a row reordering, a list filtering, a folder unfolding is not a
 * journey, and animating it says it was.
 *
 * That distinction is the whole reason a flight means anything. A product that
 * animates every change teaches its reader that motion carries no information,
 * and then the one moment that matters — a source becoming evidence, a belief
 * reaching the shelf — arrives looking like everything else.
 *
 * The four crossings the design names, and nothing else:
 *
 *   source → pile      READER  → PILE     you parked something from the reading
 *   folio → home       SCROLL  → IMBOX    a screened piece let back in
 *   καιρός → article   PAPER   → READER   the paper handed a promise back
 *   kept → shelf       anywhere → SHELF   a thing entered the canon
 *
 * The places are finer-grained here than the paper/desk/shelf of the product's
 * three tenses, because the crossings are: a scroll and the Imbox both sit on
 * the desk, but a folio leaving a scroll for the Imbox is a journey a reader
 * can feel. The tenses describe how time works; these describe where a thing
 * can be standing.
 */

export const PLACES = Object.freeze({
  PAPER: 'paper',
  READER: 'reader',
  IMBOX: 'imbox',
  SCROLL: 'scroll',
  PILE: 'pile',
  SHELF: 'shelf'
});

const CROSSINGS = Object.freeze([
  [PLACES.READER, PLACES.PILE],
  [PLACES.SCROLL, PLACES.IMBOX],
  [PLACES.PAPER, PLACES.READER]
]);

/** The canon is reached from anywhere; entering it is always a crossing. */
const ALWAYS_CROSSES = PLACES.SHELF;

const known = (value) => String(value || '').trim().toLowerCase();

/**
 * True when a thing is moving between places, which is the only time it flies.
 *
 * An unnamed place is not a crossing. A caller that has not said where it is
 * moving from has not earned an animation, and silence is the safe default
 * here for the same reason it is everywhere else in this product.
 */
export const isCrossing = ({ from = '', to = '' } = {}) => {
  const start = known(from);
  const end = known(to);
  if (!start || !end) return false;
  // Movement within a place is instant, including into the shelf from itself.
  if (start === end) return false;
  if (start === ALWAYS_CROSSES || end === ALWAYS_CROSSES) return true;
  return CROSSINGS.some(([a, b]) => (a === start && b === end) || (a === end && b === start));
};
