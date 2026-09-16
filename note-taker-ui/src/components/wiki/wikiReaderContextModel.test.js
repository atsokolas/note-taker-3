import {
  candidateFootprint,
  compareWikiPages,
  historicalRevisionSnapshot,
  popReaderPanel,
  pushReaderPanel,
  sourceSurrounding,
  surroundingFromSource
} from './wikiReaderContextModel';

describe('wikiReaderContextModel', () => {
  it('nests inspect panels and returns to the previous view', () => {
    const stacked = pushReaderPanel([], { type: 'evidence', block: 's2' });
    const nested = pushReaderPanel(stacked, { type: 'source', source: 'choices' });
    expect(popReaderPanel(nested)).toEqual({
      panel: { type: 'evidence', block: 's2' },
      trail: [{ type: 'evidence', block: 's2' }]
    });
    expect(popReaderPanel([{ type: 'source' }])).toEqual({ panel: null, trail: [] });
  });

  it('keeps surrounding source text optional and does not invent it', () => {
    expect(sourceSurrounding({ excerpt: 'The cited sentence.' })).toEqual({
      excerpt: 'The cited sentence.',
      aroundBefore: '',
      aroundAfter: '',
      canExpand: false
    });
    expect(sourceSurrounding({
      excerpt: 'The cited sentence.',
      aroundBefore: 'A prior sentence.',
      aroundAfter: 'A following sentence.'
    }).canExpand).toBe(true);
    expect(surroundingFromSource({
      snippet: 'The cited sentence.',
      aroundBefore: 'A prior sentence.'
    })).toMatchObject({ excerpt: 'The cited sentence.', canExpand: true });
  });

  it('describes the whole candidate against the current page without mixing the two', () => {
    const current = {
      claims: [{ claimId: 's2', text: 'Close alternatives.', citationIds: ['a'] }],
      sourceRefs: [{ _id: 'a', title: 'Choices' }],
      body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Close alternatives.' }] }] }
    };
    const candidate = {
      claims: [{ claimId: 's2', text: 'Bound the experiment.', citationIds: ['a', 'b'] }],
      sourceRefs: [{ _id: 'a', title: 'Choices' }, { _id: 'b', title: 'Experiments' }],
      body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Bound the experiment.' }] }] }
    };
    const footprint = candidateFootprint({ current, candidate });
    expect(footprint.changedCount).toBe(1);
    expect(footprint.addedSourceCount).toBe(1);
    expect(footprint.changes[0].kind).toBe('Reworded passage');
    expect(compareWikiPages(current, current)).toEqual([]);
  });

  it('reads a retained historical snapshot and refuses to invent one', () => {
    expect(historicalRevisionSnapshot(null)).toBeNull();
    expect(historicalRevisionSnapshot({ reason: 'edit' })).toBeNull();
    expect(historicalRevisionSnapshot({
      after: { title: 'Earlier page', plainText: 'The earlier words.' },
      createdAt: '2026-09-03T00:00:00.000Z',
      _id: 'rev-2'
    }).plainText).toBe('The earlier words.');
  });
});
