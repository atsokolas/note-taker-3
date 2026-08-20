import { addDependency, dependencyLines, removeDependency, restingOn } from './judgmentModel';

const page = (id, claim, dependsOn = []) => ({
  _id: id,
  judgment: { currentJudgment: claim, dependsOn }
});

const compute = page('p-compute', 'Compute stays scarce.');
const coreweave = page('p-cw', 'CoreWeave is undervalued.', [
  { dependencyId: 'd1', pageId: 'p-compute', note: 'If compute stops being scarce this stops being cheap.' }
]);

describe('dependencyLines', () => {
  it('reads the claim it rests on, not the page id', () => {
    const lines = dependencyLines(coreweave.judgment, new Map([['p-compute', compute]]));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      pageId: 'p-compute',
      claim: 'Compute stays scarce.',
      note: 'If compute stops being scarce this stops being cheap.'
    });
  });

  it('still names the edge when the other page is not loaded', () => {
    const lines = dependencyLines(coreweave.judgment, new Map());
    expect(lines[0].pageId).toBe('p-compute');
    expect(lines[0].claim).toBe('');
  });
});

describe('restingOn', () => {
  it('finds what would be shaken if this claim moved', () => {
    const resting = restingOn('p-compute', [compute, coreweave]);
    expect(resting).toHaveLength(1);
    expect(resting[0]).toMatchObject({ id: 'p-cw', claim: 'CoreWeave is undervalued.' });
    expect(resting[0].note).toContain('stops being cheap');
  });

  it('is empty for a claim nothing rests on', () => {
    expect(restingOn('p-cw', [compute, coreweave])).toEqual([]);
    expect(restingOn('', [compute])).toEqual([]);
  });
});

describe('addDependency', () => {
  it('records the edge and the reason for it', () => {
    const judgment = addDependency(page('a', 'A claim.'), 'b', 'Because of the other one.');
    expect(judgment.dependsOn).toHaveLength(1);
    expect(judgment.dependsOn[0]).toMatchObject({ pageId: 'b', note: 'Because of the other one.', proposedBy: 'user' });
  });

  it('refuses to let a claim rest on itself, or on the same claim twice', () => {
    expect(addDependency(page('a', 'A claim.'), 'a').dependsOn).toEqual([]);
    const once = page('a', 'A claim.', [{ dependencyId: 'd', pageId: 'b' }]);
    expect(addDependency(once, 'b').dependsOn).toHaveLength(1);
  });
});

describe('removeDependency', () => {
  it('takes an edge back out', () => {
    expect(removeDependency(coreweave, 'd1').dependsOn).toEqual([]);
    expect(removeDependency(coreweave, 'nope').dependsOn).toHaveLength(1);
  });
});
