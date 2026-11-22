import React from 'react';
import { Link } from 'react-router-dom';
import useSeoMetadata from '../hooks/useSeoMetadata';
import { Paragraph } from './LegalDocument';
import desk from './deskContent.json';
import '../styles/from-the-desk.css';

/* A page written by a person, set like an issue of an Edition: kicker,
   headline, standfirst, the writing, and a signature. The changelog is
   dated issues of it; the manifesto is one. */

const dated = on => new Date(`${on}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

const FromTheDesk = ({ page }) => {
  const { kicker, title, standfirst, signed, paragraphs, issues } = desk[page];
  useSeoMetadata({ title: `${title} | Noeis`, description: standfirst, canonicalPath: `/${page}`, ogType: 'article' });
  return (
    <main className="from-the-desk" aria-labelledby="from-the-desk-title">
      <header>
        <p className="from-the-desk__kicker">{kicker}</p>
        <h1 id="from-the-desk-title">{title}</h1>
        <p className="from-the-desk__standfirst">{standfirst}</p>
      </header>
      {paragraphs?.map(text => <Paragraph key={text} text={text} />)}
      {issues?.map(issue => (
        <article key={issue.on} className="from-the-desk__issue" aria-labelledby={`issue-${issue.on}`}>
          <p className="from-the-desk__dateline"><time dateTime={issue.on}>{dated(issue.on)}</time></p>
          <h2 id={`issue-${issue.on}`}>{issue.headline}</h2>
          {issue.paragraphs.map(text => <Paragraph key={text} text={text} />)}
        </article>
      ))}
      <p className="from-the-desk__signed">— {signed}</p>
      <nav className="from-the-desk__links" aria-label="From the desk">
        {Object.entries(desk).filter(([key]) => key !== page).map(([key, other]) => <Link key={key} to={`/${key}`}>{other.title}</Link>)}
        <Link to="/">Noeis</Link>
      </nav>
    </main>
  );
};

export default FromTheDesk;
