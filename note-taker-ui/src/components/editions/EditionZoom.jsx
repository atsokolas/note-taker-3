import React, { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';

/* The five powers, named for the thing you are looking at. */
const NAMES = ['The source', 'A finding', 'An issue', 'A paper', 'Your papers'];

const isTyping = target => target?.matches?.('input, textarea, select, [contenteditable="true"]');

/* A target is a path, or a function when only the page knows where "closer"
   is (the finding you are reading, say). */
const go = (navigate, target) => (typeof target === 'function' ? target() : navigate(target));

/**
 * One continuous zoom, from every paper you keep down to the sentence a
 * finding rests on. Each step is a URL, so any level can be sent, bookmarked
 * or reopened where you left it.
 *
 * The trail says where you are, the counter says how close, and the same keys
 * work at every power: [ and ] (or − and +) step, Esc steps out, P powers
 * through what is new.
 */
export default function EditionZoom({ level, trail = [], out = null, into = null, power = '' }) {
  const navigate = useNavigate();

  useEffect(() => {
    const onKey = (event) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || isTyping(event.target)) return;
      if (document.querySelector('dialog[open]')) return;
      const key = event.key.toLowerCase();
      const target = key === '[' || key === '-' || key === 'escape' ? out
        : key === ']' || key === '=' || key === '+' ? into
          : key === 'p' ? power
            : null;
      if (!target) return;
      event.preventDefault();
      go(navigate, target);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [navigate, out, into, power]);

  return (
    <nav className="edition-zoom" aria-label="Where you are in Editions">
      <ol className="edition-zoom__trail">
        {trail.map(({ label, to }, index) => (
          <li key={`${index}:${label}`}>
            {to ? <Link to={to}>{label}</Link> : <span aria-current="page">{label}</span>}
          </li>
        ))}
      </ol>
      {power ? (
        <Link className="edition-zoom__power" to={power}>
          Power through <kbd>P</kbd>
        </Link>
      ) : null}
      <div className="edition-zoom__dial">
        <button type="button" aria-label="Step out" disabled={!out} onClick={() => go(navigate, out)}>−</button>
        <span className="edition-zoom__power-of" title={NAMES[level]} aria-label={`Zoom: ${NAMES[level]}`}>
          10<sup>{level}</sup>
        </span>
        <button type="button" aria-label="Step in" disabled={!into} onClick={() => go(navigate, into)}>+</button>
      </div>
    </nav>
  );
}
