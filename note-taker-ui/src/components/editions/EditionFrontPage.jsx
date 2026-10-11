import React from 'react';
import { Link } from 'react-router-dom';
import { costLine, frontPage, headlineOf, sourceNote, WATCH_STATUS, wireOf } from '../../pages/editionModel';
import AgentMark from './AgentMark';
import { EditionBoundary } from './EditionFinding';
import { handOf } from './editionAgent';
import { Figures, Passage } from './EditionLayer';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const today = (date = new Date()) => `${DAYS[date.getDay()]}, ${MONTHS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;

/* Under a headline led by its plain line, the source's own title, then what kind of source it is. */
export const SourceLine = ({ item }) => (
  <p className="front__source">{[item.plain ? item.title : '', sourceNote(item)].filter(Boolean).join('. ')}</p>
);

const storyPath = ({ issue, item }) => `/editions/${encodeURIComponent(issue._id)}?item=${encodeURIComponent(item.itemId)}`;
const paperPath = paper => `/editions?paper=${encodeURIComponent(paper.profile)}`;

/* A story set small: led by what it means, then the source it came from.
   Its paper is the column's head, said once. */
const Story = ({ story, size = 'm' }) => (
  <article className={`front-story front-story--${size}`}>
    <h3><Link to={storyPath(story)}>{headlineOf(story.item)}</Link></h3>
    <p>{story.item.plain ? story.item.title : story.item.finding}</p>
  </article>
);

/**
 * The broadsheet: every paper you keep, set as one front page. The lead is
 * the finding with the most you can check; each other paper gets a column;
 * the rail carries what the papers are watching, what came over the wire,
 * and which sections were looked at and found quiet.
 */
export default function EditionFrontPage({ papers, opened, news }) {
  const { lead, alsoIn, columns, quiet, watching } = frontPage(papers, opened);
  const wire = wireOf(papers).slice(0, 4);
  const stories = [lead, ...alsoIn, ...columns.flatMap(column => column.stories)].filter(Boolean);
  const [first, ...rest] = columns;
  const hands = [...new Map(wire.map(entry => [entry.agent.key, entry.agent])).values()];
  return (
    <section className="front" aria-label="Front page">
      <div className="front__folio">
        <span>{today()}</span>
        <span>{[costLine(stories.map(story => story.item)), news].filter(Boolean).join(' · ')}</span>
        {hands.length ? <span>Filed by {hands.map(agent => agent.name).join(' & ')}</span> : null}
      </div>
      <h1 className="front__masthead">The Noeis Edition</h1>
      <nav className="front__papers" aria-label="Your papers">
        {papers.map(paper => <Link key={paper.profile} to={paperPath(paper)}>{paper.title}</Link>)}
      </nav>

      {lead ? (
        <div className="front__page">
          <article className="front__lead">
            <span className="front-kicker">{lead.paper.title} · lead story</span>
            <h2><Link to={storyPath(lead)}>{headlineOf(lead.item)}</Link></h2>
            <SourceLine item={lead.item} />
            <Figures figures={lead.item.figures} />
            <p className="front__body">{lead.item.finding}</p>
            <Passage item={lead.item} />
            <EditionBoundary>{lead.item.boundary}</EditionBoundary>
            {alsoIn.length ? (
              <p className="front__also">
                <b>Also in the issue: </b>
                {alsoIn.slice(0, 3).map((story, index) => (
                  <React.Fragment key={story.item.itemId}>
                    {index ? '; ' : ''}<Link to={storyPath(story)}>{headlineOf(story.item).replace(/\.$/, '')}</Link>
                  </React.Fragment>
                ))}.
              </p>
            ) : null}
            <Link className="front__more" to={`/editions/${encodeURIComponent(lead.issue._id)}`}>Read the whole issue →</Link>
          </article>

          <div className="front__column">
            {first ? (
              <>
                <h2 className="front__head"><Link to={paperPath(first.paper)}>{first.paper.title}</Link></h2>
                {first.stories.slice(0, 3).map((story, index) => (
                  <Story key={story.item.itemId} story={story} size={index ? 's' : 'l'} />
                ))}
              </>
            ) : null}
          </div>

          <aside className="front__rail">
            {watching.length ? (
              <section className="front__box">
                <h2 className="front-kicker">The watch list</h2>
                <ul>
                  {watching.slice(0, 4).map(thread => (
                    <li key={`${thread.paper.profile}:${thread.watch}`}>
                      <b>{WATCH_STATUS[thread.status]}</b> — {thread.watch}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            {wire.length ? (
              <section>
                <h2 className="front__head">The wire</h2>
                <ul className="front__wire">
                  {wire.map(entry => (
                    <li key={`${entry.paper.profile}:${entry.agent.key}`}>
                      <AgentMark {...handOf(entry.agent)} glyph />
                      <Link to={`/editions/${encodeURIComponent(entry.issue._id)}`}>
                        {entry.agent.name} filed {entry.count} to {entry.paper.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            {quiet.length ? (
              <section>
                <h2 className="front__head">Quiet this week</h2>
                {quiet.map(({ paper, silence }) => (
                  <p key={`${paper.profile}:${silence.key}`} className="front__quiet">
                    {silence.label}, in {paper.title}: looked, and nothing met the bar.
                  </p>
                ))}
              </section>
            ) : null}
          </aside>
        </div>
      ) : (
        <p className="front__empty">Nothing has been filed into this week’s papers yet.</p>
      )}

      {rest.length ? (
        <div className="front__fold">
          {rest.map(column => (
            <div key={column.paper.profile}>
              <h2 className="front__head"><Link to={paperPath(column.paper)}>{column.paper.title}</Link></h2>
              <Story story={column.stories[0]} size="s" />
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
