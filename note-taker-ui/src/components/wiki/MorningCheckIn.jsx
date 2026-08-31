import React, { useRef, useState } from 'react';
import { recordClaimCheckIn, recordClaimFalsifiability } from '../../api/dailyLoop';
import { ENTER_DURATION_MS, fileSentenceAway } from '../../motion/columnMotion';
import { usePrefersReducedMotion } from '../../hooks/useMotionPreferences';
import { formatCheckInTally } from './morningPaperClose';
import ClaimFalsifiabilityPrompt from './ClaimFalsifiabilityPrompt';

const heldDaysFrom = (iso) => {
  if (!iso) return 0;
  const start = new Date(iso).getTime();
  if (Number.isNaN(start)) return 0;
  return Math.max(0, Math.floor((Date.now() - start) / (24 * 60 * 60 * 1000)));
};

const tallyFrom = (result, checkIn, action) => {
  const history = Array.isArray(result?.claim?.history) ? result.claim.history : [];
  const count = history.filter((row) => (
    ['reaffirmed', 'revised'].includes(String(row?.action || row?.event || ''))
  )).length;
  return formatCheckInTally({
    action,
    count: count || 1,
    heldDays: heldDaysFrom(result?.claim?.bornAt || checkIn?.adoptedAt || result?.claim?.createdAt)
  });
};

const MorningCheckIn = ({ checkIn, pulse = false, onRetired }) => {
  const reduced = usePrefersReducedMotion();
  const blockRef = useRef(null);
  const [busy, setBusy] = useState('');
  const [inked, setInked] = useState('');
  const [tally, setTally] = useState('');
  const [filing, setFiling] = useState(false);
  const [gone, setGone] = useState(false);

  if (!checkIn || gone) return null;

  const run = async (action) => {
    if (busy || inked || filing) return;
    setBusy(action);
    try {
      const result = await recordClaimCheckIn({
        pageId: checkIn.pageId,
        claimId: checkIn.claimId,
        action
      });
      if (action === 'retired') {
        setFiling(true);
        const node = blockRef.current;
        if (node && !reduced) fileSentenceAway(node);
        const wait = reduced ? 0 : ENTER_DURATION_MS;
        if (wait) await new Promise((resolve) => window.setTimeout(resolve, wait));
        setGone(true);
        onRetired?.();
        return;
      }
      setInked(action);
      setTally(tallyFrom(result, checkIn, action));
    } catch (_error) {
      setBusy('');
    } finally {
      setBusy('');
    }
  };

  const keepCriteria = async ({ resolutionCriteria, horizon }) => {
    if (busy || filing) return;
    setBusy('criteria');
    try {
      await recordClaimFalsifiability({
        pageId: checkIn.pageId,
        claimId: checkIn.claimId,
        resolutionCriteria,
        horizon
      });
    } finally {
      setBusy('');
    }
  };

  return (
    <section
      ref={blockRef}
      className={[
        'wiki-front-page__check-in',
        'paper-open__mono',
        pulse ? 'is-morning-pulse' : '',
        inked ? 'is-settled' : '',
        filing ? 'is-filing' : ''
      ].filter(Boolean).join(' ')}
      aria-label="Morning check-in"
    >
      <p className={`wiki-front-page__check-in-claim${filing ? ' is-struck' : ''}`}>
        {checkIn.text}
      </p>
      <div className="wiki-front-page__check-in-verbs">
        <button
          type="button"
          className={inked === 'reaffirmed' ? 'is-inked' : ''}
          disabled={Boolean(busy) || Boolean(inked) || filing}
          onClick={() => run('reaffirmed')}
        >
          Still hold
        </button>
        <button
          type="button"
          disabled={Boolean(busy) || Boolean(inked) || filing}
          onClick={() => run('retired')}
        >
          Retire
        </button>
      </div>
      {tally ? (
        <p className="wiki-front-page__check-in-tally" aria-live="polite">{tally}</p>
      ) : null}
      <ClaimFalsifiabilityPrompt
        criteria={checkIn.resolutionCriteria || ''}
        horizon={checkIn.horizon || ''}
        busy={Boolean(busy) || filing}
        onKeep={keepCriteria}
      />
    </section>
  );
};

export default MorningCheckIn;
