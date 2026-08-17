import { buildJudgmentIndex, isJudgmentPage, projectJudgment, writeLineIntoJudgment } from './judgmentModel';

const { normalizeJudgment } = require('../../../server/services/wikiJudgmentService');
const { classifyWikiPageQuality } = require('../../../server/services/wikiPageQualityGuard');

/* The whole trip a judgment takes: written down on the index, opened, filled
   in by hand, saved through the server's own normalizer, and then looked for
   on the index again. Every step here is the real code that runs in
   production; only the database is missing. */
const createdPage = (sentence) => ({
  _id: 'p1',
  title: sentence,
  pageType: 'topic',
  status: 'draft',
  body: { type: 'doc', content: [] },
  plainText: '',
  sourceRefs: [],
  updatedAt: new Date().toISOString(),
  judgment: normalizeJudgment({ input: { currentJudgment: sentence }, existing: null })
});

describe('a judgment, from written down to listed', () => {
  const sentence = 'A written process improves judgment.';

  it('is a judgment page the moment the claim is on it', () => {
    expect(isJudgmentPage(createdPage(sentence))).toBe(true);
  });

  it('keeps the claim and both lines through the server normalizer', () => {
    let page = createdPage(sentence);
    page = { ...page, judgment: normalizeJudgment({ input: writeLineIntoJudgment(page, 'It held last quarter.', 'why'), existing: page.judgment }) };
    page = { ...page, judgment: normalizeJudgment({ input: writeLineIntoJudgment(page, 'The sample is small.', 'against'), existing: page.judgment }) };

    expect(page.judgment.currentJudgment).toBe(sentence);
    expect(page.judgment.why.map(r => r.text)).toEqual(['It held last quarter.']);
    expect(page.judgment.against.map(r => r.text)).toEqual(['The sample is small.']);
  });

  it('survives the list the index actually asks for', () => {
    const page = createdPage(sentence);
    const review = classifyWikiPageQuality(page);
    expect(review.surfaceEligible).toBe(true);   // the default list filter
    expect(buildJudgmentIndex([page]).map(i => i.sentence)).toEqual([sentence]);
  });
});

/* The failure Athan hit: a judgment filled in through the wiki's own dossier
   panel — Why and Against, stored as assumptions and the strongest
   counterargument — rendered fine when you opened it and was missing from the
   index, because the index asked a narrower question than the page answers. */
describe('a judgment filled in through the older dossier shape', () => {
  const dossierPage = {
    _id: 'p9',
    title: 'Buybacks beat dividends here.',
    updatedAt: new Date().toISOString(),
    judgment: {
      currentJudgment: '',
      kind: null,
      assumptions: [{ assumptionId: 'a1', text: 'Free cash flow holds through the cycle.', status: 'unreviewed' }],
      strongestCounterargument: 'Management has bought high before.',
      why: [], against: [], falsifiers: [], decisions: []
    }
  };

  it('renders Why and Against, so it is a judgment page', () => {
    const view = projectJudgment(dossierPage);
    expect(view.why.map(l => l.text)).toEqual(['Free cash flow holds through the cycle.']);
    expect(view.against.map(l => l.text)).toEqual(['Management has bought high before.']);
    expect(isJudgmentPage(dossierPage)).toBe(true);
  });

  it('is listed on the index it was missing from', () => {
    expect(buildJudgmentIndex([dossierPage]).map(i => i.sentence))
      .toEqual(['Buybacks beat dividends here.']);
  });

  it('still leaves a page with nothing under the claim out of the index', () => {
    const bare = { _id: 'p10', title: 'Just a wiki page.', judgment: null };
    expect(isJudgmentPage(bare)).toBe(false);
    expect(buildJudgmentIndex([bare])).toEqual([]);
  });
});
