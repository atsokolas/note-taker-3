const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { ObjectId } = require('bson');
const {
  assertVerifiedBackup,
  findVerifiedMongoBackup,
  verifyMongoBackup,
  writeVerifiedMongoBackup
} = require('./mongoBackupService');

const ids = [new ObjectId(), new ObjectId()];
const documents = ids.map((_id, index) => ({
  _id,
  createdAt: new Date(Date.UTC(2026, 7, 30 + index)),
  nested: { value: index }
}));
const Model = {
  find: query => ({
    lean() { return this; },
    async *cursor() {
      for (const document of documents.filter(item => query._id.$in.map(String).includes(String(item._id)))) {
        yield document;
      }
    }
  })
};

(async () => {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'noeis-mongo-backup-'));
  try {
    const receipt = await writeVerifiedMongoBackup({
      Model,
      ids,
      outputDir,
      prefix: 'wiki revisions',
      manifest: { collection: 'wikirevisions' }
    });
    assertVerifiedBackup(receipt, 2);
    assert.strictEqual(fs.statSync(receipt.filename).mode & 0o777, 0o600, 'backup is private');
    assert.strictEqual((await verifyMongoBackup({ filename: receipt.filename, expectedIds: ids })).documentCount, 2);
    assert.strictEqual(
      (await findVerifiedMongoBackup({ outputDir, prefix: 'wiki revisions', expectedIds: ids })).sha256,
      receipt.sha256
    );
    assert.strictEqual(
      await findVerifiedMongoBackup({ outputDir, prefix: 'wiki revisions', expectedIds: [...ids, new ObjectId()] }),
      null
    );
    await assert.rejects(
      verifyMongoBackup({ filename: receipt.filename, expectedIds: [...ids, new ObjectId()] }),
      /Backup verification failed/
    );
    assert.throws(() => assertVerifiedBackup({ verified: true, documentCount: 2 }, 2), /Verified backup required/);
    console.log('mongoBackupService tests passed');
  } finally {
    fs.rmSync(outputDir, { recursive: true, force: true });
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
