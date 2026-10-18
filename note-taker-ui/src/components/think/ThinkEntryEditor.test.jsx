import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ThinkEntryEditor from './ThinkEntryEditor';
import api from '../../api';
import { getConcept, getConceptIdeaWorkbench, renameConcept, updateConcept, updateConceptIdeaWorkbench } from '../../api/concepts';
import { getConceptQuestions, getQuestion, updateQuestion } from '../../api/questions';
import { settleIntoWiki } from '../../api/wiki';

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
jest.mock('./questions/QuestionShareModal', () => () => null);
jest.mock('../../hooks/useHighlights', () => () => ({ highlights: [], highlightMap: new Map() }));
jest.mock('../../api/concepts', () => ({
  getConcept: jest.fn(), getConceptIdeaWorkbench: jest.fn(), renameConcept: jest.fn(), updateConcept: jest.fn(), updateConceptIdeaWorkbench: jest.fn()
}));
jest.mock('../../api', () => ({ __esModule: true, default: { get: jest.fn() } }));
jest.mock('../../api/questions', () => ({ getConceptQuestions: jest.fn(), getQuestion: jest.fn(), updateQuestion: jest.fn() }));
jest.mock('../../api/wiki', () => ({ settleIntoWiki: jest.fn() }));

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
    expect(await screen.findByRole('textbox', { name: 'Concept name' })).not.toHaveAttribute('readonly');
    expect(getConceptIdeaWorkbench).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: 'Costco letter' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Does the moat hold?' })).toHaveAttribute('href', '/think?tab=questions&questionId=q1');
    typeInBody();
    await act(async () => { await flush(); });
    expect(updateConcept).toHaveBeenCalledWith('Moats', {});
    expect(updateConceptIdeaWorkbench).toHaveBeenCalledWith('c1', { hypothesis: { html: '<p>Three plain words</p>' } }, { baseRevision: 0 });
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ kind: 'concept' }));
  });

  it('settles a concept into Wiki the way a note does, and keeps the link', async () => {
    getConcept.mockResolvedValue({ _id: 'c1', name: 'Moats', pinnedHighlights: [] });
    getConceptIdeaWorkbench.mockResolvedValue({ revision: 1, ideaWorkbench: { hypothesis: { html: '<p>Three plain words</p>' } } });
    settleIntoWiki.mockResolvedValueOnce({ page: { _id: 'page-1', title: 'Moats', sourceRefs: [{}] }, resettled: false });
    render(<ThinkEntryEditor target={{ kind: 'concept', id: 'Moats' }} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Settle into Wiki' }));
    expect(screen.queryByRole('button', { name: 'Share' })).not.toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Moats' })).toHaveAttribute('href', '/wiki/read/page-1');
    expect(settleIntoWiki).toHaveBeenCalledWith('concepts', 'c1');
    expect(screen.getByText(/Share it from there/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Settle again' })).toBeInTheDocument();
  });

  it('says in one line what to fix when Wiki refuses a concept, and a question has no settle', async () => {
    getConcept.mockResolvedValue({ _id: 'c1', name: 'Moats', settledIn: null });
    getConceptIdeaWorkbench.mockResolvedValue({ revision: 1, ideaWorkbench: null });
    settleIntoWiki.mockRejectedValueOnce({ response: { data: { error: 'Nothing is written here yet. Write the thought, then settle it.' } } });
    const { unmount } = render(<ThinkEntryEditor target={{ kind: 'concept', id: 'Moats' }} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Settle into Wiki' }));
    expect(await screen.findByText('Nothing is written here yet. Write the thought, then settle it.')).toBeInTheDocument();
    unmount();
    getQuestion.mockResolvedValue({ _id: 'q1', text: 'Q', status: 'open', blocks: [] });
    render(<ThinkEntryEditor target={{ kind: 'question', id: 'q1' }} />);
    await screen.findByRole('button', { name: 'Mark settled' });
    expect(screen.queryByRole('button', { name: 'Settle into Wiki' })).not.toBeInTheDocument();
  });

  it('hands a selection to the partner and opens passages when pulled from elsewhere', async () => {
    getQuestion.mockResolvedValue({ _id: 'q1', text: 'Q', status: 'open', blocks: [] });
    const onAsk = jest.fn();
    render(<ThinkEntryEditor target={{ kind: 'question', id: 'q1' }} onAsk={onAsk} startPull />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ask about selection' }));
    expect(onAsk).toHaveBeenCalledWith('a sentence');
    expect(await screen.findByText('Choose a passage')).toBeInTheDocument();
  });

  it('renames a concept in place: Enter renames it everywhere, Esc keeps the old name', async () => {
    getConcept.mockResolvedValue({ _id: 'c1', name: 'Moats' });
    getConceptIdeaWorkbench.mockResolvedValue({ revision: 2, ideaWorkbench: { hypothesis: { html: '<p>x</p>' } } });
    renameConcept.mockResolvedValue({ name: 'Durable advantage', previousName: 'Moats', conceptId: 'c1', notes: 2 });
    const onRenamed = jest.fn();
    render(<ThinkEntryEditor target={{ kind: 'concept', id: 'Moats' }} onRenamed={onRenamed} />);
    const name = await screen.findByRole('textbox', { name: 'Concept name' });

    fireEvent.change(name, { target: { value: 'Something else' } });
    fireEvent.keyDown(name, { key: 'Escape' });
    expect(name).toHaveValue('Moats');
    expect(renameConcept).not.toHaveBeenCalled();

    fireEvent.change(name, { target: { value: '  Durable  advantage ' } });
    fireEvent.keyDown(name, { key: 'Enter' });
    await waitFor(() => expect(onRenamed).toHaveBeenCalledWith({ name: 'Durable advantage', previousName: 'Moats', conceptId: 'c1', notes: 2 }));
    expect(screen.getByText('Renamed where you mentioned it, in 2 notes.')).toBeInTheDocument();
    expect(renameConcept).toHaveBeenCalledWith('c1', 'Durable advantage');
    expect(name).toHaveValue('Durable advantage');
  });

  it('says plainly when the new name is already a concept, and keeps the old one', async () => {
    getConcept.mockResolvedValue({ _id: 'c1', name: 'Moats' });
    getConceptIdeaWorkbench.mockResolvedValue({ revision: 2, ideaWorkbench: null });
    renameConcept.mockRejectedValue({ response: { status: 409, data: { error: 'You already have a concept called “Pricing power”.' } } });
    const onRenamed = jest.fn();
    render(<ThinkEntryEditor target={{ kind: 'concept', id: 'Moats' }} onRenamed={onRenamed} />);
    const name = await screen.findByRole('textbox', { name: 'Concept name' });
    fireEvent.change(name, { target: { value: 'Pricing power' } });
    fireEvent.keyDown(name, { key: 'Enter' });
    expect(await screen.findByRole('alert')).toHaveTextContent('You already have a concept called “Pricing power”.');
    expect(onRenamed).not.toHaveBeenCalled();
    fireEvent.blur(name);
    expect(name).toHaveValue('Moats');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('reads its history as sentences and restores an earlier version through the ordinary save', async () => {
    getQuestion.mockResolvedValue({ _id: 'q1', text: 'Does the moat hold?', status: 'open', blocks: [] });
    updateQuestion.mockResolvedValue({ _id: 'q1', text: 'Does the moat hold?' });
    const older = { id: 'r1', reason: 'edit', at: '2026-10-10T09:00:00.000Z', snapshot: { title: 'Does the moat hold?', blocks: [] } };
    const newer = {
      id: 'r2',
      reason: 'edit',
      at: '2026-10-12T09:00:00.000Z',
      snapshot: {
        title: 'Does the moat hold?',
        blocks: [
          { id: 'b1', type: 'paragraph', text: 'Members renew.' },
          { id: 'b2', type: 'paragraph', text: 'Fees are the business.' },
          { id: 'b3', type: 'highlight_embed', highlightId: 'h1', text: 'Renewal rates', articleTitle: 'Ben Carlson' }
        ]
      }
    };
    api.get.mockResolvedValue({ data: { revisions: [newer, older] } });
    render(<ThinkEntryEditor target={{ kind: 'question', id: 'q1' }} />);
    fireEvent.click(await screen.findByRole('button', { name: 'History' }));
    expect(await screen.findByText('Added two paragraphs and a passage from Ben Carlson.')).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/api/think/history/question/q1', expect.anything());
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    await waitFor(() => expect(updateQuestion).toHaveBeenCalledWith('q1', expect.objectContaining({ restoredFrom: 'r1' })));
    expect(await screen.findByText(/Restored the version from/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument();
  });
});
