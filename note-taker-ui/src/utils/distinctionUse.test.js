import {
  DISTINCTION_SOURCE_TYPE,
  distinctionExternalId,
  distinctionHref,
  distinctionRecord,
  distinctionVersionId,
  editorNodesFromDistinctionUse,
  eligibleDistinctions,
  exceptionsFromUses,
  findRetainedDistinction,
  heldInstrumentForOwner,
  heldInstrumentFrom,
  keepNewerHeldInstrument,
  liveDefinitionAfterFailure,
  quoteBlockFromDistinctionUse,
  recordFailedApplication,
  recordedDefinition,
  retainDistinction,
  retainDistinctionPayload,
  shouldUpdateExistingDistinction,
  sourceStatus,
  updateDistinctionPayload
} from './distinctionUse';

const room = {
  name: 'Room to be wrong',
  definition: 'A mistake that teaches the map, versus one that strands you.'
};

describe('distinctionUse', () => {
  it('gives the same wording the same immutable version id', () => {
    expect(distinctionVersionId(room)).toBe(distinctionVersionId({ ...room }));
    expect(distinctionVersionId(room)).not.toBe(distinctionVersionId({
      ...room,
      definition: 'A mistake that teaches, if someone else bears the downside.'
    }));
  });

  it('records a use as a snapshot, not the live source wording', () => {
    const first = distinctionRecord({
      ...room,
      sourceId: 'note-1',
      against: 'Children need room to make recoverable mistakes.',
      ownerId: 'owner-1',
      appliedAt: '2026-09-11T12:00:00.000Z'
    });
    const laterSource = { title: 'Room to be wrong', snippet: 'Whose downside?' };
    expect(recordedDefinition(first)).toEqual({
      name: room.name,
      definition: room.definition
    });
    expect(recordedDefinition(first).definition).not.toBe(laterSource.snippet);
    expect(first.versionId).toBe(distinctionVersionId(room));
    expect(first.sourceKind).toBe('notebook');
  });

  it('keeps two uses on the same version when the definition has not changed', () => {
    const versionId = distinctionVersionId(room);
    const parenting = distinctionRecord({
      ...room,
      sourceId: 'note-1',
      against: 'Children need room to make recoverable mistakes.'
    });
    const rollout = distinctionRecord({
      ...room,
      sourceId: 'note-1',
      against: 'Ship the rollback while the blast radius is still yours.'
    });
    expect(parenting.versionId).toBe(versionId);
    expect(rollout.versionId).toBe(versionId);
    expect(parenting.against).not.toBe(rollout.against);
    expect(recordedDefinition(rollout).definition).toBe(room.definition);
  });

  it('keeps the recorded definition when the notebook page is gone', () => {
    const used = distinctionRecord({ ...room, sourceId: 'note-gone' });
    expect(sourceStatus(used, null)).toBe('missing');
    expect(recordedDefinition(used).definition).toBe(room.definition);
  });

  it('does not treat another account’s note as this definition’s source', () => {
    const used = distinctionRecord({ ...room, sourceId: 'note-1', ownerId: 'owner-1' });
    expect(heldInstrumentForOwner(used, 'owner-2')).toBeNull();
    expect(heldInstrumentForOwner(used, 'owner-1')).toMatchObject(room);
    expect(sourceStatus(used, { _id: 'note-1', userId: 'owner-2' })).toBe('foreign');
  });

  it('lists only named owner definitions that read like writing', () => {
    expect(eligibleDistinctions([
      { _id: 'note-1', title: room.name, snippet: room.definition, importMeta: { sourceType: DISTINCTION_SOURCE_TYPE } },
      { _id: 'note-2', title: 'Grocery list', snippet: 'Milk', importMeta: { sourceType: 'import' } },
      { _id: 'note-3', title: 'Empty tool', snippet: '', importMeta: { sourceType: DISTINCTION_SOURCE_TYPE } },
      { _id: 'note-4', title: 'Whose downside?', snippet: 'Who pays when the experiment fails.', importMeta: { sourceType: DISTINCTION_SOURCE_TYPE } }
    ])).toEqual([
      {
        sourceId: 'note-1',
        name: room.name,
        definition: room.definition,
        href: '/think?tab=notebook&entryId=note-1'
      },
      {
        sourceId: 'note-4',
        name: 'Whose downside?',
        definition: 'Who pays when the experiment fails.',
        href: '/think?tab=notebook&entryId=note-4'
      }
    ]);
  });

  it('retains a definition as an ordinary notebook note, once', async () => {
    const createNote = jest.fn(async (payload) => ({ _id: 'note-1', ...payload }));
    const notes = [];
    const payload = retainDistinctionPayload({
      ...room,
      externalId: 'distinction:work-1',
      createId: () => 'block-1'
    });
    expect(payload).toMatchObject({
      title: room.name,
      content: room.definition,
      importMeta: {
        provider: 'noeis',
        sourceType: DISTINCTION_SOURCE_TYPE,
        sourceLabel: room.name,
        externalId: 'distinction:work-1'
      }
    });
    const created = await retainDistinction({
      notes,
      createNote,
      name: room.name,
      definition: room.definition,
      externalId: 'distinction:work-1',
      createId: () => 'block-1'
    });
    expect(createNote).toHaveBeenCalledTimes(1);
    const again = await retainDistinction({
      notes: [created],
      createNote,
      name: room.name,
      definition: room.definition,
      externalId: 'distinction:work-1',
      createId: () => 'block-2'
    });
    expect(createNote).toHaveBeenCalledTimes(1);
    expect(again.sourceId).toBe('note-1');
    expect(findRetainedDistinction([created], 'distinction:work-1').sourceId).toBe('note-1');
    expect(distinctionExternalId({ id: 'work-1' })).toBe('distinction:work-1');
    expect(distinctionHref('note-1')).toBe('/think?tab=notebook&entryId=note-1');
  });

  it('places the recorded wording in a second notebook as a quote, not a live link', () => {
    const used = distinctionRecord({ ...room, sourceId: 'note-1' });
    expect(quoteBlockFromDistinctionUse(used, () => 'block-use')).toEqual({
      id: 'block-use',
      type: 'quote',
      text: room.definition,
      articleTitle: room.name,
      sourcePath: `/think?tab=notebook&entryId=note-1&v=${used.versionId}`
    });
    expect(editorNodesFromDistinctionUse(used)).toEqual([
      {
        type: 'heading',
        attrs: { level: 3 },
        content: [{ type: 'text', text: room.name }]
      },
      {
        type: 'blockquote',
        attrs: {
          sourcePath: `/think?tab=notebook&entryId=note-1&v=${used.versionId}`,
          articleTitle: room.name
        },
        content: [{ type: 'paragraph', content: [{ type: 'text', text: room.definition }] }]
      }
    ]);
  });

  it('records a narrower wording on a failed use without rewriting the words used there', () => {
    const first = distinctionRecord({
      ...room,
      sourceId: 'note-1',
      against: 'Children need room to make recoverable mistakes.',
      appliedAt: '2026-09-11'
    });
    const narrower = {
      name: room.name,
      definition: 'A mistake that teaches the map, if someone else does not bear the downside.'
    };
    const failed = recordFailedApplication(first, {
      narrower,
      reason: 'A product rollback can teach the team while customers still pay.',
      at: '2026-09-11'
    });
    expect(recordedDefinition(failed)).toEqual(room);
    expect(failed.versionId).toBe(first.versionId);
    expect(failed.against).toBe(first.against);
    expect(failed.narrowedTo).toEqual({
      name: narrower.name,
      definition: narrower.definition,
      versionId: distinctionVersionId(narrower)
    });
    expect(failed.reason).toBe('A product rollback can teach the team while customers still pay.');
    expect(failed.narrowedAt).toBe('2026-09-11');
    expect(failed.narrowedTo.versionId).not.toBe(first.versionId);
    expect(liveDefinitionAfterFailure(failed)).toEqual(expect.objectContaining(narrower));
    expect(heldInstrumentFrom(failed)).toEqual(expect.objectContaining(room));
    expect(heldInstrumentFrom(failed).narrowedTo).toBeUndefined();
    expect(heldInstrumentFrom(failed).against).toBeUndefined();
  });

  it('keeps an inapplicable use pinned to the old definition', () => {
    const used = distinctionRecord({
      ...room,
      sourceId: 'note-1',
      against: 'Compute will remain scarce.',
      appliedAt: '2026-09-11'
    });
    const failed = recordFailedApplication(used, {
      inapplicable: true,
      reason: 'Scarcity is not a recoverable mistake.',
      at: '2026-09-11'
    });
    expect(recordedDefinition(failed)).toEqual(room);
    expect(failed.inapplicable).toBe(true);
    expect(failed.narrowedTo).toBeUndefined();
    expect(liveDefinitionAfterFailure(failed)).toEqual(expect.objectContaining(room));
    expect(heldInstrumentFrom(failed).inapplicable).toBeUndefined();
  });

  it('does not invent a correction when the wording did not change', () => {
    const used = distinctionRecord({ ...room, sourceId: 'note-1', appliedAt: '2026-09-11' });
    expect(recordFailedApplication(used, { narrower: room, at: '2026-09-11' })).toEqual(used);
  });

  it('lets two scoped meanings sit beside each other instead of merging similar names', () => {
    const listed = eligibleDistinctions([
      {
        _id: 'note-1',
        title: 'reversible',
        snippet: 'A decision you can walk back.',
        importMeta: { sourceType: DISTINCTION_SOURCE_TYPE }
      },
      {
        _id: 'note-2',
        title: 'reversible',
        snippet: 'A trade you can exit overnight.',
        importMeta: { sourceType: DISTINCTION_SOURCE_TYPE }
      }
    ]);
    expect(listed).toHaveLength(2);
    expect(listed.map((item) => item.definition)).toEqual([
      'A decision you can walk back.',
      'A trade you can exit overnight.'
    ]);
    expect(listed[0].sourceId).not.toBe(listed[1].sourceId);
  });

  it('updates the same named note, and keeps a renamed meaning as a separate note', () => {
    const note = {
      _id: 'note-1',
      title: room.name,
      snippet: room.definition,
      importMeta: { sourceType: DISTINCTION_SOURCE_TYPE, externalId: 'distinction:work-1' }
    };
    const narrower = 'A mistake that teaches the map, if someone else does not bear the downside.';
    expect(shouldUpdateExistingDistinction(note, { name: room.name, definition: narrower })).toBe(true);
    expect(shouldUpdateExistingDistinction(note, {
      name: 'Whose downside?',
      definition: 'Who pays when the experiment fails.'
    })).toBe(false);
    expect(updateDistinctionPayload({
      note,
      name: room.name,
      definition: narrower,
      createId: () => 'block-2'
    })).toMatchObject({
      title: room.name,
      content: narrower,
      blocks: [{ id: 'block-2', type: 'paragraph', text: narrower }],
      importMeta: {
        sourceType: DISTINCTION_SOURCE_TYPE,
        sourceLabel: room.name,
        externalId: 'distinction:work-1'
      }
    });
  });

  it('grows an atlas from actual failed uses, not an empty catalog', () => {
    const parenting = distinctionRecord({
      ...room,
      sourceId: 'note-1',
      against: 'Children need room to make recoverable mistakes.'
    });
    const rollout = recordFailedApplication(
      distinctionRecord({
        ...room,
        sourceId: 'note-1',
        against: 'Ship the rollback while the blast radius is still yours.',
        appliedAt: '2026-09-11'
      }),
      {
        narrower: {
          name: room.name,
          definition: 'A mistake that teaches the map, if someone else does not bear the downside.'
        },
        reason: 'Customers still paid.',
        at: '2026-09-11'
      }
    );
    const compute = recordFailedApplication(
      distinctionRecord({
        ...room,
        sourceId: 'note-1',
        against: 'Compute will remain scarce.',
        appliedAt: '2026-09-11'
      }),
      { inapplicable: true, at: '2026-09-11' }
    );
    expect(exceptionsFromUses([parenting, rollout, compute])).toEqual([rollout, compute]);
    expect(exceptionsFromUses([])).toEqual([]);
  });

  it('keeps a pending held narrowing over a stale notebook, and otherwise trusts the saved note', () => {
    const old = heldInstrumentFrom({ ...room, sourceId: 'note-1' });
    const next = heldInstrumentFrom({
      name: room.name,
      definition: 'A mistake that teaches the map, if someone else does not bear the downside.',
      sourceId: 'note-1'
    });
    expect(keepNewerHeldInstrument(old, next).definition).toBe(next.definition);
    expect(keepNewerHeldInstrument(old, next).pending).toBeUndefined();
    expect(keepNewerHeldInstrument({ ...next, pending: true }, old)).toEqual(expect.objectContaining({
      definition: next.definition,
      pending: true
    }));
    expect(keepNewerHeldInstrument({ ...next, pending: true }, next).definition).toBe(next.definition);
    expect(keepNewerHeldInstrument({ ...next, pending: true }, next).pending).toBeUndefined();
    expect(keepNewerHeldInstrument(next, { ...next, pending: true }).pending).toBeUndefined();
    expect(keepNewerHeldInstrument(next, { ...next, pending: true }).definition).toBe(next.definition);
  });
});
