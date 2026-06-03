import {
  countWikiClaims,
  countWikiPageWords,
  countWikiSources,
  wikiPreviewForPage,
  wikiSourceStatusForPage
} from './wikiPageMetrics';

describe('wikiPageMetrics', () => {
  it('counts visible body words even when server-provided wordCount is zero', () => {
    const page = {
      wordCount: 0,
      body: {
        type: 'doc',
        content: [
          { type: 'heading', content: [{ type: 'text', text: 'Visible page' }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'This body is visible and should not be counted as empty.' }] }
        ]
      }
    };

    expect(countWikiPageWords(page)).toBeGreaterThan(0);
  });

  it('derives sources and claims from citations and marks, not only explicit counters', () => {
    const page = {
      sourceCount: 0,
      claimCount: 0,
      citations: [{ sourceRefId: 'source-a', claimId: 'claim-a' }],
      body: {
        type: 'doc',
        content: [{
          type: 'paragraph',
          content: [{
            type: 'text',
            text: 'Marked claim.',
            marks: [{ type: 'claim', attrs: { claimId: 'claim-b' } }]
          }]
        }]
      }
    };

    expect(countWikiSources(page)).toBe(1);
    expect(countWikiClaims(page)).toBe(2);
    expect(wikiSourceStatusForPage(page)).toBe('1 source · 2 claims');
  });

  it('frames source-less scaffold pages as drafts and clamps preview body text', () => {
    const page = {
      title: 'Sparse Topic',
      plainText: 'Sparse Topic still needs source-backed development before it becomes useful. '.repeat(8)
    };

    expect(wikiSourceStatusForPage(page)).toBe('Draft scaffold · needs sources');
    expect(wikiPreviewForPage(page, 90).length).toBeLessThanOrEqual(93);
    expect(wikiPreviewForPage(page, 90).startsWith('Sparse Topic')).toBe(false);
  });
});
