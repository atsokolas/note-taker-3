import React, { useRef } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ArticleMargins, paragraphAt } from './LibraryMargins';
import { defaultQuestion, useMarginAsk } from './MarginAnswer';
import { fetchMarginNotes } from '../../api/retrieval';
import { streamChatWithAgent } from '../../api/agent';
import { useAgentRail } from '../../agent/AgentRailContext';

jest.mock('../../api/retrieval', () => ({ fetchMarginNotes: jest.fn() }));
jest.mock('../../api/agent', () => ({ streamChatWithAgent: jest.fn() }));
jest.mock('../../agent/AgentRailContext', () => ({ useAgentRail: jest.fn() }));
jest.mock('../../hooks/useMotionPreferences', () => ({
  usePrefersReducedMotion: () => true,
  useFinePointer: () => true
}));

const paragraph = 'Every expert forgets the obvious step at least once, and the cost of that lapse grows with the stakes of the work.';
const article = `<p>${paragraph}</p><p>A second paragraph that also runs long enough to be worth a margin of its own, truly.</p>`;
const passage = {
  _id: 'h9',
  text: 'A checklist is not a crutch for the inexpert but a net for the expert who forgets the obvious step.',
  articleId: 'a2',
  articleTitle: 'The Checklist Manifesto',
  createdAt: '2026-03-04T12:00:00Z'
};
const surface = { contractId: 'agent-surface.library', room: 'library', objectType: 'article', objectId: 'a1', subject: 'On error' };
const adoptThread = jest.fn();

let asking = null;
const Reader = ({ modelReads = true }) => {
  const frameRef = useRef(null);
  const contentRef = useRef(null);
  asking = useMarginAsk('a1', modelReads);
  return (
    <MemoryRouter>
      <div ref={frameRef}>
        <div ref={contentRef} dangerouslySetInnerHTML={{ __html: article }} />
        <ArticleMargins articleId="a1" contentRef={contentRef} frameRef={frameRef} contentKey={article} asking={asking} />
      </div>
    </MemoryRouter>
  );
};

const settle = () => act(async () => {});
const answering = (result, deltas = []) => streamChatWithAgent.mockImplementation(async (_payload, { onDelta }) => {
  deltas.forEach(delta => onDelta(delta));
  return result;
});
const QUOTED = 'The note answers it: “a net for the expert who forgets the obvious step.”';

describe('asking in the margin', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    fetchMarginNotes.mockResolvedValue([{ paragraph: 0, relation: 'close', highlight: passage }]);
    useAgentRail.mockReturnValue({ surface, threadId: 't1', adoptThread, canAsk: true });
  });

  it('offers no Ask without a model to read the piece', async () => {
    render(<Reader modelReads={false} />);
    await settle();
    expect(screen.getByRole('link')).toHaveTextContent('A checklist is not a crutch');
    expect(screen.queryByRole('button', { name: 'Ask' })).toBeNull();
  });

  it('offers no Ask when the Partner is not looking at this piece', async () => {
    useAgentRail.mockReturnValue({ surface: { ...surface, objectId: 'other' }, threadId: '', adoptThread, canAsk: true });
    render(<Reader />);
    await settle();
    expect(screen.queryByRole('button', { name: 'Ask' })).toBeNull();
  });

  it('offers no Ask where the Partner cannot ask', async () => {
    useAgentRail.mockReturnValue({ surface, threadId: '', adoptThread, canAsk: false });
    render(<Reader />);
    await settle();
    expect(screen.queryByRole('button', { name: 'Ask' })).toBeNull();
  });

  it('asks how the paragraph bears on the note, answers beside it, and links the quote to the passage', async () => {
    const thread = { threadId: 't1', messages: [] };
    answering({ reply: QUOTED, mode: 'hf_chat', thread, quotes: [{ quote: 'a net for the expert who forgets the obvious step.', type: 'article', id: 'a2', title: 'The Checklist Manifesto' }] }, ['The note ', 'answers it']);
    render(<Reader />);
    await settle();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Ask' })); });
    const [payload] = streamChatWithAgent.mock.calls[0];
    expect(payload.message).toBe('How does this paragraph bear on what I marked in The Checklist Manifesto?');
    expect(payload.threadId).toBe('t1');
    expect(payload.persistThread).toBe(true);
    expect(payload.context).toMatchObject({ type: 'article', id: 'a1', margin: { paragraph, selection: '', highlightId: 'h9' } });
    const card = screen.getByRole('region', { name: 'Partner on this paragraph' });
    expect(card).toHaveTextContent('The note answers it:');
    const quote = screen.getByRole('link', { name: '“a net for the expert who forgets the obvious step.”' });
    expect(quote.getAttribute('href')).toContain('articleId=a2');
    expect(quote.getAttribute('href')).toContain('h9');
    expect(adoptThread).toHaveBeenCalledWith(thread);

    const opened = jest.fn();
    window.addEventListener('noeis:open-agent', opened);
    fireEvent.click(screen.getByRole('button', { name: 'Continue in Partner' }));
    window.removeEventListener('noeis:open-agent', opened);
    expect(opened).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('region', { name: 'Partner on this paragraph' })).toBeNull();
  });

  it('leaves a quotation it cannot place unlinked', async () => {
    answering({ reply: QUOTED, mode: 'hf_chat', quotes: [] });
    render(<Reader />);
    await settle();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Ask' })); });
    const card = screen.getByRole('region', { name: 'Partner on this paragraph' });
    expect(card).toHaveTextContent(QUOTED);
    expect(card.querySelector('a')).toBeNull();
  });

  it('says one honest line when the turn fails, and invents nothing', async () => {
    streamChatWithAgent.mockRejectedValue(new Error('upstream'));
    render(<Reader />);
    await settle();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Ask' })); });
    const card = screen.getByRole('region', { name: 'Partner on this paragraph' });
    expect(card).toHaveTextContent('The Partner could not answer this time.');
    expect(screen.queryByRole('button', { name: 'Continue in Partner' })).toBeNull();
  });

  it('treats an empty reply as no answer', async () => {
    answering({ reply: '  ', mode: 'hf_chat' });
    render(<Reader />);
    await settle();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Ask' })); });
    expect(screen.getByRole('region', { name: 'Partner on this paragraph' })).toHaveTextContent('The Partner could not answer this time.');
  });

  it('says when the answer came from passages alone', async () => {
    answering({ reply: 'This is the passage in your library that bears on it.', mode: 'internal_only' });
    render(<Reader />);
    await settle();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Ask' })); });
    expect(screen.getByText('From your passages while the Partner rests.')).toBeInTheDocument();
  });

  it('asks the reader’s own question of the same paragraph, and closes on Escape', async () => {
    answering({ reply: 'An answer.', mode: 'hf_chat' });
    render(<Reader />);
    await settle();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Ask' })); });
    fireEvent.change(screen.getByRole('textbox', { name: 'Ask about this paragraph' }), { target: { value: 'Is the stake the point?' } });
    await act(async () => { fireEvent.submit(screen.getByRole('textbox', { name: 'Ask about this paragraph' })); });
    const [payload] = streamChatWithAgent.mock.calls[1];
    expect(payload.message).toBe('Is the stake the point?');
    expect(payload.context.margin).toMatchObject({ paragraph, highlightId: 'h9' });
    expect(screen.getByText('Is the stake the point?')).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Ask about this paragraph' }), { key: 'Escape' });
    expect(screen.queryByRole('region', { name: 'Partner on this paragraph' })).toBeNull();
  });

  it('answers a selection beside its paragraph even where no note is', async () => {
    fetchMarginNotes.mockResolvedValue([]);
    answering({ reply: 'An answer.', mode: 'hf_chat' });
    render(<Reader />);
    await settle();
    expect(document.querySelector('.library-margins')).toBeNull();
    const second = document.querySelectorAll('p')[1];
    const at = paragraphAt(second.parentElement, second.firstChild);
    expect(at.beside).toBe(1);
    await act(async () => { asking.ask({ ...at, selection: 'worth a margin' }); });
    expect(streamChatWithAgent.mock.calls[0][0].message).toBe('What in my library bears on this?');
    expect(streamChatWithAgent.mock.calls[0][0].context.margin).toMatchObject({ selection: 'worth a margin', highlightId: '' });
    expect(document.querySelector('.library-margin-answer')).toHaveTextContent('An answer.');
  });

  it('on a phone, asks from the mark’s paper card and answers in that same card', async () => {
    const width = window.innerWidth;
    window.innerWidth = 200;
    answering({ reply: 'An answer.', mode: 'hf_chat' });
    try {
      render(<Reader />);
      await settle();
      fireEvent.click(screen.getByRole('button', { name: /Something you marked close/ }));
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Ask' })); });
      const card = document.querySelector('.library-margin-note.is-mark .library-margin-note__card');
      expect(card).toHaveTextContent('An answer.');
      expect(document.querySelector('.library-margin-answer')).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: /Something you marked close/ }));
      expect(screen.queryByRole('region', { name: 'Partner on this paragraph' })).toBeNull();
    } finally {
      window.innerWidth = width;
    }
  });

  it('frames the default question by what it is asked of', () => {
    expect(defaultQuestion({ highlight: { text: 'x' } })).toBe('How does this paragraph bear on the passage I marked?');
    expect(defaultQuestion({})).toBe('What in my library bears on this paragraph?');
  });
});
