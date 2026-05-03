import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import WikiPageEditor from './WikiPageEditor';
import { addWikiSource, getWikiPage, maintainWikiPage, removeWikiSource, updateWikiPage } from '../../api/wiki';

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
  getWikiPage: jest.fn(),
  maintainWikiPage: jest.fn(),
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
    maintenanceSummary: '',
    health: {
      newItems: [],
      unsupportedClaims: [],
      missingCitations: [],
      staleSections: [],
      contradictions: [],
      relatedPages: []
    },
    suggestions: [
      { id: 'suggestion-1', type: 'edit', title: 'Evidence section', text: 'Rewrote the evidence section.' }
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
    maintainWikiPage.mockResolvedValue({
      ...page,
      body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Maintained page body.' }] }] },
      aiState: {
        ...page.aiState,
        draftStatus: 'ready',
        maintenanceSummary: 'Rebuilt from 3 relevant sources.',
        health: {
          ...page.aiState.health,
          newItems: [{ text: 'New article affects this page.', sourceTitle: 'Memory article' }]
        }
      }
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

  it('maintains the Wiki page and refreshes editor content', async () => {
    render(
      <MemoryRouter>
        <WikiPageEditor pageId="wiki-1" />
      </MemoryRouter>
    );

    await screen.findByDisplayValue('Enterprise AI Memory');
    fireEvent.click(screen.getByRole('button', { name: 'Maintain page' }));

    await waitFor(() => {
      expect(maintainWikiPage).toHaveBeenCalledWith('wiki-1');
      expect(mockEditor.commands.setContent).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'doc' }),
        false
      );
    });
    expect(await screen.findByText('Rebuilt from 3 relevant sources.')).toBeInTheDocument();
    expect(screen.getByText(/New article affects this page/)).toBeInTheDocument();
  });

  it('adds and removes sources while showing applied updates', async () => {
    render(
      <MemoryRouter>
        <WikiPageEditor pageId="wiki-1" />
      </MemoryRouter>
    );

    await screen.findByDisplayValue('Enterprise AI Memory');
    expect(screen.getAllByText('Rewrote the evidence section.').length).toBeGreaterThan(0);

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
