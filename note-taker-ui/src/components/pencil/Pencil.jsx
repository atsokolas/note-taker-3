import React from 'react';

/* An agent signs what it writes, like a calling card left on the desk: its
   name, the day and the hour, and "on the night shift" when it worked while
   you slept. It stays in pencil until the reader inks it. */
const NIGHT_FROM = 22;
const NIGHT_UNTIL = 6;

export const cardOf = ({ agent, at } = {}) => {
  const when = at ? new Date(at) : null;
  const night = when && (when.getHours() >= NIGHT_FROM || when.getHours() < NIGHT_UNTIL);
  const day = when ? when.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';
  const hour = when ? when.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : '';
  return `— ${[agent || 'An agent', night ? 'on the night shift' : '', [day, hour].filter(Boolean).join(', ')].filter(Boolean).join(', ')}`;
};

const Pencil = ({ pencil, onInk, did = 'Written' }) => (pencil ? (
  <p className="pencil-line">
    <span>{did} in pencil <span className="pencil-card">{cardOf(pencil)}</span></span>
    {onInk ? <button type="button" onClick={onInk}>Ink it</button> : null}
  </p>
) : null);

export default Pencil;
