const IDS = Object.freeze({
  user: '64f200000000000000000001',
  article: '64f200000000000000000010',
  sourceRef: '64f200000000000000000011',
  citation: '64f200000000000000000012',
  concept: '64f200000000000000000020',
  page: '64f200000000000000000030',
  event: '64f200000000000000000040',
  revision: '64f200000000000000000050',
  receipt: '64f200000000000000000060'
});

const CLAIM_ID = 'fixture-inference-cost-claim';
const DECISION_ID = 'fixture-review-inference-economics';

const clone = value => JSON.parse(JSON.stringify(value));

const createKnowledgeMovementChainFixture = () => {
  const importedSource = {
    _id: IDS.article,
    userId: IDS.user,
    type: 'article',
    title: 'Measured inference-cost decomposition',
    url: 'https://example.com/measured-inference-cost-decomposition',
    importMeta: {
      provider: 'readwise',
      externalId: 'fixture-readwise-article-1'
    }
  };
  const concept = {
    _id: IDS.concept,
    userId: IDS.user,
    name: 'Inference economics',
    archived: false,
    hiddenFromHome: false,
    debugOnly: false
  };
  const beforeClaim = {
    claimId: CLAIM_ID,
    text: 'Hardware efficiency will drive most inference cost declines.',
    support: 'partial',
    confidence: 0,
    epistemicStatus: 'plausible_hypothesis',
    materiality: 'major',
    checkInStatus: 'unreviewed',
    sourceRefIds: [],
    citationIds: [],
    contradictedByCitationIds: []
  };
  const afterClaim = {
    ...beforeClaim,
    support: 'conflicted',
    sourceRefIds: [IDS.sourceRef],
    citationIds: [IDS.citation],
    contradictedByCitationIds: [IDS.citation]
  };
  const sourceRef = {
    _id: IDS.sourceRef,
    type: 'article',
    objectId: IDS.article,
    title: importedSource.title,
    url: importedSource.url
  };
  const citation = {
    _id: IDS.citation,
    sourceRefId: IDS.sourceRef,
    sourceType: 'article',
    sourceObjectId: IDS.article,
    sourceTitle: importedSource.title,
    quote: 'Utilization and software overhead explain a material share of observed cost.',
    url: importedSource.url
  };
  const decision = {
    decisionId: DECISION_ID,
    decidedAt: '2026-07-27T16:00:00.000Z',
    decisionType: 'research',
    summary: 'Review the inference cost thesis after the next measured workload study.',
    rationale: 'The accepted claim has a material unresolved contradiction.',
    expectedOutcome: 'Determine whether the original hardware-led view still holds.',
    reviewAt: '2026-08-03T16:00:00.000Z',
    status: 'reviewed',
    relatedClaimIds: [CLAIM_ID],
    sourceRefIds: [IDS.sourceRef],
    outcome: {
      observedAt: '2026-08-04T16:00:00.000Z',
      summary: 'The measured workload showed software and utilization were material.',
      result: 'mixed',
      processScore: 0.8,
      calibrationNote: 'The original claim overweighted hardware efficiency.',
      lesson: 'Decompose workload economics before assigning the cost decline to hardware.'
    },
    createdBy: 'user'
  };
  const page = {
    _id: IDS.page,
    userId: IDS.user,
    title: 'Inference economics',
    slug: 'fixture-inference-economics',
    pageType: 'topic',
    status: 'draft',
    visibility: 'private',
    plainText: beforeClaim.text,
    createdFrom: {
      type: 'concept',
      objectId: IDS.concept,
      label: concept.name
    },
    sourceRefs: [sourceRef],
    citations: [citation],
    claims: [beforeClaim],
    judgment: {
      kind: 'thesis',
      governingQuestion: 'What actually drives inference cost declines?',
      currentJudgment: beforeClaim.text,
      status: 'challenged',
      decisionPosture: 'investigate',
      decisions: [decision]
    },
    archived: false,
    hiddenFromHome: false,
    debugOnly: false
  };
  const sourceEvent = {
    _id: IDS.event,
    userId: IDS.user,
    sourceType: 'article',
    sourceObjectId: IDS.article,
    provider: 'readwise',
    externalId: 'fixture-readwise-article-1:update-1',
    eventType: 'updated',
    title: importedSource.title,
    summary: 'A measured workload challenges the hardware-only explanation.',
    url: importedSource.url,
    sourceUpdatedAt: '2026-07-27T15:00:00.000Z',
    createdAt: '2026-07-27T15:01:00.000Z',
    processedAt: '2026-07-27T15:02:00.000Z',
    status: 'processed',
    affectedPageIds: [IDS.page]
  };
  const candidateRevision = {
    _id: IDS.revision,
    userId: IDS.user,
    pageId: IDS.page,
    sourceEventId: IDS.event,
    reason: 'source_event',
    actorType: 'agent',
    promotionStatus: 'candidate',
    before: {
      claims: [beforeClaim],
      sourceRefs: [],
      citations: []
    },
    after: {
      claims: [afterClaim],
      sourceRefs: [sourceRef],
      citations: [citation]
    },
    createdAt: '2026-07-27T15:03:00.000Z'
  };
  const acceptedRevision = {
    ...candidateRevision,
    promotionStatus: 'promoted'
  };
  const acceptanceReceipt = {
    _id: IDS.receipt,
    receiptId: 'fixture-acceptance-receipt-1',
    userId: IDS.user,
    kind: 'company_dossier_maintenance_accepted',
    source: 'wiki',
    sourceLabel: page.title,
    status: 'completed',
    title: 'Accepted fixture claim revision',
    provenance: {
      candidateRevisionId: IDS.revision,
      pageId: IDS.page,
      claimId: CLAIM_ID
    },
    completedAt: '2026-07-27T16:05:00.000Z'
  };

  return clone({
    ids: IDS,
    claimId: CLAIM_ID,
    decisionId: DECISION_ID,
    importedSource,
    concept,
    page,
    sourceEvent,
    candidateRevision,
    acceptedRevision,
    acceptanceReceipt
  });
};

module.exports = {
  IDS,
  CLAIM_ID,
  DECISION_ID,
  createKnowledgeMovementChainFixture
};
