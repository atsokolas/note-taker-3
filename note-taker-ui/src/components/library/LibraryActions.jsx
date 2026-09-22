import React, { useCallback, useEffect, useRef } from 'react';

/**
 * The infrequent Library tools, beside the places they belong to.
 *
 * Native details is the menu. Escape and an outside press close it and
 * return focus to the summary, so a keyboard reader is not left inside a
 * panel that is no longer on the page.
 */
export const LibraryMenu = ({ label, menuLabel, actions, className = '' }) => {
  const rootRef = useRef(null);
  const close = useCallback(() => {
    const root = rootRef.current;
    if (!root?.open) return;
    root.open = false;
    root.querySelector('summary')?.focus();
  }, []);

  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape') close(); };
    const onPointer = (event) => {
      if (!rootRef.current?.contains(event.target)) close();
    };

    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [close]);

  return (
    <details ref={rootRef} className={`library-page-shell__tools ${className}`.trim()}>
      <summary>{label}</summary>
      <div role="group" aria-label={menuLabel}>
        {actions.map(({ id, label: actionLabel, onSelect, disabled = false, current = false }) => (
          <button
            key={id}
            type="button"
            disabled={disabled}
            aria-current={current || undefined}
            onClick={() => {
              onSelect?.();
              close();
            }}
          >
            {actionLabel}
          </button>
        ))}
      </div>
    </details>
  );
};

const LibraryActions = ({
  organizeLaunching = false,
  showSuppressedItems = false,
  onOrganize,
  onToggleSuppressed
}) => (
  <LibraryMenu
    label="Actions"
    menuLabel="Library actions"
    actions={[
      {
        id: 'organize',
        label: organizeLaunching ? 'Starting' : 'Clean up structure',
        onSelect: onOrganize,
        disabled: organizeLaunching
      },
      {
        id: 'suppressed',
        label: showSuppressedItems ? 'Hide review imports' : 'Show review imports',
        onSelect: onToggleSuppressed
      }
    ]}
  />
);

export default LibraryActions;
