import {
  answersHeldSentence,
  holdInk,
  holdTerms,
  selectHoldCandidates
} from './judgmentHold';

const CLAIM = 'NVIDIA demand still outruns deliverable capacity.';

describe('holdTerms', () => {
  it('keeps the sentence, not a company-title leftover', () => {
    expect(holdTerms(CLAIM)).toEqual([
      'nvidia', 'demand', 'still', 'outruns', 'deliverable', 'capacity'
    ]);
    expect(holdTerms('Hire Maya as the first engineer.')).toEqual([
      'hire', 'maya', 'first', 'engineer'
    ]);
    expect(holdTerms('the and of')).toEqual([]);
  });
});

describe('answersHeldSentence', () => {
  it('lets a saved passage about that sentence through', () => {
    const hit = answersHeldSentence(
      'Deliverable capacity lags demand by two years.',
      CLAIM
    );
    expect(hit.ok).toBe(true);
    expect(hit.matched).toEqual(expect.arrayContaining(['demand', 'deliverable', 'capacity']));
  });

  it('does not treat a tagged filing as an answer because it names one leftover word', () => {
    expect(answersHeldSentence(
      'A 13F filing was posted. It does not touch the capacity gap.',
      CLAIM
    ).ok).toBe(false);
  });

  it('answers a short hire sentence from a real note about that hire', () => {
    expect(answersHeldSentence(
      'Maya is the engineer I would hire first.',
      'Hire Maya as the first engineer.'
    ).ok).toBe(true);
  });
});

describe('selectHoldCandidates', () => {
  const answering = {
    id: 'highlight:a1:h1',
    text: 'Deliverable capacity lags demand by two years.',
    matched: ['demand', 'deliverable', 'capacity']
  };
  const leftover = {
    id: 'highlight:a2:h2',
    text: 'A 13F filing was posted across the sector.',
    matched: ['capacity']
  };
  const titleDump = {
    id: 'article:nvidia-10k',
    text: 'NVIDIA reported another quarter of data-center growth.',
    matched: ['nvidia']
  };
  const stronger = {
    id: 'highlight:a3:h3',
    text: 'NVIDIA demand still outruns deliverable capacity this cycle.',
    matched: ['nvidia', 'demand', 'still', 'outruns', 'deliverable', 'capacity']
  };

  it('keeps the passage about the hold and drops generic library dumps', () => {
    const rows = selectHoldCandidates([leftover, answering, titleDump], CLAIM);
    expect(rows.map(row => row.id)).toEqual(['highlight:a1:h1']);
  });

  it('ranks by how much of the sentence the passage answers, not arrival order', () => {
    const rows = selectHoldCandidates([answering, stronger], CLAIM);
    expect(rows.map(row => row.id)).toEqual(['highlight:a3:h3', 'highlight:a1:h1']);
  });

  it('infers cover from the passage when the API omitted matched', () => {
    const rows = selectHoldCandidates([{ id: 'h', text: answering.text }], CLAIM);
    expect(rows).toHaveLength(1);
    expect(rows[0].matched).toEqual(expect.arrayContaining(['demand', 'capacity']));
  });

  it('is silent when there is no sentence to answer', () => {
    expect(selectHoldCandidates([answering], '')).toEqual([]);
  });
});

describe('holdInk', () => {
  it('writes the claim’s own words, in the order the sentence said them', () => {
    expect(holdInk(CLAIM, ['capacity', 'demand', 'deliverable']))
      .toBe('demand · deliverable · capacity');
  });

  it('writes nothing when the passage does not touch the hold', () => {
    expect(holdInk(CLAIM, [])).toBe('');
  });
});
