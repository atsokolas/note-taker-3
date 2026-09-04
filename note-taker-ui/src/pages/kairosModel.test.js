import { KAIROS_EYEBROW, KAIROS_SENTENCE, addDays, askedBackLine, kairosSentence, nextMonday, paperAskedBack, pendingRemindOf, promiseLedger, remindPresets } from './kairosModel';

const NOW = new Date('2026-08-31T15:00:00');

describe('kairos', () => {
  it('offers tomorrow, next week, a month, and every Monday — never daily', () => {
    const presets = remindPresets(NOW);
    expect(presets.map((row) => row.label)).toEqual([
      'Tomorrow',
      'Next week',
      'In a month',
      'Every Monday'
    ]);
    expect(presets.every((row) => row.cadence !== 'daily')).toBe(true);
    expect(presets.find((row) => row.id === 'every-monday').cadence).toBe('weekly');
    expect(presets.find((row) => row.id === 'tomorrow').dueAt.toISOString())
      .toBe(addDays(NOW, 1).toISOString());
    expect(nextMonday(new Date('2026-09-01T12:00:00')).getDay()).toBe(1);
  });

  it('typesets asked-back without a Reminders heading or a count', () => {
    expect(KAIROS_EYEBROW).toBe('καιρός');
    expect(KAIROS_SENTENCE).toBe('You asked for this back.');
    expect(paperAskedBack([
      { articleId: 'a1', title: 'The Costco 10-K' },
      { articleId: 'a2', title: '' },
      { title: 'No identity' }
    ]).map((row) => row.articleId)).toEqual(['a1']);
    expect(askedBackLine({
      fromPlacement: 'setAside',
      fromAt: '2026-08-25T09:00:00.000Z',
      reason: 'the margin note on returns'
    })).toMatch(/set aside/i);
    expect(askedBackLine({
      fromPlacement: 'setAside',
      fromAt: '2026-08-25T09:00:00.000Z',
      reason: 'the margin note on returns'
    })).toMatch(/from the margin note on returns/);
    expect(askedBackLine({ title: 'The Costco 10-K' })).toBe('');
  });

  it('finds the pending remind for one article', () => {
    expect(pendingRemindOf([
      { status: 'completed', itemType: 'article', itemId: 'a1' },
      { status: 'pending', itemType: 'article', itemId: 'a1', _id: 'q1' }
    ], 'a1')._id).toBe('q1');
    expect(pendingRemindOf([], 'a1')).toBeNull();
  });
});

/* A promise that recurs remembers that it has fired before. Saying "You asked
   for this back." every Tuesday for a year turns a kept promise into a
   notification. */
describe('a recurring promise', () => {
  it('says it plainly the first time', () => {
    expect(kairosSentence({ fired: 0 })).toBe('You asked for this back.');
    expect(kairosSentence({})).toBe('You asked for this back.');
  });

  it('acknowledges the repeat from the second firing on', () => {
    expect(kairosSentence({ fired: 1, recurring: true })).toBe('Again, as you asked.');
    expect(kairosSentence({ fired: 9, recurring: true })).toBe('Again, as you asked.');
  });

  it('does not call a one-off a repeat, however many times it was rescheduled', () => {
    expect(kairosSentence({ fired: 3, recurring: false })).toBe('You asked for this back.');
  });
});

/* The promise ledger: the Later pile's door onto pending promises. */
describe('promiseLedger', () => {
  const NOW_LEDGER = new Date('2026-08-31T12:00:00.000Z').getTime();
  const entry = (overrides = {}) => ({
    _id: 'q1',
    status: 'pending',
    itemType: 'article',
    itemId: 'a1',
    dueAt: '2026-09-01T09:00:00.000Z',
    reason: '',
    cadence: null,
    item: { title: 'The Costco 10-K' },
    ...overrides
  });

  it('lists pending article promises with the one time word', () => {
    const rows = promiseLedger([entry()], new Map(), NOW_LEDGER);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      articleId: 'a1',
      title: 'The Costco 10-K',
      href: '/library?articleId=a1',
      day: 'TUE'
    });
  });

  it('falls back to the article at hand when the hydrated title is gone', () => {
    const rows = promiseLedger(
      [entry({ item: null })],
      new Map([['a1', { title: 'Held title' }]]),
      NOW_LEDGER
    );
    expect(rows[0].title).toBe('Held title');
  });

  it('prints nothing for settled rows, other kinds, or untitled pieces', () => {
    expect(promiseLedger([
      entry({ status: 'completed' }),
      entry({ _id: 'q2', itemType: 'highlight' }),
      entry({ _id: 'q3', item: null })
    ], new Map(), NOW_LEDGER)).toEqual([]);
  });
});
