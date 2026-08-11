const {
  createLibraryMixedSourceFixture
} = require('./libraryMixedSourceFixture');

const INVESTIGATION_IDS = Object.freeze({
  supportHighlight: '64f200000000000000000083',
  question: '64f200000000000000000084',
  foreignArticle: '64f200000000000000000085',
  foreignUser: '64f200000000000000000086',
  unresolvedSource: '64f200000000000000000087',
  pendingDraft: 'fixture-concept-pending-draft-1'
});

const clone = value => JSON.parse(JSON.stringify(value));

const createConceptInvestigationFixture = () => {
  const mixed = createLibraryMixedSourceFixture();
  const { chain } = mixed;
  const tensionHighlight = mixed.linkedArticle.highlights[0];
  const supportHighlight = {
    _id: INVESTIGATION_IDS.supportHighlight,
    text: 'Measured hardware efficiency reduced cost within the controlled workload.',
    note: 'This is bounded support for the current hardware-efficiency claim.',
    type: 'evidence',
    createdAt: '2026-07-27T14:25:00.000Z',
    importMeta: {
      provider: 'readwise',
      externalId: 'fixture-highlight-support-1',
      importedAt: '2026-07-27T14:25:00.000Z'
    }
  };
  const linkedArticle = {
    ...mixed.linkedArticle,
    highlights: [supportHighlight, tensionHighlight]
  };
  const question = {
    _id: INVESTIGATION_IDS.question,
    userId: chain.ids.user,
    text: 'Which workload measurements would separate hardware gains from utilization gains?',
    createdAt: '2026-07-27T14:35:00.000Z',
    updatedAt: '2026-07-27T14:35:00.000Z',
    archived: false,
    hiddenFromHome: false,
    debugOnly: false
  };
  const foreignArticle = {
    _id: INVESTIGATION_IDS.foreignArticle,
    userId: INVESTIGATION_IDS.foreignUser,
    title: 'Foreign account source',
    url: 'javascript:alert(1)',
    content: '<script>window.__fixture_attack__ = true</script>Foreign content',
    highlights: [],
    archived: false,
    hiddenFromHome: false,
    debugOnly: false
  };

  const cards = [
    {
      id: 'fixture-support-card',
      sourceKey: `highlight:${supportHighlight._id}`,
      zone: 'supports',
      type: 'Highlight',
      title: 'Hardware efficiency remains material',
      content: supportHighlight.text,
      source: linkedArticle.title,
      sourcePath: 'javascript:alert(1)',
      whyItMatters: 'This persisted card is bounded support for the current claim.',
      confidence: 'Observed',
      strength: 'Medium',
      origin: 'user',
      tags: ['support'],
      createdAt: supportHighlight.createdAt
    },
    {
      id: 'fixture-tension-card',
      sourceKey: `highlight:${tensionHighlight._id}`,
      zone: 'contradictions',
      type: 'Highlight',
      title: 'Utilization and software overhead are material',
      content: tensionHighlight.text,
      source: linkedArticle.title,
      sourcePath: `/library?articleId=${chain.ids.article}&highlightId=${tensionHighlight._id}`,
      whyItMatters: 'This persisted card pressures the word most in the current claim.',
      confidence: 'Observed',
      strength: 'Strong',
      origin: 'user',
      tags: ['tension'],
      createdAt: tensionHighlight.createdAt
    },
    {
      id: 'fixture-article-context-card',
      sourceKey: `article:${chain.ids.article}`,
      zone: 'workspace',
      type: 'Article snippet',
      title: linkedArticle.title,
      content: linkedArticle.title,
      source: linkedArticle.title,
      sourcePath: `/library?articleId=${chain.ids.article}`,
      whyItMatters: 'This is the durable parent source.',
      confidence: 'Contextual',
      strength: 'Medium',
      origin: 'material',
      tags: ['context'],
      createdAt: linkedArticle.createdAt
    },
    {
      id: 'fixture-note-context-card',
      sourceKey: `note:${mixed.note._id}`,
      zone: 'workspace',
      type: 'Note',
      title: mixed.note.title,
      content: mixed.note.content,
      source: mixed.note.title,
      sourcePath: `/think?tab=notebook&entryId=${mixed.note._id}`,
      whyItMatters: 'This is a durable user-authored synthesis.',
      confidence: 'Authored',
      strength: 'Medium',
      origin: 'user',
      tags: ['context'],
      createdAt: mixed.note.createdAt
    },
    {
      id: 'fixture-question-card',
      sourceKey: `question:${question._id}`,
      zone: 'questions',
      type: 'Open question',
      title: 'Separate hardware from utilization',
      content: question.text,
      source: 'Question board',
      sourcePath: `/think?tab=questions&questionId=${question._id}`,
      whyItMatters: 'This persisted question defines an unknown.',
      confidence: 'Open',
      strength: 'Low',
      origin: 'user',
      tags: ['question'],
      createdAt: question.createdAt
    },
    {
      id: 'fixture-agent-card',
      sourceKey: `highlight:${supportHighlight._id}`,
      zone: 'supports',
      type: 'Agent suggestion',
      title: 'Agent-only classification',
      content: 'This must not be represented as current user evidence.',
      sourcePath: '/safe-looking-but-untrusted',
      origin: 'agent'
    },
    {
      id: 'fixture-foreign-card',
      sourceKey: `article:${foreignArticle._id}`,
      zone: 'workspace',
      type: 'Article snippet',
      title: foreignArticle.title,
      content: foreignArticle.content,
      sourcePath: foreignArticle.url,
      origin: 'material'
    },
    {
      id: 'fixture-unresolved-card',
      sourceKey: `article:${INVESTIGATION_IDS.unresolvedSource}`,
      zone: 'workspace',
      type: 'Article snippet',
      title: 'Missing source',
      content: '<script>unresolved()</script>',
      sourcePath: 'javascript:unresolved()',
      origin: 'material'
    }
  ];

  const pendingDraft = {
    id: INVESTIGATION_IDS.pendingDraft,
    kind: 'revision',
    status: 'pending',
    title: 'Broaden the inference-cost claim',
    summary: 'A proposal would add utilization and software overhead without changing the current Wiki.',
    caption: 'Proposal only',
    reason: 'The candidate Wiki revision awaits human disposition.',
    signature: `wiki_revision:${chain.candidateRevision._id}`,
    sourceKeys: [
      `article:${chain.ids.article}`,
      `highlight:${supportHighlight._id}`,
      `highlight:${tensionHighlight._id}`,
      `note:${mixed.note._id}`
    ],
    cards: cards.slice(0, 4),
    createdAt: chain.candidateRevision.createdAt,
    applyMessage: ''
  };
  const concept = {
    ...mixed.concept,
    pinnedHighlightIds: [supportHighlight._id, tensionHighlight._id],
    ideaWorkbench: {
      version: 1,
      header: {
        label: 'Idea',
        title: mixed.concept.name,
        prompt: 'What actually drives inference cost declines?',
        stage: 'Investigate'
      },
      workspaceDraft: '',
      workspaceDraftType: 'Note',
      importedSourceKeys: cards
        .map(card => card.sourceKey)
        .filter(Boolean),
      cards,
      changeDrafts: [pendingDraft],
      hypothesis: {
        html: '<p>Hardware efficiency is material, but its relative contribution remains unresolved.</p><script>window.__fixture_attack__ = true</script>',
        versions: []
      },
      meta: {
        lastReviewedAt: '2026-07-27T14:00:00.000Z',
        stale: true,
        staleReason: 'New measured evidence is waiting for review.'
      },
      agent: {
        comments: [],
        messages: []
      }
    },
    archived: false,
    hiddenFromHome: false,
    debugOnly: false
  };

  return clone({
    ...mixed,
    ids: {
      ...mixed.ids,
      ...INVESTIGATION_IDS
    },
    concept,
    linkedArticle,
    question,
    foreignArticle,
    currentWiki: {
      page: chain.page,
      claim: chain.page.claims[0],
      acceptanceState: 'unverified'
    },
    candidateRevision: chain.candidateRevision,
    pendingDraft,
    expected: {
      articleHref: `/library?articleId=${chain.ids.article}`,
      supportHighlightHref: `/library?articleId=${chain.ids.article}&highlightId=${supportHighlight._id}`,
      tensionHighlightHref: `/library?articleId=${chain.ids.article}&highlightId=${tensionHighlight._id}`,
      noteHref: `/think?tab=notebook&entryId=${mixed.note._id}`,
      questionHref: `/think?tab=questions&questionId=${question._id}`
    }
  });
};

module.exports = {
  INVESTIGATION_IDS,
  createConceptInvestigationFixture
};
