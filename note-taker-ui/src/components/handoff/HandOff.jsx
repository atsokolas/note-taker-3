import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
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
const HandOff = ({ context, shortcut = true, readExcerpt }) => {
  const [open, setOpen] = useState(false);
  const [ask, setAsk] = useState('');
  const [to, setTo] = useState('noeis');
  const [handed, setHanded] = useState(null);
  const [error, setError] = useState('');
  const [passage, setPassage] = useState('');
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const surface = useRef(null);
  const restoreFocus = useRef(false);
  const focusOrigin = useRef(null);
  const work = ['work_task', 'work_note'].includes(context?.kind);
  const recipient = to ? WHO[to] : work ? 'the next agent with Work access' : WHO[''];
  const begin = useCallback(() => {
    const excerpt = context?.excerpt ?? (readExcerpt ? readExcerpt() : passageHere());
    const menu = surface.current?.closest('details');
    if (menu) menu.open = true;
    if (open) {
      surface.current?.querySelector('input')?.focus();
      return;
    }
    focusOrigin.current = document.activeElement;
    setPassage(excerpt.trim().slice(0, 4000));
    setOpen(true);
  }, [context?.excerpt, open, readExcerpt]);

  useLayoutEffect(() => {
    const target = open ? surface.current?.querySelector('input') : restoreFocus.current ? surface.current : null;
    restoreFocus.current = false;
    if (!target) return undefined;
    target.focus({ preventScroll: !open });
    // An editor can finish a deferred focus after the preview enters.
    const frame = window.requestAnimationFrame(() => {
      if (target.isConnected && document.activeElement === focusOrigin.current
        && target.closest('details')?.open !== false) target.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    const onKey = (event) => {
      if (!shortcut || event.defaultPrevented || !pressed(event) || !context?.id || handed || surface.current?.closest('[inert]')) return;
      event.preventDefault();
      event.stopPropagation();
      begin();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [context?.id, begin, handed, shortcut]);

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
      <button ref={surface} type="button" className="handoff-open" title={shortcut ? '⌘⇧Return' : undefined} onClick={begin}>
        Hand off
      </button>
    );
  }

  const cancel = () => {
    restoreFocus.current = true;
    setOpen(false);
    setError('');
  };

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
    <form ref={surface} className="handoff-form" onSubmit={submit} aria-label="Hand off" onKeyDown={event => {
      if (event.key !== 'Escape' || busy) return;
      event.preventDefault();
      event.stopPropagation();
      cancel();
    }}>
      <div className="handoff-preview" aria-label="What will go with this handoff">
        {context.title ? <strong>{context.title}</strong> : null}
        {passage ? <blockquote>{passage}</blockquote> : null}
        <p>To {recipient}</p>
      </div>
      <input
        aria-label="What should be done while you are away"
        placeholder="What should be done while you are away?"
        value={ask}
        maxLength={2000}
        disabled={busy}
        onChange={event => setAsk(event.target.value)}
      />
      <select aria-label="Hand it to" value={to} disabled={busy} onChange={event => setTo(event.target.value)}>
        <option value="noeis">Noeis</option>
        <option value="">{work ? 'Next agent with Work access' : 'The next agent'}</option>
      </select>
      <button type="submit" disabled={busy || !ask.trim()}>{busy ? 'Handing off…' : 'Hand off'}</button>
      <button type="button" disabled={busy} onClick={cancel}>Cancel</button>
      {error ? <span role="alert">{error}</span> : null}
    </form>
  );
};

export default HandOff;
