import {
  alreadyUsedHere,
  questionBlockFromPassage,
  recordedUsesFromQuestionBlocks,
  recordedUsesFromSources,
  sameRecordedPassage
} from './libraryPassageUse';

const nomad = {
  articleId: 'article-1',
  highlightId: 'highlight-1',
  passage: 'A wrong turn can still leave another attempt.'
};

describe('libraryPassageUse', () => {
  it('treats the same highlight identity as a recorded use', () => {
    expect(sameRecordedPassage(nomad, {
      articleId: 'article-1',
      highlightId: 'highlight-1',
      passage: 'Different annotation of the same mark.'
    })).toBe(true);
  });

  it('does not treat similar wording as a recorded use', () => {
    expect(alreadyUsedHere({
      articleId: 'article-2',
      highlightId: 'highlight-2',
      passage: 'A wrong turn can still leave another attempt, perhaps.'
    }, [nomad])).toBe(false);
  });

  it('reads currently recorded question blocks and source snapshots', () => {
    expect(recordedUsesFromSources([nomad, null])).toEqual([nomad]);
    expect(recordedUsesFromQuestionBlocks([
      { type: 'paragraph', text: 'My words.' },
      { type: 'highlight-ref', highlightId: 'highlight-1', articleId: 'article-1', text: nomad.passage }
    ])).toEqual([
      { articleId: 'article-1', highlightId: 'highlight-1', passage: nomad.passage }
    ]);
  });

  it('places an exact authorized passage as a question source block', () => {
    expect(questionBlockFromPassage({
      ...nomad,
      title: 'Nomad',
      href: '/library?articleId=article-1&highlightId=highlight-1'
    }, () => 'block-1')).toEqual({
      id: 'block-1',
      type: 'highlight-ref',
      text: nomad.passage,
      highlightId: 'highlight-1',
      articleId: 'article-1',
      articleTitle: 'Nomad',
      sourcePath: '/library?articleId=article-1&highlightId=highlight-1'
    });
  });
});
