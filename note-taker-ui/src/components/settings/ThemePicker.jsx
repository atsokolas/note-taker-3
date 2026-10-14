import React, { useEffect, useMemo, useRef, useState } from 'react';
import { THEME_CATALOG, themeById } from '../../settings/themeCatalog';
import '../../styles/theme-picker.css';

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'dark', label: 'Dark', glyph: '☾' },
  { value: 'light', label: 'Light', glyph: '☼' }
];

/* 'auto' first, then every named theme in catalog order. */
const ENTRIES = [
  { id: 'auto', label: 'Follow this device', scheme: 'any' },
  ...THEME_CATALOG
];

const labelFor = (id) => ENTRIES.find((entry) => entry.id === id)?.label || id;

/* A theme read the way Strata reads one: its accent, ink, danger and rule
   standing on its own paper. Following the device shows Light and Dark
   side by side. */
export const ThemeSwatch = ({ id }) => {
  if (id === 'auto') {
    return (
      <span className="theme-swatch theme-swatch--split" aria-hidden="true">
        <ThemeSwatch id="light" />
        <ThemeSwatch id="dark" />
      </span>
    );
  }
  const swatch = themeById(id)?.swatch;
  if (!swatch) return null;
  return (
    <span className="theme-swatch" style={{ background: swatch.paper }} aria-hidden="true">
      {[swatch.accent, swatch.ink, swatch.danger, swatch.rule].map((color, index) => (
        // eslint-disable-next-line react/no-array-index-key -- fixed four-bar swatch
        <i key={index} style={{ background: color }} />
      ))}
    </span>
  );
};

/* The theme menu. Choosing a theme applies it at once; Looks good keeps it,
   and Escape puts back the one you came in with. */
const ThemePicker = ({ open, value = 'auto', onPreview, onConfirm, onCancel }) => {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState(value);
  const originRef = useRef(value);
  const dialogRef = useRef(null);
  const searchRef = useRef(null);
  const returnFocusRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    originRef.current = value;
    returnFocusRef.current = document.activeElement;
    setSelected(value);
    setQuery('');
    setFilter('all');
    const frame = window.requestAnimationFrame(() => searchRef.current?.focus());
    return () => {
      window.cancelAnimationFrame(frame);
      const target = returnFocusRef.current;
      if (target instanceof HTMLElement && document.contains(target)) target.focus();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- remember the theme the menu opened on, once per opening
  }, [open]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return ENTRIES.filter((entry) => (
      (filter === 'all' || entry.scheme === filter)
      && (!needle || entry.label.toLowerCase().includes(needle))
    ));
  }, [query, filter]);

  if (!open) return null;

  const choose = (id) => {
    setSelected(id);
    onPreview?.(id);
  };

  const confirm = () => onConfirm?.(selected);

  const cancel = () => onCancel?.(originRef.current);

  const moveSelection = (step) => {
    if (!visible.length) return;
    const index = visible.findIndex((entry) => entry.id === selected);
    const next = visible[Math.min(visible.length - 1, Math.max(0, (index < 0 ? 0 : index + step)))];
    choose(next.id);
    dialogRef.current?.querySelector(`[data-theme-id="${next.id}"]`)?.focus();
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      if (query) setQuery('');
      else cancel();
      return;
    }
    if (event.key === 'Tab') {
      const focusable = Array.from(dialogRef.current?.querySelectorAll('button, input') || [])
        .filter((node) => !node.disabled && node.tabIndex !== -1);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
      return;
    }
    const inList = event.target?.closest?.('.theme-picker__list');
    const inSearch = event.target === searchRef.current;
    if (!inList && !inSearch) return;
    const steps = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 2, ArrowUp: -2 };
    if (inSearch && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) return;
    if (steps[event.key]) {
      event.preventDefault();
      moveSelection(steps[event.key]);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      confirm();
    }
  };

  return (
    <div className="theme-picker" role="presentation" onMouseDown={cancel}>
      <div
        ref={dialogRef}
        className="theme-picker__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="theme-picker-title"
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <header className="theme-picker__head">
          <div>
            <p className="theme-picker__eyebrow">Make yourself at home</p>
            <h2 id="theme-picker-title" className="theme-picker__title">A different light to read by.</h2>
            <p className="theme-picker__lede">
              Noeis’s own, and ten community favorites by way of Strata. Pick one; every room changes with it.
            </p>
          </div>
          <button type="button" className="theme-picker__close" aria-label="Close and put back the theme you had" onClick={cancel}>
            ×
          </button>
        </header>

        <label className="theme-picker__search">
          <span className="theme-picker__search-icon" aria-hidden="true" />
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find your favorite theme…"
            aria-label="Find a theme"
          />
          <kbd aria-hidden="true">esc</kbd>
        </label>

        <div className="theme-picker__filters">
          <div role="group" aria-label="Show">
            {FILTERS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`theme-picker__filter${filter === option.value ? ' is-active' : ''}`}
                aria-pressed={filter === option.value}
                onClick={() => setFilter(option.value)}
              >
                {option.glyph ? <span aria-hidden="true">{option.glyph}</span> : null}
                {option.label}
              </button>
            ))}
          </div>
          <span className="theme-picker__count">
            {visible.length} {visible.length === 1 ? 'theme' : 'themes'}
          </span>
        </div>

        <div className="theme-picker__list" role="radiogroup" aria-label="Themes">
          {visible.map((entry) => {
            const isSelected = entry.id === selected;
            return (
              <button
                key={entry.id}
                type="button"
                role="radio"
                aria-checked={isSelected}
                tabIndex={isSelected || (!visible.some((item) => item.id === selected) && entry === visible[0]) ? 0 : -1}
                data-theme-id={entry.id}
                className={`theme-picker__option${isSelected ? ' is-selected' : ''}`}
                onClick={() => choose(entry.id)}
                onDoubleClick={() => onConfirm?.(entry.id)}
              >
                <ThemeSwatch id={entry.id} />
                <span className="theme-picker__name">{entry.label}</span>
                {isSelected ? <span className="theme-picker__check" aria-hidden="true">✓</span> : null}
              </button>
            );
          })}
          {!visible.length ? (
            <p className="theme-picker__none">No theme goes by that name.</p>
          ) : null}
        </div>

        <footer className="theme-picker__foot">
          <span className="theme-picker__status">
            <span className="theme-picker__dot" aria-hidden="true" />
            {selected === originRef.current
              ? 'Applied live · kept on your account'
              : `Applied live · Esc puts back ${labelFor(originRef.current)}`}
          </span>
          <button type="button" className="theme-picker__confirm" onClick={confirm}>
            Looks good <span aria-hidden="true">✓</span>
          </button>
        </footer>
      </div>
    </div>
  );
};

export default ThemePicker;
