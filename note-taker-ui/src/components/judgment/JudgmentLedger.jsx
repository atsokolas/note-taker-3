import React, { useCallback, useEffect, useMemo, useState } from 'react';
import CalendarMark from '../CalendarMark';
import { usePrefersReducedMotion } from '../../hooks/useMotionPreferences';
import {
  getJudgmentLedger,
  recordJudgmentOutcome,
  resolveJudgmentLesson
} from '../../api/judgmentResolution';
import {
  CLOCK_LABEL,
  VERDICT_LABEL,
  cursorIndex,
  explainDate,
  isNow,
  momentsFrom,
  postmortemFor,
  reconstructAt,
  replayDecision
} from '../../pages/judgmentLedgerModel';

const CONFIDENCE = [
  { id: '', label: 'Silent' },
  { id: 'uncertain', label: 'Uncertain' },
  { id: 'probable', label: 'Probable' },
  { id: 'certain', label: 'Certain' }
];

const RESULT = [
  { id: 'held', label: 'It held' },
  { id: 'missed', label: 'It missed' },
  { id: 'mixed', label: 'Mixed' },
  { id: 'silent', label: 'Leave it' }
];

const RESOLVE = [
  { id: 'accepted', label: 'Keep it here' },
  { id: 'narrowed', label: 'Narrow it' },
  { id: 'rejected', label: 'Not this case' },
  { id: 'retired', label: 'Retire it' }
];

/**
 * One entry in the ledger: what happened, and roughly when.
 *
 * The date used to lead the row at 1.15rem while the sentence it dates sat
 * underneath it in body text — so a page of the ledger read as a column of
 * timestamps with commentary. It is the other way round. The sentence is what
 * you came for; the day is the stamp beside it.
 *
 * A row with no day gets no stamp rather than the word "Sometime". The
 * precision note already says the day is not known, and saying it twice in
 * two registers is not more honest, only louder.
 */
const ClockLine = ({ fact }) => {
  const explained = fact.explained || explainDate(fact);
  if (!explained.when && !fact.summary) return null;
  const notes = [
    explained.author,
    explained.precisionNote,
    explained.lateNote,
    explained.causalKind === 'inference' ? 'Inference' : ''
  ].filter(Boolean).join(' · ');
  return (
    <li className={`judgment-clock judgment-clock--${fact.clock}`}>
      <span className="judgment-clock__name">{explained.label}</span>
      {fact.summary ? <span className="judgment-clock__summary">{fact.summary}</span> : null}
      <span className="judgment-clock__stamp">
        {explained.when ? (
          <span className="judgment-clock__when">
            <CalendarMark />
            {explained.when}
          </span>
        ) : null}
        {notes ? <small>{notes}</small> : null}
      </span>
    </li>
  );
};

const Trace = ({ reconstructed }) => {
  if (!reconstructed?.known) {
    return <p className="judgment-trace__silence">{reconstructed?.reason || 'The paper is blank here.'}</p>;
  }
  return (
    <div className="judgment-trace__sheet">
      {reconstructed.claim ? <p className="judgment-trace__claim">{reconstructed.claim}</p> : null}
      {reconstructed.posture ? <p className="judgment-trace__posture">{reconstructed.posture}</p> : null}
      {reconstructed.evidence?.why?.length ? (
        <p><span>Then believed</span>{reconstructed.evidence.why.join(' ')}</p>
      ) : null}
      {reconstructed.evidence?.against?.length ? (
        <p><span>Then against</span>{reconstructed.evidence.against.join(' ')}</p>
      ) : null}
      {reconstructed.questions?.length ? (
        <p><span>Then asked</span>{reconstructed.questions.join(' ')}</p>
      ) : null}
      {reconstructed.citations?.map((citation) => (
        <small key={citation.id} className={citation.resolved ? '' : 'is-absent'}>
          {citation.resolved ? citation.label : citation.absence}
        </small>
      ))}
    </div>
  );
};

const JudgmentLedger = ({ pageId, claim, page, judgment = {}, onSaved }) => {
  const reduced = usePrefersReducedMotion();
  const [ledger, setLedger] = useState(null);
  const [at, setAt] = useState('');
  const [frame, setFrame] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [answer, setAnswer] = useState('');
  const [lesson, setLesson] = useState('');
  const [confidence, setConfidence] = useState('');
  const [result, setResult] = useState('');
  const [narrowed, setNarrowed] = useState('');

  const moments = useMemo(() => momentsFrom(ledger || {}, page), [ledger, page]);
  const traveling = Boolean(at) && !isNow(moments, at);
  const reconstructed = useMemo(() => {
    if (ledger?.reconstructed && ledger.reconstructed.at === at) return ledger.reconstructed;
    return reconstructAt({ page, at: at || moments[moments.length - 1] });
  }, [ledger, page, at, moments]);
  const replay = useMemo(() => replayDecision(page, ledger || {}), [page, ledger]);
  const postmortem = postmortemFor(judgment, ledger || {});
  const clocks = (Array.isArray(ledger?.clocks) && ledger.clocks.length)
    ? ledger.clocks
    : (Array.isArray(judgment?.clocks) ? judgment.clocks : []);
  const proposals = Array.isArray(ledger?.proposals) && ledger.proposals.length
    ? ledger.proposals
    : (Array.isArray(ledger?.lessons) ? ledger.lessons : []);

  const load = useCallback(async (instant = '') => {
    if (!pageId) return;
    try {
      const next = await getJudgmentLedger({ pageId, at: instant });
      setLedger(next);
      if (!instant && Array.isArray(next?.moments) && next.moments.length) {
        setAt(next.moments[next.moments.length - 1]);
      }
    } catch (_loadError) {
      setError('The ledger could not be read.');
    }
  }, [pageId]);

  useEffect(() => {
    let ignore = false;
    (async () => {
      if (!pageId) return;
      try {
        const next = await getJudgmentLedger({ pageId, at: '' });
        if (ignore) return;
        setLedger(next);
        if (Array.isArray(next?.moments) && next.moments.length) {
          setAt(next.moments[next.moments.length - 1]);
        }
      } catch (_loadError) {
        if (!ignore) setError('The ledger could not be read.');
      }
    })();
    return () => { ignore = true; };
  }, [pageId, judgment?.verdicts?.length, judgment?.outcomes?.length, judgment?.clocks?.length]);

  const move = (delta) => {
    if (!moments.length) return;
    const index = Math.min(moments.length - 1, Math.max(0, cursorIndex(moments, at) + delta));
    setAt(moments[index]);
  };

  const onKey = (event) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      move(-1);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      move(1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      setAt(moments[0] || '');
    } else if (event.key === 'End') {
      event.preventDefault();
      setAt(moments[moments.length - 1] || '');
    } else if (event.key === ' ' && replay.frames.length) {
      event.preventDefault();
      setFrame((current) => (current + 1) % replay.frames.length);
    }
  };

  const run = async (action) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const response = await action();
      onSaved?.(response.judgment);
      await load(at);
      return response;
    } catch (failure) {
      setError(failure?.response?.data?.error || failure?.message || 'That did not make it into the ledger.');
      return null;
    } finally {
      setBusy(false);
    }
  };

  const saveOutcome = async (silent = false) => {
    const response = await run(() => recordJudgmentOutcome({
      pageId,
      expectedClaim: claim,
      result: silent ? 'silent' : result,
      silence: silent || result === 'silent',
      answer: silent ? '' : answer,
      lesson: silent ? '' : lesson,
      confidence: silent ? '' : confidence,
      verdictId: postmortem?.verdictId
    }));
    if (response) {
      setAnswer('');
      setLesson('');
      setResult('');
    }
  };

  const resolveProposal = async (proposal, status) => {
    await run(() => resolveJudgmentLesson({
      pageId,
      expectedClaim: claim,
      applicationId: proposal.applicationId,
      lessonId: proposal.lessonId,
      sourcePageId: proposal.sourcePageId,
      sourceText: proposal.text,
      status,
      narrowedText: status === 'narrowed' ? narrowed : '',
      relevance: proposal.relevance
    }));
  };

  if (!clocks.length && !postmortem && !proposals.length && !replay.frames.length) return null;

  return (
    <section
      className={`judgment-ledger${traveling ? ' is-traveling' : ''}${reduced ? ' is-still' : ''}`}
      aria-labelledby="judgment-ledger-title"
      tabIndex={0}
      onKeyDown={onKey}
    >
      <h2 id="judgment-ledger-title">The ledger</h2>

      {clocks.length ? (
        <ol className="judgment-clocks" aria-label="Five clocks">
          {clocks.map((fact) => (
            <ClockLine key={fact.factId || `${fact.clock}:${fact.recordedAt}`} fact={fact} />
          ))}
        </ol>
      ) : null}

      {moments.length > 1 ? (
        <div className="judgment-time">
          <label htmlFor="judgment-time-cursor">Belief at this moment</label>
          <input
            id="judgment-time-cursor"
            type="range"
            min={0}
            max={moments.length - 1}
            value={cursorIndex(moments, at)}
            onChange={(event) => setAt(moments[Number(event.target.value)] || '')}
            aria-valuetext={reconstructed?.at || 'now'}
          />
          <p className="judgment-time__caption">
            {traveling ? 'Tracing paper over the living case.' : 'This is the living case.'}
          </p>
        </div>
      ) : null}

      {traveling ? (
        <div className="judgment-trace" aria-live="polite">
          <Trace reconstructed={reconstructed} />
        </div>
      ) : null}

      {replay.frames.length ? (
        <div className="judgment-replay" aria-label="Decision replay">
          <p className="judgment-replay__summary">{replay.summary || 'Evidence, then a decision, then what followed.'}</p>
          <ol>
            {replay.frames.map((row, index) => (
              <li
                key={row.factId}
                className={[
                  row.pivotal ? 'is-pivotal' : '',
                  index === frame ? 'is-open' : ''
                ].filter(Boolean).join(' ')}
              >
                <button type="button" onClick={() => setFrame(index)}>
                  <span>{row.label || CLOCK_LABEL[row.clock]}</span>
                  <span>{row.summary}</span>
                  {row.causalKind === 'inference' ? <small>Inference</small> : null}
                  {row.source?.resolved ? <small>{row.source.label}</small> : null}
                  {row.source && !row.source.resolved ? <small>{row.source.absence || 'Source not on the case.'}</small> : null}
                </button>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      {postmortem ? (
        <div className="judgment-postmortem">
          <p>{postmortem.question}</p>
          <div className="judgment-resolution__choices" role="group" aria-label="Outcome">
            {RESULT.map((row) => (
              <button key={row.id} type="button" aria-pressed={result === row.id} onClick={() => setResult(row.id)}>
                {row.label}
              </button>
            ))}
          </div>
          {result && result !== 'silent' ? (
            <>
              <textarea rows={2} value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder="One sentence is enough." />
              <textarea rows={2} value={lesson} onChange={(event) => setLesson(event.target.value)} placeholder="A lesson, if there is one." />
              <div className="judgment-resolution__choices" role="group" aria-label="Confidence">
                {CONFIDENCE.map((row) => (
                  <button key={row.id || 'silent'} type="button" aria-pressed={confidence === row.id} onClick={() => setConfidence(row.id)}>
                    {row.label}
                  </button>
                ))}
              </div>
            </>
          ) : null}
          <div className="judgment-resolution__actions">
            <button type="button" disabled={busy || (!result && !answer)} onClick={() => saveOutcome(result === 'silent')}>
              {busy ? 'Inking…' : 'Record what followed'}
            </button>
            <button type="button" className="is-quiet" disabled={busy} onClick={() => saveOutcome(true)}>Leave it in silence</button>
          </div>
        </div>
      ) : null}

      {proposals.length ? (
        <div className="judgment-lessons-forward">
          <h3>A lesson from a settled case</h3>
          {proposals.map((proposal) => (
            <article key={proposal.applicationId}>
              <p>{proposal.text}</p>
              <small>Proposed from “{proposal.sourceClaim}” · {proposal.relevance}. Not asserted.</small>
              {proposal.status === 'proposed' ? (
                <div className="judgment-resolution__actions">
                  {RESOLVE.map((row) => (
                    <button
                      key={row.id}
                      type="button"
                      disabled={busy}
                      onClick={() => resolveProposal(proposal, row.id)}
                    >
                      {row.label}
                    </button>
                  ))}
                </div>
              ) : null}
              {proposal.status === 'proposed' ? (
                <input
                  value={narrowed}
                  onChange={(event) => setNarrowed(event.target.value)}
                  placeholder="Narrow the wording, if it only partly applies."
                />
              ) : null}
            </article>
          ))}
        </div>
      ) : null}

      {judgment?.outcomes?.length ? (
        <ul className="judgment-outcomes">
          {judgment.outcomes.map((outcome) => (
            <li key={outcome.outcomeId}>
              <span>{outcome.silence ? 'Left in silence.' : outcome.answer || outcome.result}</span>
              {outcome.lesson ? <span>{outcome.lesson}</span> : null}
              {outcome.verdictSnapshot ? (
                <small>The original verdict remains {VERDICT_LABEL[outcome.verdictSnapshot] || outcome.verdictSnapshot}.</small>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {error ? <p className="judgment-resolution__error" role="alert">{error}</p> : null}
    </section>
  );
};

export default JudgmentLedger;
