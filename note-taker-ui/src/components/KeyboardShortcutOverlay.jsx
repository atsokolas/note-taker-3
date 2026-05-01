import React, { useEffect } from 'react';

/**
 * KeyboardShortcutOverlay — modal that lists every global shortcut.
 * Triggered globally by `?` (handled in App.js).
 *
 * Source-of-truth for shortcuts: keep in sync with App.js's handleKeyDown
 * effect. We deliberately don't auto-derive — the cross-cutting handler is
 * deeply imperative and each shortcut deserves its own one-liner caption
 * for the user.
 */
const SECTIONS = [
  {
    title: 'Anywhere',
    items: [
      { keys: ['⌘', 'K'], label: 'Open command palette' },
      { keys: ['?'], label: 'Open this help' },
      { keys: ['Esc'], label: 'Close any modal / overlay' }
    ]
  },
  {
    title: 'Go to (press G then…)',
    items: [
      { keys: ['G', 'T'], label: 'Today' },
      { keys: ['G', 'B'], label: 'Brain' },
      { keys: ['G', 'N'], label: 'Notebook' },
      { keys: ['G', 'J'], label: 'Journey' },
      { keys: ['G', 'C'], label: 'Collections' },
      { keys: ['G', 'V'], label: 'Views' }
    ]
  },
  {
    title: 'Reading & highlights',
    items: [
      { keys: ['Drag select'], label: 'Open the highlight menu' },
      { keys: ['J'], label: 'Next highlight (in highlights view)' },
      { keys: ['K'], label: 'Previous highlight (in highlights view)' },
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
                  <li key={item.label} className="kbd-overlay__row">
                    <span className="kbd-overlay__row-label">{item.label}</span>
                    <span className="kbd-overlay__row-keys">
                      {item.keys.map((k, i) => (
                        <React.Fragment key={`${item.label}-${i}`}>
                          {i > 0 ? <span className="kbd-overlay__row-sep" aria-hidden="true">+</span> : null}
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
