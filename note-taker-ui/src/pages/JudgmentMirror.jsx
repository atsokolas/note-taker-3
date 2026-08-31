import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { getJudgmentMirror } from '../api/dailyLoop';
import { takeFirstPaint } from '../motion/columnMotion';
import '../styles/judgment.css';

const STAT_ORDER = ['held', 'holdTime', 'revisions', 'verdicts', 'counterEvidence'];

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
  const stats = mirror?.stats || {};
  const open = STAT_ORDER.map((key) => stats[key]).filter(Boolean);
  const claims = Array.isArray(mirror?.claims) ? mirror.claims : [];
  const active = open.find((row) => row.id === stat) || null;

  return (
    <main className="judgment mirror" aria-labelledby="mirror-title">
      <div className={`judgment__meta ${step(1)}`}>
        <Link className="judgment__back" to="/judgment">← All judgments</Link>
      </div>
      <h1 className="brief__title" id="mirror-title">How good is my judgment?</h1>

      {loading ? <p className="judgment__quiet" role="status">Reading the ledger…</p> : null}
      {error ? <p className="judgment__error" role="alert">{error}</p> : null}

      {mirror ? (
        <div className={`brief__body ${step(2)}`}>
          <p className="brief__opening">
            {mirror.stats?.held?.value
              ? 'The claims you still hold, how long they have lasted, and what you did when the world answered back.'
              : 'Nothing on the ledger yet. Hold a sentence, and this page will have something to say.'}
          </p>

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

          {active ? (
            <section className="brief__section" aria-labelledby="mirror-claims-title">
              <h2 id="mirror-claims-title">{active.label}</h2>
              {claims.length ? (
                <ul>
                  {claims.map((claim) => (
                    <li key={`${claim.pageId}:${claim.claimId}`}>
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
                <p className="brief__section-note">None yet.</p>
              )}
            </section>
          ) : null}
        </div>
      ) : null}
    </main>
  );
};

export default JudgmentMirror;
