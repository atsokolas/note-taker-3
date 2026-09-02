import React, { useCallback, useEffect, useState } from 'react';
import { THINK_WRITING_CLASS } from './editor/useThinkWritingActivity';

/**
 * Rails away, held.
 *
 * Writing already clears them, but only while you are typing — stop to think
 * and the room reassembles around you, which is the moment you least wanted it
 * to. This is the same state held on purpose until you let it go.
 *
 * It sits above the room's own name because it acts on the room rather than
 * living in it: everything below is somewhere to go, and this is how the going
 * looks while you are not.
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
    >
      {held ? 'Rails away' : 'Focus'}
    </button>
  );
};

export default FocusMode;
