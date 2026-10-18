import React, { useEffect, useState } from 'react';
import { usePrefersReducedMotion } from '../../hooks/useMotionPreferences';
import { returnGreetingHighlight } from './returnGreeting';

const STAY_MS = 7000;
const SETTLE_MS = 700;

/* The line you marked last time, in pull-quote type at the top, before it
   settles away. With reduced motion it simply stays for this visit. */
export default function ReturnGreeting({ article, highlights, arrival, contentRef }) {
  const reduced = usePrefersReducedMotion();
  /* When you were last here, as the server said on this open. Mounted per
     piece, so a later refetch cannot turn a return into a refresh. */
  const [lastOpenedAt] = useState(article?.lastOpenedAt || null);
  const [chosen, setChosen] = useState(null);
  const [phase, setPhase] = useState('shown');

  useEffect(() => {
    if (chosen || arrival !== 'none') return;
    setChosen(returnGreetingHighlight({ highlights, lastOpenedAt }));
  }, [arrival, chosen, highlights, lastOpenedAt]);

  useEffect(() => {
    if (!chosen || reduced) return undefined;
    const settle = window.setTimeout(() => setPhase('settling'), STAY_MS);
    const gone = window.setTimeout(() => setPhase('gone'), STAY_MS + SETTLE_MS);
    return () => {
      window.clearTimeout(settle);
      window.clearTimeout(gone);
    };
  }, [chosen, reduced]);

  if (!chosen || phase === 'gone') return null;
  const mark = () => contentRef?.current?.querySelector(`[data-highlight-id="highlight-${chosen._id}"]`);
  const open = () => mark()?.scrollIntoView?.({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
  return (
    <figure
      className={`return-greeting${phase === 'settling' ? ' is-settling' : ''}`}
      data-testid="return-greeting"
      aria-hidden={phase === 'settling' || undefined}
    >
      <div className="return-greeting__inner">
        <figcaption>Last time, you marked</figcaption>
        <blockquote>
          <button type="button" onClick={open} title="Go to this line in the piece">{chosen.text}</button>
        </blockquote>
      </div>
    </figure>
  );
}
