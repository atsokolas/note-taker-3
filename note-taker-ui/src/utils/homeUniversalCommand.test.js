import { classifyHomeUniversalCommand } from './homeUniversalCommand';

describe('classifyHomeUniversalCommand', () => {
  it('routes explicit wiki and source commands before heuristics', () => {
    expect(classifyHomeUniversalCommand('/wiki Buffett letters')).toEqual({
      kind: 'wiki-build',
      text: 'Buffett letters'
    });
    expect(classifyHomeUniversalCommand('/graph Buffett letters')).toEqual({
      kind: 'wiki-graph',
      text: 'Buffett letters'
    });
    expect(classifyHomeUniversalCommand('/ingest @highlight:h1')).toEqual({
      kind: 'wiki-ingest',
      text: '/ingest @highlight:h1',
      source: '@highlight:h1',
      command: '/ingest @highlight:h1'
    });
  });

  it('routes explicit Think postures', () => {
    expect(classifyHomeUniversalCommand('/question What changed?')).toEqual({
      kind: 'question',
      text: 'What changed?'
    });
    expect(classifyHomeUniversalCommand('/concept margin of safety')).toEqual({
      kind: 'concept',
      text: 'margin of safety'
    });
    expect(classifyHomeUniversalCommand('/note reading scratchpad')).toEqual({
      kind: 'note',
      text: 'reading scratchpad'
    });
  });

  it('preserves natural-language routing and URL ingest', () => {
    expect(classifyHomeUniversalCommand('https://example.com/source')).toEqual({
      kind: 'wiki-ingest',
      text: 'https://example.com/source',
      source: 'https://example.com/source',
      command: '/ingest https://example.com/source'
    });
    expect(classifyHomeUniversalCommand('Show backlinks for Buffett letters').kind).toBe('wiki-graph');
    expect(classifyHomeUniversalCommand('map related ideas about compounding').kind).toBe('wiki-graph');
    expect(classifyHomeUniversalCommand('What should I read next?').kind).toBe('library-search');
    expect(classifyHomeUniversalCommand('What is the argument?').kind).toBe('question');
    expect(classifyHomeUniversalCommand('new idea about compounding').kind).toBe('concept');
    expect(classifyHomeUniversalCommand('scratch this down').kind).toBe('note');
  });
});
