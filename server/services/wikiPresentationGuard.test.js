const {
  buildRepoWikiTitle,
  normalizeExistingWikiTitleForPresentation,
  normalizeWikiTitleForPresentation,
  sentenceBoundaryTrim,
  __testables: {
    isRepoWikiTitle,
    titleHasCodeIdentifiers
  }
} = require('./wikiPresentationGuard');

describe('wikiPresentationGuard', () => {
  it('normalizes generated concept titles without a leading article', () => {
    expect(normalizeWikiTitleForPresentation('the availability heuristic')).toBe('Availability Heuristic');
    expect(normalizeWikiTitleForPresentation(' a margin of safety ')).toBe('Margin of Safety');
  });

  it('preserves acronyms while title-casing short generated titles', () => {
    expect(normalizeWikiTitleForPresentation('GPT-5 adoption in R&D teams', { stripLeadingArticle: false }))
      .toBe('GPT-5 Adoption in R&D Teams');
  });

  it('normalizes already-stored lowercase titles without stripping intentional title articles', () => {
    expect(normalizeExistingWikiTitleForPresentation('the Availability Heuristic'))
      .toBe('Availability Heuristic');
    expect(normalizeExistingWikiTitleForPresentation('The Wealth of Nations'))
      .toBe('The Wealth of Nations');
  });

  it('preserves repo wiki titles and code identifiers without title-casing', () => {
    expect(buildRepoWikiTitle('note-taker-3')).toBe('note-taker-3 — repo wiki');
    expect(normalizeWikiTitleForPresentation('note-taker-3 — repo wiki')).toBe('note-taker-3 — repo wiki');
    expect(normalizeWikiTitleForPresentation('atsokolas/note-taker-3 repo wiki'))
      .toBe('atsokolas/note-taker-3 repo wiki');
    expect(normalizeExistingWikiTitleForPresentation('note-taker-3 — repo wiki'))
      .toBe('note-taker-3 — repo wiki');
    expect(isRepoWikiTitle('note-taker-3 — repo wiki')).toBe(true);
    expect(titleHasCodeIdentifiers('atsokolas/note-taker-3')).toBe(true);
  });

  it('returns a complete sentence instead of a mid-sentence character clamp', () => {
    const value = 'The morning paper has a finished lead. The second sentence keeps running with extra material about sources, graph drift, and multiple page updates that would otherwise get cut awkwardly in the middle of the thought.';

    expect(sentenceBoundaryTrim(value, { maxLength: 96 })).toBe('The morning paper has a finished lead.');
  });

  it('repairs a sentence when no boundary exists under the limit', () => {
    const value = 'This lead has no punctuation and would otherwise stop in the middle of a visible phrase';

    expect(sentenceBoundaryTrim(value, { maxLength: 58 })).toMatch(/\.$/);
  });
});
