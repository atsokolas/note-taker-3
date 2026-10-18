import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { HighlightRefNode } from '../editor/writingParts';
import useGhostQuote, { GhostQuote } from './useGhostQuote';
import { fetchMarginNotes } from '../../../api/retrieval';

jest.mock('../../../api/retrieval', () => ({ fetchMarginNotes: jest.fn() }));

const writing = 'Surgeons resisted written checklists for years, insisting that judgment and memory were enough';
const passage = {
  _id: 'h1',
  text: 'A checklist is not a crutch for the inexpert but a net for the expert who forgets the obvious step.',
  articleId: 'a2',
  articleTitle: 'The Checklist Manifesto',
  tags: [],
  createdAt: '2026-03-04T00:00:00Z'
};

// The passage's schema without its React node view: the hook is under test, not the quote's look.
const PlainHighlightRef = HighlightRefNode.extend({ addNodeView: undefined });

const mount = (text) => {
  const main = document.createElement('main');
  const body = document.createElement('div');
  body.className = 'think-notebook-editor__body';
  main.appendChild(body);
  document.body.appendChild(main);
  const editor = new Editor({
    element: body,
    extensions: [StarterKit, PlainHighlightRef],
    content: `<p>${text}</p>`
  });
  return { editor, main };
};

let ghostApi = null;
const Harness = ({ editor }) => {
  const ghost = useGhostQuote(editor, { enabled: true, createId: () => 'block-quote' });
  ghostApi = ghost;
  return <GhostQuote ghost={ghost.ghost} onQuote={ghost.quote} />;
};

const typeAtEnd = (editor, words) => act(() => {
  editor.commands.setTextSelection(editor.state.doc.content.size - 1);
  editor.commands.insertContent(words);
});

const pause = async () => {
  await act(async () => { jest.advanceTimersByTime(1400); });
  await act(async () => {});
};

const box = (top, right) => ({ top, bottom: top + 40, left: 0, right, width: right, height: 40, x: 0, y: top });
// A desk-width page: the note column ends at 700px with a margin beside it.
const withMargin = () => jest.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function rect() {
  if (this.tagName === 'MAIN') return box(0, 1400);
  if (this.tagName === 'P') return box(120, 700);
  return box(0, 700);
});

const quotesIn = editor => editor.getJSON().content.filter(node => node.type === 'highlightRef');

describe('ghost quotes while writing', () => {
  let mounted;

  beforeEach(() => {
    document.elementFromPoint = () => null;
    jest.useFakeTimers();
    fetchMarginNotes.mockReset();
    fetchMarginNotes.mockResolvedValue([{ paragraph: 0, relation: 'close', highlight: passage }]);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    mounted?.editor.destroy();
    mounted?.main.remove();
    jest.useRealTimers();
  });

  it('waits for a pause in a long enough paragraph, then shows the closest passage beside it', async () => {
    mounted = mount(writing);
    withMargin();
    render(<Harness editor={mounted.editor} />);
    typeAtEnd(mounted.editor, ' in');
    expect(fetchMarginNotes).not.toHaveBeenCalled();
    await pause();
    expect(fetchMarginNotes).toHaveBeenCalledWith({ paragraphs: [`${writing} in`], excludeHighlightIds: [] });
    expect(screen.getByText(/You marked something close/)).toHaveTextContent('in The Checklist Manifesto');
    expect(screen.getByText(/A checklist is not a crutch/)).toBeInTheDocument();
    const note = document.querySelector('.library-margin-note');
    expect(note).toHaveClass('is-margin');
    expect(note.style.top).toBe('120px');
  });

  it('asks nothing about a paragraph too short to mean much', async () => {
    mounted = mount('Three words only');
    render(<Harness editor={mounted.editor} />);
    typeAtEnd(mounted.editor, ' here');
    await pause();
    expect(fetchMarginNotes).not.toHaveBeenCalled();
    expect(screen.queryByText(/You marked/)).toBeNull();
  });

  it('shows nothing when nothing close comes back', async () => {
    fetchMarginNotes.mockResolvedValue([]);
    mounted = mount(writing);
    const { container } = render(<Harness editor={mounted.editor} />);
    typeAtEnd(mounted.editor, ' in');
    await pause();
    expect(container).toBeEmptyDOMElement();
  });

  it('quotes the passage in with its citation on Tab at the end of the paragraph', async () => {
    mounted = mount(writing);
    render(<Harness editor={mounted.editor} />);
    typeAtEnd(mounted.editor, ' in');
    await pause();
    const prevented = jest.fn();
    let handled;
    act(() => { handled = ghostApi.handleKey({ key: 'Tab', preventDefault: prevented }); });
    expect(handled).toBe(true);
    expect(prevented).toHaveBeenCalled();
    expect(quotesIn(mounted.editor)).toEqual([expect.objectContaining({
      attrs: expect.objectContaining({
        highlightId: 'h1',
        highlightText: passage.text,
        articleTitle: 'The Checklist Manifesto',
        articleId: 'a2',
        sourcePath: expect.stringContaining('a2'),
        blockId: 'block-quote'
      })
    })]);
    expect(screen.queryByText(/You marked/)).toBeNull();
  });

  it('leaves Tab alone when the caret is not at the end of the paragraph', async () => {
    mounted = mount(writing);
    render(<Harness editor={mounted.editor} />);
    typeAtEnd(mounted.editor, ' in');
    await pause();
    act(() => { mounted.editor.commands.setTextSelection(3); });
    expect(ghostApi.handleKey({ key: 'Tab', preventDefault: jest.fn() })).toBe(false);
    expect(quotesIn(mounted.editor)).toEqual([]);
  });

  it('quotes the passage in on a click too', async () => {
    mounted = mount(writing);
    withMargin();
    render(<Harness editor={mounted.editor} />);
    typeAtEnd(mounted.editor, ' in');
    await pause();
    fireEvent.click(screen.getByRole('button', { name: /You marked something close/ }));
    expect(quotesIn(mounted.editor)).toHaveLength(1);
  });

  it('folds to a small mark on a narrow page, opened by a tap', async () => {
    mounted = mount(writing);
    jest.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(() => box(0, window.innerWidth - 16));
    render(<Harness editor={mounted.editor} />);
    typeAtEnd(mounted.editor, ' in');
    await pause();
    const mark = screen.getByRole('button', { name: 'Something you marked close to this, in The Checklist Manifesto' });
    expect(screen.queryByText(/A checklist is not a crutch/)).toBeNull();
    fireEvent.click(mark);
    expect(mark).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(screen.getByRole('button', { name: /You marked something close/ }));
    expect(quotesIn(mounted.editor)).toHaveLength(1);
  });

  it('lets the passage go on Esc, and does not offer it again this sitting', async () => {
    mounted = mount(writing);
    render(<Harness editor={mounted.editor} />);
    typeAtEnd(mounted.editor, ' in');
    await pause();
    act(() => { expect(ghostApi.handleKey({ key: 'Escape' })).toBe(true); });
    expect(screen.queryByText(/You marked/)).toBeNull();
    typeAtEnd(mounted.editor, ' the theatre');
    await pause();
    expect(fetchMarginNotes).toHaveBeenCalledTimes(2);
    expect(screen.queryByText(/You marked/)).toBeNull();
    expect(ghostApi.handleKey({ key: 'Escape' })).toBe(false);
  });
});
