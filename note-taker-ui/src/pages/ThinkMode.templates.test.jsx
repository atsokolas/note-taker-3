import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import * as ReactRouterDom from 'react-router-dom';
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
import { listAgentHandoffs, listPersonalAgents } from '../api/agent';
import { getConnectionsForScope } from '../api/connections';
import { listWorkingMemory } from '../api/workingMemory';

const mockThoughtPartnerPanel = jest.fn();
const mockSetSearchParams = jest.fn();
const useSearchParamsMock = jest.spyOn(ReactRouterDom, 'useSearchParams');

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

jest.mock('../api/agent', () => ({
  listPersonalAgents: jest.fn(),
  listAgentHandoffs: jest.fn(),
  createAgentHandoff: jest.fn(),
  createAutoAgentHandoff: jest.fn(),
  claimAgentHandoff: jest.fn(),
  completeAgentHandoff: jest.fn(),
  rejectAgentHandoff: jest.fn(),
  cancelAgentHandoff: jest.fn()
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
jest.mock('../components/agent/ThoughtPartnerPanel', () => ({
  __esModule: true,
  default: (props) => {
    mockThoughtPartnerPanel(props);
    return <div data-testid={`thought-partner-${props.title || 'panel'}`}>{props.title || 'Thought partner'}</div>;
  }
}));
jest.mock('../components/think/concepts/ConceptNotebook', () => () => null);
jest.mock('../components/think/concepts/idea-workbench/IdeaWorkbenchMain', () => () => <div>Idea Workbench</div>);
jest.mock('../components/think/concepts/idea-workbench/IdeaWorkbenchAgentRail', () => () => <div>Idea Agent Rail</div>);
jest.mock('../components/think/concepts/idea-workbench/useIdeaWorkbenchModel', () => jest.fn(() => ({
  state: {
    header: { label: 'Idea', title: 'Template Concept', prompt: "What's the core insight here?", stage: 'Seed' },
    workspaceDraft: '',
    workspaceDraftType: 'Note',
    importedSourceKeys: [],
    cards: [],
    hypothesis: {
      html: '<p>Draft</p>',
      versions: [{ id: 'v1', label: 'v1', summary: 'Initial', html: '<p>Draft</p>' }]
    },
    agent: { comments: [], messages: [] }
  },
  counts: { workspace: 0, supports: 0, contradictions: 0, questions: 0 },
  currentMaturity: 'Early',
  hypothesisVersion: { label: 'v1', summary: 'Initial' },
  importableCounts: { highlights: 0, notes: 0, snippets: 0, concepts: 0 },
  actions: {
    setHeaderField: jest.fn(),
    setWorkspaceDraft: jest.fn(),
    setWorkspaceDraftType: jest.fn(),
    addWorkspaceCard: jest.fn(),
    importMaterialCard: jest.fn(),
    addSuggestedCard: jest.fn(),
    moveCard: jest.fn(),
    deleteCard: jest.fn(),
    tagCard: jest.fn(),
    updateHypothesisHtml: jest.fn(),
    snapshotHypothesis: jest.fn(),
    runQuickAction: jest.fn(),
    sendAgentMessage: jest.fn()
  }
})));
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
const pendingRequest = () => new Promise(() => {});

describe('ThinkMode template integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockThoughtPartnerPanel.mockClear();
    mockSetSearchParams.mockReset();
    window.scrollTo = jest.fn();
    useSearchParamsMock.mockReturnValue([
      new URLSearchParams('tab=concepts'),
      mockSetSearchParams
    ]);

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

    api.get.mockImplementation(() => pendingRequest());
    api.post.mockResolvedValue({ data: {} });
    api.put.mockResolvedValue({ data: {} });
    api.patch.mockResolvedValue({ data: {} });
    api.delete.mockResolvedValue({ data: {} });

    listReturnQueue.mockImplementation(() => pendingRequest());
    getArticles.mockImplementation(() => pendingRequest());
    listPersonalAgents.mockImplementation(() => pendingRequest());
    listAgentHandoffs.mockImplementation(() => pendingRequest());
    getConnectionsForScope.mockImplementation(() => pendingRequest());
    listWorkingMemory.mockImplementation(() => pendingRequest());
  });

  it('defaults Think to the concept workspace and keeps advanced routes in the actions menu', () => {
    useConcepts.mockReturnValue({
      concepts: [
        {
          _id: 'concept-1',
          name: 'Template Concept',
          count: 0,
          description: '',
          freshness: {
            stale: true,
            statusLabel: '2 newer sources',
            lastReviewedAt: '2026-04-09T00:00:00.000Z'
          }
        },
        {
          _id: 'concept-2',
          name: 'Current Concept',
          count: 1,
          description: '',
          freshness: {
            stale: false,
            lastReviewedAt: '2026-04-10T00:00:00.000Z'
          }
        }
      ],
      loading: false,
      error: '',
      refresh: refreshConceptsMock
    });

    render(
      <MemoryRouter initialEntries={['/think']}>
        <ThinkMode />
      </MemoryRouter>
    );

    expect(screen.getByText('Start from the idea, then pull the archive into focus.')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Concepts' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Review next' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Current threads' })).toBeInTheDocument();
    expect(screen.getByText('2 newer sources')).toBeInTheDocument();
    expect(screen.getByText(/Last reviewed/i)).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('think-header-actions-menu-button'));

    expect(screen.getByRole('menuitem', { name: 'Open handoffs' })).toBeInTheDocument();
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

    expect(screen.getByText('Template Concept')).toBeInTheDocument();
  });

  it('opens a visible composer from the concepts index hero when no concepts exist', () => {
    useConcepts.mockReturnValue({
      concepts: [],
      loading: false,
      error: '',
      refresh: refreshConceptsMock
    });

    render(
      <MemoryRouter initialEntries={['/think?tab=concepts']}>
        <ThinkMode />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByTestId('think-concepts-index-create-button'));

    expect(screen.getByTestId('think-concept-composer-input')).toBeVisible();
  });

  it.each([
    ['tab=notebook', 'Clean up notebook structure and stage a reviewable organization plan.', 'think-notebook', 'Notebook'],
    ['tab=concepts', 'Clean up concepts structure and stage a reviewable organization plan.', 'think-concepts', 'Concepts'],
    ['tab=questions', 'Clean up questions structure and stage a reviewable organization plan.', 'think-questions', 'Questions']
  ])('queues a structure cleanup prompt from %s', async (search, prompt, contextId, contextTitle) => {
    useSearchParamsMock.mockReturnValue([
      new URLSearchParams(search),
      mockSetSearchParams
    ]);
    if (search === 'tab=questions') {
      useQuestions.mockReturnValue({
        questions: [
          {
            _id: 'question-1',
            text: 'What evidence changes the thesis?',
            status: 'open',
            linkedTagName: ''
          }
        ],
        loading: false,
        error: '',
        setQuestions: jest.fn()
      });
    }

    render(
      <MemoryRouter initialEntries={['/think']}>
        <ThinkMode />
      </MemoryRouter>
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Clean up structure' }));

    await waitFor(() => {
      const lastProps = mockThoughtPartnerPanel.mock.calls.at(-1)?.[0] || {};
      expect(lastProps.queuedPrompt).toMatchObject({
        prompt,
        contextType: 'workspace',
        contextId,
        contextTitle
      });
    });
  });

});
