import { useEffect } from 'react';

/* The stylesheet knows one state — rails away — and two things can cause it:
   writing, and focus mode held on purpose. */
export const THINK_WRITING_CLASS = 'think-rails-away';
export const THINK_WRITING_IDLE_MS = 1600;

/**
 * Writing hides the rails; stopping brings them back.
 *
 * `reaching` is the exception. Pressing `@` for a source moves focus into the
 * picker, the editor blurs, and the rails came flooding back mid-sentence —
 * which is the one moment the writer is most clearly still writing. Reaching
 * for a source is part of writing, not the end of it, so blur does not end
 * anything while a picker is open.
 */
const useThinkWritingActivity = (editor, { enabled = true, reaching = false } = {}) => {
  useEffect(() => {
    if (typeof document === 'undefined') return undefined;

    const end = () => document.body.classList.remove(THINK_WRITING_CLASS);

    if (!editor || !enabled) {
      end();
      return undefined;
    }

    /* Held open for as long as the reach lasts. The idle timer is what would
       otherwise close it: the writer is not typing while they read a list. */
    if (reaching) {
      document.body.classList.add(THINK_WRITING_CLASS);
      return undefined;
    }

    let idleTimer = 0;
    const begin = () => document.body.classList.add(THINK_WRITING_CLASS);
    const clearIdle = () => {
      if (!idleTimer) return;
      window.clearTimeout(idleTimer);
      idleTimer = 0;
    };
    const scheduleEnd = () => {
      clearIdle();
      idleTimer = window.setTimeout(end, THINK_WRITING_IDLE_MS);
    };

    const onUpdate = (event) => {
      if (event?.transaction && event.transaction.docChanged === false) return;
      begin();
      scheduleEnd();
    };

    const onBlur = () => {
      clearIdle();
      end();
    };

    editor.on('update', onUpdate);
    editor.on('blur', onBlur);
    return () => {
      editor.off('update', onUpdate);
      editor.off('blur', onBlur);
      clearIdle();
      end();
    };
  }, [editor, enabled, reaching]);
};

export default useThinkWritingActivity;
