const assert = require('assert');
const mongoose = require('mongoose');
const { WikiPage } = require('./index');

const base = status => new WikiPage({
  userId: new mongoose.Types.ObjectId(),
  title: `Candidate status ${status}`,
  slug: `candidate-status-${status}`,
  pageType: 'repo',
  status: 'draft',
  visibility: 'private',
  aiState: { candidateStatus: status }
});

['awaiting_claim_acceptance', 'unbounded_candidate'].forEach(status => {
  const error = base(status).validateSync();
  assert.strictEqual(error, undefined, `${status} must be persistable on WikiPage.aiState.`);
});

const invalid = base('agent_published_without_review').validateSync();
assert.ok(invalid?.errors?.['aiState.candidateStatus']);

console.log('WikiPage candidate-status schema tests passed');
