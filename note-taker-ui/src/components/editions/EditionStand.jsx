import React from 'react';
import { Link } from 'react-router-dom';
import { datelineLine, issueLine, latestFilingLine, newCountOf, stateOf, windowLine } from '../../pages/editionModel';
import { plural } from './EditionRun';

/* How many of a paper's issues its line on the stand shows: about a season. */
const YEAR_MARK_ISSUES = 26;

/**
 * A paper's run at the scale of a year: one bar per issue, oldest to newest,
 * taller for more findings, marked where you kept something, dashed while
 * the newest is still being written.
 */
function YearMark({ issues }) {
  const shown = issues.slice(-YEAR_MARK_ISSUES);
  const kept = shown.filter(issue => issue.savedCount).length;
  return (
    <span
      className="year-mark"
      role="img"
      aria-label={`${plural(shown.length, 'issue')} since ${windowLine(shown[0]).split(' – ')[0]}${kept ? `; you kept from ${kept}` : ''}`}
    >
      {shown.map(issue => (
        <span
          key={issue._id}
          className={`year-mark__issue${issue.savedCount ? ' is-kept' : ''}${stateOf(issue) === 'filling' ? ' is-filling' : ''}`}
          style={{ '--filed': Math.min(issue.itemCount ?? (issue.filings || []).length, 8) }}
        />
      ))}
    </span>
  );
}

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
 * 10⁴ — every paper you keep, one line each: what it last printed, the shape
 * of its year, and what is new on it. The paper with the latest filing leads,
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
          const latest = paper.issues[paper.issues.length - 1];
          const fresh = newCountOf(paper.issues);
          return (
            <li key={paper.profile}>
              <Link to={`/editions?paper=${encodeURIComponent(paper.profile)}`} className="edition-stand__paper">
                <span className="edition-stand__title">{paper.title}</span>
                <span className="edition-stand__latest">
                  {[
                    issueLine({ ...latest, issueLabel: paper.issueLabel }),
                    datelineLine(latest),
                    latestFilingLine(latest)
                  ].filter(Boolean).join(' · ')}
                </span>
                {latest.headline || latest.standfirst
                  ? <span className="edition-stand__standfirst">{latest.headline || latest.standfirst}</span>
                  : null}
                <YearMark issues={paper.issues} />
                <span className={`edition-stand__new${fresh ? ' is-new' : ''}`}>{fresh ? `${fresh} new` : ''}</span>
              </Link>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
