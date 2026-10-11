/**
 * The inks you can mark a sentence in.
 *
 * Five, because a reader who has to choose between nine has stopped reading.
 * Yellow by default: pressing Highlight without a thought still does the
 * thing a highlighter does.
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

/* Three of the inks mean something in the loop's own words — a passage for
   a view, against it, or simply kept — and they come first. The stored
   values are the same five they always were; only the names changed, so
   every passage marked before still reads in its colour. The last two stay,
   quietly, for the reader who keeps a taxonomy of their own. */
export const HIGHLIGHT_COLOR_OPTIONS = [
  { value: '#cfe3b4', label: 'For' },
  { value: '#f7c9a3', label: 'Against' },
  { value: '#f6e27a', label: 'Keep' },
  { value: '#bcd4ea', label: 'Sky' },
  { value: '#d8cbe8', label: 'Lilac' }
];
export const NAMED_HIGHLIGHT_COLORS = HIGHLIGHT_COLOR_OPTIONS.slice(0, 3);
export const MORE_HIGHLIGHT_COLORS = HIGHLIGHT_COLOR_OPTIONS.slice(3);

/** A colour we actually offer, or the default. Never a colour from nowhere. */
export const knownHighlightColor = (value) => {
  const candidate = String(value || '').trim().toLowerCase();
  return HIGHLIGHT_COLOR_OPTIONS.some(option => option.value === candidate)
    ? candidate
    : DEFAULT_HIGHLIGHT_COLOR;
};
