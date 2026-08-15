const assert = require('assert');
const {
  findSemanticSubjectMatches,
  SEMANTIC_DIRECT_SCORE
} = require('./wikiBuildPreflightService');

// The preflight used to ask whether a source spelled the title, not whether it
// explained the subject. An account holding "Childhoods of exceptional people"
// was told it had nothing on parenting for independence. These tests pin that
// meaning now counts, that it counts only above a real threshold, and that a
// sleeping embedding service degrades instead of failing the build.

const run = async () => {
  // 1. Strong matches count; weak ones do not.
  {
    const search = async () => ([
      { type: 'article', objectId: 'a1', score: 0.78 },
      { type: 'highlight', objectId: 'h1', score: SEMANTIC_DIRECT_SCORE },
      { type: 'notebook_entry', objectId: 'n1', score: 0.55 }
    ]);
    const matches = await findSemanticSubjectMatches({
      topic: 'parenting for independence', userId: 'u1', search
    });
    assert.deepEqual(matches.map(m => m.key), ['article:a1', 'highlight:h1'],
      'only matches at or above the threshold count as direct evidence');
  }

  // 2. Adjacent-but-not-about-it material cannot make a page eligible.
  {
    const search = async () => ([{ type: 'article', objectId: 'a2', score: 0.6 }]);
    const matches = await findSemanticSubjectMatches({ topic: 'parenting', userId: 'u1', search });
    assert.deepEqual(matches, [], 'similarity alone is not evidence');
  }

  // 3. A sleeping embedding service degrades to the lexical test rather than
  //    failing the build. The free-tier service answers 502 while it wakes.
  {
    const search = async () => { throw Object.assign(new Error('Bad gateway'), { status: 502 }); };
    const matches = await findSemanticSubjectMatches({ topic: 'investing', userId: 'u1', search });
    assert.deepEqual(matches, [], 'retrieval failure must not throw into the build');
  }

  // 4. No user, no query: never guess.
  {
    let called = false;
    const search = async () => { called = true; return []; };
    assert.deepEqual(await findSemanticSubjectMatches({ topic: '', userId: 'u1', search }), []);
    assert.deepEqual(await findSemanticSubjectMatches({ topic: 'x', userId: '', search }), []);
    assert.equal(called, false, 'no retrieval without both a subject and an owner');
  }

  console.log('wikiBuildSemanticRetrieval tests passed');
};

if (require.main === module) {
  run().catch((error) => { console.error(error); process.exit(1); });
}

module.exports = { run };
