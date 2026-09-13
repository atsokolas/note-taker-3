const assert = require('node:assert/strict');
const { readRetentionReferences } = require('./wikiRetentionReferences');
const database = aggregate => ({ listCollections: () => ({ toArray: async () => [{name:'proofs',type:'collection'}] }), collection: () => ({aggregate}) });
(async () => {
  let attempts=0;
  const ids = await readRetentionReferences(database(() => (async function* () {
    attempts++;
    if (attempts === 1) { const error = new Error('interrupted'); error.name='MongoNetworkTimeoutError'; throw error; }
    yield { ref:'123456789012345678901234', unresolved:0 };
  })()));
  assert.equal(attempts,2); assert.equal(ids.size,1);
  attempts=0;
  await assert.rejects(readRetentionReferences(database(() => (async function* () {
    attempts++; const error=new Error('unavailable'); error.code='ETIMEDOUT'; throw error;
  })())), /unavailable/);
  assert.equal(attempts,3);
  await assert.rejects(readRetentionReferences(database(() => (async function* () {
    yield { ref:'123456789012345678901234', unresolved:1 };
  })())), /Incomplete Wiki retention reference scan/);
  console.log('retention references: bounded read retry and fail-closed depth checks passed');
})().catch(error=>{console.error(error);process.exitCode=1});
