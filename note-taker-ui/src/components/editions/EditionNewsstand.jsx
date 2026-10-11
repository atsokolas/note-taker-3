import React from 'react';
import { Link } from 'react-router-dom';
import { coverFigure, issueLine, latestOf, newCountOf, windowLine } from '../../pages/editionModel';

/* Each paper wears its own cover, in the house's own inks. */
const COVERS = ['ink', 'thread', 'living', 'slate', 'danger'];

/* How many back issues the lower shelf holds before it is a library, not a stand. */
const SHELF = 30;

const issueName = (paper, issue) => issueLine({ ...issue, issueLabel: paper.issueLabel }) || windowLine(issue);

/**
 * The newsstand: every paper you keep as a magazine on a rack, its newest
 * issue facing out. The cover leads with the issue's strongest figure and its
 * headline; a ribbon says what you have not read. Older issues stand below as
 * spines.
 */
export default function EditionNewsstand({ papers, opened }) {
  const backIssues = papers
    .flatMap(paper => paper.issues.slice(0, -1).map(issue => ({ paper, issue })))
    .sort((left, right) => Date.parse(right.issue.windowStart) - Date.parse(left.issue.windowStart))
    .slice(0, SHELF);
  return (
    <section className="stand" aria-label="Newsstand">
      <div className="stand__rack">
        {papers.map((paper, index) => {
          const latest = latestOf(paper);
          const figure = coverFigure(opened[latest._id]);
          const fresh = newCountOf(paper.issues);
          return (
            <Link
              key={paper.profile}
              to={`/editions?paper=${encodeURIComponent(paper.profile)}`}
              className={`stand__cover stand__cover--${COVERS[index % COVERS.length]}`}
            >
              {fresh ? <span className="stand__ribbon">{fresh} new</span> : null}
              <span className="stand__issue">{issueName(paper, latest)}</span>
              <span className="stand__title">{paper.title}</span>
              {figure ? (
                <span className="stand__figure">
                  {figure.value}
                  <small>{figure.label}</small>
                </span>
              ) : null}
              {latest.headline || latest.standfirst
                ? <span className="stand__line">{latest.headline || latest.standfirst}</span>
                : null}
            </Link>
          );
        })}
      </div>
      <div className="stand__shelf" aria-hidden="true" />

      {backIssues.length ? (
        <>
          <h2 className="stand__back">Back issues</h2>
          <div className="stand__spines">
            {backIssues.map(({ paper, issue }) => (
              <Link
                key={issue._id}
                to={`/editions/${encodeURIComponent(issue._id)}`}
                className={`stand__spine stand__cover--${COVERS[papers.indexOf(paper) % COVERS.length]}`}
                title={`${paper.title}, ${issueName(paper, issue)}`}
              >
                <span>{paper.title} · {issueName(paper, issue)}</span>
              </Link>
            ))}
          </div>
          <div className="stand__shelf" aria-hidden="true" />
        </>
      ) : null}
    </section>
  );
}
