import React from 'react';
import { Link } from 'react-router-dom';
import { Card } from '../components/ui';
import useSeoMetadata from '../hooks/useSeoMetadata';
import legalContent from './legalContent.json';

// Approved copy uses only plain paragraphs and Markdown links.
const Paragraph = ({ text }) => (
  <p>{text.split(/(\[[^\]]+\]\([^)]+\))/g).map((part, index) => {
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (!link) return part;
    return link[2].startsWith('/')
      ? <Link key={index} to={link[2]}>{link[1]}</Link>
      : <a key={index} href={link[2]}>{link[1]}</a>;
  })}</p>
);

const LegalDocument = ({ page }) => {
  const content = legalContent[page];
  useSeoMetadata({
    title: `${content.title} | NOEIS`,
    description: content.sections[0].paragraphs[0].replace(/\[([^\]]+)\]\([^)]+\)/g, '$1'),
    canonicalPath: `/${page}`,
    ogType: 'website'
  });
  return (
    <div className="legal-shell">
      <article aria-label={content.title}>
        <Card className="legal-card">
          <h1>{content.title}</h1>
          <p className="muted">{content.updated}</p>
        </Card>
        {content.sections.map(({ heading, paragraphs }) => (
          <Card className="legal-card" key={heading}>
            <h2>{heading}</h2>
            {paragraphs.map((text) => <Paragraph key={text} text={text} />)}
          </Card>
        ))}
      </article>
      <nav className="legal-links" aria-label="NOEIS information">
        {Object.entries(legalContent).filter(([key]) => key !== page).map(([key, value]) => (
          <Link key={key} to={`/${key}`}>{value.title}</Link>
        ))}
        <Link to="/">Back to home</Link>
      </nav>
    </div>
  );
};

export default LegalDocument;
