import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listEditions } from '../api/editions';
import { agentRunLine, gapLine, issueLine, takenLine, windowLine } from './editionModel';

/**
 * The newsstand.
 *
 * Papers your agents maintain for you. Noeis writes none of them — whichever
 * agent you already use files them — and this is where they land so they are
 * something you read on a Sunday rather than something that scrolled past in
 * a chat window and was gone.
 *
 * Every row says the two things that matter about a week: what it left empty,
 * and how much of it you took.
 */
const Editions = () => {
  const [editions, setEditions] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      setEditions(await listEditions());
    } catch (loadError) {
      setEditions([]);
      setError(loadError?.response?.data?.error || 'The newsstand did not answer.');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="editions" data-testid="editions-stand">
      <header className="editions__masthead">
        <div className="editions__eyebrow">Editions</div>
        <p className="editions__definition">
          Papers your agents maintain for you. Noeis holds them to a shape; it does not write them.
        </p>
      </header>

      {error ? <p className="status-message error-message">{error}</p> : null}

      {/* Nothing on the stand yet is not the same as nothing loaded. */}
      {editions === null && !error ? (
        <p className="editions__quiet" role="status">Opening the stand…</p>
      ) : null}

      {editions?.length === 0 ? (
        <section className="editions__empty">
          <h2>No paper yet.</h2>
          <p>
            Connect an agent and ask it for one. Any of them will do — Claude, Codex,
            Cursor, OpenClaw, Hermes — once <code>noeis connect</code> has pointed it here.
          </p>
          <p className="editions__aside">
            Try: <em>“keep a This Week in AI for me, and file it here every Sunday.”</em>
          </p>
        </section>
      ) : null}

      {/* The one fact on the stand about the agent rather than the reading,
          and the reason to trust the next one. */}
      {agentRunLine(editions || []) ? (
        <p className="editions__run">{agentRunLine(editions || [])}</p>
      ) : null}

      <ol className="editions__list">
        {(editions || []).map((edition) => {
          const issue = issueLine(edition);
          const gap = gapLine(edition);
          return (
            <li key={edition._id} className="editions__row">
              <Link className="editions__row-link" to={`/editions/${edition._id}`}>
                <span className="editions__row-title">{edition.title}</span>
                <span className="editions__row-meta">
                  {[windowLine(edition), issue].filter(Boolean).join(' · ')}
                </span>
              </Link>
              <p className="editions__row-lines">
                <span>{takenLine(edition)}</span>
                {/* An empty section is an editorial fact, not an error. */}
                {gap ? <span className="editions__row-gap">{gap}</span> : null}
              </p>
              {edition.writtenBy ? (
                <p className="editions__row-byline">Written by {edition.writtenBy}</p>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
};

export default Editions;
