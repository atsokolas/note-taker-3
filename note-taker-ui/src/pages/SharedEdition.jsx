import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getPublicEdition } from '../api/editions';
import { bySection, issueLine, windowLine } from './editionModel';
import '../styles/editions.css';

/**
 * A paper someone published, read by a stranger.
 *
 * The same edition the owner reads, minus everything about the owner: not
 * which sources they took into their library, not how many. A public edition
 * is the reading; what they did with it afterwards is theirs, and the server
 * strips it rather than trusting this page to hide it.
 *
 * The boundary under every item is the reason this is worth opening. Anyone
 * can publish a list of links; an edition cannot exist unless each item said
 * what would limit it, so the standard is visible to someone who has never
 * heard of Noeis — which is the only argument for it that matters.
 */

const useDocumentTitle = (title) => {
  useEffect(() => {
    if (!title) return undefined;
    const previous = document.title;
    document.title = title;
    return () => { document.title = previous; };
  }, [title]);
};

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

  useDocumentTitle(edition ? `${edition.title} · Noeis` : '');

  if (error) {
    return (
      <main className="edition edition--public">
        <p className="editions__quiet">{error}</p>
        <Link to="/">Noeis</Link>
      </main>
    );
  }

  if (!edition) return <main className="edition edition--public"><p className="editions__quiet" role="status">Opening…</p></main>;

  const issue = issueLine(edition);

  return (
    <main className="edition edition--public" data-testid="shared-edition">
      <header className="edition__masthead">
        <h1 className="edition__title">{edition.title}</h1>
        <p className="edition__meta">{[windowLine(edition), issue].filter(Boolean).join(' · ')}</p>
        {edition.ownerDisplayName ? (
          <p className="edition__byline">Kept by {edition.ownerDisplayName}</p>
        ) : null}
      </header>

      {edition.standfirst ? <p className="edition__standfirst">{edition.standfirst}</p> : null}

      {bySection(edition).map((section) => (
        <section key={section.key || section.label} className="edition__section">
          <h2 className="edition__section-title">{section.label}</h2>
          {section.items.length ? section.items.map(item => (
            <article className="edition-item" key={item.itemId}>
              <h3 className="edition-item__title">
                <a href={item.url} target="_blank" rel="noopener noreferrer">{item.title}</a>
              </h3>
              {item.sourceLabel || item.sourceDate ? (
                <p className="edition-item__source">{[item.sourceLabel, item.sourceDate].filter(Boolean).join(' · ')}</p>
              ) : null}
              <p className="edition-item__finding">{item.finding}</p>
              {/* The required half, and the reason a stranger should read
                  this rather than any other weekly. */}
              <p className="edition-item__boundary">
                <span className="edition-item__label">What would limit it</span>
                {item.boundary}
              </p>
              {item.note ? <p className="edition-item__note">{item.note}</p> : null}
            </article>
          )) : (
            /* Printed, not dropped — the same rule the owner's copy follows.
               A week with nothing under counterevidence is saying something. */
            <p className="edition__section-empty">Nothing this week.</p>
          )}
        </section>
      ))}

      {edition.throughLine ? (
        <section className="edition__section">
          <h2 className="edition__section-title">Across the week</h2>
          <p>{edition.throughLine}</p>
        </section>
      ) : null}

      {edition.watchNext?.length ? (
        <section className="edition__section">
          <h2 className="edition__section-title">What to watch next</h2>
          <ul className="edition__watch">{edition.watchNext.map(line => <li key={line}>{line}</li>)}</ul>
        </section>
      ) : null}

      <footer className="edition__colophon">
        <p>
          Every item here carries what would limit it. That is the whole
          standard, and it is why this is not a list of links.
        </p>
        <Link to="/">Kept with Noeis</Link>
      </footer>
    </main>
  );
};

export default SharedEdition;
