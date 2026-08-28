import { useEffect } from 'react';

export const THINK_WRITING_CLASS = 'think-writing-active';
export const THINK_WRITING_IDLE_MS = 1600;

const useThinkWritingActivity = (editor, { enabled = true } = {}) => {
  useEffect(() => {
    if (typeof document === 'undefined') return undefined;

    const end = () => document.body.classList.remove(THINK_WRITING_CLASS);

    if (!editor || !enabled) {
      end();
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
  }, [editor, enabled]);
};

export default useThinkWritingActivity;
