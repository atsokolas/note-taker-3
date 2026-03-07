import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ThinkMode from './ThinkMode';
import useConcepts from '../hooks/useConcepts';
import useConcept from '../hooks/useConcept';
import useConceptRelated from '../hooks/useConceptRelated';
import useQuestions from '../hooks/useQuestions';
import useHighlights from '../hooks/useHighlights';
import useTags from '../hooks/useTags';
import api from '../api';
import { listReturnQueue } from '../api/returnQueue';
import { getArticles } from '../api/articles';

jest.mock('../hooks/useConcepts', () => jest.fn());
jest.mock('../hooks/useConcept', () => jest.fn());
jest.mock('../hooks/useConceptRelated', () => jest.fn());
jest.mock('../hooks/useQuestions', () => jest.fn());
jest.mock('../hooks/useHighlights', () => jest.fn());
jest.mock('../hooks/useTags', () => jest.fn());

jest.mock('../api', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn()
  }
}));

jest.mock('../api/returnQueue', () => ({
  listReturnQueue: jest.fn()
}));

jest.mock('../api/articles', () => ({
  getArticles: jest.fn()
}));

jest.mock('../hooks/useAuthHeaders', () => ({
  getAuthHeaders: () => ({})
}));

jest.mock('../layout/ThreePaneLayout', () => ({
  __esModule: true,
  default: ({ left, main, mainActions }) => (
    <div>
      <div data-testid="think-main-actions">{mainActions}</div>
      <div data-testid="think-left-panel">{left}</div>
      <div data-testid="think-main-panel">{main}</div>
    </div>
  )
}));

jest.mock('../components/think/ThinkHome', () => ({
  __esModule: true,
  default: ({ onCreateFromTemplate }) => (
    <button type="button" onClick={onCreateFromTemplate}>
      Use template
    </button>
  )
}));

jest.mock('../components/think/concepts/ConceptTemplatePickerModal', () => ({
  __esModule: true,
  default: ({ open, onCreated }) => (
    open ? (
      <div data-testid="template-modal">
        <button
          type="button"
          onClick={() => onCreated({ conceptName: 'Template Concept' })}
        >
          Complete template
        </button>
      </div>
    ) : null
  )
}));

jest.mock('../components/ReferencesPanel', () => () => null);
jest.mock('../components/think/notebook/NotebookEditor', () => () => null);
jest.mock('../components/think/notebook/NotebookContext', () => () => null);
jest.mock('../components/think/questions/QuestionInput', () => () => null);
jest.mock('../components/think/questions/QuestionList', () => () => null);
jest.mock('../components/blocks/HighlightCard', () => () => null);
jest.mock('../components/blocks/NoteCard', () => () => null);
jest.mock('../components/blocks/ArticleCard', () => () => null);
jest.mock('../components/think/concepts/AddToConceptModal', () => () => null);
jest.mock('../components/think/questions/QuestionEditor', () => () => null);
jest.mock('../components/library/LibraryConceptModal', () => () => null);
jest.mock('../components/library/LibraryNotebookModal', () => () => null);
jest.mock('../components/library/LibraryQuestionModal', () => () => null);
jest.mock('../components/think/SynthesisModal', () => () => null);
jest.mock('../components/working-memory/WorkingMemoryPanel', () => () => null);
jest.mock('../components/return-queue/ReturnLaterControl', () => () => null);
jest.mock('../components/connections/ConnectionBuilder', () => () => null);
jest.mock('../components/paths/ConceptPathWorkspace', () => () => null);
jest.mock('../components/think/concepts/ConceptNotebook', () => () => null);
jest.mock('../components/virtual/VirtualList', () => ({
  __esModule: true,
  default: ({ items, renderItem }) => <div>{(items || []).map((item, index) => renderItem(item, index))}</div>
}));
jest.mock('../components/retrieval/SemanticRelatedPanel', () => () => null);

jest.mock('../api/concepts', () => ({
  updateConcept: jest.fn(),
  updateConceptPins: jest.fn(),
  suggestConceptWorkspaceFromLibrary: jest.fn()
}));

jest.mock('../api/questions', () => ({
  createQuestion: jest.fn(),
  updateQuestion: jest.fn()
}));

jest.mock('../api/connections', () => ({
  getConnectionsForScope: jest.fn().mockResolvedValue([])
}));

jest.mock('../api/workingMemory', () => ({
  listWorkingMemory: jest.fn().mockResolvedValue([]),
  createWorkingMemory: jest.fn(),
  archiveWorkingMemory: jest.fn(),
  unarchiveWorkingMemory: jest.fn(),
  promoteWorkingMemory: jest.fn(),
  splitWorkingMemory: jest.fn()
}));

const refreshConceptsMock = jest.fn().mockResolvedValue(undefined);

describe('ThinkMode template integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    useConcepts.mockReturnValue({
      concepts: [
        { _id: 'concept-1', name: 'Template Concept', count: 0, description: '' }
      ],
      loading: false,
      error: '',
      refresh: refreshConceptsMock
    });

    useConcept.mockReturnValue({
      concept: {
        _id: 'concept-1',
        name: 'Template Concept',
        description: '',
        slug: '',
        isPublic: false,
        pinnedHighlightIds: [],
        pinnedArticleIds: [],
        pinnedNoteIds: []
      },
      loading: false,
      error: '',
      refresh: jest.fn(),
      setConcept: jest.fn()
    });

    useConceptRelated.mockReturnValue({ related: { highlights: [] }, loading: false, error: '' });

    useQuestions.mockReturnValue({
      questions: [],
      loading: false,
      error: '',
      setQuestions: jest.fn()
    });

    useHighlights.mockReturnValue({ highlightMap: new Map(), highlights: [] });
    useTags.mockReturnValue({ tags: [] });

    api.get.mockResolvedValue({ data: [] });
    api.post.mockResolvedValue({ data: {} });
    api.put.mockResolvedValue({ data: {} });
    api.patch.mockResolvedValue({ data: {} });
    api.delete.mockResolvedValue({ data: {} });

    listReturnQueue.mockResolvedValue([]);
    getArticles.mockResolvedValue([]);
  });

  it('opens template picker from Think home and handles successful create callback', async () => {
    render(
      <MemoryRouter initialEntries={['/think?tab=home']}>
        <ThinkMode />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Use template' }));

    expect(screen.getByTestId('template-modal')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Complete template' }));

    await waitFor(() => {
      expect(refreshConceptsMock).toHaveBeenCalled();
    });

    expect(screen.getByText('Created concept from template: Template Concept.')).toBeInTheDocument();
  });
});
