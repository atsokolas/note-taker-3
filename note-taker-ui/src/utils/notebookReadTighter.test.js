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
});
