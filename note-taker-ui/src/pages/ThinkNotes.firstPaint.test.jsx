import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ThinkNotes from './ThinkNotes';
import authoredExplorations from '../api/authoredExplorations';
import api from '../api';

jest.mock('../api/authoredExplorations', () => ({ __esModule: true, default: { list: jest.fn(), search: jest.fn() } }));
import { getNotebookShelf } from '../api/notebook';
import { getConcepts, updateConcept } from '../api/concepts';
import { createQuestion, getQuestions } from '../api/questions';
import { getAgentThread } from '../api/agent';
import { getHighlights } from '../api/highlights';

jest.mock('../api/notebook', () => ({
  clearNotebookCache: jest.fn(),
  getNotebookShelf: jest.fn()
}));

jest.mock('../api', () => ({
  __esModule: true,
  default: { get: jest.fn(), put: jest.fn(), post: jest.fn() }
}));

const mockFlush = jest.fn();
const mockNavigate = jest.fn();
jest.mock('../components/think/notebook/NotebookEditor', () => ({ entry, onSave, onRegisterSave, startWriting, onInvokeAgentSkill }) => {
  const React = require('react');
  React.useEffect(() => { onRegisterSave(mockFlush); return () => onRegisterSave(null); }, [onRegisterSave]);
  return <div><span>Editor</span><output data-testid="open-note" data-writing={String(startWriting)}>{entry._id}</output>
    <button onClick={() => onSave({id:entry._id, title:'A note of my own', content:'My words', blocks:[]})}>Save test words</button>
    <button onClick={() => onInvokeAgentSkill({ id: 'ask-1', mode: 'draft', prompt: 'Sharpen this.', contextType: 'notebook', contextId: entry._id, contextTitle: entry.title })}>Ask about the note</button></div>;
});
jest.mock('../components/think/ThinkEntryEditor', () => ({ target, onLoaded, onAsk }) => {
  const React = require('react');
  React.useEffect(() => {
    onLoaded({ kind: target.kind, title: target.kind === 'concept' ? 'Moats' : 'What would change my mind?', record: { _id: target.kind === 'concept' ? 'c1' : target.id } });
  }, [target.kind, target.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return <div><output data-testid="open-entry">{`${target.kind}:${target.id}`}</output>
    <button onClick={() => onAsk('the exact passage')}>Ask about the selection</button></div>;
});
jest.mock('../api/concepts', () => ({ getConcepts: jest.fn(), updateConcept: jest.fn() }));
jest.mock('../api/questions', () => ({ getQuestions: jest.fn(), createQuestion: jest.fn() }));
jest.mock('../api/agent', () => ({ getAgentThread: jest.fn() }));
jest.mock('../api/highlights', () => ({ getHighlights: jest.fn() }));

// setupTests supplies a static router stub. This suite needs URL changes to
// drive the real component's note identity, including Back and delayed reads.
jest.mock('react-router-dom', () => {
  const React = require('react');
  return {
    MemoryRouter: ({children}) => children,
    useNavigate: () => mockNavigate,
    Link: ({to, children, ...props}) => <a href={to} {...props}>{children}</a>,
    useSearchParams: () => {
      const [search, setSearch] = React.useState(() => global.window.location.search);
      React.useEffect(() => {
        const pop = () => setSearch(global.window.location.search);
        global.window.addEventListener('popstate', pop);
        return () => global.window.removeEventListener('popstate', pop);
      }, []);
      const navigate = React.useCallback(next => {
        const value = new URLSearchParams(next).toString();
        global.window.history.replaceState({}, '', `/think?${value}`);
        React.startTransition(() => setSearch(value));
      }, []);
      return [new URLSearchParams(search), navigate];
    }
  };
});
const mockAsk = jest.fn();
const mockAdoptThread = jest.fn();
const mockPartnerSurface = jest.fn();
jest.mock('../agent/AgentRailContext', () => ({
  useAgentRail: () => ({ ask: mockAsk, adoptThread: mockAdoptThread }),
  useNoeisAgentSurface: (...args) => mockPartnerSurface(...args)
}));
const partnerSees = () => mockPartnerSurface.mock.calls.at(-1)?.[1] || {};
jest.mock('../motion/columnMotion', () => ({ takeFirstPaint: () => false }));

describe('ThinkNotes first paint', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.history.replaceState({}, '', '/think');
    mockFlush.mockResolvedValue(true);
    api.get.mockImplementation(async path => ({data:{_id:path.split('/').pop(), title:'A real note'}}));
    authoredExplorations.list.mockResolvedValue([]);
    authoredExplorations.search.mockResolvedValue({ results: [], limited: false });
    getNotebookShelf.mockResolvedValue([]);
    getConcepts.mockResolvedValue([]);
    getQuestions.mockResolvedValue([]);
    getHighlights.mockResolvedValue([]);
  });
  it('does not call the list empty before it has loaded', async () => {
    let resolveShelf;
    getNotebookShelf.mockReturnValue(new Promise(resolve => { resolveShelf = resolve; }));

    render(<MemoryRouter><ThinkNotes /></MemoryRouter>);

    expect(screen.queryByText('Nothing written yet.')).toBeNull();
    expect(screen.getByRole('button', { name: /New note/ })).toBeDisabled();

    await act(async () => {
      resolveShelf([{ _id: 'note-1', title: 'A real note', updatedAt: '2026-08-29T12:00:00.000Z' }]);
    });

    expect(await screen.findByRole('button', { name: 'A real note' })).toBeInTheDocument();
  });

  it('keeps notes, concepts and questions in one list, with the kind as a chip', async () => {
    getNotebookShelf.mockResolvedValue([{ _id: 'note-1', title: 'A real note', updatedAt: '2026-08-01T00:00:00.000Z' }]);
    getConcepts.mockResolvedValue([{ _id: 'c1', name: 'Moats', updatedAt: '2026-08-03T00:00:00.000Z' }, { _id: '', name: 'just-a-tag' }]);
    getQuestions.mockResolvedValue([{ _id: 'q1', text: 'What would change my mind?', status: 'answered', updatedAt: '2026-08-02T00:00:00.000Z' }]);
    render(<ThinkNotes />);
    const list = await screen.findByRole('region', { name: 'Recent' });
    await waitFor(() => expect(within(list).getAllByRole('button').map(button => button.textContent)).toEqual([
      'Moatsconcept', 'What would change my mind?settled question', 'A real note'
    ]));
    expect(screen.queryByText('Concept workspace')).toBeNull();
    expect(screen.queryByText(/Builder mode|Challenger mode|Generative|Dialectical/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Concepts' }));
    expect(await within(screen.getByRole('region', { name: 'Concepts' })).findByRole('button', { name: /just-a-tag/ })).toBeInTheDocument();
  });

  it('opens ?tab=questions on its newest question in the same editor', async () => {
    window.history.replaceState({}, '', '/think?tab=questions');
    getQuestions.mockResolvedValue([
      { _id: 'q-old', text: 'Older', updatedAt: '2026-01-01T00:00:00.000Z' },
      { _id: 'q-new', text: 'Newer', updatedAt: '2026-02-01T00:00:00.000Z' }
    ]);
    render(<ThinkNotes />);
    await waitFor(() => expect(screen.getByTestId('open-entry')).toHaveTextContent('question:q-new'));
    expect(window.location.search).toContain('questionId=q-new');
  });

  /* The queued-prompt coverage that used to live in ThinkMode's templates
     suite: the Partner is bound to every kind of entry and is asked about a
     selection from it. */
  it.each([
    ['tab=concepts&concept=Moats', 'concept', 'c1', 'Moats'],
    ['tab=questions&questionId=q1', 'question', 'q1', 'What would change my mind?']
  ])('binds the Partner to %s and asks it about a selection', async (search, objectType, objectId, title) => {
    window.history.replaceState({}, '', `/think?${search}`);
    render(<ThinkNotes />);
    await screen.findByTestId('open-entry');
    await waitFor(() => expect(partnerSees()).toMatchObject({ room: 'think', objectType, objectId, title }));
    expect(mockPartnerSurface.mock.calls.at(-1)[0]).toBe('agent-surface.think');
    fireEvent.click(screen.getByRole('button', { name: 'Ask about the selection' }));
    expect(mockAsk).toHaveBeenCalledWith(expect.stringContaining('the exact passage'));
    expect(mockAsk.mock.calls[0][0]).toContain(title);
  });

  it('asks the Partner about the note it is bound to, and lets it try wording', async () => {
    getNotebookShelf.mockResolvedValue([{ _id: 'note-1', title: 'A real note' }]);
    render(<ThinkNotes />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ask about the note' }));
    expect(mockAsk).toHaveBeenCalledWith('Sharpen this.');
    await waitFor(() => expect(partnerSees()).toMatchObject({ objectType: 'notebook', objectId: 'note-1' }));
    expect(mockPartnerSurface.mock.calls.at(-1)[3]).toHaveProperty('onTryWording');
    expect(screen.queryByRole('tab', { name: 'Partner' })).toBeNull();
  });

  it('opens a saved conversation in the Partner', async () => {
    window.history.replaceState({}, '', '/think?threadId=t1');
    const opened = jest.fn();
    window.addEventListener('noeis:open-agent', opened);
    getAgentThread.mockResolvedValue({ thread: { threadId: 't1', messages: [] } });
    getNotebookShelf.mockResolvedValue([{ _id: 'note-1', title: 'A real note' }]);
    render(<ThinkNotes />);
    await waitFor(() => expect(mockAdoptThread).toHaveBeenCalledWith({ threadId: 't1', messages: [] }));
    expect(opened).toHaveBeenCalled();
    window.removeEventListener('noeis:open-agent', opened);
  });

  it('starts a concept or a question from the list by naming it', async () => {
    updateConcept.mockResolvedValue({ _id: 'c9', name: 'Optionality' });
    createQuestion.mockResolvedValue({ _id: 'q9', text: 'Is it worth it?' });
    render(<ThinkNotes />);
    fireEvent.click(await screen.findByRole('button', { name: 'concept' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Name the concept' }), { target: { value: 'Optionality' } });
    fireEvent.submit(screen.getByRole('textbox', { name: 'Name the concept' }));
    await waitFor(() => expect(screen.getByTestId('open-entry')).toHaveTextContent('concept:Optionality'));
    expect(updateConcept).toHaveBeenCalledWith('Optionality', {});
    fireEvent.click(screen.getByRole('button', { name: 'question' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Ask the question' }), { target: { value: 'Is it worth it?' } });
    fireEvent.submit(screen.getByRole('textbox', { name: 'Ask the question' }));
    await waitFor(() => expect(screen.getByTestId('open-entry')).toHaveTextContent('question:q9'));
  });

  it('loads private return links independently and leaves the partner context private', async () => {
    getNotebookShelf.mockReturnValue(new Promise(() => {}));
    authoredExplorations.list.mockResolvedValue([{ id: 'work-1', pageId: 'page-1', claimId: 'claim-1', title: 'Room to return', returnNote: 'Test the exception.', pageTitle: 'Product strategy' }]);
    render(<MemoryRouter initialEntries={['/think']}><ThinkNotes /></MemoryRouter>);
    const work = await screen.findByRole('region', { name: 'Your writing' });
    expect(within(work).getByRole('link')).toHaveAttribute('href', '/wiki/read/page-1?claimId=claim-1&exploration=1');
    expect(within(work).getByText('Test the exception.')).toBeInTheDocument();
    expect(screen.getByText('Opening your last note…')).toBeInTheDocument();
    expect(mockPartnerSurface).toHaveBeenCalled();
    expect(JSON.stringify(mockPartnerSurface.mock.calls)).not.toContain('Test the exception.');
    expect(api.put).not.toHaveBeenCalled();
  });

  it('keeps the note usable when private writing cannot load', async () => {
    getNotebookShelf.mockResolvedValue([{ _id: 'note-1', title: 'A real note' }]);
    api.get.mockResolvedValue({ data: { _id: 'note-1', title: 'A real note' } });
    authoredExplorations.list.mockRejectedValue(new Error('Offline'));
    render(<MemoryRouter initialEntries={['/think']}><ThinkNotes /></MemoryRouter>);
    expect(await screen.findByText('Your saved writing could not be loaded. Reload to try again.')).toBeInTheDocument();
    expect(await screen.findByText('Editor')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Your writing' })).not.toBeInTheDocument();
  });

  it('adds no writing section when the account has no meaningful work', async () => {
    render(<MemoryRouter initialEntries={['/think']}><ThinkNotes /></MemoryRouter>);
    await screen.findByText('A thought does not need a source to begin. Start a note and see where it takes you.');
    expect(screen.queryByRole('region', { name: 'Your writing' })).not.toBeInTheDocument();
  });

  it('opens an empty notebook on the last mark and thinks with it in a new note', async () => {
    getHighlights.mockResolvedValue([{ _id: 'h-1', articleTitle: 'Why checklists beat expertise', text: 'Procedure handles the predictable.', note: 'So judgment is spent elsewhere.' }]);
    api.post.mockImplementation(async path => ({ data: { _id: 'new-note', title: '', blocks: path.endsWith('append-highlight') ? [{ type: 'highlight-ref', highlightId: 'h-1' }] : [] } }));
    render(<ThinkNotes />);
    const mark = await screen.findByRole('region', { name: 'Your last mark' });
    expect(within(mark).getByText('Your last mark, from Why checklists beat expertise')).toBeInTheDocument();
    expect(within(mark).getByText('Procedure handles the predictable.')).toBeInTheDocument();
    expect(within(mark).getByText('You wrote: So judgment is spent elsewhere.')).toBeInTheDocument();
    expect(getHighlights).toHaveBeenCalledWith({ limit: 1 });
    fireEvent.click(within(mark).getByRole('button', { name: 'Think with it' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(2));
    expect(api.post.mock.calls[1].slice(0, 2)).toEqual(['/api/notebook/new-note/append-highlight', { highlightId: 'h-1' }]);
    expect(await screen.findByTestId('open-note')).toHaveTextContent('new-note');
  });

  it('keeps the new note open when the passage cannot be quoted into it', async () => {
    getHighlights.mockResolvedValue([{ _id: 'h-gone', text: 'A passage deleted in another tab.' }]);
    api.post.mockImplementation(async path => {
      if (path.endsWith('append-highlight')) throw new Error('Highlight not found');
      return { data: { _id: 'kept-note', title: '', blocks: [] } };
    });
    render(<ThinkNotes />);
    fireEvent.click(await screen.findByRole('button', { name: 'Think with it' }));
    expect(await screen.findByTestId('open-note')).toHaveTextContent('kept-note');
    expect(screen.getByText('The note is open, but the passage could not be quoted into it. Add it from Library.')).toBeInTheDocument();
    expect(api.post).toHaveBeenCalledTimes(2);
  });

  it('starts one ordinary note, opens it for writing and saves without inventing a source', async () => {
    let finishCreate;
    api.post.mockReturnValue(new Promise(resolve => { finishCreate = resolve; }));
    api.put.mockImplementation(async (path, payload) => ({data:{...payload,_id:payload.id}}));
    render(<ThinkNotes />);
    await screen.findByText('A thought does not need a source to begin. Start a note and see where it takes you.');
    expect(api.post).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /New note/ }));
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    expect(api.post.mock.calls[0].slice(0,2)).toEqual(['/api/notebook', {title:'', content:'', blocks:[], type:'note', source:'think'}]);
    await act(async () => finishCreate({data:{_id:'new-note',title:'Untitled',blocks:[]}}));
    expect(screen.getByTestId('open-note')).toHaveTextContent('new-note');
    expect(screen.getByTestId('open-note')).toHaveAttribute('data-writing','true');
    expect(window.location.search).toBe('?tab=notebook&entryId=new-note');
    fireEvent.click(screen.getByText('Save test words'));
    await waitFor(() => expect(screen.getByRole('button',{name:'A note of my own'})).toBeInTheDocument());
    expect(api.put).toHaveBeenCalledWith('/api/notebook/new-note', expect.objectContaining({content:'My words'}), expect.anything());
    expect(partnerSees().objectId).toBe('new-note');

    // Returning through browser history is reading, even for a note born here.
    act(() => { window.history.replaceState({}, '', '/think?entryId=older-note'); window.dispatchEvent(new PopStateEvent('popstate')); });
    await waitFor(() => expect(screen.getByTestId('open-note')).toHaveTextContent('older-note'));
    act(() => { window.history.replaceState({}, '', '/think?entryId=new-note'); window.dispatchEvent(new PopStateEvent('popstate')); });
    await waitFor(() => expect(screen.getByTestId('open-note')).toHaveTextContent('new-note'));
    expect(screen.getByTestId('open-note')).toHaveAttribute('data-writing', 'false');
  });

  it('uses requested note identity even outside the bounded shelf, and follows shelf selection and Back', async () => {
    window.history.replaceState({}, '', '/think?entryId=older-note');
    getNotebookShelf.mockResolvedValue([{_id:'recent-note',title:'Recent note'}]);
    render(<ThinkNotes />);
    await waitFor(() => expect(screen.getByTestId('open-note')).toHaveTextContent('older-note'));
    fireEvent.click(screen.getByRole('button',{name:'Recent note'}));
    await waitFor(() => expect(screen.getByTestId('open-note')).toHaveTextContent('recent-note'));
    expect(mockFlush).toHaveBeenCalledTimes(1);
    act(() => { window.history.replaceState({}, '', '/think?entryId=older-note'); window.dispatchEvent(new PopStateEvent('popstate')); });
    await waitFor(() => expect(screen.getByTestId('open-note')).toHaveTextContent('older-note'));
    expect(api.post).not.toHaveBeenCalled();
  });

  it('keeps the current note when a save cannot finish or creation cannot be confirmed', async () => {
    getNotebookShelf.mockResolvedValue([{_id:'note-1',title:'A real note'}]);
    render(<ThinkNotes />);
    await screen.findByText('Editor');
    mockFlush.mockResolvedValue(false);
    fireEvent.click(screen.getByRole('button', { name: /New note/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: /New note/ })).toBeEnabled());
    expect(api.post).not.toHaveBeenCalled();
    mockFlush.mockResolvedValue(true);
    api.post.mockRejectedValue(new Error('Acknowledgement lost'));
    fireEvent.click(screen.getByRole('button', { name: /New note/ }));
    await screen.findByText('Could not confirm the new note. Reload Think to check your recent notes before trying again.');
    expect(screen.getByTestId('open-note')).toHaveTextContent('note-1');
    expect(api.post).toHaveBeenCalledTimes(1);
  });

  it('finds matching words without changing the open note or giving private matches to the partner', async () => {
    getNotebookShelf.mockResolvedValue([{ _id: 'note-1', title: 'A real note' }]);
    authoredExplorations.search.mockResolvedValue({ results: [{ kind: 'exploration', id: 'work-1', pageId: 'page-1', claimId: 'claim-1', title: 'Room to return', label: 'Question', excerpt: 'What makes room for the second attempt?', matchStart: 16, matchLength: 11 }], limited: false });
    render(<ThinkNotes />);
    await screen.findByText('Editor');
    const search = screen.getByRole('searchbox', { name: 'Find your writing' });
    search.focus();
    expect(search).toHaveFocus();
    fireEvent.change(search, { target: { value: 'the second' } });
    expect(screen.getByText('Looking through your writing…')).toBeInTheDocument();
    const results = await screen.findByRole('region', { name: 'Found in your writing' });
    const match = await within(results).findByRole('link', { name: /Room to return/ });
    expect(screen.getByTestId('open-note')).toHaveTextContent('note-1');
    expect(JSON.stringify(mockPartnerSurface.mock.calls)).not.toContain('What makes room');
    mockFlush.mockResolvedValue(false);
    fireEvent.click(match);
    await waitFor(() => expect(mockFlush).toHaveBeenCalled());
    expect(mockNavigate).not.toHaveBeenCalled();
    mockFlush.mockResolvedValue(true);
    fireEvent.click(match);
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/wiki/read/page-1?claimId=claim-1&exploration=1'));
    expect(window.location.search).toContain('find=the+second');
    fireEvent.keyDown(screen.getByRole('searchbox'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Found in your writing' })).not.toBeInTheDocument());
    expect(screen.getByRole('region', { name: 'Recent' })).toBeInTheDocument();
  });

  it('clears old matches immediately and ignores late replies after the query changes', async () => {
    let finishEarlier;
    authoredExplorations.search.mockImplementationOnce(() => new Promise(resolve => { finishEarlier = resolve; })).mockResolvedValue({ results: [], limited: false });
    render(<ThinkNotes />);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'earlier' } });
    await waitFor(() => expect(authoredExplorations.search).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'later' } });
    await screen.findByText('No saved writing matches these words.');
    await act(async () => finishEarlier({ results: [{kind:'notebook',id:'old',title:'Stale result',excerpt:'Earlier words'}] }));
    expect(screen.queryByText('Stale result')).not.toBeInTheDocument();
    expect(api.put).not.toHaveBeenCalled();
  });

  it('distinguishes an unavailable search from no matches and restores a bookmarked query', async () => {
    window.history.replaceState({}, '', '/think?find=remembered+words');
    authoredExplorations.search.mockRejectedValue(new Error('Offline'));
    render(<ThinkNotes />);
    expect(screen.getByRole('searchbox')).toHaveValue('remembered words');
    await screen.findByText('Your writing could not be searched. Change the phrase or clear it to return to recent work.');
    expect(screen.queryByText('No saved writing matches these words.')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back to recent work' }));
    await waitFor(() => expect(screen.getByRole('searchbox')).toHaveValue(''));
  });

 it('offers Work from the context selector without creating a Personal note', async () => {
   render(<ThinkNotes />);
   fireEvent.change(screen.getByLabelText('Knowledge context'), { target: { value: 'work' } });
   await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/think?context=work'));
   expect(api.post).not.toHaveBeenCalled();
 });

});
