import React from 'react';
import { historyEvents } from '../../pages/judgmentHistory';

const EventRow = ({ event }) => {
  const head = (
    <>
      {event.when ? <time className="judgment-history__when">{event.when}</time> : null}
      <span className="judgment-history__teaser">{event.teaser}</span>
    </>
  );
  const opens = Boolean(event.detail) && event.detail !== event.teaser;
  if (!opens) {
    return <li className="judgment-history__event">{head}</li>;
  }
  return (
    <li className="judgment-history__event">
      <details>
        <summary>{head}</summary>
        <p>{event.detail}</p>
      </details>
    </li>
  );
};

const Fold = ({ label, children }) => (
  <details className="judgment-history__fold">
    <summary>{label}</summary>
    {children}
  </details>
);

/**
 * The record under the case: a short spine of what happened, then the
 * machines you can still open. Native <details> is the click; nothing here
 * is a second heading for a panel that already has a name.
 */
const JudgmentHistory = ({
  view,
  rests = [],
  ledger = null,
  room = null,
  dependencies = null
}) => {
  const events = historyEvents({ view });
  const restsLabel = rests.length
    ? (rests.length === 1 ? 'Rests on one claim' : `Rests on ${rests.length} claims`)
    : 'Stands on its own';

  return (
    <div className="judgment-history">
      {events.length ? (
        <ol className="judgment-history__spine" aria-label="What has happened">
          {events.map((event) => <EventRow key={event.id} event={event} />)}
        </ol>
      ) : null}
      {ledger}
      {room ? <Fold label="Who sat with it">{room}</Fold> : null}
      {dependencies ? <Fold label={restsLabel}>{dependencies}</Fold> : null}
      {!events.length && !ledger ? (
        <p className="judgment-history__empty">Nothing written down yet.</p>
      ) : null}
    </div>
  );
};

export default JudgmentHistory;
