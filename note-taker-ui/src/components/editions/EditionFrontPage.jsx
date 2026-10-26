import React from 'react';
import { Link } from 'react-router-dom';
import { frontPage, headlineOf, issueLine, updatedLine } from '../../pages/editionModel';
import { EditionBoundary } from './EditionFinding';
import { Figures, Passage, SourceLink, Why } from './EditionLayer';

const issuePath = issue => `/editions/${encodeURIComponent(issue._id)}`;
const storyPath = ({ issue, item }) => `${issuePath(issue)}?item=${encodeURIComponent(item.itemId)}`;
const paperPath = paper => `/editions?paper=${encodeURIComponent(paper.profile)}`;

/* Which paper, which issue, and the day it was last filed into. */
const PaperHead = ({ paper, issue }) => (
  <header className="front__head">
    <h2><Link to={paperPath(paper)}>{paper.title}</Link></h2>
    <p>{[issueLine({ ...issue, issueLabel: paper.issueLabel }), updatedLine(issue)].filter(Boolean).join(' · ')}</p>
  </header>
);

/* A story set small: what it means, why it is here, and the source a click away. */
const Story = ({ story }) => (
  <article className="front-story">
    <h3><Link to={storyPath(story)} data-noeis-item>{headlineOf(story.item)}</Link></h3>
    <Why item={story.item} />
    <SourceLink item={story.item} />
  </article>
);

/**
 * The front page: every paper you keep, set as one broadsheet. The lead is
 * the finding with the most you can check, with the rest of its issue beside
 * it; below, each other paper gets a column of its own, in the same order of
 * parts: paper, headline, why it is here, source.
 */
export default function EditionFrontPage({ papers, opened, news }) {
  const { lead, alsoIn, columns, watching } = frontPage(papers, opened);
  const updated = updatedLine({ items: [lead, ...alsoIn, ...columns].flatMap(row => row?.issue.items || []) });
  return (
    <section className="front" aria-label="Front page">
      <p className="front__folio">
        <span>{updated}</span>
        <span>{news}</span>
      </p>
      <h1 className="front__masthead">The Noeis Edition</h1>

      {lead ? (
        <>
          <div className="front__top">
            <article className="front__lead">
              <PaperHead paper={lead.paper} issue={lead.issue} />
              <h2 className="front__headline"><Link to={storyPath(lead)} data-noeis-item>{headlineOf(lead.item)}</Link></h2>
              <Why item={lead.item} />
              <SourceLink item={lead.item} />
              <Figures figures={lead.item.figures} />
              <p className="front__body">{lead.item.finding}</p>
              <Passage item={lead.item} />
              <EditionBoundary>{lead.item.boundary}</EditionBoundary>
            </article>

            <aside className="front__rest">
              {alsoIn.length ? <h2 className="front-kicker">Also in this issue</h2> : null}
              {alsoIn.map(story => <Story key={story.item.itemId} story={story} />)}
              <Link className="front__more" to={issuePath(lead.issue)}>Read the whole issue →</Link>
              {watching.length ? (
                <section className="front__watching">
                  <h2 className="front-kicker">Still watching</h2>
                  <ul>
                    {watching.slice(0, 4).map(thread => (
                      <li key={`${thread.paper.profile}:${thread.watch}`}>
                        {thread.watch}
                        <small>{thread.paper.title}</small>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </aside>
          </div>

          {columns.length ? (
            <div className="front__papers">
              {columns.map(({ paper, issue, stories }) => (
                <section key={paper.profile} className="front__paper">
                  <PaperHead paper={paper} issue={issue} />
                  {stories.slice(0, 3).map(story => <Story key={story.item.itemId} story={story} />)}
                  {stories.length > 3 ? <Link className="front__more" to={issuePath(issue)}>All {stories.length} in this issue →</Link> : null}
                </section>
              ))}
            </div>
          ) : null}
        </>
      ) : (
        <p className="front__empty">Nothing has been filed into this week’s papers yet.</p>
      )}
    </section>
  );
}
