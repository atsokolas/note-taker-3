const { listRecentExplorations } = require('./authoredWorkDiscovery');
const {
  AuthoredExplorationError,
  deleteExploration,
  keepExploration,
  listExplorations,
  putExploration,
  resolveExplorationContext
} = require('./authoredExplorationService');

const claimBody = (claims) => ({
  type: 'doc',
  content: claims.map(claim => ({
    type: 'paragraph',
    content: [{
      type: 'text',
      text: claim.text,
      marks: [{ type: 'claim', attrs: { claimId: claim.claimId } }]
    }]
  }))
});

const page = (userId = 'owner') => ({
  _id: 'page-1',
  userId,
  title: 'Parenting',
  slug: 'parenting',
  status: 'published',
  claims: [{ claimId: 'claim-1', text: 'Children need room to make mistakes.' }],
  body: claimBody([{ claimId: 'claim-1', text: 'Children need room to make mistakes.' }])
});

const query = (value) => ({
  select() { return this; },
  sort() { return this; },
  limit() { return this; },
  lean() { return Promise.resolve(value); },
  then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); }
});

const matches = (row, filter = {}) => Object.entries(filter).every(([key, expected]) => {
  if (key === 'mutations.id') return !(row.mutations || []).some(item => item.id === expected.$ne);
  if (key === 'keeps') return !(row.keeps || []).some(item => item.destination === expected.$not.$elemMatch.destination);
  if (key === 'status') return expected.$ne !== row.status;
  return String(row[key] ?? '') === String(expected ?? '');
});

const applyUpdate = (row, update) => {
  Object.assign(row, update.$set || {});
  Object.entries(update.$inc || {}).forEach(([key, value]) => { row[key] = Number(row[key] || 0) + value; });
  Object.entries(update.$push || {}).forEach(([key, value]) => {
    row[key] ||= [];
    if (value.$each) {
      row[key].push(...value.$each);
      if (value.$slice < 0) row[key] = row[key].slice(value.$slice);
    } else row[key].push(value);
  });
  row.updatedAt = new Date();
  return row;
};

const explorationModel = () => {
  const rows = [];
  return {
    rows,
    findOne: filter => query(rows.find(row => matches(row, filter)) || null),
    find: filter => query(rows.filter(row => matches(row, filter))),
    create: async value => {
      if (rows.some(row => row.userId === value.userId && row.pageId === value.pageId && row.claimId === value.claimId)) {
        const error = new Error('duplicate'); error.code = 11000; throw error;
      }
      const row = { _id: `exploration-${rows.length + 1}`, createdAt: new Date(), updatedAt: new Date(), keeps: [], ...value };
      rows.push(row);
      return row;
    },
    findOneAndUpdate: (filter, update) => {
      const row = rows.find(item => matches(item, filter));
      return query(row ? applyUpdate(row, update) : null);
    },
    findOneAndDelete: filter => {
      const index = rows.findIndex(row => matches(row, filter));
      return query(index < 0 ? null : rows.splice(index, 1)[0]);
    },
    updateOne: async (filter, update) => {
      const row = rows.find(item => matches(item, { userId: filter.userId, pageId: filter.pageId, claimId: filter.claimId }));
      const keep = row?.keeps?.find(item => item.destination === filter['keeps.destination'] && String(item.targetId) === String(filter['keeps.targetId']));
      if (keep && update.$set?.['keeps.$.status']) keep.status = update.$set['keeps.$.status'];
      if (keep && update.$unset?.['keeps.$.snapshot']) delete keep.snapshot;
      return { modifiedCount: keep ? 1 : 0 };
    }
  };
};

const ownedWiki = (owner = 'owner') => ({
  findOne: filter => query(filter.userId === owner && filter._id === 'page-1' ? page(owner) : null)
});

const articles = () => ({
  findOne: filter => query(filter.userId === 'owner' && filter._id === 'article-1' ? {
    _id: 'article-1',
    title: 'Nomad',
    content: 'Before. A useful exact passage. After.',
    highlights: [{ _id: 'highlight-1', text: 'A useful exact passage.' }]
  } : null)
});

const draft = (writing = 'My line') => ({
  writing,
  originalText: 'Children need room to make mistakes.',
  meet: { against: '', relation: 'An analogy', limit: '', between: writing },
  selectedSource: { articleId: 'article-1', highlightId: 'highlight-1', passage: 'A useful exact passage.' }
});

describe('durable private authored exploration', () => {
  it('removes optional fields omitted by a replacement draft while preserving its writing', async () => {
    const AuthoredExploration = explorationModel();
    const context = { AuthoredExploration, WikiPage: ownedWiki(), Article: articles(),
      userId: 'owner', pageId: 'page-1', claimId: 'claim-1' };
    const initial = { ...draft(), pressure: { against: draft().originalText, premise: 'Suppose the opposite.' } };
    await putExploration({ ...context, expectedRevision: 0, mutationId: 'with-context', draft: initial });
    const saved = await putExploration({ ...context, expectedRevision: 1, mutationId: 'set-context-aside',
      draft: { writing: initial.writing, originalText: initial.originalText } });
    expect(saved.revision).toBe(2);
    const [restored] = await listExplorations(context);
    expect(restored.draft.writing).toBe(initial.writing);
    for (const field of ['meet', 'pressure', 'selectedSource']) {
      expect(restored.draft).not.toHaveProperty(field);
      expect(AuthoredExploration.rows[0].draft).not.toHaveProperty(field);
    }
  });

  it('scopes writes and reads to the page owner and returns canonical sources', async () => {
    const AuthoredExploration = explorationModel();
    const saved = await putExploration({
      AuthoredExploration, WikiPage: ownedWiki(), Article: articles(), userId: 'owner',
      pageId: 'page-1', claimId: 'claim-1', expectedRevision: 0, mutationId: 'save-1', draft: draft()
    });
    expect(saved.revision).toBe(1);
    expect(saved.draft.selectedSource.articleTitle).toBe('Nomad');
    expect(saved.draft.meet.against).toBe('');
    expect(saved.origin.href).toBe('/wiki/read/page-1?claimId=claim-1&exploration=1');
    const listed = await listExplorations({ AuthoredExploration, WikiPage: ownedWiki(), Article: articles(), userId: 'owner', pageId: 'page-1' });
    expect(listed).toHaveLength(1);
    const staleListed = await listExplorations({
      AuthoredExploration,
      WikiPage: ownedWiki(),
      Article: { findOne: () => query(null) },
      userId: 'owner',
      pageId: 'page-1'
    });
    expect(staleListed[0]).toMatchObject({
      originStale: false,
      sourceIssue: { code: 'source_not_found' },
      draft: { writing: 'My line', selectedSource: { passage: 'A useful exact passage.', available: false, stale: true } }
    });
    await expect(listExplorations({ AuthoredExploration, WikiPage: ownedWiki(), Article: articles(), userId: 'foreign', pageId: 'page-1' }))
      .rejects.toMatchObject({ code: 'page_not_found' });
  });

  it('replays a lost acknowledgement before revision conflict and rejects reused mutation content', async () => {
    const AuthoredExploration = explorationModel();
    const args = { AuthoredExploration, WikiPage: ownedWiki(), Article: articles(), userId: 'owner', pageId: 'page-1', claimId: 'claim-1', expectedRevision: 0, mutationId: 'save-1', draft: draft() };
    await putExploration(args);
    const replay = await putExploration(args);
    expect(replay.idempotent).toBe(true);
    await expect(putExploration({ ...args, draft: draft('Different work') }))
      .rejects.toMatchObject({ code: 'mutation_reused' });
    await expect(putExploration({ ...args, mutationId: 'save-2', draft: draft('Second') }))
      .rejects.toMatchObject({ code: 'stale_revision' });
    const updated = await putExploration({ ...args, expectedRevision: 1, mutationId: 'save-3', draft: draft('Second') });
    expect(updated.revision).toBe(2);
    expect(updated.draft.writing).toBe('Second');
    await expect(putExploration(args)).rejects.toMatchObject({
      code: 'stale_revision',
      details: {
        acknowledgedRevision: 1,
        current: { revision: 2, draft: { writing: 'Second' } }
      }
    });
    await expect(putExploration({ ...args, expectedRevision: 2, mutationId: 'oversized', draft: draft('x'.repeat(20001)) }))
      .rejects.toMatchObject({ code: 'draft_too_large', status: 413 });
  });

  it('makes stale source and live conversation context explicit', async () => {
    const context = { id: 'page-1', metadata: { claimId: 'claim-1', exploration: { pageId: 'page-1', claimId: 'claim-1', draft: draft() } } };
    const resolved = await resolveExplorationContext({ userId: 'owner', context, WikiPage: ownedWiki(), Article: articles() });
    expect(resolved.draft.selectedSource.passage).toBe('A useful exact passage.');
    const citedPage = {
      ...page('owner'),
      claims: [{ claimId: 'claim-1', text: 'Children need room to make mistakes.', sourceRefIds: ['source-ref-1'] }],
      sourceRefs: [{ _id: 'source-ref-1', type: 'highlight', objectId: 'highlight-1', parentObjectId: 'article-1', title: 'Nomad' }],
      citations: [{ _id: 'citation-1', sourceRefId: 'source-ref-1', quote: 'A useful exact passage.' }]
    };
    const withPrimary = await resolveExplorationContext({
      userId: 'owner',
      context,
      WikiPage: { findOne: () => query(citedPage) },
      Article: articles()
    });
    expect(withPrimary.primarySource).toMatchObject({ title: 'Nomad', passage: 'A useful exact passage.', available: true, stale: false });
    await expect(resolveExplorationContext({ userId: 'owner', context: { ...context, id: 'other' }, WikiPage: ownedWiki(), Article: articles() }))
      .rejects.toMatchObject({ code: 'exploration_context_mismatch' });
    await expect(putExploration({
      AuthoredExploration: explorationModel(), WikiPage: ownedWiki(), Article: articles(), userId: 'owner',
      pageId: 'page-1', claimId: 'claim-1', expectedRevision: 0, mutationId: 'stale',
      draft: { ...draft(), selectedSource: { ...draft().selectedSource, passage: 'Old passage.' } }
    })).rejects.toMatchObject({ code: 'stale_source' });
    await expect(putExploration({
      AuthoredExploration: explorationModel(), WikiPage: ownedWiki(), Article: { findOne: () => query(null) }, userId: 'owner',
      pageId: 'page-1', claimId: 'claim-1', expectedRevision: 0, mutationId: 'foreign', draft: draft()
    })).rejects.toMatchObject({ code: 'source_not_found' });
    const excerpt = await putExploration({
      AuthoredExploration: explorationModel(), WikiPage: ownedWiki(), Article: articles(), userId: 'owner',
      pageId: 'page-1', claimId: 'claim-1', expectedRevision: 0, mutationId: 'excerpt',
      draft: { ...draft(), selectedSource: { articleId: 'article-1', passage: 'A useful exact passage.', anchor: { prefix: 'Before. ', suffix: ' After.', startOffsetApprox: 8 } } }
    });
    expect(excerpt.draft.selectedSource.href).toContain('#passage=');
    expect(JSON.parse(decodeURIComponent(excerpt.draft.selectedSource.href.split('#passage=')[1]))).toMatchObject({
      v: 1,
      articleId: 'article-1',
      text: 'A useful exact passage.',
      startOffsetApprox: 8
    });
    await expect(putExploration({
      AuthoredExploration: explorationModel(),
      WikiPage: ownedWiki(),
      Article: { findOne: () => query({ _id: 'article-1', title: 'Repeated', content: 'same passage and same passage', highlights: [] }) },
      userId: 'owner', pageId: 'page-1', claimId: 'claim-1', expectedRevision: 0, mutationId: 'ambiguous',
      draft: { ...draft(), selectedSource: { articleId: 'article-1', passage: 'same passage', anchor: { startOffsetApprox: 4 } } }
    })).rejects.toMatchObject({ code: 'ambiguous_source' });
  });

  it('rejects an unanchored or ledger-mismatched origin before mutating exploration storage', async () => {
    const AuthoredExploration = explorationModel();
    const findOne = jest.spyOn(AuthoredExploration, 'findOne');
    const driftedPage = {
      ...page('owner'),
      body: claimBody([{ claimId: 'claim-1', text: 'The body changed without the claim ledger.' }])
    };
    await expect(putExploration({
      AuthoredExploration,
      WikiPage: { findOne: () => query(driftedPage) },
      Article: articles(),
      userId: 'owner',
      pageId: 'page-1',
      claimId: 'claim-1',
      expectedRevision: 0,
      mutationId: 'body-drift',
      draft: draft()
    })).rejects.toMatchObject({ code: 'stale_origin' });
    expect(findOne).not.toHaveBeenCalled();

    const RecoverableExploration = explorationModel();
    await putExploration({
      AuthoredExploration: RecoverableExploration,
      WikiPage: ownedWiki(),
      Article: articles(),
      userId: 'owner', pageId: 'page-1', claimId: 'claim-1', expectedRevision: 0,
      mutationId: 'valid-before-drift', draft: draft()
    });
    const listed = await listExplorations({
      AuthoredExploration: RecoverableExploration,
      WikiPage: { findOne: () => query(driftedPage) },
      Article: articles(),
      userId: 'owner', pageId: 'page-1'
    });
    expect(listed[0]).toMatchObject({ originStale: true, draft: { writing: 'My line' } });

    const storageRead = jest.spyOn(RecoverableExploration, 'findOne');
    const NotebookEntry = { findOne: jest.fn(), create: jest.fn() };
    await expect(keepExploration({
      AuthoredExploration: RecoverableExploration,
      WikiPage: { findOne: () => query(driftedPage) },
      Article: articles(),
      NotebookEntry,
      Question: {},
      userId: 'owner', pageId: 'page-1', claimId: 'claim-1', expectedRevision: 1,
      mutationId: 'keep-after-drift', destination: 'notebook', createBlockId: () => 'block'
    })).rejects.toMatchObject({ code: 'stale_origin' });
    // Keep must read the row to distinguish a new Keep from recovery of an
    // already reserved snapshot, but this stale new Keep must not create or
    // update either destination.
    expect(storageRead).toHaveBeenCalledTimes(1);
    expect(NotebookEntry.create).not.toHaveBeenCalled();

    const ambiguousPage = {
      ...page('owner'),
      body: {
        type: 'doc',
        content: [
          ...claimBody(page('owner').claims).content,
          ...claimBody(page('owner').claims).content
        ]
      }
    };
    await expect(resolveExplorationContext({
      userId: 'owner',
      context: { id: 'page-1', metadata: { claimId: 'claim-1', exploration: { pageId: 'page-1', claimId: 'claim-1', draft: draft() } } },
      WikiPage: { findOne: () => query(ambiguousPage) },
      Article: articles()
    })).rejects.toMatchObject({ code: 'stale_origin' });
  });

  it('reserves a keep target and resumes it after a destination creation crash', async () => {
    const AuthoredExploration = explorationModel();
    const citedPage = {
      ...page('owner'),
      claims: [{ claimId: 'claim-1', text: 'Children need room to make mistakes.', sourceRefIds: ['source-ref-1'] }],
      sourceRefs: [{ _id: 'source-ref-1', type: 'highlight', objectId: 'highlight-1', parentObjectId: 'article-1', title: 'Nomad' }],
      citations: [{ _id: 'citation-1', sourceRefId: 'source-ref-1', quote: 'A useful exact passage.' }]
    };
    let currentPage = citedPage;
    const WikiPage = { findOne: filter => query(filter.userId === 'owner' && filter._id === 'page-1' ? currentPage : null) };
    await putExploration({ AuthoredExploration, WikiPage, Article: articles(), userId: 'owner', pageId: 'page-1', claimId: 'claim-1', expectedRevision: 0, mutationId: 'save-1', draft: { ...draft(), question: 'Who decides what is recoverable?' } });
    const notes = [];
    let failOnce = true;
    const NotebookEntry = {
      findOne: filter => query(notes.find(row => String(row._id) === String(filter._id) && row.userId === filter.userId) || null),
      create: async payload => { if (failOnce) { failOnce = false; throw new Error('interrupted'); } notes.push(payload); return payload; }
    };
    const questions = [];
    const Question = {
      findOne: filter => query(questions.find(row => String(row._id) === String(filter._id) && row.userId === filter.userId) || null),
      create: async payload => { questions.push(payload); return payload; }
    };
    const args = {
      AuthoredExploration, WikiPage, Article: articles(), NotebookEntry, Question, userId: 'owner', pageId: 'page-1', claimId: 'claim-1',
      expectedRevision: 1, mutationId: 'keep-1', destination: 'notebook', createBlockId: (() => { let index = 0; return () => `block-${++index}`; })()
    };
    await expect(keepExploration(args)).rejects.toThrow('interrupted');
    const later = await putExploration({
      AuthoredExploration,
      WikiPage,
      Article: articles(),
      userId: 'owner',
      pageId: 'page-1',
      claimId: 'claim-1',
      expectedRevision: 2,
      mutationId: 'save-after-keep',
      draft: { ...draft('Later writing'), question: 'A later question?' }
    });
    expect(later.revision).toBe(3);
    currentPage = { ...citedPage, claims: [], body: { type: 'doc', content: [] } };
    const kept = await keepExploration(args);
    expect(notes).toHaveLength(1);
    expect(notes[0].content).toBe('My line');
    expect(notes[0].importMeta.sourceUrl).toBe('/wiki/read/page-1?claimId=claim-1&exploration=1');
    expect(notes[0].importMeta.sourcePath).toBe('/library?articleId=article-1&highlightId=highlight-1');
    expect(notes[0].importMeta.importedAt).toBeInstanceOf(Date);
    expect(notes[0].blocks).toEqual([
      expect.objectContaining({ type: 'paragraph', text: 'My line' }),
      expect.objectContaining({ type: 'highlight_embed', text: 'A useful exact passage.', articleId: 'article-1', highlightId: 'highlight-1' }),
      expect.objectContaining({ type: 'highlight_embed', text: 'A useful exact passage.', articleId: 'article-1', highlightId: 'highlight-1' })
    ]);
    expect(notes[0].blocks.some(block => block.text.startsWith('Origin:'))).toBe(false);
    expect(kept.exploration.keeps[0].status).toBe('complete');
    expect(kept.href).toContain('/think?tab=notebook&entryId=');

    currentPage = citedPage;
    await keepExploration({ ...args, expectedRevision: 3, mutationId: 'keep-question', destination: 'question' });
    expect(questions).toHaveLength(1);
    expect(questions[0].importMeta).toMatchObject({
      sourceType: 'authored_exploration',
      sourceLabel: 'Parenting',
      sourceUrl: '/wiki/read/page-1?claimId=claim-1&exploration=1',
      sourcePath: '/library?articleId=article-1&highlightId=highlight-1'
    });
    expect(questions[0].blocks.filter(block => block.type === 'highlight-ref')).toHaveLength(2);
    expect(questions[0].blocks.some(block => block.text.startsWith('Origin:'))).toBe(false);
  });

  it.each([
    ['notebook', 'NotebookEntry', 'onNotebookKept'],
    ['question', 'Question', 'onQuestionKept']
  ])('does not recreate a removed completed %s copy from later writing', async (destination, modelName, callbackName) => {
    const AuthoredExploration = explorationModel();
    const WikiPage = ownedWiki();
    await putExploration({
      AuthoredExploration,
      WikiPage,
      Article: articles(),
      userId: 'owner',
      pageId: 'page-1',
      claimId: 'claim-1',
      expectedRevision: 0,
      mutationId: `save-${destination}`,
      draft: { ...draft('Writing kept at click time'), question: 'Question kept at click time?' }
    });

    const targets = [];
    const destinationModel = {
      findOne: filter => query(targets.find(row => String(row._id) === String(filter._id) && row.userId === filter.userId) || null),
      create: jest.fn(async payload => { targets.push(payload); return payload; })
    };
    const callback = jest.fn(async () => {});
    const keepArgs = {
      AuthoredExploration,
      WikiPage,
      Article: articles(),
      NotebookEntry: modelName === 'NotebookEntry' ? destinationModel : {},
      Question: modelName === 'Question' ? destinationModel : {},
      userId: 'owner',
      pageId: 'page-1',
      claimId: 'claim-1',
      expectedRevision: 1,
      mutationId: `keep-${destination}`,
      destination,
      createBlockId: () => 'block',
      [callbackName]: callback
    };

    await keepExploration(keepArgs);
    expect(targets).toHaveLength(1);
    expect(callback).toHaveBeenCalledTimes(1);
    expect(AuthoredExploration.rows[0].keeps[0]).toMatchObject({ status: 'complete' });
    expect(AuthoredExploration.rows[0].keeps[0].snapshot).toBeUndefined();

    await putExploration({
      AuthoredExploration,
      WikiPage,
      Article: articles(),
      userId: 'owner',
      pageId: 'page-1',
      claimId: 'claim-1',
      expectedRevision: 2,
      mutationId: `later-${destination}`,
      draft: { ...draft('Later writing must not become the kept copy'), question: 'A later question must not become the kept copy?' }
    });
    targets.length = 0;

    await expect(keepExploration(keepArgs)).rejects.toMatchObject({
      status: 410,
      code: 'kept_copy_removed',
      message: 'This kept copy is no longer available and was not recreated.'
    });
    expect(destinationModel.create).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledTimes(1);
    expect(targets).toHaveLength(0);
  });

  it.each(['notebook', 'question'])('resumes %s queue work after the copy exists without changing its snapshot', async destination => {
    const AuthoredExploration = explorationModel();
    const WikiPage = ownedWiki();
    const Article = articles();
    await putExploration({ AuthoredExploration, WikiPage, Article, userId: 'owner', pageId: 'page-1', claimId: 'claim-1',
      expectedRevision: 0, mutationId: 'save-1', draft: { ...draft('The kept words'), question: 'The kept question?' } });
    const targets = [];
    const Model = { findOne: filter => query(targets.find(target => String(target._id) === String(filter._id)) || null),
      create: jest.fn(async payload => { targets.push(payload); return payload; }) };
    const finish = jest.fn().mockRejectedValueOnce(new Error('queue unavailable')).mockResolvedValue(undefined);
    const args = { AuthoredExploration, WikiPage, Article, userId: 'owner', pageId: 'page-1', claimId: 'claim-1',
      expectedRevision: 1, mutationId: 'keep-1', destination, NotebookEntry: Model, Question: Model,
      createBlockId: () => 'block', onNotebookKept: finish, onQuestionKept: finish };
    await expect(keepExploration(args)).rejects.toMatchObject({ status: 503, code: 'keep_pending',
      details: { current: { keeps: [expect.objectContaining({ status: 'pending' })] } } });
    expect(targets).toHaveLength(1);
    expect(AuthoredExploration.rows[0].keeps[0].snapshot.draft.writing).toBe('The kept words');
    await putExploration({ AuthoredExploration, WikiPage, Article, userId: 'owner', pageId: 'page-1', claimId: 'claim-1',
      expectedRevision: 2, mutationId: 'save-later', draft: { ...draft('Later private words'), question: 'A later question?' } });
    const result = await keepExploration(args);
    expect(result.exploration.keeps[0].status).toBe('complete');
    expect(Model.create).toHaveBeenCalledTimes(1);
    expect(finish).toHaveBeenCalledTimes(2);
    expect(targets[0][destination === 'notebook' ? 'content' : 'text']).toBe(destination === 'notebook' ? 'The kept words' : 'The kept question?');
    expect(AuthoredExploration.rows[0].draft.writing).toBe('Later private words');
    expect(AuthoredExploration.rows[0].keeps[0].snapshot).toBeUndefined();
  });

  it('deletes only at the expected revision and treats a repeated delete as complete', async () => {
    const AuthoredExploration = explorationModel();
    await putExploration({ AuthoredExploration, WikiPage: ownedWiki(), Article: articles(), userId: 'owner', pageId: 'page-1', claimId: 'claim-1', expectedRevision: 0, mutationId: 'save-1', draft: draft() });
    await expect(deleteExploration({ AuthoredExploration, userId: 'owner', pageId: 'page-1', claimId: 'claim-1', expectedRevision: 0 }))
      .rejects.toMatchObject({ code: 'invalid_exploration' });
    expect(AuthoredExploration.rows).toHaveLength(1);
    await expect(deleteExploration({ AuthoredExploration, WikiPage: ownedWiki(), userId: 'owner', pageId: 'page-1', claimId: 'claim-1', expectedRevision: 2 }))
      .rejects.toMatchObject({ code: 'stale_revision' });
    expect(await deleteExploration({ AuthoredExploration, WikiPage: ownedWiki(), userId: 'owner', pageId: 'page-1', claimId: 'claim-1', expectedRevision: 1 })).toBe(true);
    expect(await deleteExploration({ AuthoredExploration, WikiPage: ownedWiki(), userId: 'owner', pageId: 'page-1', claimId: 'claim-1', expectedRevision: 1 })).toBe(false);
  });
});

describe('recent authored writing', () => {
  it('checks page access in bulk, keeps saved copies eligible, and returns bounded summaries', async () => {
    const rows = Array.from({ length: 8 }, (_, n) => ({
      _id: `work-${n}`, pageId: n === 0 ? 'unavailable' : 'page-1', claimId: `claim-${n}`,
      draft: { writing: 'My first line.\nAnother thought.', returnNote: 'Try again tomorrow.', selectedSource: { passage: 'Private source' } },
      keeps: [{ destination: 'notebook', targetId: 'note-1' }],
      mutations: [{ id: 'private-mutation' }]
    }));
    const AuthoredExploration = { find: jest.fn(() => query(rows)) };
    const WikiPage = { find: jest.fn(() => query([{ _id: 'page-1', title: 'Current page title' }])) };
    const result = await listRecentExplorations({ AuthoredExploration, WikiPage, userId: 'owner' });
    expect(AuthoredExploration.find).toHaveBeenCalledWith(expect.objectContaining({ userId: 'owner', $or: expect.any(Array) }));
    expect(WikiPage.find).toHaveBeenCalledWith({ _id: { $in: ['unavailable', 'page-1'] }, userId: 'owner', status: { $ne: 'archived' }, archived: { $ne: true }, hiddenFromHome: { $ne: true }, debugOnly: { $ne: true } });
    expect(result).toHaveLength(5);
    expect(result[0]).toEqual({ id: 'work-1', pageId: 'page-1', claimId: 'claim-1', pageTitle: 'Current page title', title: 'My first line.', returnNote: 'Try again tomorrow.', updatedAt: null });
    expect(JSON.stringify(result)).not.toMatch(/Private source|private-mutation|note-1/);
  });

  it('returns silence without another query when there is no authored work', async () => {
    const WikiPage = { find: jest.fn() };
    expect(await listRecentExplorations({ AuthoredExploration: { find: () => query([]) }, WikiPage, userId: 'owner' })).toEqual([]);
    expect(WikiPage.find).not.toHaveBeenCalled();
  });
});
