import { heldHighlightIds, sourceWhereabouts } from './sourceWhereabouts';

const view = (id, title, why, extra = {}) => ({
  _id: id,
  title,
  judgment: { currentJudgment: `${title} holds.`, why },
  ...extra
});

describe('where the passages went', () => {
  it('is silent when nothing links this piece', () => {
    expect(sourceWhereabouts([view('v1', 'Rates', [{ acceptedFrom: 'highlight:other:h9' }])], {
      articleId: 'a1',
      highlights: [{ _id: 'h1' }]
    })).toEqual([]);
    expect(sourceWhereabouts([], { articleId: '', highlights: [] })).toEqual([]);
  });

  it('puts views first, counts passages once, and says the piece itself is cited', () => {
    const lines = sourceWhereabouts([
      { _id: 'p1', title: 'membership models', sourceRefs: [{ type: 'article', objectId: 'a1' }] },
      view('v1', 'Costco', [
        { acceptedFrom: 'highlight:a1:h1' },
        { acceptedFrom: 'highlight:a1:h1' }
      ])
    ], { articleId: 'a1', highlights: [{ _id: 'h1' }, { _id: 'temp-1' }] });
    expect(lines.map((line) => `${line.lead} ${line.title}.`)).toEqual([
      'One passage from this piece sits under your view on Costco.',
      'This piece is cited on your page about membership models.'
    ]);
    expect([...heldHighlightIds(lines)]).toEqual(['h1']);
  });

  it('says at most three things', () => {
    const pages = ['A', 'B', 'C', 'D'].map((name) => ({ _id: name, title: name, sourceRefs: [{ type: 'article', objectId: 'a1' }] }));
    expect(sourceWhereabouts(pages, { articleId: 'a1' })).toHaveLength(3);
  });
});
