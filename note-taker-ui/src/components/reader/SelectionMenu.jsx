import React, { useCallback, useEffect, useRef } from 'react';
import { HIGHLIGHT_COLOR_OPTIONS } from '../../constants/highlightColors';
import useCssMagneticLerp from '../../hooks/useCssMagneticLerp';
import { useFinePointer, usePrefersReducedMotion } from '../../hooks/useMotionPreferences';

const MAX_DRIFT_PX = 14;
const POINTER_INFLUENCE_RADIUS_PX = 280;

const SelectionMenu = React.forwardRef(({
  rect,
  color,
  tagInput,
  saving,
  onColorChange,
  onTagInputChange,
  onHighlight,
  onAddConcept,
  onAddDump,
  onAddNotebook,
  onAddQuestion,
}, ref) => {
  const reducedMotion = usePrefersReducedMotion();
  const finePointer = useFinePointer();
  const motionOk = !reducedMotion && finePointer && Boolean(rect);
  const magnet = useCssMagneticLerp('--selection-menu-x', 0.22);
  const innerRef = useRef(null);

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

  const style = {
    top: Math.max(8, rect.top - 8),
    left: rect.left + rect.width / 2
  };

  return (
    <div
      ref={setRefs}
      className={`selection-menu selection-menu--expanded${motionOk ? ' is-magnetic' : ''}`}
      style={style}
      role="menu"
    >
      <div className="selection-menu__actions">
        <button type="button" className="selection-menu-button" onClick={onHighlight} disabled={saving}>
          {saving ? 'Saving...' : 'Highlight'}
        </button>
        <button type="button" className="selection-menu-button is-muted" onClick={onAddNotebook} disabled={saving}>
          Notebook
        </button>
        <button type="button" className="selection-menu-button is-muted" onClick={onAddConcept} disabled={saving}>
          Concept
        </button>
        <button type="button" className="selection-menu-button is-muted" onClick={onAddQuestion} disabled={saving}>
          Question
        </button>
        <button type="button" className="selection-menu-button is-muted" onClick={onAddDump} disabled={saving}>
          Dump
        </button>
      </div>
      <div className="selection-menu-divider" />
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
        <input
          type="text"
          className="selection-menu__input"
          value={tagInput}
          onChange={(event) => onTagInputChange(event.target.value)}
          placeholder="Tags, comma-separated"
          disabled={saving}
        />
      </div>
    </div>
  );
});

export default SelectionMenu;
