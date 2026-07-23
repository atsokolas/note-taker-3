const assert = require('assert');
const mongoose = require('mongoose');
const {
  CLAIMS,
  PRICE_SOURCE,
  REWRITES,
  SECTION_HEADING,
  applyPush,
  strictValidate
} = require('./enrich_nvidia_implied_expectations_push6');
const { QUESTIONS } = require('./reshape_nvidia_investor_brief_push5');

const oid = () => new mongoose.Types.ObjectId().toString();
const heading = text => ({ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text }] });
const claimParagraph = (claimId, text, citationIndexes = [1]) => ({
  type: 'paragraph',
  content: [{
    type: 'text',
    text,
    marks: [{ type: 'claim', attrs: { claimId, support: 'partial', citationIndexes, contradictionIndexes: [] } }]
  }]
});

const source = (key) => ({
  _id: oid(),
  type: 'external',
  title: key,
  url: `https://example.com/${key}`,
  citationLabel: key,
  provider: key === 'fy26' || key === 'q1' ? 'sec-edgar' : 'test',
  metadata: { evidenceKey: key }
});

const sources = ['fy26', 'q1', 'debt'].map(source);
const citations = sources.map(row => ({
  _id: oid(),
  sourceRefId: row._id,
  sourceTitle: row.title,
  url: row.url
}));
const ledger = (claimId, text) => ({
  claimId,
  text,
  section: 'Investor brief',
  support: 'partial',
  confidence: 0.78,
  citationIds: [citations[0]._id],
  sourceRefIds: [sources[0]._id],
  contradictedByCitationIds: [],
  history: []
});

const page = {
  _id: oid(),
  title: 'NVIDIA',
  slug: 'nvidia',
  pageType: 'entity',
  plainText: '',
  sourceRefs: sources,
  citations,
  claims: [
    ledger(REWRITES[0].id, 'Old current judgment.'),
    ledger(REWRITES[1].id, 'Old evidence status.')
  ],
  body: {
    type: 'doc',
    content: [
      heading('Investor brief'),
      claimParagraph(REWRITES[0].id, 'Old current judgment.'),
      claimParagraph(REWRITES[1].id, 'Old evidence status.'),
      heading('Five questions that decide the thesis'),
      {
        type: 'orderedList',
        content: QUESTIONS.map(question => ({
          type: 'listItem',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: question }] }]
        }))
      },
      heading('A matched case: where the platform moat has to earn its premium'),
      { type: 'paragraph', content: [{ type: 'text', text: 'Matched case.' }] },
      heading('The decision surface: where should NVIDIA lose?'),
      { type: 'paragraph', content: [{ type: 'text', text: 'Decision surface.' }] },
      heading('The unit that matters: cost per accepted unit of work'),
      { type: 'paragraph', content: [{ type: 'text', text: 'Unit economics.' }] }
    ]
  },
  freshness: { acceptedThrough: { label: 'SEC filing' } },
  aiState: {}
};

const result = applyPush({ page, now: new Date('2026-07-23T23:30:00.000Z') });
assert.strictEqual(result.changed, true);
assert.strictEqual(result.sourceAdded, true);
assert.strictEqual(result.claimsAdded, 4);
assert.strictEqual(result.claimsRewritten, 2);
assert.strictEqual(result.candidate.sourceRefs.length, sources.length + 1);
assert.strictEqual(result.candidate.claims.length, page.claims.length + CLAIMS.length);
assert.strictEqual(
  result.candidate.sourceRefs.filter(row => row.metadata?.evidenceKey === PRICE_SOURCE.key).length,
  1
);

const headings = result.candidate.body.content
  .filter(node => node.type === 'heading')
  .map(node => node.content[0].text);
assert.ok(headings.indexOf('Investor brief') < headings.indexOf(SECTION_HEADING));
assert.ok(headings.indexOf(SECTION_HEADING) < headings.indexOf('Five questions that decide the thesis'));
assert.ok(result.candidate.plainText.includes('$5.05 trillion'));
assert.ok(result.candidate.plainText.includes('$271.2 billion'));
assert.ok(result.candidate.plainText.includes('$194.348 billion'));

const validation = strictValidate(result.candidate, { validateUpstream: false });
assert.strictEqual(validation.ok, true, JSON.stringify(validation.errors));

const rerun = applyPush({ page: result.candidate, now: new Date('2026-07-23T23:35:00.000Z') });
assert.strictEqual(rerun.changed, false);
assert.strictEqual(rerun.candidate.sourceRefs.length, sources.length + 1);
assert.strictEqual(rerun.candidate.claims.length, page.claims.length + CLAIMS.length);

console.log('NVIDIA implied-expectations Push 6 tests passed');
