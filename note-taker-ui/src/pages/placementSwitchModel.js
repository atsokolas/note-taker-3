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
 * The name of where a parked piece goes back to.
 *
 * The screened folder it lives in, or simply home. It said IMBOX, a word
 * borrowed from Hey that names a place this product does not otherwise talk
 * about — the one label on the switch that did not say what it did.
 */
export const homeLabel = ({ folderName = '', asFeed = false } = {}) => {
  const name = String(folderName || '').replace(/\s+/g, ' ').trim();
  return asFeed && name ? name.toUpperCase() : 'HOME';
};

export const SWITCH_POSITIONS = Object.freeze([PLACEMENT_STREAM, PLACEMENT_LATER, PLACEMENT_SET_ASIDE]);

const POSITION_LABEL = Object.freeze({
  [PLACEMENT_LATER]: 'LATER',
  [PLACEMENT_SET_ASIDE]: 'SET ASIDE'
});

/**
 * The positions, with the active one named.
 *
 * Home is only a position when there is something to come home from. A piece
 * that is already home showed it anyway — a third of the control, permanently
 * lit, doing nothing when pressed, and named after a place the product never
 * mentions anywhere else. On an ordinary source, which is nearly all of them,
 * that was the whole of what the reader saw.
 *
 * Parked, it comes back and says where back is: the screened folder the piece
 * belongs to, or home. It is the only one of the three whose label depends on
 * where the piece already is, which is why it is worth drawing at all.
 */
export const switchPositions = ({ placement, folderName = '', asFeed = false } = {}) => {
  const active = normalizePlacement(placement) || PLACEMENT_STREAM;
  const parked = active !== PLACEMENT_STREAM;
  return SWITCH_POSITIONS
    .filter(position => position !== PLACEMENT_STREAM || parked)
    .map(position => ({
      position,
      label: position === PLACEMENT_STREAM ? homeLabel({ folderName, asFeed }) : POSITION_LABEL[position],
      active: position === active
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
