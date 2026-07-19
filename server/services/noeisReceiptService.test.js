const {
  persistNoeisReceipt,
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

  it('propagates a MongoDB session when a receipt is finalized transactionally', async () => {
    const session = { id: 'session-1' };
    let options = null;
    const receipt = await persistNoeisReceipt({
      NoeisReceipt: {
        findOneAndUpdate: async (_query, update, receivedOptions) => {
          options = receivedOptions;
          return update.$set;
        }
      },
      userId: 'user-1',
      session,
      receipt: {
        id: 'receipt-session-1',
        kind: 'research_operating_ledger_entry',
        source: 'noeis',
        status: 'completed',
        completedAt: '2026-07-19T12:00:00.000Z'
      }
    });
    expect(options.session).toBe(session);
    expect(receipt.id).toBe('receipt-session-1');
  });
});
