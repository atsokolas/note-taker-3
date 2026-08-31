import { humanizeLabel } from './humanizeLabel';

describe('humanizeLabel', () => {
  it('stops turning acronyms into words', () => {
    expect(humanizeLabel('this-week-in-ai')).toBe('This Week in AI');
    expect(humanizeLabel('sec_filing')).toBe('SEC Filing');
    expect(humanizeLabel('llm_gpu_report')).toBe('LLM GPU Report');
  });

  it('keeps small joining words small, unless they open or close', () => {
    expect(humanizeLabel('margin of safety')).toBe('Margin of Safety');
    expect(humanizeLabel('the_long_game')).toBe('The Long Game');
    expect(humanizeLabel('what to')).toBe('What To');
  });

  it('leaves a word that already carries its own capitals', () => {
    expect(humanizeLabel('arXiv')).toBe('arXiv');
    expect(humanizeLabel('GitHub')).toBe('GitHub');
    expect(humanizeLabel('openAI')).toBe('openAI');
  });

  it('canonicalises names people spell a particular way', () => {
    expect(humanizeLabel('oauth')).toBe('OAuth');
    expect(humanizeLabel('saas metrics')).toBe('SaaS Metrics');
  });

  it('handles ordinary words and separators', () => {
    expect(humanizeLabel('readwise')).toBe('Readwise');
    expect(humanizeLabel('some__mixed--separators')).toBe('Some Mixed Separators');
    expect(humanizeLabel('agent.run.started')).toBe('Agent Run Started');
  });

  it('survives nothing', () => {
    expect(humanizeLabel('')).toBe('');
    expect(humanizeLabel(null)).toBe('');
    expect(humanizeLabel('   ')).toBe('');
  });
});
