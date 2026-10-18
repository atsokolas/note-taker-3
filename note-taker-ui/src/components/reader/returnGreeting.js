/**
 * Your highlight greets you on return.
 *
 * Eligibility: a line you marked on your last visit to this piece (made after
 * that visit's open), and this is your first open since. A refresh or a quick
 * hop back is not a return, so a line marked within the hour stays quiet.
 * Quality bar: a pull quote is a sentence or two; a line under 12 or over 320
 * characters is passed over, and the latest line that fits is the one served.
 * Silence: no previous visit on record, nothing marked on it, or nothing that
 * reads as a quote. Nothing renders.
 *
 * It yields to "You stopped here": a reader with a place in the middle is
 * returned to it. The greeting is for the reader who finished, or never got
 * past the top.
 */
const RETURN_GAP_MS = 60 * 60 * 1000;
const time = (value) => {
  const at = new Date(value || '').getTime();
  return Number.isFinite(at) ? at : null;
};
const textOf = (highlight) => String(highlight?.text || '').replace(/\s+/g, ' ').trim();

export const returnGreetingHighlight = ({ highlights = [], lastOpenedAt, now = Date.now() } = {}) => {
  const lastVisit = time(lastOpenedAt);
  if (lastVisit == null) return null;
  return (Array.isArray(highlights) ? highlights : [])
    .map((highlight) => ({ highlight, at: time(highlight?.createdAt), text: textOf(highlight) }))
    .filter(({ highlight, at, text }) => (
      at != null
      && at >= lastVisit
      && now - at >= RETURN_GAP_MS
      && !String(highlight?._id || '').startsWith('temp-')
      && text.length >= 12
      && text.length <= 320
    ))
    .sort((left, right) => right.at - left.at)[0]?.highlight || null;
};
