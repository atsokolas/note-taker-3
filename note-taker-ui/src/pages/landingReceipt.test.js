import { describeLanding } from './landingReceipt';

describe('describeLanding', () => {
  it('reads as the spec writes it when everything is true', () => {
    expect(describeLanding({ revisionId: 'rev1', nextReviewAt: '2026-09-30T00:00:00.000Z' }))
      .toBe('accepted · prior wording preserved · review Sep 30');
  });

  it('does not promise preservation without the revision that holds it', () => {
    expect(describeLanding({ revisionId: '', nextReviewAt: '2026-09-30T00:00:00.000Z' }))
      .toBe('accepted · review Sep 30');
  });

  it('stays quiet about review when none is scheduled', () => {
    expect(describeLanding({ revisionId: 'rev1', nextReviewAt: null }))
      .toBe('accepted · prior wording preserved');
  });

  it('treats an unparseable review date as no review at all', () => {
    expect(describeLanding({ revisionId: 'rev1', nextReviewAt: 'someday' }))
      .toBe('accepted · prior wording preserved');
  });

  it('still reports the acceptance when it is the only true thing', () => {
    expect(describeLanding()).toBe('accepted');
  });
});
