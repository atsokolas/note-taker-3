import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getPublicEdition } from '../api/editions';
import EditionPaper from '../components/editions/EditionPaper';
import useSeoMetadata from '../hooks/useSeoMetadata';
import { issueLine, windowLine } from './editionModel';
import '../styles/editions.css';

/**
 * A paper someone published, read by a stranger.
 *
 * The snapshot the owner approved, not the live private issue. The server
 * already stripped the house; this page does not get a chance to hide it.
 */

const SharedEdition = () => {
  const { slug = '' } = useParams();
  const [edition, setEdition] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setError('');
    setEdition(null);
    getPublicEdition(slug)
      .then((found) => { if (!cancelled) setEdition(found); })
      .catch(() => {
        /* A revoked link deletes its row, so this is the same answer as a
           link that never existed — which is the point of deleting it. */
        if (!cancelled) setError('This paper is not published.');
      });
    return () => { cancelled = true; };
  }, [slug]);

  const title = edition ? `${edition.title} · Noeis` : 'Noeis';
  const description = edition
    ? (edition.standfirst
      || [windowLine(edition), issueLine(edition)].filter(Boolean).join(' · ')
      || edition.title)
    : 'This paper is not published.';

  useSeoMetadata({
    title,
    description,
    canonicalPath: `/share/editions/${slug}`,
    robots: 'noindex,nofollow'
  });

  if (error) {
    return (
      <main className="edition edition--public">
        <p className="editions__quiet">{error}</p>
        <Link to="/">Noeis</Link>
      </main>
    );
  }

  if (!edition) {
    return <main className="edition edition--public"><p className="editions__quiet" role="status">Opening…</p></main>;
  }

  return (
    <main className="edition edition--public" data-testid="shared-edition">
      <EditionPaper edition={edition} />
      <footer className="edition__colophon">
        <p>
          Every item here carries what would limit it. That is the whole
          standard, and it is why this is not a list of links.
        </p>
        <Link className="edition__colophon-cta" to="/register">Keep your own →</Link>
      </footer>
    </main>
  );
};

export default SharedEdition;
