import React, { useEffect, useRef, useState } from 'react';
import { searchKeyword } from '../../../api/retrieval';
import { proposeMissingMiddle } from '../../../utils/questionMissingMiddle';

export default function QuestionMissingMiddle({
  boundQuestion = '',
  placed = [],
  excluded = [],
  onPlace,
  search = searchKeyword
}) {
  const [looking, setLooking] = useState(false);
  const [result, setResult] = useState(null);
  const [rejectedKeys, setRejectedKeys] = useState([]);
  const generation = useRef(0);

  useEffect(() => {
    generation.current += 1;
    setLooking(false);
    setResult(null);
    setRejectedKeys([]);
  }, [boundQuestion]);

  const ask = async (rejected = rejectedKeys) => {
    const gen = ++generation.current;
    setLooking(true);
    try {
      const next = await proposeMissingMiddle({
        question: boundQuestion,
        placed,
        excluded,
        rejectedKeys: rejected,
        search
      });
      if (gen !== generation.current) return;
      setResult(next);
    } catch (_failure) {
      if (gen !== generation.current) return;
      setResult({
        status: 'miss',
        here: boundQuestion,
        proposal: null,
        silence: 'Library search could not finish.'
      });
    } finally {
      if (gen === generation.current) setLooking(false);
    }
  };

  const rejectSimilar = () => {
    const key = result?.proposal?.key;
    if (!key) return;
    const nextRejected = [...rejectedKeys, key];
    setRejectedKeys(nextRejected);
    ask(nextRejected);
  };

  return (
    <section className="question-missing-middle" aria-label="What have I not connected here">
      <h3>What have I not connected here?</h3>
      <p className="question-missing-middle__lede">
        One missing premise, with both ends inspectable. Merely similar wording is not a connection.
      </p>
      <div className="question-missing-middle__actions">
        {looking ? (
          <p className="question-missing-middle__status">Looking for an unconnected premise.</p>
        ) : (
          <button type="button" onClick={() => ask()} disabled={!String(boundQuestion || '').trim()}>
            {result ? 'Look again' : 'Ask what is unconnected'}
          </button>
        )}
      </div>
      {!looking && result?.status === 'miss' ? (
        <p className="question-missing-middle__silence">{result.silence}</p>
      ) : null}
      {!looking && result?.status === 'found' && result.proposal ? (
        <div className="question-missing-middle__bridge">
          <p className="question-missing-middle__end">
            <span>Here</span>
            {result.here}
          </p>
          <p className="question-missing-middle__end">
            <span>There</span>
            {result.proposal.title}
          </p>
          <blockquote>{result.proposal.passage}</blockquote>
          <div className="question-missing-middle__actions">
            {result.proposal.href ? (
              <a href={result.proposal.href}>Open in Library</a>
            ) : null}
            <button type="button" onClick={() => onPlace?.(result.proposal)}>
              Place beside the question
            </button>
            <button type="button" onClick={rejectSimilar}>
              Not this — only similar
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
