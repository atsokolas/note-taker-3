import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { HIGHLIGHT_COLOR_OPTIONS } from '../../constants/highlightColors';
import useCssMagneticLerp from '../../hooks/useCssMagneticLerp';
import { useFinePointer, usePrefersReducedMotion } from '../../hooks/useMotionPreferences';

/* Clear of the line, not sitting on it. Eight pixels put the menu's bottom
   edge into the sentence above the one you had selected. */
const SELECTION_GAP_PX = 18;
const MAX_DRIFT_PX = 14;
const POINTER_INFLUENCE_RADIUS_PX = 280;

const SelectionMenu = React.forwardRef(({
  rect,
  color,
  saving,
  onColorChange,
  onHighlight,
  onAskLibrarian,
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
    left: rect.left + rect.width / 2
  };

  return createPortal((
    <div
      ref={setRefs}
      className={`selection-menu selection-menu--expanded${placeBelow ? ' selection-menu--below' : ''}${motionOk ? ' is-magnetic' : ''}`}
      style={style}
      role="menu"
    >
      {/* Two things you can do to a sentence you just selected: keep it, or ask
          about it. There were four buttons and a tag field here, which is a
          form standing on top of the paragraph you were reading — and three of
          the four asked you to decide what kind of thing the sentence was
          before you had finished reading it. Filing it as a concept or a
          question is still a thing you can do to the highlight afterwards, in
          the Library, once you know. */}
      <div className="selection-menu__actions">
        <button type="button" className="selection-menu-button" onClick={onHighlight} disabled={saving}>
          {saving ? 'Saving...' : 'Highlight'}
        </button>
        <button type="button" className="selection-menu-button is-muted" onClick={onAskLibrarian} disabled={saving}>
          Ask about this
        </button>
      </div>
      <div className="selection-menu-divider" />
      {/* The colour is part of highlighting, not chrome around it. */}
      <div className="selection-menu__controls">
        <div className="selection-menu__swatches" aria-label="Highlight color">
          {HIGHLIGHT_COLOR_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`selection-menu__swatch ${color === option.value ? 'is-active' : ''}`}
              style={{ backgroundColor: option.value }}
              onClick={() => onColorChange(option.value)}
              title={option.label}
              aria-label={option.label}
              aria-pressed={color === option.value}
              disabled={saving}
            />
          ))}
        </div>
      </div>
    </div>
  ), document.body);
});

export default SelectionMenu;
