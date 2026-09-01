import { normalizeSpaces } from '../utils/editorialText';

/**
 * Letting go of something you kept.
 *
 * Keeping is a vow, so unkeeping is not a click to be confirmed with a modal —
 * a dialog asking "are you sure?" makes the reader defend a decision they have
 * already made, and teaches them to dismiss dialogs. Instead the shelf simply
 * says what happened, at its own foot, and leaves the word back within reach
 * for seven days.
 *
 * Seven days because a canon is measured in years: a thing you held for two of
 * them deserves longer than an undo toast to be sure about, and less than
 * forever, or the shelf becomes a list of everything you ever changed your
 * mind about.
 *
 * It lives in this reader's browser and nowhere else. Nothing about a private
 * shelf needs to reach a server to be undoable by the person standing in
 * front of it, and storage that fails — a private window, blocked site data —
 * degrades to no receipt, which is the same as the old behaviour rather than
 * a broken one.
 */

const KEY = 'noeis:let-go';
const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

const store = (given) => {
  if (given) return given;
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch (_unreachable) {
    return null;
  }
};

const time = (value) => {
  if (value === null || value === undefined || value === '') return NaN;
  const at = new Date(value);
  return Number.isNaN(at.getTime()) ? NaN : at.getTime();
};

export const rememberLetGo = ({ id, title, at = new Date().toISOString() } = {}, storage) => {
  const targetId = normalizeSpaces(id);
  const name = normalizeSpaces(title);
  if (!targetId || !name) return;
  try {
    store(storage)?.setItem(KEY, JSON.stringify({ id: targetId, title: name, at }));
  } catch (_unwritable) {
    // A receipt we cannot keep is a receipt the reader does not get. The thing
    // is still let go; only the way back is missing.
  }
};

export const forgetLetGo = (storage) => {
  try {
    store(storage)?.removeItem(KEY);
  } catch (_unwritable) { /* nothing to clear is the same as cleared */ }
};

/**
 * The receipt, or null. Null once seven days have passed, and null for
 * anything that cannot be read back as a real thing let go on a real day.
 */
export const readLetGo = (storage, now = Date.now()) => {
  let raw = null;
  try {
    raw = store(storage)?.getItem(KEY);
  } catch (_unreadable) {
    return null;
  }
  if (!raw) return null;
  let parsed = null;
  try {
    parsed = JSON.parse(raw);
  } catch (_unparseable) {
    return null;
  }
  const at = time(parsed?.at);
  const id = normalizeSpaces(parsed?.id);
  const title = normalizeSpaces(parsed?.title);
  if (!id || !title || Number.isNaN(at)) return null;
  if (now - at > SEVEN_DAYS || now < at) return null;
  return { id, title, at: new Date(at).toISOString() };
};

/** What the foot of the shelf says. A sentence, with the thing named. */
export const describeLetGo = (receipt) => {
  const title = normalizeSpaces(receipt?.title);
  return title ? `You let go of ${title}.` : '';
};

export const LET_GO_WINDOW_MS = SEVEN_DAYS;
