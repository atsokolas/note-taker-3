const { test } = require('node:test');
const assert = require('node:assert/strict');
const { scoreCase, summarize, regressions, __testables: { drawsOn, inventedQuotes, DECLINE_PATTERN, declines } } = require('./score');
const { libraryTexts } = require('./library');
const { CASES } = require('./cases');
const { __testables: { contextFor } } = require('./runEval');

const texts = libraryTexts();
const ids = Object.fromEntries(Object.keys(texts).map((key, index) => [key, `id-${index}`]));
const caseById = id => CASES.find(item => item.id === id);
const item = key => ({ id: ids[key], type: 'article', title: key });

test('a grounded answer that quotes both sources and cites only them passes', () => {
  const scored = scoreCase({
    evalCase: caseById('margin-and-checklists'),
    ids,
    texts,
    result: {
      mode: 'hf_chat',
      reply: 'Both are paid for in advance. Your bridge piece says "a margin of safety is the price you pay in advance for the errors you cannot see", and the checklist essay says "procedure handles the predictable so that judgment can be spent on the unpredictable".',
      relatedItems: [item('marginOfSafety'), item('checklists')],
      citations: [item('marginOfSafety'), item('checklists')]
    }
  });
  assert.equal(scored.pass, true, JSON.stringify(scored.checks));
});

test('the fallback templates fail even when they happen to quote the source', () => {
  const scored = scoreCase({
    evalCase: caseById('summary'),
    ids,
    texts,
    result: {
      mode: 'internal_only',
      reply: 'Core claim: In fields where the work is both complex and routine, the most common failures are not failures of knowledge but failures of execution.',
      context: item('checklists'),
      citations: [item('checklists')]
    }
  });
  assert.equal(scored.checks.drawsOnPassages, true);
  assert.equal(scored.checks.notTemplate, false);
  assert.equal(scored.pass, false);
});

test('citing a source the answer did not need fails', () => {
  const scored = scoreCase({
    evalCase: caseById('meeting-cost'),
    ids,
    texts,
    result: {
      reply: 'The calendar records the time spent and never the work that did not happen.',
      relatedItems: [item('meetings')],
      citations: [item('meetings'), item('sleep')]
    }
  });
  assert.equal(scored.checks.citesOnlyRelevant, false);
});

test('a quotation that is not in the library is caught', () => {
  assert.deepEqual(
    inventedQuotes('As the essay puts it, "checklists are for people who cannot think".', texts),
    ['checklists are for people who cannot think']
  );
  assert.deepEqual(inventedQuotes('It says "saying names and roles out loud flattens hierarchy".', texts), []);
});

test('paraphrase alone does not count as bringing the passage', () => {
  assert.equal(drawsOn('Experts dislike checklists because they feel insulted.', texts.checklists), false);
  assert.equal(drawsOn('Experts experience a checklist as an insult to their judgment.', texts.checklists), true);
});

test('abstaining passes only without citations', () => {
  const base = { evalCase: caseById('mrna'), ids, texts };
  assert.equal(scoreCase({ ...base, result: { reply: 'Nothing in your library mentions mRNA vaccines.', citations: [] } }).pass, true);
  assert.equal(scoreCase({ ...base, result: { reply: 'Nothing in your library mentions mRNA vaccines.', citations: [item('sleep')] } }).pass, false);
  assert.equal(scoreCase({ ...base, result: { reply: 'mRNA vaccines train the immune system.', citations: [] } }).pass, false);
});

test('regressions compare every rate the baseline knows', () => {
  const summary = summarize([
    { pass: true, mode: 'hf_chat', checks: { found: true, notTemplate: true } },
    { pass: false, mode: 'internal_only', checks: { found: false, notTemplate: true } }
  ]);
  assert.equal(summary.passRate, 0.5);
  assert.equal(summary.modelAnswered, 0.5);
  assert.deepEqual(regressions(summary, { passRate: 0.5, checks: { found: 0.75, notTemplate: 1 } }), [
    { name: 'found', now: 0.5, before: 0.75 }
  ]);
});

test('every case names sources that exist and a surface the runner knows', () => {
  for (const evalCase of CASES) {
    for (const key of [...(evalCase.sources || []), ...(evalCase.oneOf || []), ...(evalCase.allowed || [])]) assert.ok(texts[key], `${evalCase.id}: ${key}`);
    assert.ok(evalCase.abstain || evalCase.sources?.length, evalCase.id);
    const context = contextFor(evalCase.surface, ids);
    assert.ok(context.id, evalCase.id);
  }
});

test('plain refusals count as declining; "contains no caveats" does not', () => {
  assert.ok(DECLINE_PATTERN.test('Your library contains no material on mRNA vaccines.'));
  assert.ok(!DECLINE_PATTERN.test('The answer contains no caveats: mRNA vaccines train the immune system.'));
  assert.ok(DECLINE_PATTERN.test("I don't have anything in your library on Kubernetes autoscaling."));
});

test('a refusal that goes on to answer anyway is not a decline', () => {
  assert.ok(!declines("I don't have anything specifically in your library on Kubernetes autoscaling, but Kubernetes can autoscale workloads with the Horizontal Pod Autoscaler."));
  assert.ok(declines("Nothing in your library covers Kubernetes autoscaling, but if you save a piece on it I can pull it in."));
  assert.ok(declines("I don't have anything in your library on Kubernetes autoscaling."));
});
