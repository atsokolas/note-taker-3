import React from 'react';
import { Link } from 'react-router-dom';
import { formatCalendarDate } from '../../utils/dateDisplay';

const ORDINALS = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'];

const hasSafeInternalHref = ref => {
  const href = typeof ref === 'string' ? ref : ref?.href;
  return typeof href === 'string' && href.startsWith('/') && !href.startsWith('//');
};

/* "Your fourth piece by Ben Carlson." Only from the third piece on: two is a
   coincidence, three is an author you keep returning to. */
export const authorLine = (author, pieces) => {
  const name = String(author || '').trim();
  const count = Number(pieces);
  if (!name || !Number.isInteger(count) || count < 3) return '';
  return `Your ${ORDINALS[count] || `${count}th`} piece by ${name}.`;
};

/* The source record, at the foot of the piece: who wrote it, when it was
   published and saved, and the concepts it is pinned under. Where its
   passages went is said by the reader, under this record. */
const LibrarySourceTrace = ({ source, loading = false, error = '' }) => {
  if (loading) {
    return (
      <section className="library-source-trace" aria-label="Source record" aria-live="polite" data-testid="library-source-trace">
        <p className="library-source-trace__status">Finding where this piece went…</p>
      </section>
    );
  }
  if (!source || typeof source !== 'object') {
    return error ? (
      <section className="library-source-trace" aria-label="Source record" aria-live="polite" data-testid="library-source-trace">
        <p className="library-source-trace__status">The piece is here, but where it is used could not be loaded.</p>
      </section>
    ) : null;
  }

  const provenance = source.provenance || {};
  const saved = formatCalendarDate(provenance.importedAt || source.createdAt);
  const published = formatCalendarDate(provenance.publicationDate);
  const facts = [
    provenance.author,
    published ? `Published ${published}` : '',
    saved ? `Saved ${saved}` : '',
    provenance.sourceLabel || provenance.siteName
  ].filter(Boolean).join(' · ');
  const returning = authorLine(provenance.author, source.authorPieces);
  const concepts = (Array.isArray(source.relevance?.connected) ? source.relevance.connected : [])
    .filter(ref => ref?.type === 'concept' && hasSafeInternalHref(ref));

  return (
    <section className="library-source-trace" aria-labelledby="library-source-trace-title" data-testid="library-source-trace">
      <header className="library-source-trace__header">
        <p id="library-source-trace-title">Source record</p>
      </header>
      {facts ? <p className="library-source-trace__facts">{facts}</p> : null}
      {returning ? (
        <p className="library-source-trace__author">
          <Link to={`/library?aq=${encodeURIComponent(provenance.author.trim())}`}>{returning}</Link>
        </p>
      ) : null}
      {concepts.length ? (
        <div className="library-source-trace__uses">
          <span>Under your concepts</span>
          <nav aria-label="Concepts holding this source">
            {concepts.map(ref => <Link key={ref.id} to={ref.href}>{ref.title}</Link>)}
          </nav>
        </div>
      ) : null}
    </section>
  );
};

export default LibrarySourceTrace;
