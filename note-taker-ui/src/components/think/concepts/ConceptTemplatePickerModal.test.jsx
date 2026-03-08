import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ConceptTemplatePickerModal from './ConceptTemplatePickerModal';
import {
  createWorkspaceFromTemplate,
  getWorkspaceTemplateDefinition,
  listWorkspaceTemplates
} from '../../../api/templates';

jest.mock('../../../api/templates', () => ({
  listWorkspaceTemplates: jest.fn(),
  getWorkspaceTemplateDefinition: jest.fn(),
  createWorkspaceFromTemplate: jest.fn()
}));

const templateSummaries = [
  {
    id: 'research-paper-analysis',
    name: 'Research Paper Analysis',
    description: 'Analyze papers',
    icon: '🧪',
    groupCount: 4,
    sampleEntryCount: 3
  },
  {
    id: 'book-notes',
    name: 'Book Notes',
    description: 'Capture book insights',
    icon: '📚',
    groupCount: 4,
    sampleEntryCount: 3
  }
];

const templateDetail = {
  id: 'research-paper-analysis',
  name: 'Research Paper Analysis',
  description: 'Analyze papers',
  icon: '🧪',
  groups: [
    { id: 'inbox', title: 'Inbox' },
    { id: 'working', title: 'Working' },
    { id: 'draft', title: 'Draft' },
    { id: 'archive', title: 'Archive' }
  ],
  sampleEntries: [
    { title: 'Paper Snapshot', content: 'Problem framing', stage: 'inbox', order: 0 },
    { title: 'Method Notes', content: 'Method details', stage: 'working', order: 1 }
  ],
  workflowTips: ['Tip A', 'Tip B', 'Tip C']
};

describe('ConceptTemplatePickerModal', () => {
  beforeEach(() => {
    listWorkspaceTemplates.mockResolvedValue(templateSummaries);
    getWorkspaceTemplateDefinition.mockResolvedValue(templateDetail);
    createWorkspaceFromTemplate.mockResolvedValue({
      conceptId: 'concept-1',
      conceptName: 'Research Paper Analysis'
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders template list and selected template preview', async () => {
    render(<ConceptTemplatePickerModal open onClose={jest.fn()} onCreated={jest.fn()} />);

    await waitFor(() => {
      expect(listWorkspaceTemplates).toHaveBeenCalled();
      expect(getWorkspaceTemplateDefinition).toHaveBeenCalledWith('research-paper-analysis');
    });

    expect(screen.getByTestId('template-card-research-paper-analysis')).toBeInTheDocument();
    expect(screen.getByTestId('template-sample-list')).toHaveTextContent('Paper Snapshot');
    expect(screen.getByTestId('template-workflow-tips')).toHaveTextContent('Tip A');
    expect(screen.getByTestId('template-concept-name-input')).toHaveValue('Research Paper Analysis');
  });

  it('creates workspace from selected template', async () => {
    const onClose = jest.fn();
    const onCreated = jest.fn();

    render(<ConceptTemplatePickerModal open onClose={onClose} onCreated={onCreated} />);

    await waitFor(() => {
      expect(screen.getByTestId('template-concept-name-input')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByTestId('template-concept-name-input'), { target: { value: 'My Papers' } });
    fireEvent.click(screen.getByTestId('create-template-workspace-button'));

    await waitFor(() => {
      expect(createWorkspaceFromTemplate).toHaveBeenCalledWith('research-paper-analysis', {
        target: 'concept',
        conceptName: 'My Papers'
      });
    });

    expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({
      target: 'concept',
      conceptName: 'Research Paper Analysis'
    }));
    expect(onClose).toHaveBeenCalled();
  });

  it('creates notebook from selected template', async () => {
    const onCreated = jest.fn();
    createWorkspaceFromTemplate.mockResolvedValueOnce({
      target: 'notebook',
      notebookEntryId: 'note-1',
      notebookEntry: { _id: 'note-1', title: 'Paper review notebook' }
    });

    render(<ConceptTemplatePickerModal open onClose={jest.fn()} onCreated={onCreated} />);

    await waitFor(() => {
      expect(screen.getByTestId('template-target-notebook')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('template-target-notebook'));
    fireEvent.change(screen.getByTestId('template-concept-name-input'), { target: { value: 'Paper review notebook' } });
    fireEvent.click(screen.getByTestId('create-template-workspace-button'));

    await waitFor(() => {
      expect(createWorkspaceFromTemplate).toHaveBeenCalledWith('research-paper-analysis', {
        target: 'notebook',
        notebookTitle: 'Paper review notebook'
      });
    });

    expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({
      target: 'notebook',
      notebookEntryId: 'note-1'
    }));
  });

  it('shows create error from API', async () => {
    createWorkspaceFromTemplate.mockRejectedValueOnce({
      response: { data: { error: 'Concept already exists.' } }
    });

    render(<ConceptTemplatePickerModal open onClose={jest.fn()} onCreated={jest.fn()} />);

    await waitFor(() => {
      expect(screen.getByTestId('create-template-workspace-button')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('create-template-workspace-button'));

    await waitFor(() => {
      expect(screen.getByText('Concept already exists.')).toBeInTheDocument();
    });
  });
});
