import {
  acceptProposalIntoJudgment,
  buildJudgmentIndex,
  claimSentence,
  confidenceWord,
  createJudgment,
  foldJudgmentPages,
  heldDaysBetween,
  indexCardLine,
  isJudgmentPage,
  judgmentHeadline,
  judgmentIdOf,
  namedTitle,
  oneSentence,
  projectView,
  viewRecord
} from './judgmentModel';

const NOW = new Date('2026-10-11T09:30:00.000Z').getTime();

const page = () => ({
  _id: 'view-costco',
  title: 'Costco’s membership model makes it recession-resistant.',
  sourceRefs: [
    { _id: 'src-1', type: 'external', citationLabel: 'SemiAnalysis', url: 'https://example.com/a' }
  ],
  judgment: {
    currentJudgment: 'Costco’s membership model makes it recession-resistant.',
    startedAt: '2026-07-19T12:00:00.000Z',
    confidence: 0.75,
    why: [
      {
        reasonId: 'why-1',
        text: 'Renewals held above ninety percent through 2009.',
        sourceLabel: 'Costco FY09 10-K',
        acceptedFrom: 'highlight:article-1:highlight-1',
        createdAt: '2026-08-02T12:00:00.000Z'
      },
      { reasonId: 'why-2', text: 'Fees are most of operating income.', sourceRefIds: ['src-1'] }
    ],
    against: [
      {
        reasonId: 'against-1',
        text: 'Discretionary categories fall hard in a downturn.',
        sourceLabel: 'Ben Carlson',
        acceptedFrom: 'article:article-2',
        createdAt: '2026-10-01T12:00:00.000Z'
      }
    ],
    heldHistory: [{ text: 'Costco cannot lose members.', until: '2026-07-19T12:00:00.000Z' }],
    resolutionCriteria: 'Two quarters of falling renewals.',
    resolutionHorizonAt: '2027-06-30T12:00:00.000Z',
    resolutionHistory: [{ criteria: 'Two quarters of falling renewals.', horizonAt: '2027-06-30T12:00:00.000Z', setAt: '2026-08-10T12:00:00.000Z' }],
    decisions: [
      { decisionId: 'judgment-change-abc', summary: 'Changed what I hold: x', decidedAt: '2026-07-19T12:00:00.000Z' }
    ]
  }
});

describe('the view', () => {
  it('reads the claim as one sentence, the same everywhere', () => {
    expect(oneSentence('First sentence. Second one.')).toBe('First sentence.');
    expect(claimSentence(page())).toBe('Costco’s membership model makes it recession-resistant.');
    expect(namedTitle(page())).toBe('');
    expect(judgmentHeadline({ ...page(), title: 'Costco' })).toBe('Costco');
  });

  it('is a view only when it holds a sentence', () => {
    expect(isJudgmentPage(page())).toBe(true);
    expect(isJudgmentPage({ judgment: { kind: 'thesis', governingQuestion: 'Q?' } })).toBe(false);
    expect(isJudgmentPage({ title: 'A plain wiki page' })).toBe(false);
  });

  it('names the confidence you chose in your words', () => {
    expect(confidenceWord(0.75)).toBe('Fairly sure');
    expect(confidenceWord(0.95)).toBe('Sure');
    expect(confidenceWord(0.5)).toBe('I think so');
    expect(confidenceWord(null)).toBe('');
  });

  it('lays passages in two columns that open the source at the passage', () => {
    const view = projectView(page());
    expect(view.confidence).toBe('Fairly sure');
    expect(view.forPassages.map(p => p.text)).toEqual([
      'Renewals held above ninety percent through 2009.',
      'Fees are most of operating income.'
    ]);
    expect(view.forPassages[0]).toEqual(expect.objectContaining({
      source: 'Costco FY09 10-K',
      href: expect.stringContaining('highlight-1')
    }));
    expect(view.forPassages[1].source).toBe('SemiAnalysis');
    expect(view.againstPassages[0].href).toContain('article-2');
    expect(view.test).toEqual({ text: 'Two quarters of falling renewals.', by: '2027-06-30T12:00:00.000Z' });
  });

  it('reads older dossier pages through the same two columns', () => {
    const view = projectView({
      _id: 'old',
      judgment: {
        currentJudgment: 'Old shape.',
        assumptions: [{ assumptionId: 'a1', text: 'An assumption.' }, { text: 'Failed.', status: 'failed' }],
        strongestCounterargument: 'The best objection.'
      }
    });
    expect(view.forPassages.map(p => p.text)).toEqual(['An assumption.']);
    expect(view.againstPassages.map(p => p.text)).toEqual(['The best objection.']);
  });

  it('keeps a record in dated plain sentences, with the old wording struck', () => {
    const record = viewRecord(page());
    expect(record.map(line => line.text)).toEqual([
      'Held.',
      'Revised. Was:',
      'Filed a passage for, from Costco FY09 10-K.',
      'Said what would change my mind, by Jun 30.',
      'Filed a passage against, from Ben Carlson.'
    ]);
    expect(record[1].was).toBe('Costco cannot lose members.');
  });

  it('says on the index card only what is true', () => {
    expect(indexCardLine(page(), NOW)).toBe('Held 83 days · 2 for · 1 against · moved Oct 1');
    expect(indexCardLine({ judgment: { currentJudgment: 'New.', startedAt: new Date(NOW).toISOString() } }, NOW)).toBe('Held today');
  });
});

describe('the index', () => {
  it('lists only pages that hold a sentence, set-aside views apart', () => {
    const parked = { _id: 'parked', judgment: { currentJudgment: 'Parked view.', status: 'parked' } };
    const index = buildJudgmentIndex([page(), parked, { _id: 'plain', title: 'A plain wiki page' }], [], NOW);
    expect(index.map(item => [item.id, item.state])).toEqual([['view-costco', 'open'], ['parked', 'parked']]);
  });

  it('folds duplicate holds into the copy that has actually been argued', () => {
    const thin = { _id: 'thin', judgment: { currentJudgment: 'Compute keeps compounding.' } };
    const rich = {
      _id: 'rich',
      judgment: {
        currentJudgment: 'COMPUTE keeps compounding!',
        why: [{ reasonId: 'why-1', text: 'The scaling curve remains intact.' }]
      }
    };
    expect(foldJudgmentPages([thin, rich]).map(row => row.page._id)).toEqual(['rich']);
  });
});

describe('writes', () => {
  it('appends an accepted line without touching the lines already there', () => {
    const next = acceptProposalIntoJudgment(page(), { body: 'A new passage.', acceptedFrom: 'article:a9', sourceLabel: 'FT' }, 'against');
    expect(next.against.map(line => line.text)).toEqual([
      'Discretionary categories fall hard in a downturn.',
      'A new passage.'
    ]);
    expect(next.against[1]).toEqual(expect.objectContaining({ acceptedFrom: 'article:a9', sourceLabel: 'FT' }));
    expect(next.why).toHaveLength(2);
  });

  it('merges a duplicate hold into the existing one without a second copy', async () => {
    const createPage = jest.fn(async () => ({
      _id: 'existing',
      reusedExisting: true,
      judgment: { currentJudgment: 'Compute keeps compounding.', startedAt: '2026-08-09T12:00:00.000Z' }
    }));
    const updatePage = jest.fn();
    const held = await createJudgment('COMPUTE keeps compounding!', {
      createPage, updatePage, now: Date.parse('2026-08-30T12:00:00.000Z')
    });
    expect(held).toEqual({ id: 'existing', reused: true, heldDays: 21, sentence: 'COMPUTE keeps compounding!' });
    expect(updatePage).not.toHaveBeenCalled();
  });

  it('writes the claim when the page is new', async () => {
    const createPage = jest.fn(async () => ({ _id: 'wiki-new' }));
    const updatePage = jest.fn(async () => ({}));
    const held = await createJudgment('A new hold.', { createPage, updatePage, now: Date.parse('2026-08-30T12:00:00.000Z') });
    expect(held.reused).toBe(false);
    expect(updatePage).toHaveBeenCalledWith('wiki-new', {
      judgment: { currentJudgment: 'A new hold.', startedAt: '2026-08-30T12:00:00.000Z' }
    });
    expect(heldDaysBetween('2026-08-09T12:00:00.000Z', Date.parse('2026-08-30T12:00:00.000Z'))).toBe(21);
    expect(judgmentIdOf({ id: 'wiki-new' })).toBe('wiki-new');
  });
});
