import React, { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';

const isTyping = target => target?.matches?.('input, textarea, select, [contenteditable="true"]');

/* A target is a path, or a function when only the page knows where "closer"
   is (the finding you are reading, say). */
const go = (navigate, target) => (typeof target === 'function' ? target() : navigate(target));

/**
 * The scale you are reading at, in words: every paper you keep at the top,
 * the passage a finding rests on at the bottom, and where you are marked
 * between them. The rungs above are a tap away; the ones below are named so
 * you know what closer means. Each rung is a URL, so any of them can be sent,
 * bookmarked or reopened.
 *
 * The same keys work at every scale: Esc (or [ and −) steps out, ] (or +)
 * steps in, P powers through what is new.
 */
export default function EditionZoom({ rungs = [], at = 0, out = null, into = null, power = '' }) {
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
    <nav className="edition-scale" aria-label="Where you are in Editions">
      <ol>
        {rungs.map(({ label, to }, index) => (
          <li key={index}>
            {index === at ? <span aria-current="location">{label}</span>
              : index > at ? <span className="edition-scale__ahead">{label}</span>
                : to ? <Link to={to}>{label}</Link> : <span>{label}</span>}
          </li>
        ))}
      </ol>
      {power ? (
        <Link className="edition-scale__power" to={power}>
          Power through <kbd>P</kbd>
        </Link>
      ) : null}
      <p className="edition-scale__keys">Esc steps out<br />J and K step through</p>
    </nav>
  );
}
