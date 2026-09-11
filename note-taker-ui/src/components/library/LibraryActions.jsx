import React, { useEffect, useRef } from 'react';

/**
 * The infrequent Library tools, beside the places they belong to.
 *
 * Native details is the menu. Escape and an outside press close it and
 * return focus to the summary, so a keyboard reader is not left inside a
 * panel that is no longer on the page.
 */
const LibraryActions = ({
  organizeLaunching = false,
  showSuppressedItems = false,
  onOrganize,
  onToggleSuppressed
}) => {
  const rootRef = useRef(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;

    const close = () => {
      if (!root.open) return;
      root.open = false;
      root.querySelector('summary')?.focus();
    };

    const onKey = (event) => {
      if (event.key === 'Escape') close();
    };
    const onPointer = (event) => {
      if (!root.contains(event.target)) close();
    };

    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, []);

  return (
    <details ref={rootRef} className="library-page-shell__tools">
      <summary>Actions</summary>
      <div role="group" aria-label="Library actions">
        <button type="button" onClick={onOrganize} disabled={organizeLaunching}>
          {organizeLaunching ? 'Starting' : 'Clean up structure'}
        </button>
        <button type="button" onClick={onToggleSuppressed}>
          {showSuppressedItems ? 'Hide review imports' : 'Show review imports'}
        </button>
      </div>
    </details>
  );
};

export default LibraryActions;
