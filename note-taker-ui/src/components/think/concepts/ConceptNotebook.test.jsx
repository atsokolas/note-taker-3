import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import ConceptNotebook from './ConceptNotebook';
import { attachConceptWorkspaceBlock, buildConceptWorkspaceFromLibrary } from '../../../api/concepts';
import useArticles from '../../../hooks/useArticles';
import useConceptMaterial from '../../../hooks/useConceptMaterial';
import useConceptWorkspace from '../../../hooks/useConceptWorkspace';
import useHighlightsQuery from '../../../hooks/useHighlightsQuery';

jest.mock('../../../api/concepts', () => ({
  attachConceptWorkspaceBlock: jest.fn(),
  buildConceptWorkspaceFromLibrary: jest.fn()
}));

jest.mock('../../../hooks/useArticles', () => jest.fn());
jest.mock('../../../hooks/useConceptMaterial', () => jest.fn());
jest.mock('../../../hooks/useConceptWorkspace', () => jest.fn());
jest.mock('../../../hooks/useHighlightsQuery', () => jest.fn());

const concept = { _id: 'concept-1', name: 'Systems Thinking' };

const createWorkspace = () => ({
  version: 1,
  outlineSections: [
    { id: 'inbox', title: 'Inbox', description: '', collapsed: false, order: 0 },
    { id: 'working', title: 'Working', description: '', collapsed: false, order: 1 },
    { id: 'draft', title: 'Draft', description: '', collapsed: true, order: 2 },
    { id: 'archive', title: 'Archive', description: '', collapsed: true, order: 3 }
  ],
  attachedItems: [
    {
      id: 'item-working',
      type: 'highlight',
      refId: 'highlight-working',
      sectionId: 'working',
      groupId: 'working',
      parentId: '',
      stage: 'working',
      status: 'active',
      order: 0
    },
    {
      id: 'item-draft',
      type: 'highlight',
      refId: 'highlight-draft',
      sectionId: 'draft',
      groupId: 'draft',
      parentId: '',
      stage: 'draft',
      status: 'active',
      order: 0
    }
  ],
  updatedAt: new Date().toISOString()
});

describe('ConceptNotebook workspace interactions', () => {
  let mockPatchWorkspace;
  let mockSetWorkspace;
  let mockSaveWorkspace;
  let mockRefreshWorkspace;
  let mockRefreshMaterial;

  beforeEach(() => {
    jest.useFakeTimers();

    mockPatchWorkspace = jest.fn().mockResolvedValue(undefined);
    mockSetWorkspace = jest.fn();
    mockSaveWorkspace = jest.fn().mockResolvedValue(undefined);
    mockRefreshWorkspace = jest.fn().mockResolvedValue(undefined);
    mockRefreshMaterial = jest.fn().mockResolvedValue(undefined);

    useConceptWorkspace.mockReturnValue({
      workspace: createWorkspace(),
      loading: false,
      error: '',
      patchWorkspace: mockPatchWorkspace,
      setWorkspace: mockSetWorkspace,
      saveWorkspace: mockSaveWorkspace,
      refresh: mockRefreshWorkspace
    });

    useConceptMaterial.mockReturnValue({
      material: {
        pinnedHighlights: [
          {
            _id: 'highlight-working',
            articleTitle: 'Working Source',
            text: 'Working evidence text',
            createdAt: new Date().toISOString(),
            tags: ['systems']
          },
          {
            _id: 'highlight-draft',
            articleTitle: 'Draft Source',
            text: 'Draft text',
            createdAt: new Date().toISOString(),
            tags: ['drafts']
          }
        ],
        recentHighlights: [],
        linkedArticles: [],
        linkedNotes: []
      },
      loading: false,
      error: '',
      refresh: mockRefreshMaterial
    });

    useHighlightsQuery.mockReturnValue({
      highlights: [
        {
          _id: 'highlight-new',
          articleTitle: 'Search Result',
          text: 'Searchable highlight',
          createdAt: new Date().toISOString(),
          tags: ['tag-a']
        }
      ],
      loading: false,
      error: ''
    });

    useArticles.mockReturnValue({
      articles: [],
      loading: false,
      error: ''
    });

    attachConceptWorkspaceBlock.mockResolvedValue({
      workspace: {
        ...createWorkspace(),
        attachedItems: [
          ...createWorkspace().attachedItems,
          {
            id: 'item-new',
            type: 'highlight',
            refId: 'highlight-new',
            sectionId: 'inbox',
            groupId: 'inbox',
            parentId: '',
            stage: 'inbox',
            status: 'active',
            order: 0
          }
        ]
      }
    });
    buildConceptWorkspaceFromLibrary.mockResolvedValue({
      ok: true,
      conceptId: 'concept-1',
      summary: {
        createdGroups: 3,
        linkedItems: 9,
        outlineHeadings: 6,
        claims: 5,
        openQuestions: 5
      }
    });
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('renders stage sections and attached items', () => {
    render(<ConceptNotebook concept={concept} />);

    expect(screen.getByText('Workspace')).toBeInTheDocument();
    expect(screen.getByText('Inbox')).toBeInTheDocument();
    expect(screen.getByText('Working')).toBeInTheDocument();
    expect(screen.getByText('Working Source')).toBeInTheDocument();
  });

  it('attaches an item through the add drawer into inbox', async () => {
    render(<ConceptNotebook concept={concept} />);

    fireEvent.click(screen.getByTestId('concept-add-material-button'));

    expect(screen.getByText('Add material')).toBeInTheDocument();
    expect(screen.getByText('Search Result')).toBeInTheDocument();

    const row = screen.getByTestId('concept-add-material-row-highlight-highlight-new');
    fireEvent.click(within(row).getByRole('button', { name: 'Add' }));

    await waitFor(() => {
      expect(attachConceptWorkspaceBlock).toHaveBeenCalledWith('concept-1', expect.objectContaining({
        type: 'highlight',
        refId: 'highlight-new',
        stage: 'inbox',
        sectionId: 'inbox'
      }));
    });
  });

  it('updates stage from item stage selector', async () => {
    render(<ConceptNotebook concept={concept} />);

    const workingItem = screen.getByTestId('concept-workspace-item-item-working');
    const stageSelect = within(workingItem).getByLabelText('Stage');

    fireEvent.change(stageSelect, { target: { value: 'draft' } });

    await act(async () => {
      jest.advanceTimersByTime(380);
    });

    await waitFor(() => {
      expect(mockSaveWorkspace).toHaveBeenCalled();
    });
  });

  it('filters visible items by stage', () => {
    render(<ConceptNotebook concept={concept} />);

    const stageFilter = screen.getByRole('tablist', { name: 'Stage filter' });
    fireEvent.click(within(stageFilter).getByRole('button', { name: 'Draft' }));

    expect(screen.queryByText('Working Source')).not.toBeInTheDocument();
    expect(screen.getByText('Draft Source')).toBeInTheDocument();
  });

  it('builds workspace from library and refreshes data', async () => {
    render(<ConceptNotebook concept={concept} />);

    fireEvent.click(screen.getByTestId('concept-build-library-button'));

    await waitFor(() => {
      expect(buildConceptWorkspaceFromLibrary).toHaveBeenCalledWith('concept-1', {
        mode: 'library_only',
        maxLoops: 2
      });
    });

    await waitFor(() => {
      expect(mockRefreshWorkspace).toHaveBeenCalled();
      expect(mockRefreshMaterial).toHaveBeenCalled();
    });
  });
});
