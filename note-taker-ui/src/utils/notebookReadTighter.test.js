import {
  readTighterCuts,
  readTighterSupport,
  renderReadTighterOriginal,
  rescueReadTighterPhrase
} from './notebookReadTighter';

describe('readTighterSupport', () => {
  it('allows a plain paragraph', () => {
    expect(readTighterSupport({ nodes: [{ type: 'paragraph', content: [{ type: 'text', text: 'Plain words.' }] }] }).supported).toBe(true);
  });
  it('refuses linked inline content', () => {
    const result = readTighterSupport({
      nodes: [{
        type: 'paragraph',
        content: [{ type: 'text', text: 'See ', marks: [] }, { type: 'text', text: 'link', marks: [{ type: 'link' }] }]
      }]
    });
    expect(result.supported).toBe(false);
  });
  it('refuses non-paragraph pieces', () => {
    expect(readTighterSupport({ nodes: [{ type: 'bulletList' }] }).supported).toBe(false);
  });
});

describe('readTighterCuts and rescue', () => {
  const original = 'This is really quite a long sentence that could read tighter.';
  const tighter = 'This is a long sentence that could read tighter.';

  it('finds removed phrases between original and proposal', () => {
    expect(readTighterCuts(original, tighter).map((item) => item.text.trim())).toEqual(['really quite']);
  });

  it('rescues one cut back into the preview without touching the draft', () => {
    const rescued = rescueReadTighterPhrase(original, tighter, 'really quite');
    expect(rescued).toContain('really quite');
    expect(readTighterCuts(original, rescued)).toHaveLength(0);
  });

  it('renders quiet cut spans for the rail', () => {
    const parts = renderReadTighterOriginal(original, tighter);
    expect(parts.some((part) => part.kind === 'cut' && part.phrase === 'really quite')).toBe(true);
  });

  it('returns no cuts when the proposal matches the original', () => {
    expect(readTighterCuts(original, original)).toEqual([]);
  });

  it('puts a later cut back where the shared words say, not where the old word count landed', () => {
    const source = 'A really B quite C D';
    const proposal = 'A B C D';
    expect(rescueReadTighterPhrase(source, proposal, 'quite')).toBe('A B quite C D');
    expect(rescueReadTighterPhrase(source, proposal, 'really')).toBe('A really B C D');
  });

  it('rescues several cuts in either order, including repeated phrases and inserted words', () => {
    const source = 'A really B quite C D';
    const proposal = 'A B C D';
    const quiteFirst = rescueReadTighterPhrase(source, rescueReadTighterPhrase(source, proposal, 'quite'), 'really');
    const reallyFirst = rescueReadTighterPhrase(source, rescueReadTighterPhrase(source, proposal, 'really'), 'quite');
    expect(quiteFirst).toBe('A really B quite C D');
    expect(reallyFirst).toBe('A really B quite C D');

    const repeated = 'see the light and see the light';
    const trimmed = 'see light and see light';
    const cuts = readTighterCuts(repeated, trimmed);
    expect(cuts.map((cut) => cut.phrase)).toEqual(['the', 'the']);
    expect(cuts[0].id).not.toBe(cuts[1].id);
    expect(rescueReadTighterPhrase(repeated, trimmed, cuts[1])).toBe('see light and see the light');
    expect(rescueReadTighterPhrase(repeated, rescueReadTighterPhrase(repeated, trimmed, cuts[0]), cuts[1])).toBe(repeated);

    const inserted = rescueReadTighterPhrase('A really B C', 'A extra B C', 'really');
    expect(inserted).toBe('A really extra B C');
  });
});
