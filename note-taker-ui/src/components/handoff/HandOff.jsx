import React, { useCallback, useEffect, useRef, useState } from 'react';
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
const HandOff = ({ context, shortcut = true }) => {
  const [open, setOpen] = useState(false);
  const [ask, setAsk] = useState('');
  const [to, setTo] = useState('noeis');
  const [handed, setHanded] = useState(null);
  const [error, setError] = useState('');
  const [passage, setPassage] = useState('');
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const work = ['work_task', 'work_note'].includes(context?.kind);
  const recipient = to ? WHO[to] : work ? 'the next agent with Work access' : WHO[''];
  const begin = useCallback(() => {
    setPassage((context?.excerpt ?? passageHere()).trim().slice(0, 4000));
    setOpen(true);
  }, [context?.excerpt]);

  useEffect(() => {
    const onKey = (event) => {
      if (!shortcut || !pressed(event) || !context?.id) return;
      event.preventDefault();
      begin();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [context?.id, begin, shortcut]);

  if (!context?.id) return null;

  if (handed) {
    return (
      <p className="handoff-line">
        Handed to {handed.to ? WHO[handed.to] || 'an agent' : work ? 'the next agent with Work access' : WHO['']} at {timeOf(handed.createdAt)}.
        {' '}<Link to={`/away?handoff=${handed.id}`}>See</Link>
      </p>
    );
  }

  if (!open) {
    return (
      <button type="button" className="handoff-open" title={shortcut ? '⌘⇧Return' : undefined} onClick={begin}>
        Hand off
      </button>
    );
  }

  const submit = async (event) => {
    event.preventDefault();
    if (!ask.trim() || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError('');
    try {
      const { kind, id, title } = context;
      setHanded(await handOff({ ask: ask.trim(), to, context: { kind, title, id: String(id), excerpt: passage } }));
      setOpen(false);
    } catch (failure) {
      setError(failure?.response?.data?.error || 'That could not be handed off.');
    } finally { submitting.current = false; setBusy(false); }
  };

  return (
    <form className="handoff-form" onSubmit={submit} aria-label="Hand off">
      <div className="handoff-preview" aria-label="What will go with this handoff">
        {context.title ? <strong>{context.title}</strong> : null}
        {passage ? <blockquote>{passage}</blockquote> : null}
        <p>To {recipient}</p>
      </div>
      <input
        autoFocus
        aria-label="What should be done while you are away"
        placeholder="What should be done while you are away?"
        value={ask}
        maxLength={2000}
        disabled={busy}
        onChange={event => setAsk(event.target.value)}
        onKeyDown={event => event.key === 'Escape' && setOpen(false)}
      />
      <select aria-label="Hand it to" value={to} disabled={busy} onChange={event => setTo(event.target.value)}>
        <option value="noeis">Noeis</option>
        <option value="">{work ? 'Next agent with Work access' : 'The next agent'}</option>
      </select>
      <button type="submit" disabled={busy || !ask.trim()}>{busy ? 'Handing off…' : 'Hand off'}</button>
      <button type="button" disabled={busy} onClick={() => setOpen(false)}>Cancel</button>
      {error ? <span role="alert">{error}</span> : null}
    </form>
  );
};

export default HandOff;
