import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getJudgmentMirror } from '../api/judgmentResolution';
import '../styles/judgment.css';

const verdictLabel = { held_up: 'held up', broke: 'broke', partly: 'partly held', unresolvable: 'could not be resolved' };
const percent = value => Number.isFinite(Number(value)) ? `${Math.round(Number(value) * 100)}%` : '—';
const number = value => Number.isFinite(Number(value)) ? String(value) : '—';
const date = value => value ? new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '';

const JudgmentMirror = () => {
  const [mirror, setMirror] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    getJudgmentMirror()
      .then(value => { if (!cancelled) setMirror(value); })
      .catch(() => { if (!cancelled) setError('The Mirror could not read your casebook.'); });
    return () => { cancelled = true; };
  }, []);

  if (!mirror && !error) return <main className="judgment-mirror"><p role="status">Letting the ink settle…</p></main>;
  if (error) return <main className="judgment-mirror"><Link to="/judgment">← Judgment</Link><p role="alert">{error}</p></main>;
  const { metrics = {}, coverage = {}, due = [], verdicts = [] } = mirror;
  return (
    <main className="judgment-mirror" aria-labelledby="judgment-mirror-title">
      <Link className="judgment__back" to="/judgment">← Judgment</Link>
      <header>
        <p>The casebook looking back</p>
        <h1 id="judgment-mirror-title">The Mirror</h1>
        <p>No score. Just the shape of how you change your mind.</p>
      </header>
      <dl className="judgment-mirror__measure">
        <div><dt>Claims held</dt><dd>{number(metrics.claimsHeld)}</dd></div>
        <div><dt>Average hold</dt><dd>{metrics.averageHoldDays == null ? '—' : `${metrics.averageHoldDays} days`}</dd></div>
        <div><dt>Revised</dt><dd>{percent(metrics.revisionRate)}</dd></div>
        <div><dt>Verdicts</dt><dd>{Object.values(metrics.verdictRecord || {}).reduce((sum, value) => sum + Number(value || 0), 0)}</dd></div>
      </dl>
      {due.length ? (
        <section className="judgment-mirror__due">
          <h2>The date arrived</h2>
          {due.map(item => <Link key={item.pageId} to={`/judgment/${item.pageId}`}><span>{item.claim}</span><small>{date(item.horizonAt)}</small></Link>)}
        </section>
      ) : null}
      <section className="judgment-mirror__record">
        <h2>Verdict record</h2>
        {verdicts.length ? verdicts.map(verdict => (
          <article key={verdict.verdictId}>
            <Link to={`/judgment/${verdict.pageId}`}>{verdict.claim}</Link>
            <p>{verdictLabel[verdict.result] || verdict.result}{verdict.note ? ` — ${verdict.note}` : ''}</p>
            <time>{date(verdict.recordedAt)}</time>
          </article>
        )) : <p className="judgment-mirror__silence">No verdicts yet. The Mirror is allowed to be empty.</p>}
      </section>
      <footer>
        Birth dates stored for {coverage.storedBirthDates || 0} of {coverage.totalClaims || 0} claims.
        {coverage.responseTimeClaims ? '' : ' Counterevidence response time stays blank until the evidence clock is exact.'}
      </footer>
    </main>
  );
};

export default JudgmentMirror;
