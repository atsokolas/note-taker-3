const assert = require('assert');
const {
  buildDecisionLessonEvidence,
  sourceIdentity,
  stableId
} = require('./decisionLessonEvidenceService');

const PAGE_ID = '64f500000000000000000010';
const OTHER_PAGE_ID = '64f500000000000000000011';
const article = id => ({ type: 'article', id, title: `Article ${id}`, href: `/library?articleId=${id}` });
const decision = ({ decisionId, pageId, lesson = 'Retained lesson.', sourceId = 'article-1', complete = true, observed = true }) => ({
  identity: { pageId, decisionId },
  decision: { status: 'reviewed', origin: 'user' },
  subject: { type: 'decision', id: decisionId, title: `Decision ${decisionId}`, href: `/wiki/workspace?page=${pageId}&decisionId=${decisionId}` },
  page: { type: 'wiki_page', id: pageId, title: `Page ${pageId}`, href: `/wiki/workspace?page=${pageId}` },
  links: { sources: { resolved: [article(sourceId)] } },
  outcome: {
    state: observed ? 'observed' : 'awaiting_observation',
    observedAt: '2026-07-30T12:00:00.000Z',
    lesson,
    result: 'mixed',
    processScore: 0.8,
    calibrationNote: 'Bounded calibration.',
    evidence: [article(sourceId)],
    missingEvidenceIds: [],
    reviewedAt: '2026-07-31T12:00:00.000Z',
    receiptId: 'outcome-receipt'
  },
  continuity: {
    complete,
    acceptedRevisionId: 'accepted-revision',
    recordedRevisionId: 'recorded-revision',
    outcomeRevisionId: 'outcome-revision',
    decisionReceiptId: 'decision-receipt',
    immutableSnapshotHash: 'immutable-hash'
  }
});

(async () => {
  const buildIndex = async () => ({ items: [
    decision({ decisionId: 'same-page', pageId: PAGE_ID, sourceId: 'unshared' }),
    decision({ decisionId: 'shared', pageId: OTHER_PAGE_ID, sourceId: 'article-1' }),
    decision({ decisionId: 'unrelated', pageId: OTHER_PAGE_ID, sourceId: 'article-2' }),
    decision({ decisionId: 'incomplete', pageId: PAGE_ID, complete: false }),
    decision({ decisionId: 'unobserved', pageId: PAGE_ID, observed: false }),
    decision({ decisionId: 'empty', pageId: PAGE_ID, lesson: '' })
  ] });
  const first = await buildDecisionLessonEvidence({
    userId: 'user-1',
    targetPageId: PAGE_ID,
    asOf: new Date('2026-08-01T12:00:00.000Z'),
    buildIndex
  });
  const replay = await buildDecisionLessonEvidence({
    userId: 'user-1',
    targetPageId: PAGE_ID,
    asOf: new Date('2026-08-01T12:00:00.000Z'),
    buildIndex
  });
  assert.deepStrictEqual(replay, first);
  assert.deepStrictEqual(first.map(item => item.decision.id), ['same-page']);
  assert.strictEqual(first[0].relevanceBasis.type, 'explicit_wiki_investigation');
  assert.strictEqual(first.every(item => item.acceptedIntoConcept === false), true);
  assert.strictEqual(first.every(item => item.status === 'available_for_review'), true);
  assert.strictEqual(first[0].provenance.outcomeReceiptId, 'outcome-receipt');
  assert.strictEqual(first[0].id, stableId({ pageId: PAGE_ID, decisionId: 'same-page' }));
  assert.strictEqual(sourceIdentity({ type: 'notebook', id: 'note-1' }), 'note:note-1');

  const escaped = await buildDecisionLessonEvidence({
    userId: 'user-1',
    targetPageId: PAGE_ID,
    asOf: new Date('2026-08-01T12:00:00.000Z'),
    buildIndex: async () => ({ items: [decision({
      decisionId: 'escaped', pageId: PAGE_ID,
      lesson: '<script>attack()</script><b>Safe lesson</b>'
    })] })
  });
  assert.strictEqual(escaped[0].lesson, 'Safe lesson');
  assert.strictEqual(JSON.stringify(escaped).includes('attack'), false);

  const rejectedRows = [
    { ...decision({ decisionId: 'unknown', pageId: PAGE_ID }), outcome: {
      ...decision({ decisionId: 'unknown', pageId: PAGE_ID }).outcome,
      result: 'unknown'
    } },
    { ...decision({ decisionId: 'invented-result', pageId: PAGE_ID }), outcome: {
      ...decision({ decisionId: 'invented-result', pageId: PAGE_ID }).outcome,
      result: 'great'
    } },
    { ...decision({ decisionId: 'invalid-score', pageId: PAGE_ID }), outcome: {
      ...decision({ decisionId: 'invalid-score', pageId: PAGE_ID }).outcome,
      processScore: 'not-a-score'
    } },
    { ...decision({ decisionId: 'missing-evidence', pageId: PAGE_ID }), outcome: {
      ...decision({ decisionId: 'missing-evidence', pageId: PAGE_ID }).outcome,
      missingEvidenceIds: ['source-missing']
    } },
    { ...decision({ decisionId: 'future-review', pageId: PAGE_ID }), outcome: {
      ...decision({ decisionId: 'future-review', pageId: PAGE_ID }).outcome,
      reviewedAt: '2026-08-02T12:00:00.000Z'
    } },
    { ...decision({ decisionId: 'agent-origin', pageId: PAGE_ID }), decision: {
      status: 'reviewed', origin: 'agent'
    } },
    { ...decision({ decisionId: 'no-calibration', pageId: PAGE_ID }), outcome: {
      ...decision({ decisionId: 'no-calibration', pageId: PAGE_ID }).outcome,
      calibrationNote: ''
    } }
  ];
  const rejected = await buildDecisionLessonEvidence({
    userId: 'user-1',
    targetPageId: PAGE_ID,
    asOf: new Date('2026-08-01T12:00:00.000Z'),
    buildIndex: async () => ({ items: rejectedRows })
  });
  assert.deepStrictEqual(rejected, []);
  assert.deepStrictEqual(await buildDecisionLessonEvidence({
    userId: 'user-1',
    targetPageId: PAGE_ID,
    asOf: 'not-a-date',
    buildIndex
  }), []);

  console.log('decisionLessonEvidenceService tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
