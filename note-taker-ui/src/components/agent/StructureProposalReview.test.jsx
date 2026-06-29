import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import StructureProposalReview from './StructureProposalReview';

describe('StructureProposalReview', () => {
  const baseProposal = {
    structureProposalId: 'plan-1',
    status: 'pending',
    scope: 'import_session',
    scopeRef: 'notion-import',
    title: 'Organize the Notion import',
    summary: 'Collapse mirror folders into cleaner buckets.',
    rationale: 'Imported mirror trees are weaker than your main notebook structure.',
    operations: [
      {
        opId: 'move-1',
        type: 'move_item',
        status: 'approved',
        targetDomain: 'notebook',
        payload: {
          itemId: 'note-1',
          destinationFolderName: 'Research'
        },
        preview: {
          itemTitle: 'World Models notes',
          classificationReason: 'Research notes cluster with your active concept work.',
          sourceQuality: 'strong',
          confidence: 0.84,
          highlightCount: 6,
          classificationMethod: 'llm'
        },
        isActionable: true
      },
      {
        opId: 'move-2',
        type: 'move_item',
        status: 'pending',
        targetDomain: 'library',
        payload: {
          itemId: 'article-2',
          destinationFolderName: 'Curated Research'
        },
        preview: {
          itemTitle: 'Sparse import article',
          sourceQuality: 'thin',
          confidence: 0.52,
          highlightCount: 1,
          classificationMethod: 'regex'
        },
        isActionable: true
      },
      {
        opId: 'delete-1',
        type: 'delete_folder',
        status: 'rejected',
        targetDomain: 'notebook',
        payload: {
          folderId: 'folder-legacy'
        },
        preview: {
          folderName: 'Legacy Import'
        },
        isActionable: true
      }
    ]
  };

  it('renders pending plan details and operation controls', () => {
    const onApply = jest.fn();
    const onReject = jest.fn();
    const onUpdateOperationStatus = jest.fn();

    render(
      <StructureProposalReview
        proposal={baseProposal}
        onApply={onApply}
        onReject={onReject}
        onUpdateOperationStatus={onUpdateOperationStatus}
      />
    );

    expect(screen.getByText('Organize the Notion import')).toBeInTheDocument();
    expect(screen.getByText('Collapse mirror folders into cleaner buckets.')).toBeInTheDocument();
    expect(screen.getByText('Imported mirror trees are weaker than your main notebook structure.')).toBeInTheDocument();
    expect(screen.getByText('Items moved')).toBeInTheDocument();
    expect(screen.getByText('Folders removed')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Apply approved changes' }));
    expect(onApply).toHaveBeenCalledWith(baseProposal);

    fireEvent.click(screen.getByRole('button', { name: 'Reject plan' }));
    expect(onReject).toHaveBeenCalledWith(baseProposal);

    fireEvent.click(screen.getAllByRole('button', { name: 'Reject step' })[0]);
    expect(onUpdateOperationStatus).toHaveBeenCalledWith(
      baseProposal,
      expect.objectContaining({ opId: 'move-1' }),
      'rejected'
    );

    fireEvent.click(screen.getByRole('button', { name: 'Restore step' }));
    expect(onUpdateOperationStatus).toHaveBeenCalledWith(
      baseProposal,
      expect.objectContaining({ opId: 'delete-1' }),
      'approved'
    );
  });

  it('renders classification rationale when present and hides it when absent', () => {
    render(<StructureProposalReview proposal={baseProposal} onUpdateOperationStatus={jest.fn()} />);

    expect(screen.getByTestId('structure-operation-rationale-move-1')).toHaveTextContent('Why this category?');
    expect(screen.getByTestId('structure-operation-rationale-move-1')).toHaveTextContent(
      'Research notes cluster with your active concept work.'
    );
    expect(screen.queryByTestId('structure-operation-rationale-move-2')).not.toBeInTheDocument();
  });

  it('renders source quality labels from proposal preview fields', () => {
    render(<StructureProposalReview proposal={baseProposal} onUpdateOperationStatus={jest.fn()} />);

    expect(screen.getByTestId('structure-operation-quality-move-1')).toHaveTextContent('Strong signal');
    expect(screen.getByTestId('structure-operation-quality-move-2')).toHaveTextContent('Thin source');
  });

  it('renders classification evidence chips when present', () => {
    render(<StructureProposalReview proposal={baseProposal} onUpdateOperationStatus={jest.fn()} />);

    expect(screen.getByTestId('structure-operation-evidence-move-1')).toHaveTextContent('84% confidence');
    expect(screen.getByTestId('structure-operation-evidence-move-1')).toHaveTextContent('6 highlights');
    expect(screen.getByTestId('structure-operation-evidence-move-1')).toHaveTextContent('agent classified');
    expect(screen.getByTestId('structure-operation-evidence-move-2')).toHaveTextContent('52% confidence');
    expect(screen.getByTestId('structure-operation-evidence-move-2')).toHaveTextContent('1 highlight');
    expect(screen.getByTestId('structure-operation-evidence-move-2')).toHaveTextContent('regex classified');
  });

  it('renders duplicate source merge operations in product language', () => {
    render(
      <StructureProposalReview
        proposal={{
          ...baseProposal,
          operations: [
            {
              opId: 'merge-source-1',
              type: 'merge_item',
              status: 'pending',
              targetDomain: 'library',
              payload: {
                sourceItemId: 'article-copy',
                destinationItemId: 'article-canonical'
              },
              preview: {
                sourceTitle: 'Imported duplicate',
                destinationTitle: 'Canonical source',
                reason: 'Likely duplicate source from the same URL.',
                sourceQuality: 'needs_review',
                highlightCount: 3,
                classificationMethod: 'duplicate_detector'
              }
            }
          ]
        }}
        onUpdateOperationStatus={jest.fn()}
      />
    );

    expect(screen.getByText('Sources merged')).toBeInTheDocument();
    expect(screen.getByText('Merge duplicate source Imported duplicate')).toBeInTheDocument();
    expect(screen.getByText('Into Canonical source')).toBeInTheDocument();
    expect(screen.getByTestId('structure-operation-rationale-merge-source-1')).toHaveTextContent('Likely duplicate source');
  });

  it('bulk accept/reject controls call the bulk handler for selected operations', async () => {
    const onBulkUpdateOperationStatus = jest.fn().mockResolvedValue(undefined);

    render(
      <StructureProposalReview
        proposal={baseProposal}
        onUpdateOperationStatus={jest.fn()}
        onBulkUpdateOperationStatus={onBulkUpdateOperationStatus}
      />
    );

    expect(screen.getByTestId('structure-proposal-bulk-bar')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Select Move Sparse import article'));
    fireEvent.click(screen.getByRole('button', { name: 'Accept selected' }));

    await waitFor(() => expect(onBulkUpdateOperationStatus).toHaveBeenCalledWith(
      baseProposal,
      ['move-2'],
      'approved'
    ));

    fireEvent.click(screen.getByLabelText('Select Move World Models notes'));
    fireEvent.click(screen.getByRole('button', { name: 'Reject selected' }));

    await waitFor(() => expect(onBulkUpdateOperationStatus).toHaveBeenCalledWith(
      baseProposal,
      ['move-1'],
      'rejected'
    ));
  });

  it('renders history mode with rollback action and execution summary', () => {
    const onRollback = jest.fn();

    render(
      <StructureProposalReview
        proposal={{
          ...baseProposal,
          status: 'partially_applied',
          acceptedAt: '2026-04-20T15:00:00.000Z',
          executionResult: {
            appliedCount: 3,
            skippedCount: 1,
            failedCount: 0
          }
        }}
        onRollback={onRollback}
      />
    );

    expect(screen.queryByRole('button', { name: 'Apply approved changes' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('structure-proposal-bulk-bar')).not.toBeInTheDocument();
    expect(screen.getByText(/Applied/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Roll back' }));
    expect(onRollback).toHaveBeenCalledWith(expect.objectContaining({ structureProposalId: 'plan-1' }));
  });
});
