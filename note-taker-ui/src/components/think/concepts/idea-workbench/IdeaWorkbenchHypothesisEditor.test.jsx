import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import IdeaWorkbenchHypothesisEditor from './IdeaWorkbenchHypothesisEditor';

const mockUseEditor = jest.fn();
const mockChain = {
  focus: jest.fn(() => mockChain),
  toggleHeading: jest.fn(() => mockChain),
  toggleBold: jest.fn(() => mockChain),
  toggleItalic: jest.fn(() => mockChain),
  toggleBulletList: jest.fn(() => mockChain),
  toggleOrderedList: jest.fn(() => mockChain),
  toggleBlockquote: jest.fn(() => mockChain),
  run: jest.fn(() => true)
};

const mockEditor = {
  chain: jest.fn(() => mockChain),
  isActive: jest.fn(() => false),
  state: {
    selection: {
      from: 0,
      $from: {
        index: jest.fn(() => 0)
      }
    }
  },
  view: {
    coordsAtPos: jest.fn(() => ({ left: 0, right: 0, top: 0, bottom: 0 }))
  },
  commands: {
    setContent: jest.fn(),
    insertContent: jest.fn()
  },
  // EditorDraftShell's magnetCaretToolbar effect subscribes to TipTap events;
  // the mock needs the on/off listener API or those tests crash on mount.
  on: jest.fn(),
  off: jest.fn(),
  getHTML: jest.fn(() => '<p>Draft</p>'),
  getJSON: jest.fn(() => ({ type: 'doc', content: [] }))
};

jest.mock('@tiptap/react', () => ({
  EditorContent: ({ editor }) => <div data-testid="hypothesis-editor">{editor ? 'ready' : 'missing'}</div>,
  useEditor: (...args) => mockUseEditor(...args)
}));

jest.mock('@dnd-kit/core', () => ({
  useDroppable: () => ({ isOver: false, setNodeRef: jest.fn() })
}));

describe('IdeaWorkbenchHypothesisEditor', () => {
  beforeEach(() => {
    mockUseEditor.mockReturnValue(mockEditor);
    mockEditor.chain.mockReturnValue(mockChain);
    mockEditor.chain.mockClear();
    mockEditor.isActive.mockImplementation(() => false);
    Object.values(mockChain).forEach((value) => {
      if (typeof value === 'function') value.mockClear?.();
    });
    mockChain.focus.mockReturnValue(mockChain);
    mockChain.toggleHeading.mockReturnValue(mockChain);
    mockChain.toggleBold.mockReturnValue(mockChain);
    mockChain.toggleItalic.mockReturnValue(mockChain);
    mockChain.toggleBulletList.mockReturnValue(mockChain);
    mockChain.toggleOrderedList.mockReturnValue(mockChain);
    mockChain.toggleBlockquote.mockReturnValue(mockChain);
    mockChain.run.mockReturnValue(true);
    mockEditor.commands.setContent.mockClear();
    mockEditor.commands.insertContent.mockClear();
    mockEditor.getJSON.mockClear();
    mockEditor.state.selection.$from.index.mockReturnValue(0);
  });

  it('renders a slimmer core formatting toolbar for concept drafting', () => {
    render(
      <IdeaWorkbenchHypothesisEditor
        value="<p>Draft</p>"
        onChange={jest.fn()}
      />
    );

    expect(screen.getByText(/Type \/ for commands/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Move up' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Move down' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bold' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Italic' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Heading' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bulleted list' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Numbered list' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Quote' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Evidence block' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Question block' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Title' })).not.toBeInTheDocument();
  });

  it('uses editor commands for concept toolbar actions', () => {
    render(
      <IdeaWorkbenchHypothesisEditor
        value="<p>Draft</p>"
        onChange={jest.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Numbered list' }));
    fireEvent.click(screen.getByRole('button', { name: 'Quote' }));

    expect(mockEditor.chain).toHaveBeenCalled();
    expect(mockChain.toggleOrderedList).toHaveBeenCalled();
    expect(mockChain.toggleBlockquote).toHaveBeenCalled();
  });

  it('moves the current concept block up from the helper controls', () => {
    mockEditor.getJSON.mockReturnValue({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'A' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'B' }] }
      ]
    });
    mockEditor.state.selection.$from.index.mockReturnValue(1);

    render(
      <IdeaWorkbenchHypothesisEditor
        value="<p>Draft</p>"
        onChange={jest.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Move up' }));

    expect(mockEditor.commands.setContent).toHaveBeenCalledWith({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'B' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'A' }] }
      ]
    }, false);
  });

  it('keeps the slash helper visible even when the toolbar is hidden for a fresh concept', () => {
    render(
      <IdeaWorkbenchHypothesisEditor
        value="<p>Draft</p>"
        onChange={jest.fn()}
        hideToolbar
      />
    );

    expect(screen.getByText(/Type \/ for commands/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Bold' })).not.toBeInTheDocument();
  });

  it('inserts an evidence block from the visible draft block actions', () => {
    render(
      <IdeaWorkbenchHypothesisEditor
        value="<p>Draft</p>"
        onChange={jest.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Evidence block' }));

    expect(mockEditor.commands.insertContent).toHaveBeenCalledWith([
      {
        type: 'blockquote',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Supporting evidence or quoted material.' }]
          }
        ]
      },
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'Why it matters: ' }]
      }
    ]);
  });
});
