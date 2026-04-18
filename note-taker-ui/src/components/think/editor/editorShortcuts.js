import { moveCurrentBlock as defaultMoveCurrentBlock } from './blockMovement';

const hasPrimaryModifier = (event) => Boolean(event.metaKey || event.ctrlKey);

export const handleEditorStructureShortcut = ({
  editor,
  event,
  allowTitle = true,
  moveCurrentBlock = defaultMoveCurrentBlock
}) => {
  if (!editor || !event) return false;

  const key = String(event.key || '').toLowerCase();

  if (hasPrimaryModifier(event) && event.altKey && (key === 'arrowup' || key === 'arrowdown')) {
    event.preventDefault();
    moveCurrentBlock(editor, key === 'arrowup' ? 'up' : 'down');
    return true;
  }

  if (hasPrimaryModifier(event) && event.altKey && ['1', '2', '3'].includes(key)) {
    event.preventDefault();
    const levelMap = allowTitle
      ? { '1': 1, '2': 2, '3': 3 }
      : { '1': 2, '2': 2, '3': 3 };
    editor.chain().focus().toggleHeading({ level: levelMap[key] }).run();
    return true;
  }

  if (hasPrimaryModifier(event) && event.shiftKey && key === '8') {
    event.preventDefault();
    editor.chain().focus().toggleBulletList().run();
    return true;
  }

  if (hasPrimaryModifier(event) && event.shiftKey && key === '7') {
    event.preventDefault();
    editor.chain().focus().toggleOrderedList().run();
    return true;
  }

  if (hasPrimaryModifier(event) && event.shiftKey && key === '9') {
    event.preventDefault();
    editor.chain().focus().toggleBlockquote().run();
    return true;
  }

  return false;
};
