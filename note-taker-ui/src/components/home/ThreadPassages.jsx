import React from 'react';
import { Link } from 'react-router-dom';
import { monthOf, pathOf } from './homeModel';

/* A thread's passages, oldest first, each hanging from the month you marked
   it, joined down the margin by one line: the years it took to form. */
export default function ThreadPassages({ marks }) {
  return (
    <ol className="thread-passages">
      {marks.map((mark, index) => (
        <li key={mark.highlightId} style={{ '--nth': index }}>
          <time dateTime={mark.createdAt || undefined}>{monthOf(mark.createdAt)}</time>
          <Link to={pathOf(mark)}>
            <q>{mark.text}</q>
            <small>{mark.title}</small>
          </Link>
        </li>
      ))}
    </ol>
  );
}
