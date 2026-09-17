import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
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
import { abbreviateLine } from '../../pages/judgmentHistory';

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

/**
 * One mark on the ledger, abbreviated on the spine.
 *
 * The date used to lead the row while the sentence sat underneath it — a
 * column of timestamps. Then the sentence led, and the day sat beside it.
 * Now the row is a date and a short line; the rest waits behind a click.
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
  const teaser = abbreviateLine(fact.summary || explained.label);
  const head = (
    <>
      {explained.when ? <time className="judgment-history__when">{explained.when}</time> : null}
      <span className="judgment-history__teaser">{teaser}</span>
    </>
  );
  const opens = Boolean((fact.summary && fact.summary !== teaser) || notes);
  if (!opens) {
    return <li className={`judgment-history__event judgment-clock judgment-clock--${fact.clock}`}>{head}</li>;
  }
  return (
    <li className={`judgment-history__event judgment-clock judgment-clock--${fact.clock}`}>
      <details>
        <summary>{head}</summary>
        {fact.summary && fact.summary !== teaser ? (
          <p className="judgment-clock__summary">{fact.summary}</p>
        ) : null}
        {explained.label && explained.label !== teaser ? (
          <p className="judgment-clock__name">{explained.label}</p>
        ) : null}
        {notes ? <p className="judgment-clock__stamp"><small>{notes}</small></p> : null}
      </details>
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

const JudgmentLedger = ({ pageId, claim, page, judgment = {}, destinations = [], onSaved }) => {
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
  const [transferLessonId, setTransferLessonId] = useState('');
  const [destinationId, setDestinationId] = useState('');
  const [difference, setDifference] = useState('');
  const [transferReceipt, setTransferReceipt] = useState('');

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
  const lessons = Array.isArray(judgment?.lessons) ? judgment.lessons : [];
  const carriedLessons = useMemo(() => {
    const latest = new Map();
    (Array.isArray(judgment?.lessonApplications) ? judgment.lessonApplications : [])
      .forEach(application => latest.set(application.applicationId, application));
    return Array.from(latest.values()).filter(application => (
      application.status === 'accepted' || application.status === 'narrowed'
    ));
  }, [judgment?.lessonApplications]);

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

  const carryLesson = async () => {
    const source = lessons.find(item => item.lessonId === transferLessonId);
    const destination = destinations.find(item => String(item.id) === String(destinationId));
    if (!source || !destination || busy) return;
    setBusy(true);
    setError('');
    setTransferReceipt('');
    try {
      await resolveJudgmentLesson({
        pageId: destination.id,
        expectedClaim: destination.sentence,
        lessonId: source.lessonId,
        sourcePageId: pageId,
        status: 'accepted',
        note: difference,
        relevance: 'chosen by the owner',
        explicitTransfer: true
      });
      setTransferReceipt(`Kept beside ${destination.headline || destination.sentence}.`);
      setTransferLessonId('');
      setDestinationId('');
      setDifference('');
    } catch (failure) {
      setError(failure?.response?.data?.error || failure?.message || 'That lesson was not carried over.');
    } finally {
      setBusy(false);
    }
  };

  const detachLesson = async application => {
    await run(() => resolveJudgmentLesson({
      pageId,
      expectedClaim: claim,
      applicationId: application.applicationId,
      lessonId: application.lessonId,
      sourcePageId: application.sourcePageId,
      status: 'retired',
      note: application.note,
      relevance: application.relevance,
      explicitTransfer: true
    }));
  };

  if (!clocks.length && !postmortem && !lessons.length && !carriedLessons.length && !replay.frames.length) return null;

  return (
    <section
      className={`judgment-ledger${traveling ? ' is-traveling' : ''}${reduced ? ' is-still' : ''}`}
      aria-labelledby="judgment-ledger-title"
      tabIndex={0}
      onKeyDown={onKey}
    >
      <h2 id="judgment-ledger-title">The ledger</h2>

      {clocks.length ? (
        <ol className="judgment-history__spine judgment-clocks" aria-label="Five clocks">
          {clocks.map((fact) => (
            <ClockLine key={fact.factId || `${fact.clock}:${fact.recordedAt}`} fact={fact} />
          ))}
        </ol>
      ) : null}

      {moments.length > 1 ? (
        <details className="judgment-history__fold">
          <summary>Look back</summary>
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
        </details>
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

      {lessons.length && destinations.length ? (
        <div className="judgment-lessons-forward">
          <h3>Lessons from this case</h3>
          {lessons.map(item => (
            <article key={item.lessonId}>
              <p>{item.text}</p>
              {transferLessonId === item.lessonId ? (
                <div className="judgment-lesson-transfer">
                  <label>Keep this beside
                    <select value={destinationId} onChange={event => setDestinationId(event.target.value)}>
                      <option value="">Choose another case</option>
                      {destinations.map(destination => (
                        <option key={destination.id} value={destination.id}>
                          {destination.headline || destination.sentence}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>What might be different here?
                    <input value={difference} onChange={event => setDifference(event.target.value)} placeholder="Optional context in your words" />
                  </label>
                  <div className="judgment-resolution__actions">
                    <button type="button" disabled={busy || !destinationId} onClick={carryLesson}>Keep it beside that case</button>
                    <button type="button" className="is-quiet" disabled={busy} onClick={() => setTransferLessonId('')}>Never mind</button>
                  </div>
                </div>
              ) : (
                <button type="button" className="is-quiet" onClick={() => setTransferLessonId(item.lessonId)}>
                  Keep this beside another case
                </button>
              )}
            </article>
          ))}
          {transferReceipt ? <p role="status">{transferReceipt}</p> : null}
        </div>
      ) : null}

      {carriedLessons.length ? (
        <div className="judgment-lessons-carried">
          <h3>Brought from another decision</h3>
          {carriedLessons.map(application => (
            <article key={`${application.applicationId}:${application.receiptId}`}>
              <p>{application.narrowedText || application.sourceText}</p>
              <small>You brought this from an earlier decision. Your lesson, not new evidence.</small>
              {application.note ? <p>What might be different here: {application.note}</p> : null}
              <details>
                <summary>What this lesson came from</summary>
                {application.sourceHeldView ? <p>View then: {application.sourceHeldView}</p> : null}
                {application.sourceCriterionSnapshot ? <p>Test then: {application.sourceCriterionSnapshot}</p> : null}
                {application.sourceResultSnapshot ? <p>What happened there: {application.sourceResultSnapshot}</p> : null}
                {!application.sourceHeldView && !application.sourceCriterionSnapshot && !application.sourceResultSnapshot
                  ? <p>The earlier basis was not retained in this legacy link.</p>
                  : null}
              </details>
              <div className="judgment-resolution__actions">
                <Link to={`/judgment/${application.sourcePageId}`}>Open the earlier case</Link>
                <button type="button" className="is-quiet" disabled={busy} onClick={() => detachLesson(application)}>Detach</button>
              </div>
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
