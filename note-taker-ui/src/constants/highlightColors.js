/**
 * The inks you can mark a sentence in.
 *
 * Five, because a reader who has to choose between nine has stopped reading.
 * Yellow first and yellow by default: pressing Highlight without a thought
 * still does the thing a highlighter does, and the colours are there for
 * anyone who wants a taxonomy of their own rather than a decoration.
 *
 * Mixed for cream, not for white. These were pastels chosen against a white
 * page, where a mint at full chroma reads as a soft green; over #f7f4ed the
 * same value goes acid, and a warm paper wants its marks warmed to match.
 * Each is light enough that black text stays black on top of it.
 *
 * None of them is one of the five semantic inks. Thread gold, living green,
 * warning, danger and the pointer blue each mean exactly one thing, and a
 * sentence the reader marked yellow is not making any of those claims.
 */
export const DEFAULT_HIGHLIGHT_COLOR = '#f6e27a';

export const HIGHLIGHT_COLOR_OPTIONS = [
  { value: '#f6e27a', label: 'Yellow' },
  { value: '#f7c9a3', label: 'Peach' },
  { value: '#cfe3b4', label: 'Sage' },
  { value: '#bcd4ea', label: 'Sky' },
  { value: '#d8cbe8', label: 'Lilac' }
];

/** A colour we actually offer, or the default. Never a colour from nowhere. */
export const knownHighlightColor = (value) => {
  const candidate = String(value || '').trim().toLowerCase();
  return HIGHLIGHT_COLOR_OPTIONS.some(option => option.value === candidate)
    ? candidate
    : DEFAULT_HIGHLIGHT_COLOR;
};
