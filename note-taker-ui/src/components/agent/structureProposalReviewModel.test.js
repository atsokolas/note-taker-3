import {
  buildBulkOperationStatusUpdates,
  getSelectableStructureOperations,
  resolveOperationRationale,
  resolveSourceQualityKey,
  resolveSourceQualityLabel
} from './structureProposalReviewModel';

describe('structureProposalReviewModel', () => {
  it('prefers classification rationale fields for move items', () => {
    expect(resolveOperationRationale({
      preview: { classificationReason: 'Crypto exchange coverage fits Blockchain and Crypto.' }
    })).toBe('Crypto exchange coverage fits Blockchain and Crypto.');

    expect(resolveOperationRationale({
      preview: { reason: 'Fallback reason' },
      payload: { classificationRationale: 'Primary rationale' }
    })).toBe('Fallback reason');
  });

  it('returns empty rationale when no classification reason exists', () => {
    expect(resolveOperationRationale({ preview: { destinationFolderName: 'Research' } })).toBe('');
  });

  it('maps source quality keys to calm labels', () => {
    expect(resolveSourceQualityKey({ preview: { sourceQuality: 'needs-review' } })).toBe('needs_review');
    expect(resolveSourceQualityLabel({ preview: { sourceQuality: 'strong' } })).toBe('Strong signal');
    expect(resolveSourceQualityLabel({ preview: { quality: 'thin' } })).toBe('Thin source');
    expect(resolveSourceQualityLabel({ payload: { qualityLabel: 'needs_review' } })).toBe('Needs review');
  });

  it('builds bulk status updates for selected operations', () => {
    const operations = [
      { opId: 'move-1', status: 'pending', isActionable: true },
      { opId: 'move-2', status: 'approved', isActionable: true },
      { opId: 'create-1', status: 'pending', isActionable: false }
    ];
    expect(getSelectableStructureOperations(operations)).toHaveLength(2);
    expect(buildBulkOperationStatusUpdates({
      operations,
      selectedOpIds: ['move-1', 'move-2'],
      nextStatus: 'rejected'
    })).toEqual([
      { opId: 'move-1', status: 'rejected' },
      { opId: 'move-2', status: 'rejected' }
    ]);
  });
});
