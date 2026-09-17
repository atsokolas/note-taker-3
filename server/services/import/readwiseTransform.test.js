const {
  buildReadwisePreviewSummary
} = require('./readwiseTransform');

describe('Readwise preview projection', () => {
  it('returns a bounded real passage and annotation without claiming full enumeration', () => {
    const preview = buildReadwisePreviewSummary({
      hasMore: true,
      results: [{
        user_book_id: 'book-1',
        title: 'Returning to a thought',
        author: 'A Reader',
        highlights: [{
          id: 'highlight-1',
          text: 'The moment of return matters more than the moment of capture.',
          note: 'Put the reader back where the question began.'
        }]
      }]
    });

    expect(preview.samplePassages).toEqual([{
      sourceTitle: 'Returning to a thought',
      author: 'A Reader',
      externalId: 'highlight-1',
      passage: 'The moment of return matters more than the moment of capture.',
      annotation: 'Put the reader back where the question began.'
    }]);
    expect(preview.warningCodes).toContain('preview_sampled');
    expect(preview.warnings.join(' ')).toMatch(/first page/i);
  });
});
