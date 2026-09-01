import { describeLanding, describePreview } from './judgmentWrite';

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

describe('describeLanding · narrowing', () => {
  it('says what actually happened to the belief', () => {
    expect(describeLanding({ verb: 'narrowed', revisionId: 'rev1', nextReviewAt: '2026-09-30' }))
      .toBe('narrowed · prior wording preserved · review Sep 30');
  });

  it('still defaults to accepted when no verb is given', () => {
    expect(describeLanding({ revisionId: 'rev1' })).toBe('accepted · prior wording preserved');
  });
});

describe('describePreview', () => {
  it('says what accepting is about to do, before it does it', () => {
    expect(describePreview({ verb: 'accept', boundSources: 3, nextReviewAt: '2026-09-30' }))
      .toBe('accepting · prior wording kept · 3 bound sources unchanged · review stays Sep 30');
  });

  it('speaks of narrowing as its own act', () => {
    expect(describePreview({ verb: 'narrow', boundSources: 1 }))
      .toBe('narrowing · prior wording kept · 1 bound source unchanged');
  });

  it('does not count sources it has not counted', () => {
    expect(describePreview({ verb: 'accept' })).toBe('accepting · prior wording kept');
    expect(describePreview({ verb: 'accept', boundSources: null })).toBe('accepting · prior wording kept');
  });

  it('counts zero when zero is what was actually found', () => {
    expect(describePreview({ verb: 'accept', boundSources: 0 }))
      .toBe('accepting · prior wording kept · 0 bound sources unchanged');
  });

  it('previews no consequences for the dispositions that change nothing', () => {
    expect(describePreview({ verb: 'preserve', boundSources: 3, nextReviewAt: '2026-09-30' }))
      .toBe('preserving what you hold');
    expect(describePreview({ verb: 'reject', boundSources: 3 })).toBe('rejecting');
    expect(describePreview({ verb: 'defer' })).toBe('deferring');
  });

  it('says nothing for a disposition it does not know', () => {
    expect(describePreview({ verb: 'shrug' })).toBe('');
  });

  it('reads in the same clauses as the receipt that follows it', () => {
    const preview = describePreview({ verb: 'accept', nextReviewAt: '2026-09-30' });
    const receipt = describeLanding({ verb: 'accepted', revisionId: 'r1', nextReviewAt: '2026-09-30' });
    expect(preview.split(' · ')[1]).toBe('prior wording kept');
    expect(receipt.split(' · ')[1]).toBe('prior wording preserved');
    // Promise then confirmation: same order, same separator, different tense.
    expect(preview.split(' · ')).toHaveLength(3);
    expect(receipt.split(' · ')).toHaveLength(3);
  });
});
