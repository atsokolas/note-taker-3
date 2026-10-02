import { readySavedTrialMarks } from './notebookSavedTrialMarks';

const editorFor = ({ blockId = 'p1', currentText = 'Current words' } = {}) => {
  const node = { attrs: { blockId }, textContent: currentText, nodeSize: currentText.length + 2, content: { size: currentText.length }, isTextblock: true };
  return {
    state: {
      doc: { descendants: (callback) => callback(node, 3) }
    }
  };
};

describe('readySavedTrialMarks', () => {
  it('returns a mark only when wording is saved and the anchor is current', () => {
    const editor = editorFor();
    const marks = readySavedTrialMarks(editor, [{
      id: 't1',
      target: { blockId: 'p1', baseText: 'Current words' },
      alternative: 'Other words'
    }]);
    expect(marks).toHaveLength(1);
    expect(marks[0].from).toBe(4);
    expect(marks[0].to).toBe(17);
  });

  it('skips stale anchors and empty alternatives', () => {
    const editor = editorFor({ currentText: 'Newer words' });
    expect(readySavedTrialMarks(editor, [{
      id: 't1',
      target: { blockId: 'p1', baseText: 'Older words' },
      alternative: 'Trial words'
    }])).toEqual([]);
    expect(readySavedTrialMarks(editorFor(), [{
      id: 't1',
      target: { blockId: 'p1', baseText: 'Current words' },
      alternative: ''
    }])).toEqual([]);
  });

  it('scopes marks to word ranges', () => {
    const baseText = 'Expert guidance is available.';
    const editor = editorFor({ currentText: baseText });
    const marks = readySavedTrialMarks(editor, [{
      id: 't1',
      target: { blockId: 'p1', baseText, scope: 'word', rangeStart: 7, rangeEnd: 15 },
      alternative: 'help'
    }]);
    expect(marks[0].to - marks[0].from).toBe(8);
  });
});
