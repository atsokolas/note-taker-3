import React from 'react';

/**
 * A day, marked as a day.
 *
 * Dates in this product sit next to sentences, and a bare `Sep 2, 2026` in a
 * column of prose reads as part of the prose until you have already tripped
 * over it. The mark says "this is when" before the reader parses a single
 * word, which is the whole job — so it is drawn small, in the same ink as the
 * date beside it, and it is never the reason you look at the row.
 *
 * One glyph, one meaning, drawn once. Decorative to a screen reader: the date
 * it sits beside already says everything the mark is standing in for.
 */
const CalendarMark = ({ className = '' }) => (
  <svg
    className={`calendar-mark ${className}`.trim()}
    viewBox="0 0 12 12"
    width="12"
    height="12"
    fill="none"
    stroke="currentColor"
    strokeWidth="1"
    aria-hidden="true"
    focusable="false"
  >
    <rect x="1" y="2.5" width="10" height="8.5" rx="1" />
    <path d="M1 5h10" />
    <path d="M3.75 1v2.2M8.25 1v2.2" strokeLinecap="round" />
  </svg>
);

export default CalendarMark;
