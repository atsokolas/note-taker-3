import { Editor, Extension } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import {
  NotebookWorkbenchDecorations,
  setNotebookWorkbenchDecorations,
  setSavedTrialMarkHandler
} from './notebookWorkbenchDecorations';
import { UniqueBlockIds } from './uniqueBlockIds';

const BlockId = Extension.create({
  name: 'blockId',
  addGlobalAttributes() {
    return [{ types: ['paragraph'], attributes: { blockId: { default: null } } }];
  }
});

const mount = (content, extensions) => {
  const element = document.createElement('div');
  document.body.appendChild(element);
  const editor = new Editor({ element, extensions, content });
  return { editor, element };
};

const paragraph = (blockId, text) => ({
  type: 'paragraph',
  attrs: { blockId },
  content: text ? [{ type: 'text', text }] : []
});

describe('notebook workbench marks on a real editor', () => {
  let editor;
  let element;

  afterEach(() => {
    editor?.destroy();
    element?.remove();
    setSavedTrialMarkHandler(null);
  });

  it('revalidates a saved mark after edits and never hides the prose', () => {
    ({ editor, element } = mount({
      type: 'doc',
      content: [paragraph('p1', 'Opening line'), paragraph('p2', 'Second passage stays')]
    }, [StarterKit, BlockId, NotebookWorkbenchDecorations]));
    const phrase = 'Second passage stays';
    setNotebookWorkbenchDecorations(editor, {
      savedMarks: [{
        trialKey: 'k',
        trialId: 't1',
        blockId: 'p2',
        baseText: phrase,
        rangeStart: 0,
        rangeEnd: phrase.length,
        from: 1,
        to: 2
      }]
    });
    const marked = () => editor.view.dom.querySelector('.notebook-saved-alternatives__range');
    expect(marked().textContent).toBe(phrase);
    expect(marked().closest('[aria-hidden="true"]')).toBeNull();
    expect(editor.view.dom.textContent).toContain('Opening line');
    expect(editor.view.dom.textContent).toContain(phrase);

    editor.commands.insertContentAt(1, 'NOTE ');
    expect(marked().textContent).toBe(phrase);
    expect(editor.view.dom.textContent).toContain('NOTE Opening line');

    let pos = null;
    editor.state.doc.descendants((node, position) => {
      if (node.attrs?.blockId === 'p2') pos = position;
    });
    editor.commands.insertContentAt(pos + 1, 'Changed ');
    expect(marked()).toBeNull();

    editor.commands.setContent({ type: 'doc', content: [paragraph('p1', 'Only the opening')] });
    expect(editor.view.dom.querySelector('.notebook-saved-alternatives__range')).toBeNull();
    expect(editor.view.dom.querySelector('[data-saved-trial-id]')).toBeNull();
  });

  it('activates the saved mark from the keyboard without hiding the sentence', () => {
    ({ editor, element } = mount({
      type: 'doc',
      content: [paragraph('p2', 'Keep this sentence')]
    }, [StarterKit, BlockId, NotebookWorkbenchDecorations]));
    setNotebookWorkbenchDecorations(editor, {
      savedMarks: [{
        trialKey: 'k',
        trialId: 't1',
        blockId: 'p2',
        baseText: 'Keep this sentence',
        rangeStart: 0,
        rangeEnd: 'Keep this sentence'.length
      }]
    });
    const prose = editor.view.dom.querySelector('.notebook-saved-alternatives__range');
    const button = editor.view.dom.querySelector('[data-saved-trial-id]');
    expect(prose.textContent).toBe('Keep this sentence');
    expect(prose.getAttribute('aria-hidden')).toBeNull();
    expect(button.getAttribute('aria-hidden')).toBeNull();
    const opened = jest.fn();
    setSavedTrialMarkHandler(opened);
    button.focus();
    button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    expect(opened).toHaveBeenCalledWith('t1');
    expect(editor.view.dom.textContent).toContain('Keep this sentence');
  });

  it('draws one bracket for one block id and does not label the passage', () => {
    ({ editor, element } = mount({
      type: 'doc',
      content: [paragraph('p1', 'First copy'), paragraph('p1', 'Second copy')]
    }, [StarterKit, BlockId, NotebookWorkbenchDecorations]));
    setNotebookWorkbenchDecorations(editor, { targetBlockId: 'p1' });
    expect(editor.view.dom.querySelectorAll('.notebook-held-target')).toHaveLength(1);
    expect(editor.view.dom.textContent).not.toContain('Passage will go here');
    expect(editor.view.dom.textContent).toContain('First copy');
    expect(editor.view.dom.textContent).toContain('Second copy');
  });

  it('brackets the highlighted range rather than the whole paragraph', () => {
    ({ editor, element } = mount({
      type: 'doc',
      content: [paragraph('p1', 'alpha beta alpha')]
    }, [StarterKit, BlockId, NotebookWorkbenchDecorations]));
    setNotebookWorkbenchDecorations(editor, {
      targetBlockId: 'p1',
      targetRange: { rangeStart: 11, rangeEnd: 16 }
    });
    expect(editor.view.dom.querySelector('.notebook-held-range').textContent).toBe('alpha');
    expect(editor.view.dom.querySelector('.notebook-held-target')).toBeNull();
  });
});

describe('split paragraphs keep distinct block ids', () => {
  it('assigns the new paragraph its own id', () => {
    let n = 0;
    const { editor, element } = mount({
      type: 'doc',
      content: [paragraph('same', 'Hello world')]
    }, [
      StarterKit,
      BlockId,
      UniqueBlockIds.configure({ createId: () => `new-${n += 1}` })
    ]);
    editor.commands.setTextSelection(12);
    editor.commands.splitBlock();
    const ids = [];
    editor.state.doc.descendants((node) => {
      if (node.attrs?.blockId) ids.push(node.attrs.blockId);
    });
    expect(ids).toEqual(['same', 'new-1']);
    editor.destroy();
    element.remove();
  });

  it('repairs duplicate ids already stored in the note', async () => {
    let n = 0;
    const { editor, element } = mount({
      type: 'doc',
      content: [paragraph('same', 'First copy'), paragraph('same', 'Second copy')]
    }, [
      StarterKit,
      BlockId,
      UniqueBlockIds.configure({ createId: () => `fresh-${n += 1}` })
    ]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const ids = [];
    editor.state.doc.descendants((node) => {
      if (node.attrs?.blockId) ids.push(node.attrs.blockId);
    });
    expect(ids).toEqual(['same', 'fresh-1']);
    editor.destroy();
    element.remove();
  });
});
