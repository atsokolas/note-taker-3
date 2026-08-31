import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { getJudgmentMirror } from '../api/dailyLoop';
import { takeFirstPaint } from '../motion/columnMotion';
import { bandLine } from './institutionModel';
import '../styles/judgment.css';

const STAT_ORDER = ['held', 'holdTime', 'revisions', 'verdicts', 'counterEvidence'];
const VERDICT_LABEL = {
  held_up: 'held up',
  broke: 'broke',
  partly: 'partly held',
  unresolvable: 'could not be resolved',
  right_for_wrong_reasons: 'right for the wrong reasons'
};

const percent = (value) => (Number.isFinite(Number(value)) ? `${Math.round(Number(value) * 100)}%` : '—');
const number = (value) => (Number.isFinite(Number(value)) ? String(value) : '—');
const date = (value) => (
  value
    ? new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    : ''
);

const openStats = (stats = {}) => STAT_ORDER.map((key) => stats[key]).filter(Boolean);

const JudgmentMirror = () => {
  const [params] = useSearchParams();
  const stat = params.get('stat') || '';
  const [mirror, setMirror] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const arriving = useMemo(() => takeFirstPaint(`judgment-mirror:${stat || 'home'}`), [stat]);

  useEffect(() => {
    document.body.classList.add('judgment-route');
    return () => document.body.classList.remove('judgment-route');
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const next = await getJudgmentMirror({ stat });
        if (!cancelled) setMirror(next);
      } catch (_loadError) {
        if (!cancelled) setError('The Mirror could not be read.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [stat]);

  const step = (n) => (arriving ? `wfp-anim wfp-anim--${n}` : '');
  const ledger = mirror?.mirror || mirror || {};
  const stats = ledger.stats || mirror?.stats || {};
  const open = openStats(stats);
  const claims = Array.isArray(ledger.claims) ? ledger.claims : (Array.isArray(mirror?.claims) ? mirror.claims : []);
  const active = open.find((row) => row.id === stat) || null;
  const metrics = ledger.metrics || {};
  const coverage = ledger.coverage || {};
  const due = Array.isArray(ledger.due) ? ledger.due : [];
  const recorded = Array.isArray(ledger.verdicts) && !ledger.verdicts[0]?.href
    ? ledger.verdicts
    : [];
  const calibration = ledger.calibration || mirror?.calibration || null;
  const hasDoors = open.length > 0;
  const verdictCount = Object.values(metrics.verdictRecord || {}).reduce(
    (sum, value) => sum + Number(value || 0),
    0
  );

  return (
    <main className="judgment-mirror" aria-labelledby="judgment-mirror-title">
      <div className={`judgment__meta ${step(1)}`}>
        <Link className="judgment__back" to="/judgment">← Judgment</Link>
      </div>
      <header className={step(1)}>
        <p>The casebook looking back</p>
        <h1 id="judgment-mirror-title">The Mirror</h1>
        <p>No score. Just the shape of how you change your mind. Every number is a door.</p>
      </header>

      {loading ? <p className="judgment__quiet" role="status">Letting the ink settle…</p> : null}
      {error ? <p className="judgment__error" role="alert">{error}</p> : null}

      {mirror ? (
        <div className={step(2)}>
          {hasDoors ? (
            <ul className="mirror__stats">
              {open.map((row) => (
                <li key={row.id} className={row.id === stat ? 'is-open' : ''}>
                  <Link to={row.href}>
                    <span className="mirror__stat-label">{row.label}</span>
                    <span className="mirror__stat-value">{row.display}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <dl className="judgment-mirror__measure">
              <div><dt>Claims held</dt><dd>{number(metrics.claimsHeld)}</dd></div>
              <div><dt>Average hold</dt><dd>{metrics.averageHoldDays == null ? '—' : `${metrics.averageHoldDays} days`}</dd></div>
              <div><dt>Revised</dt><dd>{percent(metrics.revisionRate)}</dd></div>
              <div><dt>Verdicts</dt><dd>{verdictCount}</dd></div>
            </dl>
          )}

          {active ? (
            <section className="judgment-mirror__record" aria-labelledby="mirror-claims-title">
              <h2 id="mirror-claims-title">{active.label}</h2>
              {claims.length ? (
                <ul>
                  {claims.map((claim) => (
                    <li key={`${claim.pageId}:${claim.claimId || claim.verdictId || claim.href}`}>
                      <Link to={claim.href}>{claim.text}</Link>
                      {claim.verdict ? (
                        <span className="brief__row-note">{String(claim.verdict).replace('_', ' ')}</span>
                      ) : null}
                      {claim.days != null ? (
                        <span className="brief__row-note">{claim.days} days</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="judgment-mirror__silence">None yet.</p>
              )}
            </section>
          ) : null}

          {due.length ? (
            <section className="judgment-mirror__due">
              <h2>The date arrived</h2>
              {due.map((item) => (
                <Link key={item.pageId} to={`/judgment/${item.pageId}`}>
                  <span>{item.claim}</span>
                  <small>{date(item.horizonAt)}</small>
                </Link>
              ))}
            </section>
          ) : null}

          {!hasDoors || recorded.length || coverage.totalClaims != null ? (
            <section className="judgment-mirror__record">
              <h2>Verdict record</h2>
              {recorded.length ? recorded.map((verdict) => (
                <article key={verdict.verdictId || `${verdict.pageId}:${verdict.recordedAt}`}>
                  <Link to={`/judgment/${verdict.pageId}`}>{verdict.claim}</Link>
                  <p>{VERDICT_LABEL[verdict.result] || verdict.result}{verdict.note ? ` — ${verdict.note}` : ''}</p>
                  <time>{date(verdict.recordedAt)}</time>
                </article>
              )) : (
                <p className="judgment-mirror__silence">No verdicts yet. The Mirror is allowed to be empty.</p>
              )}
            </section>
          ) : null}

          {calibration?.private ? (
            <section className="judgment-mirror__calibration" aria-labelledby="mirror-calibration-title">
              <h2 id="mirror-calibration-title">How certainty met the later world</h2>
              <p className="judgment-mirror__selection">{calibration.selection}</p>
              {Array.isArray(calibration.byConfidence) ? calibration.byConfidence.map((band) => (
                <p key={band.confidence || 'band'}>{bandLine(band) || band.silence}</p>
              )) : null}
              {calibration.overall?.silence && !calibration.overall?.sufficient ? (
                <p className="judgment-mirror__silence">{calibration.overall.silence}</p>
              ) : null}
            </section>
          ) : null}

          {coverage.totalClaims != null ? (
            <footer>
              Birth dates stored for {coverage.storedBirthDates || 0} of {coverage.totalClaims || 0} claims.
              {coverage.responseTimeClaims ? '' : ' Counterevidence response time stays blank until the evidence clock is exact.'}
            </footer>
          ) : null}
        </div>
      ) : null}
    </main>
  );
};

export default JudgmentMirror;
