import React from 'react';

const day = at => new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

/* What an agent wrote stays in pencil until the reader inks it. One quiet
   line: who wrote it, when, and the one thing to do about it. */
const Pencil = ({ pencil, onInk, verb = 'wrote this' }) => (pencil ? (
  <p className="pencil-line">
    In pencil: {pencil.agent || 'An agent'} {verb}{pencil.at ? ` on ${day(pencil.at)}` : ''}.
    {onInk ? <button type="button" onClick={onInk}>Ink it</button> : null}
  </p>
) : null);

export default Pencil;
