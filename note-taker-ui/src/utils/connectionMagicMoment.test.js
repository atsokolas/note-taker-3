import {
  composeReadwiseConnectMoment,
  countActiveConcepts,
  buildSharePreviewReceipt
} from './connectionMagicMoment';

describe('connectionMagicMoment', () => {
  it('composes a stats-backed Readwise connect moment', () => {
    expect(composeReadwiseConnectMoment({
      highlightCount: 27,
      activeConceptCount: 4
    })).toBe('Readwise connected. I found 27 highlights that can strengthen 4 active concepts.');
  });

  it('falls back honestly when stats are unavailable', () => {
    expect(composeReadwiseConnectMoment({})).toMatch(/Readwise connected\./);
  });

  it('counts active concepts with evidence or framing', () => {
    expect(countActiveConcepts([
      { name: 'Quiet', count: 0 },
      { name: 'Active', count: 2 },
      { name: 'Pinned', pinnedHighlightIds: ['h1'] },
      { name: 'Framed', description: 'Has framing' }
    ])).toBe(3);
  });

  it('builds the public share receipt copy', () => {
    expect(buildSharePreviewReceipt()).toBe(
      'Public page ready: citations included, private source notes withheld.'
    );
  });
});
