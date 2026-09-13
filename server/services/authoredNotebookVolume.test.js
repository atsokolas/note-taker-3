const {
  VOLUME_MIN_PIECES,
  canPublishVolume,
  collectSources,
  composeVolumeSnapshot,
  hashPublicVolume,
  indexOfIdeas,
  pieceFromShare,
  selectPieces,
  uniqueIds,
  volumeShareState
} = require('./authoredNotebookVolume');
const quote = {
  id: 'q1',
  type: 'quote',
  text: 'Two hours a week cannot sustain this.',
  source: {
    title: 'A letter on time',
    href: 'https://example.com/letter',
    access: 'open'
  }
};

const essayShare = (over = {}) => ({
  notebookId: 'note-1',
  snapshot: {
    title: 'Who gets to experiment, and who pays?',
    ownerDisplayName: 'Athan',
    publishedAt: '2026-09-12T12:00:00.000Z',
    blocks: [
      { id: 'h1', type: 'heading', level: 2, text: 'The exception first' },
      quote,
      { id: 'p1', type: 'paragraph', text: 'The exception arrives first.' }
    ]
  },
  ...over
});

const secondShare = () => ({
  notebookId: 'note-2',
  snapshot: {
    title: 'Whose downside?',
    ownerDisplayName: 'Athan',
    publishedAt: '2026-09-13T12:00:00.000Z',
    blocks: [{
      id: 'p1',
      type: 'paragraph',
      text: 'The cost lands on someone who did not choose the experiment.'
    }, {
      id: 'q2',
      type: 'quote',
      text: 'A different door.',
      source: {
        title: 'A letter on time',
        href: 'https://example.com/letter',
        access: 'open'
      }
    }]
  }
});

describe('authoredNotebookVolume', () => {
  it('keeps only published snapshots, in the owner’s order', () => {
    const first = pieceFromShare(essayShare());
    const second = pieceFromShare(secondShare());
    const selected = selectPieces([second, first], ['note-1', 'note-1', 'missing', 'note-2']);
    expect(selected.map((piece) => piece.notebookId)).toEqual(['note-1', 'note-2']);
    expect(uniqueIds(['note-1', { id: 'note-1' }, 'note-2'])).toEqual(['note-1', 'note-2']);
    expect(pieceFromShare({ snapshot: { title: 'Empty', blocks: [] } })).toBeNull();
  });

  it('freezes a through-line, reading order, ideas, and public sources', () => {
    const pieces = [pieceFromShare(essayShare()), pieceFromShare(secondShare())];
    const snapshot = composeVolumeSnapshot({
      title: '  <em>Who pays?</em>  ',
      introduction: '<p>Two finished notes, one question.</p>',
      ownerDisplayName: 'Athan',
      pieces,
      publishedAt: '2026-09-13T18:00:00.000Z'
    });
    expect(snapshot.title).toBe('Who pays?');
    expect(snapshot.introduction).toBe('Two finished notes, one question.');
    expect(snapshot.pieces).toHaveLength(VOLUME_MIN_PIECES);
    expect(snapshot.pieces[0].title).toBe('Who gets to experiment, and who pays?');
    expect(JSON.stringify(snapshot)).not.toMatch(/note-1|highlightId|\/library\?/);
    expect(indexOfIdeas(pieces)).toEqual([
      { title: 'Who gets to experiment, and who pays?', ideas: ['The exception first'] },
      { title: 'Whose downside?', ideas: [] }
    ]);
    expect(collectSources(pieces)).toEqual([
      { title: 'A letter on time', href: 'https://example.com/letter' }
    ]);
    expect(canPublishVolume(snapshot)).toBe(true);
    expect(canPublishVolume({ ...snapshot, introduction: '' })).toBe(false);
    expect(canPublishVolume({ ...snapshot, pieces: snapshot.pieces.slice(0, 1) })).toBe(false);
  });

  it('does not rewrite a frozen volume when a later workshop hash changes', () => {
    const pieces = [pieceFromShare(essayShare()), pieceFromShare(secondShare())];
    const snapshot = composeVolumeSnapshot({
      title: 'Who pays?',
      introduction: 'Two finished notes, one question.',
      ownerDisplayName: 'Athan',
      pieces,
      publishedAt: '2026-09-13T18:00:00.000Z'
    });
    const volume = {
      slug: 'volume-slug',
      snapshot,
      contentHash: hashPublicVolume(snapshot),
      publishedAt: snapshot.publishedAt,
      ownerDisplayName: 'Athan'
    };
    const laterCatalog = [
      pieceFromShare(essayShare({
        snapshot: {
          ...essayShare().snapshot,
          blocks: [...essayShare().snapshot.blocks, {
            id: 'p2',
            type: 'paragraph',
            text: 'Rewritten in the workshop.'
          }]
        }
      })),
      pieceFromShare(secondShare())
    ];
    const state = volumeShareState(volume, {
      catalog: laterCatalog,
      selection: ['note-1', 'note-2'],
      title: 'Who pays?',
      introduction: 'Two finished notes, one question.',
      ownerDisplayName: 'Athan'
    });
    expect(state.shared).toBe(true);
    expect(state.stale).toBe(true);
    expect(state.snapshot.pieces[0].blocks.some((block) => block.text === 'Rewritten in the workshop.')).toBe(false);
    expect(state.preview.pieces[0].blocks.some((block) => block.text === 'Rewritten in the workshop.')).toBe(true);
  });
});
