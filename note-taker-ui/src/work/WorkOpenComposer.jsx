import React, { useLayoutEffect, useRef, useState } from 'react';

export default function WorkOpenComposer({ noteId, session, timeZone }) {
  const draft = session.open.draft(noteId), error = session.open.status(noteId);
  const drafts = session.open.drafts(noteId);
  const [expanded, setExpanded] = useState(() => Boolean(draft.title || draft.submission));
  const input = useRef(null), trigger = useRef(null), focus = useRef(false), composing = useRef(false);
  useLayoutEffect(() => {
    if (focus.current) { (expanded ? input : trigger).current?.focus({ preventScroll: true }); focus.current = false; }
  }, [expanded]);
  const collapse = () => { focus.current = true; setExpanded(false); };
  const submit = () => {
    if (composing.current) return;
    const id = session.open.submit(noteId, timeZone);
    if (id) { collapse(); session.flush(id); }
  };
  if (!expanded) return <button ref={trigger} className="work-add-followup is-quiet" onClick={() => { focus.current = true; setExpanded(true); }}>{draft.title ? 'Continue Open draft' : 'Add a follow-up'}</button>;
  return <form className="work-open-composer" aria-label="Add an Open item" onSubmit={event => { event.preventDefault(); submit(); }} onKeyDown={event => {
    if (event.key === 'Escape' && !composing.current && !event.nativeEvent.isComposing) { event.preventDefault(); event.stopPropagation(); collapse(); }
  }}>
    {drafts.length > 1 ? <label className="work-open-drafts">Other drafts<select aria-label="Open drafts" value={drafts.find(value => value.intent === draft.intent)?.id || ''} onChange={event => session.open.choose(noteId, event.target.value)}>{drafts.map(value => <option key={value.id} value={value.id}>{value.title || 'Untitled draft'}</option>)}</select></label> : null}
    <input ref={input} aria-label="Open item title" placeholder={draft.kind === 'question' ? 'What is still open?' : 'What needs following up?'} value={draft.title} readOnly={Boolean(draft.submission)} onChange={event => session.open.change(noteId, { title: event.target.value })} onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }} onKeyDown={event => {
      if (event.key !== 'Enter') return;
      event.preventDefault(); event.stopPropagation();
      if (!composing.current && !event.nativeEvent.isComposing && event.keyCode !== 229) submit();
    }} />
    <div className="work-open-controls">
      <select aria-label="Open item kind" disabled={Boolean(draft.submission)} value={draft.kind} onChange={event => session.open.change(noteId, { kind: event.target.value })}><option value="task">Follow-up</option><option value="question">Open question</option></select>
      <div className="work-open-actions"><button type="button" onClick={() => { if (draft.submission || session.open.cancel(noteId)) collapse(); }}>{draft.submission ? 'Close' : 'Cancel'}</button><button className="work-open-add" type="submit" disabled={!draft.title.trim()}>{draft.submission ? 'Retry' : 'Add'}</button></div>
    </div>
    {error ? <p className="work-open-error" role="alert">{error}</p> : null}
  </form>;
}
