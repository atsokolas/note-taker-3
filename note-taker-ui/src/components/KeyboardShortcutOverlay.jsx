import React, { useEffect } from 'react';
import { NOEIS_GO_TO_SHORTCUTS, NOEIS_MOVES } from '../navigation/appNavigation';

/**
 * KeyboardShortcutOverlay — modal that lists every global shortcut.
 * Triggered globally by `?` (handled in App.js).
 *
 * Go-to destinations and moves are projected from the same contract used by
 * App.js. The overlay describes that behavior; it does not maintain a second list.
 */
const CAPS = { ArrowLeft: '←', ArrowRight: '→' };
const capOf = key => CAPS[key] || (key.length === 1 ? key.toUpperCase() : key);

const SECTIONS = [
  {
    title: 'Anywhere',
    items: [
      { keys: ['⌘', 'K'], label: 'Open command palette' },
      { keys: ['⌘', 'J'], label: 'Ask the Partner' },
      { keys: ['?'], label: 'Open this help' },
      { keys: ['Esc'], label: 'Close any modal / overlay' }
    ]
  },
  {
    title: 'Go to (press G then…)',
    items: NOEIS_GO_TO_SHORTCUTS.map(item => ({
      keys: ['G', item.key.toUpperCase()],
      label: item.label,
      sequential: true
    }))
  },
  {
    title: 'Moving around',
    items: NOEIS_MOVES.map(item => ({
      keys: [...(item.alt ? ['Alt'] : []), capOf(item.key)],
      label: item.label
    }))
  },
  {
    title: 'Reading & highlights',
    items: [
      { keys: ['Drag select'], label: 'Open the highlight menu' },
      { keys: ['H'], label: 'Highlight the selection' },
      { keys: ['T'], label: 'Leave a thought on the selection' },
      { keys: ['A'], label: 'Ask about the selection' },
      { keys: ['J'], label: 'Next paragraph, or next highlight in the highlights view' },
      { keys: ['K'], label: 'Previous paragraph, or previous highlight in the highlights view' },
      { keys: ['N'], label: 'Next piece in the list you opened it from' },
      { keys: ['P'], label: 'Previous piece in the list you opened it from' },
      { keys: ['Enter'], label: 'Open the focused highlight\'s article' },
      { keys: ['⌘', 'Enter'], label: 'Open the focused highlight in a notebook' }
    ]
  }
];

const Key = ({ children }) => <kbd className="kbd-overlay__key">{children}</kbd>;

const KeyboardShortcutOverlay = ({ open, onClose }) => {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose?.();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="modal-overlay modal-overlay--insert kbd-overlay"
      data-testid="keyboard-shortcut-overlay"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <div className="modal-content modal-content--insert kbd-overlay__panel" role="dialog" aria-label="Keyboard shortcuts">
        <div className="modal-header">
          <div>
            <h3>Keyboard shortcuts</h3>
            <p className="muted small">Press <kbd className="kbd-overlay__key kbd-overlay__key--inline">?</kbd> anywhere to bring this back.</p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="kbd-overlay__sections">
          {SECTIONS.map((section) => (
            <section key={section.title} className="kbd-overlay__section">
              <h4 className="kbd-overlay__section-title">{section.title}</h4>
              <ul className="kbd-overlay__list">
                {section.items.map((item) => (
                  <li key={`${item.label}-${item.keys.join('+')}`} className="kbd-overlay__row">
                    <span className="kbd-overlay__row-label">{item.label}</span>
                    <span className="kbd-overlay__row-keys">
                      {item.keys.map((k, i) => (
                        <React.Fragment key={`${item.label}-${i}`}>
                          {i > 0 ? (
                            <span className="kbd-overlay__row-sep" aria-hidden="true">
                              {item.sequential ? 'then' : '+'}
                            </span>
                          ) : null}
                          <Key>{k}</Key>
                        </React.Fragment>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <div className="modal-footer insert-modal__footer">
          <span className="insert-modal__footer-hint">
            <kbd>esc</kbd> to close
          </span>
        </div>
      </div>
    </div>
  );
};

export default KeyboardShortcutOverlay;
