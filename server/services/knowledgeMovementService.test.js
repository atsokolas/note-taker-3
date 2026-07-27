const assert = require('assert');
const {
  buildKnowledgeMovements,
  buildKnowledgeMovementEpisodes,
  diffClaimState,
  mergeDuplicateMovements,
  safeUrl
} = require('./knowledgeMovementService');
const { snapshotContentHash } = require('./wikiRevisionService');
const { immutableDecisionHash, outcomeRecordHash } = require('./decisionMutationService');
const {
  validateBoundedClaimCandidate,
  __testables: { digest, retainedCandidateHash }
} = require('./wikiClaimDispositionService');

const IDS = {
  user: '64f100000000000000000001',
  otherUser: '64f100000000000000000002',
  article: '64f100000000000000000012',
  concept: '64f100000000000000000020',
  page: '64f100000000000000000030',
  event: '64f100000000000000000040',
  duplicateEvent: '64f100000000000000000041',
  revision: '64f100000000000000000050',
  duplicateRevision: '64f100000000000000000051'
};
IDS.question = '64f100000000000000000080';
IDS.forwardConnection = '64f100000000000000000081';
IDS.reciprocalConnection = '64f100000000000000000082';
const CLAIM_ID = 'qa-inference-cost-claim';

const baselineClaim = {
  claimId: CLAIM_ID,
  text: 'Hardware efficiency will drive most inference cost declines.',
  support: 'partial',
  sourceRefIds: ['64f100000000000000000031'],
  citationIds: ['64f100000000000000000034'],
  contradictedByCitationIds: [],
  epistemicStatus: 'plausible_hypothesis',
  materiality: 'major',
  checkInStatus: 'unreviewed'
};

const challengedClaim = {
  ...baselineClaim,
  support: 'conflicted',
  sourceRefIds: [...baselineClaim.sourceRefIds, '64f100000000000000000033'],
  contradictedByCitationIds: ['64f100000000000000000035']
};

const event = {
  _id: IDS.event,
  userId: IDS.user,
  sourceType: 'article',
  sourceObjectId: IDS.article,
  provider: 'reading-feed',
  externalId: 'qa-fixture-update-v1',
  eventType: 'updated',
  title: 'New inference-cost evidence',
  summary: 'Fixture-only source event.',
  url: 'https://example.com/qa-update',
  sourceUpdatedAt: '2026-07-27T15:00:00.000Z',
  createdAt: '2026-07-27T15:01:00.000Z',
  processedAt: '2026-07-27T15:02:00.000Z',
  status: 'processed',
  affectedPageIds: [IDS.page]
};

const revision = {
  _id: IDS.revision,
  userId: IDS.user,
  pageId: IDS.page,
  sourceEventId: IDS.event,
  promotionStatus: 'candidate',
  before: { claims: [baselineClaim] },
  after: { claims: [challengedClaim] },
  createdAt: '2026-07-27T15:03:00.000Z'
};

const page = {
  _id: IDS.page,
  userId: IDS.user,
  title: 'Inference economics',
  slug: 'inference-economics',
  status: 'draft',
  archived: false,
  hiddenFromHome: false,
  debugOnly: false,
  createdFrom: {
    type: 'concept',
    objectId: IDS.concept,
    label: 'Inference economics'
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

const clone = value => JSON.parse(JSON.stringify(value));

const completeAcceptedClaimProof = ({
  revisionId,
  acceptedBasis,
  completedAt = '2026-07-20T11:00:00.000Z',
  sourceEventId = ''
}) => {
  const before = clone(acceptedBasis);
  before.claims[0] = { ...before.claims[0], support: 'unsupported' };
  const revision = {
    _id: revisionId,
    userId: IDS.user,
    pageId: IDS.page,
    sourceEventId,
    actorType: 'agent',
    promotionStatus: 'promoted',
    before,
    after: clone(acceptedBasis),
    claimReview: {
      version: 1,
      scope: 'claim',
      targetClaimId: CLAIM_ID,
      state: 'accepted',
      conceptId: IDS.concept,
      bodyPatch: null,
      reviewedAt: completedAt,
      events: []
    }
  };
  const validation = validateBoundedClaimCandidate({ revision, page: before });
  revision.claimReview.basePageHash = snapshotContentHash(before);
  revision.claimReview.baseClaimHash = validation.baseClaimHash;
  revision.claimReview.proposedClaimHash = validation.proposedClaimHash;
  revision.claimReview.proposedClaim = clone(validation.proposedClaim);
  const receiptId = `wiki-claim-disposition:v1:${revisionId}:accept`;
  const note = 'Human owner accepted the decision basis claim.';
  revision.claimReview.events.push({ action: 'accept', at: completedAt, note, receiptId });
  const receipt = {
    userId: IDS.user,
    receiptId,
    kind: 'wiki_claim_disposition',
    source: 'wiki',
    status: 'completed',
    title: 'Accept claim revision',
    summary: note,
    completedAt,
    touched: [
      { type: 'wiki_page', id: IDS.page },
      { type: 'wiki_revision', id: revisionId }
    ],
    provenance: {
      version: 1,
      action: 'accept',
      revisionId,
      pageId: IDS.page,
      sourceEventId: revision.sourceEventId || '',
      maintenanceRunId: '',
      retainedCandidateHash: retainedCandidateHash(revision),
      claimId: CLAIM_ID,
      basePageHash: revision.claimReview.basePageHash,
      conceptId: IDS.concept,
      noteHash: digest(note),
      baseClaimHash: validation.baseClaimHash,
      proposedClaimHash: validation.proposedClaimHash,
      bodyPatch: null,
      deferredUntil: null
    }
  };
  revision.claimReview.receipt = clone(receipt);
  return { revision, receipt };
};

const completeDecisionAcceptanceProof = ({
  decision,
  acceptedRevision,
  acceptedReceipt,
  recordedRevisionId,
  recordedPage
}) => {
  const completedAt = decision.acceptedAt;
  return {
    revisions: [
      acceptedRevision,
      {
        _id: recordedRevisionId,
        userId: IDS.user,
        pageId: IDS.page,
        actorType: 'user',
        promotionStatus: 'promoted',
        before: acceptedRevision.after,
        after: clone(recordedPage)
      }
    ],
    receipts: [
      acceptedReceipt,
      {
        userId: IDS.user,
        receiptId: decision.receiptId,
        kind: 'wiki_decision_accepted',
        source: 'wiki',
        status: 'completed',
        completedAt,
        touched: [
          { type: 'wiki_page', id: IDS.page },
          { type: 'wiki_revision', id: acceptedRevision._id },
          { type: 'wiki_revision', id: recordedRevisionId }
        ],
        provenance: {
          version: 1,
          action: 'accept_decision',
          requestId: `qa-${decision.decisionId}`,
          pageId: IDS.page,
          decisionId: decision.decisionId,
          acceptedRevisionId: acceptedRevision._id,
          recordedRevisionId,
          acceptedRevisionDisposition: decision.acceptedRevisionDisposition,
          acceptedStatus: decision.status,
          immutableSnapshotHash: decision.immutableSnapshotHash,
          basisPageHash: decision.basisPageHash,
          relatedClaimIds: decision.relatedClaimIds,
          sourceRefIds: decision.sourceRefIds,
          reviewAt: decision.reviewAt,
          outcomeDueAt: decision.outcomeDueAt || null
        }
      }
    ]
  };
};

class Query {
  constructor(value) {
    this.value = value;
  }

  sort() { return this; }
  limit() { return this; }
  select() { return this; }
  lean() { return this; }
  then(resolve, reject) { return Promise.resolve(this.value).then(resolve, reject); }
}

const modelsFor = ({
  events = [event],
  revisions = [revision],
  pages = [page],
  concepts = [concept],
  receipts = [],
  articles = [{
    _id: IDS.article,
    userId: IDS.user,
    title: 'Owned source',
    archived: false,
    hiddenFromHome: false,
    debugOnly: false,
    highlights: []
  }],
  questions = [],
  connections = [],
  queries = []
} = {}) => ({
  WikiSourceEvent: {
    find(query) {
      queries.push({ model: 'WikiSourceEvent', query });
      return new Query(events);
    }
  },
  WikiRevision: {
    find(query) {
      queries.push({ model: 'WikiRevision', query });
      return new Query(revisions);
    }
  },
  WikiPage: {
    find(query) {
      queries.push({ model: 'WikiPage', query });
      return new Query(pages);
    }
  },
  NoeisReceipt: {
    find(query) {
      queries.push({ model: 'NoeisReceipt', query });
      return new Query(receipts);
    }
  },
  TagMeta: {
    find(query) {
      queries.push({ model: 'TagMeta', query });
      return new Query(concepts);
    }
  },
  Article: {
    find(query) {
      queries.push({ model: 'Article', query });
      return new Query(articles);
    },
    findOne: (query = {}) => new Query(
      articles.find(article => (
        (!query._id || String(article._id) === String(query._id))
        && (!query.userId || String(article.userId) === String(query.userId))
        && (!query['highlights._id'] || (article.highlights || []).some(
          highlight => String(highlight._id) === String(query['highlights._id'])
        ))
      )) || null
    )
  },
  NotebookEntry: { find: () => new Query([]) },
  Question: {
    find(query) {
      queries.push({ model: 'Question', query });
      return new Query(questions);
    },
    findOne: () => new Query(questions[0] || null)
  },
  Connection: {
    find(query) {
      queries.push({ model: 'Connection', query });
      return new Query(connections);
    }
  }
});

const run = async () => {
  const queries = [];
  const movements = await buildKnowledgeMovements({
    userId: IDS.user,
    models: modelsFor({ queries }),
    since: new Date('2026-07-27T00:00:00.000Z'),
    limit: 3
  });

  assert.strictEqual(movements.length, 1);
  assert.strictEqual(movements[0].kind, 'contradiction');
  assert.strictEqual(movements[0].materiality, 'major');
  assert.strictEqual(movements[0].reviewState, 'candidate');
  assert.match(movements[0].whyItMatters, /accepted view has not changed/i);
  assert.deepStrictEqual(movements[0].provenance.eventIds, [IDS.event]);
  assert.strictEqual(movements[0].subject.id, CLAIM_ID);
  assert.strictEqual(
    movements[0].nextAction.href,
    '/think?tab=concepts&concept=Inference+economics&conceptId=64f100000000000000000020&investigation=1&wikiPageId=64f100000000000000000030&revisionId=64f100000000000000000050&claimId=qa-inference-cost-claim'
  );
  assert.strictEqual(movements[0].nextAction.intent, 'investigate_movement');
  assert.strictEqual(movements[0].nextAction.label, 'Investigate in Think');
  assert.ok(queries.every(row => String(row.query.userId) === IDS.user));
  const conceptQuery = queries.find(row => row.model === 'TagMeta')?.query;
  assert.deepStrictEqual(conceptQuery, {
    userId: IDS.user,
    $or: [
      { _id: { $in: [IDS.concept] } },
      {
        'continuityAnchor.kind': 'wiki_investigation',
        'continuityAnchor.objectType': 'wiki_page',
        'continuityAnchor.objectId': { $in: [IDS.page] }
      }
    ],
    archived: { $ne: true },
    hiddenFromHome: { $ne: true },
    debugOnly: { $ne: true }
  });

  const encodedConcept = await buildKnowledgeMovements({
    userId: IDS.user,
    models: modelsFor({
      concepts: [{ ...concept, name: 'Costs & demand? #1 investigation=0 Ω' }]
    })
  });
  const encodedUrl = new URL(encodedConcept[0].nextAction.href, 'https://noeis.local');
  assert.strictEqual(encodedUrl.searchParams.get('concept'), 'Costs & demand? #1 investigation=0 Ω');
  assert.strictEqual(encodedUrl.searchParams.get('conceptId'), IDS.concept);
  assert.strictEqual(encodedUrl.searchParams.get('investigation'), '1');

  const anchored = await buildKnowledgeMovements({
    userId: IDS.user,
    models: modelsFor({
      pages: [{ ...page, createdFrom: { type: 'sources', objectIds: [IDS.article] } }],
      concepts: [{
        ...concept,
        continuityAnchor: {
          kind: 'wiki_investigation',
          objectType: 'wiki_page',
          objectId: IDS.page
        }
      }]
    })
  });
  assert.strictEqual(anchored[0].nextAction.intent, 'investigate_movement');
  assert.match(anchored[0].nextAction.href, new RegExp(`conceptId=${IDS.concept}`));

  const withoutConcept = await buildKnowledgeMovements({
    userId: IDS.user,
    models: modelsFor({ concepts: [] }),
    since: new Date('2026-07-27T00:00:00.000Z'),
    limit: 3
  });
  assert.strictEqual(
    withoutConcept[0].nextAction.href,
    '/wiki/workspace?page=64f100000000000000000030&claimId=qa-inference-cost-claim'
  );
  assert.strictEqual(withoutConcept[0].nextAction.intent, 'start_investigation');
  assert.strictEqual(withoutConcept[0].nextAction.wikiPageId, IDS.page);
  assert.strictEqual(withoutConcept[0].nextAction.revisionId, IDS.revision);
  assert.strictEqual(withoutConcept[0].nextAction.claimId, CLAIM_ID);

  for (const unavailableConcept of [
    { ...concept, userId: IDS.otherUser },
    { ...concept, hiddenFromHome: true },
    { ...concept, debugOnly: true },
    { ...concept, archived: true }
  ]) {
    const unavailable = await buildKnowledgeMovements({
      userId: IDS.user,
      models: modelsFor({ concepts: [unavailableConcept] })
    });
    assert.strictEqual(unavailable[0].affected.some(ref => ref.type === 'concept'), false);
    assert.strictEqual(unavailable[0].nextAction.intent, 'start_investigation');
  }

  const replay = await buildKnowledgeMovements({
    userId: IDS.user,
    models: modelsFor(),
    since: new Date('2026-07-27T00:00:00.000Z'),
    limit: 3
  });
  assert.deepStrictEqual(replay, movements);

  const duplicate = {
    ...event,
    _id: IDS.duplicateEvent
  };
  const duplicateRevision = {
    ...revision,
    _id: IDS.duplicateRevision,
    sourceEventId: IDS.duplicateEvent,
    createdAt: '2026-07-27T15:04:00.000Z'
  };
  const deduped = await buildKnowledgeMovements({
    userId: IDS.user,
    models: modelsFor({
      events: [event, duplicate],
      revisions: [revision, duplicateRevision]
    })
  });
  assert.strictEqual(deduped.length, 1);
  assert.deepStrictEqual(
    deduped[0].provenance.eventIds,
    [IDS.event, IDS.duplicateEvent]
  );

  const acceptedClaim = {
    ...baselineClaim,
    text: 'Software and utilization now drive more of the near-term decline.',
    support: 'supported',
    epistemicStatus: 'supported_interpretation',
    history: [{
      at: '2026-07-27T15:02:30.000Z',
      disposition: 'accepted',
      actorType: 'user'
    }]
  };
  const accepted = await buildKnowledgeMovements({
    userId: IDS.user,
    models: modelsFor({
      revisions: [{
        ...revision,
        actorType: 'agent',
        promotionStatus: 'promoted',
        after: { claims: [acceptedClaim] }
      }],
      receipts: [{
        _id: '64f100000000000000000060',
        userId: IDS.user,
        kind: 'company_dossier_maintenance_accepted',
        status: 'completed',
        completedAt: '2026-07-27T15:05:00.000Z',
        provenance: { candidateRevisionId: IDS.revision }
      }]
    })
  });
  assert.strictEqual(accepted[0].kind, 'claim_changed');
  assert.strictEqual(accepted[0].reviewState, 'current');
  assert.strictEqual(accepted[0].occurredAt, '2026-07-27T15:05:00.000Z');

  const exactAcceptedClaim = {
    ...baselineClaim,
    text: 'Human-reviewed utilization evidence now changes the accepted claim.',
    support: 'partial'
  };
  const exactAcceptance = completeAcceptedClaimProof({
    revisionId: '64f100000000000000000062',
    sourceEventId: IDS.event,
    completedAt: '2026-07-27T15:07:00.000Z',
    acceptedBasis: {
      title: page.title,
      plainText: exactAcceptedClaim.text,
      claims: [exactAcceptedClaim],
      sourceRefs: [{
        _id: baselineClaim.sourceRefIds[0],
        type: 'article',
        objectId: IDS.article,
        title: 'Accepted claim evidence'
      }],
      citations: [{
        _id: baselineClaim.citationIds[0],
        sourceRefId: baselineClaim.sourceRefIds[0]
      }],
      judgment: { decisions: [] }
    }
  });
  const exactAcceptedMovement = await buildKnowledgeMovements({
    userId: IDS.user,
    models: modelsFor({
      revisions: [exactAcceptance.revision],
      receipts: [exactAcceptance.receipt]
    })
  });
  assert.strictEqual(exactAcceptedMovement.length, 1);
  assert.strictEqual(exactAcceptedMovement[0].kind, 'claim_changed');
  assert.strictEqual(exactAcceptedMovement[0].reviewState, 'current');
  assert.strictEqual(exactAcceptedMovement[0].occurredAt, '2026-07-27T15:07:00.000Z');

  const corruptExactAcceptance = await buildKnowledgeMovements({
    userId: IDS.user,
    models: modelsFor({
      revisions: [exactAcceptance.revision],
      receipts: [{ ...exactAcceptance.receipt, summary: 'Rebound receipt' }]
    })
  });
  assert.deepStrictEqual(corruptExactAcceptance, []);

  const mismatchedEventPage = await buildKnowledgeMovements({
    userId: IDS.user,
    models: modelsFor({
      events: [{ ...event, affectedPageIds: ['64f100000000000000000099'] }]
    })
  });
  assert.deepStrictEqual(mismatchedEventPage, []);

  const lateAcceptanceQueries = [];
  const lateAcceptance = await buildKnowledgeMovements({
    userId: IDS.user,
    since: new Date('2026-07-27T15:04:00.000Z'),
    models: modelsFor({
      queries: lateAcceptanceQueries,
      revisions: [{
        ...revision,
        actorType: 'agent',
        promotionStatus: 'promoted',
        createdAt: '2026-07-27T15:03:00.000Z',
        after: { claims: [acceptedClaim] }
      }],
      receipts: [{
        _id: '64f100000000000000000061',
        userId: IDS.user,
        kind: 'company_dossier_maintenance_accepted',
        status: 'completed',
        completedAt: '2026-07-27T15:06:00.000Z',
        provenance: { candidateRevisionId: IDS.revision }
      }]
    })
  });
  assert.strictEqual(lateAcceptance.length, 1);
  assert.strictEqual(lateAcceptance[0].kind, 'claim_changed');
  assert.strictEqual(lateAcceptance[0].occurredAt, '2026-07-27T15:06:00.000Z');
  const lateRevisionQueries = lateAcceptanceQueries
    .filter(row => row.model === 'WikiRevision')
    .map(row => row.query);
  assert.strictEqual(lateRevisionQueries.length, 2);
  assert.deepStrictEqual(lateRevisionQueries[1]._id, { $in: [IDS.revision] });

  const automaticPromotion = await buildKnowledgeMovements({
    userId: IDS.user,
    models: modelsFor({
      revisions: [{
        ...revision,
        actorType: 'agent',
        promotionStatus: 'promoted',
        after: { claims: [acceptedClaim] }
      }]
    })
  });
  assert.deepStrictEqual(automaticPromotion, []);

  const evidenceOnlyClaim = {
    ...baselineClaim,
    sourceRefIds: [...baselineClaim.sourceRefIds, '64f100000000000000000099']
  };
  const evidenceOnly = await buildKnowledgeMovements({
    userId: IDS.user,
    models: modelsFor({
      revisions: [{
        ...revision,
        after: { claims: [evidenceOnlyClaim] }
      }]
    })
  });
  assert.strictEqual(evidenceOnly[0].kind, 'new_evidence');

  const secondBaselineClaim = {
    ...baselineClaim,
    claimId: 'qa-second-claim',
    text: 'Utilization will remain the binding constraint.'
  };
  const secondChallengedClaim = {
    ...secondBaselineClaim,
    support: 'conflicted',
    contradictedByCitationIds: ['64f100000000000000000099']
  };
  const siblingMovements = await buildKnowledgeMovements({
    userId: IDS.user,
    models: modelsFor({
      revisions: [{
        ...revision,
        before: { claims: [baselineClaim, secondBaselineClaim] },
        after: { claims: [challengedClaim, secondChallengedClaim] }
      }]
    }),
    limit: 10
  });
  const episodes = buildKnowledgeMovementEpisodes(siblingMovements);
  assert.strictEqual(siblingMovements.length, 2);
  assert.strictEqual(new Set(siblingMovements.map(item => item.episodeId)).size, 1);
  assert.strictEqual(episodes.length, 1);
  assert.strictEqual(episodes[0].subjects.length, 2);
  assert.match(episodes[0].title, /affected 2 claims/i);
  assert.strictEqual(episodes[0].provenance.revisionIds.length, 1);
  assert.match(episodes[0].nextAction.href, /conceptId=64f100000000000000000020/);
  assert.doesNotMatch(episodes[0].nextAction.href, /claimId=/);
  assert.strictEqual(episodes[0].affected.filter(ref => ref.type === 'concept').length, 1);
  const reversedEpisodes = buildKnowledgeMovementEpisodes([...siblingMovements].reverse());
  assert.deepStrictEqual(reversedEpisodes[0].nextAction, episodes[0].nextAction);

  const exactEvidence = await buildKnowledgeMovements({
    userId: IDS.user,
    models: modelsFor({
      revisions: [{
        ...revision,
        after: {
          claims: [evidenceOnlyClaim],
          sourceRefs: [{
            _id: '64f100000000000000000099',
            type: 'article',
            objectId: IDS.article,
            title: 'Exact attached evidence',
            url: 'https://example.com/exact-evidence'
          }]
        }
      }]
    })
  });
  assert.strictEqual(exactEvidence[0].evidence[0].title, 'Exact attached evidence');
  assert.strictEqual(
    exactEvidence[0].evidence[0].href,
    `/library?articleId=${IDS.article}`
  );
  assert.strictEqual(
    exactEvidence[0].evidence[0].sourceUrl,
    'https://example.com/exact-evidence'
  );

  const citationOnlyEvidence = await buildKnowledgeMovements({
    userId: IDS.user,
    models: modelsFor({
      revisions: [{
        ...revision,
        after: {
          claims: [{
            ...baselineClaim,
            citationIds: [...baselineClaim.citationIds, '64f100000000000000000088']
          }],
          citations: [{
            _id: '64f100000000000000000088',
            sourceType: 'article',
            sourceObjectId: IDS.article,
            sourceTitle: 'Citation-only exact evidence',
            url: 'https://example.com/citation-only'
          }]
        }
      }]
    })
  });
  assert.strictEqual(citationOnlyEvidence[0].evidence[0].title, 'Citation-only exact evidence');
  assert.strictEqual(
    citationOnlyEvidence[0].evidence[0].href,
    `/library?articleId=${IDS.article}`
  );

  const missingAttachedSourceId = '64f100000000000000000098';
  const missingAttachedSource = await buildKnowledgeMovements({
    userId: IDS.user,
    models: modelsFor({
      revisions: [{
        ...revision,
        after: {
          claims: [{
            ...baselineClaim,
            sourceRefIds: [...baselineClaim.sourceRefIds, missingAttachedSourceId]
          }],
          sourceRefs: [{
            _id: missingAttachedSourceId,
            type: 'article',
            objectId: missingAttachedSourceId,
            title: 'Missing attached source'
          }]
        }
      }]
    })
  });
  assert.strictEqual(missingAttachedSource.length, 1);
  assert.strictEqual(
    missingAttachedSource[0].evidence[0].id,
    IDS.article,
    'an unresolved attached source must fall back to the verified owned source event'
  );

  for (const externalEvent of [
    {
      ...event,
      sourceType: 'external',
      sourceObjectId: null,
      provider: 'github-repo',
      externalId: 'github-doc:atsokolas/note-taker-3:abc123:README.md:def456',
      url: 'https://github.com/atsokolas/note-taker-3/blob/abc123/README.md'
    },
    {
      ...event,
      sourceType: 'external',
      sourceObjectId: null,
      provider: 'sec-edgar',
      externalId: 'sec-filing:0000320193:10-K:2026-01-30',
      url: 'https://www.sec.gov/Archives/edgar/data/320193/example.htm'
    }
  ]) {
    const externalModels = modelsFor({ events: [externalEvent] });
    externalModels.NotebookEntry.findOne = () => {
      throw new Error('externalId must not be cast as a NotebookEntry ObjectId');
    };
    const externalMovement = await buildKnowledgeMovements({
      userId: IDS.user,
      models: externalModels
    });
    assert.strictEqual(externalMovement.length, 1);
    assert.strictEqual(externalMovement[0].kind, 'contradiction');
    assert.strictEqual(externalMovement[0].evidence[0].id, externalEvent.externalId);
    assert.strictEqual(externalMovement[0].evidence[0].sourceUrl, externalEvent.url);
  }

  for (const [label, externalEvent] of [
    ['foreign owner', { userId: IDS.otherUser }],
    ['blank provider', { provider: '' }],
    ['blank external id', { externalId: '' }],
    ['blank URL', { url: '' }],
    ['unsafe scheme', { url: 'javascript:alert(1)' }],
    ['localhost URL', { url: 'http://localhost:5500/private' }],
    ['private host URL', { url: 'http://192.168.1.5/private' }],
    ['mapped loopback IPv6 URL', { url: 'http://[::ffff:127.0.0.1]/private' }],
    ['mapped private IPv6 URL', { url: 'http://[::ffff:c0a8:101]/private' }],
    ['credentialed URL', { url: 'https://user:secret@example.com/private' }],
    ['wrong page', { affectedPageIds: ['64f100000000000000000099'] }]
  ]) {
    const externalMovement = await buildKnowledgeMovements({
      userId: IDS.user,
      models: modelsFor({
        events: [{
          ...event,
          sourceType: 'external',
          sourceObjectId: null,
          provider: 'github-repo',
          externalId: 'github-doc:unsafe',
          url: 'https://github.com/atsokolas/note-taker-3',
          ...externalEvent
        }]
      })
    });
    assert.deepStrictEqual(externalMovement, [], `external evidence must fail closed: ${label}`);
  }

  for (const [label, articles] of [
    ['missing internal source', []],
    ['foreign internal source', [{ _id: IDS.article, userId: IDS.otherUser }]],
    ['archived internal source', [{ _id: IDS.article, userId: IDS.user, archived: true }]],
    ['hidden internal source', [{ _id: IDS.article, userId: IDS.user, hiddenFromHome: true }]],
    ['debug internal source', [{ _id: IDS.article, userId: IDS.user, debugOnly: true }]]
  ]) {
    const internalMovement = await buildKnowledgeMovements({
      userId: IDS.user,
      models: modelsFor({ articles })
    });
    assert.deepStrictEqual(internalMovement, [], `internal evidence must fail closed: ${label}`);
  }

  const evidenceRemoval = await buildKnowledgeMovements({
    userId: IDS.user,
    models: modelsFor({
      revisions: [{
        ...revision,
        before: { claims: [evidenceOnlyClaim] },
        after: { claims: [baselineClaim] }
      }]
    })
  });
  assert.deepStrictEqual(evidenceRemoval, []);

  const oldEventNewRevision = await buildKnowledgeMovements({
    userId: IDS.user,
    since: new Date('2026-07-27T15:02:00.000Z'),
    models: modelsFor({
      events: [{ ...event, createdAt: '2026-07-20T15:01:00.000Z' }]
    })
  });
  assert.strictEqual(oldEventNewRevision.length, 1);

  const rawEventOnly = await buildKnowledgeMovements({
    userId: IDS.user,
    models: modelsFor({ revisions: [] })
  });
  assert.deepStrictEqual(rawEventOnly, []);

  const reviewedAt = '2026-07-27T16:00:00.000Z';
  const questionCandidateEvent = {
    ...event,
    metadata: {
      ingestReviewedAt: reviewedAt,
      candidateUpdates: [{
        id: 'question-candidate-1',
        targetType: 'question',
        objectId: IDS.question,
        status: 'accepted',
        reviewAction: 'accept',
        reviewedAt,
        graphTrace: {
          bidirectional: true,
          relationType: 'supports',
          reciprocalRelationType: 'supported_by',
          source: { type: 'article', id: IDS.article },
          target: { type: 'question', id: IDS.question },
          forwardId: IDS.forwardConnection,
          reciprocalId: IDS.reciprocalConnection
        }
      }]
    }
  };
  const openQuestion = {
    _id: IDS.question,
    userId: IDS.user,
    text: 'Will utilization remain the binding inference constraint?',
    status: 'open',
    archived: false,
    hiddenFromHome: false,
    debugOnly: false
  };
  const exactConnections = [{
    _id: IDS.forwardConnection,
    userId: IDS.user,
    fromType: 'article',
    fromId: IDS.article,
    toType: 'question',
    toId: IDS.question,
    relationType: 'supports'
  }, {
    _id: IDS.reciprocalConnection,
    userId: IDS.user,
    fromType: 'question',
    fromId: IDS.question,
    toType: 'article',
    toId: IDS.article,
    relationType: 'supported_by'
  }];
  const answerable = await buildKnowledgeMovements({
    userId: IDS.user,
    since: new Date('2026-07-27T15:30:00.000Z'),
    models: modelsFor({
      events: [questionCandidateEvent],
      revisions: [],
      questions: [openQuestion],
      connections: exactConnections,
      articles: [{
        _id: IDS.article, userId: IDS.user, title: 'Owned source', archived: false,
        hiddenFromHome: false, debugOnly: false, highlights: []
      }]
    })
  });
  assert.strictEqual(answerable.length, 1);
  assert.strictEqual(answerable[0].kind, 'question_answerable');
  assert.strictEqual(answerable[0].occurredAt, reviewedAt);
  assert.strictEqual(answerable[0].subject.id, IDS.question);
  assert.strictEqual(answerable[0].evidence[0].id, IDS.article);
  assert.match(answerable[0].whyItMatters, /has not inferred that the question is answered/i);
  assert.strictEqual(answerable[0].nextAction.href, `/think?tab=questions&questionId=${IDS.question}`);

  const notAnswerable = async ({ eventOverride = {}, questionOverride = {}, connections = exactConnections } = {}) => (
    buildKnowledgeMovements({
      userId: IDS.user,
      models: modelsFor({
        events: [{ ...questionCandidateEvent, ...eventOverride }],
        revisions: [],
        questions: [{ ...openQuestion, ...questionOverride }],
        connections,
        articles: [{ _id: IDS.article, userId: IDS.user, highlights: [] }]
      })
    })
  );
  assert.deepStrictEqual(await notAnswerable({ questionOverride: { status: 'answered' } }), []);
  assert.deepStrictEqual(await notAnswerable({ connections: exactConnections.slice(0, 1) }), []);
  assert.deepStrictEqual(await notAnswerable({
    eventOverride: {
      metadata: {
        ...questionCandidateEvent.metadata,
        candidateUpdates: [{
          ...questionCandidateEvent.metadata.candidateUpdates[0],
          status: 'deferred',
          reviewAction: 'defer'
        }]
      }
    }
  }), []);
  const afterQuestionCursor = await buildKnowledgeMovements({
    userId: IDS.user,
    since: new Date(reviewedAt),
    models: modelsFor({
      events: [questionCandidateEvent], revisions: [], questions: [openQuestion],
      connections: exactConnections,
      articles: [{ _id: IDS.article, userId: IDS.user, highlights: [] }]
    })
  });
  assert.deepStrictEqual(afterQuestionCursor, []);

  const connectionReceipt = {
    _id: '64f100000000000000000083',
    userId: IDS.user,
    receiptId: `connection_created:v1:${IDS.forwardConnection}`,
    kind: 'connection_created',
    source: 'connections',
    status: 'completed',
    completedAt: '2026-07-27T16:30:00.000Z',
    touched: [
      { type: 'article', id: IDS.article, title: 'Inference architecture note' },
      { type: 'question', id: IDS.question, title: 'Can this evidence answer the question?' }
    ],
    provenance: {
      version: 1,
      actorType: 'user',
      forwardConnectionId: IDS.forwardConnection,
      reciprocalConnectionId: IDS.reciprocalConnection,
      fromType: 'article',
      fromId: IDS.article,
      toType: 'question',
      toId: IDS.question,
      relationType: 'supports',
      reciprocalRelationType: 'supported_by',
      scopeType: '',
      scopeId: ''
    }
  };
  const formed = await buildKnowledgeMovements({
    userId: IDS.user,
    models: modelsFor({
      events: [],
      revisions: [],
      receipts: [connectionReceipt],
      connections: exactConnections,
      questions: [openQuestion],
      articles: [{
        _id: IDS.article, userId: IDS.user, title: 'Inference architecture note',
        archived: false, hiddenFromHome: false, debugOnly: false, highlights: []
      }]
    })
  });
  assert.strictEqual(formed.length, 1);
  assert.strictEqual(formed[0].kind, 'connection_formed');
  assert.strictEqual(formed[0].subject.id, IDS.article);
  assert.strictEqual(formed[0].affected[0].id, IDS.question);
  assert.strictEqual(formed[0].evidence[0].id, IDS.article);
  assert.match(formed[0].whyItMatters, /explicitly connected/i);

  const staleConnection = await buildKnowledgeMovements({
    userId: IDS.user,
    models: modelsFor({
      events: [], revisions: [], receipts: [connectionReceipt],
      connections: exactConnections.slice(0, 1), questions: [openQuestion],
      articles: [{ _id: IDS.article, userId: IDS.user, title: 'Source', highlights: [] }]
    })
  });
  assert.deepStrictEqual(staleConnection, []);

  for (const corruptReceipt of [
    { ...connectionReceipt, source: 'maintenance' },
    { ...connectionReceipt, receiptId: 'connection_created:v1:wrong-forward' },
    { ...connectionReceipt, completedAt: 'not-a-date' },
    { ...connectionReceipt, touched: connectionReceipt.touched.slice(0, 1) },
    { ...connectionReceipt, provenance: { ...connectionReceipt.provenance, version: 2 } },
    { ...connectionReceipt, provenance: { ...connectionReceipt.provenance, actorType: 'agent' } }
  ]) {
    const corruptConnection = await buildKnowledgeMovements({
      userId: IDS.user,
      models: modelsFor({
        events: [], revisions: [], receipts: [corruptReceipt],
        connections: exactConnections, questions: [openQuestion],
        articles: [{ _id: IDS.article, userId: IDS.user, title: 'Source', highlights: [] }]
      })
    });
    assert.deepStrictEqual(corruptConnection, []);
  }

  const rawGraphOnly = await buildKnowledgeMovements({
    userId: IDS.user,
    models: modelsFor({
      events: [], revisions: [], receipts: [], connections: exactConnections,
      questions: [openQuestion],
      articles: [{ _id: IDS.article, userId: IDS.user, title: 'Source', highlights: [] }]
    })
  });
  assert.deepStrictEqual(rawGraphOnly, []);

  const decisionAcceptedRevisionId = '64f100000000000000000070';
  const decisionRecordedRevisionId = '64f100000000000000000071';
  const decisionSourceRefId = '64f100000000000000000072';
  const decisionBasis = {
    title: page.title,
    plainText: baselineClaim.text,
    claims: [baselineClaim],
    sourceRefs: [
      { _id: baselineClaim.sourceRefIds[0], type: 'article', objectId: IDS.article, title: 'Claim evidence' },
      { _id: decisionSourceRefId, type: 'article', objectId: IDS.article, title: 'Owned decision evidence' }
    ],
    citations: [{ _id: baselineClaim.citationIds[0], sourceRefId: baselineClaim.sourceRefIds[0] }],
    judgment: { decisions: [] }
  };
  const dueDecision = {
    decisionId: 'decision_due_fixture',
    decisionType: 'research',
    summary: 'Review the accepted inference-cost decision.',
    rationale: 'The accepted claim established a bounded review.',
    expectedOutcome: 'Observe whether the mechanism still holds.',
    successCriteria: ['One measured observation'],
    status: 'taken',
    decidedAt: '2026-07-20T12:00:00.000Z',
    reviewAt: '2026-07-30T12:00:00.000Z',
    relatedClaimIds: [CLAIM_ID],
    sourceRefIds: [decisionSourceRefId],
    acceptedRevisionId: decisionAcceptedRevisionId,
    acceptedRevisionDisposition: 'accepted',
    recordedRevisionId: decisionRecordedRevisionId,
    acceptedAt: '2026-07-20T12:00:00.000Z',
    acceptedBy: 'user',
    basisPageHash: snapshotContentHash(decisionBasis),
    receiptId: 'decision-due-receipt',
    createdAt: '2026-07-20T12:00:00.000Z',
    createdBy: 'user',
    outcome: { result: 'unknown', processScore: null }
  };
  dueDecision.immutableSnapshotHash = immutableDecisionHash(dueDecision);
  const duePage = {
    ...page,
    plainText: baselineClaim.text,
    claims: [baselineClaim],
    sourceRefs: decisionBasis.sourceRefs,
    judgment: { governingQuestion: 'What drives inference costs?', currentJudgment: baselineClaim.text, decisions: [dueDecision] }
  };
  const decisionBasisProof = completeAcceptedClaimProof({
    revisionId: decisionAcceptedRevisionId,
    acceptedBasis: decisionBasis
  });
  const dueDecisionProof = completeDecisionAcceptanceProof({
    decision: dueDecision,
    acceptedRevision: decisionBasisProof.revision,
    acceptedReceipt: decisionBasisProof.receipt,
    recordedRevisionId: decisionRecordedRevisionId,
    recordedPage: duePage
  });
  const dueMovements = await buildKnowledgeMovements({
    userId: IDS.user,
    models: modelsFor({
      events: [],
      pages: [duePage],
      revisions: dueDecisionProof.revisions,
      receipts: dueDecisionProof.receipts,
      articles: [{ _id: IDS.article, userId: IDS.user, title: 'Owned decision evidence', highlights: [] }]
    })
  });
  assert.strictEqual(dueMovements.length, 1);
  assert.strictEqual(dueMovements[0].kind, 'decision_due');
  assert.strictEqual(dueMovements[0].nextAction.intent, 'review_decision');
  assert.strictEqual(dueMovements[0].subject.id, dueDecision.decisionId);
  assert.match(dueMovements[0].whyItMatters, /human owner/i);
  assert.deepStrictEqual(dueMovements[0].provenance.revisionIds, [decisionAcceptedRevisionId, decisionRecordedRevisionId]);

  const outcomeDueDecision = {
    ...dueDecision,
    outcomeDueAt: '2026-07-29T15:30:00.000Z'
  };
  outcomeDueDecision.immutableSnapshotHash = immutableDecisionHash(outcomeDueDecision);
  const outcomeDuePage = {
    ...duePage,
    judgment: { ...duePage.judgment, decisions: [outcomeDueDecision] }
  };
  const outcomeDueProof = completeDecisionAcceptanceProof({
    decision: outcomeDueDecision,
    acceptedRevision: decisionBasisProof.revision,
    acceptedReceipt: decisionBasisProof.receipt,
    recordedRevisionId: decisionRecordedRevisionId,
    recordedPage: outcomeDuePage
  });
  const outcomeDueMovements = await buildKnowledgeMovements({
    userId: IDS.user,
    models: modelsFor({
      events: [],
      pages: [outcomeDuePage],
      revisions: outcomeDueProof.revisions,
      receipts: outcomeDueProof.receipts,
      articles: [{ _id: IDS.article, userId: IDS.user, title: 'Owned decision evidence', highlights: [] }]
    })
  });
  assert.strictEqual(outcomeDueMovements.length, 1);
  assert.strictEqual(outcomeDueMovements[0].kind, 'outcome_due');
  assert.strictEqual(outcomeDueMovements[0].nextAction.intent, 'review_decision');
  assert.strictEqual(outcomeDueMovements[0].nextAction.label, 'Record outcome');
  assert.match(outcomeDueMovements[0].whyItMatters, /has not inferred a result/i);
  assert.ok(outcomeDueMovements[0].provenance.deterministicFacts.includes(
    'Human-set outcome date: 2026-07-29T15:30:00.000Z'
  ));

  const outcomeRevisionId = '64f100000000000000000063';
  const outcomeReceiptId = 'decision-outcome-receipt';
  const reviewedDecision = {
    ...outcomeDueDecision,
    status: 'reviewed',
    outcome: {
      observedAt: '2026-07-30T14:00:00.000Z',
      summary: 'Inference cost declined within the bounded observation window.',
      result: 'positive',
      processScore: 0.8,
      calibrationNote: 'The mechanism held, but software gains contributed more than expected.',
      lesson: 'Track software and hardware contributions separately.',
      evidenceSourceRefIds: [decisionSourceRefId],
      reviewedAt: '2026-07-31T14:00:00.000Z',
      reviewedBy: 'user',
      revisionId: outcomeRevisionId,
      receiptId: outcomeReceiptId,
      decisionSnapshotHash: outcomeDueDecision.immutableSnapshotHash
    }
  };
  reviewedDecision.outcome.recordHash = outcomeRecordHash(reviewedDecision.outcome);
  const reviewedPage = {
    ...duePage,
    judgment: { ...duePage.judgment, decisions: [reviewedDecision] }
  };
  const reviewedOutcomeRevision = {
    _id: outcomeRevisionId,
    userId: IDS.user,
    pageId: IDS.page,
    actorType: 'user',
    promotionStatus: 'promoted',
    before: clone(outcomeDuePage),
    after: clone(reviewedPage)
  };
  const reviewedOutcomeReceipt = {
    userId: IDS.user,
    receiptId: outcomeReceiptId,
    kind: 'wiki_decision_outcome_recorded',
    source: 'wiki',
    status: 'completed',
    completedAt: reviewedDecision.outcome.reviewedAt,
    touched: [
      { type: 'wiki_page', id: IDS.page },
      { type: 'wiki_revision', id: outcomeRevisionId }
    ],
    provenance: {
      version: 1,
      action: 'record_outcome',
      pageId: IDS.page,
      decisionId: reviewedDecision.decisionId,
      revisionId: outcomeRevisionId,
      acceptedRevisionId: decisionAcceptedRevisionId,
      decisionSnapshotHash: reviewedDecision.immutableSnapshotHash,
      payloadHash: reviewedDecision.outcome.recordHash,
      evidenceSourceRefIds: reviewedDecision.outcome.evidenceSourceRefIds
    }
  };
  const reviewedModels = modelsFor({
    events: [],
    pages: [reviewedPage],
    revisions: [...outcomeDueProof.revisions, reviewedOutcomeRevision],
    receipts: [...outcomeDueProof.receipts, reviewedOutcomeReceipt],
    articles: [{ _id: IDS.article, userId: IDS.user, title: 'Owned decision evidence', highlights: [] }]
  });
  const reviewedMovements = await buildKnowledgeMovements({
    userId: IDS.user,
    models: reviewedModels,
    asOf: new Date('2026-07-31T15:00:00.000Z')
  });
  assert.strictEqual(reviewedMovements.length, 1);
  assert.strictEqual(reviewedMovements[0].kind, 'outcome_reviewed');
  assert.strictEqual(reviewedMovements[0].occurredAt, '2026-07-31T14:00:00.000Z');
  assert.strictEqual(reviewedMovements[0].nextAction.label, 'Open reviewed outcome');
  assert.strictEqual(reviewedMovements[0].nextAction.intent, 'open_reviewed_outcome');
  assert.deepStrictEqual(reviewedMovements[0].unresolved, []);
  assert.deepStrictEqual(reviewedMovements[0].reviewedOutcome, {
    result: 'positive',
    summary: 'Inference cost declined within the bounded observation window.',
    processScore: 0.8,
    calibrationNote: 'The mechanism held, but software gains contributed more than expected.',
    lesson: 'Track software and hardware contributions separately.',
    observedAt: '2026-07-30T14:00:00.000Z',
    reviewedAt: '2026-07-31T14:00:00.000Z'
  });
  assert.deepStrictEqual(reviewedMovements[0].provenance.revisionIds, [
    decisionAcceptedRevisionId, decisionRecordedRevisionId, outcomeRevisionId
  ].sort());
  assert.match(reviewedMovements[0].whyItMatters, /human owner recorded/i);
  assert.deepStrictEqual(await buildKnowledgeMovements({
    userId: IDS.user,
    models: reviewedModels,
    since: new Date('2026-07-31T14:00:00.000Z'),
    asOf: new Date('2026-07-31T15:00:00.000Z')
  }), []);

  const unverifiedReviewedPage = JSON.parse(JSON.stringify(reviewedPage));
  unverifiedReviewedPage.judgment.decisions[0].outcome.lesson = 'Tampered lesson.';
  const unverifiedReviewedMovements = await buildKnowledgeMovements({
    userId: IDS.user,
    models: modelsFor({
      events: [], pages: [unverifiedReviewedPage],
      revisions: reviewedModels.WikiRevision.find().value,
      receipts: reviewedModels.NoeisReceipt.find().value,
      articles: [{ _id: IDS.article, userId: IDS.user, title: 'Owned decision evidence', highlights: [] }]
    }),
    asOf: new Date('2026-07-31T15:00:00.000Z')
  });
  assert.deepStrictEqual(unverifiedReviewedMovements, []);

  const futureDecision = { ...dueDecision, reviewAt: '2099-07-30T12:00:00.000Z' };
  futureDecision.immutableSnapshotHash = immutableDecisionHash(futureDecision);
  const futurePage = { ...duePage, judgment: { ...duePage.judgment, decisions: [futureDecision] } };
  const futureProof = completeDecisionAcceptanceProof({
    decision: futureDecision,
    acceptedRevision: decisionBasisProof.revision,
    acceptedReceipt: decisionBasisProof.receipt,
    recordedRevisionId: decisionRecordedRevisionId,
    recordedPage: futurePage
  });
  const futureMovements = await buildKnowledgeMovements({
    userId: IDS.user,
    models: modelsFor({
      events: [], pages: [futurePage],
      revisions: futureProof.revisions,
      receipts: futureProof.receipts,
      articles: [{ _id: IDS.article, userId: IDS.user, title: 'Owned decision evidence', highlights: [] }]
    })
  });
  assert.deepStrictEqual(futureMovements, []);
  const tamperedDuePage = JSON.parse(JSON.stringify(duePage));
  tamperedDuePage.judgment.decisions[0].rationale = 'Tampered after acceptance.';
  const tamperedDueMovements = await buildKnowledgeMovements({
    userId: IDS.user,
    models: modelsFor({
      events: [], pages: [tamperedDuePage],
      revisions: dueDecisionProof.revisions,
      receipts: dueDecisionProof.receipts,
      articles: [{ _id: IDS.article, userId: IDS.user, title: 'Owned decision evidence', highlights: [] }]
    })
  });
  assert.deepStrictEqual(tamperedDueMovements, []);

  const rejected = await buildKnowledgeMovements({
    userId: IDS.user,
    models: modelsFor({ revisions: [{ ...revision, promotionStatus: 'rejected' }] })
  });
  assert.deepStrictEqual(rejected, []);

  const retired = await buildKnowledgeMovements({
    userId: IDS.user,
    models: modelsFor({
      revisions: [{
        ...revision,
        after: { claims: [{ ...challengedClaim, checkInStatus: 'retired' }] }
      }]
    })
  });
  assert.deepStrictEqual(retired, []);

  const contextOnly = await buildKnowledgeMovements({
    userId: IDS.user,
    models: modelsFor({
      revisions: [{
        ...revision,
        after: { claims: [{ ...challengedClaim, materiality: 'context' }] }
      }]
    })
  });
  assert.deepStrictEqual(contextOnly, []);

  const hiddenPage = await buildKnowledgeMovements({
    userId: IDS.user,
    models: modelsFor({ pages: [] })
  });
  assert.deepStrictEqual(hiddenPage, []);

  const crossUserPage = await buildKnowledgeMovements({
    userId: IDS.user,
    models: modelsFor({ pages: [{ ...page, userId: IDS.otherUser }] })
  });
  assert.deepStrictEqual(crossUserPage, []);

  const qualityBlockedPage = await buildKnowledgeMovements({
    userId: IDS.user,
    models: modelsFor({
      pages: [{
        ...page,
        aiState: { quality: { ok: false, status: 'fail' } }
      }]
    })
  });
  assert.deepStrictEqual(qualityBlockedPage, []);

  const pruned = await buildKnowledgeMovements({
    userId: IDS.user,
    models: modelsFor({
      revisions: [{ ...revision, snapshotPrunedAt: '2026-07-27T16:00:00.000Z' }]
    })
  });
  assert.deepStrictEqual(pruned, []);

  assert.strictEqual(diffClaimState(revision).length, 1);
  assert.strictEqual(diffClaimState(revision)[0].contradiction, true);
  assert.strictEqual(safeUrl('javascript:alert(1)'), '');
  assert.strictEqual(safeUrl('https://example.com/a'), 'https://example.com/a');
  assert.strictEqual(mergeDuplicateMovements([]).length, 0);

  console.log('knowledgeMovementService tests passed');
};

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
