import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { editPiece, hangPiece, readSource, takeDown } from '../../api/museum';
import useOwnMuseum from './useOwnMuseum';
import { Frame } from './MuseumWall';
import { roomsOf } from './museumModel';

const said = error => error?.response?.data?.error || 'That did not save.';

// A new piece starts from the passage you kept, when it fits on the wall, or else the first you marked.
const blank = (source, piece, kept) => {
  const first = source.passages.find(passage => passage.text === kept) || source.passages[0] || { text: '', note: '' };
  const from = piece || { ...source, passage: first.text, why: first.note, room: '', ledTo: [] };
  return {
    passage: from.passage, why: from.why, room: from.room, own: from.own, ledTo: from.ledTo,
    title: from.title, author: from.author, medium: from.medium, year: from.year
  };
};

/*
 * Hanging a piece, and everything you can say about it afterwards.
 *
 * One sheet for both, because adding detail later is the same act as hanging:
 * you are writing the label. The reason it is here comes first and is the one
 * thing it cannot hang without. When you marked the passage with a note, the
 * reason starts from that note, since you already said it once.
 */
export default function PieceSheet({ kind, id, passage = '', onClose, onHung = () => {} }) {
  const own = useOwnMuseum();
  const [source, setSource] = useState(null);
  const [piece, setPiece] = useState(null);
  const [form, setForm] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const first = useRef(null);

  useEffect(() => {
    let live = true;
    readSource(kind, id)
      .then(found => {
        if (!live) return;
        setSource(found.source);
        setPiece(found.piece);
        setForm(blank(found.source, found.piece, passage));
      })
      .catch(failure => live && setError(said(failure)));
    return () => { live = false; };
  }, [kind, id, passage]);
  useEffect(() => { if (form) first.current?.focus(); }, [Boolean(form)]); // eslint-disable-line react-hooks/exhaustive-deps

  const wall = own?.museum?.pieces || [];
  const others = wall.filter(other => other.accession !== piece?.accession);
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }));
  const choose = (passage) => setForm(current => ({
    ...current,
    passage: passage.text,
    // The reason follows the passage only while it is still the note that came with the last one.
    why: !current.why || source.passages.some(other => other.note === current.why) ? passage.note : current.why
  }));
  const done = async (act) => {
    setBusy(true);
    setError('');
    try {
      const result = await act();
      onHung(result.accession || piece?.accession || '');
      onClose();
    } catch (failure) {
      setError(said(failure));
      setBusy(false);
    }
  };
  const submit = (event) => {
    event.preventDefault();
    done(() => (piece ? editPiece(piece.accession, form) : hangPiece({ kind, id, ...form })));
  };
  // The sheet's keys are its own: a reader's shortcuts or the case behind it never hear them.
  const key = (event) => {
    event.stopPropagation();
    if (event.key === 'Escape') { event.preventDefault(); onClose(); }
  };
  const startedFromNote = form && source.passages.some(passage => passage.text === form.passage && passage.note && passage.note === form.why);
  const kept = source ? Math.max(0, source.passages.length - 1) : 0;

  return createPortal(
    <div className="museum-sheet-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <form className="museum-sheet" role="dialog" aria-modal="true" aria-labelledby="museum-sheet-title" onKeyDown={key} onSubmit={submit}>
        <h2 id="museum-sheet-title">{piece ? 'On your wall' : 'Hang in your museum'}</h2>
        {!form ? <p className="museum-sheet__quiet" role={error ? 'alert' : 'status'}>{error || 'Reading it…'}</p> : (
          <>
            <p className="museum-sheet__what">{form.title}</p>
            {source.passages.length > 1 ? (
              <fieldset className="museum-sheet__passages">
                <legend>Your highlights</legend>
                {source.passages.map(passage => (
                  <button type="button" key={passage.text} aria-pressed={passage.text === form.passage} onClick={() => choose(passage)}>{passage.text}</button>
                ))}
              </fieldset>
            ) : null}
            <label className="museum-sheet__field">
              <span>The words on the wall</span>
              <textarea rows={3} maxLength={400} value={form.passage} onChange={event => set('passage', event.target.value)} placeholder="Leave empty to hang the title alone" />
            </label>
            <div className="museum-sheet__preview museum-room" aria-hidden="true"><Frame piece={form} /></div>
            <label className="museum-sheet__field">
              <span>Why it is here</span>
              <textarea ref={first} rows={3} maxLength={700} required value={form.why} onChange={event => set('why', event.target.value)} placeholder="What it changed in how you think" />
              {startedFromNote ? <small>Started from the note you wrote beside this passage.</small> : null}
            </label>
            <div className="museum-sheet__row">
              <label className="museum-sheet__field">
                <span>Room</span>
                <input list="museum-rooms" value={form.room} onChange={event => set('room', event.target.value)} placeholder="Judgment, Craft, Time…" />
                <datalist id="museum-rooms">{roomsOf(wall).map(room => <option key={room} value={room} />)}</datalist>
              </label>
              <label className="museum-sheet__check">
                <input type="checkbox" checked={form.own} onChange={event => set('own', event.target.checked)} />
                <span>I made this</span>
              </label>
            </div>
            <details className="museum-sheet__more">
              <summary>More detail</summary>
              {[['title', 'Title'], ['author', 'By'], ['medium', 'What it is', 'Talk at Bell Labs'], ['year', 'Year']].map(([field, label, hint]) => (
                <label key={field} className="museum-sheet__field">
                  <span>{label}</span>
                  <input value={form[field]} placeholder={hint} onChange={event => set(field, event.target.value)} />
                </label>
              ))}
              {others.length ? (
                <fieldset className="museum-sheet__led">
                  <legend>It led to</legend>
                  {others.map(other => (
                    <label key={other.accession} className="museum-sheet__check">
                      <input
                        type="checkbox"
                        checked={form.ledTo.includes(other.accession)}
                        onChange={event => set('ledTo', event.target.checked ? [...form.ledTo, other.accession] : form.ledTo.filter(accession => accession !== other.accession))}
                      />
                      <span>{other.title}</span>
                    </label>
                  ))}
                </fieldset>
              ) : null}
            </details>
            <p className="museum-sheet__private">
              {kept
                ? `Only these words and your label go on the wall. Your other ${kept} highlight${kept === 1 ? '' : 's'} and notes here stay private.`
                : 'Only these words and your label go on the wall. Everything else here stays private.'}
            </p>
            {error ? <p className="museum-sheet__error" role="alert">{error}</p> : null}
            <div className="museum-sheet__actions">
              <button type="submit" className="museum-sheet__primary" disabled={busy || !form.why.trim()}>{piece ? 'Save' : 'Hang it'}</button>
              <button type="button" onClick={onClose}>Not now</button>
              {piece ? <button type="button" className="museum-sheet__down" disabled={busy} onClick={() => done(() => takeDown(piece.accession))}>Take it down</button> : null}
            </div>
          </>
        )}
      </form>
    </div>,
    document.body
  );
}
