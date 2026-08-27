import {
  acceptProposalIntoJudgment,
  buildJudgmentIndex,
  claimSentence,
  docText,
  judgmentHeadline,
  namedTitle,
  oneSentence,
  projectJudgment,
  provenanceLine,
  selectOvernightLine,
  sourceHrefFromOrigin
} from './judgmentModel';

const NOW = new Date('2026-08-14T09:30:00.000Z').getTime();

const page = () => ({
  _id: 'wiki-nvidia',
  title: 'NVIDIA',
  sourceRefs: [
    { _id: 'src-1', type: 'external', citationLabel: 'SemiAnalysis', url: 'https://semianalysis.com/capacity' },
    { _id: 'src-2', type: 'external', citationLabel: 'TrendForce', url: 'https://trendforce.com/supply' },
    { _id: 'src-3', type: 'article', title: 'Unused source', objectId: 'article-9' }
  ],
  judgment: {
    kind: 'thesis',
    governingQuestion: 'Does demand outrun capacity?',
    currentJudgment: 'NVIDIA demand still outruns deliverable capacity.',
    startedAt: '2025-11-14T12:00:00.000Z',
    lastReviewedAt: '2026-08-14T08:05:00.000Z',
    why: [
      { reasonId: 'why-1', text: 'AI demand keeps compounding faster than new supply.', sourceRefIds: ['src-1'] },
      { reasonId: 'why-2', text: 'Lead times and power constrain what can be delivered.', sourceRefIds: ['src-2'] }
    ],
    against: [
      { reasonId: 'against-1', text: 'Hyperscalers are designing more in-house silicon.' }
    ],
    falsifiers: [
      { falsifierId: 'f-1', text: 'Confirmed signed capacity converts within 90 days.', status: 'unobserved' },
      { falsifierId: 'f-2', text: 'A retired condition.', status: 'retired' }
    ],
    decisions: [
      {
        decisionId: 'd-1',
        summary: 'Started 1.5%. Won’t add until signed capacity converts.',
        decidedAt: '2025-11-14T12:00:00.000Z',
        status: 'taken',
        reviewAt: '2026-12-01T12:00:00.000Z',
        outcome: {}
      }
    ]
  }
});

describe('judgmentModel', () => {
  it('reads the claim as one sentence and keeps it the same sentence everywhere', () => {
    const projected = projectJudgment(page(), NOW);

    expect(claimSentence(page())).toBe('NVIDIA demand still outruns deliverable capacity.');
    expect(projected.claim).toBe('NVIDIA demand still outruns deliverable capacity.');
    expect(projected.title).toBe('NVIDIA');
    expect(projected.headline).toBe('NVIDIA');
    expect(namedTitle(page())).toBe('NVIDIA');
    expect(judgmentHeadline(page())).toBe('NVIDIA');
    expect(buildJudgmentIndex([page()], NOW)[0]).toMatchObject({
      title: 'NVIDIA',
      headline: 'NVIDIA',
      sentence: projected.claim
    });
  });

  it('does not invent a name when the wiki title is still the claim', () => {
    const unnamed = { _id: 'p', title: 'A claim.', judgment: { currentJudgment: 'A claim.' } };
    expect(namedTitle(unnamed)).toBe('');
    expect(judgmentHeadline(unnamed)).toBe('A claim.');
    expect(projectJudgment(unnamed).title).toBe('');
    expect(projectJudgment(unnamed).headline).toBe('A claim.');
  });

  it('projects the four human fields and drops retired conditions', () => {
    const projected = projectJudgment(page(), NOW);

    expect(projected.why.map(line => line.text)).toEqual([
      'AI demand keeps compounding faster than new supply.',
      'Lead times and power constrain what can be delivered.'
    ]);
    expect(projected.against.map(line => line.text)).toEqual(['Hyperscalers are designing more in-house silicon.']);
    expect(projected.changeMindIf.map(line => line.text)).toEqual(['Confirmed signed capacity converts within 90 days.']);
    expect(projected.whatIDid.map(line => line.text)).toEqual(['Started 1.5%. Won’t add until signed capacity converts.']);
  });

  it('names only the sources the Why lines actually cite', () => {
    const projected = projectJudgment(page(), NOW);

    expect(projected.whySources.map(source => source.label)).toEqual(['SemiAnalysis', 'TrendForce']);
    expect(projected.againstSources).toEqual([]);
    expect(projected.why[0].sources).toEqual([
      expect.objectContaining({ n: 1, label: 'SemiAnalysis', href: 'https://semianalysis.com/capacity' })
    ]);
    expect(projected.why[1].sources).toEqual([
      expect.objectContaining({ n: 2, label: 'TrendForce', href: 'https://trendforce.com/supply' })
    ]);
  });

  it('opens a library-filed line at the passage, not by reprinting the title', () => {
    const filed = {
      _id: 'p',
      title: 'Compute',
      judgment: {
        currentJudgment: 'Compute is scarce.',
        why: [{
          reasonId: 'r1',
          text: 'Deliverable capacity lags demand by two years.',
          sourceLabel: 'On compute · FT',
          acceptedFrom: 'highlight:a1:h1'
        }]
      }
    };
    const projected = projectJudgment(filed, NOW);
    expect(projected.why[0].sources).toEqual([
      expect.objectContaining({
        n: 1,
        label: 'On compute · FT',
        href: '/library?articleId=a1&highlightId=h1'
      })
    ]);
  });

  it('gives the same source the same number on Why and Against', () => {
    const shared = {
      _id: 'p',
      sourceRefs: [{
        _id: 'src-1',
        type: 'external',
        citationLabel: 'SemiAnalysis',
        url: 'https://semianalysis.com/capacity'
      }],
      judgment: {
        currentJudgment: 'A claim.',
        why: [{ reasonId: 'w1', text: 'One reason.', sourceRefIds: ['src-1'] }],
        against: [{ reasonId: 'a1', text: 'One objection.', sourceRefIds: ['src-1'] }]
      }
    };
    const projected = projectJudgment(shared, NOW);
    expect(projected.why[0].sources[0].n).toBe(1);
    expect(projected.against[0].sources[0].n).toBe(1);
  });

  it('rebuilds a library href from the passage the line was accepted from', () => {
    expect(sourceHrefFromOrigin('highlight:a1:h1')).toBe('/library?articleId=a1&highlightId=h1');
    expect(sourceHrefFromOrigin('article:a1')).toBe('/library?articleId=a1');
    expect(sourceHrefFromOrigin('', 'https://ft.com/compute')).toBe('https://ft.com/compute');
    expect(sourceHrefFromOrigin('overnight-event')).toBe('');
  });

  it('leaves empty fields empty rather than inventing lines', () => {
    const bare = { _id: 'bare', title: 'Bare', judgment: { currentJudgment: 'A claim with nothing behind it yet.' } };
    const projected = projectJudgment(bare, NOW);

    expect(projected.why).toEqual([]);
    expect(projected.against).toEqual([]);
    expect(projected.changeMindIf).toEqual([]);
    expect(projected.whatIDid).toEqual([]);
    expect(projected.review).toBeNull();
  });

  it('reads older dossier pages through the same two fields', () => {
    const legacy = {
      _id: 'legacy',
      title: 'Legacy dossier',
      sourceRefs: [],
      judgment: {
        currentJudgment: 'The old contract still holds.',
        assumptions: [
          { assumptionId: 'a-1', text: 'The moat is durable.', status: 'holds' },
          { assumptionId: 'a-2', text: 'A broken assumption.', status: 'failed' }
        ],
        strongestCounterargument: 'Pricing power may not survive the next supply cycle.'
      }
    };
    const projected = projectJudgment(legacy, NOW);

    expect(projected.why.map(line => line.text)).toEqual(['The moat is durable.']);
    expect(projected.against.map(line => line.text)).toEqual(['Pricing power may not survive the next supply cycle.']);
  });

  it('keeps the review off the page until the review date, then asks one question', () => {
    const before = projectJudgment(page(), NOW);
    expect(before.review).toBeNull();

    const due = projectJudgment(page(), new Date('2026-12-02T12:00:00.000Z').getTime());
    expect(due.review).toEqual(expect.objectContaining({ state: 'due', decisionId: 'd-1' }));
  });

  it('reports an observed outcome without inferring one', () => {
    const observed = page();
    observed.judgment.decisions[0].outcome = {
      observedAt: '2026-12-05T12:00:00.000Z',
      summary: 'Capacity converted late.',
      lesson: 'Size to verified conversion.'
    };

    const projected = projectJudgment(observed, new Date('2026-12-06T12:00:00.000Z').getTime());
    expect(projected.review).toEqual(expect.objectContaining({
      state: 'observed',
      summary: 'Capacity converted late.',
      lesson: 'Size to verified conversion.'
    }));
  });

  it('writes the provenance line only from timestamps it actually has', () => {
    expect(provenanceLine(page(), NOW)).toContain('Since November.');
    expect(provenanceLine({ judgment: {} }, NOW)).toBe('');
  });

  it('selects one overnight line for this page and nothing for other pages', () => {
    const events = [
      {
        _id: 'event-1',
        affectedPageIds: ['wiki-nvidia'],
        title: 'A 13F filing was posted',
        summary: 'It does not touch the capacity gap.',
        createdAt: '2026-08-14T04:00:00.000Z'
      },
      {
        _id: 'event-2',
        affectedPageIds: ['some-other-page'],
        title: 'Unrelated event',
        createdAt: '2026-08-14T05:00:00.000Z'
      }
    ];

    const line = selectOvernightLine(page(), events);
    expect(line.id).toBe('event-1');
    expect(line.sentence).toBe('Overnight: A 13F filing was posted. It does not touch the capacity gap.');
    expect(line.body).toBe('A 13F filing was posted. It does not touch the capacity gap.');

    const lowercase = selectOvernightLine(page(), [{ ...events[0], title: 'a 13F filing', summary: 'It does not touch the capacity gap.' }]);
    // The line above the claim continues "Overnight:"; the line written down
    // has to start a sentence of its own.
    expect(lowercase.sentence).toBe('Overnight: a 13F filing. It does not touch the capacity gap.');
    expect(lowercase.body).toBe('A 13F filing. It does not touch the capacity gap.');
    expect(selectOvernightLine(page(), [events[1]])).toBeNull();
  });

  it('appends an accepted line without touching the lines already there', () => {
    const proposal = { id: 'event-1', body: 'A 13F filing was posted.' };
    const judgment = acceptProposalIntoJudgment(page(), proposal, 'against');

    expect(judgment.against.map(line => line.text)).toEqual([
      'Hyperscalers are designing more in-house silicon.',
      'A 13F filing was posted.'
    ]);
    expect(judgment.against[1].acceptedFrom).toBe('event-1');
    expect(judgment.why.map(line => line.text)).toEqual([
      'AI demand keeps compounding faster than new supply.',
      'Lead times and power constrain what can be delivered.'
    ]);
  });

  it('carries legacy lines forward when the first accept lands on a dossier page', () => {
    const legacy = {
      _id: 'legacy',
      judgment: {
        currentJudgment: 'A claim.',
        assumptions: [{ assumptionId: 'a-1', text: 'An existing reason.', status: 'holds' }]
      }
    };

    const judgment = acceptProposalIntoJudgment(legacy, { id: 'e-1', body: 'A new reason.' }, 'why');
    expect(judgment.why.map(line => line.text)).toEqual(['An existing reason.', 'A new reason.']);
  });

  it('reduces an agent answer to one sentence', () => {
    const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Supply is catching up. A second point follows.' }] }] };

    expect(docText(doc)).toBe('Supply is catching up. A second point follows.');
    expect(oneSentence(docText(doc))).toBe('Supply is catching up.');
  });

  it('lists only pages that carry a judgment', () => {
    const index = buildJudgmentIndex([page(), { _id: 'plain', title: 'A plain wiki page' }], NOW);

    expect(index.map(item => item.id)).toEqual(['wiki-nvidia']);
  });
});
