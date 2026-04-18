import { handleEditorStructureShortcut } from './editorShortcuts';

const buildChain = () => {
  const chain = {
    focus: jest.fn(() => chain),
    toggleHeading: jest.fn(() => chain),
    toggleBulletList: jest.fn(() => chain),
    toggleOrderedList: jest.fn(() => chain),
    toggleBlockquote: jest.fn(() => chain),
    run: jest.fn(() => true)
  };
  return chain;
};

const buildEvent = (overrides = {}) => ({
  key: '',
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  preventDefault: jest.fn(),
  ...overrides
});

describe('handleEditorStructureShortcut', () => {
  it('uses title shortcut when the surface supports it', () => {
    const chain = buildChain();
    const editor = { chain: jest.fn(() => chain) };
    const event = buildEvent({ key: '1', metaKey: true, altKey: true });

    const handled = handleEditorStructureShortcut({ editor, event, allowTitle: true });

    expect(handled).toBe(true);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(chain.toggleHeading).toHaveBeenCalledWith({ level: 1 });
  });

  it('falls back to the main heading shortcut on slimmer surfaces', () => {
    const chain = buildChain();
    const editor = { chain: jest.fn(() => chain) };
    const event = buildEvent({ key: '1', metaKey: true, altKey: true });

    const handled = handleEditorStructureShortcut({ editor, event, allowTitle: false });

    expect(handled).toBe(true);
    expect(chain.toggleHeading).toHaveBeenCalledWith({ level: 2 });
  });

  it('routes list shortcuts through editor commands', () => {
    const chain = buildChain();
    const editor = { chain: jest.fn(() => chain) };
    const bulletEvent = buildEvent({ key: '8', ctrlKey: true, shiftKey: true });
    const orderedEvent = buildEvent({ key: '7', ctrlKey: true, shiftKey: true });

    expect(handleEditorStructureShortcut({ editor, event: bulletEvent, allowTitle: true })).toBe(true);
    expect(handleEditorStructureShortcut({ editor, event: orderedEvent, allowTitle: true })).toBe(true);
    expect(chain.toggleBulletList).toHaveBeenCalled();
    expect(chain.toggleOrderedList).toHaveBeenCalled();
  });

  it('delegates move shortcuts to the block mover', () => {
    const chain = buildChain();
    const editor = { chain: jest.fn(() => chain) };
    const moveCurrentBlock = jest.fn(() => true);
    const event = buildEvent({ key: 'ArrowDown', metaKey: true, altKey: true });

    const handled = handleEditorStructureShortcut({
      editor,
      event,
      allowTitle: true,
      moveCurrentBlock
    });

    expect(handled).toBe(true);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(moveCurrentBlock).toHaveBeenCalledWith(editor, 'down');
  });
});
