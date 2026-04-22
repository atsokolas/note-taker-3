import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
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
          itemTitle: 'World Models notes'
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

    fireEvent.click(screen.getByRole('button', { name: 'Reject step' }));
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
    expect(screen.getByText(/Applied/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Roll back' }));
    expect(onRollback).toHaveBeenCalledWith(expect.objectContaining({ structureProposalId: 'plan-1' }));
  });
});
