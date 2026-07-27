const assert = require('assert');
const {
  ConceptInvestigationError,
  buildConceptInvestigation
} = require('./conceptInvestigationService');
const {
  payloadHash: adoptionPayloadHash,
  stableReceiptId: adoptionReceiptId
} = require('./conceptDecisionLessonAdoptionService');
const {
  createConceptInvestigationFixture
} = require('../fixtures/conceptInvestigationFixture');

class Query {
  constructor(value) {
    this.value = value;
  }
  lean() { return this; }
  then(resolve, reject) {
    return Promise.resolve(this.value).then(resolve, reject);
  }
}

const query = value => new Query(value);
const idsIn = condition => (
  Array.isArray(condition?.$in)
    ? new Set(condition.$in.map(value => String(value)))
    : new Set()
);

const modelsFor = ({
  fixture,
  concept = fixture.concept,
  page = fixture.currentWiki.page,
  revision = fixture.candidateRevision,
  includeForeignArticle = true
}) => {
  const calls = [];
  const models = {
    TagMeta: {
      findOne: filter => {
        calls.push({ model: 'TagMeta', method: 'findOne', filter });
        return query(concept);
      }
    },
    WikiPage: {
      findOne: filter => {
        calls.push({ model: 'WikiPage', method: 'findOne', filter });
        return query(page);
      }
    },
    WikiRevision: {
      findOne: filter => {
        calls.push({ model: 'WikiRevision', method: 'findOne', filter });
        return query(revision);
      }
    },
    Article: {
      find: filter => {
        calls.push({ model: 'Article', method: 'find', filter });
        const articleIds = idsIn(filter?.$or?.[0]?._id);
        const highlightIds = idsIn(filter?.$or?.[1]?.['highlights._id']);
        const rows = [fixture.linkedArticle];
        if (includeForeignArticle) rows.push(fixture.foreignArticle);
        return query(rows.filter(article => (
          articleIds.has(String(article._id))
          || (article.highlights || []).some(highlight => highlightIds.has(String(highlight._id)))
        )));
      }
    },
    NotebookEntry: {
      find: filter => {
        calls.push({ model: 'NotebookEntry', method: 'find', filter });
        const noteIds = idsIn(filter?._id);
        return query(noteIds.has(String(fixture.note._id)) ? [fixture.note] : []);
      }
    },
    Question: {
      find: filter => {
        calls.push({ model: 'Question', method: 'find', filter });
        const questionIds = idsIn(filter?._id);
        return query(questionIds.has(String(fixture.question._id)) ? [fixture.question] : []);
      }
    }
  };
  return { models, calls };
};

const build = (fixture, overrides = {}) => {
  const configured = modelsFor({ fixture, ...overrides });
  return {
    ...configured,
    result: buildConceptInvestigation({
      userId: fixture.ids.user,
      conceptId: fixture.ids.concept,
      wikiPageId: fixture.ids.page,
      revisionId: fixture.ids.revision,
      claimId: fixture.chain.claimId,
      models: configured.models
    })
  };
};

const expectError = async (promise, { status, message }) => {
  try {
    await promise;
    assert.fail(`Expected ${status} ${message}`);
  } catch (error) {
    assert.ok(error instanceof ConceptInvestigationError);
    assert.strictEqual(error.status, status);
    assert.strictEqual(error.message, message);
  }
};

const refIdentity = value => (
  `${value.ref.type}:${value.ref.id}:${value.ref.parentId || ''}`
);

const run = async () => {
  const fixture = createConceptInvestigationFixture();
  const before = JSON.stringify(fixture);
  const firstRun = build(fixture);
  const first = await firstRun.result;
  const replay = await build(fixture).result;

  assert.deepStrictEqual(replay, first);
  assert.strictEqual(JSON.stringify(fixture), before);
  assert.strictEqual(first.currentWiki.acceptanceState, 'unverified');
  assert.strictEqual(first.priorLessons.status, 'none');
  assert.strictEqual(first.priorLessons.acceptanceState, 'not_accepted_into_concept');
  assert.deepStrictEqual(first.priorLessons.items, []);
  assert.strictEqual(first.currentWiki.claim.id, fixture.chain.claimId);
  assert.strictEqual(first.currentWiki.claim.title, fixture.currentWiki.claim.text);
  assert.strictEqual(first.entryContext.reviewState, 'candidate');
  assert.strictEqual(first.proposals.candidateWikiRevision.status, 'pending');
  assert.strictEqual(
    first.proposals.candidateWikiRevision.id,
    fixture.candidateRevision._id
  );
  assert.strictEqual(
    first.proposals.candidateWikiRevision.currentClaim.title,
    fixture.currentWiki.claim.text
  );
  assert.strictEqual(first.actions.draftWikiRevision.enabled, false);
  assert.strictEqual(first.actions.compareHistoricalCases.label, 'Compare historical cases');
  assert.strictEqual(first.actions.compareHistoricalCases.intent, 'compare_historical_cases');
  assert.strictEqual(first.actions.compareHistoricalCases.enabled, true);
  assert.match(
    first.actions.compareHistoricalCases.href,
    new RegExp(`conceptId=${fixture.ids.concept}(?:&|$)`)
  );
  assert.strictEqual(first.actions.traceCitationsBackward.intent, 'trace_citations_backward');
  assert.strictEqual(first.actions.traceCitationsBackward.enabled, true);
  assert.match(
    first.actions.traceCitationsBackward.href,
    new RegExp(`conceptId=${fixture.ids.concept}(?:&|$)`)
  );
  assert.strictEqual(first.claimReview.identity.claimId, fixture.chain.claimId);
  assert.strictEqual(first.claimReview.state, 'pending');
  assert.strictEqual(first.claimReview.canAct, true);
  assert.deepStrictEqual(first.claimReview.allowedDispositions, ['accept', 'reject', 'defer', 'preserve']);
  assert.ok(first.claimReview.diff.changedFields.includes('support'));
  assert.strictEqual(first.claimReview.candidateHash.length, 64);

  assert.deepStrictEqual(
    first.evidence.support.map(refIdentity),
    [`highlight:${fixture.ids.supportHighlight}:${fixture.ids.article}`]
  );
  assert.deepStrictEqual(
    first.evidence.tension.map(refIdentity),
    [`highlight:${fixture.ids.highlight}:${fixture.ids.article}`]
  );
  assert.deepStrictEqual(
    first.evidence.context.map(refIdentity),
    [
      `article:${fixture.ids.article}:`,
      `note:${fixture.ids.note}:`
    ]
  );
  assert.strictEqual(first.evidence.support[0].ref.href, fixture.expected.supportHighlightHref);
  assert.strictEqual(first.evidence.tension[0].ref.href, fixture.expected.tensionHighlightHref);
  assert.strictEqual(first.evidence.context[0].ref.href, fixture.expected.articleHref);
  assert.strictEqual(first.evidence.context[1].ref.href, fixture.expected.noteHref);
  assert.strictEqual(first.unknowns[0].ref.href, fixture.expected.questionHref);
  assert.strictEqual(first.proposals.workbenchChanges.length, 1);
  assert.strictEqual(first.proposals.workbenchChanges[0].id, fixture.pendingDraft.id);
  assert.strictEqual(first.proposals.workbenchChanges[0].status, 'pending');
  assert.strictEqual(first.proposals.agentSuggestions.length, 1);
  assert.strictEqual(first.proposals.agentSuggestions[0].id, 'fixture-agent-card');
  assert.strictEqual(first.proposals.agentSuggestions[0].status, 'pending');
  assert.strictEqual(first.proposals.agentSuggestions[0].source, 'concept_agent');
  assert.deepStrictEqual(first.proposals.agentSuggestions[0].sourceKeys, []);
  assert.strictEqual(first.proposals.agentSuggestions[0].sourceState, 'resolved');
  assert.deepStrictEqual(first.proposals.agentSuggestions[0].sourceRefs, [{
    type: 'highlight',
    id: fixture.ids.supportHighlight,
    parentId: fixture.ids.article,
    title: 'Measured hardware efficiency reduced cost within the controlled workload.',
    href: fixture.expected.supportHighlightHref,
    sourceUrl: fixture.linkedArticle.url
  }]);
  assert.strictEqual(
    first.proposals.agentSuggestions[0].summary,
    'This must not be represented as current user evidence.'
  );

  const serialized = JSON.stringify(first);
  assert.ok(!serialized.includes('javascript:'));
  assert.ok(!serialized.includes('<script'));
  assert.ok(!serialized.includes('__fixture_attack__'));
  assert.ok(!serialized.includes(fixture.ids.foreignArticle));
  assert.ok(!serialized.includes(fixture.ids.unresolvedSource));
  assert.ok(!JSON.stringify(first.evidence).includes('Agent-only classification'));
  assert.ok(!JSON.stringify(first.unknowns).includes('Agent-only classification'));
  assert.ok(!serialized.includes('Confidence 0.89'));
  assert.ok(!firstRun.calls.some(call => (
    !['find', 'findOne'].includes(call.method)
  )));

  const retainedLesson = {
    id: 'decision_lesson_fixture',
    kind: 'decision_lesson',
    status: 'available_for_review',
    acceptedIntoConcept: false,
    suggestedRole: null,
    lesson: 'A reviewed outcome can inform this investigation.',
    observedAt: '2026-07-31T12:00:00.000Z',
    result: 'mixed',
    processScore: 0.8,
    calibrationNote: 'Calibrated.',
    decision: { type: 'decision', id: 'decision-fixture' },
    page: { type: 'wiki_page', id: fixture.ids.page },
    observedEvidence: [{ type: 'article', id: fixture.ids.article, title: 'Evidence' }],
    decisionSources: [],
    relatedClaims: [],
    relevanceBasis: { type: 'explicit_wiki_investigation', pageId: fixture.ids.page },
    provenance: {
      acceptedRevisionId: fixture.ids.revision,
      recordedRevisionId: fixture.ids.revision,
      outcomeRevisionId: fixture.ids.revision,
      decisionReceiptId: 'decision-receipt',
      outcomeReceiptId: 'outcome-receipt',
      immutableSnapshotHash: 'a'.repeat(64),
      outcomeRecordHash: 'b'.repeat(64)
    }
  };
  const adoptedModels = modelsFor({ fixture }).models;
  adoptedModels.WikiPage.find = () => query([fixture.currentWiki.page]);
  const adoptedRecord = {
      adoptionId: 'concept_decision_lesson_fixture',
      userId: fixture.ids.user,
      targetConceptId: fixture.ids.concept,
      sourcePageId: fixture.ids.page,
      decisionId: 'decision-fixture',
      lessonId: 'decision_lesson_fixture',
      role: 'support',
      lessonSnapshot: retainedLesson.lesson,
      result: 'mixed',
      processScore: 0.8,
      calibrationNoteSnapshot: 'Calibrated.',
      observedAt: '2026-07-31T12:00:00.000Z',
      observedEvidenceRefs: [{ type: 'article', id: fixture.ids.article, title: 'Evidence' }],
      decisionSourceRefs: [],
      relatedClaimRefs: [],
      acceptedRevisionId: fixture.ids.revision,
      recordedRevisionId: fixture.ids.revision,
      outcomeRevisionId: fixture.ids.revision,
      decisionReceiptId: 'decision-receipt',
      outcomeReceiptId: 'outcome-receipt',
      receiptId: adoptionReceiptId({
        targetConceptId: fixture.ids.concept,
        sourcePageId: fixture.ids.page,
        decisionId: 'decision-fixture'
      }),
      requestId: 'request-fixture',
      decisionSnapshotHash: 'a'.repeat(64),
      outcomeRecordHash: 'b'.repeat(64),
      payloadHash: 'c'.repeat(64),
      acceptedAt: '2026-08-01T12:00:00.000Z',
      acceptedBy: 'user',
      version: 1
  };
  adoptedRecord.payloadHash = adoptionPayloadHash(adoptedRecord);
  adoptedModels.ConceptDecisionLessonEvidence = {
    find: () => query([adoptedRecord])
  };
  adoptedModels.NoeisReceipt = {
    find: () => query([{
      userId: fixture.ids.user,
      receiptId: adoptedRecord.receiptId,
      kind: 'concept_decision_lesson_adopted',
      source: 'concept',
      status: 'completed',
      completedAt: adoptedRecord.acceptedAt,
      provenance: {
        version: 1,
        action: 'adopt_decision_lesson',
        actorType: 'user',
        adoptionId: adoptedRecord.adoptionId,
        targetConceptId: adoptedRecord.targetConceptId,
        sourcePageId: adoptedRecord.sourcePageId,
        decisionId: adoptedRecord.decisionId,
        lessonId: adoptedRecord.lessonId,
        role: adoptedRecord.role,
        requestId: adoptedRecord.requestId,
        acceptedRevisionId: adoptedRecord.acceptedRevisionId,
        recordedRevisionId: adoptedRecord.recordedRevisionId,
        outcomeRevisionId: adoptedRecord.outcomeRevisionId,
        decisionReceiptId: adoptedRecord.decisionReceiptId,
        outcomeReceiptId: adoptedRecord.outcomeReceiptId,
        decisionSnapshotHash: adoptedRecord.decisionSnapshotHash,
        outcomeRecordHash: adoptedRecord.outcomeRecordHash,
        observedEvidence: adoptedRecord.observedEvidenceRefs.map(ref => ({
          type: ref.type, id: ref.id, parentId: ref.parentId || null
        })),
        payloadHash: adoptedRecord.payloadHash
      },
      touched: [
        { type: 'concept', id: adoptedRecord.targetConceptId },
        { type: 'wiki_page', id: adoptedRecord.sourcePageId },
        { type: 'decision', id: adoptedRecord.decisionId }
      ]
    }])
  };
  const withPriorLesson = await buildConceptInvestigation({
    userId: fixture.ids.user,
    conceptId: fixture.ids.concept,
    wikiPageId: fixture.ids.page,
    revisionId: fixture.ids.revision,
    claimId: fixture.chain.claimId,
    models: adoptedModels,
    asOf: new Date('2026-08-01T12:00:00.000Z'),
    buildLessons: async ({ asOf }) => {
      assert.strictEqual(asOf.toISOString(), '2026-08-01T12:00:00.000Z');
      return [retainedLesson];
    }
  });
  assert.strictEqual(withPriorLesson.priorLessons.status, 'available');
  assert.strictEqual(withPriorLesson.priorLessons.acceptanceState, 'accepted_into_concept');
  assert.strictEqual(withPriorLesson.priorLessons.adoptionIntegrity.accepted, 1);
  assert.strictEqual(withPriorLesson.priorLessons.items[0].acceptedIntoConcept, true);
  assert.strictEqual(withPriorLesson.priorLessons.items[0].acceptedRole, 'support');
  assert.strictEqual(withPriorLesson.priorLessons.items[0].adoptionId, 'concept_decision_lesson_fixture');
  assert.strictEqual(withPriorLesson.priorLessons.items[0].status, 'accepted');
  assert.strictEqual(withPriorLesson.evidence.support.length, first.evidence.support.length + 1);
  assert.strictEqual(withPriorLesson.evidence.support.at(-1).kind, 'decision_lesson');
  assert.strictEqual(withPriorLesson.evidence.support.at(-1).acceptedIntoConcept, true);
  assert.deepStrictEqual(withPriorLesson.evidence.tension, first.evidence.tension);
  assert.deepStrictEqual(withPriorLesson.evidence.context, first.evidence.context);

  const anchoredConcept = {
    ...fixture.concept,
    continuityAnchor: {
      kind: 'wiki_investigation',
      objectType: 'wiki_page',
      objectId: fixture.ids.page,
      linkedBy: 'user'
    }
  };
  const sourceOriginPage = {
    ...fixture.currentWiki.page,
    createdFrom: { type: 'sources', objectIds: [fixture.ids.article] }
  };
  const anchoredInvestigation = await build(fixture, {
    concept: anchoredConcept,
    page: sourceOriginPage
  }).result;
  assert.strictEqual(anchoredInvestigation.concept.id, fixture.ids.concept);
  assert.strictEqual(anchoredInvestigation.entryContext.page.id, fixture.ids.page);

  const wrongConceptPage = {
    ...fixture.currentWiki.page,
    createdFrom: {
      ...fixture.currentWiki.page.createdFrom,
      objectId: fixture.ids.foreignArticle
    }
  };
  await expectError(build(fixture, { page: wrongConceptPage }).result, {
    status: 409,
    message: 'Wiki page is not linked to this Concept.'
  });

  const foreignPage = {
    ...fixture.currentWiki.page,
    userId: fixture.ids.foreignUser
  };
  await expectError(build(fixture, { page: foreignPage }).result, {
    status: 404,
    message: 'Wiki page not found.'
  });

  const foreignRevision = {
    ...fixture.candidateRevision,
    userId: fixture.ids.foreignUser
  };
  await expectError(build(fixture, { revision: foreignRevision }).result, {
    status: 404,
    message: 'Wiki revision not found.'
  });

  const mismatch = modelsFor({ fixture });
  await expectError(buildConceptInvestigation({
    userId: fixture.ids.user,
    conceptId: fixture.ids.concept,
    wikiPageId: fixture.ids.page,
    revisionId: fixture.ids.revision,
    claimId: 'missing-claim',
    models: mismatch.models
  }), {
    status: 404,
    message: 'Wiki claim not found.'
  });

  const missingRevisionClaim = {
    ...fixture.candidateRevision,
    after: {
      ...fixture.candidateRevision.after,
      claims: []
    }
  };
  await expectError(build(fixture, { revision: missingRevisionClaim }).result, {
    status: 404,
    message: 'Wiki claim not found in this revision.'
  });

  const questionOriginsConcept = {
    ...fixture.concept,
    ideaWorkbench: {
      ...fixture.concept.ideaWorkbench,
      cards: [
        ...fixture.concept.ideaWorkbench.cards,
        {
          id: 'fixture-user-unresolved-question',
          zone: 'questions',
          content: 'Which user-authored unknown remains unresolved?',
          origin: 'user'
        },
        {
          id: 'fixture-agent-unresolved-question',
          zone: 'questions',
          content: 'Unresolved agent question',
          origin: 'agent'
        }
      ]
    }
  };
  const questionOrigins = await build(fixture, { concept: questionOriginsConcept }).result;
  const userUnknown = questionOrigins.unknowns.find(value => (
    value.text === 'Which user-authored unknown remains unresolved?'
  ));
  assert.strictEqual(userUnknown.source, 'concept_workbench');
  assert.strictEqual(userUnknown.ref.type, 'concept');
  assert.strictEqual(userUnknown.ref.id, fixture.ids.concept);
  assert.match(userUnknown.ref.href, new RegExp(`conceptId=${fixture.ids.concept}`));
  assert.ok(!questionOrigins.unknowns.some(value => value.text === 'Unresolved agent question'));
  const agentQuestionProposal = questionOrigins.proposals.agentSuggestions.find(value => (
    value.id === 'fixture-agent-unresolved-question'
  ));
  assert.strictEqual(agentQuestionProposal.status, 'pending');
  assert.strictEqual(agentQuestionProposal.summary, 'Unresolved agent question');
  assert.deepStrictEqual(agentQuestionProposal.sourceKeys, []);
  assert.deepStrictEqual(agentQuestionProposal.sourceRefs, []);
  assert.strictEqual(agentQuestionProposal.sourceState, 'unavailable');

  const foreignAgentConcept = {
    ...fixture.concept,
    ideaWorkbench: {
      ...fixture.concept.ideaWorkbench,
      cards: [
        ...fixture.concept.ideaWorkbench.cards,
        {
          id: 'fixture-agent-foreign-source',
          zone: 'supports',
          content: 'Agent proposal with a foreign source reference.',
          origin: 'agent',
          sourceKey: `article:${fixture.ids.foreignArticle}`
        }
      ]
    }
  };
  const foreignAgent = await build(fixture, { concept: foreignAgentConcept }).result;
  const foreignAgentProposal = foreignAgent.proposals.agentSuggestions.find(value => (
    value.id === 'fixture-agent-foreign-source'
  ));
  assert.deepStrictEqual(foreignAgentProposal.sourceKeys, []);
  assert.deepStrictEqual(foreignAgentProposal.sourceRefs, []);
  assert.strictEqual(foreignAgentProposal.sourceState, 'unavailable');
  assert.ok(!JSON.stringify(foreignAgentProposal).includes(fixture.ids.foreignArticle));

  console.log('concept investigation service tests passed');
};

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
