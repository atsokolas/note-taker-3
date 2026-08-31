const {
  proposeLink,
  rejectLink,
  acceptLink,
  serializeThread,
  CrossCaseLineageError
} = require('./crossCaseLineage');

const pages = {
  'page-a': { title: 'Compute stays scarce', judgment: { currentJudgment: 'Compute stays scarce through 2027.' } },
  'page-b': { title: 'Conversion holds', judgment: { currentJudgment: 'Conversion holds in 2027.' } }
};

describe('cross-case lineage', () => {
  it('joins cases only on an explicit shared object', () => {
    const link = proposeLink({
      fromPageId: 'page-a',
      toPageId: 'page-b',
      kind: 'assumption',
      object: { kind: 'assumption', id: 'a1', text: 'Lead times stay long.' },
      direction: 'rests_on'
    });
    expect(link.status).toBe('proposed');
    expect(link.object.text).toMatch(/Lead times/);
    const thread = serializeThread([acceptLink(link)], pages);
    expect(thread.silent).toBe(false);
    expect(thread.knots[0].line).toMatch(/rests on Lead times stay long/);
  });

  it('refuses generic similarity soup', () => {
    expect(() => proposeLink({
      fromPageId: 'page-a',
      toPageId: 'page-b',
      similarity: 0.91
    })).toThrow(CrossCaseLineageError);
    expect(() => proposeLink({
      fromPageId: 'page-a',
      toPageId: 'page-b',
      similarity: 0.91
    })).toThrow(/resemblance is not a lineage/i);
  });

  it('keeps a rejected link cut, and contradictions visible', () => {
    const proposed = proposeLink({
      fromPageId: 'page-a',
      toPageId: 'page-b',
      kind: 'assumption',
      object: { kind: 'assumption', text: 'Fabs arrive on time.' },
      contradiction: true
    });
    const cut = rejectLink(proposed, { actorId: 'user-host', now: '2026-08-31T12:00:00.000Z' });
    expect(cut.status).toBe('rejected');
    expect(cut.rejectedBy).toBe('user-host');
    const thread = serializeThread([cut, {
      ...proposed,
      status: 'accepted',
      contradiction: true,
      object: { kind: 'assumption', text: 'Lead times stay long.' }
    }], pages);
    expect(thread.cut).toHaveLength(1);
    expect(thread.contradictions[0].line).toMatch(/part on Lead times/);
    expect(JSON.stringify(thread)).not.toMatch(/similarity|score|like/i);
  });
});
