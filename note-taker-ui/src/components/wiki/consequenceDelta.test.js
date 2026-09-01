import { describeConsequenceDelta, describeAffectedRest } from './consequenceDelta';

const ref = (title, id) => ({ id, title, href: `/wiki/${id}` });

describe('describeConsequenceDelta', () => {
  it('names what a change affects instead of counting it', () => {
    const delta = describeConsequenceDelta({
      whyItMatters: 'The 10-K restated membership revenue.',
      subjects: [ref('Costco membership economics', 'c1'), ref('Renewal rate floor', 'c2')],
      nextAction: { label: 'Review the proposed change', href: '/wiki/c1' }
    });
    expect(delta.changed).toBe('The 10-K restated membership revenue.');
    expect(delta.affects.map(item => item.title))
      .toEqual(['Costco membership economics', 'Renewal rate floor']);
    expect(delta.affectedKind).toBe('claim');
    expect(delta.asks).toBe('Review the proposed change');
    expect(delta.askHref).toBe('/wiki/c1');
  });

  it('prefers the claims you believe over the objects you own', () => {
    const delta = describeConsequenceDelta({
      whyItMatters: 'x',
      subjects: [ref('A held claim', 'c1')],
      affected: [ref('Some page', 'p1')]
    });
    expect(delta.affectedKind).toBe('claim');
    expect(delta.affects.map(item => item.title)).toEqual(['A held claim']);
  });

  it('falls back to affected objects when no claim is named', () => {
    const delta = describeConsequenceDelta({ whyItMatters: 'x', affected: [ref('Some page', 'p1')] });
    expect(delta.affectedKind).toBe('object');
    expect(delta.affects.map(item => item.title)).toEqual(['Some page']);
  });

  it('holds the lead to two and counts the rest', () => {
    const delta = describeConsequenceDelta({
      whyItMatters: 'x',
      subjects: [ref('one', 'a'), ref('two', 'b'), ref('three', 'c'), ref('four', 'd')]
    });
    expect(delta.affects).toHaveLength(2);
    expect(delta.affectedRest).toBe(2);
    expect(describeAffectedRest(delta.affectedRest)).toBe('and 2 more');
  });

  it('says nothing about what it affects when nothing is affected', () => {
    const delta = describeConsequenceDelta({ whyItMatters: 'x' });
    expect(delta.affects).toEqual([]);
    expect(delta.affectedRest).toBe(0);
    expect(describeAffectedRest(0)).toBe('');
  });

  it('does not manufacture a demand when the update needs nothing', () => {
    const delta = describeConsequenceDelta({ whyItMatters: 'x', subjects: [ref('a', 'a')] });
    expect(delta.asks).toBe('');
    expect(delta.askHref).toBe('');
  });

  it('drops a reference that cannot be opened', () => {
    const delta = describeConsequenceDelta({
      whyItMatters: 'x',
      subjects: [{ title: 'No door', href: '' }, ref('Real', 'r')]
    });
    expect(delta.affects.map(item => item.title)).toEqual(['Real']);
  });
});
