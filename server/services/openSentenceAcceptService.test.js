const assert = require('assert');
const {
  OpenSentenceAcceptError,
  wikiAllowsOpenSentence,
  planOpenedSentenceAccept,
  applyOpenedSentenceAccept
} = require('./openSentenceAcceptService');

const mark = (claimId) => ({
  type: 'claim',
  attrs: { claimId, support: 'supported', citationIndexes: [1], contradictionIndexes: [] }
});
const text = (value, marks = []) => ({ type: 'text', text: value, ...(marks.length ? { marks } : {}) });
const ordinaryPage = ({ claimText = 'Children need room to make mistakes.', ...extra } = {}) => ({
  title: 'Parenting',
  pageType: 'topic',
  body: {
    type: 'doc',
    content: [{
      type: 'paragraph',
      content: [text(claimText, [mark('claim-1')])]
    }]
  },
  claims: [{
    claimId: 'claim-1',
    text: claimText,
    support: 'supported',
    history: []
  }],
  markModified() {},
  ...extra
});

assert.equal(wikiAllowsOpenSentence(ordinaryPage()), true);
assert.equal(wikiAllowsOpenSentence({ pageType: 'repo' }), false);
assert.equal(wikiAllowsOpenSentence({ judgment: { kind: 'living_thesis' } }), false);
assert.equal(wikiAllowsOpenSentence({ investmentDossier: { version: 1 } }), false);
assert.equal(wikiAllowsOpenSentence({ createdFrom: { label: 'weekend-readings:2026-09-05' } }), false);
assert.equal(wikiAllowsOpenSentence({ createdFrom: { label: 'company-dossier:COST' } }), false);

const planned = planOpenedSentenceAccept({
  page: ordinaryPage(),
  claimId: 'claim-1',
  against: 'Children need room to make mistakes.',
  text: 'Children need room to make recoverable mistakes.'
});
assert.equal(planned.text, 'Children need room to make recoverable mistakes.');
assert.equal(planned.body.content[0].content[0].text, 'Children need room to make recoverable mistakes.');
assert.deepStrictEqual(
  planned.body.content[0].content[0].marks[0].attrs,
  ordinaryPage().body.content[0].content[0].marks[0].attrs
);

const page = ordinaryPage();
applyOpenedSentenceAccept({ page, plan: planned });
assert.equal(page.claims[0].text, 'Children need room to make recoverable mistakes.');
assert.equal(page.claims[0].checkInStatus, 'revised');
assert.equal(page.claims[0].history[0].action, 'revised');
assert.equal(page.body.content[0].content[0].text, 'Children need room to make recoverable mistakes.');

const expectCode = (fn, code) => {
  assert.throws(fn, (error) => error instanceof OpenSentenceAcceptError && error.code === code);
};

expectCode(() => planOpenedSentenceAccept({
  page: ordinaryPage(),
  claimId: 'claim-1',
  against: 'Children need room to make mistakes.',
  text: 'Children need room to make mistakes.'
}), 'no_proposal');

expectCode(() => planOpenedSentenceAccept({
  page: ordinaryPage({ claimText: 'Children need room to make recoverable mistakes.' }),
  claimId: 'claim-1',
  against: 'Children need room to make mistakes.',
  text: 'Children need room to make recoverable mistakes.'
}), 'stale_claim');

expectCode(() => planOpenedSentenceAccept({
  page: ordinaryPage({ pageType: 'repo' }),
  claimId: 'claim-1',
  against: 'Children need room to make mistakes.',
  text: 'Children need room to make recoverable mistakes.'
}), 'not_ordinary');

expectCode(() => planOpenedSentenceAccept({
  page: ordinaryPage(),
  claimId: 'claim-missing',
  against: 'Children need room to make mistakes.',
  text: 'Children need room to make recoverable mistakes.'
}), 'vanished_claim');

const split = ordinaryPage();
split.body.content[0].content = [
  text('Children need ', [mark('claim-1')]),
  text('room to make mistakes.', [mark('claim-1')])
];
expectCode(() => planOpenedSentenceAccept({
  page: split,
  claimId: 'claim-1',
  against: 'Children need room to make mistakes.',
  text: 'Children need room to make recoverable mistakes.'
}), 'claim_body_ambiguous');

console.log('openSentenceAcceptService tests passed');
