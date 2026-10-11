import React, { useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { costLine, coverFigure, frontPage, headlineOf, issueLine, latestOf, newCountOf, sourceNote, windowLine } from '../../pages/editionModel';
import { Figures, Passage } from './EditionLayer';
import { SourceLine } from './EditionFrontPage';

/* Each paper wears its own cover, in the house's own inks. */
const COVERS = ['ink', 'thread', 'living', 'slate', 'danger'];

/* How many back issues the lower shelf holds before it is a library, not a stand. */
const SHELF = 30;

const issueName = (paper, issue) => issueLine({ ...issue, issueLabel: paper.issueLabel }) || windowLine(issue);
const inkOf = (papers, paper) => COVERS[papers.indexOf(paper) % COVERS.length];
const findingPath = (issue, item) => `/editions/${encodeURIComponent(issue._id)}?item=${encodeURIComponent(item.itemId)}`;

/* A paper's newest issue, facing out: its strongest figure, its headline, and
   a ribbon for what you have not read. */
function Cover({ papers, paper, opened, open = false }) {
  const latest = latestOf(paper);
  const figure = coverFigure(opened[latest._id]);
  const fresh = newCountOf(paper.issues);
  const face = (
    <>
      {fresh ? <span className="stand__ribbon">{fresh} new</span> : null}
      <span className="stand__issue">{issueName(paper, latest)}</span>
      <span className="stand__title">{paper.title}</span>
      {figure ? (
        <span className="stand__figure">
          {figure.value}
          <small>{figure.label}</small>
        </span>
      ) : null}
      {latest.headline || latest.standfirst ? <span className="stand__line">{latest.headline || latest.standfirst}</span> : null}
    </>
  );
  const className = `stand__cover stand__cover--${inkOf(papers, paper)}${open ? ' is-open' : ''}`;
  return open
    ? <div className={className}>{face}</div>
    : <Link className={className} to={`/editions?open=${encodeURIComponent(paper.profile)}`}>{face}</Link>;
}

/**
 * A magazine, opened: the cover on the left page; on the right, what is in
 * the issue and its feature, the finding with the most you can check. Esc,
 * or the way back, returns it to the rack.
 */
function Spread({ papers, paper, opened }) {
  const navigate = useNavigate();
  const issue = opened[latestOf(paper)._id];
  const { lead } = frontPage([paper], opened);
  useEffect(() => {
    const close = (event) => {
      if (event.key !== 'Escape' || event.defaultPrevented || document.querySelector('dialog[open]')) return;
      event.preventDefault();
      navigate('/editions');
    };
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [navigate]);
  return (
    <section className="stand__spread" aria-label={`${paper.title}, opened`}>
      <nav className="stand__spread-nav">
        <Link to="/editions">← Back to the stand</Link>
        <Link to={`/editions?paper=${encodeURIComponent(paper.profile)}`}>Every issue of {paper.title} →</Link>
      </nav>
      <div className="stand__pages">
        <Cover papers={papers} paper={paper} opened={opened} open />
        <div className="stand__page">
          {issue?.items?.length ? (
            <>
              <h2 className="stand__contents-head">In this issue <span>{costLine(issue.items)}</span></h2>
              <ol className="stand__contents">
                {issue.items.map((item, index) => (
                  <li key={item.itemId}>
                    <span className="stand__number">{String(index + 1).padStart(2, '0')}</span>
                    <Link to={findingPath(issue, item)}>{headlineOf(item)}</Link>
                    <small>{sourceNote(item)}</small>
                  </li>
                ))}
              </ol>
              {lead ? (
                <article className="stand__feature">
                  <span className="front-kicker">The feature</span>
                  <h3><Link to={findingPath(issue, lead.item)}>{headlineOf(lead.item)}</Link></h3>
                  <SourceLine item={lead.item} />
                  <Figures figures={lead.item.figures} />
                  <p className="front__body">{lead.item.finding}</p>
                  <Passage item={lead.item} />
                </article>
              ) : null}
              <Link className="front__more" to={`/editions/${encodeURIComponent(issue._id)}`}>Read the whole issue →</Link>
            </>
          ) : (
            <p className="front__empty">{issue ? 'Nothing has been filed into this issue yet.' : 'Opening this issue…'}</p>
          )}
        </div>
      </div>
    </section>
  );
}

/**
 * The newsstand: every paper you keep as a magazine on a rack, its newest
 * issue facing out. Pick one up and it opens; older issues stand below as
 * spines.
 */
export default function EditionNewsstand({ papers, opened }) {
  const [params] = useSearchParams();
  const open = papers.find(paper => paper.profile === params.get('open'));
  if (open) return <Spread papers={papers} paper={open} opened={opened} />;
  const backIssues = papers
    .flatMap(paper => paper.issues.slice(0, -1).map(issue => ({ paper, issue })))
    .sort((left, right) => Date.parse(right.issue.windowStart) - Date.parse(left.issue.windowStart))
    .slice(0, SHELF);
  return (
    <section className="stand" aria-label="Newsstand">
      <div className="stand__rack">
        {papers.map(paper => <Cover key={paper.profile} papers={papers} paper={paper} opened={opened} />)}
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
                className={`stand__spine stand__cover--${inkOf(papers, paper)}`}
                title={`${paper.title}, ${issueName(paper, issue)}`}
                aria-label={`${paper.title}, ${issueName(paper, issue)}`}
              >
                <span>{issueName(paper, issue)}</span>
              </Link>
            ))}
          </div>
          <div className="stand__shelf" aria-hidden="true" />
        </>
      ) : null}
    </section>
  );
}
