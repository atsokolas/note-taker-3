import { explainDate, reconstructAt } from './judgmentLedgerClient';
import { momentsFrom, postmortemFor } from './judgmentLedgerModel';

const page = {
  createdAt: '2026-01-01T12:00:00.000Z',
  sourceRefs: [{ _id: 'src-10k', citationLabel: '10-K' }],
  judgment: {
    currentJudgment: 'Compute stays scarce.',
    decisionPosture: 'watch',
    why: [{ reasonId: 'why-1', text: 'Lead times.', createdAt: '2026-01-20T12:00:00.000Z', sourceRefIds: ['src-10k'] }],
    against: [{ reasonId: 'against-1', text: 'In-house silicon.', createdAt: '2026-06-01T12:00:00.000Z' }],
    unknowns: [{ unknownId: 'u1', question: 'Does conversion slip?', createdAt: '2026-01-22T12:00:00.000Z' }],
    verdicts: [{ verdictId: 'v1', result: 'partly', recordedAt: '2026-08-01T12:00:00.000Z' }],
    outcomes: []
  }
};

describe('ledger dates stay honest', () => {
  it('prints the day, never the hour', () => {
    const explained = explainDate({
      clock: 'evidence',
      occurredAt: '2026-03-01T12:00:00.000Z',
      recordedAt: '2026-08-20T12:00:00.000Z',
      precision: 'day',
      authoredBy: 'world'
    });
    expect(explained.when).toBe('Mar 1, 2026');
    expect(explained.when).not.toMatch(/12:00/);
    expect(explained.late).toBe(true);
  });

  it('prints a second-precise record as the same day, without the clock face', () => {
    const explained = explainDate({
      clock: 'decision',
      occurredAt: '2026-08-18T14:20:36.000Z',
      authoredBy: 'user'
    });
    expect(explained.precision).toBe('exact');
    expect(explained.when).toBe('Aug 18, 2026');
    expect(explained.when).not.toMatch(/UTC|:/);
  });

  it('says nothing extra about an hour nobody is being shown', () => {
    expect(explainDate({ clock: 'evidence', occurredAt: '2026-03-01T12:00:00.000Z' }).precisionNote).toBe('');
  });

  it('still refuses to print a day it does not have', () => {
    const month = explainDate({ clock: 'evidence', occurredAt: '2026-03-01T12:00:00.000Z', precision: 'month' });
    expect(month.when).toBe('Mar 2026');
    expect(month.precisionNote).toBe('The month is known; the day is not.');
    expect(explainDate({ clock: 'evidence', precision: 'unknown' }).when).toBe('');
  });
});

describe('the time cursor', () => {
  it('restores evidence and questions from before a later against line', () => {
    const then = reconstructAt({ page, at: '2026-03-01T12:00:00.000Z' });
    expect(then.evidence.why).toEqual(['Lead times.']);
    expect(then.evidence.against).toEqual([]);
    expect(then.questions).toEqual(['Does conversion slip?']);
    expect(then.citations[0]).toMatchObject({ resolved: true, label: '10-K' });
  });

  it('orders moments without inventing extra ones', () => {
    const moments = momentsFrom({ moments: ['2026-01-15T12:00:00.000Z', '2026-08-01T12:00:00.000Z'] }, page);
    expect(moments).toHaveLength(2);
  });
});

describe('postmortem', () => {
  it('asks after a verdict and stays silent once an outcome is bound', () => {
    expect(postmortemFor(page.judgment).question).toMatch(/which part survived/i);
    expect(postmortemFor({
      ...page.judgment,
      outcomes: [{ verdictId: 'v1', silence: true }]
    })).toBeNull();
  });
});
