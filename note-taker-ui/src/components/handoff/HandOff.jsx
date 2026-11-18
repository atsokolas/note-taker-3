import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { handOff } from '../../api/handoffs';

export const WHO = { noeis: 'Noeis', '': 'the next agent' };
export const timeOf = at => new Date(at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

// What the reader was in when they reached for the line: their selection, or the paragraph under the cursor.
const passageHere = () => {
  const selection = window.getSelection?.();
  const picked = String(selection || '').trim();
  if (picked) return picked;
  const node = selection?.anchorNode;
  const element = node?.nodeType === 1 ? node : node?.parentElement;
  return element?.closest?.('p, li, blockquote, h1, h2, h3, h4')?.textContent?.trim() || '';
};

const pressed = event => (event.metaKey || event.ctrlKey) && event.shiftKey && event.key === 'Enter';

/* Stepping away: one line of what should be done, handed to Noeis's own
   agent or to the next agent that connects. Where the reader was goes with
   it. ⌘⇧Return opens the line from anywhere on the page. */
const HandOff = ({ context }) => {
  const [open, setOpen] = useState(false);
  const [ask, setAsk] = useState('');
  const [to, setTo] = useState('noeis');
  const [handed, setHanded] = useState(null);
  const [error, setError] = useState('');
  const passage = useRef('');

  useEffect(() => {
    const onKey = (event) => {
      if (!pressed(event) || !context?.id) return;
      event.preventDefault();
      passage.current = passageHere();
      setOpen(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [context?.id]);

  if (!context?.id) return null;

  if (handed) {
    return (
      <p className="handoff-line">
        Handed to {WHO[handed.to] || 'an agent'} at {timeOf(handed.createdAt)}.
        {' '}<Link to={`/away?handoff=${handed.id}`}>See</Link>
      </p>
    );
  }

  if (!open) {
    return (
      <button type="button" className="handoff-open" title="⌘⇧Return" onClick={() => { passage.current = passageHere(); setOpen(true); }}>
        Hand off
      </button>
    );
  }

  const submit = async (event) => {
    event.preventDefault();
    if (!ask.trim()) return;
    try {
      setHanded(await handOff({ ask: ask.trim(), to, context: { ...context, id: String(context.id), excerpt: passage.current } }));
      setOpen(false);
    } catch (failure) {
      setError(failure?.response?.data?.error || 'That could not be handed off.');
    }
  };

  return (
    <form className="handoff-form" onSubmit={submit}>
      <input
        autoFocus
        aria-label="What should be done while you are away"
        placeholder="What should be done while you are away?"
        value={ask}
        onChange={event => setAsk(event.target.value)}
        onKeyDown={event => event.key === 'Escape' && setOpen(false)}
      />
      <select aria-label="Hand it to" value={to} onChange={event => setTo(event.target.value)}>
        <option value="noeis">Noeis</option>
        <option value="">The next agent</option>
      </select>
      <button type="submit">Hand off</button>
      {error ? <span role="alert">{error}</span> : null}
    </form>
  );
};

export default HandOff;
