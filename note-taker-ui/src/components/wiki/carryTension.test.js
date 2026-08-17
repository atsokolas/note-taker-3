import { carryTensionToJudgment, isTension, tensionSeed } from './carryTension';

const supporting = { title: 'Everyone Has a Process', snippet: 'Process still loses half the bets.', evidenceRole: 'supports' };
const contradicting = { title: 'The Folly of Certainty', snippet: 'Conviction must coexist with uncertainty. And it rarely does.', evidenceRole: 'contradicts' };
const claim = { claimId: 'c1', text: 'A written process improves judgment. It is not enough on its own.' };

describe('a tension', () => {
  it('is a claim the library argues with, not a claim with sources', () => {
    expect(isTension([supporting])).toBe(false);
    expect(isTension([supporting, contradicting])).toBe(true);
  });

  it('carries both sides across in the words the sources used', () => {
    const seed = tensionSeed({ claim, sources: [supporting, contradicting] });
    expect(seed.sentence).toBe('A written process improves judgment.');
    expect(seed.why).toEqual([{ text: 'Process still loses half the bets.', sourceLabel: 'Everyone Has a Process' }]);
    expect(seed.against).toEqual([{ text: 'Conviction must coexist with uncertainty.', sourceLabel: 'The Folly of Certainty' }]);
  });

  it('is not offered when nothing disagrees', () => {
    expect(tensionSeed({ claim, sources: [supporting] })).toBeNull();
  });

  it('falls back to the article when the claim carries no text of its own', () => {
    const seed = tensionSeed({ claim: null, sources: [supporting, contradicting], fallbackSentence: 'Circle of competence.' });
    expect(seed.sentence).toBe('Circle of competence.');
  });

  it('becomes a judgment page holding the claim and both sides', async () => {
    const createPage = jest.fn().mockResolvedValue({ _id: 'new1' });
    const updatePage = jest.fn().mockResolvedValue({});
    const seed = tensionSeed({ claim, sources: [supporting, contradicting] });

    const id = await carryTensionToJudgment(seed, { createPage, updatePage });

    expect(id).toBe('new1');
    expect(createPage).toHaveBeenCalledWith({ title: 'A written process improves judgment.', pageType: 'topic' });
    expect(updatePage).toHaveBeenCalledWith('new1', {
      judgment: {
        currentJudgment: 'A written process improves judgment.',
        why: seed.why,
        against: seed.against
      }
    });
  });
});
