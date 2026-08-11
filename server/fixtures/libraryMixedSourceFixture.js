const {
  createKnowledgeMovementChainFixture
} = require('./knowledgeMovementChainFixture');

const EXTRA_IDS = Object.freeze({
  highlight: '64f200000000000000000071',
  note: '64f200000000000000000072',
  unconnectedArticle: '64f200000000000000000073',
  notebookEdge: '64f200000000000000000074'
});

const clone = value => JSON.parse(JSON.stringify(value));

const createLibraryMixedSourceFixture = () => {
  const chain = createKnowledgeMovementChainFixture();
  const linkedArticle = {
    ...chain.importedSource,
    createdAt: '2026-07-27T14:00:00.000Z',
    importMeta: {
      ...chain.importedSource.importMeta,
      importedAt: '2026-07-27T14:00:00.000Z'
    },
    highlights: [{
      _id: EXTRA_IDS.highlight,
      text: 'Utilization and software overhead explain a material share of observed cost.',
      note: 'This is tension against a hardware-only explanation.',
      type: 'evidence',
      createdAt: '2026-07-27T14:30:00.000Z',
      importMeta: {
        provider: 'readwise',
        externalId: 'fixture-highlight-1',
        importedAt: '2026-07-27T14:30:00.000Z'
      }
    }]
  };
  const note = {
    _id: EXTRA_IDS.note,
    userId: chain.ids.user,
    title: 'Inference economics synthesis',
    content: 'Separate hardware efficiency from utilization and software overhead.',
    type: 'note',
    importMeta: {
      provider: 'notion',
      externalId: 'fixture-note-1',
      importedAt: '2026-07-27T14:20:00.000Z'
    },
    createdAt: '2026-07-27T14:20:00.000Z'
  };
  const unconnectedArticle = {
    _id: EXTRA_IDS.unconnectedArticle,
    userId: chain.ids.user,
    title: 'Unconnected workload note',
    url: 'https://example.com/unconnected-workload-note',
    importMeta: {
      provider: 'manual',
      externalId: 'fixture-unconnected-1',
      importedAt: '2026-07-27T13:00:00.000Z'
    },
    createdAt: '2026-07-27T13:00:00.000Z',
    highlights: []
  };
  const concept = {
    ...chain.concept,
    pinnedArticleIds: [chain.ids.article],
    pinnedHighlightIds: [EXTRA_IDS.highlight],
    pinnedNoteIds: []
  };
  const notebookEdge = {
    _id: EXTRA_IDS.notebookEdge,
    userId: chain.ids.user,
    sourceType: 'notebook',
    sourceId: EXTRA_IDS.note,
    sourceBlockId: 'fixture-note-article-ref',
    targetType: 'article',
    targetId: chain.ids.article,
    blockPreviewText: 'Durable Notebook reference to the linked source.',
    createdAt: '2026-07-27T14:21:00.000Z'
  };

  return clone({
    chain,
    linkedArticle,
    note,
    unconnectedArticle,
    concept,
    notebookEdge,
    ids: {
      ...chain.ids,
      ...EXTRA_IDS
    }
  });
};

module.exports = {
  EXTRA_IDS,
  createLibraryMixedSourceFixture
};
