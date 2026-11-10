import { useEffect } from 'react';

/* Writing owns this temporary retreat; FocusMode holds its own class so a
   moving hand cannot cancel the reader's deliberate choice. */
export const THINK_WRITING_CLASS = 'think-rails-away';
/* A resting hand trembles; a hand reaching for the room travels. */
export const THINK_WRITING_REACH_PX = 12;

/**
 * Typing sets the room down; it comes back when you ask for it — the mouse
 * moves, Escape, or you leave the page. Never on a pause: a pause is when you
 * are thinking, and a room that reassembles then is the interruption.
 *
 * `reaching` holds the page down while a source picker is open: pressing `@`
 * moves focus into the picker, and that is still writing.
 */
const useThinkWritingActivity = (editor, { enabled = true, reaching = false } = {}) => {
  useEffect(() => {
    if (typeof document === 'undefined') return undefined;

    const end = () => document.body.classList.remove(THINK_WRITING_CLASS);

    if (!editor || !enabled) {
      end();
      return undefined;
    }

    if (reaching) {
      document.body.classList.add(THINK_WRITING_CLASS);
      return undefined;
    }

    let travelled = 0;
    const onUpdate = (event) => {
      if (event?.transaction && event.transaction.docChanged === false) return;
      travelled = 0;
      document.body.classList.add(THINK_WRITING_CLASS);
    };
    const onPointerMove = (event) => {
      if (event.pointerType && event.pointerType !== 'mouse') return;
      travelled += Math.abs(event.movementX || 0) + Math.abs(event.movementY || 0);
      if (travelled > THINK_WRITING_REACH_PX) end();
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') end();
    };

    editor.on('update', onUpdate);
    editor.on('blur', end);
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      editor.off('update', onUpdate);
      editor.off('blur', end);
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('keydown', onKeyDown);
      end();
    };
  }, [editor, enabled, reaching]);
};

export default useThinkWritingActivity;
