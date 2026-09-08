import {
  bindClaimBearing,
  bindClaimOther,
  bindClaimSource,
  claimsInParagraph,
  claimTextOnPage,
  liveExplorationForClaim,
  liveExplorationForPageClaim
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

const markedDoc = (text, attrs = { claimId: 'claim-compute' }) => ({
  type: 'doc',
  content: [{
    type: 'paragraph',
    content: [{
      type: 'text',
      text,
      marks: [{ type: 'claim', attrs }]
    }]
  }]
});

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

  it('does not bind a recorded question as the live passage', () => {
    const bound = bindClaimSource({
      claimMark: { claimId: 'claim-1', citationIndexes: [1, 2] },
      ledgerClaim: { claimId: 'claim-1', sourceRefIds: ['source-question', 'source-nomad'] },
      sourceRefs: [{
        _id: 'source-question',
        type: 'question',
        title: 'Which mistakes?',
        snippet: 'Which mistakes are recoverable?'
      }, nomad]
    });
    expect(bound.title).toBe('Nomad');
    expect(bound.passage).toBe('A wrong turn you can walk back from still teaches the map.');
    expect(JSON.stringify(bound)).not.toContain('recoverable');
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
    expect(bound.articleId).toBe('article-1');
    expect(bound.highlightId).toBe('highlight-1');
    expect(bound.here).toBe(false);
    expect(bound.stale).toBe(false);
  });

  it('prefers the exact citation quote over a source snippet', () => {
    const bound = bindClaimSource({
      claimMark: { claimId: 'claim-1', citationIndexes: [1] },
      citations: [{ sourceRefId: 'source-nomad', quote: 'The exact saved sentence.' }],
      sourceRefs: [nomad]
    });
    expect(bound.passage).toBe('The exact saved sentence.');
    expect(bound.stale).toBe(true);
  });

  it('keeps the cited quote when Nomad has moved on, and does not attach the newer line', () => {
    const bound = bindClaimSource({
      claimMark: { claimId: 'claim-1', citationIndexes: [1] },
      citations: [{
        sourceRefId: 'source-nomad',
        quote: 'A wrong turn you can walk back from still teaches the map.'
      }],
      sourceRefs: [{
        ...nomad,
        snippet: 'A later line in Nomad was not attached.'
      }]
    });
    expect(bound.passage).toBe('A wrong turn you can walk back from still teaches the map.');
    expect(bound.stale).toBe(true);
    expect(JSON.stringify(bound)).not.toContain('later line');
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

  it('lets the article line win over a stale ledger when Compute moved on', () => {
    const exploration = liveExplorationForPageClaim({
      body: {
        type: 'doc',
        content: [{
          type: 'paragraph',
          content: [{
            type: 'text',
            text: 'Compute will not stay scarce.',
            marks: [{ type: 'claim', attrs: { claimId: 'claim-compute', citationIndexes: [1] } }]
          }]
        }]
      },
      claims: [{
        claimId: 'claim-compute',
        text: 'Compute will remain scarce.',
        sourceRefIds: ['source-capacity']
      }],
      sourceRefs: [{
        _id: 'source-capacity',
        title: 'Capacity',
        snippet: 'Supply was the constraint this decade.'
      }]
    }, { claimId: 'claim-compute' });
    expect(exploration.originalText).toBe('Compute will not stay scarce.');
    expect(exploration.source.title).toBe('Capacity');
  });

  it('binds the cited source from the page mark when the caller only has a claim id', () => {
    const exploration = liveExplorationForPageClaim({
      body: {
        type: 'doc',
        content: [{
          type: 'paragraph',
          content: [{
            type: 'text',
            text: 'Memory compounds with review.',
            marks: [{ type: 'claim', attrs: { claimId: 'claim-1', citationIndexes: [1] } }]
          }]
        }]
      },
      claims: [{ claimId: 'claim-1', text: 'Memory compounds with review.', support: 'supported' }],
      sourceRefs: [{
        _id: 'source-1',
        type: 'highlight',
        objectId: 'highlight-1',
        parentObjectId: 'article-1',
        title: 'Memory article',
        snippet: 'Source snippet'
      }]
    }, { claimId: 'claim-1' });
    expect(exploration.source.passage).toBe('Source snippet');
    expect(exploration.source.title).toBe('Memory article');
  });

  it('does not restore a ledger line that is no longer on the page', () => {
    const exploration = liveExplorationForPageClaim({
      body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Elsewhere.' }] }] },
      claims: [{ claimId: 'claim-1', text: 'Memory compounds with review.' }],
      sourceRefs: [nomad]
    }, { claimId: 'claim-1' });
    expect(exploration.originalText).toBe('');
    expect(exploration.source).toBeNull();
  });

  it('reads Then from the newest unpruned revision before-body, not a similar neighbor', () => {
    const exploration = liveExplorationForPageClaim({
      body: {
        type: 'doc',
        content: [{
          type: 'paragraph',
          content: [{
            type: 'text',
            text: 'Software can do more with the same plant.',
            marks: [{ type: 'claim', attrs: { claimId: 'claim-compute', citationIndexes: [1] } }]
          }]
        }]
      },
      claims: [{
        claimId: 'claim-compute',
        text: 'Software can do more with the same plant.',
        sourceRefIds: ['source-capacity']
      }],
      sourceRefs: [{
        _id: 'source-capacity',
        title: 'Capacity',
        snippet: 'Supply was the constraint this decade.'
      }]
    }, { claimId: 'claim-compute' }, {
      revisions: [{
        snapshotPrunedAt: '2026-09-01T00:00:00.000Z',
        before: {
          body: {
            type: 'doc',
            content: [{
              type: 'paragraph',
              content: [{
                type: 'text',
                text: 'A neighboring line was not this claim.',
                marks: [{ type: 'claim', attrs: { claimId: 'claim-other' } }]
              }]
            }]
          },
          claims: [{ claimId: 'claim-other', text: 'A neighboring line was not this claim.' }]
        }
      }, {
        before: {
          body: {
            type: 'doc',
            content: [{
              type: 'paragraph',
              content: [{
                type: 'text',
                text: 'Compute will remain scarce.',
                marks: [{ type: 'claim', attrs: { claimId: 'claim-compute' } }]
              }]
            }]
          },
          claims: [{ claimId: 'claim-compute', text: 'Compute will remain scarce.' }]
        }
      }]
    });
    expect(exploration.originalText).toBe('Software can do more with the same plant.');
    expect(exploration.then).toEqual({ text: 'Compute will remain scarce.' });
    expect(JSON.stringify(exploration.then)).not.toContain('neighboring');
  });

  it('opens the recorded quotation from that revision and does not attach a neighbor', () => {
    const exploration = liveExplorationForPageClaim({
      body: {
        type: 'doc',
        content: [{
          type: 'paragraph',
          content: [{
            type: 'text',
            text: 'Software can do more with the same plant.',
            marks: [{ type: 'claim', attrs: { claimId: 'claim-compute', citationIndexes: [1] } }]
          }]
        }]
      },
      claims: [{
        claimId: 'claim-compute',
        text: 'Software can do more with the same plant.',
        sourceRefIds: ['source-capacity']
      }],
      sourceRefs: [{
        _id: 'source-capacity',
        title: 'Capacity',
        snippet: 'Supply was the constraint this decade.'
      }]
    }, { claimId: 'claim-compute' }, {
      revisions: [{
        before: {
          body: {
            type: 'doc',
            content: [{
              type: 'paragraph',
              content: [{
                type: 'text',
                text: 'Compute will remain scarce.',
                marks: [{ type: 'claim', attrs: { claimId: 'claim-compute', citationIndexes: [1] } }]
              }]
            }]
          },
          claims: [{
            claimId: 'claim-compute',
            text: 'Compute will remain scarce.',
            sourceRefIds: ['source-capacity']
          }],
          citations: [{
            sourceRefId: 'source-capacity',
            quote: 'The plant, not the algorithm, was the limit.'
          }],
          sourceRefs: [{
            _id: 'source-capacity',
            title: 'Capacity',
            snippet: 'Supply was the constraint this decade.',
            metadata: {
              aroundBefore: 'The bottleneck was not a clever algorithm.',
              aroundAfter: 'That does not prove the next decade will look the same.'
            }
          }]
        }
      }, {
        before: {
          body: {
            type: 'doc',
            content: [{
              type: 'paragraph',
              content: [{
                type: 'text',
                text: 'A neighboring line was not this claim.',
                marks: [{ type: 'claim', attrs: { claimId: 'claim-other', citationIndexes: [1] } }]
              }]
            }]
          },
          claims: [{ claimId: 'claim-other', sourceRefIds: ['source-other'] }],
          sourceRefs: [{
            _id: 'source-other',
            title: 'A nearby essay',
            snippet: 'Unrelated sentences should never be substituted.'
          }]
        }
      }]
    });
    expect(exploration.then).toEqual({
      text: 'Compute will remain scarce.',
      sources: [{
        title: 'Capacity',
        passage: 'The plant, not the algorithm, was the limit.',
        aroundBefore: 'The bottleneck was not a clever algorithm.',
        aroundAfter: 'That does not prove the next decade will look the same.'
      }]
    });
    expect(JSON.stringify(exploration.then)).not.toContain('Unrelated');
    expect(exploration.source.passage).toBe('Supply was the constraint this decade.');
  });

  it('stays silent about a quotation that is already the live passage', () => {
    const exploration = liveExplorationForPageClaim({
      body: {
        type: 'doc',
        content: [{
          type: 'paragraph',
          content: [{
            type: 'text',
            text: 'Software can do more with the same plant.',
            marks: [{ type: 'claim', attrs: { claimId: 'claim-compute', citationIndexes: [1] } }]
          }]
        }]
      },
      claims: [{
        claimId: 'claim-compute',
        text: 'Software can do more with the same plant.',
        sourceRefIds: ['source-capacity']
      }],
      sourceRefs: [{
        _id: 'source-capacity',
        title: 'Capacity',
        snippet: 'Supply was the constraint this decade.'
      }]
    }, { claimId: 'claim-compute' }, {
      revisions: [{
        before: {
          body: {
            type: 'doc',
            content: [{
              type: 'paragraph',
              content: [{
                type: 'text',
                text: 'Compute will remain scarce.',
                marks: [{ type: 'claim', attrs: { claimId: 'claim-compute', citationIndexes: [1] } }]
              }]
            }]
          },
          claims: [{
            claimId: 'claim-compute',
            text: 'Compute will remain scarce.',
            sourceRefIds: ['source-capacity']
          }],
          sourceRefs: [{
            _id: 'source-capacity',
            title: 'Capacity',
            snippet: 'Supply was the constraint this decade.'
          }]
        }
      }]
    });
    expect(exploration.then).toEqual({ text: 'Compute will remain scarce.' });
  });

  it('stays silent when the recorded earlier line is the same as now', () => {
    const exploration = liveExplorationForPageClaim({
      body: {
        type: 'doc',
        content: [{
          type: 'paragraph',
          content: [{
            type: 'text',
            text: 'Compute will remain scarce.',
            marks: [{ type: 'claim', attrs: { claimId: 'claim-compute' } }]
          }]
        }]
      },
      claims: [{ claimId: 'claim-compute', text: 'Compute will remain scarce.' }]
    }, { claimId: 'claim-compute' }, {
      revisions: [{
        before: {
          body: {
            type: 'doc',
            content: [{
              type: 'paragraph',
              content: [{
                type: 'text',
                text: 'Compute will remain scarce.',
                marks: [{ type: 'claim', attrs: { claimId: 'claim-compute' } }]
              }]
            }]
          }
        }
      }]
    });
    expect(exploration.then).toBeUndefined();
  });

  it('falls back to claim history when revisions do not record a prior line', () => {
    const exploration = liveExplorationForPageClaim({
      body: {
        type: 'doc',
        content: [{
          type: 'paragraph',
          content: [{
            type: 'text',
            text: 'Software can do more with the same plant.',
            marks: [{ type: 'claim', attrs: { claimId: 'claim-compute' } }]
          }]
        }]
      },
      claims: [{
        claimId: 'claim-compute',
        text: 'Software can do more with the same plant.',
        history: [
          { text: 'Compute will remain scarce.' },
          { text: 'Software can do more with the same plant.' }
        ]
      }]
    }, { claimId: 'claim-compute' }, {
      revisions: [{ snapshotPrunedAt: '2026-09-01T00:00:00.000Z', before: { body: {} } }]
    });
    expect(exploration.then).toEqual({ text: 'Compute will remain scarce.' });
  });

  it('opens a second recorded passage by identity, not a neighbor', () => {
    const letter = {
      _id: 'source-letter',
      type: 'highlight',
      objectId: 'highlight-letter',
      parentObjectId: 'article-letter',
      title: 'Letter to a young investor',
      snippet: 'A loss you can survive still teaches the book. The ones that end the partnership do not.'
    };
    const exploration = liveExplorationForClaim({
      claimMark: { claimId: 'claim-1', text: 'Children need room to make mistakes.', citationIndexes: [1, 2] },
      ledgerClaim: { claimId: 'claim-1', sourceRefIds: ['source-nomad', 'source-letter'] },
      sourceRefs: [nomad, letter, neighbor]
    });
    expect(exploration.source.title).toBe('Nomad');
    expect(exploration.other).toEqual(expect.objectContaining({
      title: 'Letter to a young investor',
      passage: 'A loss you can survive still teaches the book. The ones that end the partnership do not.'
    }));
    expect(JSON.stringify(exploration.other)).not.toContain('Unrelated');
  });

  it('opens a third recorded passage by identity, not a neighbor', () => {
    const letter = {
      _id: 'source-letter',
      type: 'highlight',
      objectId: 'highlight-letter',
      parentObjectId: 'article-letter',
      title: 'Letter to a young investor',
      snippet: 'A loss you can survive still teaches the book. The ones that end the partnership do not.'
    };
    const notes = {
      _id: 'source-notes',
      type: 'highlight',
      objectId: 'highlight-notes',
      parentObjectId: 'article-notes',
      title: 'Field notes',
      snippet: 'The map is only a map if a mistake still lets you walk back. A stranding is different.'
    };
    const bound = {
      claimMark: {
        claimId: 'claim-1',
        text: 'Children need room to make mistakes.',
        citationIndexes: [1, 2, 3]
      },
      ledgerClaim: {
        claimId: 'claim-1',
        sourceRefIds: ['source-nomad', 'source-letter', 'source-notes']
      },
      sourceRefs: [nomad, letter, notes, neighbor]
    };
    expect(bindClaimBearing(bound).title).toBe('Field notes');
    expect(bindClaimBearing(bound).passage).toContain('A stranding is different.');
    expect(JSON.stringify(bindClaimBearing(bound))).not.toContain('Unrelated');
    expect(liveExplorationForClaim(bound).bearing.title).toBe('Field notes');
  });

  it('stays silent when there is no third distinct passage', () => {
    const letter = {
      _id: 'source-letter',
      type: 'highlight',
      objectId: 'highlight-letter',
      title: 'Letter to a young investor',
      snippet: 'A loss you can survive still teaches the book.'
    };
    expect(bindClaimBearing({
      claimMark: { claimId: 'claim-1', citationIndexes: [1, 2] },
      ledgerClaim: { claimId: 'claim-1', sourceRefIds: ['source-nomad', 'source-letter'] },
      sourceRefs: [nomad, letter]
    })).toBeNull();
    expect(bindClaimBearing({
      claimMark: { claimId: 'claim-1', citationIndexes: [1, 2, 3] },
      ledgerClaim: { claimId: 'claim-1', sourceRefIds: ['source-nomad', 'source-letter', 'source-nomad-copy'] },
      sourceRefs: [nomad, letter, { ...nomad, _id: 'source-nomad-copy' }]
    })).toBeNull();
  });

  it('stays silent when the second attachment is the same source, a neighbor, or recorded work', () => {
    expect(bindClaimOther({
      claimMark: { claimId: 'claim-1', citationIndexes: [1, 2] },
      ledgerClaim: { claimId: 'claim-1', sourceRefIds: ['source-nomad', 'source-nomad-copy'] },
      sourceRefs: [nomad, { ...nomad, _id: 'source-nomad-copy' }]
    })).toBeNull();
    expect(bindClaimOther({
      claimMark: { claimId: 'claim-1', citationIndexes: [1] },
      ledgerClaim: { claimId: 'claim-1', sourceRefIds: ['source-nomad'] },
      sourceRefs: [nomad, neighbor]
    })).toBeNull();
    expect(bindClaimOther({
      claimMark: { claimId: 'claim-1', citationIndexes: [1, 2] },
      ledgerClaim: { claimId: 'claim-1', sourceRefIds: ['source-nomad', 'source-question'] },
      sourceRefs: [nomad, {
        _id: 'source-question',
        type: 'question',
        snippet: 'Which mistakes are recoverable?'
      }]
    })).toBeNull();
  });

  it('opens a recorded question and draft from that revision, not a neighbor or today\'s walk', () => {
    const exploration = liveExplorationForPageClaim({
      body: markedDoc('Software can do more with the same plant.', {
        claimId: 'claim-compute',
        citationIndexes: [1]
      }),
      claims: [{
        claimId: 'claim-compute',
        text: 'Software can do more with the same plant.',
        sourceRefIds: ['source-capacity']
      }],
      sourceRefs: [{
        _id: 'source-capacity',
        type: 'highlight',
        title: 'Capacity',
        snippet: 'Supply was the constraint this decade.'
      }]
    }, { claimId: 'claim-compute' }, {
      revisions: [{
        before: {
          body: markedDoc('Compute will remain scarce.', {
            claimId: 'claim-compute',
            citationIndexes: [1]
          }),
          claims: [{
            claimId: 'claim-compute',
            text: 'Compute will remain scarce.',
            sourceRefIds: ['source-capacity', 'source-question', 'source-draft']
          }],
          sourceRefs: [{
            _id: 'source-question',
            type: 'question',
            title: 'Demand',
            snippet: 'Is scarcity a plant problem, or a demand problem?'
          }, {
            _id: 'source-capacity',
            type: 'highlight',
            title: 'Capacity',
            snippet: 'The plant, not the algorithm, was the limit.'
          }, {
            _id: 'source-draft',
            type: 'notebook',
            title: 'Compute notes',
            snippet: 'The plant is still the constraint.'
          }, {
            _id: 'source-other',
            type: 'question',
            title: 'A neighboring question was not this claim.',
            snippet: 'Unrelated questions should never be substituted.'
          }]
        }
      }]
    });
    expect(exploration.then).toEqual({
      text: 'Compute will remain scarce.',
      sources: [{
        title: 'Capacity',
        passage: 'The plant, not the algorithm, was the limit.'
      }],
      question: 'Is scarcity a plant problem, or a demand problem?',
      draft: 'The plant is still the constraint.'
    });
    expect(exploration.source.passage).toBe('Supply was the constraint this decade.');
    expect(exploration.question).toBe('');
    expect(JSON.stringify(exploration.then)).not.toContain('Unrelated');
  });

  it('does not attach a neighboring type as Then work', () => {
    const exploration = liveExplorationForPageClaim({
      body: markedDoc('Software can do more with the same plant.', {
        claimId: 'claim-compute',
        citationIndexes: [1]
      }),
      claims: [{ claimId: 'claim-compute', text: 'Software can do more with the same plant.' }]
    }, { claimId: 'claim-compute' }, {
      revisions: [{
        before: {
          body: markedDoc('Compute will remain scarce.', {
            claimId: 'claim-compute',
            citationIndexes: [1]
          }),
          claims: [{
            claimId: 'claim-compute',
            text: 'Compute will remain scarce.',
            sourceRefIds: ['source-capacity']
          }],
          sourceRefs: [{
            _id: 'source-capacity',
            type: 'highlight',
            title: 'Capacity',
            snippet: 'The plant, not the algorithm, was the limit.'
          }, {
            _id: 'source-question',
            type: 'question',
            snippet: 'A neighboring question was not this claim.'
          }]
        }
      }]
    });
    expect(exploration.then.question).toBeUndefined();
    expect(exploration.then.draft).toBeUndefined();
    expect(JSON.stringify(exploration.then)).not.toContain('neighboring');
  });

  it('lets a user history note sit as Then draft, and refuses a system reason', () => {
    const page = (history) => ({
      body: markedDoc('Software can do more with the same plant.'),
      claims: [{
        claimId: 'claim-compute',
        text: 'Software can do more with the same plant.',
        history
      }]
    });
    const pruned = { revisions: [{ snapshotPrunedAt: '2026-09-01T00:00:00.000Z', before: { body: {} } }] };
    const withNote = liveExplorationForPageClaim(page([{
      text: 'Compute will remain scarce.',
      actorType: 'user',
      note: 'The plant is still the constraint.',
      reason: 'Owner accepted a proposed wording from an opened sentence.'
    }]), { claimId: 'claim-compute' }, pruned);
    expect(withNote.then).toEqual({
      text: 'Compute will remain scarce.',
      draft: 'The plant is still the constraint.'
    });
    expect(JSON.stringify(withNote.then)).not.toContain('proposed wording');

    const systemOnly = liveExplorationForPageClaim(page([{
      text: 'Compute will remain scarce.',
      actorType: 'system',
      reason: 'Owner accepted a proposed wording from an opened sentence.'
    }]), { claimId: 'claim-compute' }, pruned);
    expect(systemOnly.then).toEqual({ text: 'Compute will remain scarce.' });
    expect(JSON.stringify(systemOnly.then)).not.toContain('proposed wording');
  });

  it('opens a historical original when that door is not today\'s Library door', () => {
    const today = {
      _id: 'source-capacity',
      type: 'highlight',
      objectId: 'highlight-now',
      parentObjectId: 'article-capacity',
      title: 'Capacity',
      snippet: 'Supply was the constraint this decade.'
    };
    const exploration = liveExplorationForPageClaim({
      body: markedDoc('Software can do more with the same plant.', {
        claimId: 'claim-compute',
        citationIndexes: [1]
      }),
      claims: [{
        claimId: 'claim-compute',
        text: 'Software can do more with the same plant.',
        sourceRefIds: ['source-capacity']
      }],
      sourceRefs: [today]
    }, { claimId: 'claim-compute' }, {
      revisions: [{
        before: {
          body: markedDoc('Compute will remain scarce.', {
            claimId: 'claim-compute',
            citationIndexes: [1]
          }),
          claims: [{
            claimId: 'claim-compute',
            text: 'Compute will remain scarce.',
            sourceRefIds: ['source-capacity']
          }],
          sourceRefs: [{
            ...today,
            snippet: 'The plant, not the algorithm, was the limit.',
            url: 'https://old.example/capacity-then'
          }]
        }
      }]
    });
    expect(exploration.then.sources[0].href).toBe('https://old.example/capacity-then');
    expect(exploration.then.sources[0].isLibrary).toBeUndefined();
    expect(exploration.source.href).toBe('/library?articleId=article-capacity&highlightId=highlight-now');
  });

  it('does not open today\'s Library door as a historical version', () => {
    const today = {
      _id: 'source-capacity',
      type: 'highlight',
      objectId: 'highlight-now',
      parentObjectId: 'article-capacity',
      title: 'Capacity',
      snippet: 'Supply was the constraint this decade.'
    };
    const exploration = liveExplorationForPageClaim({
      body: markedDoc('Software can do more with the same plant.', {
        claimId: 'claim-compute',
        citationIndexes: [1]
      }),
      claims: [{
        claimId: 'claim-compute',
        text: 'Software can do more with the same plant.',
        sourceRefIds: ['source-capacity']
      }],
      sourceRefs: [today]
    }, { claimId: 'claim-compute' }, {
      revisions: [{
        before: {
          body: markedDoc('Compute will remain scarce.', {
            claimId: 'claim-compute',
            citationIndexes: [1]
          }),
          claims: [{
            claimId: 'claim-compute',
            text: 'Compute will remain scarce.',
            sourceRefIds: ['source-capacity']
          }],
          sourceRefs: [{
            ...today,
            snippet: 'The plant, not the algorithm, was the limit.'
          }]
        }
      }]
    });
    expect(exploration.then.sources[0].passage).toBe('The plant, not the algorithm, was the limit.');
    expect(exploration.then.sources[0].href).toBeUndefined();
    expect(JSON.stringify(exploration.then)).not.toContain('/library');
  });

  it('opens a second recorded source from that revision, not today\'s other or a neighbor', () => {
    const plant = {
      _id: 'source-plant',
      type: 'highlight',
      objectId: 'highlight-plant',
      title: 'Plant log',
      snippet: 'The floor did not move when the software did.'
    };
    const capacityThen = {
      _id: 'source-capacity',
      type: 'highlight',
      title: 'Capacity',
      snippet: 'The plant, not the algorithm, was the limit.'
    };
    const before = {
      body: markedDoc('Compute will remain scarce.', {
        claimId: 'claim-compute',
        citationIndexes: [1, 2]
      }),
      claims: [{
        claimId: 'claim-compute',
        text: 'Compute will remain scarce.',
        sourceRefIds: ['source-capacity', 'source-plant']
      }],
      sourceRefs: [capacityThen, plant, {
        _id: 'source-other',
        type: 'highlight',
        title: 'A neighboring log was not this claim.',
        snippet: 'Unrelated floors should never be substituted.'
      }]
    };
    const thenOnly = liveExplorationForPageClaim({
      body: markedDoc('Software can do more with the same plant.', {
        claimId: 'claim-compute',
        citationIndexes: [1]
      }),
      claims: [{
        claimId: 'claim-compute',
        text: 'Software can do more with the same plant.',
        sourceRefIds: ['source-capacity']
      }],
      sourceRefs: [{
        _id: 'source-capacity',
        type: 'highlight',
        title: 'Capacity',
        snippet: 'Supply was the constraint this decade.'
      }]
    }, { claimId: 'claim-compute' }, { revisions: [{ before }] });
    expect(thenOnly.then.sources).toEqual([
      { title: 'Capacity', passage: 'The plant, not the algorithm, was the limit.' },
      { title: 'Plant log', passage: 'The floor did not move when the software did.' }
    ]);
    expect(thenOnly.other).toBeNull();
    expect(JSON.stringify(thenOnly.then)).not.toContain('Unrelated');

    const alreadyBeside = liveExplorationForPageClaim({
      body: markedDoc('Software can do more with the same plant.', {
        claimId: 'claim-compute',
        citationIndexes: [1, 2]
      }),
      claims: [{
        claimId: 'claim-compute',
        text: 'Software can do more with the same plant.',
        sourceRefIds: ['source-capacity', 'source-plant']
      }],
      sourceRefs: [{
        _id: 'source-capacity',
        type: 'highlight',
        title: 'Capacity',
        snippet: 'Supply was the constraint this decade.'
      }, plant]
    }, { claimId: 'claim-compute' }, { revisions: [{ before }] });
    expect(alreadyBeside.other.passage).toBe(plant.snippet);
    expect(alreadyBeside.then.sources).toEqual([
      { title: 'Capacity', passage: 'The plant, not the algorithm, was the limit.' }
    ]);
  });
});
