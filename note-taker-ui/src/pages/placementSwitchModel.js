import { PLACEMENT_LATER, PLACEMENT_SET_ASIDE, PLACEMENT_STREAM, normalizePlacement } from './placementModel.js';
import { timeWord } from '../utils/timeWord.js';

/*
 * The two imports above carry their .js extensions on purpose. Webpack does
 * not care either way, but a browser loading this file as a plain ES module
 * does — and the save card in the extension loads exactly this file, with no
 * build step between them. The extension is why the rules here are shared
 * rather than written twice.
 */

/**
 * The switch: one fact with three values.
 *
 * Where a piece sits is a single mutually-exclusive fact — home, later, or set
 * aside — and both of the shapes it used to wear misstated it. Scattered words
 * (`Later` here, `Set aside` there, `Remind me` somewhere else) read as three
 * unrelated opinions; a row of separate buttons reads as three things you
 * could switch on at once. The correct form for a three-position fact is a
 * switch, and there is exactly one of them in the product.
 *
 * Two grammars, deliberately not merged. **Mechanics** — where the piece sits
 * — are the switch. **Meaning** — whether you keep it for life — stays the
 * written word `Keep this`, because a vow is not a position.
 *
 * The clock cap exists only while a parked position is active: a promise about
 * a thing that is not parked has nothing to be a promise about. Park and
 * promise are one gesture, so "Remind me" no longer exists as its own control.
 */

/**
 * The name of where a parked piece goes back to: the screened folder it lives
 * in, or simply home.
 *
 * It was IMBOX, a word borrowed from Hey that names a place this product does
 * not otherwise talk about — the one label on the switch that never said what
 * it did.
 */
export const homeName = ({ folderName = '', asFeed = false } = {}) => {
  const name = String(folderName || '').replace(/\s+/g, ' ').trim();
  return asFeed && name ? name : '';
};

export const PILES = Object.freeze([PLACEMENT_LATER, PLACEMENT_SET_ASIDE]);

const PILE_LABEL = Object.freeze({
  [PLACEMENT_LATER]: 'LATER',
  [PLACEMENT_SET_ASIDE]: 'SET ASIDE'
});

/**
 * What pressing this pile will do, said out loud.
 *
 * The way back used to be a third position on the switch, and that position
 * was the thing nobody could explain: home is not a place you send something,
 * it is where a thing is when you have not sent it anywhere. Drawing it as an
 * option meant a control that was permanently lit and did nothing on the vast
 * majority of sources, which are not parked at all.
 *
 * So the pile you are already in is the way out of it. That was always the
 * behaviour — pressing the lit position has sent a piece home since the switch
 * was written — but nothing ever said so, which is why it needed a second
 * control to spell it out. Now the button says it.
 */
export const pilePhrase = ({ position, active = false, folderName = '', asFeed = false } = {}) => {
  const label = PILE_LABEL[normalizePlacement(position)] || '';
  if (!label) return '';
  if (!active) return `Put it in ${label.toLowerCase()}`;
  const home = homeName({ folderName, asFeed });
  return home ? `Take it back to ${home}` : 'Take it back home';
};

/**
 * The two piles a piece can be sent to, and which one it is in.
 *
 * Two, not three. This returned a home position as well, so a switch on an
 * ordinary source drew a lit button that did nothing when pressed — and the
 * control claimed to be a radio group, which needs a chosen option, which is
 * why home had to be drawn as one. It is not a radio group. It is two toggles
 * and a resting state, and neither pressed means the piece is home.
 */
export const switchPositions = ({ placement, folderName = '', asFeed = false } = {}) => {
  const active = normalizePlacement(placement) || PLACEMENT_STREAM;
  return PILES.map(position => ({
    position,
    label: PILE_LABEL[position],
    active: position === active,
    phrase: pilePhrase({ position, active: position === active, folderName, asFeed })
  }));
};

/** A fact with three values has exactly one of them at a time. */
export const isParkedPosition = (placement) => {
  const active = normalizePlacement(placement);
  return active === PLACEMENT_LATER || active === PLACEMENT_SET_ASIDE;
};

/**
 * The cap on the end of the switch, or null.
 *
 * It is drawn only when a parked position is active — a promise needs
 * something parked to be a promise about — and it prints the promised day in
 * the product's one time word. Parked with no promise yet still gets a cap,
 * because the cap is how you make one; it simply has nothing to say until you
 * do, and says nothing rather than inventing "SOON".
 */
export const clockCap = ({ placement, dueAt = null, recurring = false, now = Date.now() } = {}) => {
  if (!isParkedPosition(placement)) return null;
  return { day: timeWord(dueAt, { now, recurring }), promised: Boolean(timeWord(dueAt, { now })) };
};

/**
 * The return strip, unfolded from the cap.
 *
 * The last line is the honest escape: a reader who wants a nudge without
 * moving the piece should not have to move the piece to get one.
 */
export const stripOptions = (presets = []) => [
  ...(Array.isArray(presets) ? presets : []).map(preset => ({
    id: preset.id,
    label: preset.label,
    dueAt: preset.dueAt,
    cadence: preset.cadence || null
  })),
  { id: 'a-date', label: 'A date…', dueAt: null, cadence: null },
  { id: 'no-clock', label: 'No clock', dueAt: null, cadence: null },
  { id: 'in-place', label: 'Just remind me — leave it where it is', dueAt: null, cadence: null, inPlace: true }
];

/**
 * What pressing a position means. Pressing the active one sends it home,
 * because a switch already at a position has nowhere else to go — and that is
 * the gesture a reader reaches for when they are done with something.
 */
export const pressPosition = ({ placement, pressed } = {}) => {
  const active = normalizePlacement(placement) || PLACEMENT_STREAM;
  const target = normalizePlacement(pressed) || PLACEMENT_STREAM;
  return target === active ? PLACEMENT_STREAM : target;
};

/** Single letters on a focused row. `r` opens the strip rather than moving anything. */
export const ROW_KEYS = Object.freeze({
  h: PLACEMENT_STREAM,
  l: PLACEMENT_LATER,
  s: PLACEMENT_SET_ASIDE
});

export const rowKeyAction = (key = '') => {
  const letter = String(key || '').toLowerCase();
  if (letter === 'k') return { kind: 'keep' };
  if (letter === 'r') return { kind: 'strip' };
  if (letter in ROW_KEYS) return { kind: 'place', placement: ROW_KEYS[letter] };
  return null;
};
