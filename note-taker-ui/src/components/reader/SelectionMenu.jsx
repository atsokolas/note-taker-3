import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import useCssMagneticLerp from '../../hooks/useCssMagneticLerp';
import { useFinePointer, usePrefersReducedMotion } from '../../hooks/useMotionPreferences';
import { MORE_HIGHLIGHT_COLORS, NAMED_HIGHLIGHT_COLORS } from '../../constants/highlightColors';

/* Clear of the line, not sitting on it. Eight pixels put the menu's bottom
   edge into the sentence you had selected; eighteen still landed it in the
   line above that one, which at this measure is about thirty pixels tall. */
const SELECTION_GAP_PX = 30;

/* A pointer press must not move focus onto the menu. The menu closes as soon
   as the passage is kept, and removing a focused button scrolls the document
   back to the top. */
const keepReadingPlace = (event) => {
  event.preventDefault();
};
const MAX_DRIFT_PX = 14;

/* H, T and A act on a selection. The menu says so the first three times it
   opens on this device, and then trusts the reader to remember. */
const KEY_HINTS_KEY = 'noeis.reader.selectionKeyHints';
const KEY_HINT_SHOWINGS = 3;
const keyHintShowings = () => {
  try {
    return Number(window.localStorage.getItem(KEY_HINTS_KEY)) || 0;
  } catch (_error) {
    return KEY_HINT_SHOWINGS;
  }
};
const countKeyHintShowing = () => {
  try {
    window.localStorage.setItem(KEY_HINTS_KEY, String(keyHintShowings() + 1));
  } catch (_error) {
    // A browser that cannot remember simply never shows the hints again.
  }
};
const typingInto = (target) => Boolean(target?.closest?.('input, textarea, select, [contenteditable="true"]'));
const POINTER_INFLUENCE_RADIUS_PX = 280;

const SelectionMenu = React.forwardRef(({
  rect,
  saving,
  onHighlight,
  onThought,
  onAskLibrarian,
  onWorkWithPassage,
}, ref) => {
  const reducedMotion = usePrefersReducedMotion();
  const finePointer = useFinePointer();
  const motionOk = !reducedMotion && finePointer && Boolean(rect);
  const magnet = useCssMagneticLerp('--selection-menu-x', 0.22);
  const innerRef = useRef(null);
  /* Above the selection when there is room for it, below when there is not.
     A menu pinned above a selection near the top of the window gets clamped
     to top: 8 and lands on the words instead of near them. */
  const [placeBelow, setPlaceBelow] = useState(false);
  const [center, setCenter] = useState(null);
  const [showKeys] = useState(() => keyHintShowings() < KEY_HINT_SHOWINGS);
  const [moreInks, setMoreInks] = useState(false);
  useEffect(() => { if (showKeys) countKeyHintShowing(); }, [showKeys]);

  const keys = useRef({});
  keys.current = { h: () => onHighlight?.(), t: onThought, a: onAskLibrarian };
  useEffect(() => {
    if (!rect) return undefined;
    const press = (event) => {
      if (saving || event.metaKey || event.ctrlKey || event.altKey || typingInto(event.target)) return;
      const action = keys.current[String(event.key || '').toLowerCase()];
      if (!action) return;
      event.preventDefault();
      action();
    };
    window.addEventListener('keydown', press);
    return () => window.removeEventListener('keydown', press);
  }, [rect, saving]);
  const hint = (key) => (showKeys ? <kbd className="selection-menu__key" aria-hidden="true">{key}</kbd> : null);

  const setRefs = useCallback((node) => {
    innerRef.current = node;
    magnet.elRef.current = node;
    if (typeof ref === 'function') {
      ref(node);
    } else if (ref && typeof ref === 'object') {
      ref.current = node;
    }
  }, [magnet.elRef, ref]);

  useEffect(() => {
    magnet.reset(0);
  }, [rect?.top, rect?.left, rect?.width, magnet]);

  useLayoutEffect(() => {
    if (!rect) return;
    const height = innerRef.current?.offsetHeight || 0;
    setPlaceBelow(rect.top - SELECTION_GAP_PX - height < 12);
    const half = (innerRef.current?.offsetWidth || 0) / 2;
    setCenter(Math.max(half + 12, Math.min(window.innerWidth - half - 12, rect.left + rect.width / 2)));
  }, [rect?.top, rect?.height, rect]);

  useEffect(() => {
    if (!motionOk) {
      magnet.reset(0);
      return undefined;
    }
    const centerX = rect.left + rect.width / 2;
    const handlePointerMove = (event) => {
      const dx = event.clientX - centerX;
      if (Math.abs(dx) > POINTER_INFLUENCE_RADIUS_PX) {
        magnet.setTarget(0);
        return;
      }
      const drift = Math.max(-MAX_DRIFT_PX, Math.min(MAX_DRIFT_PX, dx * 0.06));
      magnet.setTarget(drift);
    };
    const handlePointerLeave = () => magnet.setTarget(0);
    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    window.addEventListener('pointerleave', handlePointerLeave);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerleave', handlePointerLeave);
    };
  }, [motionOk, rect?.left, rect?.width, magnet]);

  if (!rect) return null;

  /* rect comes from range.getBoundingClientRect(), which is in viewport
     coordinates, so this menu must be positioned against the viewport. It was
     rendered inside .article-reader, and that element carries a
     backdrop-filter — which makes it the containing block for its own
     position: fixed descendants. The menu was therefore offset by the whole
     height of the article above the selection: select a sentence halfway down
     a page and the menu appeared near the top of the column.

     A floating overlay belongs at the document level regardless, so it goes
     through a portal. That also keeps it right if any ancestor later picks up
     a transform or a filter, which breaks fixed positioning the same way. */
  const style = {
    top: placeBelow
      ? rect.top + (rect.height || 0) + SELECTION_GAP_PX
      : rect.top - SELECTION_GAP_PX,
    left: center ?? rect.left + rect.width / 2
  };

  return createPortal((
    <div
      ref={setRefs}
      className={`selection-menu selection-menu--expanded${placeBelow ? ' selection-menu--below' : ''}${motionOk ? ' is-magnetic' : ''}`}
      style={style}
      role="menu"
    >
      {/* Keep a sentence, ask about it, or begin writing from it.

          Highlight keeps it in the default ink, so the reader who just wants
          the sentence never meets a decision. The inks sit after Ask about
          this, because choosing a colour is the rarer thing and the rarer
          thing goes last. */}
      <div className="selection-menu__actions">
        <button type="button" className="selection-menu-button" onMouseDown={keepReadingPlace} onClick={() => onHighlight?.()} disabled={saving} aria-keyshortcuts="H">
          {saving ? 'Saving...' : 'Highlight'}{hint('H')}
        </button>
        {onThought ? <button type="button" className="selection-menu-button" onMouseDown={keepReadingPlace} onClick={onThought} disabled={saving} aria-keyshortcuts="T">Leave a thought{hint('T')}</button> : null}
        <button type="button" className="selection-menu-button is-muted" onMouseDown={keepReadingPlace} onClick={onAskLibrarian} disabled={saving} aria-keyshortcuts="A">
          Ask about this{hint('A')}
        </button>
        {onWorkWithPassage ? <button type="button" className="selection-menu-button" onMouseDown={keepReadingPlace} onClick={onWorkWithPassage} disabled={saving}>
          Work with this passage
        </button> : null}
        {/* For, Against, Keep: what a passage is to a view, said in its ink.
            The two inks without a meaning wait behind "more". */}
        <span className="selection-menu__inks" role="group" aria-label="Highlight as">
          {[...NAMED_HIGHLIGHT_COLORS, ...(moreInks ? MORE_HIGHLIGHT_COLORS : [])].map((ink) => (
            <button
              key={ink.value}
              type="button"
              className="selection-menu__ink"
              style={{ '--ink': ink.value }}
              onMouseDown={keepReadingPlace}
              onClick={() => onHighlight?.(ink.value)}
              disabled={saving}
              title={ink.label}
              aria-label={`Highlight as ${ink.label.toLowerCase()}`}
            >
              {NAMED_HIGHLIGHT_COLORS.includes(ink) ? <span>{ink.label}</span> : null}
            </button>
          ))}
          {moreInks ? null : (
            <button type="button" className="selection-menu__more" onMouseDown={keepReadingPlace} onClick={() => setMoreInks(true)}>more</button>
          )}
        </span>
      </div>
    </div>
  ), document.body);
});

export default SelectionMenu;
