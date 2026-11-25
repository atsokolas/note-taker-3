import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import useOwnMuseum from './useOwnMuseum';
import PieceSheet from './PieceSheet';
import { tagOf } from './museumModel';

/*
 * "Hang in museum", beside "Add to project" wherever a thing can be read:
 * a reading, a book, a wiki page, a note. Once it hangs, the same place says
 * so and opens its label for more detail.
 */
export default function HangInMuseum({ kind, id, passage = '', className = '' }) {
  const own = useOwnMuseum();
  const [open, setOpen] = useState(false);
  const [hung, setHung] = useState('');
  if (!id) return null;
  const museum = own?.museum;
  const piece = museum?.pieces.find(candidate => candidate.kind === kind && candidate.id === String(id));
  return (
    <span className="add-to-project">
      <button type="button" className={className || 'add-to-project-trigger'} aria-haspopup="dialog" onClick={() => setOpen(true)}>
        {piece ? 'On your wall' : 'Hang in museum'}
      </button>
      {hung && piece ? (
        <span role="status" className="add-to-project-status">
          Hung as <Link to={`/museum?piece=${encodeURIComponent(piece.accession)}`}>{tagOf(piece, museum.name)}</Link>
        </span>
      ) : null}
      {open ? <PieceSheet kind={kind} id={String(id)} passage={passage} onClose={() => setOpen(false)} onHung={setHung} /> : null}
    </span>
  );
}
