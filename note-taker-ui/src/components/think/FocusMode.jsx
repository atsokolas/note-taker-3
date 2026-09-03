import React, { useCallback, useEffect, useState } from 'react';
import { THINK_WRITING_CLASS } from './editor/useThinkWritingActivity';

/**
 * Rails away, held.
 *
 * Writing already clears them, but only while you are typing — stop to think
 * and the room reassembles around you, which is the moment you least wanted
 * it to. This is the same state held on purpose until you let it go.
 *
 * It lives in the bar rather than in the rail. It was in the rail, which meant
 * the one control that could bring the rails back faded out with them: you
 * pressed a thing to hide a thing, and the way out went with it. The bar is
 * the only furniture on the page that never leaves.
 */

export const FOCUS_MODE_KEY = 'think.focusMode.v1';

/* Remembered per reader, because a preference you have to restate every
   morning is not a preference. Storage can refuse — a private window, cleared
   site data — and a reader whose choice could not be read simply starts with
   the rails where they have always been. */
const remembered = () => {
  try {
    return window.localStorage.getItem(FOCUS_MODE_KEY) === '1';
  } catch (_error) {
    return false;
  }
};

const remember = (on) => {
  try {
    window.localStorage.setItem(FOCUS_MODE_KEY, on ? '1' : '0');
  } catch (_error) {
    /* A preference we could not write is still a preference for this session. */
  }
};

/* Two marks, one gesture. Going in draws the measure the rails leave behind;
   coming out draws them back on either side of it. Nothing spins, nothing
   fills — the icon says which way the press goes, not how it feels. */
const RailsMark = ({ held }) => (
  <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
    <rect x="6" y="2" width="4" height="12" rx="1" fill="none" stroke="currentColor" strokeWidth="1.2" />
    {held ? (
      <>
        <path d="M2.5 5.5 4.5 8l-2 2.5" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M13.5 5.5 11.5 8l2 2.5" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      </>
    ) : (
      <>
        <path d="M2 3v10M14 3v10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </>
    )}
  </svg>
);

const FocusMode = () => {
  const [held, setHeld] = useState(remembered);

  useEffect(() => {
    if (!held) return undefined;
    document.body.classList.add(THINK_WRITING_CLASS);
    /* Only what this put there comes back off. Writing may be holding the same
       class for its own reasons, and letting go of focus mode should not yank
       the rails back over someone mid-sentence. */
    return () => { if (!remembered()) document.body.classList.remove(THINK_WRITING_CLASS); };
  }, [held]);

  const toggle = useCallback(() => {
    setHeld((current) => {
      const next = !current;
      remember(next);
      if (!next) document.body.classList.remove(THINK_WRITING_CLASS);
      return next;
    });
  }, []);

  return (
    <button
      type="button"
      className={`think-focus-mode${held ? ' is-held' : ''}`}
      onClick={toggle}
      aria-pressed={held}
      title={held ? 'Bring the rails back' : 'Send the rails away'}
    >
      <RailsMark held={held} />
      <span className="sr-only">{held ? 'Bring the rails back' : 'Send the rails away'}</span>
    </button>
  );
};

export default FocusMode;
