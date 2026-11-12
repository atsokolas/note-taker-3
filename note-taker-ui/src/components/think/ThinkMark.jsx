import React from 'react';

/* One small mark per row of the left bar: an empty circle is an idea, half full is
   being written, full is closed. Drawn in the text colour so every theme keeps it. */
const SHAPES = {
  idea: <circle cx="8" cy="8" r="6.25" />,
  in_progress: <><circle cx="8" cy="8" r="6.25" /><path d="M8 1.75a6.25 6.25 0 0 1 0 12.5z" fill="currentColor" /></>,
  done: <><circle cx="8" cy="8" r="6.75" fill="currentColor" /><path d="M5 8.2l2.2 2.1L11 6" stroke="var(--noeis-canvas, #f7f4ed)" strokeWidth="1.5" /></>,
  concept: <path d="M8 1.75L14.25 8 8 14.25 1.75 8z" />,
  question: <circle cx="8" cy="8" r="6.25" strokeDasharray="2 2.2" />,
  home: <path d="M2.5 7.5L8 3l5.5 4.5V13h-11z" />,
  search: <><circle cx="7" cy="7" r="4.5" /><path d="M10.5 10.5L14 14" /></>,
  new: <path d="M8 3v10M3 8h10" />,
  cuttings: <><circle cx="4.75" cy="11.5" r="2" /><circle cx="11.25" cy="11.5" r="2" /><path d="M6.2 10L11 2.5M9.8 10L5 2.5" /></>
};

const ThinkMark = ({ mark }) => (
  <svg className="think-mark" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25" aria-hidden="true">
    {SHAPES[mark]}
  </svg>
);

export default ThinkMark;
