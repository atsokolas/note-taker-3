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
  it('does not print an hour when the clock is a day', () => {
    const explained = explainDate({
      clock: 'evidence',
      occurredAt: '2026-03-01T12:00:00.000Z',
      recordedAt: '2026-08-20T12:00:00.000Z',
      precision: 'day',
      authoredBy: 'world'
    });
    expect(explained.when).toBe('March 1, 2026');
    expect(explained.when).not.toMatch(/12:00/);
    expect(explained.late).toBe(true);
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
