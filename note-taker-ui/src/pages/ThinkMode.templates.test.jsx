import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
import { createQuestion } from '../api/questions';
import { listReturnQueue } from '../api/returnQueue';
import { getArticles } from '../api/articles';
import { listAgentHandoffs, listPersonalAgents } from '../api/agent';
import { createConnection, getConnectionsForScope, searchConnectableItems } from '../api/connections';
import { updateConcept } from '../api/concepts';
import { createWikiPage } from '../api/wiki';
import { listWorkingMemory } from '../api/workingMemory';
import { navigateWithViewTransition } from '../utils/viewTransitionNavigation';

const mockThoughtPartnerPanel = jest.fn();
const mockQuestionEditor = jest.fn();
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
  default: ({ onCreateFromTemplate, onUniversalCommand }) => (
    <div>
      <button type="button" onClick={onCreateFromTemplate}>
        Use template
      </button>
      <button
        type="button"
        onClick={() => onUniversalCommand?.('What breaks this thesis?', {
          references: [{
            type: 'highlight',
            id: 'highlight-home-1',
            articleId: 'article-1',
            title: 'Home highlight',
            snippet: 'A source staged from Home.'
          }],
          sourceContext: 'home_reference_tray',
          provenancePending: true
        })}
      >
        Home question with reference
      </button>
      <button
        type="button"
        onClick={() => onUniversalCommand?.('Keep this as a durable note', {
          references: [{
            type: 'wiki',
            id: 'wiki-home-1',
            title: 'Home wiki'
          }],
          sourceContext: 'home_reference_tray',
          provenancePending: true
        })}
      >
        Home note with reference
      </button>
    </div>
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
jest.mock('../components/think/questions/QuestionEditor', () => ({
  __esModule: true,
  default: (props) => {
    mockQuestionEditor(props);
    return <div data-testid="question-editor" />;
  }
}));
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
jest.mock('../components/think/concepts/ConceptEvidenceStreamView', () => ({
  __esModule: true,
  default: () => <div>Concept Evidence Stream</div>,
  ConceptEvidenceStreamRail: () => <div>Concept Evidence Rail</div>,
  ConceptPartnerRail: () => <div>Concept Partner Rail</div>
}));
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
  createConnection: jest.fn(),
  getConnectionsForItem: jest.fn().mockResolvedValue({ outgoing: [], incoming: [] }),
  getConnectionsForScope: jest.fn().mockResolvedValue([]),
  searchConnectableItems: jest.fn().mockResolvedValue([])
}));

jest.mock('../api/wiki', () => ({
  createWikiPage: jest.fn(),
  listWikiActivity: jest.fn().mockResolvedValue([]),
  listWikiPages: jest.fn().mockResolvedValue([])
}));

jest.mock('../utils/viewTransitionNavigation', () => ({
  navigateWithViewTransition: jest.fn()
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
    mockQuestionEditor.mockClear();
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
    createConnection.mockResolvedValue({});
    updateConcept.mockResolvedValue({ _id: 'concept-1', name: 'Template Concept', description: '' });
    createWikiPage.mockResolvedValue({ _id: 'wiki-created' });
    navigateWithViewTransition.mockImplementation((navigate, destination, options) => navigate(destination, options));
  });

  it('defaults Think to the concept workspace and keeps advanced routes in the actions menu', async () => {
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

    expect(await screen.findByText('Start from the idea, then pull the archive into focus.')).toBeInTheDocument();
    const generativeTab = screen.getByRole('tab', { name: 'Generative concept posture' });
    expect(generativeTab).toBeInTheDocument();
    expect(generativeTab).toHaveTextContent('Generative');
    expect(generativeTab).toHaveTextContent('Concept');
    expect(screen.getByRole('heading', { name: 'Review next' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Current threads' })).toBeInTheDocument();
    expect(screen.getByText('2 newer sources')).toBeInTheDocument();
    expect(screen.getByText(/Last reviewed/i)).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('think-header-actions-menu-button'));

    expect(screen.getByRole('menuitem', { name: 'Open handoffs' })).toBeInTheDocument();
  });

  it('renders a visible posture dial for the selected concept chassis and routes posture changes', async () => {
    useSearchParamsMock.mockReturnValue([
      new URLSearchParams('tab=concepts&concept=Template Concept'),
      mockSetSearchParams
    ]);

    render(
      <MemoryRouter initialEntries={['/think?tab=concepts&concept=Template%20Concept']}>
        <ThinkMode />
      </MemoryRouter>
    );

    expect(await screen.findByTestId('think-posture-strip')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Concept' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Builder mode: develop one idea, pull related material, and decide what deserves structure.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Question' }));

    expect(mockSetSearchParams).toHaveBeenCalled();
    const nextParams = mockSetSearchParams.mock.calls.at(-1)[0];
    expect(nextParams.get('tab')).toBe('questions');
  });

  it('shows the raw-to-wiki promotion trace while a concept graduates', async () => {
    useSearchParamsMock.mockReturnValue([
      new URLSearchParams('tab=concepts&concept=Template Concept'),
      mockSetSearchParams
    ]);
    createWikiPage.mockImplementation(() => pendingRequest());

    render(
      <MemoryRouter initialEntries={['/think?tab=concepts&concept=Template%20Concept']}>
        <ThinkMode />
      </MemoryRouter>
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Promote to wiki page' }));

    const trace = await screen.findByLabelText('Wiki promotion trace');
    expect(trace).toHaveAttribute('data-promotion-phase', 'drafting');
    expect(trace).toHaveTextContent('Raw -> Wiki');
    expect(trace).toHaveTextContent('Drafting wiki page');
    expect(trace).toHaveTextContent('Writing graph edge');
    expect(trace).toHaveTextContent('Opening settled register');
  });

  it('opens promoted Think objects through the register view transition', async () => {
    useSearchParamsMock.mockReturnValue([
      new URLSearchParams('tab=concepts&concept=Template Concept'),
      mockSetSearchParams
    ]);
    createWikiPage.mockResolvedValue({ _id: 'wiki-promoted' });

    render(
      <MemoryRouter initialEntries={['/think?tab=concepts&concept=Template%20Concept']}>
        <ThinkMode />
      </MemoryRouter>
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Promote to wiki page' }));

    await waitFor(() => expect(createConnection).toHaveBeenCalledWith(expect.objectContaining({
      fromType: 'concept',
      fromId: 'concept-1',
      toType: 'wiki_page',
      toId: 'wiki-promoted',
      relationType: 'extends'
    })));
    await waitFor(() => expect(navigateWithViewTransition).toHaveBeenCalledWith(
      expect.any(Function),
      expect.stringContaining('/wiki/workspace?page=wiki-promoted')
    ));
    const destination = navigateWithViewTransition.mock.calls.at(-1)[1];
    expect(destination).toContain('transition=register');
    expect(destination).toContain('receipt=settled');
    expect(destination).toContain('promoted=concept');
  });

  it('persists a name-only concept before pulling a reference in', async () => {
    useSearchParamsMock.mockReturnValue([
      new URLSearchParams('tab=concepts&concept=Fresh Concept'),
      mockSetSearchParams
    ]);
    useConcepts.mockReturnValue({
      concepts: [],
      loading: false,
      error: '',
      refresh: refreshConceptsMock
    });
    const setConcept = jest.fn();
    useConcept.mockReturnValue({
      concept: null,
      loading: false,
      error: '',
      refresh: jest.fn(),
      setConcept
    });
    updateConcept.mockResolvedValueOnce({
      _id: 'fresh-concept-id',
      name: 'Fresh Concept',
      description: ''
    });
    searchConnectableItems.mockResolvedValueOnce([{
      itemType: 'highlight',
      itemId: 'highlight-fresh-1',
      articleId: 'article-1',
      title: 'Fresh evidence',
      snippet: 'Evidence pulled into a just-opened concept.'
    }]);

    render(
      <MemoryRouter initialEntries={['/think?tab=concepts&concept=Fresh%20Concept']}>
        <ThinkMode />
      </MemoryRouter>
    );

    fireEvent.change(await screen.findByLabelText('Search references to pull in'), {
      target: { value: 'fresh evidence' }
    });
    fireEvent.click(await screen.findByRole('button', { name: /Fresh evidence/ }));

    await waitFor(() => expect(updateConcept).toHaveBeenCalledWith('Fresh Concept', {
      description: ''
    }));
    await waitFor(() => expect(createConnection).toHaveBeenCalledWith(expect.objectContaining({
      fromType: 'concept',
      fromId: 'fresh-concept-id',
      toType: 'highlight',
      toId: 'highlight-fresh-1',
      relationType: 'related',
      scopeType: 'concept',
      scopeId: 'fresh-concept-id'
    })));
    expect(setConcept).toHaveBeenCalledWith(expect.objectContaining({
      _id: 'fresh-concept-id',
      name: 'Fresh Concept'
    }));
  });

  it('persists a name-only concept before promoting it to a wiki page', async () => {
    useSearchParamsMock.mockReturnValue([
      new URLSearchParams('tab=concepts&concept=Fresh Concept'),
      mockSetSearchParams
    ]);
    useConcepts.mockReturnValue({
      concepts: [],
      loading: false,
      error: '',
      refresh: refreshConceptsMock
    });
    useConcept.mockReturnValue({
      concept: null,
      loading: false,
      error: '',
      refresh: jest.fn(),
      setConcept: jest.fn()
    });
    updateConcept.mockResolvedValueOnce({
      _id: 'fresh-concept-id',
      name: 'Fresh Concept',
      description: ''
    });
    createWikiPage.mockResolvedValueOnce({ _id: 'wiki-fresh' });

    render(
      <MemoryRouter initialEntries={['/think?tab=concepts&concept=Fresh%20Concept']}>
        <ThinkMode />
      </MemoryRouter>
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Promote to wiki page' }));

    await waitFor(() => expect(updateConcept).toHaveBeenCalledWith('Fresh Concept', {
      description: ''
    }));
    await waitFor(() => expect(createWikiPage).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Fresh Concept',
      pageType: 'concept',
      createdFrom: expect.objectContaining({
        type: 'concept',
        objectId: 'fresh-concept-id'
      })
    })));
    await waitFor(() => expect(createConnection).toHaveBeenCalledWith(expect.objectContaining({
      fromType: 'concept',
      fromId: 'fresh-concept-id',
      toType: 'wiki_page',
      toId: 'wiki-fresh',
      relationType: 'extends'
    })));
    const destination = navigateWithViewTransition.mock.calls.at(-1)[1];
    expect(destination).toContain('/wiki/workspace?page=wiki-fresh');
    expect(destination).toContain('sourceTitle=Fresh+Concept');
  });

  it('renders question posture with the dialectical margin primitive', async () => {
    useSearchParamsMock.mockReturnValue([
      new URLSearchParams('tab=questions&questionId=question-1'),
      mockSetSearchParams
    ]);
    api.get.mockImplementation((path) => {
      if (String(path).includes('/api/questions/question-1/related')) {
        return Promise.resolve({
          data: {
            results: [
              {
                objectType: 'highlight',
                objectId: 'highlight-support',
                title: 'Shareholder letter',
                snippet: 'Buffett argues disciplined process improves decisions.',
                metadata: { articleTitle: 'Berkshire letters' }
              },
              {
                objectType: 'highlight',
                objectId: 'highlight-counter',
                title: 'Risk note',
                snippet: 'However, concentration creates a trade-off when assumptions fail.',
                metadata: { articleTitle: 'Portfolio risk memo' }
              }
            ]
          }
        });
      }
      return pendingRequest();
    });
    useQuestions.mockReturnValue({
      questions: [
        {
          _id: 'question-1',
          text: 'What evidence changes the thesis?',
          status: 'open',
          linkedTagName: 'Template Concept',
          blocks: [{
            id: 'block-1',
            type: 'paragraph',
            text: 'What would change this?',
            challenge: { enabled: true, createdAt: '2026-06-01T12:00:00.000Z', note: '' }
          }]
        }
      ],
      loading: false,
      error: '',
      setQuestions: jest.fn()
    });

    render(
      <MemoryRouter initialEntries={['/think']}>
        <ThinkMode />
      </MemoryRouter>
    );

    expect(await screen.findByTestId('think-posture-strip')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Question' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Challenger mode: pressure-test claims, ask what would change your mind, and surface counter-evidence.')).toBeInTheDocument();
    expect(screen.getByText('Dialectical margin')).toBeInTheDocument();
    expect(screen.getByText('Strongest support')).toBeInTheDocument();
    expect(screen.getByText('Counter-pressure')).toBeInTheDocument();
    const inlineDock = screen.getByTestId('question-inline-evidence-dock');
    expect(inlineDock).toHaveTextContent('Support notch');
    expect(inlineDock).toHaveTextContent('Counter notch');
    const lineEvidence = screen.getByTestId('question-line-evidence-block-1');
    expect(lineEvidence).toBeInTheDocument();
    expect(lineEvidence).toHaveAttribute('data-support-count', '1');
    expect(lineEvidence).toHaveAttribute('data-counter-count', '1');
    expect(lineEvidence).toHaveAttribute('data-support-lean', '50');
    expect(lineEvidence).toHaveAttribute('data-challenge-active', 'true');
    expect(within(lineEvidence).getByText('Challenge marked')).toBeInTheDocument();
    expect(within(lineEvidence).getByLabelText('Line 1 balance: 1 support, 1 counter')).toHaveTextContent('Support 50%');
    expect(within(lineEvidence).getByText('Balanced line')).toBeInTheDocument();
    const questionEditorProps = mockQuestionEditor.mock.calls.at(-1)?.[0];
    expect(questionEditorProps.challengeEvidenceByBlockId).toMatchObject({
      'block-1': {
        support: [expect.objectContaining({ stance: 'support', sourceKind: 'Library highlight' })],
        counter: [expect.objectContaining({ stance: 'counter', sourceKind: 'Library highlight' })]
      }
    });
    expect(within(inlineDock).getByRole('link', { name: 'Line 1' })).toHaveAttribute('href', '#question-block-block-1');
    expect(inlineDock).toHaveTextContent('Berkshire letters');
    expect(inlineDock).toHaveTextContent('Portfolio risk memo');
    expect(await screen.findAllByText('Library highlight')).toHaveLength(2);
    expect(screen.getAllByText('Berkshire letters').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Portfolio risk memo').length).toBeGreaterThan(0);
    expect(screen.getAllByText('However, concentration creates a trade-off when assumptions fail.').length).toBeGreaterThan(0);
    expect(screen.getByRole('group', { name: 'Reference relationship' })).toHaveTextContent('Support');
    expect(screen.getByRole('group', { name: 'Reference relationship' })).toHaveTextContent('Counter');
  });

  it('adds a pulled Think reference to the local thought-partner context immediately', async () => {
    useSearchParamsMock.mockReturnValue([
      new URLSearchParams('tab=questions&questionId=question-1'),
      mockSetSearchParams
    ]);
    api.get.mockImplementation((path) => {
      if (String(path).includes('/api/questions/question-1/related')) {
        return Promise.resolve({ data: { results: [] } });
      }
      return pendingRequest();
    });
    useQuestions.mockReturnValue({
      questions: [
        {
          _id: 'question-1',
          text: 'What evidence changes the thesis?',
          status: 'open',
          linkedTagName: 'Template Concept',
          blocks: [{ id: 'block-1', type: 'paragraph', text: 'What would change this?' }]
        }
      ],
      loading: false,
      error: '',
      setQuestions: jest.fn()
    });
    searchConnectableItems.mockResolvedValueOnce([{
      itemType: 'highlight',
      itemId: 'highlight-1',
      articleId: 'article-1',
      title: 'Risk memo highlight',
      snippet: 'Concentration creates a downside tail.'
    }]);
    createConnection.mockResolvedValueOnce({
      _id: 'connection-1',
      relationType: 'supports',
      trace: {
        bidirectional: true,
        reciprocalId: 'connection-2',
        reciprocalRelationType: 'supported_by'
      }
    });

    render(
      <MemoryRouter initialEntries={['/think']}>
        <ThinkMode />
      </MemoryRouter>
    );

    fireEvent.change(await screen.findByLabelText('Search references to pull in'), {
      target: { value: 'risk memo' }
    });
    fireEvent.click(await screen.findByRole('button', { name: /Risk memo highlight/ }));

    await waitFor(() => expect(createConnection).toHaveBeenCalledWith(expect.objectContaining({
      fromType: 'question',
      fromId: 'question-1',
      toType: 'highlight',
      toId: 'highlight-1',
      relationType: 'supports'
    })));
    await waitFor(() => expect(mockThoughtPartnerPanel).toHaveBeenLastCalledWith(expect.objectContaining({
      contextMetadata: expect.objectContaining({
        relatedItems: expect.arrayContaining([
          expect.objectContaining({
            type: 'highlight',
            id: 'highlight-1',
            title: 'Risk memo highlight',
            snippet: 'Concentration creates a downside tail.'
          })
        ])
      })
    })));
  });

  it('wires Notebook into a passive agent posture instead of the active builder rail', async () => {
    useSearchParamsMock.mockReturnValue([
      new URLSearchParams('tab=notebook'),
      mockSetSearchParams
    ]);

    render(
      <MemoryRouter initialEntries={['/think?tab=notebook']}>
        <ThinkMode />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(mockThoughtPartnerPanel).toHaveBeenCalledWith(expect.objectContaining({
        posture: 'notebook',
        subtitle: 'Quiet notebook posture',
        placeholder: 'Ask only when you want the agent to step in.',
        passiveStatusText: expect.stringContaining('Keep writing')
      }));
    });
  });

  it('opens template picker from Think home and handles successful create callback', async () => {
    useSearchParamsMock.mockReturnValue([
      new URLSearchParams('tab=home'),
      mockSetSearchParams
    ]);

    render(
      <MemoryRouter initialEntries={['/think?tab=home']}>
        <ThinkMode />
      </MemoryRouter>
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Use template' }));

    expect(await screen.findByTestId('template-modal')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Complete template' }));

    await waitFor(() => {
      expect(refreshConceptsMock).toHaveBeenCalled();
    });

    expect(screen.getByText('Template Concept')).toBeInTheDocument();
  });

  it('persists pulled Home references when a Home command creates a question', async () => {
    useSearchParamsMock.mockReturnValue([
      new URLSearchParams('tab=home'),
      mockSetSearchParams
    ]);
    createQuestion.mockResolvedValueOnce({
      _id: 'question-home-1',
      text: 'What breaks this thesis?',
      status: 'open'
    });

    render(
      <MemoryRouter initialEntries={['/think?tab=home']}>
        <ThinkMode />
      </MemoryRouter>
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Home question with reference' }));

    await waitFor(() => expect(createQuestion).toHaveBeenCalledWith(expect.objectContaining({
      text: 'What breaks this thesis?'
    })));
    await waitFor(() => expect(createConnection).toHaveBeenCalledWith({
      fromType: 'question',
      fromId: 'question-home-1',
      toType: 'highlight',
      toId: 'highlight-home-1',
      relationType: 'related',
      scopeType: 'question',
      scopeId: 'question-home-1'
    }));
  });

  it('persists pulled Home references when a Home command creates a note', async () => {
    useSearchParamsMock.mockReturnValue([
      new URLSearchParams('tab=home'),
      mockSetSearchParams
    ]);
    api.post.mockResolvedValueOnce({
      data: {
        _id: 'note-home-1',
        title: 'Keep this as a durable note'
      }
    });

    render(
      <MemoryRouter initialEntries={['/think?tab=home']}>
        <ThinkMode />
      </MemoryRouter>
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Home note with reference' }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/api/notebook',
      expect.objectContaining({
        title: 'Keep this as a durable note',
        content: 'Keep this as a durable note'
      }),
      expect.any(Object)
    ));
    await waitFor(() => expect(createConnection).toHaveBeenCalledWith({
      fromType: 'notebook',
      fromId: 'note-home-1',
      toType: 'wiki_page',
      toId: 'wiki-home-1',
      relationType: 'related',
      scopeType: '',
      scopeId: ''
    }));
  });

  it('consumes the global pull-reference URL flag on Think surfaces', async () => {
    useSearchParamsMock.mockReturnValue([
      new URLSearchParams('tab=questions&questionId=question-1&pull=1'),
      mockSetSearchParams
    ]);
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

    render(
      <MemoryRouter initialEntries={['/think?tab=questions&questionId=question-1&pull=1']}>
        <ThinkMode />
      </MemoryRouter>
    );

    await waitFor(() => expect(mockSetSearchParams).toHaveBeenCalledWith(
      expect.any(URLSearchParams),
      { replace: true }
    ));
    const nextParams = mockSetSearchParams.mock.calls.find(([, options]) => options?.replace)?.[0];
    expect(nextParams.get('tab')).toBe('questions');
    expect(nextParams.get('questionId')).toBe('question-1');
    expect(nextParams.has('pull')).toBe(false);
  });

  it('opens a visible composer from the concepts index hero when no concepts exist', async () => {
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

    fireEvent.click(await screen.findByTestId('think-concepts-index-create-button'));

    expect(screen.getByTestId('think-concept-composer-input')).toBeVisible();
  });

  it.each([
    ['tab=notebook', 'Clean up notebook structure and stage a reviewable organization plan.', 'think-notebook', 'Notebook'],
    ['tab=concepts', 'Clean up concepts structure and stage a reviewable organization plan.', 'think-concepts', 'Concepts'],
    ['tab=questions&questionId=question-1', 'Clean up questions structure and stage a reviewable organization plan.', 'think-questions', 'Questions']
  ])('queues a structure cleanup prompt from %s', async (search, prompt, contextId, contextTitle) => {
    useSearchParamsMock.mockReturnValue([
      new URLSearchParams(search),
      mockSetSearchParams
    ]);
    if (search.startsWith('tab=questions')) {
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

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: 'Clean up structure' }).length).toBeGreaterThan(0);
    });
    fireEvent.click(screen.getAllByRole('button', { name: 'Clean up structure' })[0]);

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
