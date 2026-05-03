import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import WikiPageEditor from './WikiPageEditor';
import { draftWikiPage, getWikiPage, updateWikiPage } from '../../api/wiki';

const mockUseEditor = jest.fn();
const mockEditor = {
  commands: {
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
  draftWikiPage: jest.fn(),
  getWikiPage: jest.fn(),
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
  sourceRefs: [],
  aiState: { draftStatus: 'idle' }
};

describe('WikiPageEditor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseEditor.mockReturnValue(mockEditor);
    getWikiPage.mockResolvedValue(page);
    updateWikiPage.mockResolvedValue(page);
    draftWikiPage.mockResolvedValue({
      ...page,
      aiState: { draftStatus: 'ready' }
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
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));

    await waitFor(() => {
      expect(draftWikiPage).toHaveBeenCalledWith('wiki-1');
    });
  });
});
