import React, { useCallback, useEffect } from 'react';
import { EditorContent } from '@tiptap/react';
import RichTextToolbar from './RichTextToolbar';
import SlashCommandMenu from './SlashCommandMenu';
import DraftBlockTray from './DraftBlockTray';
import { moveCurrentBlock } from './blockMovement';
import useCssMagneticLerp from '../../../hooks/useCssMagneticLerp';
import { useFinePointer, usePrefersReducedMotion } from '../../../hooks/useMotionPreferences';

const EditorDraftShell = ({
  editor,
  surfaceRef = null,
  className = '',
  toolbarVariant = 'full',
  toolbarClassName = '',
  hideToolbar = false,
  magnetCaretToolbar = true,
  helperCopy = 'Type / for commands.',
  helperClassName = '',
  blockControlsClassName = '',
  trayItems = [],
  trayClassName = '',
  slashCommands = null
}) => {
  const reducedMotion = usePrefersReducedMotion();
  const finePointer = useFinePointer();
  const caretMagnet = useCssMagneticLerp('--caret-magnet-x', 0.24);

  const syncCaretMagnet = useCallback(() => {
    if (!editor || !magnetCaretToolbar || reducedMotion || !finePointer) {
      caretMagnet.reset(0);
      return;
    }
    const surface = surfaceRef?.current;
    if (!surface || !caretMagnet.elRef.current) return;
    const prose = surface.querySelector('.ProseMirror');
    if (!prose) return;
    const shellRect = surface.getBoundingClientRect();
    const { from } = editor.state.selection;
    try {
      const coords = editor.view.coordsAtPos(from);
      const mid = (coords.left + coords.right) / 2;
      const raw = mid - shellRect.left - shellRect.width / 2;
      const limit = Math.min(140, shellRect.width * 0.38);
      const clamped = Math.max(-limit, Math.min(limit, raw));
      caretMagnet.setTarget(clamped);
    } catch (_err) {
      caretMagnet.setTarget(0);
    }
  }, [editor, magnetCaretToolbar, reducedMotion, finePointer, surfaceRef, caretMagnet]);

  useEffect(() => {
    if (!editor || hideToolbar || !magnetCaretToolbar || reducedMotion || !finePointer) {
      caretMagnet.reset(0);
      return undefined;
    }
    const surface = surfaceRef?.current;
    const prose = surface?.querySelector('.ProseMirror');
    const onChange = () => {
      window.requestAnimationFrame(syncCaretMagnet);
    };
    editor.on('selectionUpdate', onChange);
    editor.on('transaction', onChange);
    prose?.addEventListener('scroll', onChange, { passive: true });
    window.addEventListener('resize', onChange);
    window.requestAnimationFrame(syncCaretMagnet);
    return () => {
      editor.off('selectionUpdate', onChange);
      editor.off('transaction', onChange);
      prose?.removeEventListener('scroll', onChange);
      window.removeEventListener('resize', onChange);
    };
  }, [editor, hideToolbar, magnetCaretToolbar, reducedMotion, finePointer, surfaceRef, syncCaretMagnet, caretMagnet]);

  if (!editor) return null;

  return (
    <div
      className={['think-editor-draft-surface', className].filter(Boolean).join(' ')}
      ref={surfaceRef}
    >
      {!hideToolbar && (
        <div
          className={[
            'think-rich-text-toolbar-magnet',
            magnetCaretToolbar && !reducedMotion && finePointer ? 'is-motion' : ''
          ].filter(Boolean).join(' ')}
          ref={caretMagnet.elRef}
        >
          <RichTextToolbar
            editor={editor}
            variant={toolbarVariant}
            className={toolbarClassName}
          />
        </div>
      )}
      <div className={['think-editor-slash-hint', helperClassName].filter(Boolean).join(' ')}>
        <span className="think-editor-slash-hint__token">/</span>
        <span>{helperCopy}</span>
        <div className={['think-editor-block-controls', blockControlsClassName].filter(Boolean).join(' ')}>
          <button type="button" className="ui-quiet-button" onClick={() => moveCurrentBlock(editor, 'up')}>Move up</button>
          <button type="button" className="ui-quiet-button" onClick={() => moveCurrentBlock(editor, 'down')}>Move down</button>
        </div>
      </div>
      {Array.isArray(trayItems) && trayItems.length > 0 ? (
        <DraftBlockTray
          editor={editor}
          items={trayItems}
          className={trayClassName}
        />
      ) : null}
      <EditorContent editor={editor} />
      <SlashCommandMenu
        open={Boolean(slashCommands?.menu?.open)}
        items={slashCommands?.menu?.items || []}
        activeIndex={slashCommands?.menu?.activeIndex || 0}
        query={slashCommands?.menu?.query || ''}
        position={slashCommands?.menu?.position || { top: 0, left: 0 }}
        onSelect={slashCommands?.selectCommand}
      />
    </div>
  );
};

export default EditorDraftShell;
