import React from 'react';
import { Link } from 'react-router-dom';
import {
  issueLine, newCountOf, plural, runGrid, sectionTones, stateOf, WATCH_STATUS, watchThreads, windowLine
} from '../../pages/editionModel';

const SAID = {
  filled: cell => `${cell.count} filed`,
  checked: () => 'looked, nothing met the bar',
  unreported: () => 'not reported',
  unknown: () => 'nothing filed'
};

/**
 * What one issue held, column by column, small enough to sit on a line: a
 * filled block per column that got something (taller for more), a braced one
 * where an agent looked and found nothing, an open one where nobody reported.
 */
export function RunMark({ cells = [], tones = {} }) {
  if (!cells.length) return null;
  return (
    <span
      className="run-mark"
      role="img"
      aria-label={cells.map(cell => `${cell.label}: ${SAID[cell.state](cell)}`).join('; ')}
    >
      {cells.map(cell => (
        <span
          key={cell.section}
          className={`run-mark__cell run-mark__cell--${cell.state}${cell.state === 'filled' ? ` edition-tone--${tones[cell.section]}` : ''}`}
          style={{ '--filed': Math.min(cell.count, 4) }}
        />
      ))}
    </span>
  );
}

/* What is still waiting on an issue, and what the reader took from it. */
const yoursLine = (issue) => [
  issue.newCount ? `${issue.newCount} new` : '',
  issue.savedCount ? `kept ${issue.savedCount} of ${issue.itemCount}` : ''
].filter(Boolean).join(' · ');

/**
 * 10³ — one paper over its run. Newest issue first, each in one line: which
 * issue, which week, what it said, what it held, and what you did with it.
 */
export default function EditionRun({ paper }) {
  const grid = runGrid(paper);
  const tones = sectionTones(grid.sections);
  const news = newCountOf(paper.issues);
  return (
    <section className="edition-run" aria-labelledby="edition-run-title">
      <header className="edition-run__head">
        <h1 id="edition-run-title">{paper.title}</h1>
        <p>
          {[
            plural(paper.issues.length, paper.issueLabel.toLowerCase()),
            news ? `${news} new` : ''
          ].filter(Boolean).join(' · ')}
        </p>
      </header>
      <ol className="edition-run__issues">
        {grid.rows.map(({ issue, cells }) => (
          <li key={issue._id}>
            <Link to={`/editions/${encodeURIComponent(issue._id)}`} className="edition-run__issue">
              <span className="edition-run__number">
                {issueLine({ ...issue, issueLabel: paper.issueLabel }) || windowLine(issue)}
              </span>
              <span className="edition-run__body">
                <span className="edition-run__when">
                  {[issueLine(issue) ? windowLine(issue) : '', stateOf(issue) === 'filling' ? 'still filling' : ''].filter(Boolean).join(' · ')}
                </span>
                {issue.headline || issue.standfirst
                  ? <span className="edition-run__standfirst">{issue.headline || issue.standfirst}</span>
                  : null}
              </span>
              <RunMark cells={cells} tones={tones} />
              <span className={`edition-run__yours${issue.newCount ? ' is-new' : ''}`}>{yoursLine(issue)}</span>
            </Link>
          </li>
        ))}
      </ol>
      <Watching paper={paper} />
    </section>
  );
}

/**
 * The threads a paper keeps pulling: every line it said to watch, and the
 * newest word on what became of it. Open lines first; nothing is printed for
 * a paper that never kept a watch list.
 */
function Watching({ paper }) {
  const { open, settled } = watchThreads(paper.issues);
  if (!open.length && !settled.length) return null;
  const list = (threads, heading) => (threads.length ? (
    <div>
      <h3>{heading}</h3>
      <ul>
        {threads.map(({ watch, since, status, note }) => (
          <li key={watch}>
            <span className={`reading-status reading-status--${status}`}>{WATCH_STATUS[status]}</span>
            <Link to={`/editions/${encodeURIComponent(since._id)}`}>{watch}</Link>
            <small>{[issueLine({ ...since, issueLabel: paper.issueLabel }) || windowLine(since), note].filter(Boolean).join(' · ')}</small>
          </li>
        ))}
      </ul>
    </div>
  ) : null);
  return (
    <section className="edition-run__watching" aria-labelledby="edition-run-watching">
      <h2 id="edition-run-watching">What this paper is watching</h2>
      {list(open, 'Still open')}
      {list(settled, 'Settled')}
    </section>
  );
}

