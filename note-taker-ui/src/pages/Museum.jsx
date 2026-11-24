import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { readMuseum } from '../api/museum';
import MuseumWall from '../components/museum/MuseumWall';
import { museumPath, wallTitle } from '../components/museum/museumModel';
import useSeoMetadata from '../hooks/useSeoMetadata';

/* Someone's museum, read without an account. Every piece has its own address,
   so a link to one piece opens straight into its case. Opening a piece from
   the wall is a step forward; walking the case and closing it are not. */
export default function Museum() {
  const { handle = '', accession = '' } = useParams();
  const navigate = useNavigate();
  const [museum, setMuseum] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    readMuseum(handle)
      .then(found => { if (live) setMuseum(found); })
      .catch(() => { if (live) setError('This museum is closed.'); });
    return () => { live = false; };
  }, [handle]);

  const piece = museum?.pieces.find(hung => hung.accession === accession);
  useSeoMetadata({
    title: museum ? [piece?.title, wallTitle(museum.name), 'Noeis'].filter(Boolean).join(' · ') : 'Noeis',
    description: piece?.why || museum?.intro || 'The pieces that shaped how someone thinks, and why each one is there.',
    canonicalPath: museumPath(handle, accession)
  });

  if (!museum) {
    return (
      <main className="museum-page museum museum-room" aria-busy={!error}>
        <p className="museum-empty" role={error ? 'alert' : 'status'}>{error || 'Opening the museum…'}</p>
      </main>
    );
  }
  return (
    <main className="museum-page">
      <MuseumWall
        museum={museum}
        open={accession}
        onOpen={next => navigate(museumPath(handle, next), { replace: Boolean(accession) })}
      />
    </main>
  );
}
