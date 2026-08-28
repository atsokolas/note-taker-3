const assert = require('node:assert/strict');
const {
  buildDossierJudgmentReviewReceipt,
  listDossierJudgmentReviews,
  loadDossierJudgmentReview,
  resolveDossierJudgmentReview
} = require('./dossierJudgmentReviewService');

class Query {
  constructor(value) { this.value = value; }
  sort() { return this; }
  limit() { return this; }
  lean() { return Promise.resolve(this.value); }
  then(resolve, reject) { return Promise.resolve(this.value).then(resolve, reject); }
}

const run = async () => {
  const rows = [];
  const NoeisReceipt = {
    find(query) {
      return new Query(rows.filter(row => (
        (!query.userId || String(row.userId) === String(query.userId))
        && (!query.kind || row.kind === query.kind)
        && (!query.status || row.status === query.status)
      )));
    },
    findOne(query) {
      return new Query(rows.find(row => (
        (!query.receiptId || row.receiptId === query.receiptId)
        && (!query.kind || row.kind === query.kind)
        && (!query['provenance.pageId'] || row.provenance?.pageId === query['provenance.pageId'])
      )) || null);
    },
    async findOneAndUpdate(query, update) {
      const next = { ...update.$set, receiptId: query.receiptId };
      const index = rows.findIndex(row => row.receiptId === query.receiptId);
      if (index >= 0) rows[index] = next;
      else rows.push(next);
      return next;
    }
  };
  const page = {
    _id: 'page-1',
    title: 'COST investment dossier',
    judgment: { kind: 'thesis', currentJudgment: 'Costco can compound.' },
    investmentDossier: { company: { ticker: 'COST' } }
  };
  const receipt = buildDossierJudgmentReviewReceipt({
    page,
    candidateRevisionId: 'candidate-1',
    acceptanceRevisionId: 'accepted-1',
    comparison: {
      sourceLabel: 'COST 10-Q',
      sourceEventId: 'event-1',
      headline: 'The 10-Q changed two decision-relevant claims.',
      counts: { changed: 2 },
      claimChanges: [{ kind: 'changed', title: 'Margin changed', detail: 'The accepted margin claim changed.' }]
    },
    now: new Date('2026-08-28T12:00:00.000Z')
  });
  assert.equal(receipt.status, 'awaiting_review');
  assert.equal(receipt.provenance.judgmentAtAcceptance, 'Costco can compound.');
  assert.equal(receipt.provenance.sourceEventId, 'event-1');
  await NoeisReceipt.findOneAndUpdate(
    { receiptId: receipt.id },
    { $set: { ...receipt, receiptId: receipt.id, userId: 'owner-1' } }
  );

  const loaded = await loadDossierJudgmentReview({ NoeisReceipt, userId: 'owner-1', pageId: 'page-1' });
  assert.equal(loaded.id, receipt.id);
  assert.equal(loaded.status, 'awaiting_review');
  const pending = await listDossierJudgmentReviews({ NoeisReceipt, userId: 'owner-1' });
  assert.deepEqual(pending.map(item => item.id), [receipt.id]);

  await assert.rejects(
    resolveDossierJudgmentReview({
      NoeisReceipt, userId: 'owner-1', page, receiptId: receipt.id, resolution: 'revised'
    }),
    error => error.code === 'DOSSIER_JUDGMENT_NOT_REVISED'
  );

  page.judgment.currentJudgment = 'Costco can compound, but renewal risk is higher.';
  const resolved = await resolveDossierJudgmentReview({
    NoeisReceipt,
    userId: 'owner-1',
    page,
    receiptId: receipt.id,
    resolution: 'revised',
    now: new Date('2026-08-28T13:00:00.000Z')
  });
  assert.equal(resolved.status, 'completed');
  assert.equal(resolved.provenance.resolution, 'revised');
  assert.equal(resolved.provenance.judgmentAfterReview, page.judgment.currentJudgment);
  assert.deepEqual(await listDossierJudgmentReviews({ NoeisReceipt, userId: 'owner-1' }), []);

  const replay = await resolveDossierJudgmentReview({
    NoeisReceipt,
    userId: 'owner-1',
    page,
    receiptId: receipt.id,
    resolution: 'revised'
  });
  assert.equal(replay.id, receipt.id);

  const untracked = buildDossierJudgmentReviewReceipt({
    page: { ...page, judgment: null },
    candidateRevisionId: 'candidate-2'
  });
  assert.equal(untracked, null);
};

run().then(() => {
  console.log('Dossier Judgment review service checks passed.');
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
