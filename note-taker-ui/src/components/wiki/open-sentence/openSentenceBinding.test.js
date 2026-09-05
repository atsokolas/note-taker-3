import {
  bindClaimSource,
  claimsInParagraph,
  claimTextOnPage,
  liveExplorationForClaim
} from './openSentenceBinding';

const nomad = {
  _id: 'source-nomad',
  type: 'highlight',
  objectId: 'highlight-1',
  parentObjectId: 'article-1',
  title: 'Nomad',
  snippet: 'A wrong turn you can walk back from still teaches the map.',
  metadata: {
    aroundBefore: 'Getting lost was part of the work.',
    aroundAfter: 'That is a different kind of care.'
  }
};

const neighbor = {
  _id: 'source-other',
  type: 'article',
  objectId: 'article-2',
  title: 'A nearby essay',
  snippet: 'Unrelated sentences should never be substituted.'
};

describe('openSentenceBinding', () => {
  it('stays silent when the sentence has no attached source', () => {
    expect(bindClaimSource({
      claimMark: { claimId: 'claim-1', citationIndexes: [] },
      sourceRefs: [nomad]
    })).toBeNull();
  });

  it('does not repair a missing citation with a similar neighboring passage', () => {
    const bound = bindClaimSource({
      claimMark: { claimId: 'claim-1', citationIndexes: [3] },
      sourceRefs: [nomad, neighbor]
    });
    expect(bound.available).toBe(false);
    expect(bound.passage).toBe('');
    expect(JSON.stringify(bound)).not.toContain('Unrelated');
    expect(JSON.stringify(bound)).not.toContain('wrong turn');
  });

  it('binds the cited passage by identity, including its Library door', () => {
    const bound = bindClaimSource({
      claimMark: { claimId: 'claim-1', citationIndexes: [1] },
      ledgerClaim: { claimId: 'claim-1', sourceRefIds: ['source-nomad'] },
      sourceRefs: [nomad, neighbor]
    });
    expect(bound.available).toBe(true);
    expect(bound.title).toBe('Nomad');
    expect(bound.passage).toBe('A wrong turn you can walk back from still teaches the map.');
    expect(bound.aroundBefore).toBe('Getting lost was part of the work.');
    expect(bound.href).toBe('/library?articleId=article-1&highlightId=highlight-1');
    expect(bound.isLibrary).toBe(true);
  });

  it('prefers the exact citation quote over a source snippet', () => {
    const bound = bindClaimSource({
      claimMark: { claimId: 'claim-1', citationIndexes: [1] },
      citations: [{ sourceRefId: 'source-nomad', quote: 'The exact saved sentence.' }],
      sourceRefs: [nomad]
    });
    expect(bound.passage).toBe('The exact saved sentence.');
  });

  it('does not invent surrounding lines when none were saved', () => {
    const bound = bindClaimSource({
      claimMark: { claimId: 'claim-1', citationIndexes: [1] },
      sourceRefs: [{ ...nomad, metadata: {} }]
    });
    expect(bound.aroundBefore).toBe('');
    expect(bound.aroundAfter).toBe('');
  });

  it('reads claim marks from a paragraph without inventing a second identity', () => {
    const claims = claimsInParagraph({
      type: 'paragraph',
      content: [{
        type: 'text',
        text: 'Memory compounds with review.',
        marks: [{ type: 'claim', attrs: { claimId: 'claim-1', citationIndexes: [1] } }]
      }]
    });
    expect(claims).toEqual([expect.objectContaining({
      claimId: 'claim-1',
      text: 'Memory compounds with review.'
    })]);
    expect(claimTextOnPage({
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [{
          type: 'text',
          text: 'Memory compounds with review.',
          marks: [{ type: 'claim', attrs: { claimId: 'claim-1' } }]
        }]
      }]
    }, 'claim-1')).toBe('Memory compounds with review.');
  });

  it('keeps accepted claim text on the live exploration even when a source is missing', () => {
    const exploration = liveExplorationForClaim({
      claimMark: { claimId: 'claim-1', text: 'Memory compounds with review.', citationIndexes: [9] },
      sourceRefs: [nomad]
    });
    expect(exploration.originalText).toBe('Memory compounds with review.');
    expect(exploration.source.available).toBe(false);
  });
});
