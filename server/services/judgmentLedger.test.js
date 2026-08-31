const {
  CLOCKS,
  VERDICTS,
  applyLessonResolution,
  clockFact,
  clocksOf,
  explainDate,
  ledgerFor,
  outcomeRecord,
  proposeLessons,
  reconstructAt,
  replayDecision
} = require('./judgmentLedger');

const day = (stamp) => new Date(`${stamp}T12:00:00.000Z`);

const page = (judgment = {}, extras = {}) => ({
  _id: 'live-1',
  title: 'Compute',
  createdAt: day('2026-01-01'),
  sourceRefs: [
    { _id: 'src-10k', citationLabel: '10-K', url: 'https://example.com/10k' }
  ],
  judgment: {
    currentJudgment: 'Compute stays scarce through 2027.',
    status: 'monitoring',
    decisionPosture: 'watch',
    bornAt: day('2026-01-15'),
    ...judgment
  },
  ...extras
});

describe('five clocks are facts, not a log', () => {
  it('names each clock, who wrote it, and how precise the time is', () => {
    const fact = clockFact({
      clock: 'evidence',
      occurredAt: day('2026-03-01'),
      recordedAt: day('2026-03-12'),
      authoredBy: 'world',
      summary: 'The 10-K landed.',
      sourceRefIds: ['src-10k']
    });
    expect(CLOCKS).toEqual(['evidence', 'expectation', 'decision', 'review', 'outcome']);
    expect(fact.clock).toBe('evidence');
    expect(fact.authoredBy).toBe('world');
    expect(fact.precision).toBe('day');
    expect(fact.recordHash).toMatch(/^[a-f0-9]{64}$/);
    const explained = explainDate(fact);
    expect(explained.label).toBe('When the world spoke');
    expect(explained.when).toBe('March 1, 2026');
    expect(explained.when).not.toMatch(/12:00/);
    expect(explained.late).toBe(true);
    expect(explained.lateNote).toMatch(/Written down/);
    expect(explained.precisionNote).toMatch(/hour is not/);
  });

  it('refuses a fabricated hour when the day is unknown', () => {
    expect(() => clockFact({ clock: 'review', precision: 'exact' }))
      .toThrow(/precision must be unknown/);
    expect(() => clockFact({ clock: 'activity' })).toThrow(/evidence, expectation, decision, review, or outcome/);
  });

  it('keeps late evidence on the evidence clock, not the day it was inked', () => {
    const casebook = page({
      clocks: [clockFact({
        clock: 'evidence',
        occurredAt: day('2026-02-01'),
        recordedAt: day('2026-08-20'),
        authoredBy: 'world',
        summary: 'A filing from February.',
        relatedId: 'late-filing'
      })]
    });
    const believed = reconstructAt({ page: casebook, at: day('2026-03-01') });
    expect(believed.clocks.some((fact) => fact.relatedId === 'late-filing')).toBe(false);
    expect(believed.lineage.find((row) => row.clock === 'evidence')).toMatchObject({
      clock: 'evidence',
      note: 'Written later. The past does not move.'
    });
    const now = reconstructAt({ page: casebook, at: day('2026-08-21') });
    const late = now.clocks.find((fact) => fact.relatedId === 'late-filing');
    expect(late).toBeTruthy();
    expect(explainDate(late).late).toBe(true);
  });

  it('lets a review be dated in the past without moving the recorded-at clock', () => {
    const review = clockFact({
      clock: 'review',
      occurredAt: day('2026-04-01'),
      recordedAt: day('2026-08-31'),
      authoredBy: 'user',
      summary: 'Looked again at April.'
    });
    expect(review.occurredAt.toISOString()).toBe('2026-04-01T12:00:00.000Z');
    expect(review.recordedAt.toISOString()).toBe('2026-08-31T12:00:00.000Z');
    expect(explainDate(review).late).toBe(true);
    const believed = reconstructAt({
      page: page({ clocks: [review] }),
      at: day('2026-05-01')
    });
    expect(believed.clocks.some((fact) => fact.clock === 'review')).toBe(false);
  });

  it('records an outcome without rewriting the decision that preceded it', () => {
    const decision = clockFact({
      clock: 'decision',
      occurredAt: day('2026-02-01'),
      recordedAt: day('2026-02-01'),
      summary: 'Held the claim.',
      relatedId: 'decision-1'
    });
    const outcome = outcomeRecord({
      result: 'held',
      observedAt: day('2026-08-01'),
      recordedAt: day('2026-08-31'),
      verdictId: 'verdict-1',
      verdictSnapshot: 'held_up',
      question: 'Did it hold for the reasons you thought?',
      answer: 'Yes, but the reason was power, not silicon.',
      lesson: 'Watch conversion, not announcements.'
    });
    expect(outcome.verdictSnapshot).toBe('held_up');
    expect(outcome.answer).toMatch(/power/);
    const casebook = page({
      clocks: [decision],
      verdicts: [{ verdictId: 'verdict-1', result: 'held_up', recordedAt: day('2026-08-01') }],
      outcomes: [outcome]
    });
    expect(casebook.judgment.verdicts[0].result).toBe('held_up');
    expect(casebook.judgment.outcomes[0].verdictSnapshot).toBe('held_up');
  });
});

describe('time travel restores what was believed', () => {
  const living = page({
    why: [
      { reasonId: 'why-1', text: 'Lead times.', createdAt: day('2026-01-20'), sourceRefIds: ['src-10k'] }
    ],
    against: [
      { reasonId: 'against-1', text: 'Hyperscalers design silicon.', createdAt: day('2026-06-01') }
    ],
    unknowns: [
      { unknownId: 'u1', question: 'Does conversion slip?', createdAt: day('2026-01-22') }
    ],
    decisionPosture: 'act'
  });

  const revisions = [
    {
      createdAt: day('2026-02-01'),
      after: {
        sourceRefs: [{ _id: 'src-10k', citationLabel: '10-K' }],
        judgment: {
          currentJudgment: 'Compute stays scarce through 2027.',
          decisionPosture: 'watch',
          why: [{ reasonId: 'why-1', text: 'Lead times.', createdAt: day('2026-01-20'), sourceRefIds: ['src-10k'] }],
          against: [],
          unknowns: [{ unknownId: 'u1', question: 'Does conversion slip?', createdAt: day('2026-01-22') }]
        }
      }
    },
    {
      createdAt: day('2026-06-02'),
      after: living
    }
  ];

  it('restores posture, evidence, and questions at a prior instant', () => {
    const then = reconstructAt({ page: living, revisions, at: day('2026-03-01') });
    expect(then.known).toBe(true);
    expect(then.posture).toBe('watch');
    expect(then.evidence.why).toEqual(['Lead times.']);
    expect(then.evidence.against).toEqual([]);
    expect(then.questions).toEqual(['Does conversion slip?']);
    const now = reconstructAt({ page: living, revisions, at: day('2026-06-15') });
    expect(now.posture).toBe('act');
    expect(now.evidence.against).toEqual(['Hyperscalers design silicon.']);
  });

  it('keeps later edits as lineage rather than folding them into the past', () => {
    const then = reconstructAt({ page: living, revisions, at: day('2026-03-01') });
    expect(then.lineage.some((row) => /later/i.test(row.note))).toBe(true);
    expect(then.claim).toBe('Compute stays scarce through 2027.');
  });

  it('resolves a citation that was on the case, and discloses one that was not', () => {
    const then = reconstructAt({ page: living, revisions, at: day('2026-03-01') });
    expect(then.citations.find((row) => row.id === 'src-10k')).toMatchObject({
      resolved: true,
      label: '10-K'
    });
    const missing = reconstructAt({
      page: {
        ...living,
        judgment: {
          ...living.judgment,
          why: [{ reasonId: 'why-2', text: 'A later source.', createdAt: day('2026-01-20'), sourceRefIds: ['src-later'] }]
        },
        sourceRefs: [...living.sourceRefs, { _id: 'src-later', citationLabel: 'Later note' }]
      },
      revisions,
      at: day('2026-03-01')
    });
    expect(missing.citations.find((row) => row.id === 'src-later')).toMatchObject({
      resolved: false,
      absence: 'This source arrived later.'
    });
  });

  it('discloses that the case did not exist yet', () => {
    const before = reconstructAt({ page: living, revisions, at: day('2025-01-01') });
    expect(before.known).toBe(false);
    expect(before.reason).toMatch(/did not exist/);
  });
});

describe('decision replay', () => {
  it('walks evidence to action to outcome, and labels inference', () => {
    const casebook = page({
      clocks: [
        clockFact({
          clock: 'evidence',
          occurredAt: day('2026-02-01'),
          recordedAt: day('2026-02-01'),
          summary: 'the 10-K showed conversion slipping',
          sourceRefIds: ['src-10k'],
          causalKind: 'evidence'
        }),
        clockFact({
          clock: 'decision',
          occurredAt: day('2026-02-02'),
          recordedAt: day('2026-02-02'),
          summary: 'held the claim',
          causalKind: 'inference'
        }),
        clockFact({
          clock: 'outcome',
          occurredAt: day('2026-08-01'),
          recordedAt: day('2026-08-01'),
          summary: 'conversion did slip'
        })
      ]
    });
    const replay = replayDecision(casebook);
    expect(replay.frames.map((frame) => frame.clock)).toEqual(expect.arrayContaining(['evidence', 'decision', 'outcome']));
    expect(replay.frames.find((frame) => frame.clock === 'evidence').source).toMatchObject({
      resolved: true,
      label: '10-K'
    });
    expect(replay.frames.find((frame) => frame.causalKind === 'inference').causalKind).toBe('inference');
    expect(replay.summary).toMatch(/Knew .* then .* later/i);
    expect(replay.pivotal.length).toBeGreaterThan(0);
    expect(JSON.stringify(replay)).not.toMatch(/score|strongest|confetti/i);
  });
});

describe('outcomes and the one-question postmortem', () => {
  it('allows silence, and never rewrites the original verdict', () => {
    const silent = outcomeRecord({
      silence: true,
      verdictId: 'v1',
      verdictSnapshot: 'broke',
      observedAt: day('2026-08-01')
    });
    expect(silent.silence).toBe(true);
    expect(silent.answer).toBe('');
    expect(silent.verdictSnapshot).toBe('broke');
    expect(VERDICTS).toContain('right_for_wrong_reasons');
  });

  it('may create a lesson while leaving the decision untouched', () => {
    const outcome = outcomeRecord({
      result: 'held',
      verdictSnapshot: 'right_for_wrong_reasons',
      question: 'What was the real reason?',
      answer: 'Power, not silicon.',
      lesson: 'Watch interconnect, not wafer starts.'
    });
    expect(outcome.lesson).toMatch(/interconnect/);
    expect(outcome.verdictSnapshot).toBe('right_for_wrong_reasons');
  });
});

describe('lessons flow forward as proposals', () => {
  const settled = {
    _id: 'settled-1',
    sourceRefs: [{ _id: 'src-10k' }],
    judgment: {
      currentJudgment: 'Compute stays scarce through 2027.',
      status: 'closed',
      lessons: [{ lessonId: 'l-power', text: 'Watch conversion, not announcements.', at: day('2026-08-01') }],
      verdicts: [{ verdictId: 'v1', result: 'partly' }]
    }
  };

  const live = page({
    currentJudgment: 'Conversion will slip again this year.',
    why: [{ reasonId: 'why-1', text: 'Lead times.', sourceRefIds: ['src-10k'] }]
  }, { sourceRefs: [{ _id: 'src-10k', citationLabel: '10-K' }] });

  it('surfaces a settled lesson only on a relevant live case, as a proposal', () => {
    const proposals = proposeLessons({ livePage: live, settledPages: [settled] });
    expect(proposals).toHaveLength(1);
    expect(proposals[0]).toMatchObject({
      text: 'Watch conversion, not announcements.',
      proposed: true,
      asserted: false,
      status: 'proposed'
    });
    expect(proposeLessons({ livePage: settled, settledPages: [settled] })).toEqual([]);
  });

  it('accepts, rejects, narrows, or retires without rewriting the original', () => {
    const proposed = proposeLessons({ livePage: live, settledPages: [settled] })[0];
    const accepted = applyLessonResolution({
      livePage: live,
      lesson: proposed,
      status: 'accepted',
      at: day('2026-08-31')
    });
    expect(accepted.lesson.text).toBe('Watch conversion, not announcements.');
    expect(accepted.lesson.sourceLessonId).toBe('l-power');
    expect(accepted.original.text).toBe('Watch conversion, not announcements.');

    const narrowed = applyLessonResolution({
      livePage: live,
      lesson: proposed,
      status: 'narrowed',
      narrowedText: 'Watch conversion on interconnect only.',
      at: day('2026-08-31')
    });
    expect(narrowed.lesson.text).toBe('Watch conversion on interconnect only.');
    expect(narrowed.original.text).toBe('Watch conversion, not announcements.');

    const rejected = applyLessonResolution({ livePage: live, lesson: proposed, status: 'rejected' });
    expect(rejected.lesson).toBeNull();
    expect(rejected.application.status).toBe('rejected');
    expect(settled.judgment.lessons[0].text).toBe('Watch conversion, not announcements.');
  });
});

describe('the ledger does not invent a score', () => {
  it('reads as clocks, replay, and lessons — never a tally', () => {
    const view = ledgerFor({ page: page(), settledPages: [] });
    expect(view.clocks.length).toBeGreaterThan(0);
    expect(JSON.stringify(view)).not.toMatch(/strongest|confetti|toast|gamif|score/i);
  });
});
