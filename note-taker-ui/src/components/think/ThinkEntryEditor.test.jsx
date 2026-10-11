import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ThinkEntryEditor from './ThinkEntryEditor';
import { getConcept, getConceptIdeaWorkbench, updateConcept, updateConceptIdeaWorkbench } from '../../api/concepts';
import { getConceptQuestions, getQuestion, updateQuestion } from '../../api/questions';

const mockHandlers = {};
// Plain functions: the suite runs with resetMocks, which would empty jest.fn().
const mockEditor = {
  on: (name, handler) => { (mockHandlers[name] = mockHandlers[name] || new Set()).add(handler); },
  off: (name, handler) => { mockHandlers[name]?.delete(handler); },
  commands: { setContent: () => {}, focus: () => {} },
  chain: () => ({ focus: () => ({ insertContent: () => ({ run: () => true }) }) }),
  getText: () => 'Three plain words',
  getHTML: () => '<p>Three plain words</p>',
  getJSON: () => ({ type: 'doc', content: [{ type: 'paragraph', attrs: { blockId: 'b1' }, content: [{ type: 'text', text: 'Three plain words' }] }] }),
  state: { selection: { empty: true } }
};

jest.mock('@tiptap/react', () => ({
  useEditor: () => mockEditor,
  NodeViewWrapper: ({ children }) => <div>{children}</div>,
  ReactNodeViewRenderer: () => () => null
}));
jest.mock('./editor/EditorDraftShell', () => ({ onAskSelection }) => (
  <div data-testid="writing"><button type="button" onClick={() => onAskSelection('a sentence')}>Ask about selection</button></div>
));
jest.mock('./notebook/InsertHighlightModal', () => ({ open }) => (open ? <div>Choose a passage</div> : null));
jest.mock('./concepts/ConceptShareModal', () => () => null);
jest.mock('./questions/QuestionShareModal', () => () => null);
jest.mock('../../hooks/useHighlights', () => () => ({ highlights: [], highlightMap: new Map() }));
jest.mock('../../api/concepts', () => ({
  getConcept: jest.fn(), getConceptIdeaWorkbench: jest.fn(), updateConcept: jest.fn(), updateConceptIdeaWorkbench: jest.fn()
}));
jest.mock('../../api/questions', () => ({ getConceptQuestions: jest.fn(), getQuestion: jest.fn(), updateQuestion: jest.fn() }));

const typeInBody = () => act(() => { mockHandlers.update.forEach(handler => handler({ transaction: { docChanged: true } })); });

describe('ThinkEntryEditor', () => {
  beforeEach(() => {
    getConceptQuestions.mockResolvedValue([{ _id: 'q1', text: 'Does the moat hold?' }]);
  });

  it('opens a question with its own words as the heading and saves its blocks', async () => {
    getQuestion.mockResolvedValue({ _id: 'q1', text: 'Does the moat hold?', status: 'open', conceptName: 'Moats', blocks: [], createdAt: '2026-10-07T09:00:00.000Z' });
    updateQuestion.mockResolvedValue({ _id: 'q1', text: 'Does the moat still hold?', updatedAt: '2026-10-11T10:00:00.000Z' });
    let flush;
    render(<ThinkEntryEditor target={{ kind: 'question', id: 'q1' }} onRegisterSave={save => { if (save) flush = save; }} />);
    const title = await screen.findByRole('textbox', { name: 'Question' });
    expect(title).toHaveValue('Does the moat hold?');
    expect(screen.getByText('Begun Wednesday 7 October · 3 words')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Moats' })).toHaveAttribute('href', '/think?tab=concepts&concept=Moats');
    fireEvent.change(title, { target: { value: 'Does the moat still hold?' } });
    typeInBody();
    await act(async () => { expect(await flush()).toBe(true); });
    expect(updateQuestion).toHaveBeenCalledWith('q1', {
      text: 'Does the moat still hold?',
      blocks: [{ id: 'b1', type: 'paragraph', text: 'Three plain words' }]
    });
  });

  it('settles and reopens a question from the margin', async () => {
    getQuestion.mockResolvedValue({ _id: 'q1', text: 'Q', status: 'open', blocks: [] });
    updateQuestion.mockResolvedValue({ _id: 'q1', status: 'answered' });
    render(<ThinkEntryEditor target={{ kind: 'question', id: 'q1' }} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Mark settled' }));
    await waitFor(() => expect(updateQuestion).toHaveBeenCalledWith('q1', { status: 'answered' }));
    expect(await screen.findByRole('button', { name: 'Reopen' })).toBeInTheDocument();
  });

  it('writes a concept into its draft, making the concept first when it was only a tag', async () => {
    getConcept.mockResolvedValue({ _id: '', name: 'Moats', pinnedHighlights: [{ _id: 'h1', articleId: 'a1', articleTitle: 'Costco letter' }] });
    updateConcept.mockResolvedValue({ _id: 'c1', name: 'Moats' });
    updateConceptIdeaWorkbench.mockResolvedValue({ revision: 1, ideaWorkbench: { hypothesis: { html: '<p>Three plain words</p>' } } });
    const onSaved = jest.fn();
    let flush;
    render(<ThinkEntryEditor target={{ kind: 'concept', id: 'Moats' }} onSaved={onSaved} onRegisterSave={save => { if (save) flush = save; }} />);
    expect(await screen.findByRole('textbox', { name: 'Concept' })).toHaveAttribute('readonly');
    expect(getConceptIdeaWorkbench).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: 'Costco letter' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Does the moat hold?' })).toHaveAttribute('href', '/think?tab=questions&questionId=q1');
    typeInBody();
    await act(async () => { await flush(); });
    expect(updateConcept).toHaveBeenCalledWith('Moats', {});
    expect(updateConceptIdeaWorkbench).toHaveBeenCalledWith('c1', { hypothesis: { html: '<p>Three plain words</p>' } }, { baseRevision: 0 });
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ kind: 'concept' }));
  });

  it('hands a selection to the partner and opens passages when pulled from elsewhere', async () => {
    getQuestion.mockResolvedValue({ _id: 'q1', text: 'Q', status: 'open', blocks: [] });
    const onAsk = jest.fn();
    render(<ThinkEntryEditor target={{ kind: 'question', id: 'q1' }} onAsk={onAsk} startPull />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ask about selection' }));
    expect(onAsk).toHaveBeenCalledWith('a sentence');
    expect(await screen.findByText('Choose a passage')).toBeInTheDocument();
  });
});
