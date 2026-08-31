import React, { useMemo, useState } from 'react';
import { recordJudgmentVerdict, setJudgmentResolution } from '../../api/judgmentResolution';

const clean = value => String(value || '').trim();
const dateInput = value => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
};
const dateLabel = value => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
};
const verdictLabel = {
  held_up: 'Held up',
  broke: 'Broke',
  partly: 'Partly',
  unresolvable: 'Unresolvable'
};

/* The test and the verdict share one quiet threshold. This is deliberately not
   a form card: a belief meeting reality should feel like writing in the margin
   of the case, not configuring a workflow. */
const JudgmentResolution = ({ pageId, claim, judgment = {}, onSaved }) => {
  const [settingTest, setSettingTest] = useState(false);
  const [criteria, setCriteria] = useState(judgment.resolutionCriteria || '');
  const [horizon, setHorizon] = useState(dateInput(judgment.resolutionHorizonAt));
  const [choosingVerdict, setChoosingVerdict] = useState(false);
  const [result, setResult] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [newVerdictId, setNewVerdictId] = useState('');
  const verdicts = Array.isArray(judgment.verdicts) ? judgment.verdicts : [];
  const latest = verdicts.at(-1) || null;
  const due = useMemo(() => {
    if (!judgment.resolutionHorizonAt) return false;
    const horizonAt = new Date(judgment.resolutionHorizonAt).getTime();
    const setAt = new Date(judgment.resolutionSetAt || 0).getTime();
    const verdictAt = latest ? new Date(latest.recordedAt || 0).getTime() : 0;
    return Number.isFinite(horizonAt) && horizonAt <= Date.now() && verdictAt < setAt;
  }, [judgment.resolutionHorizonAt, judgment.resolutionSetAt, latest]);

  const run = async (action) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const response = await action();
      onSaved?.(response.judgment);
      return response;
    } catch (failure) {
      setError(failure?.response?.data?.error || failure?.message || 'That did not make it into the ledger.');
      return null;
    } finally {
      setBusy(false);
    }
  };

  const saveTest = async () => {
    if (!clean(criteria)) return;
    const response = await run(() => setJudgmentResolution({
      pageId,
      expectedClaim: claim,
      criteria,
      horizonAt: horizon ? new Date(`${horizon}T12:00:00`).toISOString() : null
    }));
    if (response) setSettingTest(false);
  };

  const saveVerdict = async () => {
    if (!result) return;
    const response = await run(() => recordJudgmentVerdict({
      pageId,
      expectedClaim: claim,
      result,
      note
    }));
    if (!response) return;
    setNewVerdictId(response.artifact?.verdictId || 'new');
    setChoosingVerdict(false);
    setResult('');
    setNote('');
  };

  return (
    <section className="judgment-resolution" aria-labelledby="judgment-resolution-title">
      <div className="judgment-resolution__heading">
        <h2 id="judgment-resolution-title">The test</h2>
        {judgment.resolutionCriteria && !settingTest ? (
          <button type="button" onClick={() => setSettingTest(true)}>Refine</button>
        ) : null}
      </div>

      {!judgment.resolutionCriteria && !settingTest ? (
        <button className="judgment-resolution__invitation" type="button" onClick={() => setSettingTest(true)}>
          What would change your mind — and by when?
        </button>
      ) : null}

      {settingTest ? (
        <div className="judgment-resolution__test">
          <label htmlFor="judgment-resolution-criteria">I would change my mind if</label>
          <textarea
            id="judgment-resolution-criteria"
            rows={2}
            value={criteria}
            onChange={event => setCriteria(event.target.value)}
            placeholder="Name the observable thing."
            autoFocus
          />
          <label className="judgment-resolution__date" htmlFor="judgment-resolution-horizon">
            By <input id="judgment-resolution-horizon" type="date" value={horizon} onChange={event => setHorizon(event.target.value)} />
          </label>
          <div className="judgment-resolution__actions">
            <button type="button" disabled={busy || !clean(criteria)} onClick={saveTest}>{busy ? 'Inking…' : 'Set the test'}</button>
            <button type="button" className="is-quiet" disabled={busy} onClick={() => setSettingTest(false)}>Not now</button>
          </div>
        </div>
      ) : judgment.resolutionCriteria ? (
        <p className="judgment-resolution__criteria">
          {judgment.resolutionCriteria}
          {judgment.resolutionHorizonAt ? <small>By {dateLabel(judgment.resolutionHorizonAt)}</small> : null}
        </p>
      ) : null}

      {judgment.resolutionCriteria && !choosingVerdict ? (
        <button className={`judgment-resolution__verdict-door${due ? ' is-due' : ''}`} type="button" onClick={() => setChoosingVerdict(true)}>
          {due ? 'The date arrived. What happened?' : 'Record what happened'}
        </button>
      ) : null}

      {choosingVerdict ? (
        <div className="judgment-resolution__verdict-form">
          <p>When this belief met the world, it…</p>
          <div className="judgment-resolution__choices" role="group" aria-label="Verdict">
            {Object.entries(verdictLabel).map(([value, label]) => (
              <button key={value} type="button" aria-pressed={result === value} onClick={() => setResult(value)}>{label}</button>
            ))}
          </div>
          <textarea rows={2} value={note} onChange={event => setNote(event.target.value)} placeholder="What did you observe? (optional)" />
          <div className="judgment-resolution__actions">
            <button type="button" disabled={busy || !result} onClick={saveVerdict}>{busy ? 'Inking…' : 'Record it'}</button>
            <button type="button" className="is-quiet" disabled={busy} onClick={() => setChoosingVerdict(false)}>Not now</button>
          </div>
        </div>
      ) : null}

      {latest ? (
        <p className={`judgment-resolution__latest${newVerdictId ? ' is-new' : ''}`} onAnimationEnd={() => setNewVerdictId('')}>
          <span aria-hidden="true" className="judgment-resolution__seal">◆</span>
          {verdictLabel[latest.result] || latest.result}
          {latest.note ? <span>{latest.note}</span> : null}
          <small>{dateLabel(latest.recordedAt)}</small>
        </p>
      ) : null}
      {error ? <p className="judgment-resolution__error" role="alert">{error}</p> : null}
    </section>
  );
};

export default JudgmentResolution;
