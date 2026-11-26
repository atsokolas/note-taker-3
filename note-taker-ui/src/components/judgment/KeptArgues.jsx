import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { readKeptArgues, strikeKeptArgues } from '../../api/home';
import { pathOf } from '../home/homeModel';

/* One line, rarely: a passage you kept for good that the model reads as
   arguing with a view you hold. Only from Kept, never from everything you
   skimmed. "Not so" strikes the pairing for good. */
export default function KeptArgues() {
  const [argues, setArgues] = useState(null);
  useEffect(() => { let live = true; readKeptArgues().then(found => live && setArgues(found), () => {}); return () => { live = false; }; }, []);
  if (!argues) return null;
  const { kept, view, says, about } = argues;
  const strike = () => { setArgues(null); strikeKeptArgues(about).catch(() => {}); };
  return (
    <aside className="judgment-kept-argues" aria-label="Something you kept argues">
      <small>Something you kept argues</small>
      <p>
        <Link to={pathOf(kept)}><q>{kept.text}</q></Link> <span>{kept.title}</span>
      </p>
      <p>argues with <Link to={`/judgment/${view.id}`}>{view.title}</Link>.</p>
      {says ? <p className="judgment-kept-argues__says">{says}</p> : null}
      <button type="button" onClick={strike}>Not so</button>
    </aside>
  );
}
