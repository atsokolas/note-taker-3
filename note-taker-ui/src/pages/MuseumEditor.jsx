import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { rehang, saveMuseum } from '../api/museum';
import HangInMuseum from '../components/museum/HangInMuseum';
import MuseumWall from '../components/museum/MuseumWall';
import PieceSheet from '../components/museum/PieceSheet';
import useOwnMuseum from '../components/museum/useOwnMuseum';
import { museumPath } from '../components/museum/museumModel';
import useDocumentTitle from '../hooks/useDocumentTitle';

const ADDRESS = `${window.location.host}${museumPath()}/`;
const said = error => error?.response?.data?.error || 'That did not save.';

// The wall's name, address and opening line, and whether visitors may come in.
function WallSettings({ museum }) {
  const [form, setForm] = useState(museum);
  const [note, setNote] = useState('');
  useEffect(() => setForm(museum), [museum]);
  const set = key => event => setForm(current => ({ ...current, [key]: event.target.value }));
  const save = open => saveMuseum({ name: form.name, handle: form.handle, intro: form.intro, open })
    .then(() => setNote(open ? 'Open to visitors.' : 'Saved. Only you can see it.'), error => setNote(said(error)));
  const visit = `${window.location.origin}${museumPath(museum.handle)}`;
  return (
    <details className="museum-settings" open={!museum.open}>
      <summary>{museum.open ? <>Open at <a href={visit}>{visit.replace(/^https?:\/\//, '')}</a></> : 'Closed. Only you can see it.'}</summary>
      <form onSubmit={event => { event.preventDefault(); save(museum.open); }}>
        <label>
          <span>Whose wall</span>
          <input value={form.name} maxLength={80} onChange={set('name')} placeholder="Your name" />
        </label>
        <label>
          <span>Address</span>
          <span className="museum-settings__address">{ADDRESS}<input value={form.handle} maxLength={30} onChange={set('handle')} placeholder="your-name" aria-label="Address" /></span>
        </label>
        <label className="is-wide">
          <span>A line for visitors</span>
          <textarea rows={2} maxLength={280} value={form.intro} onChange={set('intro')} placeholder="What these pieces have in common" />
        </label>
        <p className="museum-settings__actions">
          <button type="submit" className="museum-button">Save</button>
          <button type="button" className="museum-button is-primary" onClick={() => save(!museum.open)}>{museum.open ? 'Close the wall' : 'Open the wall'}</button>
          {note ? <span role="status">{note}</span> : null}
        </p>
      </form>
    </details>
  );
}

/* Your own museum: the wall as visitors see it, with your hands on it. Each
   piece can be relabelled or moved along the wall, and the things you kept
   for good wait below it to be hung. */
export default function MuseumEditor() {
  const own = useOwnMuseum();
  const [params, setParams] = useSearchParams();
  const [editing, setEditing] = useState(null);
  useDocumentTitle('Museum');
  const open = params.get('piece') || '';
  if (!own) return <main className="museum museum-room" aria-busy="true"><p className="museum-empty" role="status">Opening your museum…</p></main>;
  const { museum, kept } = own;
  if (!museum) return <main className="museum museum-room"><p className="museum-empty" role="alert">Your museum could not be reached just now.</p></main>;

  const order = museum.pieces.map(piece => piece.accession);
  const move = (accession, step) => {
    const from = order.indexOf(accession);
    const to = from + step;
    if (to < 0 || to >= order.length) return;
    const next = [...order];
    [next[from], next[to]] = [next[to], next[from]];
    rehang(next);
  };
  const ownerActions = piece => (
    <div className="museum-placard__owner">
      <button type="button" onClick={() => setEditing(piece)}>Edit the label</button>
      <button type="button" disabled={piece.accession === order[0]} onClick={() => move(piece.accession, -1)}>Hang earlier</button>
      <button type="button" disabled={piece.accession === order.at(-1)} onClick={() => move(piece.accession, 1)}>Hang later</button>
    </div>
  );

  return (
    <main className="museum-page">
      <MuseumWall
        museum={museum}
        open={open}
        onOpen={next => setParams(next ? { piece: next } : {}, { replace: Boolean(open) })}
        ownerActions={ownerActions}
        head={<WallSettings museum={museum} />}
      >
        {!museum.pieces.length ? <p className="museum-empty">Hang the first piece from anything you have highlighted, or from a page of your own.</p> : null}
        {kept.length ? (
          <section className="museum-kept" aria-labelledby="museum-kept-title">
            <h2 id="museum-kept-title">Kept for good, not yet hung</h2>
            <p>You marked these to keep. Any of them can go on the wall.</p>
            <ul>
              {kept.map(item => (
                <li key={`${item.kind}:${item.id}`}>
                  <span className="museum-kept__title">{item.title}</span>
                  <HangInMuseum kind={item.kind} id={item.id} />
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </MuseumWall>
      {editing ? <PieceSheet kind={editing.kind} id={editing.id} onClose={() => setEditing(null)} /> : null}
    </main>
  );
}
