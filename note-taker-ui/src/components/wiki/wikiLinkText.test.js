import { cleanWikiLinkSnippetText } from './wikiLinkText';

describe('cleanWikiLinkSnippetText', () => {
  it('returns plain text unchanged when no wikilink markup is present', () => {
    expect(cleanWikiLinkSnippetText('…says compounding interest matters…')).toBe(
      '…says compounding interest matters…'
    );
  });

  it('strips simple double-bracket wikilinks from snippets', () => {
    expect(cleanWikiLinkSnippetText(
      '…groups opportunity cost with the [[Circle of Competence]] and [[Margin of Safety in Value Investing]] as a core lens…'
    )).toBe(
      '…groups opportunity cost with the Circle of Competence and Margin of Safety in Value Investing as a core lens…'
    );
    expect(cleanWikiLinkSnippetText('…groups opportunity cost with the Circle of Competence and Margin of Safety in Value Investing as a core lens…'))
      .not.toContain('[[');
  });

  it('removes citation markers embedded inside wikilink labels', () => {
    expect(cleanWikiLinkSnippetText(
      'Margin of safety depends on [[ [2,3]Circle of Competence [2,3]]] before underwriting.'
    )).toBe(
      'Margin of safety depends on Circle of Competence before underwriting.'
    );
  });

  it('strips orphaned bracket tokens when closing brackets are missing', () => {
    expect(cleanWikiLinkSnippetText('See [[Circle of Competence for details')).toBe(
      'See Circle of Competence for details'
    );
  });
});
