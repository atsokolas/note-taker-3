const { FIXTURES, paperFromFixtures, runFixture, secEvent } = require('./consequenceOracle');
const { routeOne } = require('./consequenceRoute');

describe('adversarial consequence oracle', () => {
  it('material in-scope yields one exact affected-claim delta and leaves the candidate separate', () => {
    const result = runFixture('material');
    expect(result.routed.kind).toBe('material');
    expect(result.routed.mutation).toBe(false);
    expect(result.routed.preview.claimId).toBe('claim-nvda');
    expect(result.routed.preview.passage).toMatch(/signed capacity converts/);
    expect(result.persist.claim).toBe('NVIDIA demand still outruns deliverable capacity.');
    expect(JSON.stringify(result.routed)).not.toMatch(/strongest|score|confetti|toast/i);
  });

  it('no-impact stays quiet with an evaluation trace and no mutation', () => {
    const result = runFixture('noImpact');
    expect(result.routed.kind).toBe('no_impact');
    expect(result.routed.preview).toBeNull();
    expect(result.routed.ui).toBe('quiet');
    expect(result.routed.evaluationTrace.reason).toBe('no_impact');
    expect(result.persist.claim).toBe('NVIDIA demand still outruns deliverable capacity.');
  });

  it('ambiguous yields Can’t determine the effect or silence, with no candidate', () => {
    const result = runFixture('ambiguous');
    expect(result.routed.kind).toBe('ambiguous');
    expect(result.routed.message).toBe("Can't determine the effect");
    expect(result.routed.preview).toBeNull();
  });

  it('duplicate keeps one canonical event and no second card', () => {
    const result = runFixture('duplicate');
    expect(result.routed.kind).toBe('duplicate');
    expect(result.routed.preview).toBeNull();
    const paper = paperFromFixtures([
      { event: secEvent(), pages: FIXTURES.material.pages },
      { event: secEvent({ _id: 'evt-copy' }), pages: FIXTURES.material.pages }
    ]);
    expect(paper.eventId).toBe('evt-sec-1');
  });

  it('stale is honest about age and never present-tense new', () => {
    const result = runFixture('stale');
    expect(result.routed.kind).toBe('stale');
    expect(result.routed.age).toMatch(/days ago/);
    expect(result.routed.age).not.toMatch(/new|this morning|just in/i);
    expect(result.routed.preview).toBeNull();
  });

  it('malformed is quarantined and excluded from trusted retrieval', () => {
    const result = runFixture('malformed');
    expect(result.routed.kind).toBe('malformed');
    expect(result.routed.quarantine).toBe(true);
    expect(result.routed.preview).toBeNull();
    const paper = paperFromFixtures([FIXTURES.malformed]);
    expect(paper).toBeNull();
  });

  it('wrong corpus is No bound evidence or silence, with no edge', () => {
    const result = runFixture('wrongCorpus');
    expect(result.routed.kind).toBe('wrong_corpus');
    expect(result.routed.message).toBe('No bound evidence');
    expect(result.routed.preview).toBeNull();
    expect(result.persist.claim).toBe('NVIDIA demand still outruns deliverable capacity.');
  });

  it('reload of a no-impact or duplicate fixture still has no candidate', () => {
    const quiet = runFixture('noImpact');
    const again = routeOne({
      event: FIXTURES.noImpact.event,
      pages: FIXTURES.noImpact.pages
    });
    expect(quiet.routed.preview).toBeNull();
    expect(again.preview).toBeNull();
    expect(again.kind).toBe('no_impact');
  });
});
