import {
  alreadyUsedHere,
  linkedHighlightIdsFromBlocks,
  mergeQuestionHighlightLinks,
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

  it('records highlight linkage from placed blocks only', () => {
    expect(linkedHighlightIdsFromBlocks([
      { type: 'paragraph', text: 'My words.' },
      { type: 'highlight-ref', highlightId: 'highlight-1' },
      { type: 'highlight-ref', highlightId: 'highlight-1' },
      { type: 'paragraph', articleId: 'article-2', text: 'An excerpt without a mark.' }
    ])).toEqual(['highlight-1']);
  });

  it('keeps question highlight links that are not represented by blocks', () => {
    expect(mergeQuestionHighlightLinks(
      { linkedHighlightId: 'highlight-origin' },
      [{ type: 'paragraph', text: 'My words.' }]
    )).toEqual(['highlight-origin']);
  });

  it('adds placed-block highlights without dropping existing question links', () => {
    expect(mergeQuestionHighlightLinks(
      { linkedHighlightId: 'highlight-origin', linkedHighlightIds: ['highlight-origin'] },
      [{ type: 'highlight-ref', highlightId: 'highlight-nomad' }]
    )).toEqual(['highlight-origin', 'highlight-nomad']);
  });

  it('drops an undone highlight only when no remaining block still holds it', () => {
    expect(mergeQuestionHighlightLinks(
      { linkedHighlightIds: ['highlight-origin', 'highlight-nomad'], linkedHighlightId: 'highlight-origin' },
      [{ type: 'paragraph', text: 'Edited after placing.' }],
      { removeHighlightIds: ['highlight-nomad'] }
    )).toEqual(['highlight-origin']);
    expect(mergeQuestionHighlightLinks(
      { linkedHighlightIds: ['highlight-nomad'], linkedHighlightId: 'highlight-nomad' },
      [{ type: 'highlight-ref', highlightId: 'highlight-nomad' }],
      { removeHighlightIds: ['highlight-nomad'] }
    )).toEqual(['highlight-nomad']);
  });
});
