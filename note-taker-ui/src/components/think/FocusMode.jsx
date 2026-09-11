import React, { useCallback, useEffect, useState } from 'react';

/**
 * Rails away, held.
 *
 * Writing already clears them, but only while you are typing — stop to think
 * and the room reassembles around you, which is the moment you least wanted
 * it to. This is the same state held on purpose until you let it go.
 *
 * In Notebook the control stays above the collapsible rail contents, so the
 * way back remains visible. Other Think surfaces keep their bar control.
 */

export const FOCUS_MODE_KEY = 'think.focusMode.v1';
export const THINK_FOCUS_CLASS = 'think-focus-held';

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

const FocusMode = ({ inRail = false }) => {
  const [held, setHeld] = useState(remembered);

  useEffect(() => {
    if (!held) return undefined;
    document.body.classList.add(THINK_FOCUS_CLASS);
    return () => document.body.classList.remove(THINK_FOCUS_CLASS);
  }, [held]);

  const toggle = useCallback(() => {
    setHeld((current) => {
      const next = !current;
      remember(next);
      return next;
    });
  }, []);

  return (
    <button
      type="button"
      className={`think-focus-mode${inRail ? ' think-focus-mode--rail' : ''}${held ? ' is-held' : ''}`}
      onClick={toggle}
      aria-pressed={held}
      title={held ? 'Exit focus mode' : 'Focus mode'}
      aria-label={held ? 'Exit focus mode' : 'Focus mode'}
    >
      <RailsMark held={held} />
      {inRail ? <span className="think-focus-mode__label">{held ? 'Exit focus' : 'Focus'}</span> : null}
    </button>
  );
};

export default FocusMode;
