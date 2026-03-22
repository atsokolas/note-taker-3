import React from 'react';
import { HIGHLIGHT_COLOR_OPTIONS } from '../../constants/highlightColors';

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
  if (!rect) return null;

  const style = {
    top: Math.max(8, rect.top - 8),
    left: rect.left + rect.width / 2
  };

  return (
    <div ref={ref} className="selection-menu selection-menu--expanded" style={style} role="menu">
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
