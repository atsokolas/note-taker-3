import {
  buildEvernoteConnectionReceipt,
  buildNotionConnectionReceipt,
  buildReadwiseConnectionReceipt,
  describeReadwiseCadence,
  formatProviderSyncSummary
} from './connectionReceiptModel';

describe('connectionReceiptModel', () => {
  it('formats provider-specific sync summaries', () => {
    expect(formatProviderSyncSummary({
      importedNotes: 3,
      skippedRows: 2,
      indexingQueued: 1
    }, 'notion')).toBe('Synced 3 pages · 2 skipped · 1 indexing.');

    expect(formatProviderSyncSummary({
      importedArticles: 5,
      importedHighlights: 47,
      skippedRows: 1
    }, 'readwise')).toBe('Synced 47 highlights from 5 sources · 1 skipped.');

    expect(formatProviderSyncSummary({
      importedNotes: 2,
      duplicateSkips: 1,
      indexingFailures: 1
    }, 'evernote')).toBe('Imported 2 notes · 1 duplicate skipped · 1 indexing warning.');
  });

  it('builds live Notion syncing receipts', () => {
    const receipt = buildNotionConnectionReceipt({
      connection: { id: 'notion-1', accountLabel: 'HQ' },
      session: {
        provider: 'notion',
        status: 'importing',
        progress: { stage: 'fetching_notion' }
      },
      syncing: true
    });

    expect(receipt.isLive).toBe(true);
    expect(receipt.liveMessage).toMatch(/Syncing Notion/i);
    expect(receipt.statusLabel).toBe('Syncing into Noeis');
  });

  it('builds failed Readwise receipts with stage detail', () => {
    const receipt = buildReadwiseConnectionReceipt({
      readwiseSyncConnection: { id: 'rw-1', accountLabel: 'Reader' },
      session: {
        provider: 'readwise',
        status: 'failed',
        progress: { stage: 'fetching_readwise' },
        lastError: 'Token expired'
      }
    });

    expect(receipt.isLive).toBe(true);
    expect(receipt.failureStage).toBe('fetching_readwise');
    expect(receipt.failureMessage).toBe('Token expired');
  });

  it('prefers durable Readwise lastReceipt over legacy sync counts', () => {
    const receipt = buildReadwiseConnectionReceipt({
      readwiseSyncConnection: {
        id: 'rw-1',
        accountLabel: 'Reader',
        lastSyncAt: '2026-06-27T12:00:00.000Z',
        lastSyncResult: { importedArticles: 1, importedHighlights: 2 },
        lastReceipt: {
          id: 'receipt-rw',
          status: 'completed',
          metrics: { importedHighlights: 12 },
          title: 'Readwise import finished',
          summary: 'Imported 2 sources, 12 highlights.',
          completedAt: '2026-06-27T12:00:00.000Z',
          touched: [{ type: 'article', id: 'a1', title: 'Poor Charlie’s Almanack' }],
          nextAction: { label: 'Review filing suggestions', intent: 'organize_import' }
        }
      }
    });

    expect(receipt.headline).toMatch(/^Checked .+\. 12 new passages came in /);
    expect(receipt.headline).not.toMatch(/receipt/i);
    expect(receipt.summary).toBe('');
    expect(receipt.detail).toMatch(/Poor Charlie/);
    expect(receipt.nextAction.label).toBe('Review filing suggestions');
  });

  it('prefers durable Notion lastReceipt over legacy sync counts', () => {
    const receipt = buildNotionConnectionReceipt({
      connection: {
        id: 'notion-1',
        accountLabel: 'Workspace',
        lastSyncAt: '2026-06-27T12:00:00.000Z',
        lastSyncResult: { importedNotes: 2 },
        lastReceipt: {
          id: 'receipt-notion',
          status: 'completed_with_warnings',
          title: 'Notion import finished',
          summary: 'Imported 4 notes. 1 indexing issue.',
          completedAt: '2026-06-27T12:00:00.000Z'
        }
      }
    });

    expect(receipt.statusLabel).toBe('Synced with warnings');
    expect(receipt.summary).toBe('Imported 4 notes. 1 indexing issue.');
  });

  it('builds completed Evernote import receipts from session results', () => {
    const receipt = buildEvernoteConnectionReceipt({
      session: {
        provider: 'evernote',
        status: 'completed',
        sourceLabel: 'Research Notebook.enex',
        updatedAt: '2026-06-09T12:00:00.000Z',
        result: { importedNotes: 4, duplicateSkips: 1 }
      }
    });

    expect(receipt.statusLabel).toBe('Imported into Noeis');
    expect(receipt.summary).toBe('Imported 4 notes · 1 duplicate skipped.');
    expect(receipt.headline).toMatch(/Research Notebook/i);
  });

  it('prefers durable Evernote session receipts over local import stats', () => {
    const receipt = buildEvernoteConnectionReceipt({
      session: {
        provider: 'evernote',
        status: 'completed',
        sourceLabel: 'Research Notebook.enex',
        updatedAt: '2026-06-09T12:00:00.000Z',
        result: { importedNotes: 4 },
        receipt: {
          id: 'receipt-evernote',
          status: 'completed',
          title: 'Evernote import finished',
          summary: 'Imported 9 notes.',
          completedAt: '2026-06-09T12:00:00.000Z',
          touched: [{ type: 'note', id: 'n1', title: 'Research Note' }]
        }
      },
      importStats: { importedNotes: 4 }
    });

    expect(receipt.summary).toBe('Imported 9 notes.');
    expect(receipt.detail).toMatch(/Research Note/);
  });

  describe('the Readwise timer, in plain words', () => {
    const now = new Date(2026, 9, 11, 14, 0);
    const at = (days, hours = 0) => new Date(now.getTime() - ((days * 24) + hours) * 60 * 60 * 1000).toISOString();
    const weekday = (iso) => new Date(iso).toLocaleDateString(undefined, { weekday: 'long' });

    it('says when it last looked and when anything last came in', () => {
      const arrivedAt = at(5);
      expect(describeReadwiseCadence({
        lastSyncAt: at(0, 2),
        lastReceipt: { status: 'completed', metrics: { importedHighlights: 14 }, completedAt: arrivedAt }
      }, now)).toBe(`Checked 2 hours ago. 14 new passages came in on ${weekday(arrivedAt)}.`);
    });

    it('stays quiet about arrivals when nothing has come in', () => {
      expect(describeReadwiseCadence({
        lastSyncAt: at(0, 1),
        lastReceipt: { status: 'completed', metrics: { importedHighlights: 0 }, completedAt: at(0, 1) }
      }, now)).toBe('Checked an hour ago.');
      expect(describeReadwiseCadence({ lastSyncAt: new Date(now.getTime() - 30000).toISOString() }, now)).toBe('Checked just now.');
    });

    it('says nothing before the first check', () => {
      expect(describeReadwiseCadence({ lastSyncAt: null }, now)).toBe('');
      expect(describeReadwiseCadence(null, now)).toBe('');
    });

    it('speaks of one passage as one, and of yesterday as yesterday', () => {
      expect(describeReadwiseCadence({
        lastSyncAt: at(0, 3),
        lastReceipt: { status: 'completed', metrics: { importedHighlights: 1 }, completedAt: at(1) }
      }, now)).toBe('Checked 3 hours ago. 1 new passage came in yesterday.');
    });
  });
});
