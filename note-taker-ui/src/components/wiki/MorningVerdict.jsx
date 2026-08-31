import React, { useRef, useState } from 'react';
import { recordClaimVerdict } from '../../api/dailyLoop';
import { formatVerdictTally } from './morningPaperClose';

const VERBS = Object.freeze([
  { verdict: 'held_up', label: 'Held up' },
  { verdict: 'broke', label: 'Broke' },
  { verdict: 'partly', label: 'Partly' },
  { verdict: 'unresolvable', label: 'Unresolvable' }
]);

const reasonLine = (ask) => {
  if (ask?.trigger === 'evidence') return 'A watcher landed evidence.';
  if (ask?.horizon) return 'The horizon you named has arrived.';
  return '';
};

const MorningVerdict = ({ ask, pulse = false, onSettled }) => {
  const blockRef = useRef(null);
  const [busy, setBusy] = useState('');
  const [inked, setInked] = useState('');
  const [tally, setTally] = useState('');

  if (!ask) return null;

  const run = async (verdict) => {
    if (busy || inked) return;
    setBusy(verdict);
    try {
      const result = await recordClaimVerdict({
        pageId: ask.pageId,
        claimId: ask.claimId,
        verdict,
        trigger: ask.trigger,
        sourceEventId: ask.sourceEventId || ''
      });
      setInked(verdict);
      setTally(formatVerdictTally({
        verdict,
        trigger: ask.trigger,
        count: Array.isArray(result?.claim?.verdicts) ? result.claim.verdicts.length : 1
      }));
      onSettled?.(ask);
    } catch (_error) {
      setBusy('');
    } finally {
      setBusy('');
    }
  };

  const reason = reasonLine(ask);

  return (
    <section
      ref={blockRef}
      className={[
        'wiki-front-page__check-in',
        'wiki-front-page__verdict',
        'paper-open__mono',
        pulse ? 'is-morning-pulse' : '',
        inked ? 'is-settled' : ''
      ].filter(Boolean).join(' ')}
      aria-label="Morning verdict"
    >
      {reason ? <p className="wiki-front-page__check-in-reason">{reason}</p> : null}
      <p className="wiki-front-page__check-in-claim">{ask.text}</p>
      {ask.resolutionCriteria ? (
        <p className="wiki-front-page__check-in-criteria">{ask.resolutionCriteria}</p>
      ) : null}
      <div className="wiki-front-page__check-in-verbs">
        {VERBS.map((verb) => (
          <button
            key={verb.verdict}
            type="button"
            className={inked === verb.verdict ? 'is-inked' : ''}
            disabled={Boolean(busy) || Boolean(inked)}
            onClick={() => run(verb.verdict)}
          >
            {verb.label}
          </button>
        ))}
      </div>
      {tally ? (
        <p className="wiki-front-page__check-in-tally" aria-live="polite">{tally}</p>
      ) : null}
    </section>
  );
};

export default MorningVerdict;
