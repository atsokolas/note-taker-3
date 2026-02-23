import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import ConceptNotebook from './ConceptNotebook';
import { attachConceptWorkspaceBlock } from '../../../api/concepts';
import useArticles from '../../../hooks/useArticles';
import useConceptMaterial from '../../../hooks/useConceptMaterial';
import useConceptWorkspace from '../../../hooks/useConceptWorkspace';
import useHighlightsQuery from '../../../hooks/useHighlightsQuery';

jest.mock('../../../api/concepts', () => ({
  attachConceptWorkspaceBlock: jest.fn()
}));

jest.mock('../../../hooks/useArticles', () => jest.fn());
jest.mock('../../../hooks/useConceptMaterial', () => jest.fn());
jest.mock('../../../hooks/useConceptWorkspace', () => jest.fn());
jest.mock('../../../hooks/useHighlightsQuery', () => jest.fn());

const concept = { _id: 'concept-1', name: 'Systems Thinking' };

const createWorkspace = () => ({
  version: 1,
  groups: [
    { id: 'workspace', title: 'Workspace', description: '', collapsed: false, order: 0 },
    { id: 'evidence-section', title: 'Evidence', description: '', collapsed: false, order: 1 }
  ],
  items: [
    {
      id: 'item-working',
      type: 'highlight',
      refId: 'highlight-working',
      groupId: 'workspace',
      parentId: '',
      stage: 'working',
      status: 'active',
      order: 0
    },
    {
      id: 'item-claim',
      type: 'highlight',
      refId: 'highlight-claim',
      groupId: 'workspace',
      parentId: '',
      stage: 'claim',
      status: 'active',
      order: 1
    }
  ],
  connections: [],
  updatedAt: new Date().toISOString()
});

describe('ConceptNotebook workspace interactions', () => {
  let mockPatchWorkspace;
  let mockSetWorkspace;
  let mockSaveWorkspace;
  let mockRefreshWorkspace;

  beforeEach(() => {
    jest.useFakeTimers();

    mockPatchWorkspace = jest.fn().mockResolvedValue(undefined);
    mockSetWorkspace = jest.fn();
    mockSaveWorkspace = jest.fn().mockResolvedValue(undefined);
    mockRefreshWorkspace = jest.fn().mockResolvedValue(undefined);

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
            _id: 'highlight-claim',
            articleTitle: 'Claim Source',
            text: 'Claim text',
            createdAt: new Date().toISOString(),
            tags: ['claims']
          }
        ],
        recentHighlights: [],
        linkedArticles: [],
        linkedNotes: []
      },
      loading: false,
      error: '',
      refresh: jest.fn().mockResolvedValue(undefined)
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
        items: [
          ...createWorkspace().items,
          {
            id: 'item-new',
            type: 'highlight',
            refId: 'highlight-new',
            groupId: 'workspace',
            parentId: '',
            stage: 'inbox',
            status: 'active',
            order: 2
          }
        ]
      }
    });
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('loads and renders workspace sections and blocks', () => {
    render(<ConceptNotebook concept={concept} />);

    expect(screen.getByText('Workspace')).toBeInTheDocument();
    expect(screen.getByText('Evidence')).toBeInTheDocument();
    expect(screen.getByText('Working Source')).toBeInTheDocument();
    expect(screen.getByText('Claim Source')).toBeInTheDocument();
  });

  it('attaches an item through the add drawer', async () => {
    render(<ConceptNotebook concept={concept} />);

    fireEvent.click(screen.getByRole('button', { name: '+ Add' }));

    expect(screen.getByText('Add to Concept')).toBeInTheDocument();
    expect(screen.getByText('Search Result')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() => {
      expect(attachConceptWorkspaceBlock).toHaveBeenCalledWith('concept-1', expect.objectContaining({
        type: 'highlight',
        refId: 'highlight-new',
        stage: 'inbox',
        sectionId: 'workspace'
      }));
    });
  });

  it('moves a block to another section using section picker', async () => {
    render(<ConceptNotebook concept={concept} />);

    const menuButtons = screen.getAllByText('⋯');
    fireEvent.click(menuButtons[0]);

    const moveSelect = screen.getByDisplayValue('Workspace');
    fireEvent.change(moveSelect, { target: { value: 'evidence-section' } });

    await act(async () => {
      jest.advanceTimersByTime(500);
    });

    await waitFor(() => {
      expect(mockSaveWorkspace).toHaveBeenCalled();
    });
  });

  it('cycles stage and filters by stage', async () => {
    render(<ConceptNotebook concept={concept} />);

    const stageFilter = screen.getByRole('tablist', { name: 'Stage filter' });
    const filterWorkingButton = within(stageFilter).getByRole('button', { name: 'Working' });
    const workingButtons = screen.getAllByRole('button', { name: 'Working' });
    const stageWorkingButton = workingButtons.find(button => button !== filterWorkingButton) || filterWorkingButton;

    fireEvent.click(stageWorkingButton);

    await act(async () => {
      jest.advanceTimersByTime(500);
    });

    await waitFor(() => {
      expect(mockSaveWorkspace).toHaveBeenCalled();
    });

    fireEvent.click(within(stageFilter).getByRole('button', { name: 'Claim' }));
    expect(screen.queryByText('Working Source')).not.toBeInTheDocument();
    expect(screen.getByText('Claim Source')).toBeInTheDocument();
  });

  it('creates a connection with the inline relation picker', async () => {
    render(<ConceptNotebook concept={concept} />);

    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
    fireEvent.change(screen.getByLabelText('Relation'), { target: { value: 'definition' } });

    fireEvent.click(screen.getByText('Working Source'));
    fireEvent.click(screen.getByText('Claim Source'));

    await waitFor(() => {
      expect(mockPatchWorkspace).toHaveBeenCalledWith(
        'addConnection',
        expect.objectContaining({
          fromItemId: 'item-working',
          toItemId: 'item-claim',
          type: 'definition'
        }),
        expect.objectContaining({ optimisticWorkspace: expect.any(Object) })
      );
    });
  });
});
