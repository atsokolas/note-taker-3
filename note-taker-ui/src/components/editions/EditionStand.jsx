import React from 'react';
import { Link } from 'react-router-dom';
import { datelineLine, issueLine, latestFilingLine, newCountOf, runGrid, sectionTones } from '../../pages/editionModel';
import { RunMark, plural } from './EditionRun';

/* The answer to "anything for me?", in one sentence. Unknown says nothing. */
const newsLine = (papers) => {
  const counts = papers.map(paper => newCountOf(paper.issues));
  if (counts.every(count => count === null)) return '';
  const total = counts.reduce((sum, count) => sum + (count || 0), 0);
  if (!total) return 'Nothing new since you last read. Every paper is caught up.';
  const waiting = counts.filter(Boolean).length;
  return `${plural(total, 'new finding')} across ${plural(waiting, 'paper')}.`;
};

/**
 * 10⁴ — every paper you keep, one line each: what it last printed, what that
 * issue held, and what is new on it. The paper with the latest filing leads,
 * and the place you stopped reading is one tap away.
 */
export default function EditionStand({ papers, resume = null }) {
  const news = newsLine(papers);
  const place = resume?.issueId && papers.some(paper => paper.issues.some(issue => issue._id === resume.issueId))
    ? `/editions/${encodeURIComponent(resume.issueId)}${resume.itemId ? `?item=${encodeURIComponent(resume.itemId)}` : ''}`
    : '';
  return (
    <section className="edition-stand" aria-labelledby="edition-stand-title">
      <header className="edition-stand__head">
        <h1 id="edition-stand-title">Your papers</h1>
        {news ? <p>{news}</p> : null}
        {place ? (
          <Link className="edition-stand__resume" to={place}>
            Back to where you stopped{resume.title ? <i>{resume.title}</i> : null}
          </Link>
        ) : null}
      </header>
      <ol className="edition-stand__papers">
        {papers.map((paper) => {
          const grid = runGrid(paper);
          const latest = grid.rows[0];
          const fresh = newCountOf(paper.issues);
          return (
            <li key={paper.profile}>
              <Link to={`/editions?paper=${encodeURIComponent(paper.profile)}`} className="edition-stand__paper">
                <span className="edition-stand__title">{paper.title}</span>
                <span className="edition-stand__latest">
                  {[
                    issueLine({ ...latest.issue, issueLabel: paper.issueLabel }),
                    datelineLine(latest.issue),
                    latestFilingLine(latest.issue)
                  ].filter(Boolean).join(' · ')}
                </span>
                {latest.issue.standfirst ? <span className="edition-stand__standfirst">{latest.issue.standfirst}</span> : null}
                <RunMark cells={latest.cells} tones={sectionTones(grid.sections)} />
                <span className={`edition-stand__new${fresh ? ' is-new' : ''}`}>{fresh ? `${fresh} new` : ''}</span>
              </Link>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
