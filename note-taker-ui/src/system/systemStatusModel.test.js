import {
  buildSystemStatusLiveMessage,
  EMPTY_SYSTEM_STATUS,
  getSystemStatusTone,
  hasSystemStatusActivity,
  normalizeSystemReceipt
} from './systemStatusModel';

describe('systemStatusModel', () => {
  it('detects idle vs active states', () => {
    expect(hasSystemStatusActivity(EMPTY_SYSTEM_STATUS)).toBe(false);
    expect(hasSystemStatusActivity({
      ...EMPTY_SYSTEM_STATUS,
      backgroundWork: { label: 'Syncing Readwise' }
    })).toBe(true);
  });

  it('prioritizes failure over working and receipt tones', () => {
    expect(getSystemStatusTone({
      backgroundWork: { label: 'Working' },
      latestReceipt: { title: 'Done', summary: 'Finished' },
      recoverableFailure: { stage: 'Import', message: 'Retry sync' }
    })).toBe('failure');
    expect(getSystemStatusTone({
      backgroundWork: { label: 'Working' },
      latestReceipt: { title: 'Done', summary: 'Finished' },
      recoverableFailure: null
    })).toBe('working');
  });

  it('builds polite live announcements from the active state', () => {
    expect(buildSystemStatusLiveMessage({
      ...EMPTY_SYSTEM_STATUS,
      backgroundWork: { label: 'Wiki maintenance', stage: 'Refreshing pages' }
    })).toBe('Wiki maintenance: Refreshing pages');
    expect(buildSystemStatusLiveMessage({
      ...EMPTY_SYSTEM_STATUS,
      recoverableFailure: { stage: 'Import', message: 'Readwise sync failed' }
    })).toBe('Action needed: Readwise sync failed');
  });

  it('normalizes durable Noeis receipts for the topbar affordance', () => {
    expect(normalizeSystemReceipt({
      id: 'receipt-1',
      kind: 'import',
      source: 'readwise',
      sourceLabel: 'Readwise',
      status: 'completed_with_warnings',
      title: 'Readwise import finished',
      summary: 'Imported 2 highlights. 1 indexing issue.',
      nextAction: { href: '/connections' }
    })).toEqual({
      id: 'receipt-1',
      title: 'Readwise import finished',
      summary: 'Imported 2 highlights. 1 indexing issue.',
      status: 'completed_with_warnings',
      href: '/connections'
    });
  });
});
