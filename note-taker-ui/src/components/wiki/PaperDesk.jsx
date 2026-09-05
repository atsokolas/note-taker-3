import React from 'react';
import { Link } from 'react-router-dom';
import { deskClauses, shelfClause } from '../../pages/paperEditions';
import { lastWorkedWhen } from '../../pages/paperDesk';

/**
 * Where you left off: two operational lines, and nothing else.
 *
 * The card dealt off the shelf used to be a fourth line here, formatted
 * identically to the two above it — so a real story arrived looking like a
 * status. It is the headline now. A thing cannot lead the page and also be
 * its fourth line, and this section is the operating register: what you were
 * doing, and what is waiting.
 *
 * Everything here is a door. That is the whole change — the masthead used to
 * report that one thing was owed a move and give you no way to reach it, which
 * is a status board wearing a newspaper's clothes.
 *
 * Nothing is invented to fill a gap. A morning with no open case simply does
 * not mention cases, and a reader who has kept nothing is not told their shelf
 * is empty; they are told nothing at all, which is what an empty shelf sounds
 * like.
 */

const Door = ({ to, children }) => (
  <Link className="paper-desk__door" to={to}>{children}</Link>
);

const PaperDesk = ({
  lastWorked = null,
  openCase = null,
  later = null,
  setAside = null,
  kept = null,
  topics = []
}) => {
  const clauses = deskClauses({ later, setAside, topics });
  const shelf = shelfClause(kept);
  if (!lastWorked && !openCase && !clauses.length && !shelf) return null;

  return (
    <section className="paper-desk" aria-label="Where you left off">
      <p className="paper-desk__eyebrow">Where you left off</p>

      {/* Two facts about the same reader, so they share a sentence rather than
          stacking as two lines that both begin with a name. */}
      {lastWorked || openCase ? (
        <p className="paper-desk__line">
          {lastWorked ? (
            <>
              You were last in <Door to={lastWorked.href}>{lastWorked.text}</Door>
              {/* The page knows when. A day name is a memory in a way that a
                  count of days is not. */}
              {lastWorkedWhen(lastWorked.at) ? <> {lastWorkedWhen(lastWorked.at)}</> : null}
            </>
          ) : null}
          {lastWorked && openCase ? ', and ' : null}
          {openCase ? (
            <>
              <Door to={openCase.href}>{openCase.text}</Door> is still open
            </>
          ) : null}
          .
        </p>
      ) : null}

      {/* The desk is one sentence and the canon is another. The shelf has no
          clock on it, so it does not belong in a list of things that do. */}
      {clauses.length || shelf ? (
        <p className="paper-desk__line">
          {clauses.length ? (
            <>
              On your desk —{' '}
              {clauses.map((clause, index) => (
                <React.Fragment key={clause.key}>
                  {index ? ', ' : null}
                  <Door to={clause.href}>{clause.text}</Door>
                </React.Fragment>
              ))}
              .{shelf ? ' ' : null}
            </>
          ) : null}
          {shelf ? <><Door to={shelf.href}>{shelf.text}</Door>.</> : null}
        </p>
      ) : null}

    </section>
  );
};

export default PaperDesk;
