const {
  sanitizeReceiptForStorage,
  serializeStoredReceipt
} = require('./noeisReceiptService');

describe('noeisReceiptService', () => {
  it('preserves the human source label through storage serialization', () => {
    const stored = sanitizeReceiptForStorage({
      id: 'receipt-1',
      kind: 'import',
      source: 'readwise',
      sourceLabel: 'Readwise Library',
      status: 'completed',
      summary: 'Imported 1 source.',
      completedAt: '2026-06-29T12:00:00.000Z',
      touched: [{ type: 'article', id: 'article-1', title: 'Poor Charlie' }],
      nextAction: { label: 'Review filing suggestions', intent: 'organize_import' }
    });

    expect(stored).toMatchObject({
      receiptId: 'receipt-1',
      source: 'readwise',
      sourceLabel: 'Readwise Library'
    });

    expect(serializeStoredReceipt(stored)).toMatchObject({
      id: 'receipt-1',
      source: 'readwise',
      sourceLabel: 'Readwise Library'
    });
  });
});
