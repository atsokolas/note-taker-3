import React, { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { disposeConsequence } from '../../api/dailyLoop';
import AriadneThread from '../judgment/AriadneThread';
import useMagneticRow from '../../hooks/useMagneticRow';
import { usePrefersReducedMotion } from '../../hooks/useMotionPreferences';
import { isPaperConsequence } from './morningPaperClose';
import '../../styles/judgment.css';

const VERBS = Object.freeze([
  { action: 'accept', label: 'Accept' },
  { action: 'narrow', label: 'Narrow' },
  { action: 'preserve', label: 'Preserve' },
  { action: 'reject', label: 'Reject' },
  { action: 'defer', label: 'Defer' }
]);

const tallyFor = (action) => ({
  accept: 'accepted · prior kept',
  narrow: 'narrowed · prior kept',
  preserve: 'preserved',
  reject: 'rejected',
  defer: 'deferred · review scheduled'
}[action] || action);

const MorningConsequence = ({ consequence, pulse = false, onSettled }) => {
  const reduced = usePrefersReducedMotion();
  const magnet = useMagneticRow();
  const passageRef = useRef(null);
  const claimRef = useRef(null);
  const [busy, setBusy] = useState('');
  const [inked, setInked] = useState('');
  const [tally, setTally] = useState('');
  const [narrowing, setNarrowing] = useState(false);
  const [narrowed, setNarrowed] = useState(consequence?.proposed || '');
  const [traceId, setTraceId] = useState('');
  const [ripple, setRipple] = useState(false);

  if (!isPaperConsequence(consequence)) return null;

  const run = async (action) => {
    if (busy || inked) return;
    if (action === 'narrow' && !narrowing) {
      setNarrowing(true);
      setNarrowed(consequence.proposed || '');
      return;
    }
    setBusy(action);
    try {
      const result = await disposeConsequence({
        preview: consequence,
        action,
        narrowedText: action === 'narrow' ? narrowed : ''
      });
      setInked(action);
      setTally(tallyFor(action));
      setRipple(action === 'accept' || action === 'narrow');
      if (result?.receipt?.id) setTraceId(result.receipt.id);
      onSettled?.(result);
    } catch (_error) {
      setBusy('');
    } finally {
      setBusy('');
    }
  };

  return (
    <section
      ref={magnet.rowRef}
      className={[
        'wiki-front-page__check-in',
        'morning-consequence',
        'paper-open__mono',
        pulse ? 'is-morning-pulse' : '',
        inked ? 'is-settled' : '',
        ripple && !reduced ? 'consequence-ripple' : ''
      ].filter(Boolean).join(' ')}
      aria-label="Morning consequence"
      onPointerMove={magnet.onPointerMove}
      onPointerLeave={magnet.onPointerLeave}
    >
      <p className="morning-consequence__fold">
        <span>What changed</span>
        {consequence.whatChanged}
      </p>
      <p className="morning-consequence__fold">
        <span>What it affects</span>
        {consequence.whatItAffects}
      </p>
      <p className="morning-consequence__fold">
        <span>What I need from you</span>
        {consequence.whatINeed}
      </p>

      <div className="morning-consequence__wording">
        <p ref={claimRef}>
          <span>Prior</span>
          {consequence.prior}
        </p>
        <p>
          <span>Proposed</span>
          {narrowing ? (
            <textarea
              aria-label="Narrow the proposed wording"
              value={narrowed}
              onChange={(event) => setNarrowed(event.target.value)}
              rows={2}
            />
          ) : consequence.proposed}
        </p>
      </div>

      <p className="morning-consequence__passage" ref={passageRef}>
        <Link to={consequence.passageHref || consequence.url || '#'}>
          The passage
        </Link>
      </p>

      {consequence.dependents?.length ? (
        <p className="morning-consequence__dependents">
          Also rests on this:
          {' '}
          {consequence.dependents.map((row) => row.claim).join(' · ')}
        </p>
      ) : null}

      <div className="wiki-front-page__check-in-verbs">
        {VERBS.map((verb) => (
          <button
            key={verb.action}
            type="button"
            className={inked === verb.action ? 'is-inked' : ''}
            disabled={Boolean(busy) || Boolean(inked)}
            onClick={() => run(verb.action)}
          >
            {verb.label}
          </button>
        ))}
      </div>
      {tally ? (
        <p className="wiki-front-page__check-in-tally" aria-live="polite">{tally}</p>
      ) : null}
      <AriadneThread
        traceId={traceId}
        sourceRef={passageRef}
        targetRef={claimRef}
      />
    </section>
  );
};

export default MorningConsequence;
