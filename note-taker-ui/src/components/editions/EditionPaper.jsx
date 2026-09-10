import React from 'react';
import { bySection, issueLine, publicSourceHref, windowLine } from '../../pages/editionModel';

/**
 * The paper a stranger reads, and the preview an owner approves.
 *
 * No save doors, no library counts. Those belong to the owner. This is the
 * editorial object: title, date, the name it was kept under, and every item
 * with the finding and the thing that would limit it.
 */
const EditionItemView = ({ item }) => {
  const href = publicSourceHref(item.url);
  return (
    <article className="edition-item">
      <h3 className="edition-item__title">
        {href ? (
          <a href={href} target="_blank" rel="noopener noreferrer">{item.title}</a>
        ) : item.title}
      </h3>
      {item.sourceLabel || item.sourceDate ? (
        <p className="edition-item__source">{[item.sourceLabel, item.sourceDate].filter(Boolean).join(' · ')}</p>
      ) : null}
      <p className="edition-item__finding">{item.finding}</p>
      <p className="edition-item__boundary">
        <span className="edition-item__label">What would limit it</span>
        {item.boundary}
      </p>
      {item.note ? <p className="edition-item__note">{item.note}</p> : null}
    </article>
  );
};

const EditionPaper = ({ edition, compact = false }) => {
  if (!edition) return null;
  const issue = issueLine(edition);
  const Title = compact ? 'h2' : 'h1';
  const SectionTitle = compact ? 'h3' : 'h2';
  return (
    <div className={`edition-paper${compact ? ' edition-paper--compact' : ''}`}>
      <header className="edition__masthead">
        <Title className="edition__title">{edition.title}</Title>
        <p className="edition__meta">{[windowLine(edition), issue].filter(Boolean).join(' · ')}</p>
        {edition.ownerDisplayName ? (
          <p className="edition__byline">Kept by {edition.ownerDisplayName}</p>
        ) : null}
        {edition.writtenBy ? <p className="edition__byline">Written by {edition.writtenBy}</p> : null}
      </header>

      {edition.standfirst ? <p className="edition__standfirst">{edition.standfirst}</p> : null}

      {bySection(edition).map((section) => (
        <section key={section.key || section.label} className="edition__section">
          <SectionTitle className="edition__section-title">{section.label}</SectionTitle>
          {section.items.length ? (
            section.items.map(item => <EditionItemView key={item.itemId || item.title} item={item} />)
          ) : (
            <p className="edition__section-empty">Nothing this week.</p>
          )}
        </section>
      ))}

      {edition.throughLine ? (
        <section className="edition__section">
          <SectionTitle className="edition__section-title">Across the week</SectionTitle>
          <p>{edition.throughLine}</p>
        </section>
      ) : null}

      {edition.watchNext?.length ? (
        <section className="edition__section">
          <SectionTitle className="edition__section-title">What to watch next</SectionTitle>
          <ul className="edition__watch">{edition.watchNext.map(line => <li key={line}>{line}</li>)}</ul>
        </section>
      ) : null}
    </div>
  );
};

export default EditionPaper;
