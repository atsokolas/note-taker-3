import { Editor } from '@tiptap/core';
import { notebookWritingExtensions } from './notebookWriting';
import { PENCIL_WRITTEN, pencilWordCount, writeIntoDraft } from './pencilLines';

const page = () => new Editor({
  extensions: notebookWritingExtensions(),
  content: '<h2 data-block-id="h">Coming back</h2><p data-block-id="a" data-pencil="">The page it stands on</p><p data-block-id="b" data-pencil="">A place it belongs</p>'
});
const pencils = editor => {
  const lines = [];
  editor.state.doc.descendants(node => { if (node.type.name === 'paragraph') lines.push(Boolean(node.attrs.pencil)); });
  return lines;
};
const endOf = (editor, blockId) => {
  let at = null;
  editor.state.doc.descendants((node, pos) => { if (node.attrs.blockId === blockId) at = pos + node.nodeSize - 1; });
  return at;
};

describe('pencil lines', () => {
  it('turn to ink one at a time, as you write over them', () => {
    const editor = page();
    expect(pencils(editor)).toEqual([true, true]);
    expect(pencilWordCount(editor.state.doc)).toBe(9);
    editor.chain().setTextSelection(endOf(editor, 'a')).insertContent(', always').run();
    expect(pencils(editor)).toEqual([false, true]);
    expect(editor.getHTML()).toContain('<p data-block-id="b" data-pencil="">');
    editor.destroy();
  });

  it('stay pencil when the whole page is loaded or written out', () => {
    const editor = page();
    editor.commands.setContent(editor.getJSON(), false);
    const tr = editor.state.tr.insertText('x', 1).setMeta(PENCIL_WRITTEN, true);
    editor.view.dispatch(tr);
    expect(pencils(editor)).toEqual([true, true]);
    editor.destroy();
  });

  it('stay pencil when you type in the heading above them', () => {
    const editor = page();
    editor.chain().setTextSelection(endOf(editor, 'h')).insertContent(' again').run();
    expect(pencils(editor)).toEqual([true, true]);
    editor.destroy();
  });
});

describe('writing a point out', () => {
  const point = [
    { type: 'heading', attrs: { level: 2, blockId: 'w' }, content: [{ type: 'text', text: 'Found by the question' }] },
    { type: 'paragraph', attrs: { blockId: 'w1', pencil: true }, content: [{ type: 'text', text: 'Smart Notes' }] }
  ];
  const kinds = editor => editor.getJSON().content.map(node => `${node.type}${node.attrs?.pencil ? ':pencil' : ''}:${node.content?.[0]?.text || ''}`);

  it('goes in after the passage you were writing in, caret at the end of the heading', () => {
    const editor = new Editor({ extensions: notebookWritingExtensions(), content: '<p>One.</p><p>Two.</p>' });
    editor.commands.setTextSelection(3);
    expect(writeIntoDraft(editor, point)).toBe(true);
    expect(kinds(editor)).toEqual(['paragraph:One.', 'heading:Found by the question', 'paragraph:pencil:Smart Notes', 'paragraph:Two.']);
    expect(editor.state.selection.$from.parent.textContent).toBe('Found by the question');
    editor.destroy();
  });

  it('takes the place of an empty line, and goes at the end when you were only reading', () => {
    const editor = new Editor({ extensions: notebookWritingExtensions(), content: '<p>One.</p><p></p>' });
    editor.commands.setTextSelection(editor.state.doc.content.size - 1);
    writeIntoDraft(editor, point);
    expect(kinds(editor)).toEqual(['paragraph:One.', 'heading:Found by the question', 'paragraph:pencil:Smart Notes']);
    editor.setEditable(false);
    editor.commands.setTextSelection(2);
    writeIntoDraft(editor, point.slice(0, 1));
    expect(kinds(editor).at(-1)).toBe('heading:Found by the question');
    editor.destroy();
  });
});
