import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import WikiPageEditor from './WikiPageEditor';
import { addWikiSource, draftWikiPage, getWikiPage, removeWikiSource, updateWikiPage } from '../../api/wiki';

const mockUseEditor = jest.fn();
const mockEditor = {
  commands: {
    insertContent: jest.fn(),
    setContent: jest.fn()
  },
  getJSON: jest.fn(() => ({ type: 'doc', content: [{ type: 'paragraph' }] }))
};

jest.mock('@tiptap/react', () => ({
  EditorContent: ({ editor }) => <div data-testid="wiki-editor-content">{editor ? 'ready' : 'missing'}</div>,
  useEditor: (...args) => mockUseEditor(...args)
}));

jest.mock('@tiptap/starter-kit', () => ({}));

jest.mock('@tiptap/extension-placeholder', () => ({
  configure: () => ({})
}));

jest.mock('../../api/wiki', () => ({
  addWikiSource: jest.fn(),
  draftWikiPage: jest.fn(),
  getWikiPage: jest.fn(),
  removeWikiSource: jest.fn(),
  updateWikiPage: jest.fn()
}));

const page = {
  _id: 'wiki-1',
  title: 'Enterprise AI Memory',
  pageType: 'topic',
  status: 'draft',
  visibility: 'private',
  sourceScope: 'entire_library',
  body: { type: 'doc', content: [{ type: 'paragraph' }] },
  sourceRefs: [
    { _id: 'source-1', type: 'article', title: 'Memory article', snippet: 'Source snippet' }
  ],
  aiState: {
    draftStatus: 'idle',
    suggestions: [
      { id: 'suggestion-1', type: 'edit', title: 'Next edit', text: 'Insert this next edit.' }
    ]
  }
};

describe('WikiPageEditor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseEditor.mockReturnValue(mockEditor);
    getWikiPage.mockResolvedValue(page);
    updateWikiPage.mockResolvedValue(page);
    addWikiSource.mockResolvedValue(page);
    removeWikiSource.mockResolvedValue({ ...page, sourceRefs: [] });
    draftWikiPage.mockResolvedValue({
      ...page,
      aiState: { ...page.aiState, draftStatus: 'ready' }
    });
  });

  it('renders rich text editor and default metadata controls', async () => {
    render(
      <MemoryRouter>
        <WikiPageEditor pageId="wiki-1" />
      </MemoryRouter>
    );

    expect(await screen.findByDisplayValue('Enterprise AI Memory')).toBeInTheDocument();
    expect(screen.getByTestId('wiki-editor-content')).toHaveTextContent('ready');
    expect(screen.getByLabelText('Wiki page metadata')).toBeInTheDocument();
    expect(screen.getByDisplayValue('private')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Entire library')).toBeInTheDocument();
  });

  it('saves metadata changes', async () => {
    render(
      <MemoryRouter>
        <WikiPageEditor pageId="wiki-1" />
      </MemoryRouter>
    );

    await screen.findByDisplayValue('Enterprise AI Memory');
    fireEvent.change(screen.getByDisplayValue('private'), { target: { value: 'shared' } });

    await waitFor(() => {
      expect(updateWikiPage).toHaveBeenCalledWith('wiki-1', { visibility: 'shared' });
    });
  });

  it('refreshes AI draft without blocking editor', async () => {
    render(
      <MemoryRouter>
        <WikiPageEditor pageId="wiki-1" />
      </MemoryRouter>
    );

    await screen.findByDisplayValue('Enterprise AI Memory');
    fireEvent.click(screen.getByRole('button', { name: 'Generate draft' }));

    await waitFor(() => {
      expect(draftWikiPage).toHaveBeenCalledWith('wiki-1');
    });
  });

  it('adds, removes, and applies sources and suggestions', async () => {
    render(
      <MemoryRouter>
        <WikiPageEditor pageId="wiki-1" />
      </MemoryRouter>
    );

    await screen.findByDisplayValue('Enterprise AI Memory');
    fireEvent.click(screen.getByRole('button', { name: 'Insert' }));
    expect(mockEditor.commands.insertContent).toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Source title'), { target: { value: 'New source' } });
    fireEvent.click(screen.getByRole('button', { name: 'Attach source' }));

    await waitFor(() => {
      expect(addWikiSource).toHaveBeenCalledWith('wiki-1', expect.objectContaining({ title: 'New source' }));
    });

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    await waitFor(() => {
      expect(removeWikiSource).toHaveBeenCalledWith('wiki-1', 'source-1');
    });
  });
});
